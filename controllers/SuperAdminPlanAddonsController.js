/**
 * Super Admin Plan Add-ons Controller
 * Manages add-on resources configuration
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class SuperAdminPlanAddonsController extends BaseController {
  /**
   * Get all plan add-ons
   * GET /api/superadmin/plan-addons
   */
  static async getAllAddons(req, res) {
    try {
      const [addons] = await pool.execute(
        'SELECT * FROM plan_addons ORDER BY sort_order, resource_name'
      );

      // Convert active field to boolean
      const formattedAddons = addons.map(addon => ({
        ...addon,
        active: Boolean(addon.active)
      }));

      return res.json({
        success: true,
        data: formattedAddons
      });
    } catch (error) {
      logger.error('Error getting plan add-ons', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error loading plan add-ons'
      });
    }
  }

  /**
   * Create new add-on
   * POST /api/superadmin/plan-addons
   */
  static async createAddon(req, res) {
    try {
      const {
        resource_key,
        resource_name,
        description,
        unit_price,
        currency,
        stripe_price_id,
        paypal_plan_id,
        sort_order,
        active
      } = req.body;

      // Validate required fields
      if (!resource_key || !resource_name || unit_price === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields'
        });
      }

      // Check if resource_key already exists
      const [existing] = await pool.execute(
        'SELECT id FROM plan_addons WHERE resource_key = ?',
        [resource_key]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Resource key already exists'
        });
      }

      // Create add-on
      await pool.execute(
        `INSERT INTO plan_addons 
         (resource_key, resource_name, description, unit_price, currency, 
          stripe_price_id, paypal_plan_id, sort_order, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resource_key,
          resource_name,
          description || null,
          unit_price,
          currency || 'USD',
          stripe_price_id || null,
          paypal_plan_id || null,
          sort_order || 0,
          active !== false
        ]
      );

      logger.info('Plan add-on created', { resource_key, resource_name });

      return res.json({
        success: true,
        message: 'Add-on created successfully'
      });
    } catch (error) {
      logger.error('Error creating plan add-on', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error creating add-on'
      });
    }
  }

  /**
   * Update add-on
   * PUT /api/superadmin/plan-addons/:id
   */
  static async updateAddon(req, res) {
    try {
      const { id } = req.params;
      const {
        resource_name,
        description,
        unit_price,
        currency,
        stripe_price_id,
        paypal_plan_id,
        sort_order,
        active
      } = req.body;

      // Check if add-on exists
      const [existing] = await pool.execute(
        'SELECT id FROM plan_addons WHERE id = ?',
        [id]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Add-on not found'
        });
      }

      // Update add-on
      await pool.execute(
        `UPDATE plan_addons 
         SET resource_name = ?, description = ?, unit_price = ?, currency = ?,
             stripe_price_id = ?, paypal_plan_id = ?, sort_order = ?, active = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          resource_name,
          description || null,
          unit_price,
          currency || 'USD',
          stripe_price_id || null,
          paypal_plan_id || null,
          sort_order || 0,
          active !== false,
          id
        ]
      );

      logger.info('Plan add-on updated', { id });

      return res.json({
        success: true,
        message: 'Add-on updated successfully'
      });
    } catch (error) {
      logger.error('Error updating plan add-on', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error updating add-on'
      });
    }
  }

  /**
   * Toggle add-on active status
   * PUT /api/superadmin/plan-addons/:id/toggle
   */
  static async toggleAddon(req, res) {
    try {
      const { id } = req.params;
      const { active } = req.body;

      await pool.execute(
        'UPDATE plan_addons SET active = ?, updated_at = NOW() WHERE id = ?',
        [active, id]
      );

      logger.info('Plan add-on toggled', { id, active });

      return res.json({
        success: true,
        message: `Add-on ${active ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      logger.error('Error toggling plan add-on', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error toggling add-on'
      });
    }
  }

  /**
   * Delete add-on
   * DELETE /api/superadmin/plan-addons/:id
   */
  static async deleteAddon(req, res) {
    try {
      const { id } = req.params;

      // Check if add-on is being used
      const [usage] = await pool.execute(
        'SELECT COUNT(*) as count FROM tenant_addons WHERE addon_id = ? AND status = ?',
        [id, 'active']
      );

      if (usage[0].count > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete add-on with active subscriptions'
        });
      }

      await pool.execute('DELETE FROM plan_addons WHERE id = ?', [id]);

      logger.info('Plan add-on deleted', { id });

      return res.json({
        success: true,
        message: 'Add-on deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting plan add-on', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Error deleting add-on'
      });
    }
  }
}

module.exports = SuperAdminPlanAddonsController;
