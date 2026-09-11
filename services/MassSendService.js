/**
 * Mass Send Service
 * Handles mass WhatsApp message sending with tenant isolation
 * 
 * @module services/MassSendService
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const axios = require('axios');

class MassSendService {
  constructor() {
    this.activeProcesses = new Map();
    this.io = null;
    this.whatsappService = null;
  }

  /**
   * Initialize service with Socket.IO and WhatsApp service
   */
  initialize(io, whatsappService) {
    this.io = io;
    this.whatsappService = whatsappService;
    this.startScheduleChecker();
    this.startReminderChecker();
    this.startCloudCampaignChecker();
    logger.info('✅ Mass Send Service initialized');
  }

  /**
   * Get contact name from database
   */
  async getContactName(phoneNumber, tenantId) {
    try {
      const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
      
      const phoneVariations = [
        cleanPhone,
        cleanPhone.slice(-11),
        cleanPhone.slice(-10),
        cleanPhone.slice(-9),
      ];
      
      // Try contacts table
      for (const variation of phoneVariations) {
        const [contacts] = await pool.execute(
          `SELECT name FROM contacts 
           WHERE tenant_id = ? AND (
             phone = ? 
             OR phone LIKE ? 
             OR phone LIKE ?
             OR REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', '') = ?
           )
           LIMIT 1`,
          [tenantId, variation, `%${variation}`, `%${variation}%`, variation]
        );
        
        if (contacts.length > 0 && contacts[0].name) {
          return contacts[0].name;
        }
      }
      
      // Try conversations table
      for (const variation of phoneVariations) {
        const [conversations] = await pool.execute(
          `SELECT contact_name FROM conversations 
           WHERE tenant_id = ? AND (
             phone_number = ? 
             OR phone_number LIKE ?
             OR REPLACE(REPLACE(REPLACE(phone_number, '+', ''), '-', ''), ' ', '') = ?
           )
           LIMIT 1`,
          [tenantId, variation, `%${variation}%`, variation]
        );
        
        if (conversations.length > 0 && conversations[0].contact_name) {
          return conversations[0].contact_name;
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error getting contact name:', error);
      return null;
    }
  }

  /**
   * Process mass send from history
   */
  async processMassSend(sendId, tenantId) {
    try {
      const [sends] = await pool.execute(
        `SELECT * FROM mass_send_history 
         WHERE id = ? AND tenant_id = ? AND status IN ('pending', 'paused')`,
        [sendId, tenantId]
      );

      if (sends.length === 0) {
        logger.warn(`Mass send ${sendId} not found or not in valid status`);
        return;
      }

      const send = sends[0];
      const recipients = JSON.parse(send.recipients);

      await pool.execute(
        `UPDATE mass_send_history SET status = 'sending', started_at = NOW() WHERE id = ?`,
        [sendId]
      );

      this.activeProcesses.set(sendId, { paused: false, cancelled: false });

      const startIndex = send.sent_count || 0;

      for (let i = startIndex; i < recipients.length; i++) {
        const process = this.activeProcesses.get(sendId);

        if (process.cancelled) {
          await pool.execute(
            `UPDATE mass_send_history SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
            [sendId]
          );
          this.activeProcesses.delete(sendId);
          return;
        }

        if (process.paused) {
          await pool.execute(
            `UPDATE mass_send_history SET status = 'paused', sent_count = ?, updated_at = NOW() WHERE id = ?`,
            [i, sendId]
          );
          return;
        }

        const recipient = recipients[i];
        const phoneNumber = recipient.phone || recipient;

        const logId = await this.createLog('history', sendId, phoneNumber, send.message);

        try {
          await this.updateLogStatus(logId, 'sending');

          if (this.io) {
            this.io.to(`tenant_${tenantId}`).emit('mass-send-progress', {
              sendId,
              type: 'history',
              status: 'sending',
              current: i + 1,
              total: recipients.length,
              phoneNumber
            });
          }

          const messageToSend = await this.replacePlaceholders(send.message, recipient, phoneNumber, tenantId);
          const result = await this.whatsappService.sendMessage(tenantId, phoneNumber, messageToSend);
          
          if (!result || !result.success) {
            throw new Error(result?.error || 'Failed to send message');
          }

          await this.updateLogStatus(logId, 'success');
          await pool.execute(
            `UPDATE mass_send_history SET sent_count = sent_count + 1 WHERE id = ?`,
            [sendId]
          );

          if (this.io) {
            this.io.to(`tenant_${tenantId}`).emit('mass-send-progress', {
              sendId,
              type: 'history',
              status: 'success',
              current: i + 1,
              total: recipients.length,
              phoneNumber
            });
          }

          if (i < recipients.length - 1) {
            await this.sleep(send.send_interval * 1000);
          }
        } catch (error) {
          logger.error(`Error sending to ${phoneNumber}:`, error);
          await this.updateLogStatus(logId, 'failed', error.message);
          await pool.execute(
            `UPDATE mass_send_history SET failed_count = failed_count + 1 WHERE id = ?`,
            [sendId]
          );

          if (this.io) {
            this.io.to(`tenant_${tenantId}`).emit('mass-send-progress', {
              sendId,
              type: 'history',
              status: 'failed',
              current: i + 1,
              total: recipients.length,
              phoneNumber,
              error: error.message
            });
          }
        }
      }

      await pool.execute(
        `UPDATE mass_send_history SET status = 'completed', completed_at = NOW() WHERE id = ?`,
        [sendId]
      );

      this.activeProcesses.delete(sendId);

      if (this.io) {
        this.io.to(`tenant_${tenantId}`).emit('mass-send-complete', {
          sendId,
          type: 'history'
        });
      }
    } catch (error) {
      logger.error(`Error processing mass send ${sendId}:`, error);
      await pool.execute(
        `UPDATE mass_send_history SET status = 'failed', updated_at = NOW() WHERE id = ?`,
        [sendId]
      );
      this.activeProcesses.delete(sendId);
    }
  }

  /**
   * Process scheduled send
   */
  async processSchedule(scheduleId, tenantId) {
    try {
      const [schedules] = await pool.execute(
        `SELECT * FROM mass_send_schedules 
         WHERE id = ? AND tenant_id = ? AND status = 'scheduled'`,
        [scheduleId, tenantId]
      );

      if (schedules.length === 0) {
        return;
      }

      const schedule = schedules[0];
      const recipients = JSON.parse(schedule.recipients);

      await pool.execute(
        `UPDATE mass_send_schedules SET status = 'sending', started_at = NOW() WHERE id = ?`,
        [scheduleId]
      );

      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const phoneNumber = recipient.phone || recipient;

        const logId = await this.createLog('schedule', scheduleId, phoneNumber, schedule.message);

        try {
          await this.updateLogStatus(logId, 'sending');

          if (this.io) {
            this.io.to(`tenant_${tenantId}`).emit('mass-send-progress', {
              sendId: scheduleId,
              type: 'schedule',
              status: 'sending',
              current: i + 1,
              total: recipients.length,
              phoneNumber
            });
          }

          const messageToSend = await this.replacePlaceholders(schedule.message, recipient, phoneNumber, tenantId);
          const result = await this.whatsappService.sendMessage(tenantId, phoneNumber, messageToSend);
          
          if (!result || !result.success) {
            throw new Error(result?.error || 'Failed to send message');
          }

          await this.updateLogStatus(logId, 'success');
          await pool.execute(
            `UPDATE mass_send_schedules SET sent_count = sent_count + 1 WHERE id = ?`,
            [scheduleId]
          );

          if (this.io) {
            this.io.to(`tenant_${tenantId}`).emit('mass-send-progress', {
              sendId: scheduleId,
              type: 'schedule',
              status: 'success',
              current: i + 1,
              total: recipients.length,
              phoneNumber
            });
          }

          if (i < recipients.length - 1) {
            await this.sleep(schedule.send_interval * 1000);
          }
        } catch (error) {
          logger.error(`Error sending scheduled message to ${phoneNumber}:`, error);
          await this.updateLogStatus(logId, 'failed', error.message);
          await pool.execute(
            `UPDATE mass_send_schedules SET failed_count = failed_count + 1 WHERE id = ?`,
            [scheduleId]
          );

          if (this.io) {
            this.io.to(`tenant_${tenantId}`).emit('mass-send-progress', {
              sendId: scheduleId,
              type: 'schedule',
              status: 'failed',
              current: i + 1,
              total: recipients.length,
              phoneNumber,
              error: error.message
            });
          }
        }
      }

      await pool.execute(
        `UPDATE mass_send_schedules SET status = 'completed', completed_at = NOW() WHERE id = ?`,
        [scheduleId]
      );

      if (this.io) {
        this.io.to(`tenant_${tenantId}`).emit('mass-send-complete', {
          sendId: scheduleId,
          type: 'schedule'
        });
      }
    } catch (error) {
      logger.error(`Error processing schedule ${scheduleId}:`, error);
      await pool.execute(
        `UPDATE mass_send_schedules SET status = 'failed', updated_at = NOW() WHERE id = ?`,
        [scheduleId]
      );
    }
  }

  /**
   * Process reminder send
   */
  async processReminder(reminderId, tenantId) {
    try {
      const [reminders] = await pool.execute(
        `SELECT * FROM mass_send_reminders 
         WHERE id = ? AND tenant_id = ? AND status = 'active'`,
        [reminderId, tenantId]
      );

      if (reminders.length === 0) {
        return;
      }

      const reminder = reminders[0];
      const recipients = JSON.parse(reminder.recipients);
      const reminderDates = JSON.parse(reminder.reminder_dates);
      const finalDate = new Date(reminder.final_date);
      const now = new Date();

      const daysRemaining = Math.ceil((finalDate - now) / (1000 * 60 * 60 * 24));

      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const phoneNumber = recipient.phone || recipient;

        const logId = await this.createLog('reminder', reminderId, phoneNumber, reminder.message);

        try {
          await this.updateLogStatus(logId, 'sending');

          if (this.io) {
            this.io.to(`tenant_${tenantId}`).emit('mass-send-progress', {
              sendId: reminderId,
              type: 'reminder',
              status: 'sending',
              current: i + 1,
              total: recipients.length,
              phoneNumber
            });
          }

          let messageToSend = await this.replacePlaceholders(reminder.message, recipient, phoneNumber, tenantId);
          messageToSend = messageToSend.replace(/{remaining-days}/g, daysRemaining);

          const result = await this.whatsappService.sendMessage(tenantId, phoneNumber, messageToSend);
          
          if (!result || !result.success) {
            throw new Error(result?.error || 'Failed to send message');
          }

          await this.updateLogStatus(logId, 'success');

          if (this.io) {
            this.io.to(`tenant_${tenantId}`).emit('mass-send-progress', {
              sendId: reminderId,
              type: 'reminder',
              status: 'success',
              current: i + 1,
              total: recipients.length,
              phoneNumber
            });
          }

          if (i < recipients.length - 1) {
            await this.sleep(reminder.send_interval * 1000);
          }
        } catch (error) {
          logger.error(`Error sending reminder to ${phoneNumber}:`, error);
          await this.updateLogStatus(logId, 'failed', error.message);

          if (this.io) {
            this.io.to(`tenant_${tenantId}`).emit('mass-send-progress', {
              sendId: reminderId,
              type: 'reminder',
              status: 'failed',
              current: i + 1,
              total: recipients.length,
              phoneNumber,
              error: error.message
            });
          }
        }
      }

      await pool.execute(
        `UPDATE mass_send_reminders 
        SET last_sent_at = NOW(), total_sent = total_sent + ? 
        WHERE id = ?`,
        [recipients.length, reminderId]
      );

      const currentDateIndex = reminderDates.findIndex(rd => {
        const sendDateTime = new Date(rd.send_datetime || rd.send_date);
        const nowTime = now.getTime();
        const sendTime = sendDateTime.getTime();
        return Math.abs(nowTime - sendTime) < 3600000;
      });

      if (currentDateIndex >= 0 && currentDateIndex < reminderDates.length - 1) {
        const nextReminderData = reminderDates[currentDateIndex + 1];
        const nextDate = new Date(nextReminderData.send_datetime || nextReminderData.send_date);
        await pool.execute(
          `UPDATE mass_send_reminders SET next_send_at = ? WHERE id = ?`,
          [nextDate, reminderId]
        );
      } else {
        await pool.execute(
          `UPDATE mass_send_reminders SET status = 'completed', next_send_at = NULL WHERE id = ?`,
          [reminderId]
        );
      }

      if (this.io) {
        this.io.to(`tenant_${tenantId}`).emit('mass-send-complete', {
          sendId: reminderId,
          type: 'reminder'
        });
      }
    } catch (error) {
      logger.error(`Error processing reminder ${reminderId}:`, error);
    }
  }

  /**
   * Pause mass send
   */
  pauseSend(sendId) {
    const process = this.activeProcesses.get(sendId);
    if (process) {
      process.paused = true;
      return true;
    }
    return false;
  }

  /**
   * Cancel mass send
   */
  cancelSend(sendId) {
    const process = this.activeProcesses.get(sendId);
    if (process) {
      process.cancelled = true;
      return true;
    }
    return false;
  }

  /**
   * Create log entry
   */
  async createLog(sendType, sendId, phoneNumber, message) {
    const [result] = await pool.execute(
      `INSERT INTO mass_send_logs (send_type, send_id, phone_number, message, status)
      VALUES (?, ?, ?, ?, 'pending')`,
      [sendType, sendId, phoneNumber, message]
    );
    return result.insertId;
  }

  /**
   * Update log status
   */
  async updateLogStatus(logId, status, errorMessage = null) {
    await pool.execute(
      `UPDATE mass_send_logs 
      SET status = ?, error_message = ?, sent_at = NOW() 
      WHERE id = ?`,
      [status, errorMessage, logId]
    );
  }

  /**
   * Replace placeholders in message
   */
  async replacePlaceholders(message, recipient, phoneNumber, tenantId) {
    if (!message) return '';
    
    let result = message;
    const now = new Date();

    // Replace recipient-specific placeholders (single braces)
    if (typeof recipient === 'object') {
      Object.keys(recipient).forEach(key => {
        const placeholder = `{${key}}`;
        const value = recipient[key];
        if (value !== undefined && value !== null) {
          result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        }
      });
    }

    // Get contact name
    const contactName = await this.getContactName(phoneNumber, tenantId);
    const displayName = contactName || 'Cliente';

    // Replace standard placeholders (double braces)
    const placeholders = {
      '{{customer_name}}': displayName,
      '{{phone_number}}': phoneNumber || '',
      '{{date}}': now.toLocaleDateString(),
      '{{current_date}}': now.toLocaleDateString(),
      '{{time}}': now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      '{{current_time}}': now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      '{{day}}': now.toLocaleDateString([], { weekday: 'long' }),
      '{{month}}': now.toLocaleDateString([], { month: 'long' }),
      '{{year}}': now.getFullYear().toString()
    };

    for (const [placeholder, value] of Object.entries(placeholders)) {
      result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    // Replace WooCommerce product placeholders {{product_X}}
    const productMatches = result.match(/\{\{product_(\d+)\}\}/g);
    if (productMatches) {
      try {
        for (const match of productMatches) {
          const wcProductId = parseInt(match.match(/\d+/)[0]);
          
          const [products] = await pool.execute(
            'SELECT * FROM woocommerce_products WHERE tenant_id = ? AND wc_product_id = ? AND is_active = TRUE LIMIT 1',
            [tenantId, wcProductId]
          );
          
          if (products.length > 0) {
            const product = products[0];
            const price = product.sale_price || product.regular_price || product.price;
            const priceText = price ? `R$ ${parseFloat(price).toFixed(2).replace('.', ',')}` : 'Consulte';
            
            const productText = `🛍️ *${product.name}*\n\n${product.short_description || ''}\n\n💰 ${priceText}\n\n🔗 ${product.permalink}`;
            
            result = result.replace(
              new RegExp(match.replace(/[{}]/g, '\\$&'), 'g'), 
              productText
            );
          } else {
            result = result.replace(
              new RegExp(match.replace(/[{}]/g, '\\$&'), 'g'), 
              '[Product not found]'
            );
          }
        }
      } catch (error) {
        logger.error('Error fetching products for mass send:', error);
      }
    }

    return result;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  normalizePhone(value) {
    return String(value || '').replace(/[^\d]/g, '');
  }

  parseAudienceNumbers(input) {
    if (Array.isArray(input)) {
      return input.map(item => String(item || '')).filter(item => item.trim().length > 0);
    }
    if (typeof input === 'string') {
      return input.split(/\r?\n/).map(item => item.trim()).filter(item => item.length > 0);
    }
    return [];
  }

  parseJson(value, fallback) {
    try {
      if (value === null || value === undefined || value === '') {
        return fallback;
      }
      if (typeof value === 'string') {
        return JSON.parse(value);
      }
      return value;
    } catch (error) {
      return fallback;
    }
  }

  async getCloudCampaignRecipients({ tenantId, audienceType, audienceGroups, audienceCustomNumbers }) {
    const recipients = [];
    if (audienceType === 'custom') {
      const numbers = this.parseAudienceNumbers(audienceCustomNumbers);
      const seen = new Set();
      numbers.forEach(number => {
        const normalized = this.normalizePhone(number);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        recipients.push({ phone: normalized, name: normalized });
      });
      return recipients;
    }

    let query = `SELECT name, phone FROM contacts WHERE tenant_id = ? AND phone IS NOT NULL AND phone <> ''`;
    const params = [tenantId];
    if (audienceType === 'groups') {
      const groupList = Array.isArray(audienceGroups) ? audienceGroups : [];
      if (!groupList.length) {
        return [];
      }
      const placeholders = groupList.map(() => '?').join(', ');
      query += ` AND group_id IN (${placeholders})`;
      params.push(...groupList);
    }
    const [rows] = await pool.execute(query, params);
    const seen = new Set();
    rows.forEach(row => {
      const normalized = this.normalizePhone(row.phone);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      recipients.push({ phone: normalized, name: row.name || normalized });
    });
    return recipients;
  }

  async ensureCloudConversation({ tenantId, accountId, contactPhone, contactName }) {
    const [existing] = await pool.execute(
      'SELECT id FROM whatsapp_cloud_conversations WHERE account_id = ? AND contact_phone = ?',
      [accountId, contactPhone]
    );
    if (existing.length > 0) {
      return existing[0].id;
    }
    try {
      const [result] = await pool.execute(
        `INSERT INTO whatsapp_cloud_conversations
         (tenant_id, account_id, contact_phone, contact_name, last_message_text, last_message_time, last_message_from, unread_count, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, NOW(), 'business', 0, 'open', NOW(), NOW())`,
        [tenantId, accountId, contactPhone, contactName || contactPhone]
      );
      return result.insertId;
    } catch (error) {
      const [existingRetry] = await pool.execute(
        'SELECT id FROM whatsapp_cloud_conversations WHERE account_id = ? AND contact_phone = ?',
        [accountId, contactPhone]
      );
      if (existingRetry.length > 0) {
        return existingRetry[0].id;
      }
      throw error;
    }
  }

  async processCloudCampaign(campaignId, tenantId) {
    try {
      const [lock] = await pool.execute(
        `UPDATE whatsapp_cloud_campaigns
         SET status = 'sending', updated_at = NOW()
         WHERE id = ? AND tenant_id = ? AND status = 'scheduled'`,
        [campaignId, tenantId]
      );
      if (lock.affectedRows === 0) {
        return;
      }

      const [campaignRows] = await pool.execute(
        `SELECT * FROM whatsapp_cloud_campaigns WHERE id = ? AND tenant_id = ?`,
        [campaignId, tenantId]
      );
      if (campaignRows.length === 0) {
        return;
      }
      const campaign = campaignRows[0];

      const [accounts] = await pool.execute(
        'SELECT id, access_token, phone_number_id FROM whatsapp_cloud_accounts WHERE id = ? AND tenant_id = ?',
        [campaign.account_id, tenantId]
      );
      if (accounts.length === 0 || !accounts[0].access_token || !accounts[0].phone_number_id) {
        await pool.execute(
          `UPDATE whatsapp_cloud_campaigns SET status = 'failed', error_message = 'Account not found', updated_at = NOW() WHERE id = ?`,
          [campaignId]
        );
        return;
      }

      const [templates] = await pool.execute(
        `SELECT template_id, name, language
         FROM whatsapp_cloud_templates
         WHERE tenant_id = ? AND account_id = ? AND template_id = ?
         LIMIT 1`,
        [tenantId, campaign.account_id, campaign.template_id]
      );
      if (templates.length === 0) {
        await pool.execute(
          `UPDATE whatsapp_cloud_campaigns SET status = 'failed', error_message = 'Template not found', updated_at = NOW() WHERE id = ?`,
          [campaignId]
        );
        return;
      }

      const template = templates[0];
      const languageCode = template.language || 'en';
      const audienceGroups = this.parseJson(campaign.audience_groups, []);
      const audienceCustomNumbers = this.parseJson(campaign.audience_custom_numbers, []);

      const recipients = await this.getCloudCampaignRecipients({
        tenantId,
        audienceType: campaign.audience_type,
        audienceGroups,
        audienceCustomNumbers
      });

      if (recipients.length === 0) {
        await pool.execute(
          `UPDATE whatsapp_cloud_campaigns SET status = 'failed', total_count = 0, error_message = 'No recipients', updated_at = NOW() WHERE id = ?`,
          [campaignId]
        );
        return;
      }

      await pool.execute(
        `UPDATE whatsapp_cloud_campaigns SET total_count = ?, updated_at = NOW() WHERE id = ?`,
        [recipients.length, campaignId]
      );

      let sent = 0;
      let failed = 0;

      for (const recipient of recipients) {
        const contactPhone = recipient.phone;
        if (!contactPhone) {
          failed += 1;
          continue;
        }

        const payload = {
          messaging_product: 'whatsapp',
          to: contactPhone,
          type: 'template',
          template: {
            name: template.name,
            language: { code: languageCode }
          }
        };

        try {
          const response = await axios.post(
            `https://graph.facebook.com/v18.0/${accounts[0].phone_number_id}/messages`,
            payload,
            {
              headers: {
                'Authorization': `Bearer ${accounts[0].access_token}`,
                'Content-Type': 'application/json'
              }
            }
          );

          const messageId = response?.data?.messages?.[0]?.id || `campaign_${Date.now()}`;
          const conversationId = await this.ensureCloudConversation({
            tenantId,
            accountId: accounts[0].id,
            contactPhone,
            contactName: recipient.name || contactPhone
          });

          await pool.execute(
            `INSERT INTO whatsapp_cloud_messages
             (conversation_id, message_id, direction, message_type, text_content, status, timestamp, created_at)
             VALUES (?, ?, 'outbound', 'template', ?, 'sent', NOW(), NOW())`,
            [conversationId, messageId, template.name]
          );

          await pool.execute(
            `UPDATE whatsapp_cloud_conversations
             SET last_message_text = ?, last_message_time = NOW(), last_message_from = 'business', updated_at = NOW()
             WHERE id = ?`,
            [template.name, conversationId]
          );

          sent += 1;
        } catch (error) {
          failed += 1;
        }
      }

      const status = failed >= recipients.length ? 'failed' : 'sent';
      await pool.execute(
        `UPDATE whatsapp_cloud_campaigns
         SET status = ?, sent_count = ?, failed_count = ?, updated_at = NOW()
         WHERE id = ?`,
        [status, sent, failed, campaignId]
      );
    } catch (error) {
      logger.error('Error processing cloud campaign', { error: error.message });
      await pool.execute(
        `UPDATE whatsapp_cloud_campaigns SET status = 'failed', error_message = ?, updated_at = NOW() WHERE id = ?`,
        [error.message, campaignId]
      );
    }
  }

  /**
   * Start schedule checker (runs every minute)
   */
  startScheduleChecker() {
    setInterval(async () => {
      try {
        const [schedules] = await pool.execute(
          `SELECT id, tenant_id FROM mass_send_schedules 
          WHERE status = 'scheduled' AND scheduled_date <= NOW()`
        );

        for (const schedule of schedules) {
          this.processSchedule(schedule.id, schedule.tenant_id);
        }
      } catch (error) {
        logger.error('Error checking schedules:', error);
      }
    }, 60000);
  }

  startCloudCampaignChecker() {
    setInterval(async () => {
      try {
        const [campaigns] = await pool.execute(
          `SELECT id, tenant_id FROM whatsapp_cloud_campaigns
           WHERE status = 'scheduled' AND schedule_at <= NOW()`
        );
        for (const campaign of campaigns) {
          this.processCloudCampaign(campaign.id, campaign.tenant_id);
        }
      } catch (error) {
        logger.error('Error checking cloud campaigns:', error);
      }
    }, 60000);
  }

  /**
   * Start reminder checker (runs every minute)
   */
  startReminderChecker() {
    setInterval(async () => {
      try {
        const [reminders] = await pool.execute(
          `SELECT id, tenant_id FROM mass_send_reminders 
          WHERE status = 'active' 
          AND next_send_at <= NOW()
          AND next_send_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)`
        );

        for (const reminder of reminders) {
          this.processReminder(reminder.id, reminder.tenant_id);
        }
      } catch (error) {
        logger.error('Error checking reminders:', error);
      }
    }, 60000);
  }
}

module.exports = new MassSendService();
