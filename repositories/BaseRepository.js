const { pool } = require('../config/database');
const { logger } = require('../config/logger');

/**
 * BaseRepository
 * Base class for all repositories with common CRUD operations
 */
class BaseRepository {
  constructor(tableName) {
    this.tableName = tableName;
  }

  /**
   * Find record by ID
   * @param {number} id - Record ID
   * @returns {Promise<Object|null>}
   */
  async findById(id) {
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.execute(
        `SELECT * FROM ${this.tableName} WHERE id = ?`,
        [id]
      );
      return rows[0] || null;
    } catch (error) {
      logger.error(`Error finding ${this.tableName} by ID`, { 
        error: error.message, 
        id,
        table: this.tableName 
      });
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Find all records with optional filters and pagination
   * @param {Object} filters - Where clause filters
   * @param {Object} pagination - { page, limit, orderBy, orderDir }
   * @returns {Promise<Array>}
   */
  async findAll(filters = {}, pagination = {}) {
    let connection;
    try {
      connection = await pool.getConnection();
      
      const { page = 1, limit = 10, orderBy = 'id', orderDir = 'DESC' } = pagination;
      const offset = (page - 1) * limit;
      
      // Build WHERE clause
      const whereConditions = [];
      const params = [];
      
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null) {
          whereConditions.push(`${key} = ?`);
          params.push(filters[key]);
        }
      });
      
      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';
      
      // Build query
      const query = `
        SELECT * FROM ${this.tableName}
        ${whereClause}
        ORDER BY ${orderBy} ${orderDir}
        LIMIT ? OFFSET ?
      `;
      
      params.push(parseInt(limit), parseInt(offset));
      
      const [rows] = await connection.execute(query, params);
      
      logger.debug(`Found ${rows.length} ${this.tableName} records`, { 
        filters, 
        pagination 
      });
      
      return rows;
    } catch (error) {
      logger.error(`Error finding all ${this.tableName}`, { 
        error: error.message,
        filters,
        pagination
      });
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Count records with optional filters
   * @param {Object} filters - Where clause filters
   * @returns {Promise<number>}
   */
  async count(filters = {}) {
    let connection;
    try {
      connection = await pool.getConnection();
      
      const whereConditions = [];
      const params = [];
      
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null) {
          whereConditions.push(`${key} = ?`);
          params.push(filters[key]);
        }
      });
      
      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';
      
      const query = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;
      const [rows] = await connection.execute(query, params);
      
      return rows[0].total;
    } catch (error) {
      logger.error(`Error counting ${this.tableName}`, { 
        error: error.message,
        filters
      });
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Create new record
   * @param {Object} data - Record data
   * @returns {Promise<Object>} Created record with ID
   */
  async create(data) {
    let connection;
    try {
      connection = await pool.getConnection();
      
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map(() => '?').join(', ');
      
      const query = `
        INSERT INTO ${this.tableName} (${keys.join(', ')})
        VALUES (${placeholders})
      `;
      
      const [result] = await connection.execute(query, values);
      
      logger.info(`Created ${this.tableName} record`, { 
        id: result.insertId,
        table: this.tableName
      });
      
      return {
        id: result.insertId,
        ...data
      };
    } catch (error) {
      logger.error(`Error creating ${this.tableName}`, { 
        error: error.message,
        data
      });
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Update record by ID
   * @param {number} id - Record ID
   * @param {Object} data - Fields to update
   * @returns {Promise<boolean>} Success status
   */
  async update(id, data) {
    let connection;
    try {
      connection = await pool.getConnection();
      
      const keys = Object.keys(data);
      const values = Object.values(data);
      const setClause = keys.map(key => `${key} = ?`).join(', ');
      
      const query = `
        UPDATE ${this.tableName}
        SET ${setClause}
        WHERE id = ?
      `;
      
      const [result] = await connection.execute(query, [...values, id]);
      
      logger.info(`Updated ${this.tableName} record`, { 
        id,
        affected: result.affectedRows
      });
      
      return result.affectedRows > 0;
    } catch (error) {
      logger.error(`Error updating ${this.tableName}`, { 
        error: error.message,
        id,
        data
      });
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Delete record by ID (soft delete if deleted_at column exists)
   * @param {number} id - Record ID
   * @param {boolean} hard - Force hard delete
   * @returns {Promise<boolean>} Success status
   */
  async delete(id, hard = false) {
    let connection;
    try {
      connection = await pool.getConnection();
      
      let query;
      
      if (!hard) {
        // Try soft delete first
        try {
          query = `UPDATE ${this.tableName} SET deleted_at = NOW() WHERE id = ?`;
          const [result] = await connection.execute(query, [id]);
          
          if (result.affectedRows > 0) {
            logger.info(`Soft deleted ${this.tableName} record`, { id });
            return true;
          }
        } catch (_err) {
          // Column doesn't exist, fall through to hard delete
        }
      }
      
      // Hard delete
      query = `DELETE FROM ${this.tableName} WHERE id = ?`;
      const [result] = await connection.execute(query, [id]);
      
      logger.info(`Hard deleted ${this.tableName} record`, { id });
      
      return result.affectedRows > 0;
    } catch (error) {
      logger.error(`Error deleting ${this.tableName}`, { 
        error: error.message,
        id
      });
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Execute custom query
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Array>}
   */
  async executeQuery(query, params = []) {
    let connection;
    try {
      connection = await pool.getConnection();
      const [rows] = await connection.execute(query, params);
      return rows;
    } catch (error) {
      logger.error('Error executing custom query', { 
        error: error.message,
        query,
        table: this.tableName
      });
      throw error;
    } finally {
      if (connection) connection.release();
    }
  }

  /**
   * Begin transaction
   * @returns {Promise<Connection>}
   */
  async beginTransaction() {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    return connection;
  }

  /**
   * Commit transaction
   * @param {Connection} connection
   */
  async commit(connection) {
    try {
      await connection.commit();
    } finally {
      connection.release();
    }
  }

  /**
   * Rollback transaction
   * @param {Connection} connection
   */
  async rollback(connection) {
    try {
      await connection.rollback();
    } finally {
      connection.release();
    }
  }

  /**
   * Check if record exists
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  async exists(id) {
    const record = await this.findById(id);
    return record !== null;
  }

  /**
   * Find one record by filters
   * @param {Object} filters
   * @returns {Promise<Object|null>}
   */
  async findOne(filters) {
    const results = await this.findAll(filters, { limit: 1 });
    return results[0] || null;
  }
}

module.exports = BaseRepository;
