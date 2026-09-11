/**
 * Store Model
 * 
 * Represents a store/branch within a tenant
 * Each tenant can have multiple stores
 * 
 * @module models/Store
 */

const { pool } = require('../config/database');

class Store {
  /**
   * Get all stores for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Array>} List of stores
   */
  static async findByTenant(tenantId) {
    const [rows] = await pool.execute(
      `SELECT s.*
       FROM stores s
       WHERE s.tenant_id = ?
       ORDER BY s.name ASC`,
      [tenantId]
    );
    return rows;
  }

  /**
   * Get store by ID
   * @param {number} id - Store ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object|null>} Store object or null
   */
  static async findById(id, tenantId) {
    const [rows] = await pool.execute(
      `SELECT s.*
       FROM stores s
       WHERE s.id = ? AND s.tenant_id = ?`,
      [id, tenantId]
    );
    return rows[0] || null;
  }

  /**
   * Create new store
   * @param {Object} data - Store data
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Created store
   */
  static async create(data, tenantId) {
    const { name, description, address, phone, email } = data;
    
    const [result] = await pool.execute(
      `INSERT INTO stores (tenant_id, name, description, address, phone, email)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, name, description || null, address || null, phone || null, email || null]
    );

    return this.findById(result.insertId, tenantId);
  }

  /**
   * Update store
   * @param {number} id - Store ID
   * @param {Object} data - Store data
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Updated store
   */
  static async update(id, data, tenantId) {
    const { name, description, address, phone, email } = data;
    
    await pool.execute(
      `UPDATE stores 
       SET name = ?, description = ?, address = ?, phone = ?, email = ?
       WHERE id = ? AND tenant_id = ?`,
      [name, description || null, address || null, phone || null, email || null, id, tenantId]
    );

    return this.findById(id, tenantId);
  }

  /**
   * Delete store
   * @param {number} id - Store ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id, tenantId) {
    // Check if store has users (store is VARCHAR in users table)
    const store = await this.findById(id, tenantId);
    if (store) {
      const [users] = await pool.execute(
        'SELECT COUNT(*) as count FROM users WHERE store = ? AND tenant_id = ?',
        [store.name, tenantId]
      );
      if (users[0].count > 0) {
        throw new Error('Cannot delete store with assigned users');
      }
    }

    const [result] = await pool.execute(
      'DELETE FROM stores WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Check if store name exists for tenant
   * @param {string} name - Store name
   * @param {number} tenantId - Tenant ID
   * @param {number} excludeId - Store ID to exclude from check
   * @returns {Promise<boolean>} True if exists
   */
  static async nameExists(name, tenantId, excludeId = null) {
    let query = 'SELECT id FROM stores WHERE name = ? AND tenant_id = ?';
    const params = [name, tenantId];

    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }

    const [rows] = await pool.execute(query, params);
    return rows.length > 0;
  }
}

module.exports = Store;
