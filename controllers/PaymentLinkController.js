/**
 * Payment Link Controller - Handles payment link management
 * @module controllers/PaymentLinkController
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const logger = require('../config/logger');
const crypto = require('crypto');

class PaymentLinkController extends BaseController {
  static async getLinks(req, res) {
    const connection = await pool.getConnection();
    try {
      const tenantId = req.user.tenantId;
      const { page = 1, limit = 20, status } = req.query;
      const offset = (page - 1) * limit;

      let query = 'SELECT * FROM payment_links WHERE tenant_id = ?';
      const params = [tenantId];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), offset);

      const [links] = await connection.query(query, params);
      const [countResult] = await connection.query(
        'SELECT COUNT(*) as total FROM payment_links WHERE tenant_id = ?' + (status ? ' AND status = ?' : ''),
        status ? [tenantId, status] : [tenantId]
      );

      res.json({
        success: true,
        data: links,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      });
    } catch (error) {
      logger.error('Error getting payment links:', error);
      res.status(500).json({ success: false, message: req.t('errors.internal_server_error'), error: error.message });
    } finally {
      connection.release();
    }
  }

  static async createLink(req, res) {
    const connection = await pool.getConnection();
    try {
      const tenantId = req.user.tenantId;
      const { title, description, amount, currency = 'USD', expires_at } = req.body;

      if (!title || !amount) {
        return res.status(400).json({ success: false, message: req.t('validation.required_fields') });
      }

      const uniqueCode = crypto.randomBytes(8).toString('hex');
      const link = `${process.env.APP_URL}/pay/${uniqueCode}`;

      const [result] = await connection.query(`
        INSERT INTO payment_links (tenant_id, title, description, amount, currency, unique_code, link, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `, [tenantId, title, description || null, amount, currency, uniqueCode, link, expires_at || null]);

      logger.info(`Payment link created: ${result.insertId} for tenant ${tenantId}`);
      res.status(201).json({ success: true, message: req.t('payment_link.created'), data: { id: result.insertId, link } });
    } catch (error) {
      logger.error('Error creating payment link:', error);
      res.status(500).json({ success: false, message: req.t('errors.internal_server_error'), error: error.message });
    } finally {
      connection.release();
    }
  }

  static async updateLink(req, res) {
    const connection = await pool.getConnection();
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;
      const { title, description, amount, status, expires_at } = req.body;

      const updates = [];
      const params = [];

      if (title) { updates.push('title = ?'); params.push(title); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      if (amount) { updates.push('amount = ?'); params.push(amount); }
      if (status) { updates.push('status = ?'); params.push(status); }
      if (expires_at !== undefined) { updates.push('expires_at = ?'); params.push(expires_at); }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, message: req.t('validation.no_fields_to_update') });
      }

      updates.push('updated_at = NOW()');
      params.push(id, tenantId);

      await connection.query(`UPDATE payment_links SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, params);
      logger.info(`Payment link updated: ${id} for tenant ${tenantId}`);
      res.json({ success: true, message: req.t('payment_link.updated') });
    } catch (error) {
      logger.error('Error updating payment link:', error);
      res.status(500).json({ success: false, message: req.t('errors.internal_server_error'), error: error.message });
    } finally {
      connection.release();
    }
  }

  static async deleteLink(req, res) {
    const connection = await pool.getConnection();
    try {
      const tenantId = req.user.tenantId;
      const { id } = req.params;

      await connection.query('DELETE FROM payment_links WHERE id = ? AND tenant_id = ?', [id, tenantId]);
      logger.info(`Payment link deleted: ${id} for tenant ${tenantId}`);
      res.json({ success: true, message: req.t('payment_link.deleted') });
    } catch (error) {
      logger.error('Error deleting payment link:', error);
      res.status(500).json({ success: false, message: req.t('errors.internal_server_error'), error: error.message });
    } finally {
      connection.release();
    }
  }
}

module.exports = PaymentLinkController;

