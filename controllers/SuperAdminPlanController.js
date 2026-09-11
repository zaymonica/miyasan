/**
 * Super Admin Plan Controller
 * Manages subscription plans
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const i18n = require('../services/TranslationService');

class SuperAdminPlanController extends BaseController {
  /**
   * Get all subscription plans
   * GET /api/superadmin/plans
   */
  static async getAllPlans(req, res) {
    try {
      const [plans] = await pool.execute(
        'SELECT * FROM subscription_plans ORDER BY sort_order, price'
      );

      return res.json({
        success: true,
        data: plans
      });
    } catch (error) {
      logger.error('Error getting plans', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading plans'
      });
    }
  }

  /**
   * Get plan by ID
   * GET /api/superadmin/plans/:id
   */
  static async getPlanById(req, res) {
    try {
      const { id } = req.params;

      const [plans] = await pool.execute(
        'SELECT * FROM subscription_plans WHERE id = ?',
        [id]
      );

      if (plans.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Plan not found'
        });
      }

      return res.json({
        success: true,
        data: plans[0]
      });
    } catch (error) {
      logger.error('Error getting plan', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading plan'
      });
    }
  }

  /**
   * Create new subscription plan
   * POST /api/superadmin/plans
   */
  static async createPlan(req, res) {
    try {
      const {
        name,
        description,
        price,
        currency,
        billing_period = 'monthly',
        max_stores = 1,
        max_users = 5,
        max_departments = 5,
        max_contacts = 1000,
        max_devices = 1,
        max_conversations = 1000,
        max_messages_per_month = 10000,
        max_faqs = 10,
        max_contact_groups = 10,
        whatsapp_enabled = true,
        ai_enabled = false,
        woocommerce_enabled = false,
        analytics_enabled = true,
        priority_support_enabled = false,
        api_access_enabled = false,
        custom_branding_enabled = false,
        invoices_enabled = false,
        max_invoices_per_month = 0,
        quotes_enabled = false,
        max_quotes_per_month = 0,
        widgets_enabled = false,
        max_widgets = 0,
        payment_links_enabled = false,
        max_payment_links_per_month = 0,
        is_trial = false,
        trial_days = 0,
        is_free = false,
        stripe_price_id,
        paypal_plan_id,
        sort_order = 0
      } = req.body;

      // Validation
      if (!name || price === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Name and price are required'
        });
      }

      // Check if only one free plan exists
      if (is_free) {
        const [freePlans] = await pool.execute(
          'SELECT id FROM subscription_plans WHERE is_free = TRUE'
        );
        if (freePlans.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Only one free plan is allowed'
          });
        }
      }

      let resolvedCurrency = currency;
      if (!resolvedCurrency) {
        const [defaultCurrencyRows] = await pool.execute(
          'SELECT code FROM currencies WHERE is_default = TRUE AND active = TRUE ORDER BY id LIMIT 1'
        );
        resolvedCurrency = defaultCurrencyRows?.[0]?.code || 'USD';
      }

      const [result] = await pool.execute(
        `INSERT INTO subscription_plans (
          name, description, price, currency, billing_period,
          max_stores, max_users, max_departments, max_contacts, max_devices,
          max_conversations, max_messages_per_month, max_faqs, max_contact_groups,
          whatsapp_enabled, ai_enabled, woocommerce_enabled, analytics_enabled,
          priority_support_enabled, api_access_enabled, custom_branding_enabled,
          invoices_enabled, max_invoices_per_month,
          quotes_enabled, max_quotes_per_month,
          widgets_enabled, max_widgets,
          payment_links_enabled, max_payment_links_per_month,
          is_trial, trial_days, is_free,
          stripe_price_id, paypal_plan_id, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name, description, price, resolvedCurrency, billing_period,
          max_stores, max_users, max_departments, max_contacts, max_devices,
          max_conversations, max_messages_per_month, max_faqs, max_contact_groups,
          whatsapp_enabled, ai_enabled, woocommerce_enabled, analytics_enabled,
          priority_support_enabled, api_access_enabled, custom_branding_enabled,
          invoices_enabled, max_invoices_per_month,
          quotes_enabled, max_quotes_per_month,
          widgets_enabled, max_widgets,
          payment_links_enabled, max_payment_links_per_month,
          is_trial, trial_days, is_free,
          stripe_price_id, paypal_plan_id, sort_order
        ]
      );

      logger.info('Plan created', { planId: result.insertId, name });

      return res.status(201).json({
        success: true,
        message: 'Plan created successfully',
        data: { id: result.insertId }
      });
    } catch (error) {
      logger.error('Error creating plan', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error creating plan'
      });
    }
  }

  /**
   * Update subscription plan
   * PUT /api/superadmin/plans/:id
   */
  static async updatePlan(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Check if plan exists
      const [existingPlan] = await pool.execute(
        'SELECT * FROM subscription_plans WHERE id = ?',
        [id]
      );

      if (existingPlan.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Plan not found'
        });
      }

      // Check free plan constraint
      if (updates.is_free && !existingPlan[0].is_free) {
        const [freePlans] = await pool.execute(
          'SELECT id FROM subscription_plans WHERE is_free = TRUE AND id != ?',
          [id]
        );
        if (freePlans.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Only one free plan is allowed'
          });
        }
      }

      // Build update query
      const updateFields = [];
      const values = [];

      const allowedFields = [
        'name', 'description', 'price', 'currency', 'billing_period',
        'max_stores', 'max_users', 'max_departments', 'max_contacts', 'max_devices',
        'max_conversations', 'max_messages_per_month', 'max_faqs', 'max_contact_groups',
        'whatsapp_enabled', 'ai_enabled', 'woocommerce_enabled', 'analytics_enabled',
        'priority_support_enabled', 'api_access_enabled', 'custom_branding_enabled',
        'invoices_enabled', 'max_invoices_per_month',
        'quotes_enabled', 'max_quotes_per_month',
        'widgets_enabled', 'max_widgets',
        'payment_links_enabled', 'max_payment_links_per_month',
        'biolink_enabled', 'max_bio_pages', 'max_short_links', 'max_file_transfers',
        'max_vcards', 'max_event_links', 'max_html_pages', 'max_qr_codes',
        'is_trial', 'trial_days', 'is_free',
        'stripe_price_id', 'paypal_plan_id', 'sort_order', 'active'
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateFields.push(`${field} = ?`);
          values.push(updates[field]);
        }
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }

      values.push(id);

      await pool.execute(
        `UPDATE subscription_plans SET ${updateFields.join(', ')} WHERE id = ?`,
        values
      );

      logger.info('Plan updated', { planId: id });

      return res.json({
        success: true,
        message: 'Plan updated successfully'
      });
    } catch (error) {
      logger.error('Error updating plan', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating plan'
      });
    }
  }

  /**
   * Delete subscription plan
   * DELETE /api/superadmin/plans/:id
   */
  static async deletePlan(req, res) {
    try {
      const { id } = req.params;

      // Check if plan has active subscriptions
      const [tenants] = await pool.execute(
        'SELECT COUNT(*) as count FROM tenants WHERE plan_id = ? AND status = ?',
        [id, 'active']
      );

      if (tenants[0].count > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete plan with active subscriptions'
        });
      }

      await pool.execute('DELETE FROM subscription_plans WHERE id = ?', [id]);

      logger.info('Plan deleted', { planId: id });

      return res.json({
        success: true,
        message: 'Plan deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting plan', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error deleting plan'
      });
    }
  }

  /**
   * Toggle plan status
   * PUT /api/superadmin/plans/:id/toggle-status
   */
  static async togglePlanStatus(req, res) {
    try {
      const { id } = req.params;

      const [plan] = await pool.execute(
        'SELECT active FROM subscription_plans WHERE id = ?',
        [id]
      );

      if (plan.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Plan not found'
        });
      }

      const newStatus = !plan[0].active;

      await pool.execute(
        'UPDATE subscription_plans SET active = ? WHERE id = ?',
        [newStatus, id]
      );

      logger.info('Plan status toggled', { planId: id, newStatus });

      return res.json({
        success: true,
        message: `Plan ${newStatus ? 'activated' : 'deactivated'} successfully`,
        data: { active: newStatus }
      });
    } catch (error) {
      logger.error('Error toggling plan status', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating plan status'
      });
    }
  }
}

module.exports = SuperAdminPlanController;
