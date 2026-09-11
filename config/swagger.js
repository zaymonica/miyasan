/**
 * Swagger/OpenAPI Configuration
 * API documentation setup
 * 
 * @module config/swagger
 */

const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Misayan SaaS API',
      version: '1.0.0',
      description: 'Multi-tenant WhatsApp Business SaaS Platform API Documentation',
      contact: {
        name: 'Misayan Support',
        email: 'support@saas.misayan.cloud',
      },
      license: {
        name: 'Commercial',
      },
    },
    servers: [
      {
        url: process.env.APP_URL || 'http://localhost:3000',
        description: 'API Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        tenantId: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Tenant-ID',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./routes/*.js', './controllers/*.js'],
};

const specs = swaggerJsdoc(options);

function setupSwagger(app) {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(specs, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'Misayan SaaS API Documentation',
    })
  );
}

module.exports = { setupSwagger, specs };
