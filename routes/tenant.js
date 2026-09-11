/**
 * Tenant Routes
 * 
 * Routes for tenant admin operations
 * All routes require tenant authentication
 * 
 * @module routes/tenant
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const ApiIntegrationController = require('../controllers/ApiIntegrationController');
const { requireAuth } = require('../middleware/auth');
const { tenantMiddleware, requireTenant } = require('../middleware/tenant');
const { checkResourceLimit, checkFeatureEnabled } = require('../middleware/planLimits');
const { getActiveAddons, checkAddonStatus } = require('../middleware/addonCheck');
const TenantDashboardController = require('../controllers/TenantDashboardController');
const ChatController = require('../controllers/ChatController');
const ContactController = require('../controllers/ContactController');
const FAQController = require('../controllers/FAQController');
const MassSendController = require('../controllers/MassSendController');
const InvoiceController = require('../controllers/InvoiceController');
const WidgetController = require('../controllers/WidgetController');
const WooCommerceController = require('../controllers/WooCommerceController');
const AIController = require('../controllers/AIController');
const PaymentLinkController = require('../controllers/PaymentLinkController');
const StoreController = require('../controllers/StoreController');
const DepartmentController = require('../controllers/DepartmentController');
const TenantUserController = require('../controllers/TenantUserController');
const PlanLimitsController = require('../controllers/PlanLimitsController');
const ProfileController = require('../controllers/ProfileController');
const AuthController = require('../controllers/AuthController');

// Configure multer for file uploads with proper filename
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // Generate unique filename with proper extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        
        // Get extension from original filename
        let ext = path.extname(file.originalname).toLowerCase();
        
        // CRITICAL FIX: If extension is generic or missing, detect from mimetype
        if (!ext || ext === '.bin' || ext === '.blob') {
            const mimeToExt = {
                'image/jpeg': '.jpg',
                'image/png': '.png',
                'image/gif': '.gif',
                'image/webp': '.webp',
                'video/mp4': '.mp4',
                'video/webm': '.webm',
                'video/quicktime': '.mov',
                'audio/webm': '.webm',
                'audio/ogg': '.ogg',
                'audio/mpeg': '.mp3',
                'audio/mp4': '.m4a',
                'audio/wav': '.wav',
                'application/pdf': '.pdf',
                'application/msword': '.doc',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
                'application/vnd.ms-excel': '.xls',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
            };
            ext = mimeToExt[file.mimetype] || ext || '.bin';
        }
        
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit for large videos
    }
});

// Note: requireAuth and tenantMiddleware are applied globally in server.js for /api/tenant/* routes
// Only apply requireTenant to ensure tenant context is present
router.use(requireTenant);

// ==================== ACTIVE ADDONS ====================

/**
 * @swagger
 * /api/tenant/active-addons:
 *   get:
 *     summary: Get list of active system addons
 *     tags: [Tenant Addons]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active addons with their slugs
 */
router.get('/active-addons', async (req, res) => {
  try {
    const addons = await getActiveAddons();
    res.json({
      success: true,
      data: {
        addons: addons.map(addon => ({
          slug: addon.slug,
          name: addon.name,
          icon: addon.icon
        }))
      }
    });
  } catch (error) {
    console.error('Error getting active addons:', error);
    res.status(500).json({ success: false, message: 'Error getting active addons' });
  }
});

/**
 * @swagger
 * /api/tenant/addon-status/{slug}:
 *   get:
 *     summary: Check if a specific addon is active
 *     tags: [Tenant Addons]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Addon status
 */
router.get('/addon-status/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const status = await checkAddonStatus(slug);
    res.json({
      success: true,
      data: {
        slug,
        installed: status.installed,
        active: status.active
      }
    });
  } catch (error) {
    console.error('Error checking addon status:', error);
    res.status(500).json({ success: false, message: 'Error checking addon status' });
  }
});

// ==================== PLAN LIMITS ====================

