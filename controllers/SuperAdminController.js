/**
 * Super Admin Controller
 * Manages tenants, plans, currencies, translations, and system settings
 * 
 * @class SuperAdminController
 */

const BaseController = require('./BaseController');
const bcrypt = require('bcryptjs');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const { logger } = require('../config/logger');
const GracePeriodService = require('../services/GracePeriodService');

class SuperAdminController extends BaseController {
  /**
   * Get dashboard statistics
   */
  static async getDashboard(req, res) {
    try {
      // Get total tenants - count grace_period as active for display
      // Exclude system tenant (id = 0)
      const tenantStats = await BaseController.executeQuery(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status IN ('active', 'grace_period') THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'trial' THEN 1 ELSE 0 END) as trial,
          SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended
        FROM tenants
        WHERE id != 0
      `);

      // Get total revenue from plans
      // Exclude system tenant (id = 0)
      const planRevenueStats = await BaseController.executeQuery(`
        SELECT 
          COUNT(*) as total_subscriptions,
          COALESCE(SUM(sp.price), 0) as monthly_plan_revenue
        FROM tenants t
        LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
        WHERE t.status IN ('active', 'trial', 'grace_period')
          AND t.id != 0
      `);

      // Get total revenue from addon purchases (completed/paid)
      const addonRevenueStats = await BaseController.executeQuery(`
        SELECT 
          COUNT(*) as total_addon_purchases,
          COALESCE(SUM(total_amount), 0) as total_addon_revenue
        FROM addon_purchases
        WHERE status IN ('completed', 'paid')
      `);

      // Get addon revenue for current month
      const monthlyAddonRevenue = await BaseController.executeQuery(`
        SELECT 
          COALESCE(SUM(total_amount), 0) as monthly_addon_revenue
        FROM addon_purchases
        WHERE status IN ('completed', 'paid')
          AND MONTH(created_at) = MONTH(CURRENT_DATE())
          AND YEAR(created_at) = YEAR(CURRENT_DATE())
      `);

      // Combine revenues
      const monthlyPlanRevenue = parseFloat(planRevenueStats[0]?.monthly_plan_revenue || 0);
      const monthlyAddonRev = parseFloat(monthlyAddonRevenue[0]?.monthly_addon_revenue || 0);
      const totalAddonRevenue = parseFloat(addonRevenueStats[0]?.total_addon_revenue || 0);

      // Get recent tenants
      // Exclude system tenant (id = 0)
      const recentTenants = await BaseController.executeQuery(`
        SELECT id, name, email, status, created_at
        FROM tenants
        WHERE id != 0
        ORDER BY created_at DESC
        LIMIT 5
      `);

      // Hide grace_period status in recent tenants
      const displayRecentTenants = GracePeriodService.getDisplayStatusForAll(recentTenants);

      // Get plan distribution
      // Exclude system tenant (id = 0)
      const planStats = await BaseController.executeQuery(`
        SELECT 
          sp.name,
          COUNT(t.id) as tenant_count
        FROM subscription_plans sp
        LEFT JOIN tenants t ON sp.id = t.plan_id AND t.id != 0
        GROUP BY sp.id, sp.name
      `);

      return BaseController.sendSuccess(res, {
        tenants: tenantStats[0],
        revenue: {
          total_subscriptions: planRevenueStats[0]?.total_subscriptions || 0,
          monthly_revenue: monthlyPlanRevenue + monthlyAddonRev,
          monthly_plan_revenue: monthlyPlanRevenue,
          monthly_addon_revenue: monthlyAddonRev,
          total_addon_purchases: addonRevenueStats[0]?.total_addon_purchases || 0,
          total_addon_revenue: totalAddonRevenue
        },
        recentTenants: displayRecentTenants,
        planDistribution: planStats
      });
    } catch (error) {
      logger.error('Dashboard error', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }

  /**
   * Get all tenants with pagination
   */
  static async getTenants(req, res) {
    try {
      const { page = 1, limit = 10, status, search } = req.query;
      const { page: pageNum, limit: limitNum, offset } = BaseController.validatePagination(page, limit);

      // Build WHERE clause
      // Exclude system tenant (id = 0)
      let whereClause = 'WHERE t.id != 0';
      const params = [];

      // Handle status filter - treat 'active' as including 'grace_period' for display
      if (status) {
        if (status === 'active') {
          whereClause += ' AND t.status IN (?, ?)';
          params.push('active', 'grace_period');
        } else {
          whereClause += ' AND t.status = ?';
          params.push(status);
        }
      }

      if (search) {
        whereClause += ' AND (t.name LIKE ? OR t.email LIKE ? OR t.company_name LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM tenants t
        LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
        ${whereClause}
      `;
      const countResult = await BaseController.executeQuery(countQuery, params);
      const total = countResult && countResult[0] ? countResult[0].total : 0;

      // Get paginated results
      const query = `
        SELECT 
          t.*,
          sp.name as plan_name,
          sp.price as plan_price
        FROM tenants t
        LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
        ${whereClause}
        ORDER BY t.created_at DESC 
        LIMIT ? OFFSET ?
      `;
      params.push(limitNum, offset);

      const tenants = await BaseController.executeQuery(query, params);

      // Hide grace_period status - show as 'active' to super admin
      const displayTenants = GracePeriodService.getDisplayStatusForAll(tenants);

      return BaseController.sendSuccess(res, {
        tenants: displayTenants,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      logger.error('Get tenants error', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }

  /**
   * Get single tenant
   */
  static async getTenant(req, res) {
    try {
      const { id } = req.params;

      const tenants = await BaseController.executeQuery(`
        SELECT 
          t.*,
          sp.name as plan_name,
          sp.price as plan_price,
          sp.billing_period
        FROM tenants t
        LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
        WHERE t.id = ?
      `, [id]);

      if (tenants.length === 0) {
        throw new NotFoundError('Tenant not found');
      }

      // Get tenant statistics
      const stats = await BaseController.executeQuery(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE tenant_id = ?) as user_count,
          (SELECT COUNT(*) FROM conversations WHERE tenant_id = ?) as conversation_count,
          (SELECT COUNT(*) FROM whatsapp_messages WHERE tenant_id = ?) as message_count
      `, [id, id, id]);

      // Hide grace_period status - show as 'active' to super admin
      const displayTenant = GracePeriodService.getDisplayStatus(tenants[0]);

      return BaseController.sendSuccess(res, {
        tenant: displayTenant,
        statistics: stats[0]
      });
    } catch (error) {
      logger.error('Get tenant error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Create new tenant
   */
  static async createTenant(req, res) {
    try {
      const {
        name,
        email,
        phone,
        company_name,
        plan_id,
        admin_username,
        admin_password,
        admin_email,
        activate_immediately // Only superadmin can set this
      } = req.body;

      // Validate required fields
      if (!name || !email || !plan_id || !admin_username || !admin_password) {
        throw new ValidationError('Missing required fields');
      }

      const connection = await BaseController.getConnection();

      try {
        await connection.beginTransaction();

        // Check if email already exists
        const existing = await BaseController.executeQuery(
          'SELECT id FROM tenants WHERE email = ?',
          [email],
          connection
        );

        if (existing.length > 0) {
          throw new ValidationError('Email already registered');
        }

        // Generate unique subdomain from name
        let baseSubdomain = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 30);
        
        if (!baseSubdomain) {
          baseSubdomain = 'tenant';
        }

        // Check if subdomain exists and add random suffix if needed
        let subdomain = baseSubdomain;
        let attempts = 0;
        while (attempts < 10) {
          const subdomainExists = await BaseController.executeQuery(
            'SELECT id FROM tenants WHERE subdomain = ?',
            [subdomain],
            connection
          );
          if (subdomainExists.length === 0) break;
          subdomain = `${baseSubdomain}-${Math.random().toString(36).substring(2, 8)}`;
          attempts++;
        }

        // Get plan details
        const plans = await BaseController.executeQuery(
          'SELECT * FROM subscription_plans WHERE id = ?',
          [plan_id],
          connection
        );

        if (plans.length === 0) {
          throw new NotFoundError('Plan not found');
        }

        const plan = plans[0];

        // Determine initial status:
        // - 'trial' for new tenants (default)
        // - 'active' only if superadmin explicitly activates
        const isSuperAdmin = req.user && req.user.role === 'superadmin';
        const initialStatus = (isSuperAdmin && activate_immediately) ? 'active' : 'trial';

        // Create tenant with all plan limits
        const tenantResult = await BaseController.executeQuery(`
          INSERT INTO tenants (
            name, email, phone, company_name, plan_id, subdomain,
            status,
            max_users, max_conversations, max_messages_per_month,
            max_stores, max_departments, max_contacts, max_devices
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          name, email, phone || null, company_name || null, plan_id, subdomain,
          initialStatus,
          plan.max_users, plan.max_conversations, plan.max_messages_per_month,
          plan.max_stores || 1, plan.max_departments || 1, plan.max_contacts || 100, plan.max_devices || 1
        ], connection);

        const tenantId = tenantResult.insertId;

        // Create admin user for tenant
        const hashedPassword = await bcrypt.hash(admin_password, 12);
        await BaseController.executeQuery(`
          INSERT INTO admins (tenant_id, username, email, password, name, active)
          VALUES (?, ?, ?, ?, ?, TRUE)
        `, [tenantId, admin_username, admin_email || email, hashedPassword, name], connection);

        // Create default bot settings
        const defaultSettings = [
          ['bot_active', 'true'],
          ['bot_name', name],
          ['default_message', 'Hello! How can I help you?']
        ];

        for (const [key, value] of defaultSettings) {
          await BaseController.executeQuery(
            'INSERT INTO bot_settings (tenant_id, setting_key, setting_value) VALUES (?, ?, ?)',
            [tenantId, key, value],
            connection
          );
        }

        await connection.commit();
        connection.release();

        logger.info(`Tenant created: ${name} (ID: ${tenantId})`);

        // Send welcome notification
        try {
          const notificationService = require('../services/NotificationService');
          await notificationService.sendWelcomeNotification(tenantId, {
            admin_username,
            trial_days: process.env.TRIAL_PERIOD_DAYS || '14'
          });
          logger.info(`Welcome notification sent to tenant ${tenantId}`);
        } catch (notifError) {
          logger.error('Failed to send welcome notification:', notifError);
          // Don't fail the registration if notification fails
        }

        return BaseController.sendSuccess(res, {
          tenant_id: tenantId,
          admin_username
        }, 201, 'Tenant created successfully');
      } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
      }
    } catch (error) {
      logger.error('Create tenant error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Update tenant
   */
  static async updateTenant(req, res) {
    try {
      const { id } = req.params;
      const {
        name,
        email,
        phone,
        company_name,
        plan_id,
        status,
        sync_plan_limits, // If true, sync all limits from plan
        max_users,
        max_stores,
        max_departments,
        max_contacts,
        max_devices,
        max_conversations,
        max_messages_per_month,
        max_faqs,
        max_widgets,
        max_invoices_per_month,
        max_quotes_per_month,
        max_payment_links_per_month
      } = req.body;

      console.log('Update tenant request:', { id, body: req.body });

      if (String(id) === '0') {
        throw new ValidationError('Cannot update system tenant');
      }

      // Check if tenant exists
      const existing = await BaseController.executeQuery('SELECT id, plan_id FROM tenants WHERE id = ?', [id]);
      if (existing.length === 0) {
        throw new NotFoundError('Tenant not found');
      }

      // If plan_id is changing or sync_plan_limits is true, sync limits from plan
      const shouldSyncLimits = sync_plan_limits || (plan_id && plan_id !== existing[0].plan_id);
      
      if (shouldSyncLimits && plan_id) {
        // Get plan limits
        const plans = await BaseController.executeQuery(
          'SELECT * FROM subscription_plans WHERE id = ?',
          [plan_id]
        );
        
        if (plans.length > 0) {
          const plan = plans[0];
          
          // Sync all limits from plan to tenant
          await BaseController.executeQuery(`
            UPDATE tenants SET
              plan_id = ?,
              max_stores = ?,
              max_users = ?,
              max_departments = ?,
              max_contacts = ?,
              max_devices = ?,
              max_conversations = ?,
              max_messages_per_month = ?,
              max_faqs = ?,
              max_widgets = ?,
              max_invoices_per_month = ?,
              max_quotes_per_month = ?,
              max_payment_links_per_month = ?,
              max_contact_groups = ?
            WHERE id = ?
          `, [
            plan_id,
            plan.max_stores || 1,
            plan.max_users || 5,
            plan.max_departments || 5,
            plan.max_contacts || 1000,
            plan.max_devices || 1,
            plan.max_conversations || 1000,
            plan.max_messages_per_month || 10000,
            plan.max_faqs || 10,
            plan.max_widgets || 0,
            plan.max_invoices_per_month || 0,
            plan.max_quotes_per_month || 0,
            plan.max_payment_links_per_month || 0,
            plan.max_contact_groups || 10,
            id
          ]);
          
          logger.info(`Tenant ${id} limits synced from plan ${plan_id}`);
        }
      }

      // Build update query for other fields
      const updates = [];
      const params = [];

      if (name) {
        updates.push('name = ?');
        params.push(name);
      }
      if (email) {
        updates.push('email = ?');
        params.push(email);
      }
      if (phone !== undefined) {
        updates.push('phone = ?');
        params.push(phone);
      }
      if (company_name !== undefined) {
        updates.push('company_name = ?');
        params.push(company_name);
      }
      // Only update plan_id if not already synced
      if (plan_id && !shouldSyncLimits) {
        updates.push('plan_id = ?');
        params.push(plan_id);
      }
      if (status) {
        const allowedStatuses = ['active', 'trial', 'suspended', 'grace_period', 'cancelled', 'pending'];
        if (!allowedStatuses.includes(status)) {
          throw new ValidationError('Invalid tenant status');
        }
        updates.push('status = ?');
        params.push(status);
      }
      // Only update individual limits if not syncing from plan
      if (!shouldSyncLimits) {
        if (max_users !== undefined) {
          updates.push('max_users = ?');
          params.push(max_users);
        }
        if (max_stores !== undefined) {
          updates.push('max_stores = ?');
          params.push(max_stores);
        }
        if (max_departments !== undefined) {
          updates.push('max_departments = ?');
          params.push(max_departments);
        }
        if (max_contacts !== undefined) {
          updates.push('max_contacts = ?');
          params.push(max_contacts);
        }
        if (max_devices !== undefined) {
          updates.push('max_devices = ?');
          params.push(max_devices);
        }
        if (max_conversations !== undefined) {
          updates.push('max_conversations = ?');
          params.push(max_conversations);
        }
        if (max_messages_per_month !== undefined) {
          updates.push('max_messages_per_month = ?');
          params.push(max_messages_per_month);
        }
        if (max_faqs !== undefined) {
          updates.push('max_faqs = ?');
          params.push(max_faqs);
        }
        if (max_widgets !== undefined) {
          updates.push('max_widgets = ?');
          params.push(max_widgets);
        }
        if (max_invoices_per_month !== undefined) {
          updates.push('max_invoices_per_month = ?');
          params.push(max_invoices_per_month);
        }
        if (max_quotes_per_month !== undefined) {
          updates.push('max_quotes_per_month = ?');
          params.push(max_quotes_per_month);
        }
        if (max_payment_links_per_month !== undefined) {
          updates.push('max_payment_links_per_month = ?');
          params.push(max_payment_links_per_month);
        }
      }

      // Only execute update if there are fields to update (besides plan sync)
      if (updates.length > 0) {
        params.push(id);
        const query = `UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`;
        console.log('Executing query:', query, 'with params:', params);
        await BaseController.executeQuery(query, params);
      }

      logger.info(`Tenant updated: ${id}`, { fields: updates, planSynced: shouldSyncLimits });

      return BaseController.sendSuccess(res, null, 200, 'Tenant updated successfully');
    } catch (error) {
      logger.error('Update tenant error', { error: error.message, stack: error.stack });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Delete tenant
   */
  static async deleteTenant(req, res) {
    const connection = await BaseController.getConnection();
    try {
      const { id } = req.params;

      if (String(id) === '0') {
        throw new ValidationError('Cannot delete system tenant');
      }

      // Check if tenant exists
      const [existing] = await connection.execute('SELECT name FROM tenants WHERE id = ? FOR UPDATE', [id]);
      if (existing.length === 0) {
        throw new NotFoundError('Tenant not found');
      }

      await connection.beginTransaction();

      try {
        const [tables] = await connection.execute(
          `SELECT DISTINCT c.TABLE_NAME as table_name
           FROM information_schema.columns c
           JOIN information_schema.tables t
             ON t.table_schema = c.table_schema
            AND t.table_name = c.table_name
           WHERE c.column_name = 'tenant_id'
             AND c.table_schema = DATABASE()
             AND t.table_type = 'BASE TABLE'`
        );

        await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

        for (const row of tables) {
          const table = row.table_name;
          if (table === 'tenants') continue;
          try {
            await connection.execute(`DELETE FROM \`${table}\` WHERE tenant_id = ?`, [id]);
          } catch (deleteError) {
            logger.error('Delete tenant table error', { table, error: deleteError.message });
          }
        }

        await connection.execute('DELETE FROM tenants WHERE id = ?', [id]);
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

        await connection.commit();
      } catch (transactionError) {
        await connection.rollback();
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
        throw transactionError;
      }

      logger.info(`Tenant deleted: ${existing[0].name} (${id})`);

      return BaseController.sendSuccess(res, null, 200, 'Tenant deleted successfully');
    } catch (error) {
      logger.error('Delete tenant error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    } finally {
      connection.release();
    }
  }

  /**
   * Activate tenant (approve pending payment / manual activation)
   * Used by superadmin to activate tenants after cash payment or manual approval
   */
  static async activateTenant(req, res) {
    try {
      const { id } = req.params;
      const { payment_confirmed = false } = req.body;

      // Check if tenant exists
      const existing = await BaseController.executeQuery(
        'SELECT id, name, email, status, plan_id FROM tenants WHERE id = ?', 
        [id]
      );
      if (existing.length === 0) {
        throw new NotFoundError('Tenant not found');
      }

      const tenant = existing[0];

      // Calculate subscription end date (1 month from now)
      const subscriptionEndDate = tenant.subscription_end_date ? new Date(tenant.subscription_end_date) : null;
      const now = new Date();
      const nextEndDate = new Date();
      nextEndDate.setMonth(nextEndDate.getMonth() + 1);
      const finalSubscriptionEndDate = !subscriptionEndDate || subscriptionEndDate < now
        ? nextEndDate
        : subscriptionEndDate;

      // Update tenant status to active
      await BaseController.executeQuery(`
        UPDATE tenants SET 
          status = 'active', 
          subscription_end_date = ?,
          updated_at = NOW() 
        WHERE id = ?
      `, [finalSubscriptionEndDate, id]);

      // If payment confirmed, update payment record
      if (payment_confirmed) {
        await BaseController.executeQuery(`
          UPDATE payments SET 
            status = 'completed',
            updated_at = NOW()
          WHERE tenant_id = ? AND status = 'pending'
          ORDER BY created_at DESC
          LIMIT 1
        `, [id]);
      }

      logger.info(`Tenant activated: ${tenant.name} (${id})`);

      // Send activation notification
      try {
        const notificationService = require('../services/NotificationService');
        await notificationService.sendTenantActivationNotification(id, {});
      } catch (notifError) {
        logger.error('Failed to send activation notification:', notifError);
      }

      return BaseController.sendSuccess(res, {
        tenant_id: id,
        status: 'active',
        subscription_end_date: finalSubscriptionEndDate
      }, 200, 'Tenant activated successfully');
    } catch (error) {
      logger.error('Activate tenant error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Deactivate tenant (suspend access)
   * Used by superadmin to immediately suspend a tenant
   */
  static async deactivateTenant(req, res) {
    try {
      const { id } = req.params;

      if (String(id) === '0') {
        throw new ValidationError('Cannot deactivate system tenant');
      }

      const existing = await BaseController.executeQuery(
        'SELECT id, name, status FROM tenants WHERE id = ?',
        [id]
      );
      if (existing.length === 0) {
        throw new NotFoundError('Tenant not found');
      }

      await BaseController.executeQuery(`
        UPDATE tenants SET 
          status = 'suspended',
          updated_at = NOW()
        WHERE id = ?
      `, [id]);

      logger.info(`Tenant suspended: ${existing[0].name} (${id})`);

      return BaseController.sendSuccess(res, {
        tenant_id: id,
        status: 'suspended'
      }, 200, 'Tenant suspended successfully');
    } catch (error) {
      logger.error('Deactivate tenant error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Get all subscription plans
   */
  static async getPlans(req, res) {
    try {
      const plans = await BaseController.executeQuery(`
        SELECT 
          sp.*,
          COUNT(t.id) as tenant_count
        FROM subscription_plans sp
        LEFT JOIN tenants t ON sp.id = t.plan_id
        GROUP BY sp.id
        ORDER BY sp.sort_order, sp.price
      `);

      return BaseController.sendSuccess(res, { plans });
    } catch (error) {
      logger.error('Get plans error', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }

  /**
   * Create subscription plan
   */
  static async createPlan(req, res) {
    try {
      const {
        name,
        description,
        price,
        currency = 'USD',
        billing_period = 'monthly',
        // Resource limits
        max_stores = 1,
        max_users = 5,
        max_departments = 5,
        max_contacts = 1000,
        max_devices = 1,
        max_conversations = 1000,
        max_messages_per_month = 10000,
        max_faqs = 10,
        max_widgets = 0,
        max_invoices_per_month = 0,
        max_quotes_per_month = 0,
        max_payment_links_per_month = 0,
        max_contact_groups = 10,
        // Features
        whatsapp_enabled = true,
        ai_enabled = false,
        woocommerce_enabled = false,
        analytics_enabled = true,
        priority_support_enabled = false,
        api_access_enabled = false,
        custom_branding_enabled = false,
        invoices_enabled = false,
        quotes_enabled = false,
        widgets_enabled = false,
        payment_links_enabled = false,
        // Payment integration
        is_free = false,
        stripe_price_id,
        paypal_plan_id,
        // Other
        features,
        sort_order = 0
      } = req.body;

      if (!name || price === undefined) {
        throw new ValidationError('Name and price are required');
      }

      const result = await BaseController.executeQuery(`
        INSERT INTO subscription_plans (
          name, description, price, currency, billing_period,
          max_stores, max_users, max_departments, max_contacts, max_devices,
          max_conversations, max_messages_per_month, max_faqs, max_widgets,
          max_invoices_per_month, max_quotes_per_month, max_payment_links_per_month,
          max_contact_groups,
          whatsapp_enabled, ai_enabled, woocommerce_enabled, analytics_enabled,
          priority_support_enabled, api_access_enabled, custom_branding_enabled,
          invoices_enabled, quotes_enabled, widgets_enabled, payment_links_enabled,
          is_free, stripe_price_id, paypal_plan_id,
          features, sort_order, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
      `, [
        name, description, price, currency, billing_period,
        max_stores, max_users, max_departments, max_contacts, max_devices,
        max_conversations, max_messages_per_month, max_faqs, max_widgets,
        max_invoices_per_month, max_quotes_per_month, max_payment_links_per_month,
        max_contact_groups,
        whatsapp_enabled ? 1 : 0, ai_enabled ? 1 : 0, woocommerce_enabled ? 1 : 0, analytics_enabled ? 1 : 0,
        priority_support_enabled ? 1 : 0, api_access_enabled ? 1 : 0, custom_branding_enabled ? 1 : 0,
        invoices_enabled ? 1 : 0, quotes_enabled ? 1 : 0, widgets_enabled ? 1 : 0, payment_links_enabled ? 1 : 0,
        is_free ? 1 : 0, stripe_price_id || null, paypal_plan_id || null,
        JSON.stringify(features || {}), sort_order
      ]);

      logger.info(`Plan created: ${name}`);

      return BaseController.sendSuccess(res, { plan_id: result.insertId }, 201, 'Plan created successfully');
    } catch (error) {
      logger.error('Create plan error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Update subscription plan
   */
  static async updatePlan(req, res) {
    try {
      const { id } = req.params;
      const updates = [];
      const params = [];

      // All allowed fields for plan update - resource limits and features
      const allowedFields = [
        // Basic info
        'name', 'description', 'price', 'currency', 'billing_period',
        // Resource limits
        'max_stores', 'max_users', 'max_departments', 'max_contacts', 'max_devices',
        'max_conversations', 'max_messages_per_month', 'max_faqs', 'max_widgets',
        'max_invoices_per_month', 'max_quotes_per_month', 'max_payment_links_per_month',
        'max_contact_groups',
        // Feature flags
        'whatsapp_enabled', 'ai_enabled', 'woocommerce_enabled', 'analytics_enabled',
        'priority_support_enabled', 'api_access_enabled', 'custom_branding_enabled',
        'invoices_enabled', 'quotes_enabled', 'widgets_enabled', 'payment_links_enabled',
        // Payment integration
        'is_free', 'stripe_price_id', 'paypal_plan_id',
        // Other
        'features', 'active', 'sort_order'
      ];

      // Boolean fields that need conversion
      const booleanFields = [
        'whatsapp_enabled', 'ai_enabled', 'woocommerce_enabled', 'analytics_enabled',
        'priority_support_enabled', 'api_access_enabled', 'custom_branding_enabled',
        'invoices_enabled', 'quotes_enabled', 'widgets_enabled', 'payment_links_enabled',
        'is_free', 'active'
      ];

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          let value = req.body[field];
          
          // Handle JSON fields
          if (field === 'features') {
            value = JSON.stringify(value);
          }
          // Handle boolean fields
          else if (booleanFields.includes(field)) {
            value = value === true || value === 'true' || value === 1 || value === '1' ? 1 : 0;
          }
          // Handle numeric fields
          else if (field.startsWith('max_')) {
            value = parseInt(value, 10) || 0;
          }
          
          params.push(value);
        }
      });

      if (updates.length === 0) {
        throw new ValidationError('No fields to update');
      }

      params.push(id);

      await BaseController.executeQuery(
        `UPDATE subscription_plans SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      logger.info(`Plan updated: ${id}`, { fields: updates.map(u => u.split(' = ')[0]) });

      return BaseController.sendSuccess(res, null, 200, 'Plan updated successfully');
    } catch (error) {
      logger.error('Update plan error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Delete subscription plan
   */
  static async deletePlan(req, res) {
    try {
      const { id } = req.params;

      // Check if plan has tenants
      const tenants = await BaseController.executeQuery(
        'SELECT COUNT(*) as count FROM tenants WHERE plan_id = ?',
        [id]
      );

      if (tenants[0].count > 0) {
        throw new ValidationError('Cannot delete plan with active tenants');
      }

      await BaseController.executeQuery('DELETE FROM subscription_plans WHERE id = ?', [id]);

      logger.info(`Plan deleted: ${id}`);

      return BaseController.sendSuccess(res, null, 200, 'Plan deleted successfully');
    } catch (error) {
      logger.error('Delete plan error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Sync plan limits to all tenants using this plan
   * This updates all tenant resource limits to match the plan's current limits
   */
  static async syncPlanLimitsToTenants(req, res) {
    try {
      const { id } = req.params;

      // Get plan details
      const plans = await BaseController.executeQuery(
        'SELECT * FROM subscription_plans WHERE id = ?',
        [id]
      );

      if (plans.length === 0) {
        throw new NotFoundError('Plan not found');
      }

      const plan = plans[0];

      // Update all tenants using this plan
      const result = await BaseController.executeQuery(`
        UPDATE tenants SET
          max_stores = ?,
          max_users = ?,
          max_departments = ?,
          max_contacts = ?,
          max_devices = ?,
          max_conversations = ?,
          max_messages_per_month = ?,
          max_faqs = ?,
          max_widgets = ?,
          max_invoices_per_month = ?,
          max_quotes_per_month = ?,
          max_payment_links_per_month = ?,
          max_contact_groups = ?
        WHERE plan_id = ?
      `, [
        plan.max_stores || 1,
        plan.max_users || 5,
        plan.max_departments || 5,
        plan.max_contacts || 1000,
        plan.max_devices || 1,
        plan.max_conversations || 1000,
        plan.max_messages_per_month || 10000,
        plan.max_faqs || 10,
        plan.max_widgets || 0,
        plan.max_invoices_per_month || 0,
        plan.max_quotes_per_month || 0,
        plan.max_payment_links_per_month || 0,
        plan.max_contact_groups || 10,
        id
      ]);

      const affectedRows = result.affectedRows || 0;
      logger.info(`Plan ${id} limits synced to ${affectedRows} tenants`);

      return BaseController.sendSuccess(res, {
        plan_id: id,
        tenants_updated: affectedRows
      }, 200, `Limits synced to ${affectedRows} tenants`);
    } catch (error) {
      logger.error('Sync plan limits error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Get all currencies
   */
  static async getCurrencies(req, res) {
    try {
      const currencies = await BaseController.executeQuery(`
        SELECT * FROM currencies ORDER BY is_default DESC, code
      `);

      return BaseController.sendSuccess(res, { currencies });
    } catch (error) {
      logger.error('Get currencies error', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }

  /**
   * Create currency
   */
  static async createCurrency(req, res) {
    const connection = await BaseController.getConnection();
    try {
      const { code, name, symbol, exchange_rate = 1.0, is_default = false } = req.body;

      if (!code || !name || !symbol) {
        throw new ValidationError('Code, name, and symbol are required');
      }

      await connection.beginTransaction();

      const [defaultCountRows] = await connection.execute(
        'SELECT COUNT(*) as count FROM currencies WHERE is_default = TRUE'
      );
      const hasDefault = (defaultCountRows[0]?.count || 0) > 0;
      const finalIsDefault = is_default || !hasDefault;

      if (finalIsDefault) {
        await connection.execute('UPDATE currencies SET is_default = FALSE');
      }

      const [result] = await connection.execute(`
        INSERT INTO currencies (code, name, symbol, exchange_rate, is_default, active)
        VALUES (?, ?, ?, ?, ?, TRUE)
      `, [code.toUpperCase(), name, symbol, exchange_rate, finalIsDefault]);

      await connection.commit();

      logger.info(`Currency created: ${code}`);

      return BaseController.sendSuccess(res, { currency_id: result.insertId }, 201, 'Currency created successfully');
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      logger.error('Create currency error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    } finally {
      connection.release();
    }
  }

  /**
   * Update currency
   */
  static async updateCurrency(req, res) {
    const connection = await BaseController.getConnection();
    try {
      const { id } = req.params;
      const { name, symbol, exchange_rate, is_default, active } = req.body;

      await connection.beginTransaction();

      const [existingRows] = await connection.execute(
        'SELECT id, is_default, active FROM currencies WHERE id = ?',
        [id]
      );
      if (existingRows.length === 0) {
        throw new NotFoundError('Currency not found');
      }
      const current = existingRows[0];

      if (active === false && (is_default === true || current.is_default)) {
        throw new ValidationError('Default currency must stay active');
      }

      if (is_default === false && current.is_default) {
        const [otherDefaults] = await connection.execute(
          'SELECT id FROM currencies WHERE is_default = TRUE AND id != ?',
          [id]
        );
        if (otherDefaults.length === 0) {
          throw new ValidationError('At least one default currency is required');
        }
      }

      const updates = [];
      const params = [];

      if (name) {
        updates.push('name = ?');
        params.push(name);
      }
      if (symbol) {
        updates.push('symbol = ?');
        params.push(symbol);
      }
      if (exchange_rate !== undefined) {
        updates.push('exchange_rate = ?');
        params.push(exchange_rate);
      }
      if (active !== undefined) {
        updates.push('active = ?');
        params.push(active);
      }
      if (is_default !== undefined) {
        if (is_default) {
          await connection.execute('UPDATE currencies SET is_default = FALSE');
          updates.push('active = ?');
          params.push(true);
        }
        updates.push('is_default = ?');
        params.push(is_default);
      }

      if (updates.length === 0) {
        throw new ValidationError('No fields to update');
      }

      params.push(id);

      await connection.execute(
        `UPDATE currencies SET ${updates.join(', ')} WHERE id = ?`,
        params
      );

      if (is_default) {
        const [currencyRows] = await connection.execute(
          'SELECT code FROM currencies WHERE id = ? LIMIT 1',
          [id]
        );
        const code = currencyRows?.[0]?.code;
        if (code) {
          await connection.execute(
            'UPDATE subscription_plans SET currency = ?',
            [code]
          );
        }
      }

      await connection.commit();

      logger.info(`Currency updated: ${id}`);

      return BaseController.sendSuccess(res, null, 200, 'Currency updated successfully');
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      logger.error('Update currency error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    } finally {
      connection.release();
    }
  }

  /**
   * Delete currency
   */
  static async deleteCurrency(req, res) {
    try {
      const { id } = req.params;

      // Check if it's the default currency
      const currency = await BaseController.executeQuery(
        'SELECT is_default FROM currencies WHERE id = ?',
        [id]
      );

      if (currency.length > 0 && currency[0].is_default) {
        throw new ValidationError('Cannot delete default currency');
      }

      await BaseController.executeQuery('DELETE FROM currencies WHERE id = ?', [id]);

      logger.info(`Currency deleted: ${id}`);

      return BaseController.sendSuccess(res, null, 200, 'Currency deleted successfully');
    } catch (error) {
      logger.error('Delete currency error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Get all translations
   */
  static async getTranslations(req, res) {
    try {
      const { language_code, category } = req.query;

      let query = 'SELECT * FROM translations WHERE 1=1';
      const params = [];

      if (language_code) {
        query += ' AND language_code = ?';
        params.push(language_code);
      }

      if (category) {
        query += ' AND category = ?';
        params.push(category);
      }

      query += ' ORDER BY language_code, category, translation_key';

      const translations = await BaseController.executeQuery(query, params);

      // Get available languages
      const languages = await BaseController.executeQuery(`
        SELECT DISTINCT language_code, language_name
        FROM translations
        ORDER BY language_code
      `);

      // Get available categories
      const categories = await BaseController.executeQuery(`
        SELECT DISTINCT category
        FROM translations
        ORDER BY category
      `);

      return BaseController.sendSuccess(res, {
        translations,
        languages,
        categories: categories.map(c => c.category)
      });
    } catch (error) {
      logger.error('Get translations error', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }

  /**
   * Create or update translation
   */
  static async upsertTranslation(req, res) {
    try {
      const {
        language_code,
        language_name,
        translation_key,
        translation_value,
        category = 'general'
      } = req.body;

      if (!language_code || !translation_key || !translation_value) {
        throw new ValidationError('Language code, key, and value are required');
      }

      await BaseController.executeQuery(`
        INSERT INTO translations (language_code, language_name, translation_key, translation_value, category)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          translation_value = VALUES(translation_value),
          language_name = VALUES(language_name),
          category = VALUES(category)
      `, [language_code, language_name, translation_key, translation_value, category]);

      logger.info(`Translation upserted: ${language_code}:${translation_key}`);

      return BaseController.sendSuccess(res, null, 200, 'Translation saved successfully');
    } catch (error) {
      logger.error('Upsert translation error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Delete translation
   */
  static async deleteTranslation(req, res) {
    try {
      const { id } = req.params;

      await BaseController.executeQuery('DELETE FROM translations WHERE id = ?', [id]);

      logger.info(`Translation deleted: ${id}`);

      return BaseController.sendSuccess(res, null, 200, 'Translation deleted successfully');
    } catch (error) {
      logger.error('Delete translation error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Get all payments (billing history)
   * GET /api/superadmin/payments
   */
  static async getPayments(req, res) {
    try {
      const { page = 1, limit = 20, status, tenant_id } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          p.*,
          t.company_name,
          t.email,
          sp.name as plan_name
        FROM payments p
        LEFT JOIN tenants t ON p.tenant_id = t.id
        LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
        WHERE 1=1
      `;
      const params = [];

      if (status) {
        query += ' AND p.status = ?';
        params.push(status);
      }

      if (tenant_id) {
        query += ' AND p.tenant_id = ?';
        params.push(tenant_id);
      }

      query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), offset);

      const payments = await BaseController.executeQuery(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM payments WHERE 1=1';
      const countParams = [];

      if (status) {
        countQuery += ' AND status = ?';
        countParams.push(status);
      }

      if (tenant_id) {
        countQuery += ' AND tenant_id = ?';
        countParams.push(tenant_id);
      }

      const countResult = await BaseController.executeQuery(countQuery, countParams);

      // Get revenue stats from payments (plans)
      const planRevenueStats = await BaseController.executeQuery(`
        SELECT 
          SUM(CASE WHEN status IN ('succeeded', 'completed') THEN amount ELSE 0 END) as total_plan_revenue,
          SUM(CASE WHEN status IN ('succeeded', 'completed') AND DATE(created_at) = CURDATE() THEN amount ELSE 0 END) as today_plan_revenue,
          SUM(CASE WHEN status IN ('succeeded', 'completed') AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) THEN amount ELSE 0 END) as month_plan_revenue,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
        FROM payments
      `);

      // Get revenue stats from addon purchases
      const addonRevenueStats = await BaseController.executeQuery(`
        SELECT 
          COALESCE(SUM(CASE WHEN status IN ('completed', 'paid') THEN total_amount ELSE 0 END), 0) as total_addon_revenue,
          COALESCE(SUM(CASE WHEN status IN ('completed', 'paid') AND DATE(created_at) = CURDATE() THEN total_amount ELSE 0 END), 0) as today_addon_revenue,
          COALESCE(SUM(CASE WHEN status IN ('completed', 'paid') AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) THEN total_amount ELSE 0 END), 0) as month_addon_revenue,
          COUNT(CASE WHEN status IN ('completed', 'paid') THEN 1 END) as addon_purchases_count
        FROM addon_purchases
      `);

      // Combine revenues
      const totalPlanRevenue = parseFloat(planRevenueStats[0]?.total_plan_revenue || 0);
      const todayPlanRevenue = parseFloat(planRevenueStats[0]?.today_plan_revenue || 0);
      const monthPlanRevenue = parseFloat(planRevenueStats[0]?.month_plan_revenue || 0);
      
      const totalAddonRevenue = parseFloat(addonRevenueStats[0]?.total_addon_revenue || 0);
      const todayAddonRevenue = parseFloat(addonRevenueStats[0]?.today_addon_revenue || 0);
      const monthAddonRevenue = parseFloat(addonRevenueStats[0]?.month_addon_revenue || 0);

      const combinedStats = {
        total_revenue: totalPlanRevenue + totalAddonRevenue,
        today_revenue: todayPlanRevenue + todayAddonRevenue,
        month_revenue: monthPlanRevenue + monthAddonRevenue,
        failed_count: planRevenueStats[0]?.failed_count || 0,
        // Breakdown
        total_plan_revenue: totalPlanRevenue,
        total_addon_revenue: totalAddonRevenue,
        today_plan_revenue: todayPlanRevenue,
        today_addon_revenue: todayAddonRevenue,
        month_plan_revenue: monthPlanRevenue,
        month_addon_revenue: monthAddonRevenue,
        addon_purchases_count: addonRevenueStats[0]?.addon_purchases_count || 0
      };

      return BaseController.sendSuccess(res, {
        payments,
        stats: combinedStats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      });
    } catch (error) {
      logger.error('Get payments error', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }

  /**
   * Get payment by ID (for superadmin)
   * GET /api/superadmin/payments/:id
   */
  static async getPaymentById(req, res) {
    try {
      const { id } = req.params;

      const payments = await BaseController.executeQuery(
        `SELECT p.*, sp.name as plan_name, t.company_name, t.email, t.subdomain
         FROM payments p
         LEFT JOIN subscriptions s ON p.subscription_id = s.id
         LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
         LEFT JOIN tenants t ON p.tenant_id = t.id
         WHERE p.id = ?`,
        [id]
      );

      if (!payments.length) {
        return BaseController.sendError(res, 'Payment not found', 404);
      }

      return BaseController.sendSuccess(res, payments[0]);
    } catch (error) {
      logger.error('Get payment by ID error', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }

  /**
   * Approve pending cash/manual payment
   * POST /api/superadmin/payments/:id/approve
   */
  static async approvePayment(req, res) {
    try {
      const { id } = req.params;

      // Get payment details
      const payments = await BaseController.executeQuery(
        `SELECT p.*, t.id as tenant_id, t.company_name, t.email, t.status as tenant_status, t.plan_id
         FROM payments p
         LEFT JOIN tenants t ON p.tenant_id = t.id
         WHERE p.id = ?`,
        [id]
      );

      if (!payments.length) {
        return BaseController.sendError(res, 'Payment not found', 404);
      }

      const payment = payments[0];

      // Check if payment is pending
      if (payment.status !== 'pending') {
        return BaseController.sendError(res, `Payment is already ${payment.status}`, 400);
      }

      // Check if it's a cash payment
      if (payment.payment_method !== 'cash') {
        return BaseController.sendError(res, 'Only cash payments can be manually approved', 400);
      }

      // Update payment status to completed
      await BaseController.executeQuery(
        `UPDATE payments SET status = 'completed', updated_at = NOW() WHERE id = ?`,
        [id]
      );

      // Calculate subscription end date (1 month from now)
      const subscriptionEndDate = new Date();
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);

      // Activate tenant if not already active
      if (payment.tenant_id && payment.tenant_status !== 'active') {
        await BaseController.executeQuery(`
          UPDATE tenants SET 
            status = 'active', 
            subscription_end_date = ?,
            updated_at = NOW() 
          WHERE id = ?
        `, [subscriptionEndDate, payment.tenant_id]);

        // Send activation notification
        try {
          const notificationService = require('../services/NotificationService');
          await notificationService.sendTenantActivationNotification(payment.tenant_id, {});
        } catch (notifError) {
          logger.error('Failed to send activation notification:', notifError);
        }
      }

      logger.info(`Payment approved: #${id} for tenant ${payment.company_name}`);

      return BaseController.sendSuccess(res, {
        payment_id: id,
        status: 'completed',
        tenant_activated: payment.tenant_status !== 'active',
        subscription_end_date: subscriptionEndDate
      }, 200, 'Payment approved successfully');
    } catch (error) {
      logger.error('Approve payment error', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }

  /**
   * Get system statistics (advanced)
   * GET /api/superadmin/stats
   */
  static async getSystemStats(req, res) {
    try {
      const { period = '30' } = req.query; // days

      // Growth stats
      const growthStats = await BaseController.executeQuery(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as new_tenants
        FROM tenants
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `, [parseInt(period)]);

      // Revenue by day (plans)
      const planRevenueByDay = await BaseController.executeQuery(`
        SELECT 
          DATE(created_at) as date,
          SUM(amount) as revenue,
          COUNT(*) as transactions
        FROM payments
        WHERE status IN ('succeeded', 'completed') 
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `, [parseInt(period)]);

      // Revenue by day (addons)
      const addonRevenueByDay = await BaseController.executeQuery(`
        SELECT 
          DATE(created_at) as date,
          SUM(total_amount) as revenue,
          COUNT(*) as transactions
        FROM addon_purchases
        WHERE status IN ('completed', 'paid') 
          AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `, [parseInt(period)]);

      // Combine revenue by day
      const revenueMap = new Map();
      
      // Add plan revenue
      planRevenueByDay.forEach(item => {
        const dateKey = item.date instanceof Date ? item.date.toISOString().split('T')[0] : item.date;
        revenueMap.set(dateKey, {
          date: item.date,
          plan_revenue: parseFloat(item.revenue || 0),
          addon_revenue: 0,
          revenue: parseFloat(item.revenue || 0),
          plan_transactions: item.transactions,
          addon_transactions: 0,
          transactions: item.transactions
        });
      });
      
      // Add addon revenue
      addonRevenueByDay.forEach(item => {
        const dateKey = item.date instanceof Date ? item.date.toISOString().split('T')[0] : item.date;
        if (revenueMap.has(dateKey)) {
          const existing = revenueMap.get(dateKey);
          existing.addon_revenue = parseFloat(item.revenue || 0);
          existing.revenue = existing.plan_revenue + existing.addon_revenue;
          existing.addon_transactions = item.transactions;
          existing.transactions = existing.plan_transactions + existing.addon_transactions;
        } else {
          revenueMap.set(dateKey, {
            date: item.date,
            plan_revenue: 0,
            addon_revenue: parseFloat(item.revenue || 0),
            revenue: parseFloat(item.revenue || 0),
            plan_transactions: 0,
            addon_transactions: item.transactions,
            transactions: item.transactions
          });
        }
      });

      // Convert to sorted array
      const revenueByDay = Array.from(revenueMap.values()).sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA - dateB;
      });

      // Plan distribution
      const planDistribution = await BaseController.executeQuery(`
        SELECT 
          sp.name,
          sp.price,
          COUNT(s.id) as tenant_count,
          SUM(sp.price) as monthly_revenue
        FROM subscription_plans sp
        LEFT JOIN subscriptions s ON sp.id = s.plan_id AND s.status = 'active'
        WHERE sp.active = 1
        GROUP BY sp.id
        ORDER BY tenant_count DESC
      `);

      // Status distribution
      // Exclude system tenant (id = 0)
      const statusDistribution = await BaseController.executeQuery(`
        SELECT 
          status,
          COUNT(*) as count
        FROM tenants
        WHERE id != 0
        GROUP BY status
      `);

      // Top tenants by usage
      // Exclude system tenant (id = 0)
      const topTenants = await BaseController.executeQuery(`
        SELECT 
          t.id,
          t.company_name,
          t.name,
          COALESCE(ut.messages_sent, 0) as messages_sent,
          sp.name as plan_name
        FROM tenants t
        LEFT JOIN usage_tracking ut ON t.id = ut.tenant_id 
          AND ut.month = DATE_FORMAT(CURDATE(), '%Y-%m')
        LEFT JOIN subscriptions s ON t.id = s.tenant_id AND s.status = 'active'
        LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
        WHERE t.id != 0
        ORDER BY messages_sent DESC
        LIMIT 10
      `);

      // Churn rate (cancelled in last 30 days)
      // Exclude system tenant (id = 0)
      const churnStats = await BaseController.executeQuery(`
        SELECT 
          COUNT(CASE WHEN status = 'cancelled' 
            AND updated_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 END) as churned,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(*) as total
        FROM tenants
        WHERE id != 0
      `);

      const churnRate = churnStats[0].active > 0 
        ? ((churnStats[0].churned / churnStats[0].active) * 100).toFixed(2)
        : 0;

      return BaseController.sendSuccess(res, {
        growth: growthStats,
        revenue: revenueByDay,
        planDistribution,
        statusDistribution,
        topTenants,
        churnRate: parseFloat(churnRate),
        churnStats: churnStats[0]
      });
    } catch (error) {
      logger.error('Get system stats error', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }
  /**
   * Get superadmin translations for a specific language
   * GET /api/superadmin/translations/:languageCode
   */
  static async getSuperAdminTranslations(req, res) {
    try {
      const { languageCode } = req.params;

      const translations = await BaseController.executeQuery(`
        SELECT translation_key, translation_value
        FROM translations
        WHERE language_code = ? AND category = 'superadmin'
      `, [languageCode]);

      // Convert to key-value object
      const translationsMap = {};
      translations.forEach(t => {
        translationsMap[t.translation_key] = t.translation_value;
      });

      return BaseController.sendSuccess(res, { translations: translationsMap });
    } catch (error) {
      logger.error('Get superadmin translations error', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }

  /**
   * Toggle tenant feature
   * PUT /api/superadmin/tenants/:id/features/:feature
   */
  static async toggleTenantFeature(req, res) {
    try {
      const { id, feature } = req.params;
      const { enabled } = req.body;

      const allowedFeatures = [
        'whatsapp_enabled',
        'ai_enabled',
        'analytics_enabled',
        'api_access_enabled',
        'custom_branding_enabled'
      ];

      if (!allowedFeatures.includes(feature)) {
        throw new ValidationError('Invalid feature name');
      }

      // Check if tenant exists
      const existing = await BaseController.executeQuery('SELECT id FROM tenants WHERE id = ?', [id]);
      if (existing.length === 0) {
        throw new NotFoundError('Tenant not found');
      }

      // Update feature in tenant's plan or custom settings
      await BaseController.executeQuery(
        `UPDATE tenants SET settings = JSON_SET(COALESCE(settings, '{}'), '$.${feature}', ?) WHERE id = ?`,
        [enabled ? true : false, id]
      );

      logger.info(`Tenant ${id} feature ${feature} toggled to ${enabled}`);

      return BaseController.sendSuccess(res, null, 200, 'Feature updated successfully');
    } catch (error) {
      logger.error('Toggle tenant feature error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Get tenant usage statistics
   * GET /api/superadmin/tenants/:id/usage
   */
  static async getTenantUsage(req, res) {
    try {
      const { id } = req.params;

      // Check if tenant exists
      const existing = await BaseController.executeQuery('SELECT * FROM tenants WHERE id = ?', [id]);
      if (existing.length === 0) {
        throw new NotFoundError('Tenant not found');
      }

      const tenant = existing[0];

      // Get current usage
      const usage = await BaseController.executeQuery(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE tenant_id = ?) as current_users,
          (SELECT COUNT(*) FROM stores WHERE tenant_id = ?) as current_stores,
          (SELECT COUNT(*) FROM departments WHERE tenant_id = ?) as current_departments,
          (SELECT COUNT(*) FROM contacts WHERE tenant_id = ?) as current_contacts,
          (SELECT COUNT(*) FROM conversations WHERE tenant_id = ?) as current_conversations,
          (SELECT COUNT(*) FROM messages WHERE tenant_id = ? AND MONTH(timestamp) = MONTH(CURDATE())) as current_messages
      `, [id, id, id, id, id, id]);

      const usageData = usage[0];

      // Calculate percentages
      const percentages = {
        users: tenant.max_users > 0 ? (usageData.current_users / tenant.max_users * 100).toFixed(1) : 0,
        stores: tenant.max_stores > 0 ? (usageData.current_stores / tenant.max_stores * 100).toFixed(1) : 0,
        departments: tenant.max_departments > 0 ? (usageData.current_departments / tenant.max_departments * 100).toFixed(1) : 0,
        contacts: tenant.max_contacts > 0 ? (usageData.current_contacts / tenant.max_contacts * 100).toFixed(1) : 0,
        conversations: tenant.max_conversations > 0 ? (usageData.current_conversations / tenant.max_conversations * 100).toFixed(1) : 0,
        messages: tenant.max_messages_per_month > 0 ? (usageData.current_messages / tenant.max_messages_per_month * 100).toFixed(1) : 0
      };

      return BaseController.sendSuccess(res, {
        limits: {
          max_users: tenant.max_users,
          max_stores: tenant.max_stores,
          max_departments: tenant.max_departments,
          max_contacts: tenant.max_contacts,
          max_conversations: tenant.max_conversations,
          max_messages_per_month: tenant.max_messages_per_month
        },
        current: usageData,
        percentages
      });
    } catch (error) {
      logger.error('Get tenant usage error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Reset tenant message counter
   * POST /api/superadmin/tenants/:id/reset-messages
   */
  static async resetTenantMessages(req, res) {
    try {
      const { id } = req.params;

      // Check if tenant exists
      const existing = await BaseController.executeQuery('SELECT id FROM tenants WHERE id = ?', [id]);
      if (existing.length === 0) {
        throw new NotFoundError('Tenant not found');
      }

      await BaseController.executeQuery(
        'UPDATE tenants SET current_messages_count = 0, messages_reset_at = NOW() WHERE id = ?',
        [id]
      );

      logger.info(`Tenant ${id} message counter reset`);

      return BaseController.sendSuccess(res, null, 200, 'Message counter reset successfully');
    } catch (error) {
      logger.error('Reset tenant messages error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Get default language
   * GET /api/superadmin/translations/default-language
   */
  static async getDefaultLanguage(req, res) {
    try {
      const result = await BaseController.executeQuery(`
        SELECT setting_value as language_code
        FROM system_settings_kv
        WHERE setting_key = 'default_language'
        LIMIT 1
      `);

      const language_code = result && result[0] && result[0].language_code ? result[0].language_code : 'en';

      return BaseController.sendSuccess(res, { language_code });
    } catch (error) {
      logger.error('Get default language error', { error: error.message });
      // Return English as fallback on error
      return BaseController.sendSuccess(res, { language_code: 'en' });
    }
  }

  /**
   * Get available languages
   * GET /api/superadmin/translations/languages
   */
  static async getAvailableLanguages(req, res) {
    try {
      const languages = await BaseController.executeQuery(`
        SELECT DISTINCT language_code, language_name
        FROM translations
        ORDER BY language_code
      `);

      return BaseController.sendSuccess(res, { languages });
    } catch (error) {
      logger.error('Get available languages error', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }

  // ==================== LANGUAGE MANAGEMENT ====================

  /**
   * Get all languages with default setting
   * GET /api/superadmin/languages
   */
  static async getLanguages(req, res) {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const localesDir = path.join(__dirname, '../public/locales');
      const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json') && !f.endsWith('-conversations.json'));
      
      const languages = files.map(f => {
        const code = f.replace('.json', '');
        const filePath = path.join(localesDir, f);
        let name = code.toUpperCase();
        
        // Try to get language name from file
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          if (content._language_name) {
            name = content._language_name;
          } else {
            // Default names
            const defaultNames = {
              'en': 'English',
              'pt': 'Português',
              'es': 'Español',
              'fr': 'Français',
              'de': 'Deutsch',
              'it': 'Italiano',
              'zh': '中文',
              'ja': '日本語',
              'ko': '한국어',
              'ar': 'العربية',
              'ru': 'Русский'
            };
            name = defaultNames[code] || code.toUpperCase();
          }
        } catch (e) {
          // Ignore read errors
        }
        
        return { code, name };
      });

      // Get default language from settings
      const result = await BaseController.executeQuery(`
        SELECT setting_value FROM system_settings_kv 
        WHERE setting_key = 'default_language'
      `);
      
      const defaultLanguage = result && result[0] ? result[0].setting_value : 'en';

      return BaseController.sendSuccess(res, { 
        languages, 
        defaultLanguage 
      });
    } catch (error) {
      logger.error('Get languages error', { error: error.message });
      return BaseController.sendError(res, error.message, 500);
    }
  }

  /**
   * Create new language
   * POST /api/superadmin/languages
   */
  static async createLanguage(req, res) {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const { code, name, translations } = req.body;

      if (!code || !name || !translations) {
        throw new ValidationError('Code, name, and translations are required');
      }

      const langCode = code.toLowerCase().trim();
      
      if (langCode.length < 2 || langCode.length > 5) {
        throw new ValidationError('Language code must be 2-5 characters');
      }

      const localesDir = path.join(__dirname, '../public/locales');
      const filePath = path.join(localesDir, `${langCode}.json`);

      // Check if already exists
      if (fs.existsSync(filePath)) {
        throw new ValidationError(`Language "${langCode}" already exists`);
      }

      // Add language name to translations
      translations._language_name = name;

      // Write file
      fs.writeFileSync(filePath, JSON.stringify(translations, null, 2), 'utf8');

      logger.info(`Language created: ${langCode} (${name})`);

      return BaseController.sendSuccess(res, { code: langCode, name }, 201, 'Language created successfully');
    } catch (error) {
      logger.error('Create language error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Update language translations
   * PUT /api/superadmin/languages/:code
   */
  static async updateLanguage(req, res) {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const { code } = req.params;
      const { translations } = req.body;

      if (!translations) {
        throw new ValidationError('Translations are required');
      }

      const localesDir = path.join(__dirname, '../public/locales');
      const filePath = path.join(localesDir, `${code}.json`);

      // Check if exists
      if (!fs.existsSync(filePath)) {
        throw new NotFoundError(`Language "${code}" not found`);
      }

      // Preserve language name if exists
      try {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (existing._language_name && !translations._language_name) {
          translations._language_name = existing._language_name;
        }
      } catch (e) {
        // Ignore
      }

      // Write file
      fs.writeFileSync(filePath, JSON.stringify(translations, null, 2), 'utf8');

      logger.info(`Language updated: ${code}`);

      return BaseController.sendSuccess(res, null, 200, 'Language updated successfully');
    } catch (error) {
      logger.error('Update language error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Delete language
   * DELETE /api/superadmin/languages/:code
   */
  static async deleteLanguage(req, res) {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const { code } = req.params;

      if (code === 'en') {
        throw new ValidationError('Cannot delete English (en) - it is the base language');
      }

      const localesDir = path.join(__dirname, '../public/locales');
      const filePath = path.join(localesDir, `${code}.json`);

      // Check if exists
      if (!fs.existsSync(filePath)) {
        throw new NotFoundError(`Language "${code}" not found`);
      }

      // Check if it's the default language
      const result = await BaseController.executeQuery(`
        SELECT setting_value FROM system_settings_kv 
        WHERE setting_key = 'default_language'
      `);
      
      if (result && result[0] && result[0].setting_value === code) {
        throw new ValidationError('Cannot delete the default language. Set another language as default first.');
      }

      // Delete file
      fs.unlinkSync(filePath);

      logger.info(`Language deleted: ${code}`);

      return BaseController.sendSuccess(res, null, 200, 'Language deleted successfully');
    } catch (error) {
      logger.error('Delete language error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }

  /**
   * Set default language
   * PUT /api/superadmin/languages/default
   */
  static async setDefaultLanguage(req, res) {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const { code } = req.body;

      if (!code) {
        throw new ValidationError('Language code is required');
      }

      // Check if language file exists
      const localesDir = path.join(__dirname, '../public/locales');
      const filePath = path.join(localesDir, `${code}.json`);

      if (!fs.existsSync(filePath)) {
        throw new NotFoundError(`Language "${code}" not found`);
      }

      // Save to database
      await BaseController.executeQuery(`
        INSERT INTO system_settings_kv (setting_key, setting_value) 
        VALUES ('default_language', ?) 
        ON DUPLICATE KEY UPDATE setting_value = ?
      `, [code, code]);

      try {
        const translationService = require('../services/TranslationService');
        translationService.setDefaultLanguage(code);
      } catch (serviceError) {
        logger.error('Failed to update translation service default language', { error: serviceError.message });
      }

      logger.info(`Default language set to: ${code}`);

      return BaseController.sendSuccess(res, { code }, 200, 'Default language updated successfully');
    } catch (error) {
      logger.error('Set default language error', { error: error.message });
      return BaseController.sendError(res, error.message, error.statusCode || 500);
    }
  }
}

module.exports = SuperAdminController;


