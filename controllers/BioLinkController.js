/**
 * Bio Link Controller
 * Manages bio link pages, short links, QR codes, files, vcards, and events
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const { ValidationError, NotFoundError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

/**
 * Helper to get tenant ID from request
 */
function getTenantId(req) {
  return req.tenantId || req.user?.tenantId || req.user?.tenant_id;
}

class BioLinkController extends BaseController {
  
  // ==================== PROJECTS ====================
  
  /**
   * Get all projects for tenant
   */
  static async getProjects(req, res) {
    try {
      // tenant_id can be in req.tenantId (from middleware) or req.user.tenantId (from token)
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;
      
      if (!tenantId) {
        logger.error('No tenant_id in getProjects', { user: req.user, tenantId: req.tenantId });
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }
      
      const { type, status, page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      // Check if table exists first
      try {
        await pool.execute('SELECT 1 FROM biolink_projects LIMIT 1');
      } catch (tableError) {
        // Table doesn't exist yet, return empty
        logger.warn('biolink_projects table does not exist yet');
        return res.json({
          success: true,
          data: {
            projects: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0
            }
          }
        });
      }

      let query = `
        SELECT p.*, 
          (SELECT COUNT(*) FROM biolink_analytics WHERE project_id = p.id) as total_views
        FROM biolink_projects p
        WHERE p.tenant_id = ?
      `;
      const params = [tenantId];

      if (type) {
        query += ' AND p.type = ?';
        params.push(type);
      }

      if (status) {
        query += ' AND p.status = ?';
        params.push(status);
      }

      query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const [projects] = await pool.execute(query, params);

      // Get total count
      let countQuery = 'SELECT COUNT(*) as total FROM biolink_projects WHERE tenant_id = ?';
      const countParams = [tenantId];
      if (type) {
        countQuery += ' AND type = ?';
        countParams.push(type);
      }
      if (status) {
        countQuery += ' AND status = ?';
        countParams.push(status);
      }

      const [countResult] = await pool.execute(countQuery, countParams);

      return res.json({
        success: true,
        data: {
          projects,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: countResult[0].total,
            pages: Math.ceil(countResult[0].total / limit)
          }
        }
      });
    } catch (error) {
      logger.error('Error getting biolink projects', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Create new project
   */
  static async createProject(req, res) {
    try {
      const tenantId = getTenantId(req);
      
      if (!tenantId) {
        logger.error('No tenant_id in createProject', { user: req.user, tenantId: req.tenantId });
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }
      
      const userId = req.user?.id;
      const { name, type = 'biopage', slug } = req.body;

      if (!name) {
        return res.status(400).json({ success: false, message: 'Name is required' });
      }

      // Check limits (with error handling)
      try {
        const limitCheck = await BioLinkController.checkResourceLimit(tenantId, type);
        if (!limitCheck.allowed) {
          return res.status(403).json({ 
            success: false, 
            message: `You have reached your ${type} limit (${limitCheck.current}/${limitCheck.max})` 
          });
        }
      } catch (limitError) {
        // If limit check fails (columns don't exist), allow creation
        logger.warn('Limit check failed, allowing creation', { error: limitError.message });
      }

      // Generate unique slug
      const finalSlug = slug || BioLinkController.generateSlug(name);
      
      // Check if slug exists
      const [existing] = await pool.execute(
        'SELECT id FROM biolink_projects WHERE slug = ?',
        [finalSlug]
      );

      if (existing.length > 0) {
        return res.status(400).json({ success: false, message: 'Slug already exists' });
      }

      const [result] = await pool.execute(
        `INSERT INTO biolink_projects (tenant_id, user_id, name, slug, type, status)
         VALUES (?, ?, ?, ?, ?, 'draft')`,
        [tenantId, userId, name, finalSlug, type]
      );

      const projectId = result.insertId;

      // Create associated record based on type
      if (type === 'biopage') {
        try {
          await pool.execute(
            `INSERT INTO biolink_pages (project_id, tenant_id, title, background_type, background_value, text_color) 
             VALUES (?, ?, ?, 'color', '#ffffff', '#000000')`,
            [projectId, tenantId, name]
          );
        } catch (queryError) {
          // Fallback if tenant_id column doesn't exist
          if (queryError.code === 'ER_BAD_FIELD_ERROR') {
            await pool.execute(
              `INSERT INTO biolink_pages (project_id, title, background_type, background_value, text_color) 
               VALUES (?, ?, 'color', '#ffffff', '#000000')`,
              [projectId, name]
            );
          } else {
            throw queryError;
          }
        }
      }

      logger.info('Biolink project created', { projectId, type, tenantId });

      return res.status(201).json({
        success: true,
        message: 'Project created successfully',
        data: { id: projectId, slug: finalSlug }
      });
    } catch (error) {
      logger.error('Error creating biolink project', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get single project
   */
  static async getProject(req, res) {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const [projects] = await pool.execute(
        `SELECT p.*, 
          (SELECT COUNT(*) FROM biolink_analytics WHERE project_id = p.id) as total_views
         FROM biolink_projects p
         WHERE p.id = ? AND p.tenant_id = ?`,
        [id, tenantId]
      );

      if (projects.length === 0) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }

      const project = projects[0];

      // Get associated data based on type
      if (project.type === 'biopage') {
        const [pages] = await pool.execute(
          'SELECT * FROM biolink_pages WHERE project_id = ?',
          [id]
        );
        project.page = pages[0] || null;

        if (project.page) {
          // Try with position first, fallback to sort_order
          let blocks;
          try {
            [blocks] = await pool.execute(
              'SELECT * FROM biolink_blocks WHERE page_id = ? ORDER BY position',
              [project.page.id]
            );
          } catch (queryError) {
            if (queryError.code === 'ER_BAD_FIELD_ERROR') {
              [blocks] = await pool.execute(
                'SELECT * FROM biolink_blocks WHERE page_id = ? ORDER BY sort_order',
                [project.page.id]
              );
            } else {
              throw queryError;
            }
          }
          project.page.blocks = blocks;
        }
      }

      return res.json({ success: true, data: project });
    } catch (error) {
      logger.error('Error getting biolink project', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update project
   */
  static async updateProject(req, res) {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;
      const { name, status, slug } = req.body;

      // Check ownership
      const [existing] = await pool.execute(
        'SELECT id FROM biolink_projects WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }

      const updates = [];
      const params = [];

      if (name) {
        updates.push('name = ?');
        params.push(name);
      }
      if (status) {
        updates.push('status = ?');
        params.push(status);
      }
      if (slug) {
        // Check if new slug exists
        const [slugExists] = await pool.execute(
          'SELECT id FROM biolink_projects WHERE slug = ? AND id != ?',
          [slug, id]
        );
        if (slugExists.length > 0) {
          return res.status(400).json({ success: false, message: 'Slug already exists' });
        }
        updates.push('slug = ?');
        params.push(slug);
      }

      if (updates.length > 0) {
        params.push(id);
        await pool.execute(
          `UPDATE biolink_projects SET ${updates.join(', ')} WHERE id = ?`,
          params
        );
      }

      return res.json({ success: true, message: 'Project updated successfully' });
    } catch (error) {
      logger.error('Error updating biolink project', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete project
   */
  static async deleteProject(req, res) {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;

      const [result] = await pool.execute(
        'DELETE FROM biolink_projects WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Project not found' });
      }

      logger.info('Biolink project deleted', { projectId: id, tenantId });

      return res.json({ success: true, message: 'Project deleted successfully' });
    } catch (error) {
      logger.error('Error deleting biolink project', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==================== BIO PAGES ====================

  /**
   * Update bio page settings
   */
  static async updateBioPage(req, res) {
    try {
      const tenantId = getTenantId(req);
      const { id } = req.params;
      const updates = req.body;

      // Check ownership
      const [pages] = await pool.execute(
        `SELECT bp.* FROM biolink_pages bp
         JOIN biolink_projects p ON bp.project_id = p.id
         WHERE bp.id = ? AND bp.tenant_id = ?`,
        [id, tenantId]
      );

      if (pages.length === 0) {
        return res.status(404).json({ success: false, message: 'Page not found' });
      }

      const allowedFields = [
        'title', 'description', 'avatar_url', 'background_type', 'background_value',
        'text_color', 'button_style', 'font_family', 'custom_css', 'seo_title',
        'seo_description', 'seo_image', 'favicon', 'analytics_code', 'custom_js',
        'password', 'sensitive_content', 'leap_link'
      ];

      const updateFields = [];
      const params = [];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          updateFields.push(`${field} = ?`);
          if (field === 'button_style' && typeof updates[field] === 'object') {
            params.push(JSON.stringify(updates[field]));
          } else {
            params.push(updates[field]);
          }
        }
      }

      if (updateFields.length > 0) {
        params.push(id);
        await pool.execute(
          `UPDATE biolink_pages SET ${updateFields.join(', ')} WHERE id = ?`,
          params
        );
      }

      return res.json({ success: true, message: 'Page updated successfully' });
    } catch (error) {
      logger.error('Error updating bio page', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==================== BLOCKS ====================

  /**
   * Get blocks for a page
   */
  static async getBlocks(req, res) {
    try {
      const tenantId = getTenantId(req);
      const { pageId } = req.params;

      // Try with tenant_id first, fallback to without if column doesn't exist
      let blocks;
      try {
        [blocks] = await pool.execute(
          `SELECT b.* FROM biolink_blocks b
           JOIN biolink_pages p ON b.page_id = p.id
           WHERE b.page_id = ? AND b.tenant_id = ?
           ORDER BY b.position`,
          [pageId, tenantId]
        );
      } catch (queryError) {
        // Fallback if tenant_id column doesn't exist
        if (queryError.code === 'ER_BAD_FIELD_ERROR') {
          [blocks] = await pool.execute(
            `SELECT b.* FROM biolink_blocks b
             JOIN biolink_pages p ON b.page_id = p.id
             WHERE b.page_id = ?
             ORDER BY COALESCE(b.position, b.sort_order, 0)`,
            [pageId]
          );
        } else {
          throw queryError;
        }
      }

      // Parse JSON fields
      const parsedBlocks = blocks.map(block => ({
        ...block,
        content: block.content ? JSON.parse(block.content) : {},
        settings: block.settings ? JSON.parse(block.settings) : {}
      }));

      return res.json({ success: true, data: parsedBlocks });
    } catch (error) {
      logger.error('Error getting blocks', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Create block
   */
  static async createBlock(req, res) {
    try {
      const tenantId = getTenantId(req);
      const { pageId } = req.params;
      const { type, title, content, settings, position } = req.body;

      if (!type) {
        return res.status(400).json({ success: false, message: 'Block type is required' });
      }

      // Verify page ownership - try with tenant_id first
      let pages;
      try {
        [pages] = await pool.execute(
          'SELECT id FROM biolink_pages WHERE id = ? AND tenant_id = ?',
          [pageId, tenantId]
        );
      } catch (queryError) {
        if (queryError.code === 'ER_BAD_FIELD_ERROR') {
          [pages] = await pool.execute(
            'SELECT id FROM biolink_pages WHERE id = ?',
            [pageId]
          );
        } else {
          throw queryError;
        }
      }

      if (pages.length === 0) {
        return res.status(404).json({ success: false, message: 'Page not found' });
      }

      // Get max position if not provided
      let finalPosition = position;
      if (finalPosition === undefined) {
        try {
          const [maxPos] = await pool.execute(
            'SELECT MAX(position) as max_pos FROM biolink_blocks WHERE page_id = ?',
            [pageId]
          );
          finalPosition = (maxPos[0].max_pos || 0) + 1;
        } catch (queryError) {
          if (queryError.code === 'ER_BAD_FIELD_ERROR') {
            const [maxPos] = await pool.execute(
              'SELECT MAX(sort_order) as max_pos FROM biolink_blocks WHERE page_id = ?',
              [pageId]
            );
            finalPosition = (maxPos[0].max_pos || 0) + 1;
          } else {
            throw queryError;
          }
        }
      }

      // Try to insert with tenant_id and position
      let result;
      try {
        [result] = await pool.execute(
          `INSERT INTO biolink_blocks (page_id, tenant_id, type, title, content, settings, position)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            pageId,
            tenantId,
            type,
            title || '',
            JSON.stringify(content || {}),
            JSON.stringify(settings || {}),
            finalPosition
          ]
        );
      } catch (queryError) {
        // Fallback if columns don't exist
        if (queryError.code === 'ER_BAD_FIELD_ERROR') {
          [result] = await pool.execute(
            `INSERT INTO biolink_blocks (page_id, type, title, content, settings, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              pageId,
              type,
              title || '',
              JSON.stringify(content || {}),
              JSON.stringify(settings || {}),
              finalPosition
            ]
          );
        } else {
          throw queryError;
        }
      }

      return res.status(201).json({
        success: true,
        message: 'Block created successfully',
        data: { id: result.insertId }
      });
    } catch (error) {
      logger.error('Error creating block', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update block
   */
  static async updateBlock(req, res) {
    try {
      const tenantId = getTenantId(req);
      const { blockId } = req.params;
      const { title, content, settings, position, is_active, schedule_start, schedule_end } = req.body;

      const updates = [];
      const params = [];

      if (title !== undefined) {
        updates.push('title = ?');
        params.push(title);
      }
      if (content !== undefined) {
        updates.push('content = ?');
        params.push(JSON.stringify(content));
      }
      if (settings !== undefined) {
        updates.push('settings = ?');
        params.push(JSON.stringify(settings));
      }
      if (position !== undefined) {
        updates.push('position = ?');
        params.push(position);
      }
      if (is_active !== undefined) {
        updates.push('is_active = ?');
        params.push(is_active ? 1 : 0);
      }
      if (schedule_start !== undefined) {
        updates.push('schedule_start = ?');
        params.push(schedule_start);
      }
      if (schedule_end !== undefined) {
        updates.push('schedule_end = ?');
        params.push(schedule_end);
      }

      if (updates.length > 0) {
        params.push(blockId, tenantId);
        try {
          await pool.execute(
            `UPDATE biolink_blocks SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
            params
          );
        } catch (queryError) {
          // Fallback if tenant_id column doesn't exist
          if (queryError.code === 'ER_BAD_FIELD_ERROR') {
            params.pop(); // Remove tenantId
            await pool.execute(
              `UPDATE biolink_blocks SET ${updates.join(', ')} WHERE id = ?`,
              params
            );
          } else {
            throw queryError;
          }
        }
      }

      return res.json({ success: true, message: 'Block updated successfully' });
    } catch (error) {
      logger.error('Error updating block', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Reorder blocks
   */
  static async reorderBlocks(req, res) {
    try {
      const tenantId = getTenantId(req);
      const { pageId } = req.params;
      const { blocks } = req.body; // Array of { id, position }

      if (!Array.isArray(blocks)) {
        return res.status(400).json({ success: false, message: 'Blocks array is required' });
      }

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        for (const block of blocks) {
          try {
            await connection.execute(
              'UPDATE biolink_blocks SET position = ? WHERE id = ? AND tenant_id = ?',
              [block.position, block.id, tenantId]
            );
          } catch (queryError) {
            // Fallback if tenant_id column doesn't exist
            if (queryError.code === 'ER_BAD_FIELD_ERROR') {
              await connection.execute(
                'UPDATE biolink_blocks SET position = ? WHERE id = ?',
                [block.position, block.id]
              );
            } else {
              throw queryError;
            }
          }
        }

        await connection.commit();
        connection.release();

        return res.json({ success: true, message: 'Blocks reordered successfully' });
      } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
      }
    } catch (error) {
      logger.error('Error reordering blocks', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete block
   */
  static async deleteBlock(req, res) {
    try {
      const tenantId = getTenantId(req);
      const { blockId } = req.params;

      let result;
      try {
        [result] = await pool.execute(
          'DELETE FROM biolink_blocks WHERE id = ? AND tenant_id = ?',
          [blockId, tenantId]
        );
      } catch (queryError) {
        // Fallback if tenant_id column doesn't exist
        if (queryError.code === 'ER_BAD_FIELD_ERROR') {
          [result] = await pool.execute(
            'DELETE FROM biolink_blocks WHERE id = ?',
            [blockId]
          );
        } else {
          throw queryError;
        }
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Block not found' });
      }

      return res.json({ success: true, message: 'Block deleted successfully' });
    } catch (error) {
      logger.error('Error deleting block', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==================== ANALYTICS ====================

  /**
   * Get analytics for project
   */
  static async getAnalytics(req, res) {
    try {
      const tenantId = getTenantId(req);
      const { projectId } = req.params;
      const { period = '7d' } = req.query;

      // Calculate date range
      let dateFilter = '';
      switch (period) {
        case '24h':
          dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)';
          break;
        case '7d':
          dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
          break;
        case '30d':
          dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
          break;
        case '90d':
          dateFilter = 'AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)';
          break;
      }

      // Get total stats
      const [stats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_events,
          SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) as views,
          SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) as clicks,
          COUNT(DISTINCT ip_address) as unique_visitors
        FROM biolink_analytics
        WHERE project_id = ? AND tenant_id = ? ${dateFilter}
      `, [projectId, tenantId]);

      // Get daily breakdown
      const [daily] = await pool.execute(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as events,
          SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) as views,
          SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) as clicks
        FROM biolink_analytics
        WHERE project_id = ? AND tenant_id = ? ${dateFilter}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, [projectId, tenantId]);

      // Get top countries
      const [countries] = await pool.execute(`
        SELECT country, COUNT(*) as count
        FROM biolink_analytics
        WHERE project_id = ? AND tenant_id = ? AND country IS NOT NULL ${dateFilter}
        GROUP BY country
        ORDER BY count DESC
        LIMIT 10
      `, [projectId, tenantId]);

      // Get device breakdown
      const [devices] = await pool.execute(`
        SELECT device_type, COUNT(*) as count
        FROM biolink_analytics
        WHERE project_id = ? AND tenant_id = ? AND device_type IS NOT NULL ${dateFilter}
        GROUP BY device_type
      `, [projectId, tenantId]);

      // Get referrers
      const [referrers] = await pool.execute(`
        SELECT referrer, COUNT(*) as count
        FROM biolink_analytics
        WHERE project_id = ? AND tenant_id = ? AND referrer IS NOT NULL AND referrer != '' ${dateFilter}
        GROUP BY referrer
        ORDER BY count DESC
        LIMIT 10
      `, [projectId, tenantId]);

      return res.json({
        success: true,
        data: {
          summary: stats[0],
          daily,
          countries,
          devices,
          referrers
        }
      });
    } catch (error) {
      logger.error('Error getting analytics', { error: error.message });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==================== RESOURCE LIMITS ====================

  /**
   * Get tenant's biolink limits
   */
  static async getLimits(req, res) {
    try {
      // tenant_id can be in req.tenantId (from middleware) or req.user.tenantId (from token)
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.tenant_id;
      
      if (!tenantId) {
        logger.error('No tenant_id in request', { user: req.user, tenantId: req.tenantId });
        return res.status(400).json({ success: false, message: 'Tenant ID not found' });
      }

      // Get tenant with plan limits - handle case where biolink columns don't exist
      let tenant = null;
      let limits = {
        enabled: false,
        bio_pages: 0,
        short_links: 0,
        file_transfers: 0,
        vcards: 0,
        event_links: 0,
        html_pages: 0,
        qr_codes: 0
      };

      try {
        const [tenants] = await pool.execute(`
          SELECT t.*, sp.biolink_enabled, 
                 sp.max_bio_pages, sp.max_short_links, sp.max_file_transfers,
                 sp.max_vcards, sp.max_event_links, sp.max_html_pages, sp.max_qr_codes
          FROM tenants t
          LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
          WHERE t.id = ?
        `, [tenantId]);
        
        if (tenants.length > 0) {
          tenant = tenants[0];
          limits = {
            enabled: tenant.biolink_enabled || false,
            bio_pages: tenant.max_bio_pages || 0,
            short_links: tenant.max_short_links || 0,
            file_transfers: tenant.max_file_transfers || 0,
            vcards: tenant.max_vcards || 0,
            event_links: tenant.max_event_links || 0,
            html_pages: tenant.max_html_pages || 0,
            qr_codes: tenant.max_qr_codes || 0
          };
        }
      } catch (queryError) {
        // Columns might not exist yet, try simpler query
        logger.warn('Biolink columns may not exist, trying simple query', { error: queryError.message });
        try {
          const [tenants] = await pool.execute(`
            SELECT t.* FROM tenants t WHERE t.id = ?
          `, [tenantId]);
          
          if (tenants.length > 0) {
            tenant = tenants[0];
          }
        } catch (e2) {
          logger.error('Error in fallback query', { error: e2.message });
        }
      }

      if (!tenant) {
        return res.status(404).json({ success: false, message: 'Tenant not found' });
      }

      // Get current usage (handle case where table doesn't exist)
      let usageMap = {};
      try {
        const [usage] = await pool.execute(`
          SELECT type, COUNT(*) as count
          FROM biolink_projects
          WHERE tenant_id = ?
          GROUP BY type
        `, [tenantId]);

        usage.forEach(u => {
          usageMap[u.type] = u.count;
        });
      } catch (e) {
        // Table might not exist yet
        logger.warn('biolink_projects query failed', { error: e.message });
      }

      return res.json({
        success: true,
        data: {
          limits,
          usage: usageMap
        }
      });
    } catch (error) {
      logger.error('Error getting biolink limits', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // ==================== HELPER METHODS ====================

  /**
   * Check resource limit
   */
  static async checkResourceLimit(tenantId, type) {
    const typeMap = {
      'biopage': 'max_bio_pages',
      'shortlink': 'max_short_links',
      'file': 'max_file_transfers',
      'vcard': 'max_vcards',
      'event': 'max_event_links',
      'html': 'max_html_pages',
      'qrcode': 'max_qr_codes'
    };

    const resourceKey = typeMap[type] || type;

    try {
      // Get tenant with plan limits
      const [tenants] = await pool.execute(`
        SELECT t.*, sp.biolink_enabled, 
               sp.max_bio_pages, sp.max_short_links, sp.max_file_transfers,
               sp.max_vcards, sp.max_event_links, sp.max_html_pages, sp.max_qr_codes
        FROM tenants t
        LEFT JOIN subscription_plans sp ON t.plan_id = sp.id
        WHERE t.id = ?
      `, [tenantId]);

      if (tenants.length === 0) {
        return { allowed: false, current: 0, max: 0 };
      }

      const tenant = tenants[0];

      // Check if biolink is enabled
      if (!tenant.biolink_enabled) {
        return { allowed: false, current: 0, max: 0, disabled: true };
      }

      const maxLimit = tenant[resourceKey] || 0;

      // If limit is 0 or not set, feature is disabled
      if (maxLimit <= 0) {
        return { allowed: false, current: 0, max: 0, disabled: true };
      }

      // Get current count
      const [count] = await pool.execute(
        'SELECT COUNT(*) as total FROM biolink_projects WHERE tenant_id = ? AND type = ?',
        [tenantId, type]
      );

      const current = count[0].total;

      return {
        allowed: current < maxLimit,
        current,
        max: maxLimit
      };
    } catch (error) {
      // If columns don't exist, allow unlimited
      logger.warn('checkResourceLimit error, allowing unlimited', { error: error.message });
      return { allowed: true, current: 0, max: -1 };
    }
  }

  /**
   * Generate unique slug
   */
  static generateSlug(name) {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 20);
    
    const random = crypto.randomBytes(3).toString('hex');
    return `${base}-${random}`;
  }

  /**
   * Get block types
   */
  static async getBlockTypes(req, res) {
    const blockTypes = [
      { type: 'link_url', name: 'Link/URL', icon: 'fas fa-link', category: 'basic' },
      { type: 'heading_text', name: 'Heading Text', icon: 'fas fa-heading', category: 'basic' },
      { type: 'avatar_image', name: 'Avatar Image', icon: 'fas fa-user-circle', category: 'basic' },
      { type: 'custom_image', name: 'Custom Image', icon: 'fas fa-image', category: 'basic' },
      { type: 'social_links', name: 'Social Links', icon: 'fas fa-share-alt', category: 'social' },
      { type: 'email_signup', name: 'Email Signup', icon: 'fas fa-envelope', category: 'forms' },
      { type: 'phone_collector', name: 'Phone Collector', icon: 'fas fa-phone', category: 'forms' },
      { type: 'youtube_embed', name: 'YouTube Embed', icon: 'fab fa-youtube', category: 'embeds' },
      { type: 'spotify_embed', name: 'Spotify Embed', icon: 'fab fa-spotify', category: 'embeds' },
      { type: 'soundcloud_embed', name: 'SoundCloud Embed', icon: 'fab fa-soundcloud', category: 'embeds' },
      { type: 'twitch_embed', name: 'Twitch Embed', icon: 'fab fa-twitch', category: 'embeds' },
      { type: 'vimeo_embed', name: 'Vimeo Embed', icon: 'fab fa-vimeo', category: 'embeds' },
      { type: 'tiktok_embed', name: 'TikTok Embed', icon: 'fab fa-tiktok', category: 'embeds' },
      { type: 'stripe_payment', name: 'Stripe Payment', icon: 'fab fa-stripe', category: 'payments' },
      { type: 'paypal_payment', name: 'PayPal Payment', icon: 'fab fa-paypal', category: 'payments' },
      { type: 'opensea_nft', name: 'OpenSea NFT', icon: 'fas fa-gem', category: 'web3' }
    ];

    return res.json({ success: true, data: blockTypes });
  }
}

module.exports = BioLinkController;
