/**
 * Addon Check Middleware
 * Verifies if a system addon is installed and active before allowing access
 * 
 * @module middleware/addonCheck
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

/**
 * Cache for addon status to avoid repeated database queries
 * Cache expires after 60 seconds
 */
const addonCache = new Map();
const CACHE_TTL = 60000; // 60 seconds

/**
 * Check if a system addon is installed and active
 * @param {string} addonSlug - The slug of the addon to check
 * @returns {Promise<{installed: boolean, active: boolean}>}
 */
async function checkAddonStatus(addonSlug) {
  const cacheKey = `addon_${addonSlug}`;
  const cached = addonCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.status;
  }

  try {
    const [addons] = await pool.execute(
      'SELECT id, active FROM system_addons WHERE slug = ?',
      [addonSlug]
    );

    const status = {
      installed: addons.length > 0,
      active: addons.length > 0 && (addons[0].active === 1 || addons[0].active === true)
    };

    addonCache.set(cacheKey, { status, timestamp: Date.now() });
    return status;
  } catch (error) {
    logger.error('Error checking addon status', { addonSlug, error: error.message });
    // If table doesn't exist, addon system is not set up
    return { installed: false, active: false };
  }
}

/**
 * Clear addon cache (useful when addon status changes)
 * @param {string} [addonSlug] - Optional specific addon to clear, or all if not provided
 */
function clearAddonCache(addonSlug) {
  if (addonSlug) {
    addonCache.delete(`addon_${addonSlug}`);
  } else {
    addonCache.clear();
  }
}

/**
 * Middleware factory to require a specific addon to be active
 * @param {string} addonSlug - The slug of the required addon
 * @returns {Function} Express middleware
 */
function requireAddon(addonSlug) {
  return async (req, res, next) => {
    try {
      const status = await checkAddonStatus(addonSlug);

      if (!status.installed) {
        return res.status(403).json({
          success: false,
          message: `The ${addonSlug} addon is not installed. Please contact your administrator.`,
          error: 'ADDON_NOT_INSTALLED',
          addon: addonSlug
        });
      }

      if (!status.active) {
        return res.status(403).json({
          success: false,
          message: `The ${addonSlug} addon is not active. Please contact your administrator.`,
          error: 'ADDON_NOT_ACTIVE',
          addon: addonSlug
        });
      }

      // Addon is installed and active, proceed
      next();
    } catch (error) {
      logger.error('Error in requireAddon middleware', { addonSlug, error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error checking addon status'
      });
    }
  };
}

/**
 * Get all active addons
 * @returns {Promise<Array>} List of active addons
 */
async function getActiveAddons() {
  try {
    const [addons] = await pool.execute(
      'SELECT slug, name, icon, config FROM system_addons WHERE active = 1'
    );
    return addons;
  } catch (error) {
    logger.error('Error getting active addons', { error: error.message });
    return [];
  }
}

module.exports = {
  checkAddonStatus,
  clearAddonCache,
  requireAddon,
  getActiveAddons
};
