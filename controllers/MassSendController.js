/**
 * Mass Send Controller - Multi-tenant
 * 
 * Handles mass messaging campaigns, schedules, and reminders with tenant isolation
 * 
 * @module controllers/MassSendController
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const { asyncHandler } = require('../middleware/errorHandler');

class MassSendController {
  /**
   * Get mass send history
   * GET /api/tenant/mass-send/history
   */
  static getHistory = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;
    const { archived = 'false' } = req.query;
    
    // Convert string to boolean for database query
    const archivedBool = archived === 'true' || archived === true ? 1 : 0;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    try {
      const [history] = await pool.query(`
        SELECT m.*, 
               u.username as created_by_name
        FROM mass_send_history m
        LEFT JOIN users u ON m.created_by = u.id
        WHERE m.tenant_id = ? AND m.archived = ?
        ORDER BY m.created_at DESC
      `, [tenantId, archivedBool]);

      logger.info('Mass send history retrieved', { tenantId, count: history.length });

      return res.json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Error getting mass send history', { tenantId, error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to load history: ' + error.message
      });
    }
  });

  /**
   * Create mass send campaign
   * POST /api/tenant/mass-send/history
   */
  static createHistory = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userId = req.user?.id || null;
    const { name, message, recipients, sendInterval = 70 } = req.body;

    logger.info('Creating mass send campaign', { 
      tenantId, 
      userId, 
      name, 
      recipientsCount: recipients?.length,
      hasRecipients: !!recipients,
      recipientsType: typeof recipients
    });

    if (!tenantId) {
      logger.error('Mass send creation failed: No tenant ID');
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    if (!name || !message) {
      logger.error('Mass send creation failed: Missing name or message', { name: !!name, message: !!message });
      return res.status(400).json({
        success: false,
        error: 'Name and message are required'
      });
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      logger.error('Mass send creation failed: Invalid recipients', { 
        hasRecipients: !!recipients, 
        isArray: Array.isArray(recipients),
        length: recipients?.length 
      });
      return res.status(400).json({
        success: false,
        error: 'Recipients are required and must be an array'
      });
    }

    if (sendInterval < 70) {
      return res.status(400).json({
        success: false,
        error: 'Send interval must be at least 70 seconds'
      });
    }

    try {
      const recipientsJson = JSON.stringify(recipients);
      logger.info('Inserting mass send campaign', { 
        tenantId, 
        name, 
        recipientsLength: recipients.length,
        sendInterval,
        userId
      });

      // If userId is provided, verify it exists
      let validUserId = null;
      if (userId) {
        const [userCheck] = await pool.query('SELECT id FROM users WHERE id = ? AND tenant_id = ?', [userId, tenantId]);
        if (userCheck.length > 0) {
          validUserId = userId;
        } else {
          logger.warn('User ID not found or not in tenant, setting created_by to NULL', { userId, tenantId });
        }
      }

      const [result] = await pool.query(`
        INSERT INTO mass_send_history (
          tenant_id, name, message, recipients, total_recipients,
          send_interval, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `, [
        tenantId,
        name,
        message,
        recipientsJson,
        recipients.length,
        sendInterval,
        validUserId
      ]);

      logger.info('Mass send campaign created successfully', { tenantId, campaignId: result.insertId });

      return res.status(201).json({
        success: true,
        message: 'Campaign created successfully',
        data: {
          id: result.insertId,
          totalRecipients: recipients.length
        }
      });
    } catch (error) {
      logger.error('Error creating mass send campaign', { 
        tenantId, 
        error: error.message, 
        stack: error.stack,
        sqlMessage: error.sqlMessage,
        code: error.code
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to create campaign: ' + error.message
      });
    }
  });

  /**
   * Update campaign status
   * PATCH /api/tenant/mass-send/history/:id/status
   */
  static updateStatus = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'sending', 'paused', 'completed', 'cancelled', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status'
      });
    }

    try {
      const [result] = await pool.query(
        'UPDATE mass_send_history SET status = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?',
        [status, id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      logger.info('Campaign status updated', { tenantId, campaignId: id, status });

      return res.json({
        success: true,
        message: 'Status updated successfully'
      });
    } catch (error) {
      logger.error('Error updating campaign status', { tenantId, campaignId: id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to update status'
      });
    }
  });

  /**
   * Update campaign message
   * PATCH /api/tenant/mass-send/history/:id/message
   */
  static updateMessage = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;
    const { id } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    try {
      const [result] = await pool.query(
        'UPDATE mass_send_history SET message = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ? AND status = "paused"',
        [message, id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found or not paused'
        });
      }

      logger.info('Campaign message updated', { tenantId, campaignId: id });

      return res.json({
        success: true,
        message: 'Message updated successfully'
      });
    } catch (error) {
      logger.error('Error updating campaign message', { tenantId, campaignId: id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to update message'
      });
    }
  });

  /**
   * Archive campaign
   * PATCH /api/tenant/mass-send/history/:id/archive
   */
  static archive = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;
    const { id } = req.params;

    try {
      const [result] = await pool.query(
        'UPDATE mass_send_history SET archived = TRUE, updated_at = NOW() WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      logger.info('Campaign archived', { tenantId, campaignId: id });

      return res.json({
        success: true,
        message: 'Campaign archived successfully'
      });
    } catch (error) {
      logger.error('Error archiving campaign', { tenantId, campaignId: id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to archive campaign'
      });
    }
  });

  /**
   * Delete campaign
   * DELETE /api/tenant/mass-send/history/:id
   */
  static delete = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;
    const { id } = req.params;

    try {
      // Delete logs first
      await pool.query(
        'DELETE FROM mass_send_logs WHERE send_id = ? AND send_type = "history"',
        [id]
      );

      // Delete campaign
      const [result] = await pool.query(
        'DELETE FROM mass_send_history WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      logger.info('Campaign deleted', { tenantId, campaignId: id });

      return res.json({
        success: true,
        message: 'Campaign deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting campaign', { tenantId, campaignId: id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to delete campaign'
      });
    }
  });

  /**
   * Get campaign logs
   * GET /api/tenant/mass-send/logs/:type/:id
   */
  static getLogs = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;
    const { type, id } = req.params;

    const validTypes = ['history', 'schedule', 'reminder'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type'
      });
    }

    try {
      // Verify ownership
      let table = type === 'history' ? 'mass_send_history' :
                  type === 'schedule' ? 'mass_send_schedules' :
                  'mass_send_reminders';

      const [ownership] = await pool.query(
        `SELECT id FROM ${table} WHERE id = ? AND tenant_id = ?`,
        [id, tenantId]
      );

      if (ownership.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Campaign not found'
        });
      }

      const [logs] = await pool.query(`
        SELECT * FROM mass_send_logs
        WHERE send_type = ? AND send_id = ?
        ORDER BY created_at DESC
      `, [type, id]);

      return res.json({
        success: true,
        data: logs
      });
    } catch (error) {
      logger.error('Error getting logs', { tenantId, type, id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to load logs'
      });
    }
  });

  /**
   * Get schedules
   * GET /api/tenant/mass-send/schedules
   */
  static getSchedules = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;

    try {
      const [schedules] = await pool.query(`
        SELECT m.*, 
               u.username as created_by_name
        FROM mass_send_schedules m
        LEFT JOIN users u ON m.created_by = u.id
        WHERE m.tenant_id = ?
        ORDER BY m.scheduled_date DESC
      `, [tenantId]);

      return res.json({
        success: true,
        data: schedules
      });
    } catch (error) {
      logger.error('Error getting schedules', { tenantId, error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to load schedules: ' + error.message
      });
    }
  });

  /**
   * Create schedule
   * POST /api/tenant/mass-send/schedule
   */
  static createSchedule = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userId = req.user?.id || null;
    const { name, message, recipients, sendInterval = 70, scheduledDate } = req.body;

    logger.info('Creating schedule', { 
      tenantId, 
      userId, 
      name, 
      scheduledDate, 
      recipientsCount: recipients?.length,
      hasRecipients: !!recipients,
      recipientsType: typeof recipients
    });

    if (!tenantId) {
      logger.error('Schedule creation failed: No tenant ID');
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    if (!name || !message || !scheduledDate) {
      logger.error('Schedule creation failed: Missing required fields', { name: !!name, message: !!message, scheduledDate: !!scheduledDate });
      return res.status(400).json({
        success: false,
        error: 'Name, message, and scheduled date are required'
      });
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      logger.error('Schedule creation failed: Invalid recipients', { 
        hasRecipients: !!recipients, 
        isArray: Array.isArray(recipients),
        length: recipients?.length 
      });
      return res.status(400).json({
        success: false,
        error: 'Recipients are required and must be an array'
      });
    }

    if (sendInterval < 70) {
      return res.status(400).json({
        success: false,
        error: 'Send interval must be at least 70 seconds'
      });
    }

    // Validate scheduled date (max 30 days in future)
    const scheduledDateTime = new Date(scheduledDate);
    const now = new Date();
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);

    if (isNaN(scheduledDateTime.getTime())) {
      logger.error('Schedule creation failed: Invalid date format', { scheduledDate });
      return res.status(400).json({
        success: false,
        error: 'Invalid scheduled date format'
      });
    }

    if (scheduledDateTime < now || scheduledDateTime > maxDate) {
      return res.status(400).json({
        success: false,
        error: 'Scheduled date must be between now and 30 days in the future'
      });
    }

    try {
      // If userId is provided, verify it exists
      let validUserId = null;
      if (userId) {
        const [userCheck] = await pool.query('SELECT id FROM users WHERE id = ? AND tenant_id = ?', [userId, tenantId]);
        if (userCheck.length > 0) {
          validUserId = userId;
        } else {
          logger.warn('User ID not found or not in tenant, setting created_by to NULL', { userId, tenantId });
        }
      }

      const recipientsJson = JSON.stringify(recipients);
      logger.info('Inserting schedule', { 
        tenantId, 
        name, 
        recipientsLength: recipients.length,
        sendInterval,
        scheduledDate,
        validUserId
      });

      const [result] = await pool.query(`
        INSERT INTO mass_send_schedules (
          tenant_id, name, message, recipients, total_recipients,
          send_interval, scheduled_date, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)
      `, [
        tenantId,
        name,
        message,
        recipientsJson,
        recipients.length,
        sendInterval,
        scheduledDate,
        validUserId
      ]);

      logger.info('Schedule created successfully', { tenantId, scheduleId: result.insertId });

      return res.status(201).json({
        success: true,
        message: 'Schedule created successfully',
        data: {
          id: result.insertId,
          totalRecipients: recipients.length
        }
      });
    } catch (error) {
      logger.error('Error creating schedule', { 
        tenantId, 
        error: error.message, 
        stack: error.stack,
        sqlMessage: error.sqlMessage,
        code: error.code
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to create schedule: ' + error.message
      });
    }
  });

  /**
   * Cancel schedule
   * PATCH /api/tenant/mass-send/schedule/:id/cancel
   */
  static cancelSchedule = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;
    const { id } = req.params;

    try {
      const [result] = await pool.query(
        'UPDATE mass_send_schedules SET status = "cancelled", updated_at = NOW() WHERE id = ? AND tenant_id = ? AND status = "scheduled"',
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Schedule not found or already processed'
        });
      }

      logger.info('Schedule cancelled', { tenantId, scheduleId: id });

      return res.json({
        success: true,
        message: 'Schedule cancelled successfully'
      });
    } catch (error) {
      logger.error('Error cancelling schedule', { tenantId, scheduleId: id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to cancel schedule'
      });
    }
  });

  /**
   * Get reminders
   * GET /api/tenant/mass-send/reminders
   */
  static getReminders = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;

    try {
      const [reminders] = await pool.query(`
        SELECT m.*, 
               u.username as created_by_name
        FROM mass_send_reminders m
        LEFT JOIN users u ON m.created_by = u.id
        WHERE m.tenant_id = ?
        ORDER BY m.created_at DESC
      `, [tenantId]);

      return res.json({
        success: true,
        data: reminders
      });
    } catch (error) {
      logger.error('Error getting reminders', { tenantId, error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to load reminders: ' + error.message
      });
    }
  });

  /**
   * Create reminder
   * POST /api/tenant/mass-send/reminder
   */
  static createReminder = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;
    const userId = req.user?.id || null;
    const { name, message, recipients, sendInterval = 70, finalDate, daysBefore } = req.body;

    logger.info('Creating reminder', {
      tenantId,
      userId,
      name,
      finalDate,
      recipientsCount: recipients?.length,
      hasRecipients: !!recipients,
      recipientsType: typeof recipients,
      daysBefore
    });

    if (!tenantId) {
      logger.error('Reminder creation failed: No tenant ID');
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    if (!name || !message || !finalDate || !daysBefore) {
      logger.error('Reminder creation failed: Missing required fields', {
        name: !!name,
        message: !!message,
        finalDate: !!finalDate,
        daysBefore: !!daysBefore
      });
      return res.status(400).json({
        success: false,
        error: 'Name, message, final date, and reminder dates are required'
      });
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      logger.error('Reminder creation failed: Invalid recipients', {
        hasRecipients: !!recipients,
        isArray: Array.isArray(recipients),
        length: recipients?.length
      });
      return res.status(400).json({
        success: false,
        error: 'Recipients are required and must be an array'
      });
    }

    if (!Array.isArray(daysBefore) || daysBefore.length === 0 || daysBefore.length > 7) {
      logger.error('Reminder creation failed: Invalid daysBefore', {
        isArray: Array.isArray(daysBefore),
        length: daysBefore?.length
      });
      return res.status(400).json({
        success: false,
        error: 'Must have between 1 and 7 reminder dates'
      });
    }

    if (sendInterval < 70) {
      return res.status(400).json({
        success: false,
        error: 'Send interval must be at least 70 seconds'
      });
    }

    // Validate final date
    const finalDateTime = new Date(finalDate);
    if (isNaN(finalDateTime.getTime())) {
      logger.error('Reminder creation failed: Invalid date format', { finalDate });
      return res.status(400).json({
        success: false,
        error: 'Invalid final date format'
      });
    }

    // Calculate reminder dates - using local time format to avoid timezone conversion
    const reminderDates = daysBefore.map(item => {
      const reminderDate = new Date(finalDateTime);
      reminderDate.setDate(reminderDate.getDate() - item.days);

      // Set time
      const [hours, minutes] = (item.time || '09:00').split(':');
      reminderDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // Format as local datetime string (YYYY-MM-DD HH:mm:ss) to preserve the intended time
      const year = reminderDate.getFullYear();
      const month = String(reminderDate.getMonth() + 1).padStart(2, '0');
      const day = String(reminderDate.getDate()).padStart(2, '0');
      const hour = String(reminderDate.getHours()).padStart(2, '0');
      const minute = String(reminderDate.getMinutes()).padStart(2, '0');
      const localDatetime = `${year}-${month}-${day} ${hour}:${minute}:00`;

      return {
        days: item.days,
        time: item.time || '09:00',
        send_datetime: localDatetime
      };
    }).sort((a, b) => new Date(b.send_datetime) - new Date(a.send_datetime));

    const nextSendAt = reminderDates[0].send_datetime;

    try {
      // If userId is provided, verify it exists
      let validUserId = null;
      if (userId) {
        const [userCheck] = await pool.query('SELECT id FROM users WHERE id = ? AND tenant_id = ?', [userId, tenantId]);
        if (userCheck.length > 0) {
          validUserId = userId;
        } else {
          logger.warn('User ID not found or not in tenant, setting created_by to NULL', { userId, tenantId });
        }
      }

      const recipientsJson = JSON.stringify(recipients);
      logger.info('Inserting reminder', {
        tenantId,
        name,
        recipientsLength: recipients.length,
        sendInterval,
        finalDate,
        reminderDatesCount: reminderDates.length,
        nextSendAt,
        validUserId
      });

      const [result] = await pool.query(`
        INSERT INTO mass_send_reminders (
          tenant_id, name, message, recipients, total_recipients,
          send_interval, final_date, reminder_dates, next_send_at,
          status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `, [
        tenantId,
        name,
        message,
        recipientsJson,
        recipients.length,
        sendInterval,
        finalDate,
        JSON.stringify(reminderDates),
        nextSendAt,
        validUserId
      ]);

      logger.info('Reminder created successfully', { tenantId, reminderId: result.insertId });

      return res.status(201).json({
        success: true,
        message: 'Reminder created successfully',
        data: {
          id: result.insertId,
          totalRecipients: recipients.length,
          reminderCount: reminderDates.length
        }
      });
    } catch (error) {
      logger.error('Error creating reminder', {
        tenantId,
        error: error.message,
        stack: error.stack,
        sqlMessage: error.sqlMessage,
        code: error.code
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to create reminder: ' + error.message
      });
    }
  });

  /**
   * Cancel reminder
   * PATCH /api/tenant/mass-send/reminder/:id/cancel
   */
  static cancelReminder = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;
    const { id } = req.params;

    try {
      const [result] = await pool.query(
        'UPDATE mass_send_reminders SET status = "cancelled", updated_at = NOW() WHERE id = ? AND tenant_id = ? AND status = "active"',
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reminder not found or already completed'
        });
      }

      logger.info('Reminder cancelled', { tenantId, reminderId: id });

      return res.json({
        success: true,
        message: 'Reminder cancelled successfully'
      });
    } catch (error) {
      logger.error('Error cancelling reminder', { tenantId, reminderId: id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to cancel reminder'
      });
    }
  });

  /**
   * Delete reminder
   * DELETE /api/tenant/mass-send/reminder/:id
   */
  static deleteReminder = asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.tenantId;
    const { id } = req.params;

    try {
      // Delete logs first
      await pool.query(
        'DELETE FROM mass_send_logs WHERE send_id = ? AND send_type = "reminder"',
        [id]
      );

      // Delete reminder
      const [result] = await pool.query(
        'DELETE FROM mass_send_reminders WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Reminder not found'
        });
      }

      logger.info('Reminder deleted', { tenantId, reminderId: id });

      return res.json({
        success: true,
        message: 'Reminder deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting reminder', { tenantId, reminderId: id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to delete reminder'
      });
    }
  });
}

module.exports = MassSendController;