/**
 * @swagger
 * /api/tenant/plan-limits:
 *   get:
 *     summary: Get plan limits and current usage
 *     tags: [Tenant Plan]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Plan limits and usage information
 */
router.get('/plan-limits', PlanLimitsController.getLimits);

/**
 * @swagger
 * /api/tenant/feature-status/{feature}:
 *   get:
 *     summary: Get feature status with addon availability
 *     tags: [Tenant Plan]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: feature
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ai, woocommerce, mass_send, payments, invoices, quotes, widgets, payment_links]
 *     responses:
 *       200:
 *         description: Feature status information
 */
router.get('/feature-status/:feature', PlanLimitsController.getFeatureStatus);

/**
 * @swagger
 * /api/tenant/plan-limits/{resource}:
 *   get:
 *     summary: Get specific resource usage
 *     tags: [Tenant Plan]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resource
 *         required: true
 *         schema:
 *           type: string
 *           enum: [stores, users, departments, contacts, devices, conversations, faqs, contact_groups]
 *     responses:
 *       200:
 *         description: Resource usage information
 */
router.get('/plan-limits/:resource', PlanLimitsController.getResourceUsage);

router.get('/api-keys', checkFeatureEnabled('api_access'), ApiIntegrationController.getApiKeys);
router.post('/api-keys', checkFeatureEnabled('api_access'), ApiIntegrationController.createApiKey);
router.delete('/api-keys/:id', checkFeatureEnabled('api_access'), ApiIntegrationController.revokeApiKey);

router.get('/webhooks', checkFeatureEnabled('api_access'), ApiIntegrationController.getWebhooks);
router.post('/webhooks', checkFeatureEnabled('api_access'), ApiIntegrationController.createWebhook);
router.put('/webhooks/:id', checkFeatureEnabled('api_access'), ApiIntegrationController.updateWebhook);
router.delete('/webhooks/:id', checkFeatureEnabled('api_access'), ApiIntegrationController.deleteWebhook);

/**
 * @swagger
 * tags:
 *   name: Tenant Dashboard
 *   description: Tenant dashboard and metrics
 */

/**
 * @swagger
 * /api/tenant/dashboard:
 *   get:
 *     summary: Get dashboard metrics
 *     tags: [Tenant Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard metrics and statistics
 *       401:
 *         description: Unauthorized
 */
router.get('/dashboard', TenantDashboardController.getMetrics);

/**
 * @swagger
 * /api/tenant/dashboard/whatsapp-status:
 *   get:
 *     summary: Get WhatsApp connection status
 *     tags: [Tenant Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: WhatsApp connection status
 */
router.get('/dashboard/whatsapp-status', TenantDashboardController.getWhatsAppStatus);

/**
 * @swagger
 * /api/tenant/dashboard/whatsapp-init:
 *   post:
 *     summary: Initialize WhatsApp connection
 *     tags: [Tenant Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: WhatsApp initialized
 */
router.post('/dashboard/whatsapp-init', TenantDashboardController.initWhatsApp);

/**
 * @swagger
 * /api/tenant/dashboard/whatsapp-disconnect:
 *   post:
 *     summary: Disconnect WhatsApp
 *     tags: [Tenant Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: WhatsApp disconnected
 */
router.post('/dashboard/whatsapp-disconnect', TenantDashboardController.disconnectWhatsApp);

/**
 * @swagger
 * /api/tenant/dashboard/whatsapp-qr:
 *   get:
 *     summary: Get QR code for WhatsApp connection
 *     tags: [Tenant Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: QR code data
 */
router.get('/dashboard/whatsapp-qr', TenantDashboardController.getQRCode);

/**
 * @swagger
 * /api/tenant/dashboard/hourly-messages:
 *   get:
 *     summary: Get hourly message statistics
 *     tags: [Tenant Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hourly message statistics
 */
router.get('/dashboard/hourly-messages', TenantDashboardController.getHourlyMessages);

// ==================== CONVERSATIONS / CHAT ====================
// Note: Conversation routes are mounted separately at /api/tenant/conversations
// See routes/conversations.js and server.js line 176



