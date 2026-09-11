/**
 * Misayan SaaS - Multi-tenant WhatsApp Business Platform
 * Main Server Entry Point
 * 
 * @description Production-ready server with multi-tenant support, security hardening,
 *              and comprehensive error handling
 * @version 2.0.0
 * @license Commercial
 */

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const { initDatabase } = require('./config/database');
const { logger, requestLogger } = require('./config/logger');
const { setupSwagger } = require('./config/swagger');
const { apiLimiter, authLimiter } = require('./middleware/security');
const { tenantMiddleware } = require('./middleware/tenant');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Validate critical environment variables
const requiredEnvVars = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME', 'ENCRYPTION_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  logger.error('Please configure your .env file properly');
  process.exit(1);
}

logger.info('🚀 Starting Misayan SaaS Platform...');
logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
logger.info(`🔧 Node Version: ${process.version}`);

const app = express();
const server = http.createServer(app);

// Configure trust proxy for reverse proxy support
const trustProxy = process.env.TRUST_PROXY || 'loopback';
const parsedTrustProxy = trustProxy === 'true' ? true : 
                         trustProxy === 'false' ? false : 
                         !isNaN(trustProxy) ? parseInt(trustProxy) : trustProxy;
app.set('trust proxy', parsedTrustProxy);
logger.info(`🔒 Trust proxy configured: ${parsedTrustProxy}`);

// Parse CORS origins
const corsOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

// Socket.IO configuration
const io = socketIo(server, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling']
});

logger.info(`🔌 Socket.IO CORS origins: ${corsOrigins.join(', ')}`);

// Request logging middleware
app.use(requestLogger);

// Security Middleware - Helmet.js
app.use(helmet({
  frameguard: { action: 'sameorigin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://js.stripe.com", "https://connect.facebook.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "ws:", "wss:", "https://api.stripe.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://*.facebook.com", "https://*.facebook.net"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com", "https://*.facebook.com"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Compression middleware
app.use(compression());

// CORS Configuration
app.use(cors({
  origin: corsOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID", "X-CSRF-Token"],
  credentials: true
}));

logger.info(`🌐 Express CORS origins: ${corsOrigins.join(', ')}`);

app.use('/api-docs', (req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Content-Security-Policy');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  next();
});

// API Documentation (Swagger)
setupSwagger(app);
app.get('/api/docs', (req, res) => res.redirect('/api-docs'));
app.get('/api/docs/', (req, res) => res.redirect('/api-docs/'));

// Body parsers - MUST come before routes
app.use((req, res, next) => {
  if (req.path.startsWith('/css/') ||
      req.path.startsWith('/js/') ||
      req.path.startsWith('/images/') ||
      req.path.startsWith('/uploads/')) {
    return next();
  }
  
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    express.json({ limit: '50mb' })(req, res, next);
  } else {
    next();
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith('/css/') ||
      req.path.startsWith('/js/') ||
      req.path.startsWith('/images/') ||
      req.path.startsWith('/uploads/')) {
    return next();
  }
  express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
});

// Translation middleware - Add i18n support to all routes
const translationService = require('./services/TranslationService');
app.use(translationService.middleware());

// RTL middleware - Add RTL/LTR detection to all routes
const rtlMiddleware = require('./middleware/rtl');
app.use(rtlMiddleware);

// Rate limiting
app.use('/api', apiLimiter);

// Routes - API routes MUST come BEFORE static files
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/superadmin', require('./routes/superadmin'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin/conversations', require('./routes/conversations'));
app.use('/api/whatsapp-cloud', require('./routes/whatsapp-cloud'));
app.use('/api/user/whatsapp-cloud', require('./routes/whatsapp-cloud-user'));

// Direct webhook route for Facebook (expects /webhook, not /api/whatsapp-cloud/webhook)
const WhatsAppCloudController = require('./controllers/WhatsAppCloudController');
const { asyncHandler } = require('./middleware/errorHandler');
app.get('/webhook', WhatsAppCloudController.webhookVerify);
app.post('/webhook', asyncHandler(WhatsAppCloudController.webhookReceive));

app.use('/api/billing', require('./routes/billing'));
app.use('/api/landing', require('./routes/landing'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/mass-messaging', require('./routes/mass-messaging'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/widget', require('./routes/widget'));
app.use('/api/profile', require('./routes/profile'));
// WooCommerce routes - includes both public webhook and authenticated endpoints
app.use('/api', require('./routes/woocommerce'));
app.use('/api/ai-config', require('./routes/ai-config'));

// Apply authentication and tenant middleware to tenant routes
// IMPORTANT: More specific routes MUST come BEFORE general routes
// CRITICAL: requireAuth MUST come BEFORE tenantMiddleware to extract tenantId from validated token
const { requireAuth } = require('./middleware/auth');
app.use('/api/tenant/whatsapp', requireAuth, tenantMiddleware, require('./routes/whatsapp'));
app.use('/api/tenant/mass-send', requireAuth, tenantMiddleware, require('./routes/mass-send'));
app.use('/api/tenant/conversations', requireAuth, tenantMiddleware, require('./routes/conversations'));
app.use('/api/tenant/faqs', requireAuth, tenantMiddleware, require('./routes/faq'));
app.use('/api/tenant/payments', requireAuth, tenantMiddleware, require('./routes/payments'));
app.use('/api/tenant/ai-config', requireAuth, tenantMiddleware, require('./routes/ai-config'));
app.use('/api/tenant/plan', requireAuth, tenantMiddleware, require('./routes/plan-management'));
app.use('/api/tenant/biolink', requireAuth, tenantMiddleware, require('./routes/biolink'));
// Mount tenant routes (includes contacts, dashboard, etc.)
app.use('/api/tenant', requireAuth, tenantMiddleware, require('./routes/tenant'));

// Public routes
app.use('/api/public', require('./routes/public'));

// Bio Link public pages route
app.use('/b', require('./routes/biolink-public'));

// PWA routes (public)
app.use('/api/pwa', require('./routes/pwa'));

// Webhook routes (must be before body parser for raw body access)
const AddonWebhookController = require('./controllers/AddonWebhookController');
app.post('/api/webhooks/stripe-addons', express.raw({ type: 'application/json' }), AddonWebhookController.handleStripeWebhook.bind(AddonWebhookController));
app.post('/api/webhooks/paypal-addons', AddonWebhookController.handlePayPalWebhook.bind(AddonWebhookController));

// Serve addon icons (public route - no auth required)
app.use('/addons', express.static(path.join(__dirname, 'addons'), {
  index: false,
  extensions: ['png', 'jpg', 'jpeg', 'svg', 'ico', 'webp'],
  setHeaders: (res, filePath) => {
    // Only allow icon files
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp'];
    const ext = path.extname(filePath).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// Serve static files - MUST come AFTER API routes
app.use('/locales', express.static(path.join(__dirname, 'locales')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
});

app.get('/terms-and-conditions', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms-and-conditions.html'));
});

app.get('/register', (req, res) => {
  // Verificar se o usuário tem um plano selecionado
  const planId = req.query.plan;
  
  if (!planId) {
    // Se não tem plano selecionado, redirecionar para a página principal
    return res.redirect('/');
  }
  
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/checkout', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

app.get('/payment-instructions', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'payment-instructions.html'));
});

app.get('/payment-pending', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'payment-pending.html'));
});

app.get('/payment-success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'payment-success.html'));
});

app.get('/superadmin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'superadmin', 'login.html'));
});

