# cPanel Shared Hosting Deployment Guide

## 🎯 Complete Guide for Deploying Misayan SaaS on cPanel

This guide covers deploying Misayan SaaS on **shared hosting with cPanel and Node.js support**.

---

## ✅ Prerequisites

### Hosting Requirements
- cPanel with Node.js support (most modern shared hosting)
- Node.js >= 18.0.0
- MySQL 8.0+ (or MariaDB 10.5+)
- SSH access (optional, but recommended)
- Domain or subdomain

### What You Need
- FTP/SFTP credentials
- cPanel login credentials
- Database credentials

---

## 📦 Step 1: Prepare Files

### 1.1 Install Dependencies Locally
```bash
# On your local machine
npm install --production
```

### 1.2 Create Production .env
```bash
cp .env.example .env
```

Edit `.env` with production settings:
```env
# Database (from cPanel MySQL)
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_cpanel_db_user
DB_PASS=your_cpanel_db_password
DB_NAME=your_cpanel_db_name

# Security (GENERATE NEW SECRETS!)
JWT_SECRET=your_production_jwt_secret_here
ENCRYPTION_KEY=your_32_character_encryption_key

# Server
PORT=3000
NODE_ENV=production
APP_URL=https://yourdomain.com

# Trust proxy (IMPORTANT for cPanel)
TRUST_PROXY=true

# CORS
CORS_ORIGINS=https://yourdomain.com

# Super Admin
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=YourSecurePassword123!

# Stripe (Production Keys)
STRIPE_SECRET_KEY=sk_live_your_stripe_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# PayPal (Production)
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=live

# Logging
LOG_LEVEL=info
```

### 1.3 Files to Upload
Upload these files/folders to your cPanel:
```
✓ All project files EXCEPT:
  ✗ node_modules/ (will install on server)
  ✗ .git/
  ✗ logs/ (will be created)
  ✗ uploads/ (will be created)
  ✗ sessions/ (will be created)
```

---

## 🗄️ Step 2: Setup Database

### 2.1 Create Database in cPanel

1. Login to cPanel
2. Go to **MySQL® Databases**
3. Create new database: `your_username_misayan`
4. Create new user: `your_username_misayan`
5. Set strong password
6. Add user to database with **ALL PRIVILEGES**
7. Note the credentials

### 2.2 Database Will Auto-Initialize
The application will automatically create all tables on first run.

---

## 🚀 Step 3: Setup Node.js App in cPanel

### 3.1 Access Node.js Setup

1. Login to cPanel
2. Find **Setup Node.js App** (or **Node.js Selector**)
3. Click **Create Application**

### 3.2 Configure Application

**Application Settings:**
```
Application Mode:        Production
Application Root:        misayan-saas (or your folder name)
Application URL:         yourdomain.com (or subdomain.yourdomain.com)
Application Startup File: server.js
Node.js Version:         18.x or higher (latest available)
```

**Environment Variables:**
Click "Add Variable" and add these:
```
NODE_ENV=production
PORT=3000
```

**Important:** All other environment variables should be in your `.env` file.

### 3.3 Install Dependencies

In the Node.js App interface:
1. Click "Run NPM Install"
2. Wait for completion (may take 2-5 minutes)

Or via SSH:
```bash
cd ~/misayan-saas
npm install --production
```

### 3.4 Start Application

1. Click **Start** button in cPanel Node.js interface
2. Application should start successfully

---

## 📁 Step 4: Upload Files

### 4.1 Via FTP/SFTP (Recommended)

Using FileZilla or similar:
```
Local:  /your/local/misayan-saas/
Remote: /home/username/misayan-saas/
```

Upload all files except `node_modules/`

### 4.2 Via cPanel File Manager

1. Go to **File Manager**
2. Navigate to your application directory
3. Upload ZIP file
4. Extract in cPanel

### 4.3 Set Permissions

```bash
# Via SSH
cd ~/misayan-saas
chmod 755 server.js app.js
chmod 755 -R public/
chmod 777 -R uploads/
chmod 777 -R logs/
chmod 777 -R sessions/
chmod 777 -R backups/
```

Or via cPanel File Manager:
- Right-click folders → Change Permissions
- uploads/: 777
- logs/: 777
- sessions/: 777
- backups/: 777

---

## 🌐 Step 5: Configure Domain

