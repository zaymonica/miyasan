/**
 * Super Admin Routes
 * Routes for super admin operations
 * 
 * @module routes/superadmin
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../config/logger');
const SuperAdminController = require('../controllers/SuperAdminController');
const SuperAdminPlanController = require('../controllers/SuperAdminPlanController');
const SuperAdminSettingsController = require('../controllers/SuperAdminSettingsController');
const SuperAdminEmailController = require('../controllers/SuperAdminEmailController');
const PaymentGatewayController = require('../controllers/PaymentGatewayController');
const SuperAdminPlanAddonsController = require('../controllers/SuperAdminPlanAddonsController');
const AddonWebhookController = require('../controllers/AddonWebhookController');

// Test route without auth
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Superadmin routes are working!' });
});

// Public route to check if Meta App is configured (for tenants)
router.get('/settings/meta/status', asyncHandler(SuperAdminSettingsController.getMetaStatus));

// All routes require super admin authentication
router.use(requireAuth, requireSuperAdmin);

/**
 * @swagger
 * /api/superadmin/dashboard:
 *   get:
 *     summary: Get dashboard statistics
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data
 */
router.get('/dashboard', asyncHandler(SuperAdminController.getDashboard));

// ==================== TENANT MANAGEMENT ====================

/**
 * @swagger
 * /api/superadmin/tenants:
 *   get:
 *     summary: Get all tenants
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of tenants
 */
router.get('/tenants', asyncHandler(SuperAdminController.getTenants));

/**
 * @swagger
 * /api/superadmin/tenants/{id}:
 *   get:
 *     summary: Get single tenant
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Tenant details
 */
router.get('/tenants/:id', asyncHandler(SuperAdminController.getTenant));

/**
 * @swagger
 * /api/superadmin/tenants:
 *   post:
 *     summary: Create new tenant
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - subdomain
 *               - email
 *               - plan_id
 *               - admin_username
 *               - admin_password
 *             properties:
 *               name:
 *                 type: string
 *               subdomain:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               company_name:
 *                 type: string
 *               plan_id:
 *                 type: integer
 *               admin_username:
 *                 type: string
 *               admin_password:
 *                 type: string
 *               admin_email:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tenant created
 */
router.post('/tenants', asyncHandler(SuperAdminController.createTenant));

/**
 * @swagger
 * /api/superadmin/tenants/{id}:
 *   put:
 *     summary: Update tenant
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Tenant updated
 */
router.put('/tenants/:id', asyncHandler(SuperAdminController.updateTenant));

/**
 * @swagger
 * /api/superadmin/tenants/{id}:
 *   delete:
 *     summary: Delete tenant
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Tenant deleted
 */
router.delete('/tenants/:id', asyncHandler(SuperAdminController.deleteTenant));

/**
 * @swagger
 * /api/superadmin/tenants/{id}/activate:
 *   post:
 *     summary: Activate tenant (approve pending payment)
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payment_confirmed:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Tenant activated
 */
router.post('/tenants/:id/activate', asyncHandler(SuperAdminController.activateTenant));
router.post('/tenants/:id/deactivate', asyncHandler(SuperAdminController.deactivateTenant));

/**
 * @swagger
 * /api/superadmin/tenants/{id}/features/{feature}:
 *   put:
 *     summary: Toggle tenant feature
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: feature
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Feature toggled
 */
router.put('/tenants/:id/features/:feature', asyncHandler(SuperAdminController.toggleTenantFeature));

/**
 * @swagger
 * /api/superadmin/tenants/{id}/usage:
 *   get:
 *     summary: Get tenant usage statistics
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Tenant usage statistics
 */
router.get('/tenants/:id/usage', asyncHandler(SuperAdminController.getTenantUsage));

/**
 * @swagger
 * /api/superadmin/tenants/{id}/reset-messages:
 *   post:
 *     summary: Reset tenant message counter
 *     tags: [Super Admin - Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Message counter reset
 */
router.post('/tenants/:id/reset-messages', asyncHandler(SuperAdminController.resetTenantMessages));

// ==================== SUBSCRIPTION PLANS ====================

/**
 * @swagger
 * /api/superadmin/plans:
 *   get:
 *     summary: Get all subscription plans
 *     tags: [Super Admin - Plans]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of plans
 */