// Serve superadmin pages with specific routes
app.get('/superadmin/:page?', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'superadmin', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/user', (req, res) => {
  // User page should redirect to login if not authenticated
  res.sendFile(path.join(__dirname, 'public', 'user', 'index.html'));
});

app.get('/test-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-login.html'));
});

// Public invoice view page
app.get('/invoice/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'invoice-view.html'));
});

// Ignore common requests
app.get('/.well-known/*', (req, res) => res.status(404).end());
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 404 Handler
app.use(notFoundHandler);

// Error handling middleware
app.use(errorHandler);

// Make io available to routes
app.set('io', io);

// Socket.IO connection handling for root namespace
io.on('connection', (socket) => {
  logger.debug(`Client connected to root namespace: ${socket.id}`);

  socket.on('join-room', (room) => {
    socket.join(room);
    logger.debug(`Client ${socket.id} joined room: ${room}`);
  });

  socket.on('join-tenant', (tenantId) => {
    const tenantRoom = `TENANT:${tenantId}`;
    socket.join(tenantRoom);
    logger.debug(`Client ${socket.id} joined tenant: ${tenantRoom}`);
  });

  socket.on('error', (error) => {
    logger.error(`Socket error: ${error.message}`, { socketId: socket.id });
  });

  socket.on('disconnect', (reason) => {
    logger.debug(`Client disconnected: ${socket.id}, Reason: ${reason}`);
  });
});

