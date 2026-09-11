/**
 * Tenant Middleware
 * Multi-tenant context extraction and validation
 * 
 * @module middleware/tenant
 */

const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const GracePeriodService = require('../services/GracePeriodService');

/**
 * Extract tenant context from request
 * Supports multiple methods: JWT token, header
 */
async function tenantMiddleware(req, res, next) {
  try {
    let tenantId = null;
    let tenantInfo = null;

    // Method 1: Extract from JWT token (most common for API requests)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        tenantId = decoded.tenantId;
        req.user = decoded;
      } catch (error) {
        // Token invalid, will be handled by auth middleware
      }
    }

    // Method 2: Extract from X-Tenant-ID header
    if (!tenantId && req.headers['x-tenant-id']) {
      tenantId = parseInt(req.headers['x-tenant-id']);
    }

    // If tenant ID found, validate and attach to request
    if (tenantId) {
      if (!tenantInfo) {
        const [tenants] = await pool.execute(
          'SELECT id, name, subdomain, status, max_users, max_conversations, max_messages_per_month, subscription_end_date, grace_period_end FROM tenants WHERE id = ?',
          [tenantId]
        );
        
        if (tenants.length > 0) {
          tenantInfo = tenants[0];
        }
      }

      // Check tenant status with grace period support
      if (tenantInfo) {
        // Check if tenant should have access (includes grace period check)
        const hasAccess = await GracePeriodService.shouldAllowAccess(tenantInfo);
        
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            error: 'Tenant account is suspended or cancelled',
          });
        }

        req.tenantId = tenantId;
        // Return display-friendly tenant info (hides grace_period details)
        req.tenant = GracePeriodService.getDisplayStatus(tenantInfo);
        logger.debug(`Tenant context set: ${tenantId} (${tenantInfo.name})`);
      }
    }

    next();
  } catch (error) {
    logger.error('Error in tenant middleware', { error: error.message });
    next(error);
  }
}

/**
 * Require tenant context
 * Ensures tenant ID is present in request
 */
function requireTenant(req, res, next) {
  if (!req.tenantId) {
    return res.status(400).json({
      success: false,
      error: 'Tenant context is required',
    });
  }
  next();
}

/**
 * Check tenant limits
 * Validates if tenant has not exceeded their plan limits
 */
async function checkTenantLimits(limitType) {
  return async (req, res, next) => {
    try {
      if (!req.tenantId) {
        return next();
      }

      const [tenants] = await pool.execute(
        'SELECT * FROM tenants WHERE id = ?',
        [req.tenantId]
      );

      if (tenants.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Tenant not found',
        });
      }

      const tenant = tenants[0];

      // Check specific limit
      switch (limitType) {
        case 'users':
          const [userCount] = await pool.execute(
            'SELECT COUNT(*) as count FROM users WHERE tenant_id = ?',
            [req.tenantId]
          );
          if (userCount[0].count >= tenant.max_users) {
            return res.status(403).json({
              success: false,
              error: 'User limit reached for your plan',
            });
          }
          break;

        case 'conversations':
          const [convCount] = await pool.execute(
            'SELECT COUNT(*) as count FROM conversations WHERE tenant_id = ?',
            [req.tenantId]
          );
          if (convCount[0].count >= tenant.max_conversations) {
            return res.status(403).json({
              success: false,
              error: 'Conversation limit reached for your plan',
            });
          }
          break;

        case 'messages':
          if (tenant.current_messages_count >= tenant.max_messages_per_month) {
            return res.status(403).json({
              success: false,
              error: 'Monthly message limit reached for your plan',
            });
          }
          break;
      }

      next();
    } catch (error) {
      logger.error('Error checking tenant limits', { error: error.message });
      next(error);
    }
  };
}

module.exports = {
  tenantMiddleware,
  requireTenant,
  checkTenantLimits,
};
