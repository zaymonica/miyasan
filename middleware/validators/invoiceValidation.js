/**
 * Invoice Routes Validation
 * Validation rules for invoice and quote endpoints
 * 
 * @module middleware/validators/invoiceValidation
 */

const { body, param, query } = require('express-validator');
const { handleValidationErrors } = require('../validation');

/**
 * Validate invoice ID parameter
 */
const validateInvoiceId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid invoice ID'),
  handleValidationErrors
];

/**
 * Validate invoice number parameter
 */
const validateInvoiceNumber = [
  param('invoice_number')
    .trim()
    .notEmpty()
    .withMessage('Invoice number is required')
    .matches(/^[A-Z]{3}-\d{4}-\d{5}$/)
    .withMessage('Invalid invoice number format'),
  handleValidationErrors
];

/**
 * Validate create invoice request
 */
const validateCreateInvoice = [
  body('type')
    .isIn(['invoice', 'quote'])
    .withMessage('Type must be invoice or quote'),
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 3, max: 200 })
    .withMessage('Title must be 3-200 characters'),
  body('description')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description too long (max 2000 characters)'),
  body('currency')
    .optional()
    .isIn(['USD', 'BRL', 'EUR', 'GBP'])
    .withMessage('Invalid currency'),
  body('tax_rate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax rate must be between 0 and 100'),
  body('discount_type')
    .optional()
    .isIn(['fixed', 'percentage'])
    .withMessage('Discount type must be fixed or percentage'),
  body('discount_value')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount value must be positive'),
  body('payment_method')
    .optional()
    .isIn(['paypal', 'pagseguro', 'stripe', 'pix', 'bank_transfer', 'cash', 'other'])
    .withMessage('Invalid payment method'),
  body('due_date')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('Invalid due date format'),
  body('notes')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Notes too long (max 2000 characters)'),
  body('terms')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Terms too long (max 2000 characters)'),
  
  // Client validation
  body('client')
    .isObject()
    .withMessage('Client information is required'),
  body('client.name')
    .trim()
    .notEmpty()
    .withMessage('Client name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Client name must be 2-100 characters'),
  body('client.email')
    .trim()
    .notEmpty()
    .withMessage('Client email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('client.phone')
    .trim()
    .notEmpty()
    .withMessage('Client phone is required')
    .customSanitizer(value => value.replace(/[\s\-\(\)\.]/g, ''))
    .matches(/^\+?[0-9]{8,15}$/)
    .withMessage('Invalid phone number format (8-15 digits)'),
  body('client.company_name')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 150 })
    .withMessage('Company name too long'),
  body('client.tax_id')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Tax ID too long'),
  body('client.address')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Address too long'),
  body('client.city')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('City too long'),
  body('client.state')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('State too long'),
  body('client.zip_code')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('Zip code too long'),
  body('client.country')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Country too long'),
  
  // Items validation
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),
  body('items.*.description')
    .trim()
    .notEmpty()
    .withMessage('Item description is required')
    .isLength({ min: 2, max: 255 })
    .withMessage('Item description must be 2-255 characters'),
  body('items.*.quantity')
    .isFloat({ min: 0.01 })
    .withMessage('Item quantity must be positive'),
  body('items.*.unit_price')
    .isFloat({ min: 0 })
    .withMessage('Item unit price must be positive or zero'),
  
  handleValidationErrors
];

/**
 * Validate update status request
 */
const validateUpdateStatus = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid invoice ID'),
  body('status')
    .isIn(['draft', 'sent', 'viewed', 'accepted', 'rejected', 'paid', 'cancelled', 'archived'])
    .withMessage('Invalid status'),
  handleValidationErrors
];

/**
 * Validate send invoice request
 */
const validateSendInvoice = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Invalid invoice ID'),
  body('phone')
    .optional({ nullable: true })
    .trim()
    .matches(/^\+?[0-9]{8,15}$/)
    .withMessage('Invalid phone number format'),
  body('use_client_phone')
    .optional()
    .isBoolean()
    .withMessage('use_client_phone must be boolean'),
  handleValidationErrors
];

/**
 * Validate invoice list filters
 */
const validateInvoiceFilters = [
  query('type')
    .optional()
    .isIn(['invoice', 'quote'])
    .withMessage('Type must be invoice or quote'),
  query('status')
    .optional()
    .isIn(['draft', 'sent', 'viewed', 'accepted', 'rejected', 'paid', 'cancelled', 'archived'])
    .withMessage('Invalid status'),
  query('tab')
    .optional()
    .isIn(['active', 'archived', 'disabled'])
    .withMessage('Tab must be active, archived, or disabled'),
  query('client_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid client ID'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be 1-100 characters'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Invalid page number'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Invalid limit (1-1000)'),
  query('sort_by')
    .optional()
    .isIn(['created_at', 'updated_at', 'due_date', 'total_amount', 'invoice_number'])
    .withMessage('Invalid sort field'),
  query('sort_order')
    .optional()
    .isIn(['ASC', 'DESC'])
    .withMessage('Sort order must be ASC or DESC'),
  handleValidationErrors
];

/**
 * Validate public accept request
 */
const validatePublicAccept = [
  param('invoice_number')
    .trim()
    .notEmpty()
    .withMessage('Invoice number is required'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('payment_method')
    .optional()
    .trim()
    .isIn(['paypal', 'stripe'])
    .withMessage('Invalid payment method. Use: paypal, stripe'),
  handleValidationErrors
];

/**
 * Validate public reject request
 */
const validatePublicReject = [
  param('invoice_number')
    .trim()
    .notEmpty()
    .withMessage('Invoice number is required'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Rejection reason is required')
    .isLength({ min: 7, max: 1000 })
    .withMessage('Rejection reason must be 7-1000 characters'),
  handleValidationErrors
];

/**
 * Validate public mark paid request
 */
const validatePublicMarkPaid = [
  param('invoice_number')
    .trim()
    .notEmpty()
    .withMessage('Invoice number is required'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  handleValidationErrors
];

/**
 * Validate client email query
 */
const validateClientEmail = [
  query('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  handleValidationErrors
];

module.exports = {
  validateInvoiceId,
  validateInvoiceNumber,
  validateCreateInvoice,
  validateUpdateStatus,
  validateSendInvoice,
  validateInvoiceFilters,
  validatePublicAccept,
  validatePublicReject,
  validatePublicMarkPaid,
  validateClientEmail
};
