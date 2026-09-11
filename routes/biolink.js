/**
 * Bio Link Routes
 * Routes for bio link management
 * 
 * IMPORTANT: All routes require the 'biolink' addon to be installed and active
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAddon } = require('../middleware/addonCheck');
const BioLinkController = require('../controllers/BioLinkController');

// All routes require authentication
router.use(requireAuth);

// All routes require the biolink addon to be installed and active
router.use(requireAddon('biolink'));

// ==================== PROJECTS ====================

/**
 * @swagger
 * /api/biolink/projects:
 *   get:
 *     summary: Get all biolink projects
 *     tags: [Bio Link]
 */
router.get('/projects', asyncHandler(BioLinkController.getProjects));

/**
 * @swagger
 * /api/biolink/projects:
 *   post:
 *     summary: Create new biolink project
 *     tags: [Bio Link]
 */
router.post('/projects', asyncHandler(BioLinkController.createProject));

/**
 * @swagger
 * /api/biolink/projects/:id:
 *   get:
 *     summary: Get single project
 *     tags: [Bio Link]
 */
router.get('/projects/:id', asyncHandler(BioLinkController.getProject));

/**
 * @swagger
 * /api/biolink/projects/:id:
 *   put:
 *     summary: Update project
 *     tags: [Bio Link]
 */
router.put('/projects/:id', asyncHandler(BioLinkController.updateProject));

/**
 * @swagger
 * /api/biolink/projects/:id:
 *   delete:
 *     summary: Delete project
 *     tags: [Bio Link]
 */
router.delete('/projects/:id', asyncHandler(BioLinkController.deleteProject));

// ==================== BIO PAGES ====================

/**
 * @swagger
 * /api/biolink/pages/:id:
 *   put:
 *     summary: Update bio page settings
 *     tags: [Bio Link]
 */
router.put('/pages/:id', asyncHandler(BioLinkController.updateBioPage));

// ==================== BLOCKS ====================

/**
 * @swagger
 * /api/biolink/pages/:pageId/blocks:
 *   get:
 *     summary: Get blocks for a page
 *     tags: [Bio Link]
 */
router.get('/pages/:pageId/blocks', asyncHandler(BioLinkController.getBlocks));

/**
 * @swagger
 * /api/biolink/pages/:pageId/blocks:
 *   post:
 *     summary: Create new block
 *     tags: [Bio Link]
 */
router.post('/pages/:pageId/blocks', asyncHandler(BioLinkController.createBlock));

/**
 * @swagger
 * /api/biolink/pages/:pageId/blocks/reorder:
 *   put:
 *     summary: Reorder blocks
 *     tags: [Bio Link]
 */
router.put('/pages/:pageId/blocks/reorder', asyncHandler(BioLinkController.reorderBlocks));

/**
 * @swagger
 * /api/biolink/blocks/:blockId:
 *   put:
 *     summary: Update block
 *     tags: [Bio Link]
 */
router.put('/blocks/:blockId', asyncHandler(BioLinkController.updateBlock));

/**
 * @swagger
 * /api/biolink/blocks/:blockId:
 *   delete:
 *     summary: Delete block
 *     tags: [Bio Link]
 */
router.delete('/blocks/:blockId', asyncHandler(BioLinkController.deleteBlock));

// ==================== ANALYTICS ====================

/**
 * @swagger
 * /api/biolink/projects/:projectId/analytics:
 *   get:
 *     summary: Get analytics for project
 *     tags: [Bio Link]
 */
router.get('/projects/:projectId/analytics', asyncHandler(BioLinkController.getAnalytics));

// ==================== UTILITIES ====================

/**
 * @swagger
 * /api/biolink/limits:
 *   get:
 *     summary: Get tenant's biolink limits
 *     tags: [Bio Link]
 */
router.get('/limits', asyncHandler(BioLinkController.getLimits));

/**
 * @swagger
 * /api/biolink/block-types:
 *   get:
 *     summary: Get available block types
 *     tags: [Bio Link]
 */
router.get('/block-types', asyncHandler(BioLinkController.getBlockTypes));

module.exports = router;