// ==================== FILE UPLOAD ====================

/**
 * @swagger
 * /api/tenant/upload:
 *   post:
 *     summary: Upload file (image, video, document, audio)
 *     tags: [Tenant Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               conversationId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: File uploaded successfully
 */
router.post('/upload', (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({
                    success: false,
                    message: 'File too large. Maximum size is 100MB.'
                });
            }
            console.error('Upload error:', err);
            return res.status(500).json({
                success: false,
                message: 'Error uploading file',
                error: err.message
            });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const fileUrl = `/uploads/${req.file.filename}`;
        
        res.json({
            success: true,
            url: fileUrl,
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading file',
            error: error.message
        });
    }
});

// ==================== CONTACTS ====================
// Mount contact routes
router.use('/', require('./contacts'));

// ==================== FAQs ====================
// FAQ routes are now in routes/faq.js and mounted at /api/tenant/faqs

// ==================== Mass Send ====================
// Mass Send routes are now in routes/mass-send.js and mounted at /api/tenant/mass-send

// ==================== INVOICES ====================
// Invoice routes are now in routes/invoices.js and mounted at /api/invoices

// ==================== WIDGET ====================
// Widget routes are now in routes/widget.js and mounted at /api/widget

// ==================== WOOCOMMERCE ====================

router.get('/woocommerce/settings', WooCommerceController.getSettings);
router.post('/woocommerce/settings', WooCommerceController.saveSettings);
router.post('/woocommerce/test-connection', WooCommerceController.testConnectionEndpoint);
router.post('/woocommerce/sync-products', WooCommerceController.syncProducts);
router.get('/woocommerce/products', WooCommerceController.getProducts);
router.get('/woocommerce/products/:id', WooCommerceController.getProduct);
router.delete('/woocommerce/settings', WooCommerceController.deleteSettings);

// ==================== AI CONFIGURATION ====================

router.get('/ai/config', AIController.getConfig);
router.put('/ai/config', AIController.updateConfig);
router.post('/ai/test', AIController.testAI);

// ==================== PAYMENT LINKS ====================

router.get('/payment-links', PaymentLinkController.getLinks);
router.post('/payment-links', checkFeatureEnabled('payment_links'), checkResourceLimit('payment_links'), PaymentLinkController.createLink);
router.put('/payment-links/:id', PaymentLinkController.updateLink);
router.delete('/payment-links/:id', PaymentLinkController.deleteLink);

// Payment creation endpoint for user panel
router.post('/payments/create-link', checkFeatureEnabled('payment_links'), checkResourceLimit('payment_links'), PaymentLinkController.createLink);

// ==================== STORES ====================

/**
 * @swagger
 * /api/tenant/stores:
 *   get:
 *     summary: Get all stores
 *     tags: [Tenant Stores]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of stores
 */
router.get('/stores', StoreController.getStores);

/**
 * @swagger
 * /api/tenant/stores/{id}:
 *   get:
 *     summary: Get single store
 *     tags: [Tenant Stores]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Store details
 */
router.get('/stores/:id', StoreController.getStore);

/**
 * @swagger
 * /api/tenant/stores:
 *   post:
 *     summary: Create store
 *     tags: [Tenant Stores]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Store created
 *       403:
 *         description: Store limit reached
 */
router.post('/stores', checkResourceLimit('stores'), StoreController.createStore);

/**
 * @swagger
 * /api/tenant/stores/{id}:
 *   put:
 *     summary: Update store
 *     tags: [Tenant Stores]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Store updated
 */
router.put('/stores/:id', StoreController.updateStore);

/**
 * @swagger
 * /api/tenant/stores/{id}:
 *   delete:
 *     summary: Delete store
 *     tags: [Tenant Stores]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Store deleted
 */
router.delete('/stores/:id', StoreController.deleteStore);

// ==================== DEPARTMENTS ====================

/**
 * @swagger
 * /api/tenant/departments:
 *   get:
 *     summary: Get all departments
 *     tags: [Tenant Departments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of departments
 */
