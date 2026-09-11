/**
 * Plan Limits Middleware
 * Validates tenant resource limits based on their subscription plan
 * 
 * @module middleware/planLimits
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

/**
 * Get tenant plan limits
 * @param {number} tenantId - Tenant ID
 * @returns {Promise<Object>} Plan limits
 */
async function getTenantPlanLimits(tenantId) {
  const [result] = await pool.execute(
    `SELECT 
      t.id as tenant_id,
      t.plan_id,
      t.settings,
      COALESCE(t.max_stores, sp.max_stores) as max_stores,
      COALESCE(t.max_users, sp.max_users) as max_users,
      COALESCE(t.max_departments, sp.max_departments) as max_departments,
      COALESCE(t.max_contacts, sp.max_contacts) as max_contacts,
      COALESCE(t.max_devices, sp.max_devices) as max_devices,
      COALESCE(t.max_conversations, sp.max_conversations) as max_conversations,
      COALESCE(t.max_messages_per_month, sp.max_messages_per_month) as max_messages_per_month,
      COALESCE(t.max_faqs, sp.max_faqs, 10) as max_faqs,
      COALESCE(sp.max_contact_groups, 50) as max_contact_groups,
      COALESCE(sp.invoices_enabled, FALSE) as plan_invoices_enabled,
      COALESCE(t.max_invoices_per_month, sp.max_invoices_per_month, 0) as max_invoices_per_month,
      COALESCE(sp.quotes_enabled, FALSE) as plan_quotes_enabled,
      COALESCE(t.max_quotes_per_month, sp.max_quotes_per_month, 0) as max_quotes_per_month,
      COALESCE(sp.widgets_enabled, FALSE) as plan_widgets_enabled,
      COALESCE(t.max_widgets, sp.max_widgets, 0) as max_widgets,
      COALESCE(sp.payment_links_enabled, FALSE) as plan_payment_links_enabled,
      COALESCE(sp.api_access_enabled, FALSE) as plan_api_access_enabled,
      COALESCE(t.max_payment_links_per_month, sp.max_payment_links_per_month, 0) as max_payment_links_per_month,
      COALESCE(sp.ai_enabled, FALSE) as plan_ai_enabled,
      COALESCE(sp.woocommerce_enabled, FALSE) as plan_woocommerce_enabled
    FROM tenants t
    LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
    WHERE t.id = ?`,
    [tenantId]
  );

  if (result.length === 0) {
    throw new Error('Tenant not found');
  }

  const row = result[0];
  
  // Parse tenant settings to check for addon-enabled features
  const normalizeBool = (value) => value === true || value === 1 || value === '1' || value === 'true';
  let tenantSettings = {};
  if (row.settings) {
    try {
      if (Buffer.isBuffer(row.settings)) {
        tenantSettings = JSON.parse(row.settings.toString('utf8'));
      } else if (typeof row.settings === 'string') {
        tenantSettings = JSON.parse(row.settings);
      } else {
        tenantSettings = row.settings;
      }
    } catch (e) {
      logger.warn('Failed to parse tenant settings', { tenantId, error: e.message });
    }
  }

  // Log for debugging
  logger.debug('Tenant plan limits check', {
    tenantId,
    planWidgetsEnabled: row.plan_widgets_enabled,
    tenantSettingsWidgetsEnabled: tenantSettings.widgets_enabled,
    maxWidgets: row.max_widgets,
    rawSettings: row.settings
  });

  // Features are enabled if either the plan has them OR the tenant has them via addons
  // Also check if max_widgets > 0 as an indicator that widgets were purchased
  const widgetsEnabled = normalizeBool(row.plan_widgets_enabled) || 
    normalizeBool(tenantSettings.widgets_enabled) || 
    (row.max_widgets && row.max_widgets > 0);

  const apiAccessEnabled = normalizeBool(row.plan_api_access_enabled) || 
    normalizeBool(tenantSettings.api_access_enabled) ||
    normalizeBool(tenantSettings.api_access) ||
    normalizeBool(tenantSettings.api_feature);

  return {
    tenant_id: row.tenant_id,
    plan_id: row.plan_id,
    max_stores: row.max_stores,
    max_users: row.max_users,
    max_departments: row.max_departments,
    max_contacts: row.max_contacts,
    max_devices: row.max_devices,
    max_conversations: row.max_conversations,
    max_messages_per_month: row.max_messages_per_month,
    max_faqs: row.max_faqs,
    max_contact_groups: row.max_contact_groups,
    max_invoices_per_month: row.max_invoices_per_month,
    max_quotes_per_month: row.max_quotes_per_month,
    max_widgets: row.max_widgets,
    max_payment_links_per_month: row.max_payment_links_per_month,
    // Features: enabled if plan has it OR tenant has it via addon OR has limit > 0
    invoices_enabled: normalizeBool(row.plan_invoices_enabled) || normalizeBool(tenantSettings.invoices_enabled) || (row.max_invoices_per_month && row.max_invoices_per_month > 0),
    quotes_enabled: normalizeBool(row.plan_quotes_enabled) || normalizeBool(tenantSettings.quotes_enabled) || (row.max_quotes_per_month && row.max_quotes_per_month > 0),
    widgets_enabled: widgetsEnabled,
    payment_links_enabled: normalizeBool(row.plan_payment_links_enabled) || normalizeBool(tenantSettings.payment_links_enabled) || (row.max_payment_links_per_month && row.max_payment_links_per_month > 0),
    api_access_enabled: apiAccessEnabled,
    ai_enabled: normalizeBool(row.plan_ai_enabled) || normalizeBool(tenantSettings.ai_enabled),
    woocommerce_enabled: normalizeBool(row.plan_woocommerce_enabled) || normalizeBool(tenantSettings.woocommerce_enabled)
  };
}

