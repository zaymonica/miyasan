/**
 * Error Handling Middleware
 * Centralized error handling for the application
 * 
 * @module middleware/errorHandler
 */

const { logger } = require('../config/logger');

/**
 * Custom Error Classes
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500);
    this.name = 'DatabaseError';
  }
}

/**
 * Error Handler Middleware
 */
function errorHandler(err, req, res, next) {
  let error = { ...err };
  error.message = err.message;

  // Ensure JSON response
  res.setHeader('Content-Type', 'application/json');

  // Log error with fallback
  try {
    logger.error('Error occurred', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.userId,
      tenantId: req.tenantId,
    });
  } catch (logError) {
    console.error('Logger error in errorHandler:', logError);
    console.error('Original error:', err.message);
  }

  // Mongoose/MySQL duplicate key error
  if (err.code === 'ER_DUP_ENTRY') {
    const message = 'Duplicate entry. Resource already exists.';
    error = new ValidationError(message);
  }

  // Mongoose/MySQL validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors || {}).map(val => val.message).join(', ');
    error = new ValidationError(message || 'Validation failed');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new AuthenticationError('Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    error = new AuthenticationError('Token expired');
  }

  // MySQL connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
    error = new DatabaseError('Database connection failed');
  }

  // Send error response
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * 404 Not Found Handler
 */
function notFoundHandler(req, res, next) {
  // For API routes, return JSON error
  if (req.path.startsWith('/api/')) {
    const error = new NotFoundError(`Route not found: ${req.originalUrl}`);
    return next(error);
  }
  
  // For browser requests, serve the 404 HTML page
  const path = require('path');
  const fs = require('fs');
  const notFoundPage = path.join(__dirname, '../public/404.html');
  
  if (fs.existsSync(notFoundPage)) {
    return res.status(404).sendFile(notFoundPage);
  }
  
  // Fallback if 404.html doesn't exist
  const error = new NotFoundError(`Route not found: ${req.originalUrl}`);
  next(error);
}

/**
 * Async Handler Wrapper
 * Wraps async route handlers to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    // Ensure JSON response for API routes
    if (req.path.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
    }
    
    Promise.resolve(fn(req, res, next)).catch((error) => {
      // Ensure JSON response on error
      if (req.path.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');
      }
      next(error);
    });
  };
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  DatabaseError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
