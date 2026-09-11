/**
 * Invoice and Quote Routes
 * Multi-tenant invoice management endpoints
 * 
 * @module routes/invoices
 */

const express = require('express');
const router = express.Router();
const InvoiceController = require('../controllers/InvoiceController');
const { requireAuth } = require('../middleware/auth');
const { tenantMiddleware, requireTenant } = require('../middleware/tenant');
const { checkResourceLimit, checkFeatureEnabled } = require('../middleware/planLimits');
const rateLimit = require('express-rate-limit');
const {
  validateInvoiceId,
  validateCreateInvoice,
  validateUpdateStatus,
  validateSendInvoice,
  validateInvoiceFilters,
  validatePublicAccept,
  validatePublicReject,
  validatePublicMarkPaid,
  validateClientEmail
} = require('../middleware/validators/invoiceValidation');

const invoiceController = new InvoiceController();

// Rate limiting for public endpoints
const publicRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});

router.use(tenantMiddleware);

// ============================================
// ADMIN ROUTES (Protected)
// ============================================

/**
 * @route   POST /api/invoices/admin
 * @desc    Create new invoice or quote
 * @access  Admin only
 */
router.post('/admin', 
  requireAuth, 
  requireTenant,
  async (req, res, next) => {
    const type = req.body.type || 'invoice';
    if (type === 'quote') {
      return checkFeatureEnabled('quotes')(req, res, () => {
        checkResourceLimit('quotes')(req, res, next);
      });
    } else {
      return checkFeatureEnabled('invoices')(req, res, () => {
        checkResourceLimit('invoices')(req, res, next);
      });
    }
  },
  validateCreateInvoice, 
  invoiceController.create.bind(invoiceController)
);

/**
 * @route   GET /api/invoices/admin
 * @desc    List invoices with filters (supports tab: active, archived, disabled)
 * @access  Admin only
 */
router.get('/admin', 
  requireAuth, 
  requireTenant,
  validateInvoiceFilters, 
  invoiceController.list.bind(invoiceController)
);

/**
 * @route   GET /api/invoices/admin/statistics
 * @desc    Get dashboard statistics
 * @access  Admin only
 */
router.get('/admin/statistics', 
  requireAuth, 
  requireTenant,
  invoiceController.getStatistics.bind(invoiceController)
);

/**
 * @route   GET /api/invoices/admin/:id
 * @desc    Get invoice by ID
 * @access  Admin only
 */
router.get('/admin/:id', 
  requireAuth, 
  requireTenant,
  validateInvoiceId, 
  invoiceController.getById.bind(invoiceController)
);

/**
 * @route   PUT /api/invoices/admin/:id/status
 * @desc    Update invoice status
 * @access  Admin only
 */
router.put('/admin/:id/status', 
  requireAuth, 
  requireTenant,
  validateUpdateStatus, 
  invoiceController.updateStatus.bind(invoiceController)
);

/**
 * @route   PUT /api/invoices/admin/:id/toggle-active
 * @desc    Enable or disable invoice
 * @access  Admin only
 */
router.put('/admin/:id/toggle-active', 
  requireAuth, 
  requireTenant,
  validateInvoiceId, 
  invoiceController.toggleActive.bind(invoiceController)
);

/**
 * @route   POST /api/invoices/admin/:id/archive
 * @desc    Archive invoice
 * @access  Admin only
 */
router.post('/admin/:id/archive', 
  requireAuth, 
  requireTenant,
  validateInvoiceId, 
  invoiceController.archive.bind(invoiceController)
);

/**
 * @route   DELETE /api/invoices/admin/:id
 * @desc    Delete invoice permanently
 * @access  Admin only
 */
router.delete('/admin/:id', 
  requireAuth, 
  requireTenant,
  validateInvoiceId, 
  invoiceController.delete.bind(invoiceController)
);

/**
 * @route   POST /api/invoices/admin/:id/respond
 * @desc    Respond to client rejection
 * @access  Admin only
 */
router.post('/admin/:id/respond', 
  requireAuth, 
  requireTenant,
  validateInvoiceId, 
  invoiceController.respondToRejection.bind(invoiceController)
);

/**
 * @route   POST /api/invoices/admin/:id/send-whatsapp
 * @desc    Send invoice via WhatsApp
 * @access  Admin only
 */
router.post('/admin/:id/send-whatsapp', 
  requireAuth, 
  requireTenant,
  validateSendInvoice, 
  invoiceController.sendViaWhatsApp.bind(invoiceController)
);

/**
 * @route   POST /api/invoices/admin/:id/convert-to-invoice
 * @desc    Convert quote to invoice
 * @access  Admin only
 */
router.post('/admin/:id/convert-to-invoice', 
  requireAuth, 
  requireTenant,
  validateInvoiceId, 
  invoiceController.convertToInvoice.bind(invoiceController)
);

/**
 * @route   POST /api/invoices/admin/:id/finalize-rejection
 * @desc    Finalize rejection and archive invoice
 * @access  Admin only
 */
router.post('/admin/:id/finalize-rejection', 
  requireAuth, 
  requireTenant,
  validateInvoiceId, 
  invoiceController.finalizeRejection.bind(invoiceController)
);

/**
 * @route   POST /api/invoices/admin/:id/reactivate
 * @desc    Reactivate invoice after rejection
 * @access  Admin only
 */
router.post('/admin/:id/reactivate', 
  requireAuth, 
  requireTenant,
  validateInvoiceId, 
  invoiceController.reactivate.bind(invoiceController)
);

// ============================================
// PUBLIC ROUTES (Client Access)
// ============================================

/**
 * @route   GET /api/invoices/public/:invoice_number
 * @desc    Get invoice by number (public view, requires email)
 * @access  Public
 */
router.get('/public/:invoice_number', 
  publicRateLimit,
  invoiceController.publicGetInvoice.bind(invoiceController)
);

/**
 * @route   POST /api/invoices/public/:invoice_number/accept
 * @desc    Accept invoice or quote
 * @access  Public (requires email)
 */
router.post('/public/:invoice_number/accept', 
  publicRateLimit,
  validatePublicAccept, 
  invoiceController.publicAccept.bind(invoiceController)
);

/**
 * @route   POST /api/invoices/public/:invoice_number/reject
 * @desc    Reject invoice or quote with reason (min 7 chars)
 * @access  Public (requires email)
 */
router.post('/public/:invoice_number/reject', 
  publicRateLimit,
  validatePublicReject, 
  invoiceController.publicReject.bind(invoiceController)
);

/**
 * @route   GET /api/invoices/public/:invoice_number/payment-link
 * @desc    Get payment link for accepted invoice
 * @access  Public (requires email)
 */
router.get('/public/:invoice_number/payment-link', 
  publicRateLimit,
  invoiceController.publicGetPaymentLink.bind(invoiceController)
);

/**
 * @route   GET /api/invoices/public/:invoice_number/payment-methods
 * @desc    Get available payment methods for invoice
 * @access  Public (requires email)
 */
router.get('/public/:invoice_number/payment-methods', 
  publicRateLimit,
  invoiceController.publicGetPaymentMethods.bind(invoiceController)
);

/**
 * @route   POST /api/invoices/public/:invoice_number/mark-paid
 * @desc    Mark invoice as paid by client
 * @access  Public (requires email)
 */
router.post('/public/:invoice_number/mark-paid', 
  publicRateLimit,
  validatePublicMarkPaid, 
  invoiceController.publicMarkPaid.bind(invoiceController)
);

module.exports = router;
