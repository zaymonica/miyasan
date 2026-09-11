/**
 * Department Model
 * 
 * Represents a department/sector within a tenant
 * Each tenant can have multiple departments
 * 
 * @module models/Department
 */

const { pool } = require('../config/database');

class Department {
  /**
   * Get all departments for a tenant
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Array>} List of departments
   */
  static async findByTenant(tenantId) {
    const [rows] = await pool.execute(
      `SELECT d.*, 
        d.created_at,
        d.updated_at
       FROM departments d
       WHERE d.tenant_id = ?
       ORDER BY d.name ASC`,
      [tenantId]
    );
    return rows;
  }

  /**
   * Get department by ID
   * @param {number} id - Department ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object|null>} Department object or null
   */
  static async findById(id, tenantId) {
    const [rows] = await pool.execute(
      `SELECT d.*
       FROM departments d
       WHERE d.id = ? AND d.tenant_id = ?`,
      [id, tenantId]
    );
    return rows[0] || null;
  }

  /**
   * Create new department
   * @param {Object} data - Department data
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Created department
   */
  static async create(data, tenantId) {
    const { name, description } = data;
    
    const [result] = await pool.execute(
      `INSERT INTO departments (tenant_id, name, description, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [tenantId, name, description || null]
    );

    return this.findById(result.insertId, tenantId);
  }

  /**
   * Update department
   * @param {number} id - Department ID
   * @param {Object} data - Department data
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Updated department
   */
  static async update(id, data, tenantId) {
    const { name, description } = data;
    
    await pool.execute(
      `UPDATE departments 
       SET name = ?, description = ?, updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [name, description || null, id, tenantId]
    );

    return this.findById(id, tenantId);
  }

  /**
   * Delete department
   * @param {number} id - Department ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id, tenantId) {
    // Check if department has users (department is VARCHAR in users table)
    const department = await this.findById(id, tenantId);
    if (department) {
      const [users] = await pool.execute(
        'SELECT COUNT(*) as count FROM users WHERE department = ? AND tenant_id = ?',
        [department.name, tenantId]
      );
      if (users[0].count > 0) {
        throw new Error('Cannot delete department with assigned users');
      }
    }

    const [result] = await pool.execute(
      'DELETE FROM departments WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Check if department name exists for tenant
   * @param {string} name - Department name
   * @param {number} tenantId - Tenant ID
   * @param {number} excludeId - Department ID to exclude from check
   * @returns {Promise<boolean>} True if exists
   */
  static async nameExists(name, tenantId, excludeId = null) {
    let query = 'SELECT id FROM departments WHERE name = ? AND tenant_id = ?';
    const params = [name, tenantId];

    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }

    const [rows] = await pool.execute(query, params);
    return rows.length > 0;
  }
}

module.exports = Department;