router.get('/departments', DepartmentController.getDepartments);

/**
 * @swagger
 * /api/tenant/departments/{id}:
 *   get:
 *     summary: Get single department
 *     tags: [Tenant Departments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Department details
 */
router.get('/departments/:id', DepartmentController.getDepartment);

/**
 * @swagger
 * /api/tenant/departments:
 *   post:
 *     summary: Create department
 *     tags: [Tenant Departments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Department created
 *       403:
 *         description: Department limit reached
 */
router.post('/departments', checkResourceLimit('departments'), DepartmentController.createDepartment);

/**
 * @swagger
 * /api/tenant/departments/{id}:
 *   put:
 *     summary: Update department
 *     tags: [Tenant Departments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Department updated
 */
router.put('/departments/:id', DepartmentController.updateDepartment);

/**
 * @swagger
 * /api/tenant/departments/{id}:
 *   delete:
 *     summary: Delete department
 *     tags: [Tenant Departments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Department deleted
 */
router.delete('/departments/:id', DepartmentController.deleteDepartment);

// ==================== TENANT USERS ====================

/**
 * @swagger
 * /api/tenant/users:
 *   get:
 *     summary: Get all users
 *     tags: [Tenant Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *       - in: query
 *         name: store_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: department_id
 *         schema:
 *           type: integer
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/users', TenantUserController.getUsers);

/**
 * @swagger
 * /api/tenant/users/{id}:
 *   get:
 *     summary: Get single user
 *     tags: [Tenant Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User details
 */
router.get('/users/:id', TenantUserController.getUser);

/**
 * @swagger
 * /api/tenant/users:
 *   post:
 *     summary: Create user
 *     tags: [Tenant Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: User created
 *       403:
 *         description: User limit reached
 */
router.post('/users', checkResourceLimit('users'), TenantUserController.createUser);

/**
 * @swagger
 * /api/tenant/users/{id}:
 *   put:
 *     summary: Update user
 *     tags: [Tenant Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User updated
 */
router.put('/users/:id', TenantUserController.updateUser);

/**
 * @swagger
 * /api/tenant/users/{id}:
 *   delete:
 *     summary: Delete user
 *     tags: [Tenant Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User deleted
 */
router.delete('/users/:id', TenantUserController.deleteUser);

/**
 * @swagger
 * /api/tenant/users/{id}/toggle-active:
 *   put:
 *     summary: Toggle user active status
 *     tags: [Tenant Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User status toggled
 */
router.put('/users/:id/toggle-active', TenantUserController.toggleActive);

// ==================== PROFILE ====================

router.get('/admin-credentials', AuthController.getTenantAdminCredentials);
router.put('/admin-credentials', AuthController.updateTenantAdminCredentials);

/**
 * @swagger
 * /api/tenant/profile:
 *   get:
 *     summary: Get tenant profile
 *     tags: [Tenant Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tenant profile data
 */
router.get('/profile', ProfileController.getProfile);

/**
 * @swagger
 * /api/tenant/profile/colors:
 *   put:
 *     summary: Update profile colors
 *     tags: [Tenant Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Colors updated
 */
router.put('/profile/colors', ProfileController.updateColors);

/**
 * @swagger
 * /api/tenant/profile/logo:
 *   post:
 *     summary: Upload logo
 *     tags: [Tenant Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logo uploaded
 */
router.post('/profile/logo', ProfileController.uploadLogo);

/**
 * @swagger
 * /api/tenant/profile/logo:
 *   delete:
 *     summary: Delete logo
 *     tags: [Tenant Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logo deleted
 */
router.delete('/profile/logo', ProfileController.deleteLogo);

/**
 * @swagger
 * /api/tenant/profile/reset-colors:
 *   post:
 *     summary: Reset colors to default
 *     tags: [Tenant Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Colors reset
 */
router.post('/profile/reset-colors', ProfileController.resetColors);

// ==================== BOT SETTINGS ====================
const DEFAULT_END_CHAT_MESSAGE = "Obrigado(a) por entrar em contato!\n*Essa conversa foi encerrada*";

