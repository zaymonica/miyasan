/**
 * Plan Limits Controller
 * Provides information about tenant plan limits and current usage
 * 
 * @module controllers/PlanLimitsController
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const { getTenantPlanLimits, getCurrentResourceCount } = require('../middleware/planLimits');

class PlanLimitsController {
  /**
   * Get tenant plan limits and current usage
   * GET /api/tenant/plan-limits
   */
  static async getLimits(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant context is required'
        });
      }

      // Get plan limits
      const limits = await getTenantPlanLimits(tenantId);

      // Get current usage for all resources
      const resources = [
        'stores',
        'users',
        'departments',
        'contacts',
        'devices',
        'conversations',
        'faqs',
        'contact_groups'
      ];

      const usage = {};
      for (const resource of resources) {
        try {
          usage[resource] = await getCurrentResourceCount(tenantId, resource);
        } catch (error) {
          logger.warn(`Could not get count for ${resource}`, { error: error.message });
          usage[resource] = 0;
        }
      }

      // Get plan name
      let planName = 'Plano Personalizado';
      if (limits.plan_id) {
        const [plans] = await pool.execute(
          'SELECT name FROM subscription_plans WHERE id = ?',
          [limits.plan_id]
        );
        if (plans.length > 0) {
          planName = plans[0].name;
        }
      }

      // Calculate percentages
      const percentages = {};
      for (const resource of resources) {
        const limitField = `max_${resource}`;
        const max = limits[limitField] || 0;
        const current = usage[resource] || 0;
        percentages[resource] = max > 0 ? Math.round((current / max) * 100) : 0;
      }

      return res.json({
        success: true,
        data: {
          plan: {
            id: limits.plan_id,
            name: planName
          },
          limits: {
            stores: limits.max_stores,
            users: limits.max_users,
            departments: limits.max_departments,
            contacts: limits.max_contacts,
            devices: limits.max_devices,
            conversations: limits.max_conversations,
            messages_per_month: limits.max_messages_per_month,
            faqs: limits.max_faqs,
            contact_groups: limits.max_contact_groups,
            invoices_per_month: limits.max_invoices_per_month,
            quotes_per_month: limits.max_quotes_per_month,
            widgets: limits.max_widgets,
            payment_links_per_month: limits.max_payment_links_per_month
          },
          usage,
          percentages,
          features: {
            invoices: limits.invoices_enabled,
            quotes: limits.quotes_enabled,
            widgets: limits.widgets_enabled,
            payment_links: limits.payment_links_enabled,
            ai: limits.ai_enabled,
            woocommerce: limits.woocommerce_enabled
          }
        }
      });
    } catch (error) {
      logger.error('Error getting plan limits', { 
        error: error.message,
        tenantId: req.tenantId
      });
      
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar limites do plano',
        message: error.message
      });
    }
  }

  /**
   * Get feature status with addon availability and admin contact
   * GET /api/tenant/feature-status/:feature
   */
  static async getFeatureStatus(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { feature } = req.params;

      logger.info('getFeatureStatus called', { tenantId, feature });

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant context is required'
        });
      }

      const validFeatures = ['ai', 'woocommerce', 'mass_send', 'payments', 'invoices', 'quotes', 'widgets', 'payment_links', 'api_access'];
      if (!validFeatures.includes(feature)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid feature'
        });
      }

      // Get plan limits
      let limits;
      try {
        limits = await getTenantPlanLimits(tenantId);
      } catch (limitsError) {
        logger.error('Error getting tenant plan limits', { error: limitsError.message, tenantId });
        // Return default disabled state if we can't get limits
        return res.json({
          success: true,
          data: {
            feature,
            enabled: false,
            canPurchase: false,
            addon: null,
            adminContact: {}
          }
        });
      }
      
      // Map feature names to enabled fields
      const featureMap = {
        ai: 'ai_enabled',
        woocommerce: 'woocommerce_enabled',
        mass_send: 'ai_enabled', // mass_send uses AI feature flag
        payments: 'payment_links_enabled',
        invoices: 'invoices_enabled',
        quotes: 'quotes_enabled',
        widgets: 'widgets_enabled',
        payment_links: 'payment_links_enabled',
        api_access: 'api_access_enabled'
      };

      const featureField = featureMap[feature];
      const isEnabled = limits[featureField] || false;

      logger.info('Feature status check', { feature, featureField, isEnabled, limits: JSON.stringify(limits) });

      // If feature is enabled, return success
      if (isEnabled) {
        return res.json({
          success: true,
          data: {
            feature,
            enabled: true
          }
        });
      }

      // Feature is disabled - check if addon is available for purchase
      // Map feature names to resource_key in plan_addons table
      const featureToResourceKey = {
        ai: 'ai',
        woocommerce: 'woocommerce',
        mass_send: 'mass_send',
        payments: 'payment_links',
        invoices: 'invoices',
        quotes: 'invoices',
        widgets: 'widgets',
        payment_links: 'payment_links',
        api_access: null
      };

      const resourceKey = featureToResourceKey[feature];

      let addonAvailable = false;
      let addon = null;
      if (resourceKey) {
        try {
          const [addons] = await pool.execute(
            `SELECT id, resource_name as name, unit_price, description 
             FROM plan_addons 
             WHERE resource_key = ? AND active = TRUE 
             LIMIT 1`,
            [resourceKey]
          );
          addonAvailable = addons.length > 0;
          addon = addonAvailable ? addons[0] : null;
        } catch (addonError) {
          logger.warn('Could not check addons table', { error: addonError.message });
        }
      }

      // Get superadmin contact info from system settings (with error handling)
      const adminContact = {};
      try {
        const [settings] = await pool.execute(
          `SELECT setting_key, setting_value 
           FROM system_settings 
           WHERE setting_key IN ('support_email', 'support_phone', 'company_name')`
        );
        settings.forEach(s => {
          adminContact[s.setting_key] = s.setting_value;
        });
      } catch (settingsError) {
        logger.warn('Could not get system settings', { error: settingsError.message });
      }

      return res.json({
        success: true,
        data: {
          feature,
          enabled: false,
          canPurchase: addonAvailable,
          addon: addon ? {
            id: addon.id,
            name: addon.name,
            price: addon.unit_price,
            description: addon.description
          } : null,
          adminContact: {
            email: adminContact.support_email || null,
            phone: adminContact.support_phone || null,
            company: adminContact.company_name || null
          }
        }
      });
    } catch (error) {
      logger.error('Error getting feature status', { 
        error: error.message,
        feature: req.params.feature,
        tenantId: req.tenantId
      });
      
      return res.status(500).json({
        success: false,
        error: 'Error checking feature status',
        message: error.message
      });
    }
  }

  /**
   * Get specific resource usage
   * GET /api/tenant/plan-limits/:resource
   */
  static async getResourceUsage(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { resource } = req.params;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          error: 'Tenant context is required'
        });
      }

      const validResources = [
        'stores',
        'users',
        'departments',
        'contacts',
        'devices',
        'conversations',
        'faqs',
        'contact_groups',
        'invoices',
        'quotes',
        'widgets',
        'payment_links'
      ];

      if (!validResources.includes(resource)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid resource'
        });
      }

      // Get plan limits
      const limits = await getTenantPlanLimits(tenantId);
      const limitField = `max_${resource}`;
      const maxAllowed = limits[limitField] || 0;

      // Get current usage
      const current = await getCurrentResourceCount(tenantId, resource);
      const percentage = maxAllowed > 0 ? Math.round((current / maxAllowed) * 100) : 0;
      const remaining = Math.max(0, maxAllowed - current);

      return res.json({
        success: true,
        data: {
          resource,
          current,
          max: maxAllowed,
          remaining,
          percentage,
          canCreate: current < maxAllowed
        }
      });
    } catch (error) {
      logger.error('Error getting resource usage', { 
        error: error.message,
        resource: req.params.resource,
        tenantId: req.tenantId
      });
      
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar uso do recurso',
        message: error.message
      });
    }
  }
}

module.exports = PlanLimitsController;
