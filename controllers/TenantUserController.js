/**
 * Tenant User Controller
 * 
 * Handles user management within a tenant
 * All operations are isolated per tenant
 * 
 * @module controllers/TenantUserController
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

class TenantUserController extends BaseController {
  /**
   * Get all users for tenant
   * GET /api/tenant/users
   */
  static async getUsers(req, res) {
    console.log('🔵 TenantUserController.getUsers called');
    console.log('🔵 Request user:', req.user);
    console.log('🔵 Request tenantId:', req.tenantId);
    
    const connection = await pool.getConnection();
    
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      
      if (!tenantId) {
        console.log('❌ No tenant ID found');
        return res.status(400).json({
          success: false,
          message: 'Tenant ID is required'
        });
      }
      
      const { role, store, department, search, limit, active } = req.query;
      
      console.log('Getting users for tenant:', tenantId, 'with filters:', { role, store, department, search, limit, active });

      let query = `
        SELECT u.id, u.name, u.email, u.username, u.role, u.store, u.department,
          u.active as active, u.created_at, u.updated_at
        FROM users u
        WHERE u.tenant_id = ?
      `;
      const params = [tenantId];

      if (role) {
        query += ` AND u.role = ?`;
        params.push(role);
      }

      if (store) {
        query += ` AND u.store = ?`;
        params.push(store);
      }

      if (department) {
        query += ` AND u.department = ?`;
        params.push(department);
      }

      if (active !== undefined) {
        query += ` AND u.active = ?`;
        params.push(active === 'true' ? 1 : 0);
      }

      if (search) {
        query += ` AND (u.name LIKE ? OR u.email LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm);
      }

      query += ` ORDER BY u.name ASC`;

      if (limit) {
        query += ` LIMIT ?`;
        params.push(parseInt(limit));
      }

      console.log('Executing query:', query);
      console.log('With params:', params);
      
      const [users] = await connection.query(query, params);
      
      console.log('Found users:', users.length);

      return res.json({
        success: true,
        data: users
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch users',
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Get single user
   * GET /api/tenant/users/:id
   */
  static async getUser(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { id } = req.params;

      const [users] = await connection.query(
        `SELECT u.id, u.name, u.email, u.role, u.store, u.department,
          u.active, u.created_at, u.updated_at,
          s.name as store_name,
          d.name as department_name
         FROM users u
         LEFT JOIN stores s ON s.id = u.store AND s.tenant_id = u.tenant_id
         LEFT JOIN departments d ON d.id = u.department AND d.tenant_id = u.tenant_id
         WHERE u.id = ? AND u.tenant_id = ?`,
        [id, tenantId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      return res.json({
        success: true,
        data: users[0]
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user',
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Create new user (Simple like 2.0)
   * POST /api/tenant/users
   * NOTE: This method should be called AFTER checkResourceLimit('users') middleware
   */
  static async createUser(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { username, password, store, department } = req.body;

      // Validate required fields
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username and password are required'
        });
      }

      if (!store && !department) {
        return res.status(400).json({
          success: false,
          message: 'Store or department is required'
        });
      }

      // Check if username already exists in this tenant
      const [existingUsers] = await connection.query(
        'SELECT id FROM users WHERE username = ? AND tenant_id = ?',
        [username, tenantId]
      );

      if (existingUsers.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Username already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user (limit already checked by middleware)
      const [result] = await connection.query(
        `INSERT INTO users (tenant_id, username, password, role, store, department, active, created_at, updated_at)
         VALUES (?, ?, ?, 'user', ?, ?, 1, NOW(), NOW())`,
        [tenantId, username, hashedPassword, store || null, department || null]
      );

      // Fetch created user
      const [users] = await connection.query(
        `SELECT id, username, role, store, department, active, created_at, updated_at
         FROM users
         WHERE id = ?`,
        [result.insertId]
      );

      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: users[0]
      });
    } catch (error) {
      console.error('Error creating user:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create user',
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Update user
   * PUT /api/tenant/users/:id
   */
  static async updateUser(req, res) {
    const connection = await pool.getConnection();
    
    try {
      // Validate input
      await body('name')
        .trim()
        .notEmpty()
        .withMessage('Name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters')
        .run(req);

      await body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Invalid email format')
        .normalizeEmail()
        .run(req);

      await body('role')
        .notEmpty()
        .withMessage('Role is required')
        .isIn(['admin', 'operator', 'viewer'])
        .withMessage('Invalid role')
        .run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const tenantId = req.tenantId || req.user?.tenantId;
      const { id } = req.params;
      const { name, email, password, role, store, department, active } = req.body;

      // Check if user exists
      const [existingUsers] = await connection.query(
        'SELECT id FROM users WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (existingUsers.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if email already exists (excluding current user)
      const [emailCheck] = await connection.query(
        'SELECT id FROM users WHERE email = ? AND tenant_id = ? AND id != ?',
        [email, tenantId, id]
      );

      if (emailCheck.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }

      // Update user
      let updateQuery = `
        UPDATE users 
        SET name = ?, email = ?, role = ?, store = ?, department = ?, active = ?, updated_at = NOW()
      `;
      let params = [name, email, role, store || null, department || null, active ? 1 : 0];

      // Update password if provided
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        updateQuery += `, password = ?`;
        params.push(hashedPassword);
      }

      updateQuery += ` WHERE id = ? AND tenant_id = ?`;
      params.push(id, tenantId);

      await connection.query(updateQuery, params);

      // Fetch updated user
      const [users] = await connection.query(
        `SELECT u.id, u.name, u.email, u.role, u.store, u.department,
          u.active, u.created_at, u.updated_at,
          s.name as store_name,
          d.name as department_name
         FROM users u
         LEFT JOIN stores s ON s.id = u.store AND s.tenant_id = u.tenant_id
         LEFT JOIN departments d ON d.id = u.department AND d.tenant_id = u.tenant_id
         WHERE u.id = ?`,
        [id]
      );

      return res.json({
        success: true,
        message: 'User updated successfully',
        data: users[0]
      });
    } catch (error) {
      console.error('Error updating user:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update user',
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Delete user
   * DELETE /api/tenant/users/:id
   */
  static async deleteUser(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { id } = req.params;

      // Prevent deleting self
      if (parseInt(id) === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete your own account'
        });
      }

      // Check if user exists
      const [users] = await connection.query(
        'SELECT id FROM users WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Delete user
      await connection.query(
        'DELETE FROM users WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      return res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete user',
        error: error.message
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Toggle user active status
   * PUT /api/tenant/users/:id/toggle-active
   */
  static async toggleActive(req, res) {
    const connection = await pool.getConnection();
    
    try {
      const tenantId = req.tenantId || req.user?.tenantId;
      const { id } = req.params;

      // Prevent toggling self
      if (parseInt(id) === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Cannot toggle your own account status'
        });
      }

      // Check if user exists
      const [users] = await connection.query(
        'SELECT id, active FROM users WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Toggle status
      await connection.query(
        'UPDATE users SET active = NOT active, updated_at = NOW() WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      return res.json({
        success: true,
        message: 'User status updated successfully'
      });
    } catch (error) {
      console.error('Error toggling user status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to toggle user status',
        error: error.message
      });
    } finally {
      connection.release();
    }
  }
}

module.exports = TenantUserController;