router.get('/plans', asyncHandler(SuperAdminPlanController.getAllPlans));

/**
 * @swagger
 * /api/superadmin/plans/{id}:
 *   get:
 *     summary: Get plan by ID
 *     tags: [Super Admin - Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plan details
 */
router.get('/plans/:id', asyncHandler(SuperAdminPlanController.getPlanById));

/**
 * @swagger
 * /api/superadmin/plans:
 *   post:
 *     summary: Create subscription plan
 *     tags: [Super Admin - Plans]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               currency:
 *                 type: string
 *               billing_period:
 *                 type: string
 *               max_stores:
 *                 type: integer
 *               max_users:
 *                 type: integer
 *               max_departments:
 *                 type: integer
 *               max_contacts:
 *                 type: integer
 *               max_devices:
 *                 type: integer
 *               max_conversations:
 *                 type: integer
 *               max_messages_per_month:
 *                 type: integer
 *               whatsapp_enabled:
 *                 type: boolean
 *               ai_enabled:
 *                 type: boolean
 *               analytics_enabled:
 *                 type: boolean
 *               priority_support_enabled:
 *                 type: boolean
 *               api_access_enabled:
 *                 type: boolean
 *               custom_branding_enabled:
 *                 type: boolean
 *               is_trial:
 *                 type: boolean
 *               trial_days:
 *                 type: integer
 *               is_free:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Plan created
 */
router.post('/plans', asyncHandler(SuperAdminPlanController.createPlan));

/**
 * @swagger
 * /api/superadmin/plans/{id}:
 *   put:
 *     summary: Update subscription plan
 *     tags: [Super Admin - Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plan updated
 */
router.put('/plans/:id', asyncHandler(SuperAdminPlanController.updatePlan));

/**
 * @swagger
 * /api/superadmin/plans/{id}/toggle-status:
 *   put:
 *     summary: Toggle plan active status
 *     tags: [Super Admin - Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plan status toggled
 */
router.put('/plans/:id/toggle-status', asyncHandler(SuperAdminPlanController.togglePlanStatus));

/**
 * @swagger
 * /api/superadmin/plans/{id}:
 *   delete:
 *     summary: Delete subscription plan
 *     tags: [Super Admin - Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plan deleted
 */
router.delete('/plans/:id', asyncHandler(SuperAdminPlanController.deletePlan));

/**
 * @swagger
 * /api/superadmin/plans/{id}/sync-limits:
 *   post:
 *     summary: Sync plan limits to all tenants using this plan
 *     tags: [Super Admin - Plans]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Limits synced to tenants
 */
router.post('/plans/:id/sync-limits', asyncHandler(SuperAdminController.syncPlanLimitsToTenants));

// ==================== CURRENCIES ====================

/**
 * @swagger
 * /api/superadmin/currencies:
 *   get:
 *     summary: Get all currencies
 *     tags: [Super Admin - Currencies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of currencies
 */
router.get('/currencies', asyncHandler(SuperAdminController.getCurrencies));

/**
 * @swagger
 * /api/superadmin/currencies:
 *   post:
 *     summary: Create currency
 *     tags: [Super Admin - Currencies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - name
 *               - symbol
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               symbol:
 *                 type: string
 *               exchange_rate:
 *                 type: number
 *               is_default:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Currency created
 */
router.post('/currencies', asyncHandler(SuperAdminController.createCurrency));

/**
 * @swagger
 * /api/superadmin/currencies/{id}:
 *   put:
 *     summary: Update currency
 *     tags: [Super Admin - Currencies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Currency updated
 */
router.put('/currencies/:id', asyncHandler(SuperAdminController.updateCurrency));

/**
 * @swagger
 * /api/superadmin/currencies/{id}:
 *   delete:
 *     summary: Delete currency
 *     tags: [Super Admin - Currencies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Currency deleted
 */
router.delete('/currencies/:id', asyncHandler(SuperAdminController.deleteCurrency));

// ==================== TRANSLATIONS ====================

/**
 * @swagger
 * /api/superadmin/translations:
 *   get:
 *     summary: Get all translations
 *     tags: [Super Admin - Translations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: language_code
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of translations
 */
router.get('/translations', asyncHandler(SuperAdminController.getTranslations));

