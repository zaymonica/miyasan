/**
 * Public Routes
 * Routes accessible without authentication
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { asyncHandler } = require('../middleware/errorHandler');
const SuperAdminController = require('../controllers/SuperAdminController');
const PaymentGatewayController = require('../controllers/PaymentGatewayController');
const { pool } = require('../config/database');

/**
 * Check if a file exists in the public folder
 */
function fileExists(filePath) {
  if (!filePath) return false;
  const fullPath = path.join(__dirname, '../public', filePath);
  return fs.existsSync(fullPath);
}

/**
 * @swagger
 * /api/public/branding:
 *   get:
 *     summary: Get system branding (logo, favicon, name)
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: System branding settings
 */
router.get('/branding', asyncHandler(async (req, res) => {
  const [settings] = await pool.execute(
    `SELECT setting_key, setting_value FROM system_settings_kv 
     WHERE setting_key IN ('system_name', 'system_logo', 'favicon', 'support_email')`
  );

  const data = {};
  settings.forEach(s => {
    data[s.setting_key] = s.setting_value;
  });

  // Also get from landing_page_settings as fallback
  const [landing] = await pool.execute(
    'SELECT company_name, company_logo, contact_email FROM landing_page_settings WHERE id = 1'
  );

  if (landing[0]) {
    if (!data.system_name) data.system_name = landing[0].company_name;
    if (!data.system_logo) data.system_logo = landing[0].company_logo;
    if (!data.support_email) data.support_email = landing[0].contact_email;
  }

  // Verify files exist - return null if they don't
  const systemLogo = data.system_logo && fileExists(data.system_logo) ? data.system_logo : null;
  const favicon = data.favicon && fileExists(data.favicon) ? data.favicon : null;

  return res.json({
    success: true,
    data: {
      system_name: data.system_name || 'Misayan SaaS',
      system_logo: systemLogo,
      favicon: favicon,
      support_email: data.support_email || ''
    }
  });
}));

router.get('/default-language', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT setting_value FROM system_settings_kv WHERE setting_key = 'default_language' LIMIT 1`
  );
  const code = rows && rows[0] && rows[0].setting_value ? rows[0].setting_value : 'en';
  return res.json({ success: true, data: { code } });
}));

router.get('/default-currency', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT code, symbol FROM currencies WHERE is_default = TRUE AND active = TRUE ORDER BY id LIMIT 1`
  );
  const currency = rows && rows[0] ? rows[0] : { code: 'USD', symbol: '$' };
  return res.json({ success: true, data: { code: currency.code, symbol: currency.symbol || currency.code } });
}));

/**
 * @swagger
 * /api/public/register:
 *   post:
 *     summary: Register new tenant (public)
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - plan_id
 *               - admin_username
 *               - admin_password
 *             properties:
 *               name:
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
 *               admin_name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Tenant created successfully
 */
router.post('/register', asyncHandler(SuperAdminController.createTenant));

/**
 * @swagger
 * /api/public/payment-gateways:
 *   get:
 *     summary: Get enabled payment gateways
 *     tags: [Public]
 *     responses:
 *       200:
 *         description: List of enabled payment gateways
 */
router.get('/payment-gateways', asyncHandler(PaymentGatewayController.getEnabledGateways));

/**
 * @swagger
 * /api/public/create-payment-session:
 *   post:
 *     summary: Create payment session for new tenant
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenant_id
 *               - plan_id
 *               - gateway
 *             properties:
 *               tenant_id:
 *                 type: integer
 *               plan_id:
 *                 type: integer
 *               gateway:
 *                 type: string
 *                 enum: [stripe, paypal, cash]
 *     responses:
 *       200:
 *         description: Payment session created
 */
router.post('/create-payment-session', asyncHandler(PaymentGatewayController.createPaymentSession));

/**
 * @swagger
 * /api/public/payment-instructions:
 *   get:
 *     summary: Get payment instructions for tenant
 *     tags: [Public]
 *     parameters:
 *       - in: query
 *         name: tenant
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Payment instructions
 */
router.get('/payment-instructions', asyncHandler(PaymentGatewayController.getPaymentInstructions));

/**
 * @swagger
 * /api/public/verify-payment:
 *   post:
 *     summary: Verify payment after redirect from gateway
 *     tags: [Public]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               session_id:
 *                 type: string
 *               order_id:
 *                 type: string
 *               tenant_id:
 *                 type: integer
 *               gateway:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified
 */
router.post('/verify-payment', asyncHandler(PaymentGatewayController.verifyPayment));

module.exports = router;
