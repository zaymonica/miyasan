/**
 * Widget Controller
 * 
 * Handles WhatsApp chat widget configuration and analytics for multi-tenant system.
 * Provides CRUD operations, embed code generation, and event tracking.
 * 
 * @module controllers/WidgetController
 */

const pool = require('../config/database').pool;
const { logger } = require('../config/logger');
const crypto = require('crypto');

class WidgetController {
  /**
   * Get all widgets for tenant
   * @route GET /api/widget/admin
   */
  static async getAllWidgets(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
      const search = req.query.search || '';

      let query = `
        SELECT * FROM chat_widgets 
        WHERE tenant_id = ?
      `;
      const params = [tenantId];

      if (search) {
        query += ` AND (name LIKE ? OR whatsapp_number LIKE ? OR button_title LIKE ?)`;
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern);
      }

      query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const [widgets] = await pool.execute(query, params);

      // Get total count
      let countQuery = `SELECT COUNT(*) as total FROM chat_widgets WHERE tenant_id = ?`;
      const countParams = [tenantId];

      if (search) {
        countQuery += ` AND (name LIKE ? OR whatsapp_number LIKE ? OR button_title LIKE ?)`;
        const searchPattern = `%${search}%`;
        countParams.push(searchPattern, searchPattern, searchPattern);
      }

      const [countResult] = await pool.execute(countQuery, countParams);
      const total = countResult[0].total;

      logger.info('Widgets retrieved', { 
        tenantId, 
        count: widgets.length,
        userId: req.user.id 
      });

      res.json({
        success: true,
        data: {
          data: widgets,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      logger.error('Error getting widgets', { 
        error: error.message,
        tenantId: req.user?.tenantId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve widgets'
      });
    }
  }

  /**
   * Get widget by ID
   * @route GET /api/widget/admin/:id
   */
  static async getWidgetById(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const widgetId = req.params.id;

      const [widgets] = await pool.execute(
        'SELECT * FROM chat_widgets WHERE id = ? AND tenant_id = ?',
        [widgetId, tenantId]
      );

      if (widgets.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Widget not found'
        });
      }

      logger.info('Widget retrieved', { 
        widgetId, 
        tenantId,
        userId: req.user.id 
      });

