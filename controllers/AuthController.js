/**
 * Authentication Controller
 * Handles authentication for Super Admin, Tenant Admin, and Users
 * 
 * @class AuthController
 */

const bcrypt = require('bcryptjs');
const BaseController = require('./BaseController');
const { generateToken } = require('../middleware/auth');
const { ValidationError, AuthenticationError } = require('../middleware/errorHandler');
const { logger } = require('../config/logger');
const { pool } = require('../config/database');
const GracePeriodService = require('../services/GracePeriodService');

class AuthController extends BaseController {
  /**
   * Super Admin Login
   */
  static async superAdminLogin(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      const [admins] = await pool.execute(
        'SELECT * FROM super_admins WHERE email = ? AND active = TRUE',
        [email]
      );

      if (admins.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      const admin = admins[0];
      const isValidPassword = await bcrypt.compare(password, admin.password);

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      const token = generateToken({
        id: admin.id,
        email: admin.email,
        role: 'superadmin',
        name: admin.name
      });

      logger.info(`Super Admin logged in: ${admin.email}`);

      return res.json({
        success: true,
        data: {
          token,
          user: {
            id: admin.id,
            email: admin.email,
            name: admin.name,
            role: 'superadmin'
          }
        }
      });
    } catch (error) {
      logger.error('Super Admin login error', { error: error.message });
      return res.status(500).json({
        success: false,
        message: error.message || 'Login failed'
      });
    }
  }

  /**
   * Tenant Admin Login
   */
  static async tenantAdminLogin(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw new ValidationError('Email and password are required');
      }

      // Get tenant from request context or find by admin email
      let tenantId = req.tenantId;
      
      if (!tenantId) {
        // Find tenant by admin email
        const [admins] = await pool.execute(
          `SELECT a.tenant_id, t.status, t.subscription_end_date, t.grace_period_end 
           FROM admins a 
           JOIN tenants t ON a.tenant_id = t.id 
           WHERE a.email = ? AND a.active = TRUE`,
          [email]
        );

        if (admins.length === 0) {
          throw new AuthenticationError('Invalid credentials');
        }

        const adminData = admins[0];
        
        // Check if tenant should have access (includes grace period)
        const hasAccess = await GracePeriodService.shouldAllowAccess(adminData);
        if (!hasAccess) {
          throw new AuthenticationError('Tenant account is suspended');
        }

        tenantId = adminData.tenant_id;
      }

      const [admins] = await pool.execute(
        'SELECT * FROM admins WHERE tenant_id = ? AND email = ? AND active = TRUE',
        [tenantId, email]
      );

      if (admins.length === 0) {
        throw new AuthenticationError('Invalid credentials');
      }

      const admin = admins[0];
      const isValidPassword = await bcrypt.compare(password, admin.password);

      if (!isValidPassword) {
        throw new AuthenticationError('Invalid credentials');
      }

      const token = generateToken({
        id: admin.id,
        email: admin.email,
        username: admin.username,
        role: 'admin',
        tenantId: admin.tenant_id,
        name: admin.name
      });

      logger.info(`Tenant Admin logged in: ${admin.email} (Tenant: ${tenantId})`);

