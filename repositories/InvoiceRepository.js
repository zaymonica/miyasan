/**
 * Invoice Repository
 * Multi-tenant invoice and quote management
 * 
 * @module repositories/InvoiceRepository
 */

const BaseRepository = require('./BaseRepository');
const { pool } = require('../config/database');
const crypto = require('crypto');
const { logger } = require('../config/logger');

class InvoiceRepository extends BaseRepository {
  constructor() {
    super('invoices');
  }

  /**
   * Create or get existing client account
   */
  async createOrGetClient(tenantId, clientData) {
    const connection = await pool.getConnection();
    try {
      const [existing] = await connection.execute(
        'SELECT id FROM invoice_clients WHERE tenant_id = ? AND email = ?',
        [tenantId, clientData.email]
      );

      if (existing.length > 0) {
        await connection.execute(
          `UPDATE invoice_clients 
           SET name = ?, phone = ?, company_name = ?, tax_id = ?, 
               address = ?, city = ?, state = ?, zip_code = ?, country = ?
           WHERE id = ?`,
          [
            clientData.name, clientData.phone, clientData.company_name || null,
            clientData.tax_id || null, clientData.address || null, clientData.city || null,
            clientData.state || null, clientData.zip_code || null, clientData.country || 'Brazil',
            existing[0].id
          ]
        );
        return existing[0].id;
      }

      const [result] = await connection.execute(
        `INSERT INTO invoice_clients 
         (tenant_id, name, email, phone, company_name, tax_id, address, city, state, zip_code, country)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId, clientData.name, clientData.email, clientData.phone,
          clientData.company_name || null, clientData.tax_id || null, clientData.address || null,
          clientData.city || null, clientData.state || null, clientData.zip_code || null,
          clientData.country || 'Brazil'
        ]
      );
      return result.insertId;
    } finally {
      connection.release();
    }
  }

  /**
   * Generate unique invoice number
   */
  async generateInvoiceNumber(tenantId, type = 'invoice') {
    const connection = await pool.getConnection();
    try {
      const year = new Date().getFullYear();
      const typePrefix = type === 'invoice' ? 'INV' : 'QUO';
      const [rows] = await connection.execute(
        `SELECT invoice_number FROM invoices 
         WHERE tenant_id = ? AND invoice_number LIKE ? 
         ORDER BY id DESC LIMIT 1`,
        [tenantId, `${typePrefix}-${year}-%`]
      );

      let nextNumber = 1;
      if (rows.length > 0) {
        const lastNumber = rows[0].invoice_number.split('-').pop();
        nextNumber = parseInt(lastNumber) + 1;
      }
      return `${typePrefix}-${year}-${String(nextNumber).padStart(5, '0')}`;
    } finally {
      connection.release();
    }
  }

  /**
   * Create invoice or quote with items
   */
  async createInvoice(tenantId, invoiceData, items, createdBy) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const clientId = await this.createOrGetClient(tenantId, invoiceData.client);
      const invoiceNumber = await this.generateInvoiceNumber(tenantId, invoiceData.type);

      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
      const taxAmount = (subtotal * (invoiceData.tax_rate || 0)) / 100;
      let discountAmount = invoiceData.discount_type === 'percentage' 
        ? (subtotal * (invoiceData.discount_value || 0)) / 100 
        : (invoiceData.discount_value || 0);
      const totalAmount = subtotal + taxAmount - discountAmount;

      // Handle allowed_payment_methods - default to ['stripe'] if not provided
      const allowedPaymentMethods = invoiceData.allowed_payment_methods && invoiceData.allowed_payment_methods.length > 0
        ? JSON.stringify(invoiceData.allowed_payment_methods)
        : JSON.stringify(['stripe']);

      const [result] = await connection.execute(
        `INSERT INTO invoices 
         (tenant_id, invoice_number, type, client_id, title, description, currency, 
          subtotal, tax_rate, tax_amount, discount_type, discount_value, discount_amount, 
          total_amount, status, payment_method, allowed_payment_methods, due_date, notes, terms, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId, invoiceNumber, invoiceData.type || 'invoice', clientId,
          invoiceData.title, invoiceData.description || null, invoiceData.currency || 'USD',
          subtotal, invoiceData.tax_rate || 0, taxAmount, invoiceData.discount_type || 'fixed',
          invoiceData.discount_value || 0, discountAmount, totalAmount,
          invoiceData.status || 'draft', invoiceData.allowed_payment_methods?.[0] || 'stripe',
          allowedPaymentMethods,
          invoiceData.due_date || null, invoiceData.notes || null, invoiceData.terms || null, createdBy
        ]
      );

      const invoiceId = result.insertId;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await connection.execute(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [invoiceId, item.description, item.quantity, item.unit_price, item.quantity * item.unit_price, i]
        );
      }

      await this.logAction(connection, invoiceId, 'created', 'admin', createdBy, 
        `${invoiceData.type === 'quote' ? 'Quote' : 'Invoice'} created`);
      await connection.commit();
      return await this.getInvoiceById(tenantId, invoiceId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get invoice by ID with all related data
   */
  async getInvoiceById(tenantId, id) {
    const connection = await pool.getConnection();
    try {
      const [invoices] = await connection.execute(
        `SELECT i.*, c.name as client_name, c.email as client_email, c.phone as client_phone,
                c.company_name, c.tax_id, c.address, c.city, c.state, c.zip_code, c.country,
                u.username as created_by_username
         FROM invoices i
         JOIN invoice_clients c ON i.client_id = c.id
         LEFT JOIN users u ON i.created_by = u.id
         WHERE i.tenant_id = ? AND i.id = ?`,
        [tenantId, id]
      );

      if (invoices.length === 0) return null;
      const invoice = invoices[0];

      const [items] = await connection.execute(
        `SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order`, [id]
      );
      invoice.items = items;

      const [logs] = await connection.execute(
        `SELECT * FROM invoice_logs WHERE invoice_id = ? ORDER BY created_at DESC LIMIT 50`, [id]
      );
      invoice.logs = logs;
      return invoice;
    } finally {
      connection.release();
    }
  }

  /**
   * Get invoice by number (public access)
   */
  async getInvoiceByNumberPublic(invoiceNumber) {
    const connection = await pool.getConnection();
    try {
      const [invoices] = await connection.execute(
        `SELECT i.*, c.name as client_name, c.email as client_email, c.phone as client_phone,
                c.company_name, c.tax_id, c.address, c.city, c.state, c.zip_code, c.country,
                t.name as tenant_name
         FROM invoices i
         JOIN invoice_clients c ON i.client_id = c.id
         JOIN tenants t ON i.tenant_id = t.id
         WHERE i.invoice_number = ?`,
        [invoiceNumber]
      );

      if (invoices.length === 0) return null;
      const invoice = invoices[0];

      const [items] = await connection.execute(
        `SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order`, [invoice.id]
      );
      invoice.items = items;
      return invoice;
    } finally {
      connection.release();
    }
  }


  /**
   * List invoices with filters (supports archived and disabled tabs)
   */
  async listInvoices(tenantId, filters = {}) {
    const connection = await pool.getConnection();
    try {
      const {
        type, status, client_id, search, page = 1, limit = 20,
        sort_by = 'created_at', sort_order = 'DESC', tab = 'active'
      } = filters;

      const offset = (page - 1) * limit;
      const conditions = ['i.tenant_id = ?'];
      const params = [tenantId];

      if (tab === 'archived') {
        conditions.push('i.status = ?');
        params.push('archived');
      } else if (tab === 'disabled') {
        conditions.push('i.is_active = FALSE');
      } else {
        conditions.push('i.status != ?');
        params.push('archived');
        conditions.push('(i.is_active = TRUE OR i.is_active IS NULL)');
      }

      if (type) { conditions.push('i.type = ?'); params.push(type); }
      if (status && tab === 'active') { conditions.push('i.status = ?'); params.push(status); }
      if (client_id) { conditions.push('i.client_id = ?'); params.push(client_id); }
      if (search) {
        conditions.push('(i.invoice_number LIKE ? OR i.title LIKE ? OR c.name LIKE ? OR c.email LIKE ?)');
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;
      const [countResult] = await connection.execute(
        `SELECT COUNT(*) as total FROM invoices i JOIN invoice_clients c ON i.client_id = c.id ${whereClause}`,
        params
      );

      const [invoices] = await connection.execute(
        `SELECT i.*, c.name as client_name, c.email as client_email, c.phone as client_phone
         FROM invoices i JOIN invoice_clients c ON i.client_id = c.id ${whereClause}
         ORDER BY i.${this.sanitizeSortField(sort_by)} ${this.sanitizeSortOrder(sort_order)}
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      return {
        invoices,
        pagination: { page, limit, total: countResult[0].total, pages: Math.ceil(countResult[0].total / limit) }
      };
    } finally {
      connection.release();
    }
  }

  /**
   * Get counts for each tab
   */
  async getTabCounts(tenantId) {
    const connection = await pool.getConnection();
    try {
      const [counts] = await connection.execute(`
        SELECT 
          SUM(CASE WHEN status != 'archived' AND (is_active = TRUE OR is_active IS NULL) THEN 1 ELSE 0 END) as active_count,
          SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived_count,
          SUM(CASE WHEN is_active = FALSE THEN 1 ELSE 0 END) as disabled_count
        FROM invoices WHERE tenant_id = ?
      `, [tenantId]);
      return { active: counts[0].active_count || 0, archived: counts[0].archived_count || 0, disabled: counts[0].disabled_count || 0 };
    } finally {
      connection.release();
    }
  }

  /**
   * Update invoice status
   */
  async updateStatus(tenantId, id, status, actorInfo = {}) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const updateFields = ['status = ?'];
      const params = [status];

      const timestampMap = {
        sent: 'sent_at', viewed: 'viewed_at', accepted: 'accepted_at',
        rejected: 'rejected_at', paid: 'paid_at', archived: 'archived_at'
      };
      if (timestampMap[status]) updateFields.push(`${timestampMap[status]} = NOW()`);

      params.push(tenantId, id);
      await connection.execute(`UPDATE invoices SET ${updateFields.join(', ')} WHERE tenant_id = ? AND id = ?`, params);
      await this.logAction(connection, id, status, actorInfo.actor_type || 'system', actorInfo.actor_id || null,
        actorInfo.details || `Status changed to ${status}`, actorInfo.ip_address, actorInfo.user_agent);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Toggle invoice active status
   */
  async toggleActive(tenantId, id, isActive, actorInfo = {}) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE invoices SET is_active = ?, disabled_at = ? WHERE tenant_id = ? AND id = ?`,
        [isActive, isActive ? null : new Date(), tenantId, id]
      );
      await this.logAction(connection, id, isActive ? 'enabled' : 'disabled', 'admin', actorInfo.actor_id || null,
        isActive ? 'Invoice enabled' : 'Invoice disabled', actorInfo.ip_address, actorInfo.user_agent);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Delete invoice permanently
   */
  async deleteInvoice(tenantId, id) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
      await connection.execute('DELETE FROM invoice_logs WHERE invoice_id = ?', [id]);
      await connection.execute('DELETE FROM invoice_access_tokens WHERE invoice_id = ?', [id]);
      await connection.execute('DELETE FROM invoices WHERE tenant_id = ? AND id = ?', [tenantId, id]);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Reject invoice with reason
   */
  async rejectInvoice(tenantId, id, reason, actorInfo = {}) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE invoices SET status = 'rejected', rejection_reason = ?, rejected_at = NOW() WHERE tenant_id = ? AND id = ?`,
        [reason, tenantId, id]
      );
      await this.logAction(connection, id, 'rejected', actorInfo.actor_type || 'client', actorInfo.actor_id || null,
        `Rejected: ${reason}`, actorInfo.ip_address, actorInfo.user_agent);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Admin responds to rejection
   */
  async respondToRejection(tenantId, id, response, actorInfo = {}) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE invoices SET admin_response = ?, admin_response_at = NOW(), status = 'sent', 
         rejection_reason = NULL, rejected_at = NULL WHERE tenant_id = ? AND id = ?`,
        [response, tenantId, id]
      );
      await this.logAction(connection, id, 'admin_responded', 'admin', actorInfo.actor_id || null,
        `Admin response: ${response}`, actorInfo.ip_address, actorInfo.user_agent);
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Convert quote to invoice
   */
  async convertQuoteToInvoice(tenantId, quoteId, adminId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const quote = await this.getInvoiceById(tenantId, quoteId);
      if (!quote || quote.type !== 'quote') throw new Error('Quote not found');

      const invoiceNumber = await this.generateInvoiceNumber(tenantId, 'invoice');
      const [result] = await connection.execute(
        `INSERT INTO invoices 
         (tenant_id, invoice_number, type, client_id, title, description, currency, subtotal, tax_rate, tax_amount,
          discount_type, discount_value, discount_amount, total_amount, status, payment_method, due_date, notes, terms, created_by)
         SELECT tenant_id, ?, 'invoice', client_id, title, description, currency, subtotal, tax_rate, tax_amount,
                discount_type, discount_value, discount_amount, total_amount, 'draft', payment_method, due_date, notes, terms, ?
         FROM invoices WHERE tenant_id = ? AND id = ?`,
        [invoiceNumber, adminId, tenantId, quoteId]
      );

      const invoiceId = result.insertId;
      await connection.execute(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price, sort_order)
         SELECT ?, description, quantity, unit_price, total_price, sort_order FROM invoice_items WHERE invoice_id = ?`,
        [invoiceId, quoteId]
      );
      await connection.execute(`UPDATE invoices SET converted_to_invoice_id = ? WHERE tenant_id = ? AND id = ?`, [invoiceId, tenantId, quoteId]);
      await this.logAction(connection, quoteId, 'converted_to_invoice', 'admin', adminId, `Converted to invoice ${invoiceNumber}`);
      await this.logAction(connection, invoiceId, 'created', 'admin', adminId, `Created from quote ${quote.invoice_number}`);
      await connection.commit();
      return await this.getInvoiceById(tenantId, invoiceId);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Update payment information
   */
  async updatePaymentInfo(tenantId, id, paymentData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE invoices SET payment_link = ?, payment_id = ?, payment_gateway_response = ? WHERE tenant_id = ? AND id = ?`,
        [paymentData.payment_link || null, paymentData.payment_id || null,
         paymentData.gateway_response ? JSON.stringify(paymentData.gateway_response) : null, tenantId, id]
      );
      await this.logAction(connection, id, 'payment_created', 'admin', paymentData.admin_id || null, 'Payment link created');
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Decrypt data using AES-256-CBC
   * @private
   */
  decryptData(encryptedText) {
    if (!encryptedText) return null;
    
    try {
      const keyString = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32';
      const key = crypto.createHash('sha256').update(keyString).digest();

      const textParts = encryptedText.split(':');
      const iv = Buffer.from(textParts.shift(), 'hex');
      const encrypted = textParts.join(':');

      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Error decrypting data:', error.message);
      // Return original value if decryption fails (might not be encrypted)
      return encryptedText;
    }
  }

  /**
   * Get tenant payment gateway settings
   * @param {number} tenantId - Tenant ID
   * @param {string} methodName - Optional specific payment method (paypal, stripe)
   */
  async getTenantPaymentGateway(tenantId, methodName = null) {
    const connection = await pool.getConnection();
    try {
      // Build query based on whether a specific method is requested
      let query = `SELECT id, tenant_id, method_name, api_key, api_secret, sandbox_mode, active,
                CASE WHEN sandbox_mode = 1 THEN 'sandbox' ELSE 'live' END as paypal_mode
         FROM tenant_payment_methods 
         WHERE tenant_id = ? AND active = TRUE`;
      
      const params = [tenantId];
      
      if (methodName) {
        query += ' AND method_name = ?';
        params.push(methodName.toLowerCase());
      }
      
      query += ' ORDER BY id LIMIT 1';
      
      // First try tenant-specific payment methods
      const [tenantMethods] = await connection.execute(query, params);
      
      if (tenantMethods.length > 0) {
        const method = tenantMethods[0];
        logger.info(`Found tenant payment method: ${method.method_name} for tenant ${tenantId}${methodName ? ` (requested: ${methodName})` : ''}`);
        
        // CRITICAL FIX: Decrypt the credentials before returning
        const decryptedApiKey = this.decryptData(method.api_key);
        const decryptedApiSecret = this.decryptData(method.api_secret);
        
        return {
          ...method,
          api_key: decryptedApiKey,
          api_secret: decryptedApiSecret,
          stripe_secret_key: decryptedApiKey,
          paypal_client_id: decryptedApiKey,
          paypal_client_secret: decryptedApiSecret
        };
      }

      // Fallback to global payment gateway settings (only if no specific method requested)
      if (!methodName) {
        const [globalGateways] = await connection.execute(
          `SELECT *, 
                  CASE WHEN sandbox_mode = 1 THEN 'sandbox' ELSE 'live' END as paypal_mode
           FROM payment_gateway_settings 
           WHERE enabled = TRUE 
           ORDER BY id LIMIT 1`
        );
        
        if (globalGateways.length > 0) {
          logger.info(`Using global payment gateway for tenant ${tenantId}`);
          const gateway = globalGateways[0];
          
          // Decrypt global gateway credentials too
          const decryptedApiKey = this.decryptData(gateway.api_key);
          const decryptedApiSecret = this.decryptData(gateway.api_secret);
          
          return {
            ...gateway,
            api_key: decryptedApiKey,
            api_secret: decryptedApiSecret,
            stripe_secret_key: decryptedApiKey,
            paypal_client_id: decryptedApiKey,
            paypal_client_secret: decryptedApiSecret
          };
        }
      }
      
      logger.warn(`No payment gateway found for tenant ${tenantId}${methodName ? ` with method ${methodName}` : ''}`);
      return null;
    } finally {
      connection.release();
    }
  }

  /**
   * Get all active payment methods for a tenant (public - no credentials)
   * @param {number} tenantId - Tenant ID
   */
  async getTenantPaymentMethods(tenantId) {
    const connection = await pool.getConnection();
    try {
      const [methods] = await connection.execute(
        `SELECT method_name 
         FROM tenant_payment_methods 
         WHERE tenant_id = ? AND active = TRUE 
         ORDER BY method_name`,
        [tenantId]
      );
      return methods;
    } finally {
      connection.release();
    }
  }

  /**
   * Get dashboard statistics
   */
  async getStatistics(tenantId) {
    const connection = await pool.getConnection();
    try {
      const [stats] = await connection.execute(`
        SELECT COUNT(*) as total_invoices,
          SUM(CASE WHEN type = 'invoice' THEN 1 ELSE 0 END) as total_invoices_only,
          SUM(CASE WHEN type = 'quote' THEN 1 ELSE 0 END) as total_quotes,
          SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as total_paid,
          SUM(CASE WHEN status IN ('sent', 'viewed', 'accepted') THEN total_amount ELSE 0 END) as total_pending,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as total_drafts,
          SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as total_accepted,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as total_rejected
        FROM invoices WHERE tenant_id = ?
      `, [tenantId]);
      return stats[0];
    } finally {
      connection.release();
    }
  }

  async logAction(connection, invoiceId, action, actorType, actorId, details = null, ipAddress = null, userAgent = null) {
    await connection.execute(
      `INSERT INTO invoice_logs (invoice_id, action, actor_type, actor_id, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, action, actorType, actorId, details, ipAddress, userAgent]
    );
  }

  sanitizeSortField(field) {
    const allowedFields = ['id', 'invoice_number', 'created_at', 'due_date', 'total_amount', 'status', 'type'];
    return allowedFields.includes(field) ? field : 'created_at';
  }

  sanitizeSortOrder(order) {
    return order && order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  }
}

module.exports = new InvoiceRepository();