/**
 * Get current resource count for tenant
 * @param {number} tenantId - Tenant ID
 * @param {string} resourceType - Type of resource (stores, users, departments, etc.)
 * @returns {Promise<number>} Current count
 */
async function getCurrentResourceCount(tenantId, resourceType) {
  let query;
  
  switch (resourceType) {
    case 'stores':
      query = 'SELECT COUNT(*) as count FROM stores WHERE tenant_id = ?';
      break;
    case 'users':
      query = 'SELECT COUNT(*) as count FROM users WHERE tenant_id = ?';
      break;
    case 'departments':
      query = 'SELECT COUNT(*) as count FROM departments WHERE tenant_id = ?';
      break;
    case 'contacts':
      query = 'SELECT COUNT(*) as count FROM contacts WHERE tenant_id = ?';
      break;
    case 'devices':
      query = 'SELECT COUNT(*) as count FROM whatsapp_sessions WHERE tenant_id = ?';
      break;
    case 'conversations':
      query = 'SELECT COUNT(*) as count FROM conversations WHERE tenant_id = ?';
      break;
    case 'faqs':
      query = 'SELECT COUNT(*) as count FROM faqs WHERE tenant_id = ?';
      break;
    case 'contact_groups':
      query = 'SELECT COUNT(*) as count FROM contact_groups WHERE tenant_id = ?';
      break;
    case 'invoices':
      query = `SELECT COUNT(*) as count FROM invoices 
               WHERE tenant_id = ? 
               AND type = 'invoice'
               AND MONTH(created_at) = MONTH(CURRENT_DATE())
               AND YEAR(created_at) = YEAR(CURRENT_DATE())`;
      break;
    case 'quotes':
      query = `SELECT COUNT(*) as count FROM invoices 
               WHERE tenant_id = ? 
               AND type = 'quote'
               AND MONTH(created_at) = MONTH(CURRENT_DATE())
               AND YEAR(created_at) = YEAR(CURRENT_DATE())`;
      break;
    case 'widgets':
      query = 'SELECT COUNT(*) as count FROM chat_widgets WHERE tenant_id = ?';
      break;
    case 'payment_links':
      query = `SELECT COUNT(*) as count FROM payment_links 
               WHERE tenant_id = ? 
               AND MONTH(created_at) = MONTH(CURRENT_DATE())
               AND YEAR(created_at) = YEAR(CURRENT_DATE())`;
      break;
    default:
      throw new Error(`Unknown resource type: ${resourceType}`);
  }

  const [result] = await pool.execute(query, [tenantId]);
  return result[0].count;
}