/**
 * @swagger
 * /api/superadmin/translations:
 *   post:
 *     summary: Create or update translation
 *     tags: [Super Admin - Translations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - language_code
 *               - translation_key
 *               - translation_value
 *             properties:
 *               language_code:
 *                 type: string
 *               language_name:
 *                 type: string
 *               translation_key:
 *                 type: string
 *               translation_value:
 *                 type: string
 *               category:
 *                 type: string
 *     responses:
 *       200:
 *         description: Translation saved
 */
router.post('/translations', asyncHandler(SuperAdminController.upsertTranslation));

/**
 * @swagger
 * /api/superadmin/translations/{id}:
 *   delete:
 *     summary: Delete translation
 *     tags: [Super Admin - Translations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Translation deleted
 */
router.delete('/translations/:id', asyncHandler(SuperAdminController.deleteTranslation));

// ==================== LANGUAGE MANAGEMENT ====================

/**
 * @swagger
 * /api/superadmin/languages:
 *   get:
 *     summary: Get all available languages
 *     tags: [Super Admin - Languages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of languages with default setting
 */
router.get('/languages', asyncHandler(SuperAdminController.getLanguages));

/**
 * @swagger
 * /api/superadmin/languages:
 *   post:
 *     summary: Create new language
 *     tags: [Super Admin - Languages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - name
 *               - translations
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               translations:
 *                 type: object
 *     responses:
 *       201:
 *         description: Language created
 */
router.post('/languages', asyncHandler(SuperAdminController.createLanguage));

/**
 * @swagger
 * /api/superadmin/languages/default:
 *   put:
 *     summary: Set default language
 *     tags: [Super Admin - Languages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Default language updated
 */
router.put('/languages/default', asyncHandler(SuperAdminController.setDefaultLanguage));

/**
 * @swagger
 * /api/superadmin/languages/{code}:
 *   put:
 *     summary: Update language translations
 *     tags: [Super Admin - Languages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - translations
 *             properties:
 *               translations:
 *                 type: object
 *     responses:
 *       200:
 *         description: Language updated
 */
router.put('/languages/:code', asyncHandler(SuperAdminController.updateLanguage));

/**
 * @swagger
 * /api/superadmin/languages/{code}:
 *   delete:
 *     summary: Delete language
 *     tags: [Super Admin - Languages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Language deleted
 */
router.delete('/languages/:code', asyncHandler(SuperAdminController.deleteLanguage));

// ==================== PAYMENTS & BILLING ====================

/**
 * @swagger
 * /api/superadmin/payments:
 *   get:
 *     summary: Get all payments (billing history)
 *     tags: [Super Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: tenant_id
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of payments with stats
 */
router.get('/payments', asyncHandler(SuperAdminController.getPayments));

/**
 * @swagger
 * /api/superadmin/payments/{id}:
 *   get:
 *     summary: Get payment by ID
 *     tags: [Super Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Payment details
 *       404:
 *         description: Payment not found
 */
router.get('/payments/:id', asyncHandler(SuperAdminController.getPaymentById));

/**
 * @swagger
 * /api/superadmin/payments/{id}/approve:
 *   post:
 *     summary: Approve pending cash/manual payment
 *     tags: [Super Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Payment approved successfully
 *       404:
 *         description: Payment not found
 */
router.post('/payments/:id/approve', asyncHandler(SuperAdminController.approvePayment));

// ==================== ADVANCED STATISTICS ====================

/**
 * @swagger
 * /api/superadmin/stats:
 *   get:
 *     summary: Get advanced system statistics
 *     tags: [Super Admin - Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days for statistics
 *     responses:
 *       200:
 *         description: Advanced statistics including growth, revenue, churn rate
 */
router.get('/stats', asyncHandler(SuperAdminController.getSystemStats));

// ==================== NOTIFICATION MANAGEMENT ====================

const NotificationController = require('../controllers/NotificationController');

// Email Notifications
router.get('/notifications/email/settings', asyncHandler(NotificationController.getEmailSettings));
router.put('/notifications/email/settings', asyncHandler(NotificationController.updateEmailSettings));
router.post('/notifications/email/test', asyncHandler(NotificationController.testEmailConnection));
router.get('/notifications/email/templates', asyncHandler(NotificationController.getEmailTemplates));
router.put('/notifications/email/templates/:id', asyncHandler(NotificationController.updateEmailTemplate));

