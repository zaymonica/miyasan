/**
 * Admin Routes
 * Routes for tenant admin operations
 * Adapted from 2.0 system for multi-tenant SaaS
 * 
 * @module routes/admin
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { requireTenant } = require('../middleware/tenant');
const { logger } = require('../config/logger');

// All routes require admin authentication and tenant context
router.use(requireAuth, requireAdmin, requireTenant);

/**
 * Get WhatsApp connection status
 * GET /api/admin/whatsapp-status
 */
router.get('/whatsapp-status', (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    
    logger.info('WhatsApp status request', { 
      tenantId, 
      reqTenantId: req.tenantId,
      userTenantId: req.user?.tenantId,
      userId: req.user?.id,
      userRole: req.user?.role
    });
    
    if (!tenantId) {
      return res.status(400).json({ 
        error: 'Tenant ID not found',
        debug: {
          reqTenantId: req.tenantId,
          userTenantId: req.user?.tenantId,
          user: req.user
        }
      });
    }
    
    const { getWhatsAppService } = require('../services/WhatsAppService');
    const whatsappService = getWhatsAppService(req.app.get('io'));
    
    const status = whatsappService.getStatus(tenantId);
    res.json(status);
  } catch (error) {
    logger.error('Error getting WhatsApp status', { error: error.message, tenantId: req.tenantId });
    res.status(500).json({ error: 'Error getting WhatsApp status' });
  }
});

/**
 * Reconnect/Initialize WhatsApp
 * POST /api/admin/whatsapp-reconnect
 */
router.post('/whatsapp-reconnect', async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    
    logger.info('WhatsApp reconnect request', { 
      tenantId, 
      reqTenantId: req.tenantId,
      userTenantId: req.user?.tenantId,
      userId: req.user?.id,
      userRole: req.user?.role
    });
    
    if (!tenantId) {
      return res.status(400).json({ 
        error: 'Tenant ID not found',
        debug: {
          reqTenantId: req.tenantId,
          userTenantId: req.user?.tenantId,
          user: req.user
        }
      });
    }
    
    const { getWhatsAppService } = require('../services/WhatsAppService');
    const whatsappService = getWhatsAppService(req.app.get('io'));
    
    await whatsappService.initializeTenant(tenantId);
    
    logger.info('WhatsApp reconnection initiated', { tenantId });
    res.json({ success: true, message: 'Reconnection initiated' });
  } catch (error) {
    logger.error('Error reconnecting WhatsApp', { 
      error: error.message, 
      stack: error.stack,
      tenantId: req.tenantId 
    });
    res.status(500).json({ error: error.message || 'Error reconnecting WhatsApp' });
  }
});

/**
 * Disconnect WhatsApp
 * POST /api/admin/whatsapp-disconnect
 */
router.post('/whatsapp-disconnect', async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found' });
    }
    
    const { getWhatsAppService } = require('../services/WhatsAppService');
    const whatsappService = getWhatsAppService(req.app.get('io'));
    
    await whatsappService.disconnect(tenantId);
    
    logger.info('WhatsApp disconnected', { tenantId });
    res.json({ success: true, message: 'Disconnected successfully' });
  } catch (error) {
    logger.error('Error disconnecting WhatsApp', { error: error.message, tenantId: req.tenantId });
    res.status(500).json({ error: 'Error disconnecting WhatsApp' });
  }
});

/**
 * Clear WhatsApp session
 * POST /api/admin/whatsapp-clear-session
 */
router.post('/whatsapp-clear-session', async (req, res) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID not found' });
    }
    
    const { getWhatsAppService } = require('../services/WhatsAppService');
    const whatsappService = getWhatsAppService(req.app.get('io'));
    
    await whatsappService.clearSession(tenantId);
    
    logger.info('WhatsApp session cleared', { tenantId });
    res.json({ success: true, message: 'Session cleared successfully' });
  } catch (error) {
    logger.error('Error clearing WhatsApp session', { error: error.message, tenantId: req.tenantId });
    res.status(500).json({ error: 'Error clearing WhatsApp session' });
  }
});

// Pipeline Stages Management Routes
const PipelineStagesController = require('../controllers/PipelineStagesController');

/**
 * Get all pipeline stages
 * GET /api/admin/pipeline-stages
 */
router.get('/pipeline-stages', PipelineStagesController.getStages);

/**
 * Create new pipeline stage
 * POST /api/admin/pipeline-stages
 */
router.post('/pipeline-stages', PipelineStagesController.createStage);

/**
 * Update pipeline stage
 * PUT /api/admin/pipeline-stages/:id
 */
router.put('/pipeline-stages/:id', PipelineStagesController.updateStage);

/**
 * Delete pipeline stage
 * DELETE /api/admin/pipeline-stages/:id
 */
router.delete('/pipeline-stages/:id', PipelineStagesController.deleteStage);

/**
 * Reorder pipeline stages
 * PUT /api/admin/pipeline-stages/reorder
 */
router.put('/pipeline-stages/reorder', PipelineStagesController.reorderStages);

module.exports = router;