/**
 * Check if tenant can create a new resource
 * @param {string} resourceType - Type of resource to check
 * @returns {Function} Express middleware
 */
function checkResourceLimit(resourceType) {
  return async (req, res, next) => {
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
      
      // Get current count
      const currentCount = await getCurrentResourceCount(tenantId, resourceType);

      // Determine the limit field name
      const limitField = `max_${resourceType}`;
      const maxAllowed = limits[limitField];

      logger.info('Checking resource limit', {
        tenantId,
        resourceType,
        currentCount,
        maxAllowed,
        limitField
      });

      // Check if limit is reached (-1 means unlimited)
      if (maxAllowed !== -1 && currentCount >= maxAllowed) {
        logger.warn(`Resource limit reached for tenant ${tenantId}`, {
          resourceType,
          currentCount,
          maxAllowed,
          planId: limits.plan_id
        });

        return res.status(403).json({
          success: false,
          error: 'RESOURCE_LIMIT_REACHED',
          message: `Your plan allows a maximum of ${maxAllowed} ${resourceType}. You currently have ${currentCount}. Please upgrade your plan to create more.`,
          limit: {
            resource: resourceType,
            current: currentCount,
            max: maxAllowed
          }
        });
      }

      // Attach limits to request for reference
      req.planLimits = limits;
      req.currentResourceCount = currentCount;

      next();
    } catch (error) {
      logger.error('Error checking resource limit', { 
        error: error.message,
        resourceType,
        tenantId: req.tenantId
      });
      
      // Block the request on error for security
      return res.status(500).json({
        success: false,
        error: 'Error checking resource limits',
        message: 'Unable to verify plan limits. Please try again.'
      });
    }
  };
}

/**
 * Check if a feature is enabled for tenant's plan
 * @param {string} featureName - Name of the feature to check
 * @returns {Function} Express middleware
 */
function checkFeatureEnabled(featureName) {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenantId || req.user?.tenantId;

      logger.info(`checkFeatureEnabled: Checking feature "${featureName}" for tenant ${tenantId}`);

      if (!tenantId) {
        logger.warn('checkFeatureEnabled: No tenant ID found');
        return res.status(400).json({
          success: false,
          error: 'Tenant context is required'
        });
      }

      const limits = await getTenantPlanLimits(tenantId);
      const featureField = `${featureName}_enabled`;

      logger.info(`checkFeatureEnabled: Feature field "${featureField}" = ${limits[featureField]}`, {
        tenantId,
        featureName,
        featureField,
        featureEnabled: limits[featureField],
        maxWidgets: limits.max_widgets
      });

      if (!limits[featureField]) {
        logger.warn(`Feature not enabled for tenant ${tenantId}`, {
          feature: featureName,
          planId: limits.plan_id,
          featureField,
          featureValue: limits[featureField]
        });

        return res.status(403).json({
          success: false,
          error: 'FEATURE_NOT_ENABLED',
          message: `The feature "${featureName}" is not available in your current plan. Please upgrade to access this feature.`,
          feature: featureName
        });
      }

      req.planLimits = limits;
      next();
    } catch (error) {
      logger.error('Error checking feature', { 
        error: error.message,
        feature: featureName,
        tenantId: req.tenantId
      });
      
      // Don't block the request on error, just log it
      next();
    }
  };
}

/**
 * Middleware to get and attach plan limits to request
 * Useful for displaying current usage in UI
 */
async function attachPlanLimits(req, res, next) {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;

    if (!tenantId) {
      return next();
    }

    const limits = await getTenantPlanLimits(tenantId);
    req.planLimits = limits;

    next();
  } catch (error) {
    logger.error('Error attaching plan limits', { 
      error: error.message,
      tenantId: req.tenantId
    });
    next();
  }
}

module.exports = {
  checkResourceLimit,
  checkFeatureEnabled,
  attachPlanLimits,
  getTenantPlanLimits,
  getCurrentResourceCount
};