// WhatsApp Notifications
router.get('/notifications/whatsapp/status', asyncHandler(NotificationController.getWhatsAppStatus));
router.post('/notifications/whatsapp/init', asyncHandler(NotificationController.initWhatsApp));
router.post('/notifications/whatsapp/disconnect', asyncHandler(NotificationController.disconnectWhatsApp));
router.get('/notifications/whatsapp/settings', asyncHandler(NotificationController.getWhatsAppSettings));
router.put('/notifications/whatsapp/settings', asyncHandler(NotificationController.updateWhatsAppSettings));
router.get('/notifications/whatsapp/templates', asyncHandler(NotificationController.getWhatsAppTemplates));
router.put('/notifications/whatsapp/templates/:id', asyncHandler(NotificationController.updateWhatsAppTemplate));

// Notification Logs
router.get('/notifications/logs', asyncHandler(NotificationController.getNotificationLogs));

// Plan Expiration Settings
router.get('/notifications/expiration-settings', asyncHandler(NotificationController.getExpirationSettings));
router.put('/notifications/expiration-settings', asyncHandler(NotificationController.updateExpirationSettings));

// Test Notifications
router.post('/notifications/whatsapp/test', asyncHandler(NotificationController.sendTestWhatsApp));

// Manual notification check (for testing)
router.post('/notifications/check-expirations', asyncHandler(async (req, res) => {
  try {
    const notificationService = require('../services/NotificationService');
    await notificationService.checkPlanExpirations();
    res.json({ success: true, message: 'Expiration check completed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}));


// ==================== SYSTEM SETTINGS ====================

/**
 * @swagger
 * /api/superadmin/settings/system:
 *   get:
 *     summary: Get system settings (grace period, reminders, etc.)
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System settings
 */
router.get('/settings/system', asyncHandler(SuperAdminSettingsController.getSystemSettings));

/**
 * @swagger
 * /api/superadmin/profile:
 *   get:
 *     summary: Get super admin profile (email)
 *     tags: [Super Admin - Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Super admin profile
 */
router.get('/profile', asyncHandler(SuperAdminSettingsController.getProfile));

/**
 * @swagger
 * /api/superadmin/profile:
 *   put:
 *     summary: Update super admin profile (email, password)
 *     tags: [Super Admin - Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               current_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put('/profile', asyncHandler(SuperAdminSettingsController.updateProfile));

/**
 * @swagger
 * /api/superadmin/settings/system:
 *   put:
 *     summary: Update system settings
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               grace_period_days:
 *                 type: integer
 *               payment_reminder_days:
 *                 type: string
 *               overdue_reminder_interval_days:
 *                 type: integer
 *               auto_suspend_enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Settings updated
 */
router.put('/settings/system', asyncHandler(SuperAdminSettingsController.updateSystemSettings));

// ==================== SMTP SETTINGS ====================

/**
 * @swagger
 * /api/superadmin/settings/smtp:
 *   get:
 *     summary: Get SMTP settings
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SMTP settings
 */
router.get('/settings/smtp', asyncHandler(SuperAdminSettingsController.getSMTPSettings));

/**
 * @swagger
 * /api/superadmin/settings/smtp:
 *   put:
 *     summary: Update SMTP settings
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - smtp_host
 *               - smtp_port
 *               - smtp_user
 *               - smtp_from_email
 *             properties:
 *               smtp_host:
 *                 type: string
 *               smtp_port:
 *                 type: integer
 *               smtp_user:
 *                 type: string
 *               smtp_password:
 *                 type: string
 *               smtp_from_email:
 *                 type: string
 *               smtp_from_name:
 *                 type: string
 *               smtp_secure:
 *                 type: boolean
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: SMTP settings updated
 */
router.put('/settings/smtp', asyncHandler(SuperAdminSettingsController.updateSMTPSettings));

/**
 * @swagger
 * /api/superadmin/settings/smtp/test:
 *   post:
 *     summary: Test SMTP connection
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - test_email
 *             properties:
 *               test_email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test email sent
 */
router.post('/settings/smtp/test', asyncHandler(SuperAdminSettingsController.testSMTPConnection));

// ==================== META/FACEBOOK APP SETTINGS ====================

/**
 * @swagger
 * /api/superadmin/settings/meta:
 *   get:
 *     summary: Get Meta/Facebook App settings for WhatsApp Cloud API
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Meta App settings
 */
router.get('/settings/meta', asyncHandler(SuperAdminSettingsController.getMetaSettings));

/**
 * @swagger
 * /api/superadmin/settings/meta/test:
 *   post:
 *     summary: Test Meta App connection
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection test result
 */
router.post('/settings/meta/test', asyncHandler(SuperAdminSettingsController.testMetaConnection));

/**
 * @swagger
 * /api/superadmin/settings/meta:
 *   put:
 *     summary: Update Meta/Facebook App settings
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               meta_app_id:
 *                 type: string
 *               meta_app_secret:
 *                 type: string
 *               meta_config_id:
 *                 type: string
 *               meta_business_id:
 *                 type: string
 *               meta_embedded_signup_enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Meta settings updated
 */
router.put('/settings/meta', asyncHandler(SuperAdminSettingsController.updateMetaSettings));

// ==================== PAYMENT GATEWAY SETTINGS ====================

/**
 * @swagger
 * /api/superadmin/settings/payment-gateways:
 *   get:
 *     summary: Get payment gateway settings
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment gateway settings
 */
router.get('/settings/payment-gateways', asyncHandler(SuperAdminSettingsController.getPaymentGateways));

/**
 * @swagger
 * /api/superadmin/settings/payment-gateways/{gateway}:
 *   put:
 *     summary: Update payment gateway settings (stripe or paypal)
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gateway
 *         required: true
 *         schema:
 *           type: string
 *           enum: [stripe, paypal]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stripe_secret_key:
 *                 type: string
 *               stripe_publishable_key:
 *                 type: string
 *               stripe_webhook_secret:
 *                 type: string
 *               paypal_client_id:
 *                 type: string
 *               paypal_client_secret:
 *                 type: string
 *               paypal_mode:
 *                 type: string
 *                 enum: [sandbox, live]
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Payment gateway updated
 */
router.put('/settings/payment-gateways/:gateway', asyncHandler(SuperAdminSettingsController.updatePaymentGateway));

// ==================== EMAIL TEMPLATES ====================

/**
 * @swagger
 * /api/superadmin/email/templates:
 *   get:
 *     summary: Get all email templates
 *     tags: [Super Admin - Email Templates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of email templates
 */
router.get('/email/templates', asyncHandler(SuperAdminEmailController.getAllTemplates));

/**
 * @swagger
 * /api/superadmin/email/templates/{key}:
 *   get:
 *     summary: Get email template by key
 *     tags: [Super Admin - Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Email template
 */
router.get('/email/templates/:key', asyncHandler(SuperAdminEmailController.getTemplate));

/**
 * @swagger
 * /api/superadmin/email/templates/{key}:
 *   put:
 *     summary: Update email template
 *     tags: [Super Admin - Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - html_body
 *               - text_body
 *             properties:
 *               subject:
 *                 type: string
 *               html_body:
 *                 type: string
 *               text_body:
 *                 type: string
 *     responses:
 *       200:
 *         description: Template updated
 */
router.put('/email/templates/:key', asyncHandler(SuperAdminEmailController.updateTemplate));

/**
 * @swagger
 * /api/superadmin/email/templates/{key}/reset:
 *   post:
 *     summary: Reset email template to default
 *     tags: [Super Admin - Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Template reset
 */
router.post('/email/templates/:key/reset', asyncHandler(SuperAdminEmailController.resetTemplate));

/**
 * @swagger
 * /api/superadmin/email/templates/{key}/preview:
 *   post:
 *     summary: Preview email template with sample data
 *     tags: [Super Admin - Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Template preview
 */
router.post('/email/templates/:key/preview', asyncHandler(SuperAdminEmailController.previewTemplate));

/**
 * @swagger
 * /api/superadmin/email/test:
 *   post:
 *     summary: Send test email
 *     tags: [Super Admin - Email Templates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - template_key
 *               - recipient_email
 *             properties:
 *               template_key:
 *                 type: string
 *               recipient_email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test email sent
 */
/**
 * @swagger
 * /api/superadmin/translations/{languageCode}:
 *   get:
 *     summary: Get translations for superadmin
 *     tags: [Super Admin - Translations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: languageCode
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Translations loaded
 */
router.get('/translations/:languageCode', asyncHandler(SuperAdminController.getSuperAdminTranslations));

/**
 * @swagger
 * /api/superadmin/translations/default-language:
 *   get:
 *     summary: Get default system language
 *     tags: [Super Admin - Translations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default language code
 */
router.get('/translations/default-language', asyncHandler(SuperAdminController.getDefaultLanguage));

/**
 * @swagger
 * /api/superadmin/translations/languages:
 *   get:
 *     summary: Get available languages
 *     tags: [Super Admin - Translations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available languages
 */
router.get('/translations/languages', asyncHandler(SuperAdminController.getAvailableLanguages));

router.post('/email/test', asyncHandler(SuperAdminEmailController.sendTestEmail));

// ==================== PAYMENT GATEWAYS ====================

/**
 * @swagger
 * /api/superadmin/payment-gateways:
 *   get:
 *     summary: Get all payment gateways configuration
 *     tags: [Super Admin - Payment Gateways]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment gateways configuration
 */
router.get('/payment-gateways', asyncHandler(PaymentGatewayController.getAllGateways));

/**
 * @swagger
 * /api/superadmin/payment-gateways/{gateway}:
 *   put:
 *     summary: Update payment gateway settings
 *     tags: [Super Admin - Payment Gateways]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gateway
 *         required: true
 *         schema:
 *           type: string
 *           enum: [stripe, paypal, cash]
 *     responses:
 *       200:
 *         description: Gateway settings updated
 */
router.put('/payment-gateways/:gateway', asyncHandler(PaymentGatewayController.updateGateway));

/**
 * @swagger
 * /api/superadmin/payment-gateways/{gateway}/toggle:
 *   put:
 *     summary: Toggle payment gateway enabled status
 *     tags: [Super Admin - Payment Gateways]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: gateway
 *         required: true
 *         schema:
 *           type: string
 *           enum: [stripe, paypal, cash]
 *     responses:
 *       200:
 *         description: Gateway status toggled
 */
router.put('/payment-gateways/:gateway/toggle', asyncHandler(PaymentGatewayController.toggleGateway));

// ==================== PLAN ADD-ONS ====================

/**
 * @swagger
 * /api/superadmin/plan-addons:
 *   get:
 *     summary: Get all plan add-ons
 *     tags: [Super Admin - Plan Add-ons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of plan add-ons
 */
router.get('/plan-addons', asyncHandler(SuperAdminPlanAddonsController.getAllAddons));

/**
 * @swagger
 * /api/superadmin/plan-addons:
 *   post:
 *     summary: Create plan add-on
 *     tags: [Super Admin - Plan Add-ons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Add-on created
 */
router.post('/plan-addons', asyncHandler(SuperAdminPlanAddonsController.createAddon));

/**
 * @swagger
 * /api/superadmin/plan-addons/{id}:
 *   put:
 *     summary: Update plan add-on
 *     tags: [Super Admin - Plan Add-ons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Add-on updated
 */
router.put('/plan-addons/:id', asyncHandler(SuperAdminPlanAddonsController.updateAddon));

/**
 * @swagger
 * /api/superadmin/plan-addons/{id}/toggle:
 *   put:
 *     summary: Toggle add-on active status
 *     tags: [Super Admin - Plan Add-ons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Add-on status toggled
 */
router.put('/plan-addons/:id/toggle', asyncHandler(SuperAdminPlanAddonsController.toggleAddon));

/**
 * @swagger
 * /api/superadmin/plan-addons/{id}:
 *   delete:
 *     summary: Delete plan add-on
 *     tags: [Super Admin - Plan Add-ons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Add-on deleted
 */
router.delete('/plan-addons/:id', asyncHandler(SuperAdminPlanAddonsController.deleteAddon));

// ==================== ADDON PURCHASE MANAGEMENT ====================

// Debug middleware for addon-purchases
router.use('/addon-purchases', (req, res, next) => {
  logger.info('🔍 Addon purchases route hit', {
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      authorization: req.headers.authorization ? 'Bearer ***' : 'none',
      contentType: req.headers['content-type']
    }
  });
  next();
});

/**
 * @swagger
 * /api/superadmin/addon-purchases:
 *   get:
 *     summary: Get all addon purchases
 *     tags: [Super Admin - Addon Purchases]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of addon purchases
 */
router.get('/addon-purchases', asyncHandler(AddonWebhookController.getAddonPurchases));

/**
 * @swagger
 * /api/superadmin/addon-purchases/{id}/approve:
 *   post:
 *     summary: Approve manual payment for addon purchase
 *     tags: [Super Admin - Addon Purchases]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment approved
 */
router.post('/addon-purchases/:id/approve', asyncHandler(AddonWebhookController.approveManualPayment));

// ==================== SYSTEM BRANDING ====================

/**
 * @swagger
 * /api/superadmin/system-branding:
 *   get:
 *     summary: Get system branding settings (logo, favicon, name)
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System branding settings
 */
router.get('/system-branding', asyncHandler(SuperAdminSettingsController.getSystemBranding));

/**
 * @swagger
 * /api/superadmin/system-branding:
 *   put:
 *     summary: Update system branding settings
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings updated
 */
router.put('/system-branding', asyncHandler(SuperAdminSettingsController.updateSystemBranding));

// ==================== TIMEZONE SETTINGS ====================

/**
 * @swagger
 * /api/superadmin/settings/timezone:
 *   get:
 *     summary: Get timezone settings
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Timezone settings
 */
router.get('/settings/timezone', asyncHandler(SuperAdminSettingsController.getTimezoneSettings));

/**
 * @swagger
 * /api/superadmin/settings/timezone:
 *   put:
 *     summary: Update timezone settings
 *     tags: [Super Admin - Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               timezone:
 *                 type: string
 *               date_format:
 *                 type: string
 *               time_format:
 *                 type: string
 *               clock_enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Settings updated
 */
router.put('/settings/timezone', asyncHandler(SuperAdminSettingsController.updateTimezoneSettings));

// ==================== SYSTEM ADD-ONS ====================

const SystemAddonController = require('../controllers/SystemAddonController');
const multer = require('multer');
const path = require('path');

// Configure multer for addon uploads
const addonStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'temp');
    const fs = require('fs');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `addon-${Date.now()}-${file.originalname}`);
  }
});