      res.json({
        success: true,
        data: widgets[0]
      });
    } catch (error) {
      logger.error('Error getting widget', { 
        error: error.message,
        widgetId: req.params.id,
        tenantId: req.user?.tenantId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve widget'
      });
    }
  }

  /**
   * Create new widget
   * @route POST /api/widget/admin
   */
  static async createWidget(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const {
        name,
        whatsapp_number,
        button_title,
        button_background_color,
        widget_title,
        predefined_message,
        max_message_length,
        margin_right,
        margin_bottom,
        border_radius,
        is_active
      } = req.body;

      // Generate unique token
      const widget_token = crypto.randomBytes(32).toString('hex');

      const [result] = await pool.execute(
        `INSERT INTO chat_widgets (
          tenant_id, name, whatsapp_number, button_title, 
          button_background_color, widget_title, predefined_message,
          max_message_length, margin_right, margin_bottom, 
          border_radius, widget_token, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId, name, whatsapp_number, button_title,
          button_background_color || '#25D366', widget_title,
          predefined_message || null, max_message_length || 500,
          margin_right || 20, margin_bottom || 20,
          border_radius || 50, widget_token, is_active !== false
        ]
      );

      const widgetId = result.insertId;

      // Get created widget
      const [widgets] = await pool.execute(
        'SELECT * FROM chat_widgets WHERE id = ?',
        [widgetId]
      );

      logger.info('Widget created', { 
        widgetId, 
        tenantId,
        userId: req.user.id 
      });

      res.status(201).json({
        success: true,
        message: 'Widget created successfully',
        data: widgets[0]
      });
    } catch (error) {
      logger.error('Error creating widget', { 
        error: error.message,
        tenantId: req.user?.tenantId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to create widget'
      });
    }
  }

  /**
   * Update widget
   * @route PUT /api/widget/admin/:id
   */
  static async updateWidget(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const widgetId = req.params.id;

      // Check if widget exists and belongs to tenant
      const [existing] = await pool.execute(
        'SELECT id FROM chat_widgets WHERE id = ? AND tenant_id = ?',
        [widgetId, tenantId]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Widget not found'
        });
      }

      const {
        name,
        whatsapp_number,
        button_title,
        button_background_color,
        widget_title,
        predefined_message,
        max_message_length,
        margin_right,
        margin_bottom,
        border_radius,
        is_active
      } = req.body;

      const updates = [];
      const values = [];

      if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
      }
      if (whatsapp_number !== undefined) {
        updates.push('whatsapp_number = ?');
        values.push(whatsapp_number);
      }
      if (button_title !== undefined) {
        updates.push('button_title = ?');
        values.push(button_title);
      }
      if (button_background_color !== undefined) {
        updates.push('button_background_color = ?');
        values.push(button_background_color);
      }
      if (widget_title !== undefined) {
        updates.push('widget_title = ?');
        values.push(widget_title);
      }
      if (predefined_message !== undefined) {
        updates.push('predefined_message = ?');
        values.push(predefined_message);
      }
      if (max_message_length !== undefined) {
        updates.push('max_message_length = ?');
        values.push(max_message_length);
      }
      if (margin_right !== undefined) {
        updates.push('margin_right = ?');
        values.push(margin_right);
      }
      if (margin_bottom !== undefined) {
        updates.push('margin_bottom = ?');
        values.push(margin_bottom);
      }
      if (border_radius !== undefined) {
        updates.push('border_radius = ?');
        values.push(border_radius);
      }
      if (is_active !== undefined) {
        updates.push('is_active = ?');
        values.push(is_active);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No fields to update'
        });
      }

      values.push(widgetId, tenantId);

      await pool.execute(
        `UPDATE chat_widgets SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
        values
      );

      // Get updated widget
      const [widgets] = await pool.execute(
        'SELECT * FROM chat_widgets WHERE id = ?',
        [widgetId]
      );

      logger.info('Widget updated', { 
        widgetId, 
        tenantId,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'Widget updated successfully',
        data: widgets[0]
      });
    } catch (error) {
      logger.error('Error updating widget', { 
        error: error.message,
        widgetId: req.params.id,
        tenantId: req.user?.tenantId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to update widget'
      });
    }
  }

  /**
   * Delete widget
   * @route DELETE /api/widget/admin/:id
   */
  static async deleteWidget(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const widgetId = req.params.id;

      const [result] = await pool.execute(
        'DELETE FROM chat_widgets WHERE id = ? AND tenant_id = ?',
        [widgetId, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Widget not found'
        });
      }

      logger.info('Widget deleted', { 
        widgetId, 
        tenantId,
        userId: req.user.id 
      });

      res.json({
        success: true,
        message: 'Widget deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting widget', { 
        error: error.message,
        widgetId: req.params.id,
        tenantId: req.user?.tenantId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to delete widget'
      });
    }
  }

  /**
   * Generate embed code for widget
   * @route GET /api/widget/admin/:id/embed-code
   */
  static async generateEmbedCode(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const widgetId = req.params.id;

      const [widgets] = await pool.execute(
        'SELECT id, widget_token FROM chat_widgets WHERE id = ? AND tenant_id = ?',
        [widgetId, tenantId]
      );

      if (widgets.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Widget not found'
        });
      }

      const widget = widgets[0];
      const baseUrl = process.env.APP_URL || 'http://localhost:7000';

      const embedCode = `<script>
  (function() {
    var script = document.createElement('script');
    script.src = '${baseUrl}/widget/embed.js';
    script.setAttribute('data-widget-id', '${widget.id}');
    script.setAttribute('data-widget-token', '${widget.widget_token}');
    script.async = true;
    document.head.appendChild(script);
  })();
</script>`;

      logger.info('Embed code generated', { 
        widgetId, 
        tenantId,
        userId: req.user.id 
      });

      res.json({
        success: true,
        data: {
          embedCode,
          widgetId: widget.id,
          widgetToken: widget.widget_token
        }
      });
    } catch (error) {
      logger.error('Error generating embed code', { 
        error: error.message,
        widgetId: req.params.id,
        tenantId: req.user?.tenantId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to generate embed code'
      });
    }
  }

  /**
   * Get widget analytics
   * @route GET /api/widget/admin/:id/analytics
   */
  static async getWidgetAnalytics(req, res) {
    try {
      const tenantId = req.user.tenantId;
      const widgetId = req.params.id;
      const startDate = req.query.start_date;
      const endDate = req.query.end_date;

      // Verify widget belongs to tenant
      const [widgets] = await pool.execute(
        'SELECT id FROM chat_widgets WHERE id = ? AND tenant_id = ?',
        [widgetId, tenantId]
      );

      if (widgets.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Widget not found'
        });
      }

      let query = `
        SELECT 
          event_type,
          COUNT(*) as count,
          DATE(created_at) as date
        FROM widget_analytics
        WHERE widget_id = ? AND tenant_id = ?
      `;
      const params = [widgetId, tenantId];

      if (startDate) {
        query += ` AND created_at >= ?`;
        params.push(startDate);
      }
      if (endDate) {
        query += ` AND created_at <= ?`;
        params.push(endDate + ' 23:59:59');
      }

      query += ` GROUP BY event_type, DATE(created_at) ORDER BY date DESC`;

      const [analytics] = await pool.execute(query, params);

      // Get summary
      const [summary] = await pool.execute(
        `SELECT 
          event_type,
          COUNT(*) as total
        FROM widget_analytics
        WHERE widget_id = ? AND tenant_id = ?
        GROUP BY event_type`,
        [widgetId, tenantId]
      );

      logger.info('Widget analytics retrieved', { 
        widgetId, 
        tenantId,
        userId: req.user.id 
      });

      res.json({
        success: true,
        data: {
          analytics,
          summary
        }
      });
    } catch (error) {
      logger.error('Error getting widget analytics', { 
        error: error.message,
        widgetId: req.params.id,
        tenantId: req.user?.tenantId,
        userId: req.user?.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve analytics'
      });
    }
  }

  /**
   * Get widget by token (public)
   * @route GET /api/widget/public/:id/:token
   */
  static async getWidgetByToken(req, res) {
    try {
      const widgetId = req.params.id;
      const token = req.params.token;

      const [widgets] = await pool.execute(
        `SELECT 
          id, name, whatsapp_number, button_title, button_background_color,
          widget_title, predefined_message, max_message_length,
          margin_right, margin_bottom, border_radius
        FROM chat_widgets 
        WHERE id = ? AND widget_token = ? AND is_active = TRUE`,
        [widgetId, token]
      );

      if (widgets.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Widget not found or inactive'
        });
      }

      res.json({
        success: true,
        data: widgets[0]
      });
    } catch (error) {
      logger.error('Error getting widget by token', { 
        error: error.message,
        widgetId: req.params.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve widget'
      });
    }
  }

  /**
   * Track widget event (public)
   * @route POST /api/widget/public/:id/:token/track
   */
  static async trackWidgetEvent(req, res) {
    try {
      const widgetId = req.params.id;
      const token = req.params.token;
      const { event_type, event_data } = req.body;

      // Verify widget exists and is active
      const [widgets] = await pool.execute(
        'SELECT id, tenant_id FROM chat_widgets WHERE id = ? AND widget_token = ? AND is_active = TRUE',
        [widgetId, token]
      );

      if (widgets.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Widget not found or inactive'
        });
      }

      const widget = widgets[0];

      // Get client info
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];
      const referrer = req.headers['referer'] || req.headers['referrer'];
      const sessionId = req.body.session_id || crypto.randomBytes(16).toString('hex');

      await pool.execute(
        `INSERT INTO widget_analytics (
          tenant_id, widget_id, event_type, event_data,
          ip_address, user_agent, referrer_url, page_url, session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          widget.tenant_id, widgetId, event_type,
          event_data ? JSON.stringify(event_data) : null,
          ipAddress, userAgent, referrer,
          event_data?.page_url || null, sessionId
        ]
      );

      res.json({
        success: true,
        message: 'Event tracked successfully'
      });
    } catch (error) {
      logger.error('Error tracking widget event', { 
        error: error.message,
        widgetId: req.params.id 
      });
      res.status(500).json({
        success: false,
        error: 'Failed to track event'
      });
    }
  }
}

module.exports = WidgetController;