/**
 * @swagger
 * /api/tenant/bot-settings:
 *   get:
 *     summary: Get bot settings
 *     tags: [Tenant Bot]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bot settings
 */
router.get('/bot-settings', async (req, res) => {
  const { pool } = require('../config/database');
  try {
    const tenantId = req.user.tenantId;
    const [rows] = await pool.execute(
      'SELECT bot_enabled, group_enabled FROM tenants WHERE id = ?',
      [tenantId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }
    
    res.json({
      success: true,
      data: {
        bot_enabled: rows[0].bot_enabled === 1 || rows[0].bot_enabled === true,
        group_enabled: rows[0].group_enabled === 1 || rows[0].group_enabled === true
      }
    });
  } catch (error) {
    console.error('Error getting bot settings:', error);
    res.status(500).json({ success: false, error: 'Failed to get bot settings' });
  }
});

/**
 * @swagger
 * /api/tenant/bot-settings:
 *   put:
 *     summary: Update bot settings
 *     tags: [Tenant Bot]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bot settings updated
 */
router.put('/bot-settings', async (req, res) => {
  const { pool } = require('../config/database');
  try {
    const tenantId = req.user.tenantId;
    const { bot_enabled, group_enabled } = req.body;
    
    const updates = [];
    const values = [];
    
    if (bot_enabled !== undefined) {
      updates.push('bot_enabled = ?');
      values.push(bot_enabled ? 1 : 0);
    }
    
    if (group_enabled !== undefined) {
      updates.push('group_enabled = ?');
      values.push(group_enabled ? 1 : 0);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No settings to update' });
    }
    
    values.push(tenantId);
    
    await pool.execute(
      `UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    
    // Get updated settings
    const [rows] = await pool.execute(
      'SELECT bot_enabled, group_enabled FROM tenants WHERE id = ?',
      [tenantId]
    );
    
    res.json({
      success: true,
      message: 'Bot settings updated',
      data: {
        bot_enabled: rows[0].bot_enabled === 1 || rows[0].bot_enabled === true,
        group_enabled: rows[0].group_enabled === 1 || rows[0].group_enabled === true
      }
    });
  } catch (error) {
    console.error('Error updating bot settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update bot settings' });
  }
});

// ==================== END CHAT SETTINGS ====================

router.get('/end-chat-settings', async (req, res) => {
  const { pool } = require('../config/database');
  try {
    const tenantId = req.user.tenantId;
    const [rows] = await pool.execute(
      'SELECT settings FROM tenants WHERE id = ? LIMIT 1',
      [tenantId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }
    let settings = {};
    const raw = rows[0]?.settings;
    if (raw) {
      try {
        settings = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        settings = {};
      }
    }
    const message = settings.end_chat_message || DEFAULT_END_CHAT_MESSAGE;
    return res.json({ success: true, data: { message } });
  } catch (error) {
    console.error('Error getting end chat settings:', error);
    res.status(500).json({ success: false, error: 'Failed to get end chat settings' });
  }
});

router.put('/end-chat-settings', async (req, res) => {
  const { pool } = require('../config/database');
  try {
    const tenantId = req.user.tenantId;
    const message = (req.body?.message || '').toString();
    const [rows] = await pool.execute(
      'SELECT settings FROM tenants WHERE id = ? LIMIT 1',
      [tenantId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }
    let settings = {};
    const raw = rows[0]?.settings;
    if (raw) {
      try {
        settings = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        settings = {};
      }
    }
    settings.end_chat_message = message || DEFAULT_END_CHAT_MESSAGE;
    await pool.execute(
      'UPDATE tenants SET settings = ? WHERE id = ?',
      [JSON.stringify(settings), tenantId]
    );
    return res.json({
      success: true,
      message: 'End chat settings updated',
      data: { message: settings.end_chat_message }
    });
  } catch (error) {
    console.error('Error updating end chat settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update end chat settings' });
  }
});

module.exports = router;
