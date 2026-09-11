/**
 * Store Controller
 * Handles store management for tenants
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class StoreController {
  /**
   * Get all stores for tenant
   * GET /api/tenant/stores
   */
  static async getStores(req, res) {
    try {
      console.log('=== GET STORES START ===');
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;
      console.log('TenantID:', tenantId);
      console.log('req.tenantId:', req.tenantId);
      console.log('req.user:', req.user);
      
      if (!tenantId) {
        console.log('NO TENANT ID FOUND!');
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }

      console.log('Executing query for tenant:', tenantId);
      const [stores] = await pool.execute(
        'SELECT id, tenant_id, name FROM stores WHERE tenant_id = ? ORDER BY name ASC',
        [tenantId]
      );

      console.log('Stores found:', stores.length);
      logger.info(`Stores listed for tenant ${tenantId}`, { count: stores.length });
      
      res.json({
        success: true,
        data: stores
      });
    } catch (error) {
      console.error('=== ERROR IN GET STORES ===');
      console.error('Error:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      logger.error('Error listing stores', { error: error.message });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Get single store
   * GET /api/tenant/stores/:id
   */
  static async getStore(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;
      const { id } = req.params;

      if (!tenantId) {
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }

      const [stores] = await pool.execute(
        'SELECT id, tenant_id, name FROM stores WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (stores.length === 0) {
        return res.status(404).json({ success: false, message: 'Store not found' });
      }

      res.json({
        success: true,
        data: stores[0]
      });
    } catch (error) {
      logger.error('Error getting store', { error: error.message });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Create new store
   * POST /api/tenant/stores
   * NOTE: This method should be called AFTER checkResourceLimit('stores') middleware
   */
  static async createStore(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;
      const { name } = req.body;

      if (!tenantId) {
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }

      if (!name) {
        return res.status(400).json({ success: false, message: 'Store name is required' });
      }

      // Check if name exists
      const [existing] = await pool.execute(
        'SELECT id FROM stores WHERE name = ? AND tenant_id = ?',
        [name, tenantId]
      );

      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: 'Store name already exists' });
      }

      // Create store (limit already checked by middleware)
      const [result] = await pool.execute(
        'INSERT INTO stores (tenant_id, name) VALUES (?, ?)',
        [tenantId, name]
      );

      // Get created store
      const [stores] = await pool.execute(
        'SELECT id, tenant_id, name FROM stores WHERE id = ?',
        [result.insertId]
      );

      logger.info(`Store created for tenant ${tenantId}`, { storeId: result.insertId, name });

      res.status(201).json({
        success: true,
        message: 'Store created successfully',
        data: stores[0]
      });
    } catch (error) {
      logger.error('Error creating store', { error: error.message });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Update store
   * PUT /api/tenant/stores/:id
   */
  static async updateStore(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;
      const { id } = req.params;
      const { name } = req.body;

      if (!tenantId) {
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }

      if (!name) {
        return res.status(400).json({ success: false, message: 'Store name is required' });
      }

      // Check if store exists
      const [existing] = await pool.execute(
        'SELECT id FROM stores WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: 'Store not found' });
      }

      // Check if name exists (excluding current store)
      const [nameCheck] = await pool.execute(
        'SELECT id FROM stores WHERE name = ? AND tenant_id = ? AND id != ?',
        [name, tenantId, id]
      );

      if (nameCheck.length > 0) {
        return res.status(400).json({ success: false, message: 'Store name already exists' });
      }

      // Update store
      await pool.execute(
        'UPDATE stores SET name = ? WHERE id = ? AND tenant_id = ?',
        [name, id, tenantId]
      );

      // Get updated store
      const [stores] = await pool.execute(
        'SELECT id, tenant_id, name FROM stores WHERE id = ?',
        [id]
      );

      logger.info(`Store updated for tenant ${tenantId}`, { storeId: id, name });

      res.json({
        success: true,
        message: 'Store updated successfully',
        data: stores[0]
      });
    } catch (error) {
      logger.error('Error updating store', { error: error.message });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Delete store
   * DELETE /api/tenant/stores/:id
   */
  static async deleteStore(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;
      const { id } = req.params;

      if (!tenantId) {
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }

      // Check if store exists
      const [stores] = await pool.execute(
        'SELECT name FROM stores WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (stores.length === 0) {
        return res.status(404).json({ success: false, message: 'Store not found' });
      }

      // Check if store has users
      const [users] = await pool.execute(
        'SELECT COUNT(*) as count FROM users WHERE store = ? AND tenant_id = ?',
        [stores[0].name, tenantId]
      );

      if (users[0].count > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot delete store with assigned users' 
        });
      }

      // Delete store
      await pool.execute(
        'DELETE FROM stores WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      logger.info(`Store deleted for tenant ${tenantId}`, { storeId: id });

      res.json({
        success: true,
        message: 'Store deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting store', { error: error.message });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

module.exports = StoreController;