### 5.1 Main Domain

If using main domain (yourdomain.com):
1. Application URL: `yourdomain.com`
2. cPanel will handle routing automatically

### 5.2 Subdomain

If using subdomain (app.yourdomain.com):
1. Create subdomain in cPanel
2. Point to application directory
3. Application URL: `app.yourdomain.com`

### 5.3 Subdomain for Tenants

For multi-tenant subdomains (tenant1.yourdomain.com):
1. Create wildcard subdomain: `*.yourdomain.com`
2. Point to same application directory
3. Application will handle routing

**DNS Configuration:**
```
Type: A Record
Host: *
Points to: Your server IP
TTL: 14400
```

---

## 🔒 Step 6: SSL Certificate

### 6.1 Free SSL (Let's Encrypt)

1. Go to cPanel → **SSL/TLS Status**
2. Select your domain
3. Click **Run AutoSSL**
4. Wait for certificate installation

### 6.2 Force HTTPS

Add to `.htaccess` in public_html:
```apache
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

---

## ✅ Step 7: Verify Installation

### 7.1 Check Application Status

In cPanel Node.js App interface:
- Status should be **Running** (green)
- No errors in logs

### 7.2 Test Endpoints

```bash
# Test landing page
curl https://yourdomain.com

# Test API
curl https://yourdomain.com/api-docs

# Test login
curl -X POST https://yourdomain.com/api/auth/superadmin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"YourPassword"}'
```

### 7.3 Check Logs

Via cPanel File Manager or SSH:
```bash
tail -f ~/misayan-saas/logs/combined-*.log
tail -f ~/misayan-saas/logs/error-*.log
```

---

## 🔧 Step 8: Configuration

### 8.1 Update Super Admin Password

1. Login to super admin panel
2. Change default password immediately
3. Update email if needed

### 8.2 Configure Stripe/PayPal

1. Add production API keys to `.env`
2. Restart application
3. Test payment integration

### 8.3 Setup Webhooks

**Stripe Webhook:**
```
URL: https://yourdomain.com/api/billing/stripe/webhook
Events: customer.subscription.*, invoice.*
```

**PayPal IPN:**
```
URL: https://yourdomain.com/api/billing/paypal/ipn
```

---

## 📊 Step 9: Monitoring

### 9.1 Application Logs

Check regularly:
```bash
# Via SSH
cd ~/misayan-saas/logs
tail -f combined-*.log
```

### 9.2 cPanel Metrics

Monitor in cPanel:
- CPU usage
- Memory usage
- Bandwidth
- Error logs

### 9.3 Database Size

Monitor database growth:
```sql
SELECT 
  table_name,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS "Size (MB)"
FROM information_schema.TABLES
WHERE table_schema = "your_database_name"
ORDER BY (data_length + index_length) DESC;
```

---

## 🔄 Step 10: Updates & Maintenance

### 10.1 Update Application

```bash
# Via SSH
cd ~/misayan-saas

# Backup first
cp -r . ../misayan-saas-backup

# Pull updates (if using git)
git pull

# Or upload new files via FTP

# Install new dependencies
npm install --production

# Restart via cPanel Node.js interface
```

### 10.2 Database Backup

**Automated Backup (recommended):**
1. cPanel → **Backup Wizard**
2. Setup automatic daily backups
3. Download backups regularly

**Manual Backup:**
```bash
# Via SSH
mysqldump -u username -p database_name > backup_$(date +%Y%m%d).sql

