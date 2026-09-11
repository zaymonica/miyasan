# Misayan SaaS - Multi-tenant WhatsApp Business Platform

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![License](https://img.shields.io/badge/license-Regular%20%7C%20Extended-orange.svg)

## Overview

Misayan SaaS is a powerful, feature-rich Multi-tenant WhatsApp Business SaaS Platform built with Node.js, MySQL, and modern web technologies. Perfect for entrepreneurs and businesses looking to offer WhatsApp marketing and communication services to their clients.

## Package Contents

```
├── documentation/     → Step-by-step installation and configuration guide
│   └── index.html     → Open this file in your browser for complete documentation
│
├── upload/            → Application source code (upload to your server)
│   ├── config/        → Configuration files
│   ├── controllers/   → Application controllers
│   ├── models/        → Database models
│   ├── routes/        → API routes
│   ├── services/      → Business logic services
│   ├── public/        → Static assets
│   └── ...
│
├── README.md          → This file
└── LICENSE.md         → License terms
```

## Key Features

### Super Admin Panel
- Complete tenant management system
- Subscription plan creation and management
- Multi-currency support for global operations
- Built-in translation management (i18n)
- Real-time analytics dashboard
- System-wide configuration and branding

### Tenant (Admin) Panel
- Full WhatsApp Business API integration
- Multi-user conversation management
- CRM-style contact organization
- Bulk messaging campaigns with scheduling
- AI-powered automated responses (DeepSeek/OpenAI)
- Payment link generation and tracking
- Professional invoice system
- WooCommerce integration
- Embeddable chat widgets
- Team member roles and permissions

### User (Employee) Panel
- Assigned conversation handling
- Real-time chat with Socket.IO
- Mobile responsive design
- Push notifications

## Technical Specifications

| Requirement | Minimum Version |
|-------------|-----------------|
| Node.js | 18.0.0+ |
| MySQL | 8.0+ |
| npm | 9.0.0+ |

### Tech Stack
- **Backend**: Node.js, Express.js
- **Database**: MySQL 8+
- **Real-time**: Socket.IO
- **Authentication**: JWT, bcrypt
- **Payment**: Stripe, PayPal
- **WhatsApp**: Baileys
- **Internationalization**: i18next
- **Documentation**: Swagger/OpenAPI

## Hosting Compatibility

- ✅ VPS / Dedicated Servers
- ✅ Cloud Platforms (AWS, DigitalOcean, Linode, etc.)
- ✅ cPanel Shared Hosting (fully supported)
- ✅ Docker containers

## Installation

1. Open the `documentation/index.html` file in your browser
2. Follow the step-by-step installation guide
3. Upload the contents of the `upload/` folder to your server
4. Configure your environment variables
5. Run the database migrations
6. Start the application

For detailed instructions, please refer to the documentation included in this package.

## Security Features

- JWT token-based authentication
- Role-Based Access Control (RBAC)
- SQL injection protection
- XSS prevention
- CSRF protection
- Rate limiting
- Data encryption at rest
- Helmet.js security headers

## Support

For support inquiries, please use the support tab on CodeCanyon or contact us at:
- Email: support@saas.misayan.cloud

## Changelog

Please refer to `upload/CHANGELOG.md` for version history and updates.

## Credits

- Node.js - https://nodejs.org/
- Express.js - https://expressjs.com/
- Socket.IO - https://socket.io/
- Baileys - WhatsApp Web API
- Stripe - https://stripe.com/
- PayPal - https://www.paypal.com/

---

**Thank you for purchasing Misayan SaaS!**

If you like this product, please consider leaving a rating on CodeCanyon. Your feedback helps us improve and create better products.
