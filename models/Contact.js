/**
 * Contact Model
 * 
 * Represents a contact in the tenant's database
 * Contacts are isolated per tenant
 * 
 * @module models/Contact
 */

const db = require('../config/database');

class Contact {
  /**
   * Get all contacts for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {Object} options - Query options (page, limit, search, group)
   * @returns {Promise<Object>} Contacts and pagination info
   */
  static async findByTenant(tenantId, options = {}) {
    const { page = 1, limit = 50, search = '', group = null } = options;
    const offset = (page - 1) * limit;

    let query = `
      SELECT c.*, 
        GROUP_CONCAT(DISTINCT cg.name) as groups,
        GROUP_CONCAT(DISTINCT ct.name) as tags
      FROM contacts c
      LEFT JOIN contact_group_members cgm ON cgm.contact_id = c.id
      LEFT JOIN contact_groups cg ON cg.id = cgm.group_id AND cg.tenant_id = c.tenant_id
      LEFT JOIN contact_tags ctags ON ctags.contact_id = c.id
      LEFT JOIN tags ct ON ct.id = ctags.tag_id AND ct.tenant_id = c.tenant_id
      WHERE c.tenant_id = ?
    `;
    const params = [tenantId];

    if (search) {
      query += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (group) {
      query += ` AND cgm.group_id = ?`;
      params.push(group);
    }

    query += ` GROUP BY c.id ORDER BY c.name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(DISTINCT c.id) as total FROM contacts c';
    const countParams = [tenantId];

    if (group) {
      countQuery += ' LEFT JOIN contact_group_members cgm ON cgm.contact_id = c.id';
    }

    countQuery += ' WHERE c.tenant_id = ?';

    if (search) {
      countQuery += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (group) {
      countQuery += ` AND cgm.group_id = ?`;
      countParams.push(group);
    }

    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;

    return {
      contacts: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get contact by ID
   * @param {number} id - Contact ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object|null>} Contact object or null
   */
  static async findById(id, tenantId) {
    const [rows] = await db.query(
      `SELECT c.*,
        GROUP_CONCAT(DISTINCT cg.name) as groups,
        GROUP_CONCAT(DISTINCT ct.name) as tags
       FROM contacts c
       LEFT JOIN contact_group_members cgm ON cgm.contact_id = c.id
       LEFT JOIN contact_groups cg ON cg.id = cgm.group_id AND cg.tenant_id = c.tenant_id
       LEFT JOIN contact_tags ctags ON ctags.contact_id = c.id
       LEFT JOIN tags ct ON ct.id = ctags.tag_id AND ct.tenant_id = c.tenant_id
       WHERE c.id = ? AND c.tenant_id = ?
       GROUP BY c.id`,
      [id, tenantId]
    );
    return rows[0] || null;
  }

  /**
   * Get contact by phone
   * @param {string} phone - Phone number
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object|null>} Contact object or null
   */
  static async findByPhone(phone, tenantId) {
    const [rows] = await db.query(
      'SELECT * FROM contacts WHERE phone = ? AND tenant_id = ?',
      [phone, tenantId]
    );
    return rows[0] || null;
  }

  /**
   * Create new contact
   * @param {Object} data - Contact data
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Created contact
   */
  static async create(data, tenantId) {
    const { name, phone, email, notes, custom_fields } = data;
    
    const [result] = await db.query(
      `INSERT INTO contacts (tenant_id, name, phone, email, notes, custom_fields, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [tenantId, name, phone, email || null, notes || null, JSON.stringify(custom_fields || {})]
    );

    return this.findById(result.insertId, tenantId);
  }

  /**
   * Update contact
   * @param {number} id - Contact ID
   * @param {Object} data - Contact data
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Updated contact
   */
  static async update(id, data, tenantId) {
    const { name, phone, email, notes, custom_fields } = data;
    
    await db.query(
      `UPDATE contacts 
       SET name = ?, phone = ?, email = ?, notes = ?, custom_fields = ?, updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [name, phone, email || null, notes || null, JSON.stringify(custom_fields || {}), id, tenantId]
    );

    return this.findById(id, tenantId);
  }

  /**
   * Delete contact
   * @param {number} id - Contact ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(id, tenantId) {
    const [result] = await db.query(
      'DELETE FROM contacts WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Import contacts from array
   * @param {Array} contacts - Array of contact data
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<Object>} Import results
   */
  static async importBulk(contacts, tenantId) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const contact of contacts) {
      try {
        // Check if contact exists
        const existing = await this.findByPhone(contact.phone, tenantId);
        
        if (existing) {
          // Update existing
          await this.update(existing.id, contact, tenantId);
        } else {
          // Create new
          await this.create(contact, tenantId);
        }
        
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          contact: contact.phone,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Add contact to group
   * @param {number} contactId - Contact ID
   * @param {number} groupId - Group ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  static async addToGroup(contactId, groupId, tenantId) {
    // Verify contact and group belong to tenant
    const contact = await this.findById(contactId, tenantId);
    if (!contact) throw new Error('Contact not found');

    await db.query(
      `INSERT IGNORE INTO contact_group_members (contact_id, group_id, created_at)
       VALUES (?, ?, NOW())`,
      [contactId, groupId]
    );

    return true;
  }

  /**
   * Remove contact from group
   * @param {number} contactId - Contact ID
   * @param {number} groupId - Group ID
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<boolean>} Success status
   */
  static async removeFromGroup(contactId, groupId, tenantId) {
    const contact = await this.findById(contactId, tenantId);
    if (!contact) throw new Error('Contact not found');

    await db.query(
      'DELETE FROM contact_group_members WHERE contact_id = ? AND group_id = ?',
      [contactId, groupId]
    );

    return true;
  }
}

module.exports = Contact;