const addonUpload = multer({
  storage: addonStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || 
        file.mimetype === 'application/x-zip-compressed' ||
        file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'), false);
    }
  }
});

/**
 * @swagger
 * /api/superadmin/system-addons:
 *   get:
 *     summary: Get all system add-ons
 *     tags: [Super Admin - System Add-ons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of system add-ons
 */
router.get('/system-addons', asyncHandler(SystemAddonController.getAddons));

/**
 * @swagger
 * /api/superadmin/system-addons/{id}:
 *   get:
 *     summary: Get system add-on by ID
 *     tags: [Super Admin - System Add-ons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Add-on details
 */
router.get('/system-addons/:id', asyncHandler(SystemAddonController.getAddon));

/**
 * @swagger
 * /api/superadmin/system-addons/upload:
 *   post:
 *     summary: Upload and install a new system add-on
 *     tags: [Super Admin - System Add-ons]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               addon:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Add-on installed
 */
router.post('/system-addons/upload', addonUpload.single('addon'), asyncHandler(SystemAddonController.uploadAddon));

/**
 * @swagger
 * /api/superadmin/system-addons/{id}/toggle:
 *   put:
 *     summary: Toggle system add-on active status
 *     tags: [Super Admin - System Add-ons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Add-on status toggled
 */
router.put('/system-addons/:id/toggle', asyncHandler(SystemAddonController.toggleAddon));

/**
 * @swagger
 * /api/superadmin/system-addons/{id}/icon:
 *   get:
 *     summary: Get system add-on icon
 *     tags: [Super Admin - System Add-ons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Add-on icon
 */
router.get('/system-addons/:id/icon', asyncHandler(SystemAddonController.getAddonIcon));

/**
 * @swagger
 * /api/superadmin/system-addons/{id}:
 *   delete:
 *     summary: Delete system add-on
 *     tags: [Super Admin - System Add-ons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Add-on deleted
 */
router.delete('/system-addons/:id', asyncHandler(SystemAddonController.deleteAddon));

module.exports = router;
