/**
 * Pipeline Stages Controller
 * Manages pipeline stages for tenant (admin can create/edit/delete)
 * Users can only move conversations between stages
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');

class PipelineStagesController extends BaseController {
  /**
   * Get all pipeline stages for tenant
   * GET /api/admin/pipeline-stages
   */
  static async getStages(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      const [stages] = await pool.execute(`
        SELECT id, stage_key, stage_name, stage_color, stage_icon, stage_order, is_default, active
        FROM pipeline_stages
        WHERE tenant_id = ?
        ORDER BY stage_order ASC
      `, [tenantId]);

      return res.json({
        success: true,
        data: stages
      });
    } catch (error) {
      logger.error('Error getting pipeline stages', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to load pipeline stages'
      });
    }
  }

  /**
   * Create new pipeline stage
   * POST /api/admin/pipeline-stages
   */
  static async createStage(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { stage_key, stage_name, stage_color, stage_icon, stage_order } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      if (!stage_key || !stage_name) {
        return res.status(400).json({
          success: false,
          message: 'Stage key and name are required'
        });
      }

      // Check if stage key already exists
      const [existing] = await pool.execute(`
        SELECT id FROM pipeline_stages 
        WHERE tenant_id = ? AND stage_key = ?
      `, [tenantId, stage_key]);

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Stage key already exists'
        });
      }

      // Get next order if not provided
      let order = stage_order;
      if (!order) {
        const [maxOrder] = await pool.execute(`
          SELECT COALESCE(MAX(stage_order), 0) + 1 as next_order
          FROM pipeline_stages
          WHERE tenant_id = ?
        `, [tenantId]);
        order = maxOrder[0].next_order;
      }

      // Insert new stage
      const [result] = await pool.execute(`
        INSERT INTO pipeline_stages (tenant_id, stage_key, stage_name, stage_color, stage_icon, stage_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [tenantId, stage_key, stage_name, stage_color || '#6b7280', stage_icon || 'fas fa-circle', order]);

      // Get the created stage
      const [newStage] = await pool.execute(`
        SELECT id, stage_key, stage_name, stage_color, stage_icon, stage_order, is_default, active
        FROM pipeline_stages
        WHERE id = ?
      `, [result.insertId]);

      // Emit to all users in tenant
      const io = req.app.get('io');
      if (io) {
        io.to(`TENANT:${tenantId}`).emit('pipeline-stage-created', {
          stage: newStage[0]
        });
      }

      return res.json({
        success: true,
        data: newStage[0],
        message: 'Pipeline stage created successfully'
      });
    } catch (error) {
      logger.error('Error creating pipeline stage', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to create pipeline stage'
      });
    }
  }

  /**
   * Update pipeline stage
   * PUT /api/admin/pipeline-stages/:id
   */
  static async updateStage(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const stageId = req.params.id;
      const { stage_name, stage_color, stage_icon, stage_order } = req.body;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      // Check if stage exists and belongs to tenant
      const [existing] = await pool.execute(`
        SELECT id, is_default FROM pipeline_stages 
        WHERE id = ? AND tenant_id = ?
      `, [stageId, tenantId]);

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Pipeline stage not found'
        });
      }

      // Build update query
      const updates = [];
      const values = [];

      if (stage_name) {
        updates.push('stage_name = ?');
        values.push(stage_name);
      }
      if (stage_color) {
        updates.push('stage_color = ?');
        values.push(stage_color);
      }
      if (stage_icon) {
        updates.push('stage_icon = ?');
        values.push(stage_icon);
      }
      if (stage_order !== undefined) {
        updates.push('stage_order = ?');
        values.push(stage_order);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }

      values.push(stageId, tenantId);

      await pool.execute(`
        UPDATE pipeline_stages 
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = ? AND tenant_id = ?
      `, values);

      // Get updated stage
      const [updatedStage] = await pool.execute(`
        SELECT id, stage_key, stage_name, stage_color, stage_icon, stage_order, is_default, active
        FROM pipeline_stages
        WHERE id = ?
      `, [stageId]);

      // Emit to all users in tenant
      const io = req.app.get('io');
      if (io) {
        io.to(`TENANT:${tenantId}`).emit('pipeline-stage-updated', {
          stage: updatedStage[0]
        });
      }

      return res.json({
        success: true,
        data: updatedStage[0],
        message: 'Pipeline stage updated successfully'
      });
    } catch (error) {
      logger.error('Error updating pipeline stage', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to update pipeline stage'
      });
    }
  }

  /**
   * Delete pipeline stage
   * DELETE /api/admin/pipeline-stages/:id
   */
  static async deleteStage(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const stageId = req.params.id;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      // Check if stage exists and belongs to tenant
      const [existing] = await pool.execute(`
        SELECT id, stage_key, is_default FROM pipeline_stages 
        WHERE id = ? AND tenant_id = ?
      `, [stageId, tenantId]);

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Pipeline stage not found'
        });
      }

      // Don't allow deleting default stages
      if (existing[0].is_default) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete default pipeline stage'
        });
      }

      // Check if stage has conversations
      const [conversations] = await pool.execute(`
        SELECT COUNT(*) as count FROM whatsapp_cloud_conversations 
        WHERE tenant_id = ? AND stage_id = ?
      `, [tenantId, existing[0].stage_key]);

      if (conversations[0].count > 0) {
        // Move conversations to 'unassigned' before deleting the stage
        await pool.execute(`
          UPDATE whatsapp_cloud_conversations
          SET stage_id = 'unassigned', updated_at = NOW()
          WHERE tenant_id = ? AND stage_id = ?
        `, [tenantId, existing[0].stage_key]);
      }

      // Delete stage
      await pool.execute(`
        DELETE FROM pipeline_stages 
        WHERE id = ? AND tenant_id = ?
      `, [stageId, tenantId]);

      // Emit to all users in tenant
      const io = req.app.get('io');
      if (io) {
        io.to(`TENANT:${tenantId}`).emit('pipeline-stage-deleted', {
          stageId: parseInt(stageId),
          stageKey: existing[0].stage_key
        });
      }

      return res.json({
        success: true,
        message: 'Pipeline stage deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting pipeline stage', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to delete pipeline stage'
      });
    }
  }

  /**
   * Reorder pipeline stages
   * PUT /api/admin/pipeline-stages/reorder
   */
  static async reorderStages(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { stages } = req.body; // Array of {id, order}

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found'
        });
      }

      if (!Array.isArray(stages)) {
        return res.status(400).json({
          success: false,
          message: 'Stages array is required'
        });
      }

      // Update order for each stage
      for (const stage of stages) {
        await pool.execute(`
          UPDATE pipeline_stages 
          SET stage_order = ?, updated_at = NOW()
          WHERE id = ? AND tenant_id = ?
        `, [stage.order, stage.id, tenantId]);
      }

      // Get updated stages
      const [updatedStages] = await pool.execute(`
        SELECT id, stage_key, stage_name, stage_color, stage_icon, stage_order, is_default, active
        FROM pipeline_stages
        WHERE tenant_id = ?
        ORDER BY stage_order ASC
      `, [tenantId]);

      // Emit to all users in tenant
      const io = req.app.get('io');
      if (io) {
        io.to(`TENANT:${tenantId}`).emit('pipeline-stages-reordered', {
          stages: updatedStages
        });
      }

      return res.json({
        success: true,
        data: updatedStages,
        message: 'Pipeline stages reordered successfully'
      });
    } catch (error) {
      logger.error('Error reordering pipeline stages', {
        error: error.message,
        stack: error.stack
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to reorder pipeline stages'
      });
    }
  }
}

module.exports = PipelineStagesController;
