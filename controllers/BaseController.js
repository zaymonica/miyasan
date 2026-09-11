/**
 * Base Controller
 * Provides common functionality for all controllers
 * 
 * @class BaseController
 */

const { pool } = require('../config/database');
const { DatabaseError } = require('../middleware/errorHandler');

class BaseController {
  /**
   * Get database connection from pool
   */
  static async getConnection() {
    try {
      return await pool.getConnection();
    } catch (error) {
      throw new DatabaseError('Failed to get database connection');
    }
  }

  /**
   * Execute database query with automatic error handling
   */
  static async executeQuery(query, params = [], connection = null) {
    const shouldRelease = !connection;
    
    try {
      if (!connection) {
        connection = await this.getConnection();
      }

      const [result] = await connection.execute(query, params);
      return result;
    } catch (error) {
      throw new DatabaseError(`Database query failed: ${error.message}`);
    } finally {
      if (shouldRelease && connection) {
        connection.release();
      }
    }
  }

  /**
   * Send standardized success response
   */
  static sendSuccess(res, data = null, statusCode = 200, message = null) {
    const response = {
      success: true,
      ...(message && { message }),
      ...(data !== null && { data })
    };
    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   */
  static sendError(res, message, statusCode = 400) {
    return res.status(statusCode).json({
      success: false,
      error: message
    });
  }

  /**
   * Paginate results
   */
  static paginate(data, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const total = data.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedData = data.slice(offset, offset + limit);

    return {
      data: paginatedData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages
      }
    };
  }

  /**
   * Validate pagination parameters
   */
  static validatePagination(page, limit) {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    
    return {
      page: pageNum,
      limit: limitNum,
      offset: (pageNum - 1) * limitNum
    };
  }
}

module.exports = BaseController;
