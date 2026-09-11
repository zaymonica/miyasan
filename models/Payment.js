/**
 * Payment Model
 * 
 * Represents payment transactions for a tenant
 * Payments are isolated per tenant
 * 
 * @module models/Payment
 */

const db = require('../config/database');

class Payment {
  /**
   * Get all payments for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} options - Query options (page, limit, status, method)
   * @returns {Promise<Object>} Payments and pagination info
   */
  static async findByTenant(tenantId, options = {}) {
    const { page = 1, limit = 50, status = null, method = null } = options;
    const offset = (page - 1) * limit;

    let query = `
      SELECT p.*, c.name as contact_name, c.phone as contact_phone
      FROM payments p
      LEFT JOIN contacts c ON c.id = p.contact_id AND c.tenant_id = p.tenant_id
      WHERE p.tenant_id = ?
    `;
    const params = [tenantId];

    if (status) {
      query += ` AND p.status = ?`;
      params.push(status);
    }

    if (method) {
      query += ` AND p.payment_method = ?`;
      params.push(method);
    }

    query += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM payments WHERE tenant_id = ?';
    const countParams = [tenantId];

    if (status) {
      countQuery += ` AND status = ?`;
      countParams.push(status);
    }

    if (method) {
      countQuery += ` AND payment_method = ?`;
      countParams.push(method);
    }

    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;

    return {
      payments: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get payment by ID
   * @param {number} id - Payment ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object|null>} Payment object or null
   */
  static async findById(id, tenantId) {
    const [rows] = await db.query(
      `SELECT p.*, c.name as contact_name, c.phone as contact_phone
       FROM payments p
       LEFT JOIN contacts c ON c.id = p.contact_id AND c.tenant_id = p.tenant_id
       WHERE p.id = ? AND p.tenant_id = ?`,
      [id, tenantId]
    );
    return rows[0] || null;
  }

  /**
   * Get payment by external ID
   * @param {string} externalId - External payment ID (from gateway)
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object|null>} Payment object or null
   */
  static async findByExternalId(externalId, tenantId) {
    const [rows] = await db.query(
      'SELECT * FROM payments WHERE external_id = ? AND tenant_id = ?',
      [externalId, tenantId]
    );
    return rows[0] || null;
  }

  /**
   * Create new payment
   * @param {Object} data - Payment data
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Created payment
   */
  static async create(data, tenantId) {
    const { 
      contact_id,
      amount,
      currency = 'USD',
      payment_method,
      status = 'pending',
      description,
      external_id,
      metadata
    } = data;
    
    const [result] = await db.query(
      `INSERT INTO payments (
        tenant_id, contact_id, amount, currency, payment_method, 
        status, description, external_id, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        tenantId, 
        contact_id || null, 
        amount, 
        currency, 
        payment_method, 
        status, 
        description || null,
        external_id || null,
        JSON.stringify(metadata || {})
      ]
    );

    return this.findById(result.insertId, tenantId);
  }

  /**
   * Update payment
   * @param {number} id - Payment ID
   * @param {Object} data - Payment data
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Updated payment
   */
  static async update(id, data, tenantId) {
    const { 
      status,
      payment_method,
      description,
      metadata
    } = data;
    
    await db.query(
      `UPDATE payments 
       SET status = ?, payment_method = ?, description = ?, metadata = ?, updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [
        status, 
        payment_method, 
        description || null, 
        JSON.stringify(metadata || {}), 
        id, 
        tenantId
      ]
    );

    return this.findById(id, tenantId);
  }

  /**
   * Update payment status
   * @param {number} id - Payment ID
   * @param {string} status - New status
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Updated payment
   */
  static async updateStatus(id, status, tenantId) {
    await db.query(
      `UPDATE payments 
       SET status = ?, updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [status, id, tenantId]
    );

    return this.findById(id, tenantId);
  }

  /**
   * Delete payment
   * @param {number} id - Payment ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id, tenantId) {
    const [result] = await db.query(
      'DELETE FROM payments WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Get payment statistics for tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} options - Date range options
   * @returns {Promise<Object>} Payment statistics
   */
  static async getStatistics(tenantId, options = {}) {
    const { startDate = null, endDate = null } = options;

    let query = `
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_amount,
        AVG(CASE WHEN status = 'completed' THEN amount ELSE NULL END) as average_amount,
        currency
      FROM payments
      WHERE tenant_id = ?
    `;
    const params = [tenantId];

    if (startDate) {
      query += ` AND created_at >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND created_at <= ?`;
      params.push(endDate);
    }

    query += ` GROUP BY currency`;

    const [rows] = await db.query(query, params);
    return rows;
  }

  /**
   * Get payment methods summary
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Array>} Payment methods with counts
   */
  static async getMethodsSummary(tenantId) {
    const [rows] = await db.query(
      `SELECT 
        payment_method,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_amount
       FROM payments
       WHERE tenant_id = ?
       GROUP BY payment_method
       ORDER BY count DESC`,
      [tenantId]
    );
    return rows;
  }
}

module.exports = Payment;
