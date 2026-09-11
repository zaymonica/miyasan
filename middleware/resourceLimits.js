/**
 * Resource Limits Middleware
 * Validates if tenant can create more resources based on their plan limits
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

/**
 * Check if tenant has reached resource limit
 * @param {string} resourceType - Type of resource (stores, users, departments, contacts, conversations, devices)
 */
const checkResourceLimit = (resourceType) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      // Get tenant limits
      const [tenants] = await pool.execute(
        'SELECT * FROM tenants WHERE id = ?',
        [tenantId]
      );

      if (tenants.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Tenant not found'
        });
      }

      const tenant = tenants[0];

      // Map resource types to limit columns and table names
      const resourceConfig = {
        stores: {
          limitColumn: 'max_stores',
          table: 'stores',
          name: 'stores'
        },
        users: {
          limitColumn: 'max_users',
          table: 'users',
          name: 'users'
        },
        departments: {
          limitColumn: 'max_departments',
          table: 'departments',
          name: 'departments'
        },
        contacts: {
          limitColumn: 'max_contacts',
          table: 'contacts',
          name: 'contacts'
        },
        conversations: {
          limitColumn: 'max_conversations',
          table: 'conversations',
          name: 'conversations'
        },
        devices: {
          limitColumn: 'max_devices',
          table: 'devices',
          name: 'devices'
        }
      };

      const config = resourceConfig[resourceType];

      if (!config) {
        logger.error('Invalid resource type', { resourceType });
        return res.status(400).json({
          success: false,
          message: 'Invalid resource type'
        });
      }

      const limit = tenant[config.limitColumn];

      // If limit is -1 or null, it's unlimited
      if (limit === -1 || limit === null) {
        return next();
      }

      // Check current usage
      const [result] = await pool.execute(
        `SELECT COUNT(*) as count FROM ${config.table} WHERE tenant_id = ?`,
        [tenantId]
      );

      const currentCount = result[0].count;

      if (currentCount >= limit) {
        logger.warn('Resource limit reached', {
          tenantId,
          resourceType,
          currentCount,
          limit
        });

        return res.status(403).json({
          success: false,
          message: `You have reached the maximum number of ${config.name} (${limit}) allowed by your plan. Please upgrade your plan to add more.`,
          error: 'RESOURCE_LIMIT_REACHED',
          data: {
            resource: resourceType,
            current: currentCount,
            limit: limit
          }
        });
      }

      // Add limit info to request for reference
      req.resourceLimit = {
        resource: resourceType,
        current: currentCount,
        limit: limit,
        remaining: limit - currentCount
      };

      next();
    } catch (error) {
      logger.error('Error checking resource limit', {
        error: error.message,
        resourceType
      });
      return res.status(500).json({
        success: false,
        message: 'Error checking resource limits'
      });
    }
  };
};

/**
 * Check if feature is enabled for tenant's plan
 * @param {string} featureName - Name of the feature (whatsapp_enabled, ai_enabled, etc.)
 */
const checkFeatureEnabled = (featureName) => {
  return async (req, res, next) => {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      // Get tenant plan features
      const [tenants] = await pool.execute(
        `SELECT t.*, sp.${featureName}
         FROM tenants t
         LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
         WHERE t.id = ?`,
        [tenantId]
      );

      if (tenants.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Tenant not found'
        });
      }

      const tenant = tenants[0];
      const isEnabled = tenant[featureName];

      if (!isEnabled) {
        logger.warn('Feature not enabled for tenant', {
          tenantId,
          featureName
        });

        return res.status(403).json({
          success: false,
          message: `This feature is not available in your current plan. Please upgrade to access ${featureName.replace('_enabled', '').replace('_', ' ')}.`,
          error: 'FEATURE_NOT_ENABLED',
          data: {
            feature: featureName
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Error checking feature access', {
        error: error.message,
        featureName
      });
      return res.status(500).json({
        success: false,
        message: 'Error checking feature access'
      });
    }
  };
};

module.exports = {
  checkResourceLimit,
  checkFeatureEnabled
};
