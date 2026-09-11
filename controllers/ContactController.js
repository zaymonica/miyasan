/**
 * Contact Controller
 * Manages contacts and contact groups for tenants
 * 
 * @module controllers/ContactController
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const { asyncHandler } = require('../middleware/errorHandler');

class ContactController {
  /**
   * Get all contacts for tenant
   * GET /api/tenant/contacts
   */
  static getContacts = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { group_id, search, limit = 50, offset = 0 } = req.query;
    
    logger.info('Getting contacts', { tenantId, filters: { group_id, search, limit, offset } });

    try {
      let query = `
        SELECT 
          c.id,
          c.name,
          c.phone,
          c.email,
          c.group_id,
          c.tags,
          c.notes,
          c.created_at,
          c.updated_at,
          cg.group_name
        FROM contacts c
        LEFT JOIN contact_groups cg ON c.group_id = cg.id AND cg.tenant_id = c.tenant_id
        WHERE c.tenant_id = ?
      `;
      const params = [tenantId];

      if (group_id) {
        query += ` AND c.group_id = ?`;
        params.push(group_id);
      }

      if (search) {
        query += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      query += ` ORDER BY c.name ASC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), parseInt(offset));

      const [contacts] = await pool.query(query, params);

      // Get total count
      let countQuery = `SELECT COUNT(*) as total FROM contacts WHERE tenant_id = ?`;
      const countParams = [tenantId];

      if (group_id) {
        countQuery += ` AND group_id = ?`;
        countParams.push(group_id);
      }

      if (search) {
        countQuery += ` AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)`;
        const searchTerm = `%${search}%`;
        countParams.push(searchTerm, searchTerm, searchTerm);
      }

      const [countResult] = await pool.query(countQuery, countParams);

      logger.info('Contacts retrieved', { tenantId, count: contacts.length });

      return res.json({
        success: true,
        data: contacts,
        total: countResult[0].total
      });
    } catch (error) {
      logger.error('Error getting contacts', { 
        tenantId, 
        error: error.message,
        stack: error.stack 
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to load contacts'
      });
    }
  });

  /**
   * Get single contact
   * GET /api/tenant/contacts/:id
   */
  static getContact = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    try {
      const [contacts] = await pool.query(
        `SELECT c.*, cg.group_name 
         FROM contacts c 
         LEFT JOIN contact_groups cg ON c.group_id = cg.id
         WHERE c.id = ? AND c.tenant_id = ?`,
        [id, tenantId]
      );

      if (contacts.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found'
        });
      }

      return res.json({
        success: true,
        data: contacts[0]
      });
    } catch (error) {
      logger.error('Error getting contact', { tenantId, contactId: id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to load contact'
      });
    }
  });

  /**
   * Create contact
   * POST /api/tenant/contacts
   */
  static createContact = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { name, phone, email, group_id, tags, notes } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name and phone are required'
      });
    }

    try {
      // Check contact limit for tenant's plan
      const [planLimit] = await pool.query(
        `SELECT sp.max_contacts 
         FROM tenants t
         JOIN subscription_plans sp ON t.plan_id = sp.id
         WHERE t.id = ?`,
        [tenantId]
      );

      if (planLimit.length > 0 && planLimit[0].max_contacts > 0) {
        const [contactCount] = await pool.query(
          'SELECT COUNT(*) as count FROM contacts WHERE tenant_id = ?',
          [tenantId]
        );

        if (contactCount[0].count >= planLimit[0].max_contacts) {
          return res.status(403).json({
            success: false,
            error: 'Contact limit reached for your plan'
          });
        }
      }

      const [result] = await pool.query(
        `INSERT INTO contacts (tenant_id, name, phone, email, group_id, tags, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, name, phone, email || null, group_id || null, tags || null, notes || null]
      );

      logger.info('Contact created', { tenantId, contactId: result.insertId });

      return res.json({
        success: true,
        message: 'Contact created successfully',
        data: { id: result.insertId }
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          success: false,
          error: 'Phone number already exists'
        });
      }

      logger.error('Error creating contact', { tenantId, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to create contact'
      });
    }
  });

  /**
   * Update contact
   * PUT /api/tenant/contacts/:id
   */
  static updateContact = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { id } = req.params;
    const { name, phone, email, group_id, tags, notes } = req.body;

    try {
      const [result] = await pool.query(
        `UPDATE contacts 
         SET name = ?, phone = ?, email = ?, group_id = ?, tags = ?, notes = ?
         WHERE id = ? AND tenant_id = ?`,
        [name, phone, email || null, group_id || null, tags || null, notes || null, id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found'
        });
      }

      logger.info('Contact updated', { tenantId, contactId: id });

      return res.json({
        success: true,
        message: 'Contact updated successfully'
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          success: false,
          error: 'Phone number already exists'
        });
      }

      logger.error('Error updating contact', { tenantId, contactId: id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to update contact'
      });
    }
  });

  /**
   * Delete contact
   * DELETE /api/tenant/contacts/:id
   */
  static deleteContact = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    try {
      const [result] = await pool.query(
        'DELETE FROM contacts WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found'
        });
      }

      logger.info('Contact deleted', { tenantId, contactId: id });

      return res.json({
        success: true,
        message: 'Contact deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting contact', { tenantId, contactId: id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to delete contact'
      });
    }
  });

  /**
   * Import contacts from CSV
   * POST /api/tenant/contacts/import
   */
  static importContacts = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { contacts } = req.body; // Array of {name, phone, email, group_id}

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Contacts array is required'
      });
    }

    try {
      // Check contact limit
      const [planLimit] = await pool.query(
        `SELECT sp.max_contacts 
         FROM tenants t
         JOIN subscription_plans sp ON t.plan_id = sp.id
         WHERE t.id = ?`,
        [tenantId]
      );

      const [contactCount] = await pool.query(
        'SELECT COUNT(*) as count FROM contacts WHERE tenant_id = ?',
        [tenantId]
      );

      const currentCount = contactCount[0].count;
      const maxContacts = planLimit[0]?.max_contacts || 0;

      if (maxContacts > 0 && (currentCount + contacts.length) > maxContacts) {
        return res.status(403).json({
          success: false,
          error: `Cannot import ${contacts.length} contacts. Limit: ${maxContacts}, Current: ${currentCount}`
        });
      }

      let imported = 0;
      let failed = 0;
      const errors = [];

      for (const contact of contacts) {
        try {
          await pool.query(
            `INSERT INTO contacts (tenant_id, name, phone, email, group_id)
             VALUES (?, ?, ?, ?, ?)`,
            [tenantId, contact.name, contact.phone, contact.email || null, contact.group_id || null]
          );
          imported++;
        } catch (error) {
          failed++;
          errors.push({ contact: contact.name, error: error.code === 'ER_DUP_ENTRY' ? 'Duplicate phone' : error.message });
        }
      }

      logger.info('Contacts imported', { tenantId, imported, failed });

      return res.json({
        success: true,
        message: `Imported ${imported} contacts, ${failed} failed`,
        data: { imported, failed, errors: errors.slice(0, 10) }
      });
    } catch (error) {
      logger.error('Error importing contacts', { tenantId, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to import contacts'
      });
    }
  });

  /**
   * Get all contact groups
   * GET /api/tenant/contact-groups
   */
  static getGroups = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    
    logger.info('Getting contact groups', { tenantId });

    try {
      const [groups] = await pool.query(
        `SELECT 
          cg.id,
          cg.group_name,
          cg.description,
          cg.created_at,
          COUNT(c.id) as contact_count
         FROM contact_groups cg
         LEFT JOIN contacts c ON cg.id = c.group_id AND c.tenant_id = cg.tenant_id
         WHERE cg.tenant_id = ?
         GROUP BY cg.id, cg.group_name, cg.description, cg.created_at
         ORDER BY cg.group_name ASC`,
        [tenantId]
      );

      logger.info('Contact groups retrieved', { tenantId, count: groups.length });

      return res.json({
        success: true,
        data: groups
      });
    } catch (error) {
      logger.error('Error getting groups', { 
        tenantId, 
        error: error.message,
        stack: error.stack 
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to load groups'
      });
    }
  });

  /**
   * Create contact group
   * POST /api/tenant/contact-groups
   */
  static createGroup = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { group_name, description } = req.body;

    logger.info('Creating contact group', { tenantId, group_name, description });

    if (!group_name) {
      return res.status(400).json({
        success: false,
        error: 'Group name is required'
      });
    }

    try {
      logger.info('Inserting group', { tenantId, group_name, description });
      const [result] = await pool.query(
        `INSERT INTO contact_groups (tenant_id, group_name, description)
         VALUES (?, ?, ?)`,
        [tenantId, group_name, description || null]
      );

      logger.info('Contact group created', { tenantId, groupId: result.insertId });

      return res.json({
        success: true,
        message: 'Group created successfully',
        data: { id: result.insertId }
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          success: false,
          error: 'Group name already exists'
        });
      }

      logger.error('Error creating group', { 
        tenantId, 
        error: error.message,
        stack: error.stack,
        code: error.code 
      });
      return res.status(500).json({
        success: false,
        error: 'Failed to create group'
      });
    }
  });

  /**
   * Update contact group
   * PUT /api/tenant/contact-groups/:id
   */
  static updateGroup = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { id } = req.params;
    const { group_name, description } = req.body;

    try {
      const [result] = await pool.query(
        `UPDATE contact_groups 
         SET group_name = ?, description = ?
         WHERE id = ? AND tenant_id = ?`,
        [group_name, description || null, id, tenantId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          error: 'Group not found'
        });
      }

      logger.info('Contact group updated', { tenantId, groupId: id });

      return res.json({
        success: true,
        message: 'Group updated successfully'
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          success: false,
          error: 'Group name already exists'
        });
      }

      logger.error('Error updating group', { tenantId, groupId: id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to update group'
      });
    }
  });

  /**
   * Delete contact group
   * DELETE /api/tenant/contact-groups/:id
   */
  static deleteGroup = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    try {
      // Check if it's the default group
      const [group] = await pool.query(
        'SELECT group_name FROM contact_groups WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      if (group.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Group not found'
        });
      }

      if (group[0].group_name === 'Default') {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete default group'
        });
      }

      const [result] = await pool.query(
        'DELETE FROM contact_groups WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );

      logger.info('Contact group deleted', { tenantId, groupId: id });

      return res.json({
        success: true,
        message: 'Group deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting group', { tenantId, groupId: id, error: error.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to delete group'
      });
    }
  });
}

module.exports = ContactController;