      return res.json({
        success: true,
        data: {
          token,
          user: {
            id: admin.id,
            email: admin.email,
            username: admin.username,
            name: admin.name,
            role: 'admin',
            tenantId: admin.tenant_id
          }
        }
      });
    } catch (error) {
      logger.error('Tenant Admin login error', { error: error.message });
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Login failed'
      });
    }
  }

  /**
   * User Login (Tenant Employee)
   */
  static async userLogin(req, res) {
    try {
      const { username, password } = req.body;
      const tenantId = req.tenantId;

      if (!username || !password) {
        throw new ValidationError('Username and password are required');
      }

      if (!tenantId) {
        throw new ValidationError('Tenant context is required');
      }

      const [users] = await pool.execute(
        'SELECT * FROM users WHERE tenant_id = ? AND username = ? AND active = TRUE',
        [tenantId, username]
      );

      if (users.length === 0) {
        throw new AuthenticationError('Invalid credentials');
      }

      const user = users[0];
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        throw new AuthenticationError('Invalid credentials');
      }

      const token = generateToken({
        id: user.id,
        username: user.username,
        role: user.role,
        tenantId: user.tenant_id,
        store_id: user.store_id,
        department_id: user.department_id,
        name: user.name
      });

      logger.info(`User logged in: ${user.username} (Tenant: ${tenantId})`);

      return res.json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            store_id: user.store_id,
            department_id: user.department_id,
            tenantId: user.tenant_id
          }
        }
      });
    } catch (error) {
      logger.error('User login error', { error: error.message });
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Login failed'
      });
    }
  }

  /**
   * Generic Login - Auto-detect user type
   * Tries to login as: Super Admin -> Tenant Admin -> User
   */
  static async genericLogin(req, res) {
    try {
      const { email, password } = req.body;

      logger.info('Generic login attempt', { email, hasPassword: !!password });

      if (!email || !password) {
        logger.warn('Missing email or password');
        throw new ValidationError('Email and password are required');
      }

      // Try Super Admin first
      logger.debug('Checking super admin...');
      const [superAdmins] = await pool.execute(
        'SELECT * FROM super_admins WHERE email = ? AND active = TRUE',
        [email]
      );

      if (superAdmins.length > 0) {
        logger.debug('Super admin found, checking password...');
        const admin = superAdmins[0];
        const isValidPassword = await bcrypt.compare(password, admin.password);

        if (isValidPassword) {
          const token = generateToken({
            id: admin.id,
            email: admin.email,
            role: 'superadmin',
            name: admin.name
          });

          logger.info(`Super Admin logged in via generic: ${admin.email}`);

          return res.json({
            success: true,
            data: {
              token,
              user: {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: 'superadmin'
              }
            }
          });
        } else {
          logger.warn('Super admin password invalid');
        }
      }

      // Try Tenant Admin (by email)
      logger.debug('Checking tenant admin...');
      const [admins] = await pool.execute(`
        SELECT a.*, t.name as tenant_name, t.status as tenant_status,
               t.subscription_end_date, t.grace_period_end
        FROM admins a
        LEFT JOIN tenants t ON a.tenant_id = t.id
        WHERE a.email = ? AND a.active = TRUE
      `, [email]);

      logger.debug(`Found ${admins.length} tenant admins`);

      if (admins.length > 0) {
        const admin = admins[0];
        logger.debug('Tenant admin found', { 
          id: admin.id, 
          tenant_id: admin.tenant_id,
          tenant_status: admin.tenant_status 
        });
        
        // Check if tenant is pending payment
        if (admin.tenant_status === 'pending') {
          logger.warn('Tenant account pending payment', { tenant_id: admin.tenant_id });
          throw new AuthenticationError('Your account is pending payment confirmation. Please complete the payment to access your account.');
        }
        
        // Check tenant status with grace period support
        const tenantForCheck = {
          id: admin.tenant_id,
          status: admin.tenant_status,
          subscription_end_date: admin.subscription_end_date,
          grace_period_end: admin.grace_period_end
        };
        const hasAccess = await GracePeriodService.shouldAllowAccess(tenantForCheck);
        
        if (!hasAccess) {
          logger.warn('Tenant account suspended', { tenant_id: admin.tenant_id });
          throw new AuthenticationError('Tenant account is suspended');
        }

        logger.debug('Checking password...');
        const isValidPassword = await bcrypt.compare(password, admin.password);

        if (isValidPassword) {
          const token = generateToken({
            id: admin.id,
            email: admin.email,
            username: admin.username,
            role: 'admin',
            tenantId: admin.tenant_id,
            name: admin.name
          });

          logger.info(`Tenant Admin logged in via generic: ${admin.email} (Tenant: ${admin.tenant_id})`);

          return res.json({
            success: true,
            data: {
              token,
              user: {
                id: admin.id,
                email: admin.email,
                username: admin.username,
                name: admin.name,
                role: 'admin',
                tenantId: admin.tenant_id,
                tenant_name: admin.tenant_name
              }
            }
          });
        } else {
          logger.warn('Tenant admin password invalid');
        }
      }

      // Try User (by username) - like 2.0
      logger.debug('Checking user by username...');
      const [users] = await pool.execute(`
        SELECT u.*, t.name as tenant_name, t.status as tenant_status,
               t.subscription_end_date, t.grace_period_end
        FROM users u
        LEFT JOIN tenants t ON u.tenant_id = t.id
        WHERE u.username = ? AND u.active = TRUE
      `, [email]); // Use 'email' field as username

      logger.debug(`Found ${users.length} users`);

      if (users.length > 0) {
        const user = users[0];
        logger.debug('User found', { 
          id: user.id, 
          tenant_id: user.tenant_id,
          tenant_status: user.tenant_status 
        });
        
        // Check if tenant is pending payment
        if (user.tenant_status === 'pending') {
          logger.warn('Tenant account pending payment', { tenant_id: user.tenant_id });
          throw new AuthenticationError('Your account is pending payment confirmation. Please complete the payment to access your account.');
        }
        
        // Check tenant status with grace period support
        const tenantForCheck = {
          id: user.tenant_id,
          status: user.tenant_status,
          subscription_end_date: user.subscription_end_date,
          grace_period_end: user.grace_period_end
        };
        const hasAccess = await GracePeriodService.shouldAllowAccess(tenantForCheck);
        
        if (!hasAccess) {
          logger.warn('Tenant account suspended', { tenant_id: user.tenant_id });
          throw new AuthenticationError('Tenant account is suspended');
        }

        logger.debug('Checking password...');
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (isValidPassword) {
          const token = generateToken({
            id: user.id,
            username: user.username,
            role: 'user',
            tenantId: user.tenant_id,
            store: user.store,
            department: user.department,
            name: user.name
          });

          logger.info(`User logged in via generic: ${user.username} (Tenant: ${user.tenant_id})`);

          return res.json({
            success: true,
            data: {
              token,
              user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: 'user',
                store: user.store,
                department: user.department,
                tenantId: user.tenant_id,
                tenant_name: user.tenant_name
              }
            }
          });
        } else {
          logger.warn('User password invalid');
        }
      }

      // If no match found
      logger.warn('No matching user found or invalid credentials', { email });
      throw new AuthenticationError('Invalid credentials');

    } catch (error) {
      logger.error('Generic login error', { 
        error: error.message,
        stack: error.stack,
        statusCode: error.statusCode 
      });
      return res.status(error.statusCode || 401).json({
        success: false,
        message: error.message || 'Login failed'
      });
    }
  }

  /**
   * Verify Token
   */
  static async verifyToken(req, res) {
    try {
      return res.json({
        success: true,
        data: {
          user: req.user
        }
      });
    } catch (error) {
      logger.error('Token verification error', { error: error.message });
      return res.status(500).json({
        success: false,
        message: error.message || 'Token verification failed'
      });
    }
  }

  /**
   * Request Password Reset
   */
  static async requestPasswordReset(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        throw new ValidationError('Email is required');
      }

      // Check if it's a tenant admin
      const [admins] = await pool.execute(
        `SELECT a.*, t.id as tenant_id, t.name as tenant_name, t.phone as tenant_phone
         FROM admins a 
         JOIN tenants t ON a.tenant_id = t.id 
         WHERE a.email = ? AND a.active = TRUE`,
        [email]
      );

      if (admins.length > 0) {
        const admin = admins[0];
        
        // Generate reset token (valid for 1 hour)
        const resetToken = require('crypto').randomBytes(32).toString('hex');
        const resetExpiry = new Date(Date.now() + 3600000); // 1 hour

        // Store reset token
        await pool.execute(
          `UPDATE admins SET 
           password_reset_token = ?, 
           password_reset_expires = ? 
           WHERE id = ?`,
          [resetToken, resetExpiry, admin.id]
        );

        // Send notification via email and WhatsApp
        try {
          const notificationService = require('../services/NotificationService');
          
          await notificationService.sendPasswordResetNotification({
            email: admin.email,
            phone: admin.tenant_phone, // Use tenant phone for WhatsApp
            name: admin.name || admin.tenant_name,
            resetToken: resetToken,
            tenantId: admin.tenant_id
          });

          logger.info(`Password reset notifications sent to ${email}`);
        } catch (notifError) {
          logger.error('Failed to send password reset notifications:', notifError);
          // Don't fail the request if notification fails - token is still valid
        }

        return res.json({
          success: true,
          message: 'Password reset instructions sent to your email and phone'
        });
      }

      // If not found, don't reveal that the email doesn't exist (security)
      return res.json({
        success: true,
        message: 'If an account exists with that email, password reset instructions have been sent'
      });

    } catch (error) {
      logger.error('Password reset request error', { error: error.message });
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to process password reset request'
      });
    }
  }

  /**
   * Reset Password with Token
   */
  static async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        throw new ValidationError('Token and new password are required');
      }

      if (newPassword.length < 8) {
        throw new ValidationError('Password must be at least 8 characters long');
      }

      // Find admin with valid token
      const [admins] = await pool.execute(
        `SELECT * FROM admins 
         WHERE password_reset_token = ? 
         AND password_reset_expires > NOW() 
         AND active = TRUE`,
        [token]
      );

      if (admins.length === 0) {
        throw new ValidationError('Invalid or expired reset token');
      }

      const admin = admins[0];

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update password and clear reset token
      await pool.execute(
        `UPDATE admins SET 
         password = ?, 
         password_reset_token = NULL, 
         password_reset_expires = NULL 
         WHERE id = ?`,
        [hashedPassword, admin.id]
      );

      logger.info(`Password reset successful for admin ${admin.email}`);

      return res.json({
        success: true,
        message: 'Password reset successful. You can now login with your new password.'
      });

    } catch (error) {
      logger.error('Password reset error', { error: error.message });
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to reset password'
      });
    }
  }

  static async getTenantAdminCredentials(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const [admins] = await pool.execute(
        'SELECT email FROM admins WHERE id = ? AND tenant_id = ? AND active = TRUE',
        [req.user.id, req.user.tenantId]
      );

      if (admins.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      return res.json({
        success: true,
        data: { email: admins[0].email }
      });
    } catch (error) {
      logger.error('Error getting admin credentials', { error: error.message });
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to load credentials'
      });
    }
  }

  static async updateTenantAdminCredentials(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const { email, current_password, new_password } = req.body;
      if (!email && !new_password) {
        return res.status(400).json({
          success: false,
          message: 'No changes provided'
        });
      }

      const [admins] = await pool.execute(
        'SELECT id, email, password FROM admins WHERE id = ? AND tenant_id = ? AND active = TRUE',
        [req.user.id, req.user.tenantId]
      );

      if (admins.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      const admin = admins[0];
      const updates = [];
      const values = [];

      if (email && email !== admin.email) {
        const [existing] = await pool.execute(
          'SELECT id FROM admins WHERE tenant_id = ? AND email = ? AND id != ?',
          [req.user.tenantId, email, admin.id]
        );
        if (existing.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Email already exists'
          });
        }
        updates.push('email = ?');
        values.push(email);
      }

      if (new_password) {
        if (!current_password) {
          return res.status(400).json({
            success: false,
            message: 'Current password is required'
          });
        }
        const isValidPassword = await bcrypt.compare(current_password, admin.password);
        if (!isValidPassword) {
          return res.status(400).json({
            success: false,
            message: 'Current password is incorrect'
          });
        }
        if (new_password.length < 8) {
          return res.status(400).json({
            success: false,
            message: 'Password must be at least 8 characters long'
          });
        }
        const hashedPassword = await bcrypt.hash(new_password, 12);
        updates.push('password = ?');
        values.push(hashedPassword);
      }

      if (updates.length === 0) {
        return res.json({
          success: true,
          message: 'No changes applied'
        });
      }

      values.push(admin.id, req.user.tenantId);
      await pool.execute(
        `UPDATE admins SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
        values
      );

      return res.json({
        success: true,
        message: 'Credentials updated successfully'
      });
    } catch (error) {
      logger.error('Error updating admin credentials', { error: error.message });
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to update credentials'
      });
    }
  }
}

module.exports = AuthController;
