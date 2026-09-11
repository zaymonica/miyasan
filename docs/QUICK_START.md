# Quick Start Guide

## 🚀 Getting Started with Misayan SaaS

### Prerequisites

- Node.js >= 18.0.0
- MySQL >= 8.0
- npm >= 9.0.0

### Installation Steps

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your configuration
# IMPORTANT: Change these values!
# - JWT_SECRET (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
# - ENCRYPTION_KEY (32 characters)
# - Database credentials
# - Stripe/PayPal keys
```

#### 3. Create Database

```sql
CREATE DATABASE misayan_saas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### 4. Initialize Database

The database will be automatically initialized on first run. The server will create all tables and insert default data.

#### 5. Start Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start

# With PM2 (recommended for production)
npm run pm2:start
```

#### 6. Access Application

- **Landing Page:** http://localhost:3000
- **Super Admin:** http://localhost:3000/superadmin
- **Tenant Login:** http://localhost:3000/login
- **API Documentation:** http://localhost:3000/api-docs

### Default Credentials

**Super Admin:**
- Email: admin@saas.misayan.cloud
- Password: ChangeThisPassword123!

⚠️ **IMPORTANT:** Change the super admin password immediately after first login!

### Testing the Installation

1. **Test Super Admin Login:**
```bash
curl -X POST http://localhost:3000/api/auth/superadmin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@saas.misayan.cloud","password":"ChangeThisPassword123!"}'
```

2. **Verify Database Connection:**
Check logs/combined-*.log for successful database initialization messages.

3. **Access API Documentation:**
Open http://localhost:3000/api-docs in your browser.

### Next Steps

1. **Change Super Admin Password**
2. **Configure Stripe/PayPal** (for billing)
3. **Create Subscription Plans**
4. **Add Currencies**
5. **Configure Translations**
6. **Create First Tenant**

### Common Issues

**Database Connection Failed:**
- Check MySQL is running
- Verify database credentials in .env
- Ensure database exists

**Port Already in Use:**
- Change PORT in .env file
- Or stop the process using port 6000

**JWT_SECRET Missing:**
- Generate a secure secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Add to .env file

### Development Workflow

```bash
# Run tests
npm test

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Watch mode for tests
npm run test:watch
```

### Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed production deployment instructions.

### Support

For issues or questions:
- Check documentation in `/docs`
- Review logs in `/logs`
- Check IMPLEMENTATION_GUIDE.md
- Review NEXT_STEPS.md

---

**You're all set!** Start building your multi-tenant WhatsApp Business platform. 🎉
