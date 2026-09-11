/**
 * Department Controller
 * Handles department management for tenants
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class DepartmentController {
  /**
   * Get all departments for tenant
   * GET /api/tenant/departments
   */
  static async getDepartments(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;
      
      if (!tenantId) {
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }

      const [departments] = await pool.execute(
        'SELECT id, tenant_id, name, description FROM departments WHERE tenant_id = ? ORDER BY name ASC',
        [tenantId]
      );

      logger.info(`Departments listed for tenant ${tenantId}`, { count: departments.length });
      
      res.json({
        success: true,
        data: departments
      });
    } catch (error) {
      logger.error('Error listing departments', { error: error.message });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Get single department
   * GET /api/tenant/departments/:id
   */
  static async getDepartment(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;
      const { id } = req.params;

      if (!tenantId) {
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }

      const [departments] = await pool.execute(
        'SELECT id, tenant_id, name, description FROM departments WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (departments.length === 0) {
        return res.status(404).json({ success: false, message: 'Department not found' });
      }

      res.json({
        success: true,
        data: departments[0]
      });
    } catch (error) {
      logger.error('Error getting department', { error: error.message });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Create new department
   * POST /api/tenant/departments
   * NOTE: This method should be called AFTER checkResourceLimit('departments') middleware
   */
  static async createDepartment(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;
      const { name, description } = req.body;

      if (!tenantId) {
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }

      if (!name) {
        return res.status(400).json({ success: false, message: 'Department name is required' });
      }

      // Check if name exists
      const [existing] = await pool.execute(
        'SELECT id FROM departments WHERE name = ? AND tenant_id = ?',
        [name, tenantId]
      );

      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: 'Department name already exists' });
      }

      // Create department (limit already checked by middleware)
      const [result] = await pool.execute(
        'INSERT INTO departments (tenant_id, name, description) VALUES (?, ?, ?)',
        [tenantId, name, description || null]
      );

      // Get created department
      const [departments] = await pool.execute(
        'SELECT id, tenant_id, name, description FROM departments WHERE id = ?',
        [result.insertId]
      );

      logger.info(`Department created for tenant ${tenantId}`, { departmentId: result.insertId, name });

      res.status(201).json({
        success: true,
        message: 'Department created successfully',
        data: departments[0]
      });
    } catch (error) {
      logger.error('Error creating department', { error: error.message });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Update department
   * PUT /api/tenant/departments/:id
   */
  static async updateDepartment(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;
      const { id } = req.params;
      const { name, description } = req.body;

      if (!tenantId) {
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }

      if (!name) {
        return res.status(400).json({ success: false, message: 'Department name is required' });
      }

      // Check if department exists
      const [existing] = await pool.execute(
        'SELECT id FROM departments WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: 'Department not found' });
      }

      // Check if name exists (excluding current department)
      const [nameCheck] = await pool.execute(
        'SELECT id FROM departments WHERE name = ? AND tenant_id = ? AND id != ?',
        [name, tenantId, id]
      );

      if (nameCheck.length > 0) {
        return res.status(400).json({ success: false, message: 'Department name already exists' });
      }

      // Update department
      await pool.execute(
        'UPDATE departments SET name = ?, description = ? WHERE id = ? AND tenant_id = ?',
        [name, description || null, id, tenantId]
      );

      // Get updated department
      const [departments] = await pool.execute(
        'SELECT id, tenant_id, name, description FROM departments WHERE id = ?',
        [id]
      );

      logger.info(`Department updated for tenant ${tenantId}`, { departmentId: id, name });

      res.json({
        success: true,
        message: 'Department updated successfully',
        data: departments[0]
      });
    } catch (error) {
      logger.error('Error updating department', { error: error.message });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Delete department
   * DELETE /api/tenant/departments/:id
   */
  static async deleteDepartment(req, res) {
    try {
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;
      const { id } = req.params;

      if (!tenantId) {
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }

      // Check if department exists
      const [departments] = await pool.execute(
        'SELECT name FROM departments WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (departments.length === 0) {
        return res.status(404).json({ success: false, message: 'Department not found' });
      }

      // Check if department has users
      const [users] = await pool.execute(
        'SELECT COUNT(*) as count FROM users WHERE department = ? AND tenant_id = ?',
        [departments[0].name, tenantId]
      );

      if (users[0].count > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot delete department with assigned users' 
        });
      }

      // Delete department
      await pool.execute(
        'DELETE FROM departments WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      logger.info(`Department deleted for tenant ${tenantId}`, { departmentId: id });

      res.json({
        success: true,
        message: 'Department deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting department', { error: error.message });
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

module.exports = DepartmentController;