# Or via cPanel → phpMyAdmin → Export
```

### 10.3 File Backup

Backup these directories regularly:
- `uploads/` (user uploads)
- `sessions/` (WhatsApp sessions)
- `.env` (configuration)

---

## 🐛 Troubleshooting

### Application Won't Start

**Check Node.js version:**
```bash
node --version  # Should be >= 18.0.0
```

**Check logs:**
```bash
tail -f ~/misayan-saas/logs/error-*.log
```

**Common issues:**
- Missing `.env` file
- Wrong database credentials
- Missing JWT_SECRET
- Node.js version too old

### Database Connection Failed

**Verify credentials:**
```bash
mysql -u username -p database_name
```

**Check .env:**
```env
DB_HOST=localhost  # NOT 127.0.0.1 on some hosts
DB_PORT=3306
```

**Check MySQL remote access:**
- Some hosts require localhost only
- Check cPanel → Remote MySQL

### Port Issues

**cPanel uses Passenger, not direct port binding:**
- Don't worry about PORT in .env
- Passenger handles port mapping
- Application listens on 'passenger' socket

### Permission Denied

**Fix permissions:**
```bash
chmod 755 -R ~/misayan-saas
chmod 777 -R ~/misayan-saas/uploads
chmod 777 -R ~/misayan-saas/logs
chmod 777 -R ~/misayan-saas/sessions
```

### High Memory Usage

**Optimize:**
1. Reduce connection pool size in `config/database.js`:
```javascript
connectionLimit: 5  // Instead of 20
```

2. Enable compression (already enabled)
3. Monitor with cPanel metrics

### Subdomain Not Working

**Check DNS:**
- Wildcard A record: `*.yourdomain.com`
- Wait for DNS propagation (up to 48h)

**Check cPanel:**
- Subdomain created and pointing to app directory
- Application URL matches subdomain

---

## 📋 Checklist

### Pre-Deployment
- [ ] Generate production JWT_SECRET
- [ ] Generate production ENCRYPTION_KEY
- [ ] Update .env with production values
- [ ] Test locally with production .env
- [ ] Backup current data (if updating)

### Deployment
- [ ] Create database in cPanel
- [ ] Upload files via FTP/SFTP
- [ ] Setup Node.js app in cPanel
- [ ] Install dependencies
- [ ] Configure environment variables
- [ ] Set file permissions
- [ ] Start application

### Post-Deployment
- [ ] Verify application is running
- [ ] Test all endpoints
- [ ] Check logs for errors
- [ ] Install SSL certificate
- [ ] Force HTTPS
- [ ] Change super admin password
- [ ] Configure payment gateways
- [ ] Setup webhooks
- [ ] Test payment flow
- [ ] Setup backups
- [ ] Monitor for 24 hours

### Security
- [ ] Strong database password
- [ ] Strong super admin password
- [ ] SSL certificate installed
- [ ] HTTPS enforced
- [ ] Production API keys (not test)
- [ ] Firewall rules (if available)
- [ ] Regular backups enabled

---

## 🎯 Performance Tips

### 1. Enable OPcache (if available)
Ask your host to enable Node.js caching

### 2. Use CDN for Static Files
- Upload CSS/JS to CDN
- Update paths in HTML

### 3. Database Optimization
```sql
-- Add indexes (already included in schema)
-- Regular OPTIMIZE TABLE
OPTIMIZE TABLE conversations;
OPTIMIZE TABLE messages;
```

### 4. Compress Uploads
Images and files should be compressed before upload

### 5. Monitor Resource Usage
- Check cPanel metrics daily
- Upgrade plan if needed

---

## 📞 Support

### cPanel Issues
Contact your hosting provider:
- Node.js not available
- Permission issues
- Database issues
- SSL issues

### Application Issues
Check documentation:
- README.md
- TROUBLESHOOTING.md
- Logs in logs/ directory

---

## ✅ Success Indicators

Your deployment is successful when:
- ✅ Application status is "Running" in cPanel
- ✅ Landing page loads at your domain
- ✅ Login page works
- ✅ Super admin can login
- ✅ API documentation accessible
- ✅ SSL certificate installed
- ✅ No errors in logs
- ✅ Database tables created
- ✅ Webhooks receiving events

---

## 🎉 You're Live!

Congratulations! Your Misayan SaaS is now running on shared hosting.

**Next steps:**
1. Create your first tenant
2. Test all features
3. Configure payment plans
4. Start marketing!

---

**Important Notes:**

1. **Passenger vs PM2:**
   - cPanel uses Passenger (built-in)
   - Don't use PM2 on shared hosting
   - Application auto-restarts with Passenger

2. **File Paths:**
   - Use relative paths, not absolute
   - Application root is your cPanel directory

3. **Environment:**
   - Always use production mode
   - Never expose .env file
   - Keep secrets secure

4. **Backups:**
   - Automated daily backups
   - Download backups weekly
   - Test restore process

5. **Monitoring:**
   - Check logs daily
   - Monitor resource usage
   - Watch for errors

---

**Deployment Time:** 30-60 minutes  
**Difficulty:** Medium  
**Cost:** Shared hosting ($5-20/month)

Good luck with your deployment! 🚀
