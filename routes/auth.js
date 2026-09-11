/**
 * Authentication Routes
 * 
 * @module routes/auth
 */

const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Generic Login (Auto-detect user type)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', asyncHandler(AuthController.genericLogin));

// Password Reset Routes
router.post('/forgot-password', asyncHandler(AuthController.requestPasswordReset));
router.post('/reset-password', asyncHandler(AuthController.resetPassword));

/**
 * @swagger
 * /api/auth/superadmin/login:
 *   post:
 *     summary: Super Admin Login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/superadmin/login', asyncHandler(AuthController.superAdminLogin));

/**
 * @swagger
 * /api/auth/admin/login:
 *   post:
 *     summary: Tenant Admin Login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               subdomain:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/admin/login', asyncHandler(AuthController.tenantAdminLogin));

/**
 * @swagger
 * /api/auth/user/login:
 *   post:
 *     summary: User Login (Tenant Employee)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/user/login', asyncHandler(AuthController.userLogin));

/**
 * @swagger
 * /api/auth/verify:
 *   get:
 *     summary: Verify JWT Token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *       401:
 *         description: Invalid token
 */
router.get('/verify', requireAuth, asyncHandler(AuthController.verifyToken));

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user info
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User info retrieved
 *       401:
 *         description: Unauthorized
 */
router.get('/me', requireAuth, asyncHandler(AuthController.verifyToken));

module.exports = router;