// Dynamic namespace handler for tenant namespaces (/tenant/:tenantId)
io.of(/^\/tenant\/\d+$/).on('connection', (socket) => {
  const namespace = socket.nsp.name;
  const tenantId = namespace.split('/').pop();
  
  logger.info(`Client connected to tenant namespace: ${namespace}, socket: ${socket.id}`);
  
  // Join tenant room automatically
  socket.join(`tenant-${tenantId}`);
  socket.join(`tenant_${tenantId}`); // Also join with underscore format for mass-send events
  
  socket.on('join-store', (store) => {
    socket.join(`store-${store}`);
    logger.debug(`Client ${socket.id} joined store room: store-${store}`);
  });
  
  socket.on('join-department', (department) => {
    socket.join(`department-${department}`);
    logger.debug(`Client ${socket.id} joined department room: department-${department}`);
  });
  
  // Handle start-mass-send event
  socket.on('start-mass-send', async (data) => {
    const { sendId } = data;
    logger.info(`Starting mass send ${sendId} for tenant ${tenantId}`);
    
    try {
      const massSendService = require('./services/MassSendService');
      massSendService.processMassSend(sendId, parseInt(tenantId));
    } catch (error) {
      logger.error(`Error starting mass send ${sendId}:`, error);
      socket.emit('mass-send-error', { sendId, error: error.message });
    }
  });
  
  // Handle pause-mass-send event
  socket.on('pause-mass-send', (data) => {
    const { sendId } = data;
    logger.info(`Pausing mass send ${sendId} for tenant ${tenantId}`);
    
    try {
      const massSendService = require('./services/MassSendService');
      massSendService.pauseSend(sendId);
    } catch (error) {
      logger.error(`Error pausing mass send ${sendId}:`, error);
    }
  });
  
  // Handle cancel-mass-send event
  socket.on('cancel-mass-send', (data) => {
    const { sendId } = data;
    logger.info(`Cancelling mass send ${sendId} for tenant ${tenantId}`);
    
    try {
      const massSendService = require('./services/MassSendService');
      massSendService.cancelSend(sendId);
    } catch (error) {
      logger.error(`Error cancelling mass send ${sendId}:`, error);
    }
  });
  
  socket.on('error', (error) => {
    logger.error(`Socket error in tenant namespace: ${error.message}`, { socketId: socket.id, namespace });
  });
  
  socket.on('disconnect', (reason) => {
    logger.debug(`Client disconnected from tenant namespace: ${socket.id}, Reason: ${reason}`);
  });
});

// Unhandled error handling
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled promise rejection', { error: err.message, stack: err.stack });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  
  // Disconnect all WhatsApp instances
  try {
    const { getWhatsAppService } = require('./services/WhatsAppService');
    const whatsappService = getWhatsAppService();
    if (whatsappService) {
      logger.info('Disconnecting all WhatsApp instances...');
      await whatsappService.disconnectAll();
      logger.info('All WhatsApp instances disconnected');
    }
  } catch (error) {
    logger.error('Error disconnecting WhatsApp instances', { error: error.message });
  }
  
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Initialize and start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    logger.info('📦 Initializing database...');
    await initDatabase();
    logger.info('✅ Database initialized successfully');

    logger.info('🌍 Initializing translations...');
    const { initializeDefaultTranslations } = require('./config/i18n');
    await initializeDefaultTranslations();
    logger.info('✅ Translations initialized successfully');

    // Initialize WhatsApp Service
    logger.info('📱 Initializing WhatsApp Service...');
    const { getWhatsAppService } = require('./services/WhatsAppService');
    const whatsappService = getWhatsAppService(io);
    app.set('whatsappService', whatsappService);
    logger.info('✅ WhatsApp Service initialized');

    // Restore saved WhatsApp sessions
    logger.info('🔄 Starting WhatsApp session restoration...');
    if (whatsappService && typeof whatsappService.restoreAllSessions === 'function') {
      whatsappService.restoreAllSessions().catch(err => {
        logger.error('Error restoring WhatsApp sessions:', err);
      });
    } else {
      logger.warn('⚠️  restoreAllSessions method not available on whatsappService');
    }

    // Initialize Mass Send Service
    logger.info('📤 Initializing Mass Send Service...');
    const massSendService = require('./services/MassSendService');
    massSendService.initialize(io, whatsappService);
    app.set('massSendService', massSendService);
    logger.info('✅ Mass Send Service initialized');

    // Initialize Notification Service
    logger.info('🔔 Initializing Notification Service...');
    const notificationService = require('./services/NotificationService');
    notificationService.initialize(whatsappService);
    app.set('notificationService', notificationService);
    logger.info('✅ Notification Service initialized');

    // Detect if running under Passenger (cPanel shared hosting)
    const isPassenger = typeof(PhusionPassenger) !== 'undefined' || process.env.PASSENGER_APP_ENV;
    
    if (isPassenger) {
      server.listen('passenger', () => {
        logger.info('🚀 Server running under Passenger (cPanel)');
        logger.info('✅ System ready to accept connections');
      });
    } else {
      const HOST = process.env.HOST || '0.0.0.0';
      server.listen(PORT, HOST, () => {
        logger.info(`🚀 Server running on ${HOST}:${PORT}`);
        logger.info(`🌐 Access: http://localhost:${PORT}`);
        logger.info(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
        logger.info(`👑 Super Admin: http://localhost:${PORT}/superadmin`);
        logger.info('✅ System ready to accept connections');
      });
    }
  } catch (error) {
    logger.error('❌ Error starting server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

startServer();

module.exports = { app, server, io };
