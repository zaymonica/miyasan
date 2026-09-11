/**
 * Database Configuration and Initialization
 * Multi-tenant database setup with comprehensive schema
 * 
 * @module config/database
 */

const mysql = require('mysql2/promise');
const { logger } = require('./logger');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

/**
 * Test database connection
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    logger.info('✅ Database connection successful');
    connection.release();
    return true;
  } catch (error) {
    logger.error('❌ Database connection failed', { error: error.message });
    throw error;
  }
}

/**
 * Initialize database schema
 */
async function initDatabase() {
  let connection;
  try {
    connection = await pool.getConnection();
    logger.info('📄 Initializing database schema...');

    // Create super_admins table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS super_admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ super_admins table created/verified');

    // Create tenants table
    // NOTE: Tenant ID 0 is reserved for the SuperAdmin system tenant
    // Regular tenants start from ID 1
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        subdomain VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        company_name VARCHAR(150),
        plan_id INT,
        status ENUM('active', 'suspended', 'cancelled', 'trial', 'grace_period') DEFAULT 'trial',
        trial_ends_at TIMESTAMP NULL,
        subscription_id VARCHAR(255),
        stripe_customer_id VARCHAR(255),
        paypal_subscription_id VARCHAR(255),
        pagbank_customer_id VARCHAR(255),
        max_users INT DEFAULT 5,
        max_stores INT DEFAULT 1,
        max_departments INT DEFAULT 5,
        max_contacts INT DEFAULT 1000,
        max_devices INT DEFAULT 1,
        max_conversations INT DEFAULT 1000,
        max_messages_per_month INT DEFAULT 10000,
        max_faqs INT DEFAULT 10,
        max_widgets INT DEFAULT 1,
        max_invoices_per_month INT DEFAULT 50,
        max_quotes_per_month INT DEFAULT 50,
        max_payment_links_per_month INT DEFAULT 50,
        max_contact_groups INT DEFAULT 10,
        bot_enabled BOOLEAN DEFAULT TRUE,
        group_enabled BOOLEAN DEFAULT FALSE,
        current_messages_count INT DEFAULT 0,
        messages_reset_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        subscription_start_date TIMESTAMP NULL,
        subscription_end_date TIMESTAMP NULL,
        grace_period_end TIMESTAMP NULL,
        next_billing_date TIMESTAMP NULL,
        last_payment_date TIMESTAMP NULL,
        payment_status ENUM('paid', 'pending', 'overdue', 'failed') DEFAULT 'pending',
        suspension_date TIMESTAMP NULL,
        preferred_language VARCHAR(5) DEFAULT 'en',
        settings JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_subdomain (subdomain),
        INDEX idx_email (email),
        INDEX idx_status (status),
        INDEX idx_plan (plan_id),
        INDEX idx_payment_status (payment_status),
        INDEX idx_next_billing_date (next_billing_date),
        INDEX idx_grace_period_end (grace_period_end)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ tenants table created/verified');

    // Add bot_enabled and group_enabled columns if they don't exist (for existing databases)
    try {
      await connection.execute(`
        ALTER TABLE tenants 
        ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS group_enabled BOOLEAN DEFAULT FALSE
      `);
      logger.info('✅ bot_enabled and group_enabled columns added/verified');
    } catch (alterError) {
      // MySQL doesn't support IF NOT EXISTS for columns, try individual adds
      try {
        await connection.execute(`ALTER TABLE tenants ADD COLUMN bot_enabled BOOLEAN DEFAULT TRUE`);
      } catch (e) { /* Column might already exist */ }
      try {
        await connection.execute(`ALTER TABLE tenants ADD COLUMN group_enabled BOOLEAN DEFAULT FALSE`);
      } catch (e) { /* Column might already exist */ }
      logger.info('✅ bot_enabled and group_enabled columns checked');
    }

    // Create subscription_plans table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        billing_period ENUM('monthly', 'yearly') DEFAULT 'monthly',
        max_stores INT DEFAULT 1,
        max_users INT DEFAULT 5,
        max_departments INT DEFAULT 5,
        max_contacts INT DEFAULT 1000,
        max_devices INT DEFAULT 1,
        max_conversations INT DEFAULT 1000,
        max_messages_per_month INT DEFAULT 10000,
        max_contact_groups INT DEFAULT 10,
        max_faqs INT DEFAULT 10,
        max_widgets INT DEFAULT 1,
        max_invoices_per_month INT DEFAULT 50,
        max_quotes_per_month INT DEFAULT 50,
        max_payment_links_per_month INT DEFAULT 50,
        whatsapp_enabled BOOLEAN DEFAULT TRUE,
        ai_enabled BOOLEAN DEFAULT FALSE,
        woocommerce_enabled BOOLEAN DEFAULT FALSE,
        analytics_enabled BOOLEAN DEFAULT TRUE,
        priority_support_enabled BOOLEAN DEFAULT FALSE,
        api_access_enabled BOOLEAN DEFAULT FALSE,
        custom_branding_enabled BOOLEAN DEFAULT FALSE,
        invoices_enabled BOOLEAN DEFAULT FALSE,
        quotes_enabled BOOLEAN DEFAULT FALSE,
        widgets_enabled BOOLEAN DEFAULT FALSE,
        payment_links_enabled BOOLEAN DEFAULT FALSE,
        biolink_enabled BOOLEAN DEFAULT FALSE,
        max_bio_pages INT DEFAULT 0,
        max_short_links INT DEFAULT 0,
        max_file_transfers INT DEFAULT 0,
        max_vcards INT DEFAULT 0,
        max_event_links INT DEFAULT 0,
        max_html_pages INT DEFAULT 0,
        max_qr_codes INT DEFAULT 0,
        is_trial BOOLEAN DEFAULT FALSE,
        trial_days INT DEFAULT 0,
        is_free BOOLEAN DEFAULT FALSE,
        features JSON,
        stripe_price_id VARCHAR(255),
        paypal_plan_id VARCHAR(255),
        pagbank_plan_id VARCHAR(255),
        active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_active (active),
        INDEX idx_sort (sort_order),
        INDEX idx_is_trial (is_trial),
        INDEX idx_is_free (is_free)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ subscription_plans table created/verified');

    // Create currencies table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS currencies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(3) UNIQUE NOT NULL,
        name VARCHAR(50) NOT NULL,
        symbol VARCHAR(10) NOT NULL,
        exchange_rate DECIMAL(10,4) DEFAULT 1.0000,
        active BOOLEAN DEFAULT TRUE,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_code (code),
        INDEX idx_active (active),
        INDEX idx_default (is_default)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ currencies table created/verified');

    // Create translations table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS translations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        language_code VARCHAR(5) NOT NULL,
        language_name VARCHAR(50) NOT NULL,
        translation_key VARCHAR(255) NOT NULL,
        translation_value TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_translation (language_code, translation_key),
        INDEX idx_language (language_code),
        INDEX idx_key (translation_key),
        INDEX idx_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ translations table created/verified');

    // Create admins table (tenant admins)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        username VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100),
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_username (tenant_id, username),
        UNIQUE KEY unique_tenant_email (tenant_id, email),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_username (username),
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ admins table created/verified');

    // Add password reset columns to admins table if they don't exist
    const [adminColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'admins'
    `);
    const existingAdminColumns = adminColumns.map(col => col.COLUMN_NAME);

    if (!existingAdminColumns.includes('password_reset_token')) {
      try {
        await connection.execute(`
          ALTER TABLE admins 
          ADD COLUMN password_reset_token VARCHAR(255) NULL AFTER password,
          ADD COLUMN password_reset_expires TIMESTAMP NULL AFTER password_reset_token
        `);
        logger.info('✅ Added password reset columns to admins table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('password_reset columns:', e.message);
        }
      }
    }

    // Add password reset columns to users table if they don't exist
    const [userColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users'
    `);
    const existingUserColumns = userColumns.map(col => col.COLUMN_NAME);

    if (!existingUserColumns.includes('password_reset_token')) {
      try {
        await connection.execute(`
          ALTER TABLE users 
          ADD COLUMN password_reset_token VARCHAR(255) NULL AFTER password,
          ADD COLUMN password_reset_expires TIMESTAMP NULL AFTER password_reset_token
        `);
        logger.info('✅ Added password reset columns to users table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('users password_reset columns:', e.message);
        }
      }
    }

    // Create users table (tenant employees)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        username VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        password VARCHAR(255) NOT NULL,
        password_reset_token VARCHAR(255) NULL,
        password_reset_expires TIMESTAMP NULL,
        name VARCHAR(100),
        role ENUM('admin', 'user') DEFAULT 'user',
        store VARCHAR(100),
        department VARCHAR(100),
        store_id INT NULL,
        department_id INT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_username (tenant_id, username),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_username (username),
        INDEX idx_role (role),
        INDEX idx_store (store),
        INDEX idx_department (department),
        INDEX idx_store_id (store_id),
        INDEX idx_department_id (department_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ users table created/verified');

    // Add foreign keys for store_id and department_id after stores and departments tables are created
    // This will be done after those tables are created

    // Create stores table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS stores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        address VARCHAR(255),
        phone VARCHAR(20),
        email VARCHAR(100),
        hours TEXT,
        promotions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_store (tenant_id, name),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ stores table created/verified');

    // Create departments table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_department (tenant_id, name),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ departments table created/verified');

    // Add is_active column to stores and departments
    try {
      await connection.execute(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE AFTER email`);
      logger.info('✅ Added is_active column to stores table');
    } catch (e) { /* Ignore if already exists */ }

    try {
      await connection.execute(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE AFTER description`);
      logger.info('✅ Added is_active column to departments table');
    } catch (e) { /* Ignore if already exists */ }

    // Add foreign keys for store_id and department_id in users table
    // These are added after stores and departments tables exist
    try {
      await connection.execute(`
        ALTER TABLE users 
        ADD CONSTRAINT fk_users_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
      `);
      logger.info('✅ Added store_id foreign key to users table');
    } catch (e) {
      if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_FK_DUP_NAME') {
        logger.warn('store_id FK:', e.message);
      }
    }

    try {
      await connection.execute(`
        ALTER TABLE users 
        ADD CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
      `);
      logger.info('✅ Added department_id foreign key to users table');
    } catch (e) {
      if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_FK_DUP_NAME') {
        logger.warn('department_id FK:', e.message);
      }
    }

    // Create conversations table (without contact_id FK - will be added later)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        contact_id INT,
        phone_number VARCHAR(20) NOT NULL,
        remote_jid VARCHAR(255),
        contact_name VARCHAR(100),
        last_message TEXT,
        last_message_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('waiting', 'attended', 'closed', 'active', 'archived') DEFAULT 'waiting',
        assigned_user_id INT,
        assigned_store VARCHAR(100),
        assigned_department VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenant_id),
        INDEX idx_contact (contact_id),
        INDEX idx_phone (phone_number),
        INDEX idx_remote_jid (remote_jid),
        INDEX idx_status (status),
        INDEX idx_last_message_time (last_message_time),
        UNIQUE KEY idx_tenant_remote_jid (tenant_id, remote_jid)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ conversations table created/verified');

    // Add missing columns to conversations table if they don't exist
    const [conversationColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'conversations'
    `);
    
    const existingColumns = conversationColumns.map(col => col.COLUMN_NAME);
    
    if (!existingColumns.includes('contact_id')) {
      await connection.execute(`
        ALTER TABLE conversations 
        ADD COLUMN contact_id INT NULL AFTER tenant_id,
        ADD CONSTRAINT fk_conversations_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
      `);
      logger.info('✅ Added contact_id column to conversations table');
    }
    
    if (!existingColumns.includes('updated_at')) {
      await connection.execute(`
        ALTER TABLE conversations 
        ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      `);
      logger.info('✅ Added updated_at column to conversations table');
    }
    
    if (!existingColumns.includes('remote_jid')) {
      await connection.execute(`
        ALTER TABLE conversations 
        ADD COLUMN remote_jid VARCHAR(255) AFTER phone_number
      `);
      logger.info('✅ Added remote_jid column to conversations table');
      
      // Populate remote_jid from phone_number for existing records
      await connection.execute(`
        UPDATE conversations 
        SET remote_jid = CONCAT(phone_number, '@lid')
        WHERE remote_jid IS NULL OR remote_jid = ''
      `);
      logger.info('✅ Populated remote_jid from phone_number');
      
      // Add index for remote_jid
      await connection.execute(`
        CREATE INDEX IF NOT EXISTS idx_remote_jid ON conversations(remote_jid)
      `);
      logger.info('✅ Added index for remote_jid');
      
      // Add unique constraint for tenant_id + remote_jid
      try {
        await connection.execute(`
          CREATE UNIQUE INDEX idx_tenant_remote_jid ON conversations(tenant_id, remote_jid)
        `);
        logger.info('✅ Added unique constraint for tenant_id + remote_jid');
      } catch (err) {
        // Index might already exist or there are duplicates
        logger.warn('Could not create unique index on tenant_id + remote_jid', { error: err.message });
      }
    }

    // Add claimed_by_user_id column for exclusive conversation attendance
    if (!existingColumns.includes('claimed_by_user_id')) {
      try {
        await connection.execute(`
          ALTER TABLE conversations 
          ADD COLUMN claimed_by_user_id INT NULL AFTER assigned_user_id,
          ADD COLUMN claimed_at TIMESTAMP NULL AFTER claimed_by_user_id,
          ADD COLUMN is_claimed BOOLEAN DEFAULT FALSE AFTER claimed_at
        `);
        logger.info('✅ Added claimed_by_user_id, claimed_at, is_claimed columns to conversations table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('claimed columns:', e.message); }
    }

    // Add claimed_at column if not exists
    if (!existingColumns.includes('claimed_at')) {
      try {
        await connection.execute(`ALTER TABLE conversations ADD COLUMN claimed_at TIMESTAMP NULL AFTER claimed_by_user_id`);
        logger.info('✅ Added claimed_at column to conversations table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('claimed_at:', e.message); }
    }

    // Add is_claimed column if not exists
    if (!existingColumns.includes('is_claimed')) {
      try {
        await connection.execute(`ALTER TABLE conversations ADD COLUMN is_claimed BOOLEAN DEFAULT FALSE AFTER claimed_at`);
        logger.info('✅ Added is_claimed column to conversations table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('is_claimed:', e.message); }
    }

    // Add transferred_to_store column for conversation transfer
    if (!existingColumns.includes('transferred_to_store')) {
      try {
        await connection.execute(`ALTER TABLE conversations ADD COLUMN transferred_to_store VARCHAR(100) NULL AFTER is_claimed`);
        logger.info('✅ Added transferred_to_store column to conversations table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('transferred_to_store:', e.message); }
    }

    // Add transferred_to_department column for conversation transfer
    if (!existingColumns.includes('transferred_to_department')) {
      try {
        await connection.execute(`ALTER TABLE conversations ADD COLUMN transferred_to_department VARCHAR(100) NULL AFTER transferred_to_store`);
        logger.info('✅ Added transferred_to_department column to conversations table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('transferred_to_department:', e.message); }
    }

    // Add transferred_at column
    if (!existingColumns.includes('transferred_at')) {
      try {
        await connection.execute(`ALTER TABLE conversations ADD COLUMN transferred_at TIMESTAMP NULL AFTER transferred_to_department`);
        logger.info('✅ Added transferred_at column to conversations table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('transferred_at:', e.message); }
    }

    // Create messages table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        conversation_id INT,
        phone_number VARCHAR(20) NOT NULL,
        message_text TEXT,
        message_type ENUM('text', 'image', 'audio', 'video', 'document', 'location') DEFAULT 'text',
        media_url VARCHAR(500),
        is_from_bot BOOLEAN DEFAULT FALSE,
        sender_user_id INT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenant_id),
        INDEX idx_phone (phone_number),
        INDEX idx_timestamp (timestamp),
        INDEX idx_is_from_bot (is_from_bot)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ messages table created/verified');

    // Create faqs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS faqs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        question VARCHAR(500) NOT NULL,
        answer TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        keywords TEXT,
        emoji VARCHAR(10),
        placeholder_key VARCHAR(100),
        active BOOLEAN DEFAULT TRUE,
        is_active BOOLEAN DEFAULT TRUE,
        order_position INT DEFAULT 1,
        display_order INT DEFAULT 0,
        reaction_time INT DEFAULT 3,
        response_time INT DEFAULT 7,
        schedule_hours VARCHAR(50) DEFAULT '08:00-18:00',
        schedule_days VARCHAR(200) DEFAULT 'monday,tuesday,wednesday,thursday,friday,saturday',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_active (active),
        INDEX idx_is_active (is_active),
        INDEX idx_order (order_position),
        INDEX idx_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ faqs table created/verified');

    // Create welcome_messages table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS welcome_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        message_text TEXT,
        order_position INT DEFAULT 1,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_active (active),
        INDEX idx_order (order_position)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ welcome_messages table created/verified');

    // Create welcome_sent table (tracks when welcome messages were sent)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS welcome_sent (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_phone (tenant_id, phone_number),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant_phone (tenant_id, phone_number),
        INDEX idx_sent_at (sent_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ welcome_sent table created/verified');

    // Create message_placeholders table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS message_placeholders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        placeholder_key VARCHAR(100) NOT NULL,
        placeholder_value TEXT,
        description TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_placeholder (tenant_id, placeholder_key),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ message_placeholders table created/verified');

    // Create bot_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS bot_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        setting_key VARCHAR(100) NOT NULL,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_setting (tenant_id, setting_key),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_setting_key (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ bot_settings table created/verified');

    // Create contact_groups table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS contact_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        group_name VARCHAR(100) NOT NULL,
        description TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_group (tenant_id, group_name),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenant_id),
        INDEX idx_name (group_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ contact_groups table created/verified');

    // Create contacts table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        email VARCHAR(100),
        group_id INT,
        tags VARCHAR(255),
        notes TEXT,
        custom_fields JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_phone (tenant_id, phone),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenant_id),
        INDEX idx_phone (phone),
        INDEX idx_name (name),
        INDEX idx_group (group_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ contacts table created/verified');

    // Create contact_group_members table (many-to-many)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS contact_group_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contact_id INT NOT NULL,
        group_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_contact_group (contact_id, group_id),
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES contact_groups(id) ON DELETE CASCADE,
        INDEX idx_contact (contact_id),
        INDEX idx_group (group_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ contact_group_members table created/verified');

    // Create tags table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        color VARCHAR(7) DEFAULT '#3498db',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_tag (tenant_id, name),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ tags table created/verified');

    // Create contact_tags table (many-to-many)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS contact_tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contact_id INT NOT NULL,
        tag_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_contact_tag (contact_id, tag_id),
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
        INDEX idx_contact (contact_id),
        INDEX idx_tag (tag_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ contact_tags table created/verified');

    // Create mass_messages table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mass_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        message_text TEXT NOT NULL,
        media_url VARCHAR(500),
        message_type ENUM('text', 'image', 'audio', 'video') DEFAULT 'text',
        total_contacts INT DEFAULT 0,
        sent_count INT DEFAULT 0,
        status ENUM('pending', 'sending', 'completed', 'failed') DEFAULT 'pending',
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenant_id),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ mass_messages table created/verified');

    // Create tenant_payment_methods table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tenant_payment_methods (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        method_name ENUM('paypal', 'pagbank', 'stripe') NOT NULL,
        api_key TEXT,
        api_secret TEXT,
        sandbox_mode BOOLEAN DEFAULT TRUE,
        active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        UNIQUE KEY unique_tenant_method (tenant_id, method_name),
        INDEX idx_tenant (tenant_id),
        INDEX idx_method (method_name),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ tenant_payment_methods table created/verified');

    // Create tenant_payment_links table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tenant_payment_links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        payment_method ENUM('paypal', 'pagbank', 'stripe') NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        description VARCHAR(255),
        customer_phone VARCHAR(20),
        customer_name VARCHAR(100),
        payment_url VARCHAR(500),
        payment_id VARCHAR(100),
        status ENUM('pending', 'paid', 'cancelled', 'expired') DEFAULT 'pending',
        created_by INT,
        expires_at TIMESTAMP NULL,
        paid_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenant_id),
        INDEX idx_status (status),
        INDEX idx_payment_id (payment_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ tenant_payment_links table created/verified');

    // Create payments table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        contact_id INT,
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        payment_method VARCHAR(50) NOT NULL,
        status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
        description TEXT,
        external_id VARCHAR(255),
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenant_id),
        INDEX idx_contact (contact_id),
        INDEX idx_status (status),
        INDEX idx_external_id (external_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ payments table created/verified');

    // Create invoice_clients table (must be created before invoices)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS invoice_clients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        company_name VARCHAR(150),
        tax_id VARCHAR(50),
        address VARCHAR(500),
        city VARCHAR(100),
        state VARCHAR(50),
        zip_code VARCHAR(20),
        country VARCHAR(50) DEFAULT 'Brazil',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_email (tenant_id, email),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_email (email),
        INDEX idx_phone (phone),
        INDEX idx_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ invoice_clients table created/verified');

    // Create invoices table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        invoice_number VARCHAR(50) NOT NULL,
        type ENUM('invoice', 'quote') NOT NULL DEFAULT 'invoice',
        client_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        currency VARCHAR(3) DEFAULT 'USD',
        subtotal DECIMAL(10,2) DEFAULT 0.00,
        tax_rate DECIMAL(5,2) DEFAULT 0.00,
        tax_amount DECIMAL(10,2) DEFAULT 0.00,
        discount_type ENUM('fixed', 'percentage') DEFAULT 'fixed',
        discount_value DECIMAL(10,2) DEFAULT 0.00,
        discount_amount DECIMAL(10,2) DEFAULT 0.00,
        total_amount DECIMAL(10,2) DEFAULT 0.00,
        status ENUM('draft', 'sent', 'viewed', 'accepted', 'rejected', 'paid', 'cancelled', 'archived') DEFAULT 'draft',
        rejection_reason TEXT,
        payment_method ENUM('paypal', 'pagseguro', 'bank_transfer', 'cash', 'other') DEFAULT 'paypal',
        payment_link VARCHAR(500),
        payment_id VARCHAR(100),
        payment_gateway_response JSON,
        due_date DATE,
        notes TEXT,
        terms TEXT,
        sent_at TIMESTAMP NULL,
        viewed_at TIMESTAMP NULL,
        accepted_at TIMESTAMP NULL,
        rejected_at TIMESTAMP NULL,
        paid_at TIMESTAMP NULL,
        converted_to_invoice_id INT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_invoice (tenant_id, invoice_number),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES invoice_clients(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_invoice_number (invoice_number),
        INDEX idx_client (client_id),
        INDEX idx_status (status),
        INDEX idx_type (type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ invoices table created/verified');

    // Add new columns to invoices table for enhanced workflow
    const [invoiceColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'invoices'
    `);
    const existingInvoiceColumns = invoiceColumns.map(col => col.COLUMN_NAME);

    // Add is_active column for soft disable
    if (!existingInvoiceColumns.includes('is_active')) {
      try {
        await connection.execute(`
          ALTER TABLE invoices 
          ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER status
        `);
        logger.info('✅ Added is_active column to invoices table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('is_active column:', e.message);
        }
      }
    }

    // Add admin_response column for tenant response to rejection
    if (!existingInvoiceColumns.includes('admin_response')) {
      try {
        await connection.execute(`
          ALTER TABLE invoices 
          ADD COLUMN admin_response TEXT AFTER rejection_reason
        `);
        logger.info('✅ Added admin_response column to invoices table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('admin_response column:', e.message);
        }
      }
    }

    // Add admin_response_at column
    if (!existingInvoiceColumns.includes('admin_response_at')) {
      try {
        await connection.execute(`
          ALTER TABLE invoices 
          ADD COLUMN admin_response_at TIMESTAMP NULL AFTER admin_response
        `);
        logger.info('✅ Added admin_response_at column to invoices table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('admin_response_at column:', e.message);
        }
      }
    }

    // Add payment_gateway column to store which gateway to use
    if (!existingInvoiceColumns.includes('payment_gateway')) {
      try {
        await connection.execute(`
          ALTER TABLE invoices 
          ADD COLUMN payment_gateway VARCHAR(50) DEFAULT 'stripe' AFTER payment_method
        `);
        logger.info('✅ Added payment_gateway column to invoices table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('payment_gateway column:', e.message);
        }
      }
    }

    // Add archived_at column
    if (!existingInvoiceColumns.includes('archived_at')) {
      try {
        await connection.execute(`
          ALTER TABLE invoices 
          ADD COLUMN archived_at TIMESTAMP NULL AFTER paid_at
        `);
        logger.info('✅ Added archived_at column to invoices table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('archived_at column:', e.message);
        }
      }
    }

    // Add disabled_at column
    if (!existingInvoiceColumns.includes('disabled_at')) {
      try {
        await connection.execute(`
          ALTER TABLE invoices 
          ADD COLUMN disabled_at TIMESTAMP NULL AFTER archived_at
        `);
        logger.info('✅ Added disabled_at column to invoices table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('disabled_at column:', e.message);
        }
      }
    }

    // Add allowed_payment_methods column for storing which payment methods are enabled for this invoice
    if (!existingInvoiceColumns.includes('allowed_payment_methods')) {
      try {
        await connection.execute(`
          ALTER TABLE invoices 
          ADD COLUMN allowed_payment_methods JSON DEFAULT NULL AFTER payment_method
        `);
        logger.info('✅ Added allowed_payment_methods column to invoices table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('allowed_payment_methods column:', e.message);
        }
      }
    }

    // Update invoice_logs action enum to include new actions
    try {
      await connection.execute(`
        ALTER TABLE invoice_logs 
        MODIFY COLUMN action ENUM(
          'created', 'sent', 'viewed', 'accepted', 'rejected', 'paid', 
          'cancelled', 'updated', 'payment_created', 'payment_confirmed', 
          'converted_to_invoice', 'archived', 'reactivated', 'disabled', 
          'enabled', 'admin_responded', 'pending_review'
        ) NOT NULL
      `);
      logger.info('✅ Updated invoice_logs action enum');
    } catch (e) {
      logger.warn('invoice_logs action enum update:', e.message);
    }

    // Create ai_configurations table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ai_configurations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        persona_name VARCHAR(100) NOT NULL,
        persona_description TEXT,
        provider ENUM('openai', 'deepseek') NOT NULL DEFAULT 'deepseek',
        model_name VARCHAR(50) NOT NULL,
        api_key TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        temperature DECIMAL(3,2) DEFAULT 0.70,
        max_tokens INT DEFAULT 1000,
        business_hours_start TIME DEFAULT '08:00:00',
        business_hours_end TIME DEFAULT '18:00:00',
        business_days VARCHAR(100) DEFAULT 'monday,tuesday,wednesday,thursday,friday',
        out_of_hours_message TEXT,
        auto_response_enabled BOOLEAN DEFAULT TRUE,
        response_delay INT DEFAULT 0,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_provider (provider),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ ai_configurations table created/verified');

    // Create woocommerce_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS woocommerce_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        store_url VARCHAR(255) NOT NULL,
        consumer_key VARCHAR(255) NOT NULL,
        consumer_secret VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        last_sync TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ woocommerce_settings table created/verified');

    // Create woocommerce_products table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS woocommerce_products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        wc_product_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255),
        permalink VARCHAR(500),
        description TEXT,
        short_description TEXT,
        sku VARCHAR(100),
        price DECIMAL(10,2) DEFAULT 0.00,
        regular_price DECIMAL(10,2) DEFAULT 0.00,
        sale_price DECIMAL(10,2) DEFAULT 0.00,
        stock_quantity INT DEFAULT 0,
        stock_status VARCHAR(50) DEFAULT 'instock',
        image_url VARCHAR(500),
        thumbnail_url VARCHAR(500),
        categories JSON,
        tags JSON,
        attributes JSON,
        placeholder_key VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_product (tenant_id, wc_product_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_wc_product (wc_product_id),
        INDEX idx_sku (sku),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ woocommerce_products table created/verified');

    // Create woocommerce_notification_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS woocommerce_notification_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        webhook_secret VARCHAR(255) DEFAULT NULL,
        new_order_enabled BOOLEAN DEFAULT FALSE,
        new_order_template TEXT,
        customer_registration_enabled BOOLEAN DEFAULT FALSE,
        customer_registration_template TEXT,
        password_reset_enabled BOOLEAN DEFAULT FALSE,
        password_reset_template TEXT,
        product_comment_enabled BOOLEAN DEFAULT FALSE,
        product_comment_template TEXT,
        admin_phone VARCHAR(20),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ woocommerce_notification_settings table created/verified');

    // ============================================
    // Add missing columns to subscription_plans (from migrations)
    // ============================================
    const [planColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'subscription_plans'
    `);
    const existingPlanColumns = planColumns.map(col => col.COLUMN_NAME);

    // Add api_access_enabled
    if (!existingPlanColumns.includes('api_access_enabled')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN api_access_enabled BOOLEAN DEFAULT FALSE AFTER priority_support_enabled`);
        logger.info('✅ Added api_access_enabled to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('api_access_enabled:', e.message); }
    }

    // Add woocommerce_enabled
    if (!existingPlanColumns.includes('woocommerce_enabled')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN woocommerce_enabled BOOLEAN DEFAULT FALSE AFTER ai_enabled`);
        logger.info('✅ Added woocommerce_enabled to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('woocommerce_enabled:', e.message); }
    }

    // Add invoices_enabled
    if (!existingPlanColumns.includes('invoices_enabled')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN invoices_enabled BOOLEAN DEFAULT FALSE AFTER custom_branding_enabled`);
        logger.info('✅ Added invoices_enabled to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('invoices_enabled:', e.message); }
    }

    // Add quotes_enabled
    if (!existingPlanColumns.includes('quotes_enabled')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN quotes_enabled BOOLEAN DEFAULT FALSE AFTER max_invoices_per_month`);
        logger.info('✅ Added quotes_enabled to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('quotes_enabled:', e.message); }
    }

    // Add widgets_enabled
    if (!existingPlanColumns.includes('widgets_enabled')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN widgets_enabled BOOLEAN DEFAULT FALSE AFTER max_quotes_per_month`);
        logger.info('✅ Added widgets_enabled to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('widgets_enabled:', e.message); }
    }

    // Add payment_links_enabled
    if (!existingPlanColumns.includes('payment_links_enabled')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN payment_links_enabled BOOLEAN DEFAULT FALSE AFTER max_widgets`);
        logger.info('✅ Added payment_links_enabled to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('payment_links_enabled:', e.message); }
    }

    // Add biolink fields to subscription_plans
    if (!existingPlanColumns.includes('biolink_enabled')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN biolink_enabled BOOLEAN DEFAULT FALSE AFTER payment_links_enabled`);
        logger.info('✅ Added biolink_enabled to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('biolink_enabled:', e.message); }
    }

    if (!existingPlanColumns.includes('max_bio_pages')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN max_bio_pages INT DEFAULT 0 AFTER biolink_enabled`);
        logger.info('✅ Added max_bio_pages to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('max_bio_pages:', e.message); }
    }

    if (!existingPlanColumns.includes('max_short_links')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN max_short_links INT DEFAULT 0 AFTER max_bio_pages`);
        logger.info('✅ Added max_short_links to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('max_short_links:', e.message); }
    }

    if (!existingPlanColumns.includes('max_file_transfers')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN max_file_transfers INT DEFAULT 0 AFTER max_short_links`);
        logger.info('✅ Added max_file_transfers to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('max_file_transfers:', e.message); }
    }

    if (!existingPlanColumns.includes('max_vcards')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN max_vcards INT DEFAULT 0 AFTER max_file_transfers`);
        logger.info('✅ Added max_vcards to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('max_vcards:', e.message); }
    }

    if (!existingPlanColumns.includes('max_event_links')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN max_event_links INT DEFAULT 0 AFTER max_vcards`);
        logger.info('✅ Added max_event_links to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('max_event_links:', e.message); }
    }

    if (!existingPlanColumns.includes('max_html_pages')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN max_html_pages INT DEFAULT 0 AFTER max_event_links`);
        logger.info('✅ Added max_html_pages to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('max_html_pages:', e.message); }
    }

    if (!existingPlanColumns.includes('max_qr_codes')) {
      try {
        await connection.execute(`ALTER TABLE subscription_plans ADD COLUMN max_qr_codes INT DEFAULT 0 AFTER max_html_pages`);
        logger.info('✅ Added max_qr_codes to subscription_plans');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('max_qr_codes:', e.message); }
    }

    // ============================================
    // Add missing columns to payments table (from migrations)
    // ============================================
    const [paymentColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'payments'
    `);
    const existingPaymentColumns = paymentColumns.map(col => col.COLUMN_NAME);

    if (!existingPaymentColumns.includes('plan_id')) {
      try {
        await connection.execute(`ALTER TABLE payments ADD COLUMN plan_id INT NULL AFTER tenant_id`);
        logger.info('✅ Added plan_id to payments');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('plan_id:', e.message); }
    }

    if (!existingPaymentColumns.includes('subscription_id')) {
      try {
        await connection.execute(`ALTER TABLE payments ADD COLUMN subscription_id INT NULL AFTER plan_id`);
        logger.info('✅ Added subscription_id to payments');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('subscription_id:', e.message); }
    }

    // ============================================
    // Add missing columns to payment_gateway_settings (from migrations)
    // ============================================
    const [gatewayColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'payment_gateway_settings'
    `);
    const existingGatewayColumns = gatewayColumns.map(col => col.COLUMN_NAME);

    if (!existingGatewayColumns.includes('paypal_webhook_id')) {
      try {
        await connection.execute(`ALTER TABLE payment_gateway_settings ADD COLUMN paypal_webhook_id VARCHAR(255) AFTER paypal_mode`);
        logger.info('✅ Added paypal_webhook_id to payment_gateway_settings');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('paypal_webhook_id:', e.message); }
    }

    if (!existingGatewayColumns.includes('cash_instructions')) {
      try {
        await connection.execute(`ALTER TABLE payment_gateway_settings ADD COLUMN cash_instructions TEXT AFTER paypal_webhook_id`);
        logger.info('✅ Added cash_instructions to payment_gateway_settings');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('cash_instructions:', e.message); }
    }

    if (!existingGatewayColumns.includes('cash_contact_email')) {
      try {
        await connection.execute(`ALTER TABLE payment_gateway_settings ADD COLUMN cash_contact_email VARCHAR(255) AFTER cash_instructions`);
        logger.info('✅ Added cash_contact_email to payment_gateway_settings');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('cash_contact_email:', e.message); }
    }

    if (!existingGatewayColumns.includes('cash_contact_phone')) {
      try {
        await connection.execute(`ALTER TABLE payment_gateway_settings ADD COLUMN cash_contact_phone VARCHAR(20) AFTER cash_contact_email`);
        logger.info('✅ Added cash_contact_phone to payment_gateway_settings');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('cash_contact_phone:', e.message); }
    }

    if (!existingGatewayColumns.includes('stripe_mode')) {
      try {
        await connection.execute(`ALTER TABLE payment_gateway_settings ADD COLUMN stripe_mode ENUM('test', 'live') DEFAULT 'test' AFTER stripe_webhook_secret`);
        logger.info('✅ Added stripe_mode to payment_gateway_settings');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('stripe_mode:', e.message); }
    }

    // ============================================
    // Add missing columns to whatsapp_notification_settings (from migrations)
    // ============================================
    const [waNotifColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'whatsapp_notification_settings'
    `);
    const existingWaNotifColumns = waNotifColumns.map(col => col.COLUMN_NAME);

    if (!existingWaNotifColumns.includes('qr_code')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_notification_settings ADD COLUMN qr_code TEXT AFTER connected`);
        logger.info('✅ Added qr_code to whatsapp_notification_settings');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('qr_code:', e.message); }
    }

    // ============================================
    // Add missing columns to tenants table (from migrations)
    // ============================================
    const [tenantColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tenants'
    `);
    const existingTenantColumns = tenantColumns.map(col => col.COLUMN_NAME);

    // Add max_contact_groups
    if (!existingTenantColumns.includes('max_contact_groups')) {
      try {
        await connection.execute(`ALTER TABLE tenants ADD COLUMN max_contact_groups INT DEFAULT 10 AFTER max_devices`);
        logger.info('✅ Added max_contact_groups to tenants');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('max_contact_groups:', e.message); }
    }

    // Insert default super admin
    const [superAdminExists] = await connection.execute(
      'SELECT id FROM super_admins WHERE email = ?',
      [process.env.SUPER_ADMIN_EMAIL || 'admin@saas.misayan.cloud']
    );

    if (superAdminExists.length === 0) {
      const hashedPassword = await bcrypt.hash(
        process.env.SUPER_ADMIN_PASSWORD || 'ChangeThisPassword123!',
        12
      );
      await connection.execute(
        'INSERT INTO super_admins (email, password, name) VALUES (?, ?, ?)',
        [
          process.env.SUPER_ADMIN_EMAIL || 'admin@saas.misayan.cloud',
          hashedPassword,
          'Super Administrator'
        ]
      );
      logger.info('✅ Super Admin created');
      logger.info(`📧 Email: ${process.env.SUPER_ADMIN_EMAIL || 'admin@saas.misayan.cloud'}`);
      logger.info(`🔑 Password: ${process.env.SUPER_ADMIN_PASSWORD || 'ChangeThisPassword123!'}`);
      logger.warn('⚠️  IMPORTANT: Change the super admin password immediately!');
    } else {
      logger.info('✅ Super Admin already exists');
    }

    // Insert default currencies
    const defaultCurrencies = [
      ['USD', 'US Dollar', '$', 1.0000, true, true],
      ['EUR', 'Euro', '€', 0.92, true, false],
      ['GBP', 'British Pound', '£', 0.79, true, false],
      ['BRL', 'Brazilian Real', 'R$', 4.97, true, false]
    ];

    for (const [code, name, symbol, rate, active, isDefault] of defaultCurrencies) {
      await connection.execute(
        `INSERT IGNORE INTO currencies (code, name, symbol, exchange_rate, active, is_default) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [code, name, symbol, rate, active, isDefault]
      );
    }
    logger.info('✅ Default currencies created/verified');

    // Create subscriptions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        plan_id INT NOT NULL,
        status ENUM('active', 'cancelled', 'past_due', 'trialing', 'suspended') DEFAULT 'active',
        stripe_subscription_id VARCHAR(255),
        stripe_customer_id VARCHAR(255),
        paypal_subscription_id VARCHAR(255),
        current_period_start TIMESTAMP NULL,
        current_period_end TIMESTAMP NULL,
        cancel_at_period_end BOOLEAN DEFAULT FALSE,
        cancelled_at TIMESTAMP NULL,
        trial_start TIMESTAMP NULL,
        trial_end TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
        INDEX idx_tenant (tenant_id),
        INDEX idx_plan (plan_id),
        INDEX idx_status (status),
        INDEX idx_stripe_subscription (stripe_subscription_id),
        INDEX idx_paypal_subscription (paypal_subscription_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ subscriptions table created/verified');

    // Create usage_tracking table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS usage_tracking (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        month VARCHAR(7) NOT NULL,
        messages_sent INT DEFAULT 0,
        conversations_count INT DEFAULT 0,
        contacts_count INT DEFAULT 0,
        users_count INT DEFAULT 0,
        stores_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_month (tenant_id, month),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_month (month)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ usage_tracking table created/verified');

    // Create system_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT PRIMARY KEY DEFAULT 1,
        grace_period_days INT DEFAULT 7,
        payment_reminder_days VARCHAR(50) DEFAULT '7,3,2,1',
        overdue_reminder_interval_days INT DEFAULT 2,
        auto_suspend_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ system_settings table created/verified');

    // Insert default system settings
    await connection.execute(`
      INSERT IGNORE INTO system_settings (id, grace_period_days) VALUES (1, 7)
    `);

    // Create system_settings_kv table (key-value store for additional settings)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS system_settings_kv (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT,
        description VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_setting_key (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ system_settings_kv table created/verified');

    // Insert default key-value settings
    const defaultKvSettings = [
      ['default_language', 'en', 'Default system language code'],
      ['system_name', 'Misayan SaaS', 'System name displayed in UI'],
      ['system_email', 'noreply@misayan.com', 'System email for notifications'],
      ['maintenance_mode', '0', 'Enable/disable maintenance mode (0=off, 1=on)'],
      ['allow_registration', '1', 'Allow new tenant registration (0=no, 1=yes)']
    ];

    for (const [key, value, desc] of defaultKvSettings) {
      await connection.execute(`
        INSERT IGNORE INTO system_settings_kv (setting_key, setting_value, description)
        VALUES (?, ?, ?)
      `, [key, value, desc]);
    }
    logger.info('✅ Default system settings (key-value) created/verified');

    // Create payment_gateway_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS payment_gateway_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        gateway_name ENUM('stripe', 'paypal', 'pagbank', 'cash') NOT NULL UNIQUE,
        stripe_secret_key TEXT,
        stripe_publishable_key TEXT,
        stripe_webhook_secret TEXT,
        stripe_mode ENUM('test', 'live') DEFAULT 'test',
        paypal_client_id TEXT,
        paypal_client_secret TEXT,
        paypal_mode ENUM('sandbox', 'live') DEFAULT 'sandbox',
        paypal_webhook_id VARCHAR(255),
        pagbank_token TEXT,
        pagbank_email VARCHAR(255),
        pagbank_mode ENUM('sandbox', 'live') DEFAULT 'sandbox',
        cash_instructions TEXT,
        cash_contact_email VARCHAR(255),
        cash_contact_phone VARCHAR(20),
        enabled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_gateway (gateway_name),
        INDEX idx_enabled (enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ payment_gateway_settings table created/verified');

    // Create smtp_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS smtp_settings (
        id INT PRIMARY KEY DEFAULT 1,
        smtp_host VARCHAR(255),
        smtp_port INT DEFAULT 587,
        smtp_user VARCHAR(255),
        smtp_password TEXT,
        smtp_from_email VARCHAR(255),
        smtp_from_name VARCHAR(100),
        smtp_secure BOOLEAN DEFAULT TRUE,
        enabled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ smtp_settings table created/verified');

    // Create email_templates table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS email_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        template_key VARCHAR(100) NOT NULL UNIQUE,
        template_name VARCHAR(150) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        html_body TEXT NOT NULL,
        text_body TEXT NOT NULL,
        available_variables TEXT,
        category ENUM('account', 'billing', 'notification') DEFAULT 'notification',
        is_system BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_template_key (template_key),
        INDEX idx_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ email_templates table created/verified');

    // Insert default email templates
    const defaultTemplates = [
      {
        key: 'account_created',
        name: 'Account Created',
        subject: 'Welcome to {{company_name}}!',
        html: '<h1>Welcome {{customer_name}}!</h1><p>Your account has been created successfully.</p><p>Plan: {{plan_name}}</p>',
        text: 'Welcome {{customer_name}}! Your account has been created successfully. Plan: {{plan_name}}',
        variables: 'customer_name,company_name,plan_name',
        category: 'account'
      },
      {
        key: 'account_cancelled',
        name: 'Account Cancelled',
        subject: 'Account Cancelled - {{company_name}}',
        html: '<h1>Account Cancelled</h1><p>Dear {{customer_name}}, your account has been cancelled.</p>',
        text: 'Dear {{customer_name}}, your account has been cancelled.',
        variables: 'customer_name,company_name',
        category: 'account'
      },
      {
        key: 'payment_success',
        name: 'Payment Successful',
        subject: 'Payment Received - {{company_name}}',
        html: '<h1>Payment Successful</h1><p>Thank you {{customer_name}}! We received your payment of {{amount}} {{currency}}.</p>',
        text: 'Thank you {{customer_name}}! We received your payment of {{amount}} {{currency}}.',
        variables: 'customer_name,company_name,amount,currency,plan_name',
        category: 'billing'
      },
      {
        key: 'payment_failed',
        name: 'Payment Failed',
        subject: 'Payment Failed - {{company_name}}',
        html: '<h1>Payment Failed</h1><p>Dear {{customer_name}}, your payment of {{amount}} {{currency}} failed.</p>',
        text: 'Dear {{customer_name}}, your payment of {{amount}} {{currency}} failed.',
        variables: 'customer_name,company_name,amount,currency',
        category: 'billing'
      },
      {
        key: 'payment_reminder',
        name: 'Payment Reminder',
        subject: 'Payment Due Soon - {{company_name}}',
        html: '<h1>Payment Reminder</h1><p>Dear {{customer_name}}, your payment of {{amount}} {{currency}} is due on {{due_date}}.</p>',
        text: 'Dear {{customer_name}}, your payment of {{amount}} {{currency}} is due on {{due_date}}.',
        variables: 'customer_name,company_name,amount,currency,due_date,days_until_due',
        category: 'billing'
      },
      {
        key: 'grace_period_warning',
        name: 'Grace Period Warning',
        subject: 'Account Suspension Warning - {{company_name}}',
        html: '<h1>Grace Period Warning</h1><p>Dear {{customer_name}}, your payment is overdue. Your account will be suspended in {{days_remaining}} days.</p>',
        text: 'Dear {{customer_name}}, your payment is overdue. Your account will be suspended in {{days_remaining}} days.',
        variables: 'customer_name,company_name,days_remaining,suspension_date',
        category: 'billing'
      },
      {
        key: 'account_suspended',
        name: 'Account Suspended',
        subject: 'Account Suspended - {{company_name}}',
        html: '<h1>Account Suspended</h1><p>Dear {{customer_name}}, your account has been suspended due to non-payment.</p>',
        text: 'Dear {{customer_name}}, your account has been suspended due to non-payment.',
        variables: 'customer_name,company_name',
        category: 'account'
      }
    ];

    for (const template of defaultTemplates) {
      await connection.execute(
        `INSERT IGNORE INTO email_templates 
         (template_key, template_name, subject, html_body, text_body, available_variables, category) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [template.key, template.name, template.subject, template.html, template.text, template.variables, template.category]
      );
    }
    logger.info('✅ Default email templates created/verified');

    // Create billing_history table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS billing_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        plan_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        payment_method ENUM('stripe', 'paypal', 'manual') NOT NULL,
        transaction_id VARCHAR(255),
        invoice_number VARCHAR(50),
        status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
        failure_reason TEXT,
        attempt_count INT DEFAULT 0,
        payment_date TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
        INDEX idx_tenant (tenant_id),
        INDEX idx_status (status),
        INDEX idx_payment_date (payment_date),
        INDEX idx_transaction_id (transaction_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ billing_history table created/verified');

    // Create email_queue table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS email_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        recipient_email VARCHAR(255) NOT NULL,
        recipient_name VARCHAR(100),
        template_key VARCHAR(100) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        html_body TEXT NOT NULL,
        text_body TEXT NOT NULL,
        variables JSON,
        status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
        attempt_count INT DEFAULT 0,
        last_error TEXT,
        scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_status (status),
        INDEX idx_scheduled_at (scheduled_at),
        INDEX idx_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ email_queue table created/verified');

    // Create superadmin_activity_log table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS superadmin_activity_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        super_admin_id INT NOT NULL,
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50),
        resource_id INT,
        details JSON,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (super_admin_id) REFERENCES super_admins(id) ON DELETE CASCADE,
        INDEX idx_super_admin (super_admin_id),
        INDEX idx_action (action),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ superadmin_activity_log table created/verified');

    // Create landing_page_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS landing_page_settings (
        id INT PRIMARY KEY DEFAULT 1,
        landing_enabled BOOLEAN DEFAULT TRUE,
        hero_title VARCHAR(255) DEFAULT 'Transform Your Business with WhatsApp',
        hero_subtitle TEXT DEFAULT 'Powerful multi-tenant WhatsApp Business platform',
        hero_cta_text VARCHAR(100) DEFAULT 'Get Started',
        hero_cta_link VARCHAR(255) DEFAULT '/#plans',
        hero_image VARCHAR(255) DEFAULT '/images/hero.png',
        hero_bg_color VARCHAR(20) DEFAULT '#00a149',
        features_title VARCHAR(255) DEFAULT 'Powerful Features',
        features_subtitle TEXT DEFAULT 'Everything you need to manage WhatsApp Business at scale',
        wa_generator_enabled BOOLEAN DEFAULT TRUE,
        wa_generator_title VARCHAR(255) DEFAULT 'WhatsApp Chat Link Generator',
        wa_generator_subtitle TEXT DEFAULT 'Create custom WhatsApp links with pre-filled messages',
        wa_generator_bg_color VARCHAR(20) DEFAULT '#f8f9fa',
        plans_title VARCHAR(255) DEFAULT 'Choose Your Plan',
        plans_subtitle TEXT DEFAULT 'Flexible pricing for businesses of all sizes',
        plans_show_annual BOOLEAN DEFAULT TRUE,
        testimonials_enabled BOOLEAN DEFAULT TRUE,
        testimonials_title VARCHAR(255) DEFAULT 'What Our Clients Say',
        testimonials_subtitle TEXT DEFAULT 'Join thousands of satisfied customers',
        cta_title VARCHAR(255) DEFAULT 'Ready to Get Started?',
        cta_subtitle TEXT DEFAULT 'Start your free trial today. No credit card required.',
        cta_button_text VARCHAR(100) DEFAULT 'Start Free Trial',
        cta_bg_color VARCHAR(20) DEFAULT '#00a149',
        company_name VARCHAR(100) DEFAULT 'Misayan SaaS',
        company_logo VARCHAR(255),
        primary_color VARCHAR(7) DEFAULT '#00a149',
        secondary_color VARCHAR(7) DEFAULT '#319131',
        accent_color VARCHAR(20) DEFAULT '#25D366',
        text_color VARCHAR(20) DEFAULT '#333333',
        footer_text TEXT DEFAULT '© 2025 Misayan SaaS. All rights reserved.',
        footer_bg_color VARCHAR(20) DEFAULT '#1a202c',
        meta_title VARCHAR(255) DEFAULT 'Misayan SaaS - WhatsApp Business Platform',
        meta_description TEXT DEFAULT 'Complete multi-tenant WhatsApp Business solution',
        meta_keywords TEXT DEFAULT 'whatsapp, business, saas, multi-tenant',
        contact_email VARCHAR(255),
        contact_phone VARCHAR(20),
        social_facebook VARCHAR(255),
        social_twitter VARCHAR(255),
        social_linkedin VARCHAR(255),
        social_instagram VARCHAR(255),
        header_logo VARCHAR(500) DEFAULT NULL COMMENT 'Logo URL for header/navbar',
        hero_logo VARCHAR(500) DEFAULT NULL COMMENT 'Logo URL for hero section',
        footer_logo VARCHAR(500) DEFAULT NULL COMMENT 'Logo URL for footer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ landing_page_settings table created/verified');

    await connection.execute(`
      ALTER TABLE landing_page_settings 
      ADD COLUMN IF NOT EXISTS landing_enabled BOOLEAN DEFAULT TRUE
    `);

    // Insert default landing page settings
    await connection.execute(`
      INSERT IGNORE INTO landing_page_settings (id) VALUES (1)
    `);

    // Create landing_page_features table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS landing_page_features (
        id INT AUTO_INCREMENT PRIMARY KEY,
        icon VARCHAR(50) NOT NULL,
        title VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        sort_order INT DEFAULT 0,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sort (sort_order),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ landing_page_features table created/verified');

    // Insert default features
    const [featuresExist] = await connection.execute('SELECT id FROM landing_page_features LIMIT 1');
    if (featuresExist.length === 0) {
      const defaultFeatures = [
        ['fa-comments', 'Multi-Channel Communication', 'Connect with customers via WhatsApp, SMS, and more', 0],
        ['fa-robot', 'AI-Powered Automation', 'Intelligent chatbots that understand and respond naturally', 1],
        ['fa-chart-line', 'Advanced Analytics', 'Track performance and gain insights into customer behavior', 2],
        ['fa-users', 'Team Collaboration', 'Manage multiple agents and departments efficiently', 3],
        ['fa-shield-alt', 'Enterprise Security', 'Bank-level encryption and data protection', 4],
        ['fa-plug', 'Easy Integration', 'Connect with your existing tools and workflows', 5]
      ];

      for (const [icon, title, description, order] of defaultFeatures) {
        await connection.execute(
          'INSERT INTO landing_page_features (icon, title, description, sort_order) VALUES (?, ?, ?, ?)',
          [icon, title, description, order]
        );
      }
      logger.info('✅ Default landing page features created');
    }

    // Create landing_page_testimonials table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS landing_page_testimonials (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_name VARCHAR(100) NOT NULL,
        customer_title VARCHAR(100),
        customer_company VARCHAR(100),
        customer_avatar VARCHAR(255),
        testimonial_text TEXT NOT NULL,
        rating INT DEFAULT 5,
        sort_order INT DEFAULT 0,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sort (sort_order),
        INDEX idx_active (active),
        INDEX idx_rating (rating)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ landing_page_testimonials table created/verified');

    // ============================================
    // WhatsApp Tables (Direct Creation)
    // ============================================

    // Create whatsapp_connections table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        phone_number VARCHAR(20),
        status ENUM('disconnected', 'connecting', 'connected', 'failed') DEFAULT 'disconnected',
        qr_code TEXT,
        session_id VARCHAR(255),
        last_connected_at DATETIME,
        connection_attempts INT DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_status (status),
        INDEX idx_phone_number (phone_number),
        UNIQUE KEY unique_tenant_connection (tenant_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_connections table created/verified');

    // Create whatsapp_messages table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        connection_id INT,
        phone_number VARCHAR(20) NOT NULL,
        contact_name VARCHAR(255),
        message_type ENUM('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact') DEFAULT 'text',
        content TEXT,
        media_url VARCHAR(500),
        media_mimetype VARCHAR(100),
        media_size INT,
        caption TEXT,
        direction ENUM('incoming', 'outgoing') NOT NULL,
        status ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
        whatsapp_message_id VARCHAR(255),
        conversation_id INT,
        quoted_message_id INT,
        error_message TEXT,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_connection_id (connection_id),
        INDEX idx_phone_number (phone_number),
        INDEX idx_direction (direction),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        INDEX idx_conversation_id (conversation_id),
        INDEX idx_whatsapp_message_id (whatsapp_message_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_messages table created/verified');

    // Add sender info columns to whatsapp_messages table for user/bot identification
    const [waMessageColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'whatsapp_messages'
    `);
    const existingWaMessageColumns = waMessageColumns.map(col => col.COLUMN_NAME);

    // Add sender_user_id column
    if (!existingWaMessageColumns.includes('sender_user_id')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN sender_user_id INT NULL AFTER metadata`);
        logger.info('✅ Added sender_user_id column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('sender_user_id:', e.message); }
    }

    // Add sender_name column
    if (!existingWaMessageColumns.includes('sender_name')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN sender_name VARCHAR(100) NULL AFTER sender_user_id`);
        logger.info('✅ Added sender_name column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('sender_name:', e.message); }
    }

    // Add sender_store column
    if (!existingWaMessageColumns.includes('sender_store')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN sender_store VARCHAR(100) NULL AFTER sender_name`);
        logger.info('✅ Added sender_store column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('sender_store:', e.message); }
    }

    // Add sender_department column
    if (!existingWaMessageColumns.includes('sender_department')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN sender_department VARCHAR(100) NULL AFTER sender_store`);
        logger.info('✅ Added sender_department column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('sender_department:', e.message); }
    }

    // Add is_bot_message column
    if (!existingWaMessageColumns.includes('is_bot_message')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN is_bot_message BOOLEAN DEFAULT FALSE AFTER sender_department`);
        logger.info('✅ Added is_bot_message column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('is_bot_message:', e.message); }
    }

    // Add bot_persona_name column
    if (!existingWaMessageColumns.includes('bot_persona_name')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN bot_persona_name VARCHAR(100) NULL AFTER is_bot_message`);
        logger.info('✅ Added bot_persona_name column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('bot_persona_name:', e.message); }
    }

    // Add columns for message edit functionality
    if (!existingWaMessageColumns.includes('original_content')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN original_content TEXT NULL AFTER content`);
        logger.info('✅ Added original_content column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('original_content:', e.message); }
    }

    if (!existingWaMessageColumns.includes('is_edited')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN is_edited BOOLEAN DEFAULT FALSE AFTER original_content`);
        logger.info('✅ Added is_edited column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('is_edited:', e.message); }
    }

    if (!existingWaMessageColumns.includes('edited_at')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN edited_at TIMESTAMP NULL AFTER is_edited`);
        logger.info('✅ Added edited_at column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('edited_at:', e.message); }
    }

    // Add columns for message delete functionality
    if (!existingWaMessageColumns.includes('is_deleted')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE AFTER edited_at`);
        logger.info('✅ Added is_deleted column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('is_deleted:', e.message); }
    }

    if (!existingWaMessageColumns.includes('deleted_for_everyone')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN deleted_for_everyone BOOLEAN DEFAULT FALSE AFTER is_deleted`);
        logger.info('✅ Added deleted_for_everyone column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('deleted_for_everyone:', e.message); }
    }

    if (!existingWaMessageColumns.includes('deleted_at')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN deleted_at TIMESTAMP NULL AFTER deleted_for_everyone`);
        logger.info('✅ Added deleted_at column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('deleted_at:', e.message); }
    }

    if (!existingWaMessageColumns.includes('deleted_by_user_id')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN deleted_by_user_id INT NULL AFTER deleted_at`);
        logger.info('✅ Added deleted_by_user_id column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('deleted_by_user_id:', e.message); }
    }

    if (!existingWaMessageColumns.includes('deleted_for_user_ids')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN deleted_for_user_ids JSON NULL AFTER deleted_by_user_id`);
        logger.info('✅ Added deleted_for_user_ids column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('deleted_for_user_ids:', e.message); }
    }

    if (!existingWaMessageColumns.includes('whatsapp_message_id')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_messages ADD COLUMN whatsapp_message_id VARCHAR(255) NULL AFTER deleted_for_user_ids`);
        await connection.execute(`CREATE INDEX idx_whatsapp_message_id ON whatsapp_messages(whatsapp_message_id)`);
        logger.info('✅ Added whatsapp_message_id column to whatsapp_messages table');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') logger.warn('whatsapp_message_id:', e.message); }
    }

    // Create whatsapp_contacts table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        name VARCHAR(255),
        profile_picture_url VARCHAR(500),
        status_message TEXT,
        is_business BOOLEAN DEFAULT FALSE,
        is_blocked BOOLEAN DEFAULT FALSE,
        last_message_at DATETIME,
        message_count INT DEFAULT 0,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_phone_number (phone_number),
        INDEX idx_last_message_at (last_message_at),
        UNIQUE KEY unique_tenant_contact (tenant_id, phone_number),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_contacts table created/verified');

    // Create whatsapp_message_queue table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_message_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        connection_id INT,
        phone_number VARCHAR(20) NOT NULL,
        message_type ENUM('text', 'image', 'video', 'audio', 'document') DEFAULT 'text',
        content TEXT,
        media_path VARCHAR(500),
        caption TEXT,
        priority INT DEFAULT 0,
        status ENUM('pending', 'processing', 'sent', 'failed') DEFAULT 'pending',
        attempts INT DEFAULT 0,
        max_attempts INT DEFAULT 3,
        scheduled_at DATETIME,
        processed_at DATETIME,
        error_message TEXT,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_connection_id (connection_id),
        INDEX idx_status (status),
        INDEX idx_priority (priority),
        INDEX idx_scheduled_at (scheduled_at),
        INDEX idx_created_at (created_at),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_message_queue table created/verified');

    // Create whatsapp_sessions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        session_id VARCHAR(255) NOT NULL,
        session_data LONGTEXT,
        phone_number VARCHAR(20),
        device_info JSON,
        is_active BOOLEAN DEFAULT TRUE,
        last_activity_at DATETIME,
        expires_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_session_id (session_id),
        INDEX idx_is_active (is_active),
        INDEX idx_expires_at (expires_at),
        UNIQUE KEY unique_tenant_session (tenant_id, session_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_sessions table created/verified');

    // Create whatsapp_groups table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        connection_id INT,
        group_jid VARCHAR(255) NOT NULL,
        group_name VARCHAR(255),
        group_description TEXT,
        group_picture_url VARCHAR(500),
        participant_count INT DEFAULT 0,
        is_admin BOOLEAN DEFAULT FALSE,
        created_by VARCHAR(20),
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_connection_id (connection_id),
        INDEX idx_group_jid (group_jid),
        UNIQUE KEY unique_tenant_group (tenant_id, group_jid),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_groups table created/verified');

    // Create whatsapp_webhooks table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_webhooks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        webhook_url VARCHAR(500) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        secret_key VARCHAR(255),
        retry_count INT DEFAULT 3,
        timeout_seconds INT DEFAULT 30,
        last_triggered_at DATETIME,
        success_count INT DEFAULT 0,
        failure_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_event_type (event_type),
        INDEX idx_is_active (is_active),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_webhooks table created/verified');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tenant_api_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        key_name VARCHAR(120) NOT NULL,
        key_prefix VARCHAR(20) NOT NULL,
        key_hash CHAR(64) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        last_used_at DATETIME,
        revoked_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_key_prefix (key_prefix),
        INDEX idx_is_active (is_active),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ tenant_api_keys table created/verified');
    try {
      const [tenantApiKeyColumns] = await connection.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tenant_api_keys'
      `);
      let existingTenantApiKeyColumns = tenantApiKeyColumns.map(col => col.COLUMN_NAME);

      const hasLegacyApiKeys = existingTenantApiKeyColumns.includes('api_key') ||
        existingTenantApiKeyColumns.includes('api_secret') ||
        existingTenantApiKeyColumns.includes('permissions') ||
        existingTenantApiKeyColumns.includes('expires_at') ||
        existingTenantApiKeyColumns.includes('status');

      if (hasLegacyApiKeys) {
        try {
          await connection.execute('SET FOREIGN_KEY_CHECKS=0');
          await connection.execute('DROP TABLE IF EXISTS tenant_api_keys_new');
          await connection.execute(`
            CREATE TABLE tenant_api_keys_new (
              id INT AUTO_INCREMENT PRIMARY KEY,
              tenant_id INT NOT NULL,
              key_name VARCHAR(120) NOT NULL,
              key_prefix VARCHAR(20) NOT NULL,
              key_hash CHAR(64) NOT NULL,
              is_active BOOLEAN DEFAULT TRUE,
              last_used_at DATETIME,
              revoked_at DATETIME,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_tenant_id (tenant_id),
              INDEX idx_key_prefix (key_prefix),
              INDEX idx_is_active (is_active),
              FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          await connection.execute(`
            INSERT INTO tenant_api_keys_new (id, tenant_id, key_name, key_prefix, key_hash, is_active, last_used_at, revoked_at, created_at, updated_at)
            SELECT id, tenant_id, key_name, key_prefix, key_hash, is_active, last_used_at, revoked_at, created_at, updated_at
            FROM tenant_api_keys
          `);
          await connection.execute('DROP TABLE tenant_api_keys');
          await connection.execute('RENAME TABLE tenant_api_keys_new TO tenant_api_keys');
          await connection.execute('SET FOREIGN_KEY_CHECKS=1');
          logger.info('✅ tenant_api_keys migrated to new schema');

          const [recheckedApiKeyColumns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'tenant_api_keys'
          `);
          existingTenantApiKeyColumns = recheckedApiKeyColumns.map(col => col.COLUMN_NAME);
        } catch (migrationError) {
          logger.warn('tenant_api_keys migration failed', { error: migrationError.message });
        }
      }

      if (!existingTenantApiKeyColumns.includes('key_prefix')) {
        try {
          await connection.execute(`ALTER TABLE tenant_api_keys ADD COLUMN key_prefix VARCHAR(20) NOT NULL AFTER key_name`);
          logger.info('✅ Added key_prefix to tenant_api_keys');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('tenant_api_keys key_prefix:', e.message); }
      }
      if (!existingTenantApiKeyColumns.includes('key_hash')) {
        try {
          await connection.execute(`ALTER TABLE tenant_api_keys ADD COLUMN key_hash CHAR(64) NOT NULL AFTER key_prefix`);
          logger.info('✅ Added key_hash to tenant_api_keys');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('tenant_api_keys key_hash:', e.message); }
      }
      if (!existingTenantApiKeyColumns.includes('is_active')) {
        try {
          await connection.execute(`ALTER TABLE tenant_api_keys ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER key_hash`);
          logger.info('✅ Added is_active to tenant_api_keys');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('tenant_api_keys is_active:', e.message); }
      }
      if (!existingTenantApiKeyColumns.includes('last_used_at')) {
        try {
          await connection.execute(`ALTER TABLE tenant_api_keys ADD COLUMN last_used_at DATETIME AFTER is_active`);
          logger.info('✅ Added last_used_at to tenant_api_keys');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('tenant_api_keys last_used_at:', e.message); }
      }
      if (!existingTenantApiKeyColumns.includes('revoked_at')) {
        try {
          await connection.execute(`ALTER TABLE tenant_api_keys ADD COLUMN revoked_at DATETIME AFTER last_used_at`);
          logger.info('✅ Added revoked_at to tenant_api_keys');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('tenant_api_keys revoked_at:', e.message); }
      }
    } catch (e) {
      logger.warn('tenant_api_keys columns check failed', { error: e.message });
    }

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tenant_webhooks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        webhook_url VARCHAR(500) NOT NULL,
        secret_key VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        last_triggered_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_event_type (event_type),
        INDEX idx_is_active (is_active),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ tenant_webhooks table created/verified');
    try {
      const [tenantWebhooksColumns] = await connection.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tenant_webhooks'
      `);
      let existingTenantWebhooksColumns = tenantWebhooksColumns.map(col => col.COLUMN_NAME);

      const hasLegacySchema = existingTenantWebhooksColumns.includes('events') ||
        existingTenantWebhooksColumns.includes('webhook_name') ||
        existingTenantWebhooksColumns.includes('status') ||
        existingTenantWebhooksColumns.includes('retry_count') ||
        existingTenantWebhooksColumns.includes('timeout_seconds');

      if (hasLegacySchema) {
        try {
          await connection.execute('SET FOREIGN_KEY_CHECKS=0');
          await connection.execute('DROP TABLE IF EXISTS tenant_webhooks_new');
          await connection.execute(`
            CREATE TABLE tenant_webhooks_new (
              id INT AUTO_INCREMENT PRIMARY KEY,
              tenant_id INT NOT NULL,
              event_type VARCHAR(100) NOT NULL DEFAULT 'message.received',
              webhook_url VARCHAR(500) NOT NULL,
              secret_key VARCHAR(255),
              is_active BOOLEAN DEFAULT TRUE,
              last_triggered_at DATETIME,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_tenant_id (tenant_id),
              INDEX idx_event_type (event_type),
              INDEX idx_is_active (is_active),
              FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          await connection.execute(`
            INSERT INTO tenant_webhooks_new (id, tenant_id, event_type, webhook_url, secret_key, is_active, last_triggered_at, created_at, updated_at)
            SELECT id, tenant_id, event_type, webhook_url, secret_key, is_active, last_triggered_at, created_at, updated_at
            FROM tenant_webhooks
          `);
          await connection.execute('DROP TABLE tenant_webhooks');
          await connection.execute('RENAME TABLE tenant_webhooks_new TO tenant_webhooks');
          await connection.execute('SET FOREIGN_KEY_CHECKS=1');
          logger.info('✅ tenant_webhooks migrated to new schema');

          const [recheckedColumns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'tenant_webhooks'
          `);
          existingTenantWebhooksColumns = recheckedColumns.map(col => col.COLUMN_NAME);
        } catch (migrationError) {
          logger.warn('tenant_webhooks migration failed', { error: migrationError.message });
        }
      }

      if (!existingTenantWebhooksColumns.includes('event_type')) {
        try {
          await connection.execute(`ALTER TABLE tenant_webhooks ADD COLUMN event_type VARCHAR(100) NOT NULL DEFAULT 'message.received' AFTER tenant_id`);
          logger.info('✅ Added event_type to tenant_webhooks');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('tenant_webhooks event_type:', e.message); }
      }
      if (!existingTenantWebhooksColumns.includes('webhook_url')) {
        try {
          await connection.execute(`ALTER TABLE tenant_webhooks ADD COLUMN webhook_url VARCHAR(500) NOT NULL AFTER event_type`);
          logger.info('✅ Added webhook_url to tenant_webhooks');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('tenant_webhooks webhook_url:', e.message); }
      }
      if (!existingTenantWebhooksColumns.includes('secret_key')) {
        try {
          await connection.execute(`ALTER TABLE tenant_webhooks ADD COLUMN secret_key VARCHAR(255) AFTER webhook_url`);
          logger.info('✅ Added secret_key to tenant_webhooks');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('tenant_webhooks secret_key:', e.message); }
      }
      if (!existingTenantWebhooksColumns.includes('is_active')) {
        try {
          await connection.execute(`ALTER TABLE tenant_webhooks ADD COLUMN is_active BOOLEAN DEFAULT TRUE AFTER secret_key`);
          logger.info('✅ Added is_active to tenant_webhooks');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('tenant_webhooks is_active:', e.message); }
      }
      if (!existingTenantWebhooksColumns.includes('last_triggered_at')) {
        try {
          await connection.execute(`ALTER TABLE tenant_webhooks ADD COLUMN last_triggered_at DATETIME AFTER is_active`);
          logger.info('✅ Added last_triggered_at to tenant_webhooks');
        } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('tenant_webhooks last_triggered_at:', e.message); }
      }

    } catch (e) {
      logger.warn('tenant_webhooks columns check failed', { error: e.message });
    }

    // ============================================
    // Plan Addons Tables
    // ============================================

    // Create plan_addons table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS plan_addons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        resource_key VARCHAR(50) NOT NULL UNIQUE,
        resource_name VARCHAR(100) NOT NULL,
        description TEXT,
        unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        currency VARCHAR(3) DEFAULT 'USD',
        stripe_price_id VARCHAR(255),
        paypal_plan_id VARCHAR(255),
        active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_resource_key (resource_key),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ plan_addons table created/verified');

    // Create addon_purchases table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS addon_purchases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        items JSON NOT NULL,
        total_amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        status ENUM('pending', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
        payment_method VARCHAR(50),
        payment_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ addon_purchases table created/verified');

    // Create tenant_addons table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tenant_addons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        addon_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        status ENUM('active', 'cancelled', 'expired') DEFAULT 'active',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (addon_id) REFERENCES plan_addons(id) ON DELETE CASCADE,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_addon_id (addon_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ tenant_addons table created/verified');

    // Create system_addons table (for uploadable plugins/extensions)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS system_addons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        version VARCHAR(50) DEFAULT '1.0.0',
        author VARCHAR(255),
        icon VARCHAR(255) DEFAULT 'puzzle-piece',
        directory VARCHAR(255) NOT NULL,
        config JSON,
        active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_slug (slug),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ system_addons table created/verified');

    // Insert default add-ons
    const defaultAddons = [
      ['stores', 'Store', 'Additional store location', 0.50, 'USD', 1],
      ['departments', 'Department', 'Additional department', 0.50, 'USD', 2],
      ['users', 'User', 'Additional user account', 0.70, 'USD', 3],
      ['conversations', 'Conversations', '100 additional conversations', 2.00, 'USD', 4],
      ['messages', 'Messages', '1000 additional messages', 5.00, 'USD', 5],
      ['contacts', 'Contacts', '100 additional contacts', 1.00, 'USD', 6],
      ['faq', 'FAQ', 'Additional FAQ entries for automated responses', 1.00, 'USD', 7],
      ['widget', 'Chat Widget', 'Customizable chat widget for your website', 2.50, 'USD', 8],
      ['invoice', 'Invoice', 'Invoice and quote generation feature', 3.00, 'USD', 9],
      ['ai', 'AI Assistant', 'AI-powered automated responses', 10.00, 'USD', 10],
      ['woocommerce', 'WooCommerce', 'WooCommerce integration for e-commerce', 5.00, 'USD', 11],
      ['payment_links', 'Payment Links', 'Generate payment links for customers', 3.00, 'USD', 12]
    ];

    for (const [key, name, desc, price, currency, order] of defaultAddons) {
      await connection.execute(`
        INSERT IGNORE INTO plan_addons (resource_key, resource_name, description, unit_price, currency, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [key, name, desc, price, currency, order]);
    }
    logger.info('✅ Default plan addons created/verified');

    // ============================================
    // Bio Link Tables
    // ============================================

    // Create biolink_projects table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS biolink_projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        user_id INT,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        type ENUM('biopage', 'shortlink', 'qrcode', 'file', 'vcard', 'event', 'html') DEFAULT 'biopage',
        status ENUM('active', 'draft', 'inactive') DEFAULT 'draft',
        destination_url TEXT,
        clicks INT DEFAULT 0,
        settings JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_slug (slug),
        INDEX idx_tenant (tenant_id),
        INDEX idx_type (type),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ biolink_projects table created/verified');

    // Create biolink_pages table (for biopage type projects)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS biolink_pages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        title VARCHAR(255),
        description TEXT,
        avatar_url VARCHAR(500),
        background_type ENUM('color', 'gradient', 'image') DEFAULT 'color',
        background_value VARCHAR(500) DEFAULT '#ffffff',
        text_color VARCHAR(20) DEFAULT '#000000',
        font_family VARCHAR(100) DEFAULT 'Inter',
        button_style VARCHAR(50) DEFAULT 'rounded',
        button_color VARCHAR(20) DEFAULT '#000000',
        button_text_color VARCHAR(20) DEFAULT '#ffffff',
        seo_title VARCHAR(255),
        seo_description TEXT,
        seo_image VARCHAR(500),
        favicon VARCHAR(500),
        password VARCHAR(255),
        sensitive_content BOOLEAN DEFAULT FALSE,
        leap_link VARCHAR(500),
        analytics_code TEXT,
        custom_css TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_project (project_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ biolink_pages table created/verified');

    // Create biolink_blocks table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS biolink_blocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        page_id INT NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255),
        content JSON,
        settings JSON,
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_page (page_id),
        INDEX idx_sort (sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ biolink_blocks table created/verified');

    // Create biolink_analytics table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS biolink_analytics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        block_id INT,
        event_type ENUM('view', 'click', 'download') DEFAULT 'view',
        ip_address VARCHAR(45),
        user_agent TEXT,
        referrer VARCHAR(500),
        country VARCHAR(100),
        city VARCHAR(100),
        device_type VARCHAR(50),
        browser VARCHAR(100),
        os VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_project (project_id),
        INDEX idx_block (block_id),
        INDEX idx_event (event_type),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ biolink_analytics table created/verified');

    // Add missing columns to biolink tables
    // Add tenant_id to biolink_pages if missing
    const [biolinkPagesColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'biolink_pages'
    `);
    const existingBiolinkPagesColumns = biolinkPagesColumns.map(col => col.COLUMN_NAME);

    if (!existingBiolinkPagesColumns.includes('tenant_id')) {
      try {
        await connection.execute(`ALTER TABLE biolink_pages ADD COLUMN tenant_id INT NOT NULL DEFAULT 0 AFTER project_id`);
        logger.info('✅ Added tenant_id to biolink_pages');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('biolink_pages tenant_id:', e.message); }
    }

    // Add tenant_id to biolink_blocks if missing
    const [biolinkBlocksColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'biolink_blocks'
    `);
    const existingBiolinkBlocksColumns = biolinkBlocksColumns.map(col => col.COLUMN_NAME);

    if (!existingBiolinkBlocksColumns.includes('tenant_id')) {
      try {
        await connection.execute(`ALTER TABLE biolink_blocks ADD COLUMN tenant_id INT NOT NULL DEFAULT 0 AFTER page_id`);
        logger.info('✅ Added tenant_id to biolink_blocks');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('biolink_blocks tenant_id:', e.message); }
    }

    // Add position column to biolink_blocks if missing (alias for sort_order)
    if (!existingBiolinkBlocksColumns.includes('position')) {
      try {
        await connection.execute(`ALTER TABLE biolink_blocks ADD COLUMN position INT DEFAULT 0 AFTER settings`);
        logger.info('✅ Added position to biolink_blocks');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('biolink_blocks position:', e.message); }
    }

    // Add tenant_id to biolink_analytics if missing
    const [biolinkAnalyticsColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'biolink_analytics'
    `);
    const existingBiolinkAnalyticsColumns = biolinkAnalyticsColumns.map(col => col.COLUMN_NAME);

    if (!existingBiolinkAnalyticsColumns.includes('tenant_id')) {
      try {
        await connection.execute(`ALTER TABLE biolink_analytics ADD COLUMN tenant_id INT NOT NULL DEFAULT 0 AFTER id`);
        logger.info('✅ Added tenant_id to biolink_analytics');
      } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') logger.warn('biolink_analytics tenant_id:', e.message); }
    }

    // Create biolink_leads table for form submissions
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS biolink_leads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        project_id INT NOT NULL,
        block_id INT NOT NULL,
        lead_type ENUM('email', 'phone', 'contact') NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        name VARCHAR(255),
        message TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_project (project_id),
        INDEX idx_block (block_id),
        INDEX idx_type (lead_type),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ biolink_leads table created/verified');

    // ============================================
    // Notification System Tables
    // ============================================

    // Create email_notification_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS email_notification_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        smtp_host VARCHAR(255),
        smtp_port INT DEFAULT 587,
        smtp_secure BOOLEAN DEFAULT FALSE,
        smtp_user VARCHAR(255),
        smtp_password VARCHAR(255),
        from_email VARCHAR(255),
        from_name VARCHAR(255) DEFAULT 'Misayan SaaS',
        enabled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ email_notification_settings table created/verified');

    // Create whatsapp_notification_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_notification_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone_number VARCHAR(20),
        session_name VARCHAR(100) DEFAULT 'superadmin_notifications',
        enabled BOOLEAN DEFAULT FALSE,
        connected BOOLEAN DEFAULT FALSE,
        qr_code TEXT,
        last_connected_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_notification_settings table created/verified');

    // Create email_notification_templates table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS email_notification_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        template_key VARCHAR(100) UNIQUE NOT NULL,
        template_name VARCHAR(255) NOT NULL,
        category ENUM('tenant', 'subscription', 'security', 'system') NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        html_body TEXT,
        variables JSON,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_category (category),
        INDEX idx_template_key (template_key),
        INDEX idx_enabled (enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ email_notification_templates table created/verified');

    // Create whatsapp_notification_templates table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_notification_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        template_key VARCHAR(100) UNIQUE NOT NULL,
        template_name VARCHAR(255) NOT NULL,
        category ENUM('tenant', 'subscription', 'security', 'system') NOT NULL,
        message TEXT NOT NULL,
        variables JSON,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_category (category),
        INDEX idx_template_key (template_key),
        INDEX idx_enabled (enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_notification_templates table created/verified');

    // Create plan_expiration_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS plan_expiration_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        days_before_1 INT DEFAULT 7,
        days_before_2 INT DEFAULT 3,
        days_before_3 INT DEFAULT 1,
        days_before_4 INT DEFAULT 0,
        days_after_1 INT DEFAULT 1,
        days_after_2 INT DEFAULT 3,
        days_after_3 INT DEFAULT 7,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ plan_expiration_settings table created/verified');

    // Create notification_logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        notification_type ENUM('email', 'whatsapp') NOT NULL,
        template_key VARCHAR(100),
        recipient VARCHAR(255) NOT NULL,
        subject VARCHAR(500),
        message TEXT,
        status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
        error_message TEXT,
        metadata JSON,
        sent_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_type (notification_type),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        INDEX idx_template_key (template_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ notification_logs table created/verified');

    // Create scheduled_notifications table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS scheduled_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        notification_type ENUM('email', 'whatsapp') NOT NULL,
        template_key VARCHAR(100) NOT NULL,
        scheduled_date DATE NOT NULL,
        scheduled_time TIME DEFAULT '09:00:00',
        status ENUM('pending', 'sent', 'cancelled', 'failed') DEFAULT 'pending',
        sent_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_scheduled_date (scheduled_date),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ scheduled_notifications table created/verified');

    // Insert default notification settings
    await connection.execute(`INSERT IGNORE INTO email_notification_settings (id, enabled) VALUES (1, FALSE)`);
    await connection.execute(`INSERT IGNORE INTO whatsapp_notification_settings (id, enabled) VALUES (1, FALSE)`);
    await connection.execute(`INSERT IGNORE INTO plan_expiration_settings (id) VALUES (1)`);
    logger.info('✅ Default notification settings created/verified');

    // ============================================
    // WhatsApp Cloud API Tables
    // ============================================

    // Create whatsapp_cloud_accounts table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        account_name VARCHAR(255) NOT NULL,
        waba_id VARCHAR(255),
        phone_number_id VARCHAR(255) NOT NULL,
        phone_number VARCHAR(20),
        access_token TEXT,
        app_id VARCHAR(255),
        app_secret VARCHAR(255),
        status ENUM('connected', 'disconnected', 'error') DEFAULT 'connected',
        is_default BOOLEAN DEFAULT FALSE,
        webhook_verified BOOLEAN DEFAULT FALSE,
        verify_token VARCHAR(255) NULL,
        templates_synced_at TIMESTAMP NULL,
        templates_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_phone_number_id (phone_number_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_status (status),
        INDEX idx_is_default (is_default)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_accounts table created/verified');

    // Add verify_token column if it doesn't exist (migration for existing installations)
    try {
      const [columns] = await connection.execute(
        'SHOW COLUMNS FROM whatsapp_cloud_accounts LIKE ?',
        ['verify_token']
      );
      
      if (columns.length === 0) {
        await connection.execute(
          'ALTER TABLE whatsapp_cloud_accounts ADD COLUMN verify_token VARCHAR(255) NULL AFTER webhook_verified'
        );
        logger.info('✅ verify_token column added to whatsapp_cloud_accounts table');
      }
    } catch (error) {
      logger.warn('Could not add verify_token column (may already exist)', { error: error.message });
    }

    // Create whatsapp_cloud_templates table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        account_id INT NOT NULL,
        template_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        language VARCHAR(10) NOT NULL,
        status VARCHAR(50) NOT NULL,
        category VARCHAR(50) NOT NULL,
        components JSON,
        body TEXT,
        header TEXT,
        footer TEXT,
        buttons JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_template (account_id, template_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES whatsapp_cloud_accounts(id) ON DELETE CASCADE,
        INDEX idx_tenant_account (tenant_id, account_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_templates table created/verified');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        account_id INT NOT NULL,
        template_id VARCHAR(255) NOT NULL,
        template_name VARCHAR(255) NOT NULL,
        source VARCHAR(50) DEFAULT 'meta',
        audience_type ENUM('all', 'groups', 'custom') DEFAULT 'all',
        audience_groups JSON,
        audience_custom_numbers JSON,
        filters JSON,
        schedule_at DATETIME NOT NULL,
        timezone VARCHAR(100) DEFAULT 'UTC',
        status ENUM('scheduled', 'sending', 'sent', 'cancelled', 'failed') DEFAULT 'scheduled',
        total_count INT DEFAULT 0,
        sent_count INT DEFAULT 0,
        failed_count INT DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES whatsapp_cloud_accounts(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_account (account_id),
        INDEX idx_status (status),
        INDEX idx_schedule_at (schedule_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_campaigns table created/verified');

    // Create whatsapp_cloud_conversations table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        account_id INT NOT NULL,
        contact_phone VARCHAR(20) NOT NULL,
        contact_name VARCHAR(255),
        contact_profile_pic VARCHAR(500),
        last_message_text TEXT,
        last_message_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_message_from ENUM('customer', 'business') DEFAULT 'customer',
        unread_count INT DEFAULT 0,
        status ENUM('open', 'pending', 'closed') DEFAULT 'open',
        assigned_to_user_id INT,
        claimed_by_user_id INT NULL,
        claimed_at TIMESTAMP NULL,
        department_id INT NULL,
        store_id INT NULL,
        source ENUM('whatsapp_cloud', 'whatsapp_web') DEFAULT 'whatsapp_cloud',
        original_conversation_id INT NULL,
        tags JSON NULL,
        notes TEXT NULL,
        priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
        pipeline_stage VARCHAR(50) DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_conversation (account_id, contact_phone),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES whatsapp_cloud_accounts(id) ON DELETE CASCADE,
        INDEX idx_tenant_account (tenant_id, account_id),
        INDEX idx_contact_phone (contact_phone),
        INDEX idx_last_message_time (last_message_time),
        INDEX idx_status (status),
        INDEX idx_claimed_by (claimed_by_user_id),
        INDEX idx_department (department_id),
        INDEX idx_store (store_id),
        INDEX idx_source (source),
        INDEX idx_priority (priority),
        INDEX idx_pipeline_stage (pipeline_stage)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_conversations table created/verified');

    const [cloudConversationColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'whatsapp_cloud_conversations'
    `);
    const existingCloudConversationColumns = cloudConversationColumns.map(col => col.COLUMN_NAME);

    if (!existingCloudConversationColumns.includes('pipeline_stage')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_conversations ADD COLUMN pipeline_stage VARCHAR(50) DEFAULT 'new'`);
        logger.info('✅ Added pipeline_stage column to whatsapp_cloud_conversations');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('pipeline_stage column:', e.message);
        }
      }
    }

    if (!existingCloudConversationColumns.includes('stage_id')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_conversations ADD COLUMN stage_id VARCHAR(50) DEFAULT 'unassigned'`);
        logger.info('✅ Added stage_id column to whatsapp_cloud_conversations');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('stage_id column:', e.message);
        }
      }
    }

    if (!existingCloudConversationColumns.includes('transferred_to_store')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_conversations ADD COLUMN transferred_to_store INT NULL`);
        logger.info('✅ Added transferred_to_store column to whatsapp_cloud_conversations');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('transferred_to_store column:', e.message);
        }
      }
    }

    if (!existingCloudConversationColumns.includes('transferred_to_department')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_conversations ADD COLUMN transferred_to_department INT NULL`);
        logger.info('✅ Added transferred_to_department column to whatsapp_cloud_conversations');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('transferred_to_department column:', e.message);
        }
      }
    }

    if (!existingCloudConversationColumns.includes('transferred_at')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_conversations ADD COLUMN transferred_at TIMESTAMP NULL`);
        logger.info('✅ Added transferred_at column to whatsapp_cloud_conversations');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('transferred_at column:', e.message);
        }
      }
    }

    if (!existingCloudConversationColumns.includes('transferred_by_user_id')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_conversations ADD COLUMN transferred_by_user_id INT NULL`);
        logger.info('✅ Added transferred_by_user_id column to whatsapp_cloud_conversations');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('transferred_by_user_id column:', e.message);
        }
      }
    }

    // Create whatsapp_cloud_messages table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        message_id VARCHAR(255) NOT NULL UNIQUE,
        direction ENUM('inbound', 'outbound') NOT NULL,
        message_type ENUM('text', 'image', 'video', 'audio', 'document', 'location', 'sticker', 'template') DEFAULT 'text',
        text_content TEXT,
        media_url VARCHAR(500),
        caption TEXT,
        filename VARCHAR(255),
        status ENUM('sent', 'delivered', 'read', 'failed') DEFAULT 'sent',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_by_user_id INT NULL,
        is_internal_note BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES whatsapp_cloud_conversations(id) ON DELETE CASCADE,
        INDEX idx_conversation (conversation_id),
        INDEX idx_message_id (message_id),
        INDEX idx_timestamp (timestamp),
        INDEX idx_direction (direction),
        INDEX idx_status (status),
        INDEX idx_is_internal_note (is_internal_note)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_messages table created/verified');

    // Insert default email notification templates with complete HTML
    const emailTemplates = [
      {
        key: 'welcome',
        name: 'Welcome Email',
        category: 'tenant',
        subject: 'Welcome to {{platform_name}}!',
        body: 'Hello {{tenant_name}},\n\nWelcome to {{platform_name}}! Your account has been created successfully.\n\nYour subdomain: {{subdomain}}\nYour plan: {{plan_name}}\nTrial period: {{trial_days}} days\n\nGet started by logging in at: {{login_url}}\n\nBest regards,\n{{platform_name}} Team',
        html_body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: linear-gradient(135deg, #00a149 0%, #319131 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
<h1 style="color: white; margin: 0;">Welcome to {{platform_name}}!</h1>
</div>
<div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
<p>Hello <strong>{{tenant_name}}</strong>,</p>
<p>Your account has been created successfully! We're excited to have you on board.</p>
<div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
<h3 style="margin-top: 0; color: #00a149;">Your Account Details:</h3>
<ul style="list-style: none; padding: 0;">
<li style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Subdomain:</strong> {{subdomain}}</li>
<li style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Plan:</strong> {{plan_name}}</li>
<li style="padding: 8px 0;"><strong>Trial Period:</strong> {{trial_days}} days</li>
</ul>
</div>
<div style="text-align: center; margin: 30px 0;">
<a href="{{login_url}}" style="background: linear-gradient(135deg, #00a149 0%, #319131 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Login to Your Account</a>
</div>
<p>If you have any questions, feel free to contact us at <a href="mailto:{{support_email}}">{{support_email}}</a></p>
<p>Best regards,<br><strong>{{platform_name}} Team</strong></p>
</div>
</body>
</html>`,
        variables: '["tenant_name", "platform_name", "subdomain", "plan_name", "login_url", "trial_days", "support_email"]'
      },
      {
        key: 'password_reset',
        name: 'Password Reset',
        category: 'security',
        subject: 'Reset Your Password - {{platform_name}}',
        body: 'Hello {{tenant_name}},\n\nYou requested a password reset. Click the link below to reset your password:\n\n{{reset_link}}\n\nThis link expires in {{expiry_hours}} hour(s).\n\nIf you did not request this, please ignore this email.\n\nBest regards,\n{{platform_name}} Team',
        html_body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: linear-gradient(135deg, #00a149 0%, #319131 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
<h1 style="color: white; margin: 0;">Password Reset Request</h1>
</div>
<div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
<p>Hello <strong>{{tenant_name}}</strong>,</p>
<p>We received a request to reset your password. Click the button below to create a new password:</p>
<div style="text-align: center; margin: 30px 0;">
<a href="{{reset_link}}" style="background: linear-gradient(135deg, #00a149 0%, #319131 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
</div>
<div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 20px 0;">
<p style="margin: 0;"><strong>⏰ Important:</strong> This link expires in <strong>{{expiry_hours}} hour(s)</strong>.</p>
</div>
<p style="color: #666; font-size: 14px;">If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
<p>Best regards,<br><strong>{{platform_name}} Team</strong></p>
</div>
</body>
</html>`,
        variables: '["tenant_name", "platform_name", "reset_link", "expiry_hours", "support_email"]'
      },
      {
        key: 'payment_confirmation',
        name: 'Payment Confirmation',
        category: 'subscription',
        subject: 'Payment Confirmed - {{platform_name}}',
        body: 'Hello {{tenant_name}},\n\nYour payment has been confirmed!\n\nPlan: {{plan_name}}\nAmount: {{amount}}\nPayment Date: {{payment_date}}\nNext Billing Date: {{next_billing_date}}\n\nThank you for your business!\n\nBest regards,\n{{platform_name}} Team',
        html_body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
<h1 style="color: white; margin: 0;">✅ Payment Confirmed!</h1>
</div>
<div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
<p>Hello <strong>{{tenant_name}}</strong>,</p>
<p>Thank you! Your payment has been successfully processed.</p>
<div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
<h3 style="margin-top: 0; color: #28a745;">Payment Details:</h3>
<ul style="list-style: none; padding: 0;">
<li style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Plan:</strong> {{plan_name}}</li>
<li style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Amount:</strong> {{amount}}</li>
<li style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Payment Date:</strong> {{payment_date}}</li>
<li style="padding: 8px 0;"><strong>Next Billing Date:</strong> {{next_billing_date}}</li>
</ul>
</div>
<p>Thank you for your continued trust in our services!</p>
<p>Best regards,<br><strong>{{platform_name}} Team</strong></p>
</div>
</body>
</html>`,
        variables: '["tenant_name", "platform_name", "plan_name", "amount", "payment_date", "next_billing_date"]'
      },
      {
        key: 'plan_expiring_soon',
        name: 'Plan Expiring Soon',
        category: 'subscription',
        subject: 'Your Plan Expires in {{days_remaining}} Days - {{platform_name}}',
        body: 'Hello {{tenant_name}},\n\nYour {{plan_name}} plan will expire in {{days_remaining}} days on {{expiry_date}}.\n\nTo avoid service interruption, please renew your subscription.\n\nRenew now: {{renewal_link}}\n\nBest regards,\n{{platform_name}} Team',
        html_body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
<h1 style="color: white; margin: 0;">⚠️ Plan Expiring Soon</h1>
</div>
<div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
<p>Hello <strong>{{tenant_name}}</strong>,</p>
<p>Your <strong>{{plan_name}}</strong> plan will expire in <strong>{{days_remaining}} days</strong>.</p>
<div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
<p style="margin: 0; font-size: 18px;"><strong>Expiration Date: {{expiry_date}}</strong></p>
</div>
<p>To avoid any service interruption, please renew your subscription before the expiration date.</p>
<div style="text-align: center; margin: 30px 0;">
<a href="{{renewal_link}}" style="background: linear-gradient(135deg, #00a149 0%, #319131 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Renew Now</a>
</div>
<p>Best regards,<br><strong>{{platform_name}} Team</strong></p>
</div>
</body>
</html>`,
        variables: '["tenant_name", "platform_name", "plan_name", "days_remaining", "expiry_date", "renewal_link"]'
      },
      {
        key: 'plan_expired',
        name: 'Plan Expired',
        category: 'subscription',
        subject: 'Your Plan Has Expired - {{platform_name}}',
        body: 'Hello {{tenant_name}},\n\nYour {{plan_name}} plan has expired on {{expiry_date}}.\n\nYou have {{grace_days}} days of grace period to renew your subscription before your account is suspended.\n\nRenew now: {{renewal_link}}\n\nBest regards,\n{{platform_name}} Team',
        html_body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
<h1 style="color: white; margin: 0;">🚨 Plan Expired</h1>
</div>
<div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
<p>Hello <strong>{{tenant_name}}</strong>,</p>
<p>Your <strong>{{plan_name}}</strong> plan has expired on <strong>{{expiry_date}}</strong>.</p>
<div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
<p style="margin: 0;"><strong>⏰ Grace Period:</strong> You have <strong>{{grace_days}} days</strong> to renew your subscription before your account is suspended.</p>
</div>
<p>Please renew your subscription to continue using our services without interruption.</p>
<div style="text-align: center; margin: 30px 0;">
<a href="{{renewal_link}}" style="background: linear-gradient(135deg, #00a149 0%, #319131 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Renew Now</a>
</div>
<p>Best regards,<br><strong>{{platform_name}} Team</strong></p>
</div>
</body>
</html>`,
        variables: '["tenant_name", "platform_name", "plan_name", "expiry_date", "renewal_link", "grace_days"]'
      },
      {
        key: 'account_suspended',
        name: 'Account Suspended',
        category: 'system',
        subject: 'Account Suspended - {{platform_name}}',
        body: 'Hello {{tenant_name}},\n\nYour account has been suspended.\n\nReason: {{suspension_reason}}\n\nTo reactivate your account, please contact us at {{support_email}}.\n\nBest regards,\n{{platform_name}} Team',
        html_body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: linear-gradient(135deg, #6c757d 0%, #495057 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
<h1 style="color: white; margin: 0;">🔴 Account Suspended</h1>
</div>
<div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
<p>Hello <strong>{{tenant_name}}</strong>,</p>
<p>We regret to inform you that your account has been suspended.</p>
<div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
<p style="margin: 0;"><strong>Reason:</strong> {{suspension_reason}}</p>
</div>
<p>To reactivate your account, please contact our support team:</p>
<p style="text-align: center;"><a href="mailto:{{support_email}}" style="color: #00a149; font-weight: bold;">{{support_email}}</a></p>
<p>Best regards,<br><strong>{{platform_name}} Team</strong></p>
</div>
</body>
</html>`,
        variables: '["tenant_name", "platform_name", "suspension_reason", "support_email"]'
      },
      {
        key: 'account_reactivated',
        name: 'Account Reactivated',
        category: 'system',
        subject: 'Account Reactivated - {{platform_name}}',
        body: 'Hello {{tenant_name}},\n\nGreat news! Your account has been reactivated.\n\nYour plan: {{plan_name}}\n\nYou can now login at: {{login_url}}\n\nBest regards,\n{{platform_name}} Team',
        html_body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
<h1 style="color: white; margin: 0;">🟢 Account Reactivated!</h1>
</div>
<div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
<p>Hello <strong>{{tenant_name}}</strong>,</p>
<p>Great news! Your account has been successfully reactivated.</p>
<div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
<p style="margin: 0;"><strong>Your Plan:</strong> {{plan_name}}</p>
</div>
<p>You can now access all features of your account.</p>
<div style="text-align: center; margin: 30px 0;">
<a href="{{login_url}}" style="background: linear-gradient(135deg, #00a149 0%, #319131 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Login Now</a>
</div>
<p>Thank you for your continued trust!</p>
<p>Best regards,<br><strong>{{platform_name}} Team</strong></p>
</div>
</body>
</html>`,
        variables: '["tenant_name", "platform_name", "plan_name", "login_url"]'
      }
    ];

    for (const template of emailTemplates) {
      await connection.execute(`
        INSERT INTO email_notification_templates (template_key, template_name, category, subject, body, html_body, variables)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          template_name = VALUES(template_name),
          subject = VALUES(subject),
          body = VALUES(body),
          html_body = VALUES(html_body),
          variables = VALUES(variables)
      `, [template.key, template.name, template.category, template.subject, template.body, template.html_body, template.variables]);
    }
    logger.info('✅ Default email notification templates created/verified');

    // Insert default WhatsApp notification templates with complete messages
    const whatsappTemplates = [
      {
        key: 'welcome',
        name: 'Welcome Message',
        category: 'tenant',
        message: `🎉 *Welcome to {{platform_name}}!*

Hello {{tenant_name}}!

Your account has been created successfully.

📌 *Your Details:*
• Subdomain: {{subdomain}}
• Plan: {{plan_name}}
• Trial: {{trial_days}} days

🔗 Login: {{login_url}}

Need help? Contact us at {{support_email}}`,
        variables: '["tenant_name", "platform_name", "subdomain", "plan_name", "login_url", "trial_days", "support_email"]'
      },
      {
        key: 'password_reset',
        name: 'Password Reset',
        category: 'security',
        message: `🔐 *Password Reset Request*

Hello {{tenant_name}},

You requested a password reset. Click the link below:

{{reset_link}}

⏰ This link expires in {{expiry_hours}} hour(s).

If you didn't request this, please ignore this message.`,
        variables: '["tenant_name", "reset_link", "expiry_hours"]'
      },
      {
        key: 'payment_confirmation',
        name: 'Payment Confirmation',
        category: 'subscription',
        message: `✅ *Payment Confirmed!*

Hello {{tenant_name}},

Your payment has been processed successfully.

📋 *Details:*
• Plan: {{plan_name}}
• Amount: {{amount}}
• Date: {{payment_date}}
• Next billing: {{next_billing_date}}

Thank you for your business!`,
        variables: '["tenant_name", "plan_name", "amount", "payment_date", "next_billing_date"]'
      },
      {
        key: 'plan_expiring_soon',
        name: 'Plan Expiring Soon',
        category: 'subscription',
        message: `⚠️ *Plan Expiring Soon*

Hello {{tenant_name}},

Your *{{plan_name}}* plan expires in *{{days_remaining}} days* on {{expiry_date}}.

Renew now to avoid service interruption:
{{renewal_link}}`,
        variables: '["tenant_name", "plan_name", "days_remaining", "expiry_date", "renewal_link"]'
      },
      {
        key: 'plan_expired',
        name: 'Plan Expired',
        category: 'subscription',
        message: `🚨 *Plan Expired*

Hello {{tenant_name}},

Your *{{plan_name}}* plan has expired on {{expiry_date}}.

⏰ You have *{{grace_days}} days* grace period before suspension.

Renew now: {{renewal_link}}`,
        variables: '["tenant_name", "plan_name", "expiry_date", "renewal_link", "grace_days"]'
      },
      {
        key: 'account_suspended',
        name: 'Account Suspended',
        category: 'system',
        message: `🔴 *Account Suspended*

Hello {{tenant_name}},

Your account has been suspended.

📋 *Reason:* {{suspension_reason}}

To reactivate, contact: {{support_email}}`,
        variables: '["tenant_name", "suspension_reason", "support_email"]'
      },
      {
        key: 'account_reactivated',
        name: 'Account Reactivated',
        category: 'system',
        message: `🟢 *Account Reactivated!*

Hello {{tenant_name}},

Great news! Your account is now active.

📋 *Plan:* {{plan_name}}

Login now: {{login_url}}`,
        variables: '["tenant_name", "plan_name", "login_url"]'
      }
    ];

    for (const template of whatsappTemplates) {
      await connection.execute(`
        INSERT INTO whatsapp_notification_templates (template_key, template_name, category, message, variables)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          template_name = VALUES(template_name),
          message = VALUES(message),
          variables = VALUES(variables)
      `, [template.key, template.name, template.category, template.message, template.variables]);
    }
    logger.info('✅ Default WhatsApp notification templates created/verified');

    // ============================================
    // System Tenant for SuperAdmin (tenant_id = 0)
    // ============================================

    // Check if system tenant exists (id = 0 for superadmin)
    const [systemTenantExists] = await connection.execute(
      'SELECT id FROM tenants WHERE id = 0'
    );

    if (systemTenantExists.length === 0) {
      logger.info('📝 Creating system tenant with ID 0 for SuperAdmin...');
      
      // Insert system tenant with explicit id = 0
      // MySQL allows inserting 0 when NO_AUTO_VALUE_ON_ZERO is set
      await connection.execute(`
        SET SESSION sql_mode = 'NO_AUTO_VALUE_ON_ZERO'
      `);
      
      await connection.execute(`
        INSERT INTO tenants (
          id, name, subdomain, email, status, plan_id,
          max_users, max_stores, max_departments, max_contacts, 
          max_devices, max_conversations, max_messages_per_month,
          created_at, updated_at
        ) VALUES (
          0, 'System', 'system', 'system@misayan.local', 'active', NULL,
          999, 999, 999, 999999, 999, 999999, 999999999,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);
      
      // Ensure AUTO_INCREMENT starts from 1 for regular tenants
      await connection.execute(`
        ALTER TABLE tenants AUTO_INCREMENT = 1
      `);
      
      // Reset sql_mode to default
      await connection.execute(`
        SET SESSION sql_mode = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'
      `);
      
      logger.info('✅ System tenant (id=0) created for SuperAdmin');
    } else {
      logger.info('✅ System tenant (id=0) already exists');
    }

    // Run WhatsApp tables migration
    logger.info('📱 Running WhatsApp tables migration...');
    const fs = require('fs');
    const path = require('path');
    const whatsappMigrationPath = path.join(
      __dirname,
      '../migrations/20241218_create_whatsapp_tables.sql'
    );

    if (fs.existsSync(whatsappMigrationPath)) {
      try {
        const whatsappMigration = fs.readFileSync(whatsappMigrationPath, 'utf8');

        // Remove all comment lines and empty lines
        const cleanedSQL = whatsappMigration
          .split('\n')
          .filter((line) => {
            const trimmed = line.trim();
            return trimmed.length > 0 && !trimmed.startsWith('--');
          })
          .join('\n');

        // Split by semicolon and filter valid statements
        const statements = cleanedSQL
          .split(';')
          .map((stmt) => stmt.trim())
          .filter((stmt) => {
            const upper = stmt.toUpperCase();
            return (
              stmt.length > 0 &&
              (upper.startsWith('CREATE TABLE') ||
                upper.startsWith('CREATE INDEX') ||
                upper.startsWith('ALTER TABLE'))
            );
          });

        logger.info(`Found ${statements.length} WhatsApp migration statements`);

        for (const statement of statements) {
          try {
            await connection.execute(statement);
          } catch (stmtError) {
            // Ignore if table/index already exists
            if (
              stmtError.code !== 'ER_TABLE_EXISTS_ERROR' &&
              stmtError.code !== 'ER_DUP_KEYNAME'
            ) {
              logger.warn('WhatsApp migration statement warning', {
                error: stmtError.message,
                code: stmtError.code,
              });
            }
          }
        }
        logger.info('✅ WhatsApp tables migration completed');
      } catch (migrationError) {
        logger.error('Error running WhatsApp migration', {
          error: migrationError.message,
          stack: migrationError.stack,
        });
        // Don't throw - allow server to continue
      }
    } else {
      logger.warn('⚠️ WhatsApp migration file not found');
    }

    // Run Plan Features migration
    logger.info('📦 Running Plan Features migration...');
    const planFeaturesMigrationPath = path.join(
      __dirname,
      '../migrations/20241220_add_plan_features.sql'
    );

    if (fs.existsSync(planFeaturesMigrationPath)) {
      try {
        const planFeaturesMigration = fs.readFileSync(planFeaturesMigrationPath, 'utf8');

        // Remove all comment lines and empty lines
        const cleanedSQL = planFeaturesMigration
          .split('\n')
          .filter((line) => {
            const trimmed = line.trim();
            return trimmed.length > 0 && !trimmed.startsWith('--');
          })
          .join('\n');

        // Split by semicolon and filter valid statements
        const statements = cleanedSQL
          .split(';')
          .map((stmt) => stmt.trim())
          .filter((stmt) => {
            const upper = stmt.toUpperCase();
            return stmt.length > 0 && upper.startsWith('ALTER TABLE');
          });

        logger.info(`Found ${statements.length} Plan Features migration statements`);

        for (const statement of statements) {
          try {
            await connection.execute(statement);
          } catch (stmtError) {
            // Ignore if column already exists
            if (stmtError.code === 'ER_DUP_FIELDNAME') {
              logger.info('Column already exists, skipping...');
            } else if (
              stmtError.code !== 'ER_TABLE_EXISTS_ERROR' &&
              stmtError.code !== 'ER_DUP_KEYNAME'
            ) {
              logger.warn('Plan Features migration statement warning', {
                error: stmtError.message,
                code: stmtError.code,
              });
            }
          }
        }
        logger.info('✅ Plan Features migration completed');
      } catch (migrationError) {
        logger.error('Error running Plan Features migration', {
          error: migrationError.message,
          stack: migrationError.stack,
        });
        // Don't throw - allow server to continue
      }
    } else {
      logger.warn('⚠️ Plan Features migration file not found');
    }

    // Run Payment Gateways migration
    logger.info('💳 Running Payment Gateways migration...');
    const paymentGatewaysMigrationPath = path.join(
      __dirname,
      '../migrations/20241220_update_payment_gateways.sql'
    );

    if (fs.existsSync(paymentGatewaysMigrationPath)) {
      try {
        const paymentGatewaysMigration = fs.readFileSync(paymentGatewaysMigrationPath, 'utf8');

        // Remove all comment lines and empty lines
        const cleanedSQL = paymentGatewaysMigration
          .split('\n')
          .filter((line) => {
            const trimmed = line.trim();
            return trimmed.length > 0 && !trimmed.startsWith('--');
          })
          .join('\n');

        // Split by semicolon and filter valid statements
        const statements = cleanedSQL
          .split(';')
          .map((stmt) => stmt.trim())
          .filter((stmt) => {
            const upper = stmt.toUpperCase();
            return stmt.length > 0 && upper.startsWith('ALTER TABLE');
          });

        logger.info(`Found ${statements.length} Payment Gateways migration statements`);

        for (const statement of statements) {
          try {
            await connection.execute(statement);
          } catch (stmtError) {
            // Ignore if column already exists
            if (stmtError.code === 'ER_DUP_FIELDNAME') {
              logger.info('Column already exists, skipping...');
            } else if (
              stmtError.code !== 'ER_TABLE_EXISTS_ERROR' &&
              stmtError.code !== 'ER_DUP_KEYNAME'
            ) {
              logger.warn('Payment Gateways migration statement warning', {
                error: stmtError.message,
                code: stmtError.code,
              });
            }
          }
        }
        logger.info('✅ Payment Gateways migration completed');
      } catch (migrationError) {
        logger.error('Error running Payment Gateways migration', {
          error: migrationError.message,
          stack: migrationError.stack,
        });
        // Don't throw - allow server to continue
      }
    } else {
      logger.warn('⚠️ Payment Gateways migration file not found');
    }

    // Run SuperAdmin Translations migration
    logger.info('🌐 Running SuperAdmin Translations migration...');
    const superadminTranslationsMigrationPath = path.join(
      __dirname,
      '../migrations/20241220_superadmin_translations.sql'
    );

    if (fs.existsSync(superadminTranslationsMigrationPath)) {
      try {
        const superadminTranslationsMigration = fs.readFileSync(superadminTranslationsMigrationPath, 'utf8');

        // Remove all comment lines and empty lines
        const cleanedSQL = superadminTranslationsMigration
          .split('\n')
          .filter((line) => {
            const trimmed = line.trim();
            return trimmed.length > 0 && !trimmed.startsWith('--');
          })
          .join('\n');

        // Split by semicolon and filter valid statements
        const statements = cleanedSQL
          .split(';')
          .map((stmt) => stmt.trim())
          .filter((stmt) => {
            const upper = stmt.toUpperCase();
            return stmt.length > 0 && upper.startsWith('INSERT');
          });

        logger.info(`Found ${statements.length} SuperAdmin Translations migration statements`);

        for (const statement of statements) {
          try {
            await connection.execute(statement);
          } catch (stmtError) {
            // Ignore if translation already exists
            if (stmtError.code === 'ER_DUP_ENTRY') {
              logger.info('Translation already exists, skipping...');
            } else {
              logger.warn('SuperAdmin Translations migration statement warning', {
                error: stmtError.message,
                code: stmtError.code,
              });
            }
          }
        }
        logger.info('✅ SuperAdmin Translations migration completed');
      } catch (migrationError) {
        logger.error('Error running SuperAdmin Translations migration', {
          error: migrationError.message,
          stack: migrationError.stack,
        });
        // Don't throw - allow server to continue
      }
    } else {
      logger.warn('⚠️ SuperAdmin Translations migration file not found');
    }

    // Run System Settings migration
    logger.info('⚙️ Running System Settings migration...');
    const systemSettingsMigrationPath = path.join(
      __dirname,
      '../migrations/20241220_system_settings.sql'
    );

    if (fs.existsSync(systemSettingsMigrationPath)) {
      try {
        const systemSettingsMigration = fs.readFileSync(systemSettingsMigrationPath, 'utf8');

        // Remove all comment lines and empty lines
        const cleanedSQL = systemSettingsMigration
          .split('\n')
          .filter((line) => {
            const trimmed = line.trim();
            return trimmed.length > 0 && !trimmed.startsWith('--');
          })
          .join('\n');

        // Split by semicolon and filter valid statements
        const statements = cleanedSQL
          .split(';')
          .map((stmt) => stmt.trim())
          .filter((stmt) => stmt.length > 0);

        logger.info(`Found ${statements.length} System Settings migration statements`);

        for (const statement of statements) {
          try {
            await connection.execute(statement);
          } catch (stmtError) {
            // Ignore if already exists
            if (stmtError.code === 'ER_DUP_ENTRY' || stmtError.code === 'ER_TABLE_EXISTS_ERROR') {
              logger.info('System setting already exists, skipping...');
            } else {
              logger.warn('System Settings migration statement warning', {
                error: stmtError.message,
                code: stmtError.code,
              });
            }
          }
        }
        logger.info('✅ System Settings migration completed');
      } catch (migrationError) {
        logger.error('Error running System Settings migration', {
          error: migrationError.message,
          stack: migrationError.stack,
        });
        // Don't throw - allow server to continue
      }
    } else {
      logger.warn('⚠️ System Settings migration file not found');
    }

    // Create mass_send_history table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mass_send_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        recipients JSON NOT NULL,
        total_recipients INT DEFAULT 0,
        sent_count INT DEFAULT 0,
        failed_count INT DEFAULT 0,
        send_interval INT DEFAULT 70,
        status ENUM('pending', 'sending', 'paused', 'completed', 'cancelled', 'failed') DEFAULT 'pending',
        archived BOOLEAN DEFAULT FALSE,
        created_by INT,
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenant_id),
        INDEX idx_status (status),
        INDEX idx_archived (archived),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ mass_send_history table created/verified');

    // Create mass_send_schedules table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mass_send_schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        recipients JSON NOT NULL,
        total_recipients INT DEFAULT 0,
        sent_count INT DEFAULT 0,
        failed_count INT DEFAULT 0,
        send_interval INT DEFAULT 70,
        scheduled_date TIMESTAMP NOT NULL,
        status ENUM('scheduled', 'sending', 'completed', 'cancelled', 'failed') DEFAULT 'scheduled',
        created_by INT,
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenant_id),
        INDEX idx_status (status),
        INDEX idx_scheduled_date (scheduled_date),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ mass_send_schedules table created/verified');

    // Create mass_send_reminders table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mass_send_reminders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        recipients JSON NOT NULL,
        total_recipients INT DEFAULT 0,
        total_sent INT DEFAULT 0,
        send_interval INT DEFAULT 70,
        final_date DATE NOT NULL,
        reminder_dates JSON NOT NULL,
        next_send_at TIMESTAMP NULL,
        last_sent_at TIMESTAMP NULL,
        status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenant_id),
        INDEX idx_status (status),
        INDEX idx_next_send_at (next_send_at),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ mass_send_reminders table created/verified');

    // Create mass_send_logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mass_send_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        send_type ENUM('history', 'schedule', 'reminder') NOT NULL,
        send_id INT NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        contact_name VARCHAR(255),
        message TEXT,
        status ENUM('pending', 'sending', 'sent', 'success', 'failed') DEFAULT 'pending',
        error_message TEXT,
        sent_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_send_type_id (send_type, send_id),
        INDEX idx_phone (phone_number),
        INDEX idx_status (status),
        INDEX idx_sent_at (sent_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ mass_send_logs table created/verified');

    // Create invoice_clients table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS invoice_clients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        company_name VARCHAR(150),
        tax_id VARCHAR(50),
        address VARCHAR(500),
        city VARCHAR(100),
        state VARCHAR(50),
        zip_code VARCHAR(20),
        country VARCHAR(50) DEFAULT 'Brazil',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_email (tenant_id, email),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_email (email),
        INDEX idx_phone (phone),
        INDEX idx_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ invoice_clients table created/verified');

    // Create invoices table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        invoice_number VARCHAR(50) NOT NULL,
        type ENUM('invoice', 'quote') NOT NULL DEFAULT 'invoice',
        client_id INT NOT NULL,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        currency VARCHAR(3) DEFAULT 'USD',
        subtotal DECIMAL(10,2) DEFAULT 0.00,
        tax_rate DECIMAL(5,2) DEFAULT 0.00,
        tax_amount DECIMAL(10,2) DEFAULT 0.00,
        discount_type ENUM('fixed', 'percentage') DEFAULT 'fixed',
        discount_value DECIMAL(10,2) DEFAULT 0.00,
        discount_amount DECIMAL(10,2) DEFAULT 0.00,
        total_amount DECIMAL(10,2) DEFAULT 0.00,
        status ENUM('draft', 'sent', 'viewed', 'accepted', 'rejected', 'paid', 'cancelled', 'archived') DEFAULT 'draft',
        rejection_reason TEXT,
        payment_method ENUM('paypal', 'pagseguro', 'bank_transfer', 'cash', 'other') DEFAULT 'paypal',
        payment_link VARCHAR(500),
        payment_id VARCHAR(100),
        payment_gateway_response JSON,
        due_date DATE,
        notes TEXT,
        terms TEXT,
        sent_at TIMESTAMP NULL,
        viewed_at TIMESTAMP NULL,
        accepted_at TIMESTAMP NULL,
        rejected_at TIMESTAMP NULL,
        paid_at TIMESTAMP NULL,
        converted_to_invoice_id INT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_invoice (tenant_id, invoice_number),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES invoice_clients(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant (tenant_id),
        INDEX idx_invoice_number (invoice_number),
        INDEX idx_client (client_id),
        INDEX idx_status (status),
        INDEX idx_type (type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ invoices table created/verified');

    // Create invoice_items table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id INT NOT NULL,
        description VARCHAR(255) NOT NULL,
        quantity DECIMAL(10,2) NOT NULL DEFAULT 1.00,
        unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
        INDEX idx_invoice (invoice_id),
        INDEX idx_sort (sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ invoice_items table created/verified');

    // Create invoice_logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS invoice_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_id INT NOT NULL,
        action ENUM('created', 'sent', 'viewed', 'accepted', 'rejected', 'paid', 'cancelled', 'updated', 'payment_created', 'payment_confirmed', 'converted_to_invoice', 'archived', 'reactivated') NOT NULL,
        actor_type ENUM('admin', 'client', 'system') NOT NULL,
        actor_id INT,
        details TEXT,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
        INDEX idx_invoice (invoice_id),
        INDEX idx_action (action),
        INDEX idx_actor_type (actor_type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ invoice_logs table created/verified');

    // Create invoice_access_tokens table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS invoice_access_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        invoice_id INT NOT NULL,
        token VARCHAR(64) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_invoice (invoice_id),
        INDEX idx_token (token),
        INDEX idx_email (email),
        INDEX idx_expires_at (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ invoice_access_tokens table created/verified');

    // Create chat_widgets table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS chat_widgets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        whatsapp_number VARCHAR(20) NOT NULL,
        button_title VARCHAR(50) NOT NULL DEFAULT 'Chat with us',
        button_background_color VARCHAR(7) NOT NULL DEFAULT '#25D366',
        widget_title VARCHAR(100) NOT NULL DEFAULT 'How can we help you?',
        predefined_message TEXT,
        max_message_length INT DEFAULT 500,
        margin_right INT DEFAULT 20,
        margin_bottom INT DEFAULT 20,
        border_radius INT DEFAULT 50,
        widget_token VARCHAR(64) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_token (widget_token),
        INDEX idx_active (is_active),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ chat_widgets table created/verified');

    // Create widget_analytics table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS widget_analytics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        widget_id INT NOT NULL,
        event_type ENUM('loaded', 'opened', 'closed', 'message_sent', 'clicked') NOT NULL,
        event_data JSON,
        ip_address VARCHAR(45),
        user_agent TEXT,
        referrer_url VARCHAR(500),
        page_url VARCHAR(500),
        session_id VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (widget_id) REFERENCES chat_widgets(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_widget (widget_id),
        INDEX idx_event_type (event_type),
        INDEX idx_session (session_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ widget_analytics table created/verified');

    // Create tenant_profiles table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tenant_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL UNIQUE,
        logo_url VARCHAR(500),
        primary_color VARCHAR(7) DEFAULT '#00a149',
        primary_dark VARCHAR(7) DEFAULT '#654321',
        primary_light VARCHAR(7) DEFAULT '#A0522D',
        accent_color VARCHAR(7) DEFAULT '#CD853F',
        text_color VARCHAR(7) DEFAULT '#333333',
        text_light VARCHAR(7) DEFAULT '#666666',
        bg_color VARCHAR(7) DEFAULT '#f5f5f5',
        white VARCHAR(7) DEFAULT '#ffffff',
        success VARCHAR(7) DEFAULT '#28a745',
        warning VARCHAR(7) DEFAULT '#ffc107',
        danger VARCHAR(7) DEFAULT '#dc3545',
        info VARCHAR(7) DEFAULT '#17a2b8',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ tenant_profiles table created/verified');

    // Create WhatsApp Cloud tables
    logger.info('📱 Creating WhatsApp Cloud tables...');

    // Create whatsapp_cloud_conversations table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_conversations (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        account_id INT,
        contact_phone VARCHAR(50) NOT NULL,
        contact_name VARCHAR(255),
        contact_avatar TEXT,
        last_message TEXT,
        last_message_time DATETIME,
        last_message_type ENUM('text', 'image', 'document', 'audio', 'video', 'location', 'contact', 'sticker') DEFAULT 'text',
        source ENUM('whatsapp_cloud', 'whatsapp_web') DEFAULT 'whatsapp_cloud',
        status ENUM('active', 'archived', 'closed') DEFAULT 'active',
        claimed_by_user_id INT,
        claimed_at DATETIME,
        store_id INT,
        department_id INT,
        stage_id VARCHAR(50) DEFAULT 'unassigned',
        priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
        tags JSON,
        notes JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_account_id (account_id),
        INDEX idx_contact_phone (contact_phone),
        INDEX idx_claimed_by (claimed_by_user_id),
        INDEX idx_status (status),
        INDEX idx_stage (stage_id),
        INDEX idx_last_message_time (last_message_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_conversations table created/verified');

    // Create whatsapp_cloud_messages table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_messages (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        conversation_id INT NOT NULL,
        message_id VARCHAR(255),
        content TEXT,
        text_content TEXT,
        direction ENUM('inbound', 'outbound') DEFAULT 'inbound',
        message_type ENUM('text', 'image', 'document', 'audio', 'video', 'location', 'contact', 'sticker', 'product', 'invoice') DEFAULT 'text',
        sender_type ENUM('customer', 'agent', 'system', 'bot') DEFAULT 'customer',
        sender_id INT,
        sent_by_user_id INT,
        media_url TEXT,
        media_filename VARCHAR(255),
        filename VARCHAR(255),
        media_mime_type VARCHAR(100),
        caption TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('sent', 'delivered', 'read', 'failed') DEFAULT 'sent',
        is_internal_note BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES whatsapp_cloud_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_conversation_id (conversation_id),
        INDEX idx_message_id (message_id),
        INDEX idx_sender_type (sender_type),
        INDEX idx_direction (direction),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_messages table created/verified');

    // Add missing columns to whatsapp_cloud_messages if they don't exist
    const [messageColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'whatsapp_cloud_messages'
    `);
    const existingMessageColumns = messageColumns.map(col => col.COLUMN_NAME);

    if (!existingMessageColumns.includes('text_content')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN text_content TEXT NULL`);
        logger.info('✅ Added text_content column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('text_content column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('direction')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN direction ENUM('inbound', 'outbound') DEFAULT 'inbound'`);
        logger.info('✅ Added direction column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('direction column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('sent_by_user_id')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN sent_by_user_id INT NULL`);
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD CONSTRAINT fk_messages_sent_by_user FOREIGN KEY (sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL`);
        logger.info('✅ Added sent_by_user_id column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_DUP_KEYNAME') {
          logger.warn('sent_by_user_id column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('filename')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN filename VARCHAR(255) NULL`);
        logger.info('✅ Added filename column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('filename column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('timestamp')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        logger.info('✅ Added timestamp column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('timestamp column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('tenant_id')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN tenant_id INT NULL`);
        logger.info('✅ Added tenant_id column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('tenant_id column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('account_id')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN account_id INT NULL`);
        logger.info('✅ Added account_id column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('account_id column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('from_phone')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN from_phone VARCHAR(30) NULL`);
        logger.info('✅ Added from_phone column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('from_phone column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('to_phone')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN to_phone VARCHAR(30) NULL`);
        logger.info('✅ Added to_phone column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('to_phone column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('text_body')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN text_body TEXT NULL`);
        logger.info('✅ Added text_body column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('text_body column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('content')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN content TEXT NULL`);
        logger.info('✅ Added content column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('content column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('sender_id')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN sender_id INT NULL`);
        logger.info('✅ Added sender_id column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('sender_id column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('sender_type')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN sender_type ENUM('customer', 'agent', 'system', 'bot') DEFAULT 'customer'`);
        logger.info('✅ Added sender_type column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('sender_type column:', e.message);
        }
      }
    }

    if (!existingMessageColumns.includes('updated_at')) {
      try {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        logger.info('✅ Added updated_at column to whatsapp_cloud_messages');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('updated_at column:', e.message);
        }
      }
    }

    // Create conversation_notes table for robust note tracking
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS conversation_notes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        conversation_id INT NOT NULL,
        contact_phone VARCHAR(50) NOT NULL,
        note_text TEXT NOT NULL,
        note_type ENUM('transfer', 'general', 'system') DEFAULT 'general',
        created_by_user_id INT,
        created_by_name VARCHAR(255),
        transfer_from_department VARCHAR(255),
        transfer_to_department VARCHAR(255),
        transfer_from_store VARCHAR(255),
        transfer_to_store VARCHAR(255),
        is_visible_to_users BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_conversation_id (conversation_id),
        INDEX idx_contact_phone (contact_phone),
        INDEX idx_created_by (created_by_user_id),
        INDEX idx_note_type (note_type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ conversation_notes table created/verified');

    // Add caption column if it doesn't exist (for existing installations)
    try {
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'whatsapp_cloud_messages' 
          AND COLUMN_NAME = 'caption'
      `);
      
      if (columns.length === 0) {
        await connection.execute(`
          ALTER TABLE whatsapp_cloud_messages 
          ADD COLUMN caption TEXT NULL 
          AFTER media_mime_type
        `);
        logger.info('✅ Added caption column to existing whatsapp_cloud_messages table');
      }
      
      // Update message_type enum to include product and invoice types
      await connection.execute(`
        ALTER TABLE whatsapp_cloud_messages 
        MODIFY COLUMN message_type ENUM('text', 'image', 'document', 'audio', 'video', 'location', 'contact', 'sticker', 'product', 'invoice') DEFAULT 'text'
      `);
      logger.info('✅ Updated message_type enum with product and invoice types');
    } catch (alterError) {
      // Log but don't fail - table might already be up to date
      logger.warn('Could not update whatsapp_cloud_messages table structure:', alterError.message);
    }

    // Create pipeline_stages table for tenant-defined stages
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS pipeline_stages (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        stage_key VARCHAR(50) NOT NULL,
        stage_name VARCHAR(100) NOT NULL,
        stage_color VARCHAR(7) DEFAULT '#6b7280',
        stage_icon VARCHAR(50) DEFAULT 'fas fa-circle',
        stage_order INT DEFAULT 0,
        is_default BOOLEAN DEFAULT FALSE,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        UNIQUE KEY unique_tenant_stage (tenant_id, stage_key),
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_stage_order (stage_order),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ pipeline_stages table created/verified');

    // Insert default pipeline stages for all tenants
    try {
      const [tenants] = await connection.execute('SELECT id FROM tenants');
      
      const defaultStages = [
        { key: 'unassigned', name: 'Unassigned', color: '#6b7280', icon: 'fas fa-inbox', order: 0 },
        { key: 'new', name: 'New', color: '#3b82f6', icon: 'fas fa-star', order: 1 },
        { key: 'negotiation', name: 'Negotiation', color: '#f59e0b', icon: 'fas fa-handshake', order: 2 },
        { key: 'won', name: 'Won', color: '#10b981', icon: 'fas fa-trophy', order: 3 },
        { key: 'lost', name: 'Lost', color: '#ef4444', icon: 'fas fa-times-circle', order: 4 }
      ];

      for (const tenant of tenants) {
        for (const stage of defaultStages) {
          await connection.execute(`
            INSERT IGNORE INTO pipeline_stages (tenant_id, stage_key, stage_name, stage_color, stage_icon, stage_order, is_default)
            VALUES (?, ?, ?, ?, ?, ?, TRUE)
          `, [tenant.id, stage.key, stage.name, stage.color, stage.icon, stage.order]);
        }
      }
      
      logger.info('✅ Default pipeline stages inserted for all tenants');
    } catch (stageError) {
      logger.warn('⚠️ Error inserting default pipeline stages', { error: stageError.message });
    }

    logger.info('✅ WhatsApp Cloud tables created successfully');

    // Insert default placeholders for all tenants (if not exists)
    try {
      const [tenants] = await connection.execute('SELECT id FROM tenants');
      
      const defaultPlaceholders = [
        { key: '{{customer_name}}', value: 'Customer Name', description: 'Name of the customer' },
        { key: '{{store_name}}', value: 'Store Name', description: 'Name of the store' },
        { key: '{{business_hours}}', value: 'Business Hours', description: 'Store business hours' },
        { key: '{{store_phone}}', value: 'Store Phone', description: 'Store phone number' },
        { key: '{{store_address}}', value: 'Store Address', description: 'Store address' },
        { key: '{{current_date}}', value: 'Current Date', description: 'Current date' },
        { key: '{{current_time}}', value: 'Current Time', description: 'Current time' }
      ];

      for (const tenant of tenants) {
        for (const placeholder of defaultPlaceholders) {
          await connection.execute(`
            INSERT IGNORE INTO message_placeholders (tenant_id, placeholder_key, placeholder_value, description)
            VALUES (?, ?, ?, ?)
          `, [tenant.id, placeholder.key, placeholder.value, placeholder.description]);
        }
      }
      
      logger.info('✅ Default placeholders inserted for all tenants');
    } catch (placeholderError) {
      logger.warn('⚠️ Error inserting default placeholders', { error: placeholderError.message });
    }

    // Run Notification System migration
    logger.info('📧 Running Notification System migration...');
    const notificationMigrationPath = path.join(
      __dirname,
      '../migrations/20241221_notification_system.sql'
    );

    if (fs.existsSync(notificationMigrationPath)) {
      try {
        const notificationMigration = fs.readFileSync(notificationMigrationPath, 'utf8');

        // Remove all comment lines and empty lines
        const cleanedSQL = notificationMigration
          .split('\n')
          .filter((line) => {
            const trimmed = line.trim();
            return trimmed.length > 0 && !trimmed.startsWith('--');
          })
          .join('\n');

        // Split by semicolon and filter valid statements
        const statements = cleanedSQL
          .split(';')
          .map((stmt) => stmt.trim())
          .filter((stmt) => stmt.length > 0);

        logger.info(`Found ${statements.length} Notification System migration statements`);

        for (const statement of statements) {
          try {
            await connection.execute(statement);
          } catch (stmtError) {
            // Ignore if already exists
            if (stmtError.code === 'ER_DUP_ENTRY' || 
                stmtError.code === 'ER_TABLE_EXISTS_ERROR' ||
                stmtError.code === 'ER_DUP_FIELDNAME') {
              logger.info('Notification item already exists, skipping...');
            } else {
              logger.warn('Notification System migration statement warning', {
                error: stmtError.message,
                code: stmtError.code,
              });
            }
          }
        }
        logger.info('✅ Notification System migration completed');
      } catch (migrationError) {
        logger.error('Error running Notification System migration', {
          error: migrationError.message,
          stack: migrationError.stack,
        });
        // Don't throw - allow server to continue
      }
    } else {
      logger.warn('⚠️ Notification System migration file not found');
    }

    // ============================================
    // Additional Missing Tables for 97 Total
    // ============================================

    // Create conversation_logs table (critical for WhatsApp Cloud)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS conversation_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        tenant_id INT NOT NULL,
        user_id INT,
        action ENUM('claim', 'release', 'transfer', 'note_added', 'status_change') NOT NULL,
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_conversation (conversation_id),
        INDEX idx_tenant (tenant_id),
        INDEX idx_user (user_id),
        INDEX idx_action (action),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ conversation_logs table created/verified');

    // Create conversation_notes table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS conversation_notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        tenant_id INT NOT NULL,
        user_id INT NOT NULL,
        note TEXT NOT NULL,
        is_private BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_conversation (conversation_id),
        INDEX idx_tenant (tenant_id),
        INDEX idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ conversation_notes table created/verified');

    // Create conversation_transfers table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS conversation_transfers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        tenant_id INT NOT NULL,
        from_user_id INT,
        to_user_id INT,
        from_department_id INT,
        to_department_id INT,
        reason TEXT,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_conversation (conversation_id),
        INDEX idx_tenant (tenant_id),
        INDEX idx_from_user (from_user_id),
        INDEX idx_to_user (to_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ conversation_transfers table created/verified');

    // Create system_audit_logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS system_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        user_id INT,
        action VARCHAR(100) NOT NULL,
        table_name VARCHAR(100),
        record_id INT,
        old_values JSON,
        new_values JSON,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_user (user_id),
        INDEX idx_action (action),
        INDEX idx_table (table_name),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ system_audit_logs table created/verified');

    // Create backup_configurations table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS backup_configurations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        backup_type ENUM('full', 'incremental', 'differential') DEFAULT 'full',
        frequency ENUM('daily', 'weekly', 'monthly') DEFAULT 'daily',
        retention_days INT DEFAULT 30,
        storage_path VARCHAR(500),
        encryption_enabled BOOLEAN DEFAULT FALSE,
        compression_enabled BOOLEAN DEFAULT TRUE,
        last_backup_at TIMESTAMP NULL,
        next_backup_at TIMESTAMP NULL,
        status ENUM('active', 'inactive', 'error') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_status (status),
        INDEX idx_next_backup (next_backup_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ backup_configurations table created/verified');

    // Create backup_logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS backup_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        configuration_id INT,
        backup_type VARCHAR(50),
        file_path VARCHAR(500),
        file_size BIGINT,
        status ENUM('started', 'completed', 'failed') DEFAULT 'started',
        error_message TEXT,
        duration_seconds INT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        INDEX idx_tenant (tenant_id),
        INDEX idx_config (configuration_id),
        INDEX idx_status (status),
        INDEX idx_started (started_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ backup_logs table created/verified');

    // Create api_rate_limits table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS api_rate_limits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        endpoint_pattern VARCHAR(255) NOT NULL,
        method ENUM('GET', 'POST', 'PUT', 'DELETE', 'PATCH', '*') DEFAULT '*',
        requests_per_minute INT DEFAULT 60,
        requests_per_hour INT DEFAULT 1000,
        requests_per_day INT DEFAULT 10000,
        burst_limit INT DEFAULT 10,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_endpoint (endpoint_pattern),
        INDEX idx_enabled (enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ api_rate_limits table created/verified');

    // Create api_rate_limit_logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS api_rate_limit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        api_key_id INT,
        endpoint VARCHAR(255),
        method VARCHAR(10),
        ip_address VARCHAR(45),
        requests_count INT DEFAULT 1,
        blocked BOOLEAN DEFAULT FALSE,
        reset_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_api_key (api_key_id),
        INDEX idx_endpoint (endpoint),
        INDEX idx_blocked (blocked),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ api_rate_limit_logs table created/verified');

    // Create cdn_configurations table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS cdn_configurations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        provider ENUM('cloudflare', 'aws', 'azure', 'custom') NOT NULL,
        endpoint_url VARCHAR(500) NOT NULL,
        api_key VARCHAR(255),
        api_secret VARCHAR(255),
        zone_id VARCHAR(255),
        cache_ttl INT DEFAULT 3600,
        compression_enabled BOOLEAN DEFAULT TRUE,
        minification_enabled BOOLEAN DEFAULT TRUE,
        enabled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_provider (provider),
        INDEX idx_enabled (enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ cdn_configurations table created/verified');

    // Create performance_metrics table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        metric_type ENUM('response_time', 'memory_usage', 'cpu_usage', 'disk_usage', 'database_queries') NOT NULL,
        endpoint VARCHAR(255),
        value DECIMAL(10,4) NOT NULL,
        unit VARCHAR(20) DEFAULT 'ms',
        metadata JSON,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_type (metric_type),
        INDEX idx_endpoint (endpoint),
        INDEX idx_recorded (recorded_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ performance_metrics table created/verified');

    // Create cache_configurations table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS cache_configurations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        cache_key VARCHAR(255) NOT NULL,
        cache_type ENUM('redis', 'memcached', 'file', 'database') DEFAULT 'redis',
        ttl_seconds INT DEFAULT 3600,
        compression_enabled BOOLEAN DEFAULT FALSE,
        encryption_enabled BOOLEAN DEFAULT FALSE,
        tags JSON,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_cache_key (cache_key),
        INDEX idx_type (cache_type),
        INDEX idx_enabled (enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ cache_configurations table created/verified');

    // Create security_logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        user_id INT,
        event_type ENUM('login_success', 'login_failed', 'logout', 'password_change', 'permission_denied', 'suspicious_activity') NOT NULL,
        severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
        ip_address VARCHAR(45),
        user_agent TEXT,
        details JSON,
        resolved BOOLEAN DEFAULT FALSE,
        resolved_by INT,
        resolved_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_user (user_id),
        INDEX idx_event_type (event_type),
        INDEX idx_severity (severity),
        INDEX idx_resolved (resolved),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ security_logs table created/verified');

    // Create monitoring_configurations table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS monitoring_configurations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT,
        monitor_name VARCHAR(255) NOT NULL,
        monitor_type ENUM('uptime', 'performance', 'error_rate', 'custom') NOT NULL,
        endpoint_url VARCHAR(500),
        check_interval_minutes INT DEFAULT 5,
        timeout_seconds INT DEFAULT 30,
        expected_status_code INT DEFAULT 200,
        alert_threshold DECIMAL(10,4),
        alert_email VARCHAR(255),
        alert_webhook VARCHAR(500),
        enabled BOOLEAN DEFAULT TRUE,
        last_check_at TIMESTAMP NULL,
        last_status ENUM('up', 'down', 'warning') DEFAULT 'up',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tenant (tenant_id),
        INDEX idx_type (monitor_type),
        INDEX idx_enabled (enabled),
        INDEX idx_last_check (last_check_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ monitoring_configurations table created/verified');

    // Add missing columns to existing tables
    try {
      // Add last_read_at to whatsapp_cloud_messages if missing
      const [cloudMessageColumns] = await connection.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'whatsapp_cloud_messages'
      `);
      const existingCloudMessageColumns = cloudMessageColumns.map(col => col.COLUMN_NAME);

      if (!existingCloudMessageColumns.includes('last_read_at')) {
        await connection.execute(`ALTER TABLE whatsapp_cloud_messages ADD COLUMN last_read_at TIMESTAMP NULL`);
        logger.info('✅ Added last_read_at column to whatsapp_cloud_messages');
      }

      // Add text_content to messages if missing
      const [messageColumns] = await connection.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'messages'
      `);
      const existingMessageColumns = messageColumns.map(col => col.COLUMN_NAME);

      if (!existingMessageColumns.includes('text_content')) {
        await connection.execute(`ALTER TABLE messages ADD COLUMN text_content TEXT NULL`);
        logger.info('✅ Added text_content column to messages');
      }
    } catch (columnError) {
      logger.warn('Error adding missing columns:', columnError.message);
    }

    // Create pipeline_stages table (critical for conversations management)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS pipeline_stages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        stage_key VARCHAR(50) NOT NULL,
        stage_name VARCHAR(100) NOT NULL,
        stage_color VARCHAR(20) DEFAULT '#6b7280',
        stage_icon VARCHAR(50) DEFAULT 'fas fa-circle',
        stage_order INT DEFAULT 0,
        is_default BOOLEAN DEFAULT FALSE,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_stage (tenant_id, stage_key),
        INDEX idx_tenant (tenant_id),
        INDEX idx_order (stage_order),
        INDEX idx_active (active),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ pipeline_stages table created/verified');

    // Insert default pipeline stages for all tenants
    const defaultStages = [
      { key: 'unassigned', name: 'Unassigned', color: '#6b7280', icon: 'fas fa-inbox', order: 1, is_default: true },
      { key: 'new', name: 'New', color: '#3b82f6', icon: 'fas fa-plus-circle', order: 2, is_default: true },
      { key: 'in_progress', name: 'In Progress', color: '#f59e0b', icon: 'fas fa-clock', order: 3, is_default: true },
      { key: 'waiting', name: 'Waiting', color: '#8b5cf6', icon: 'fas fa-pause-circle', order: 4, is_default: true },
      { key: 'resolved', name: 'Resolved', color: '#10b981', icon: 'fas fa-check-circle', order: 5, is_default: true },
      { key: 'closed', name: 'Closed', color: '#ef4444', icon: 'fas fa-times-circle', order: 6, is_default: true }
    ];

    // Get all tenants to insert default stages
    const [tenants] = await connection.execute('SELECT id FROM tenants WHERE id > 0');
    
    for (const tenant of tenants) {
      for (const stage of defaultStages) {
        await connection.execute(`
          INSERT IGNORE INTO pipeline_stages (tenant_id, stage_key, stage_name, stage_color, stage_icon, stage_order, is_default, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
        `, [tenant.id, stage.key, stage.name, stage.color, stage.icon, stage.order, stage.is_default]);
      }
    }
    logger.info('✅ Default pipeline stages created/verified for all tenants');

    for (const stage of defaultStages) {
      await connection.execute(
        `UPDATE pipeline_stages
         SET stage_name = ?, stage_color = ?, stage_icon = ?, stage_order = ?
         WHERE stage_key = ?`,
        [stage.name, stage.color, stage.icon, stage.order, stage.key]
      );
    }
    logger.info('✅ Default pipeline stages updated to English');

    // ============================================
    // WhatsApp Cloud FAQ Tables
    // ============================================
    
    // Create whatsapp_cloud_faqs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_faqs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        account_id INT NULL,
        question VARCHAR(500) NOT NULL,
        answer TEXT NOT NULL,
        keywords TEXT,
        emoji VARCHAR(10),
        category VARCHAR(50) DEFAULT 'general',
        active BOOLEAN DEFAULT TRUE,
        order_position INT DEFAULT 0,
        trigger_type ENUM('keyword', 'menu', 'auto') DEFAULT 'keyword',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_account (account_id),
        INDEX idx_active (active),
        INDEX idx_order (order_position),
        INDEX idx_category (category),
        INDEX idx_trigger_type (trigger_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_faqs table created/verified');

    // Create whatsapp_cloud_faq_usage table (tracks FAQ usage)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_faq_usage (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        faq_id INT NOT NULL,
        conversation_id INT NOT NULL,
        triggered_by ENUM('user', 'auto', 'menu') DEFAULT 'user',
        user_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (faq_id) REFERENCES whatsapp_cloud_faqs(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES whatsapp_cloud_conversations(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_faq (faq_id),
        INDEX idx_conversation (conversation_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_faq_usage table created/verified');

    // Create whatsapp_cloud_faq_settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_faq_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        account_id INT NULL,
        auto_reply_enabled BOOLEAN DEFAULT TRUE,
        menu_enabled BOOLEAN DEFAULT TRUE,
        menu_trigger_keyword VARCHAR(50) DEFAULT 'menu',
        welcome_message TEXT,
        no_match_message TEXT,
        menu_header TEXT,
        menu_footer TEXT,
        similarity_threshold DECIMAL(3,2) DEFAULT 0.70,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_account (tenant_id, account_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant (tenant_id),
        INDEX idx_account (account_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_faq_settings table created/verified');

    // Add missing columns to whatsapp_cloud_faqs table if they don't exist
    const [faqColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'whatsapp_cloud_faqs'
    `);
    const existingFaqColumns = faqColumns.map(col => col.COLUMN_NAME);

    if (!existingFaqColumns.includes('usage_count')) {
      try {
        await connection.execute(`
          ALTER TABLE whatsapp_cloud_faqs 
          ADD COLUMN usage_count INT DEFAULT 0 AFTER order_position,
          ADD COLUMN last_used_at TIMESTAMP NULL AFTER usage_count
        `);
        logger.info('✅ Added usage tracking columns to whatsapp_cloud_faqs table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('FAQ usage columns:', e.message);
        }
      }
    }

    // Add indexes for better performance
    try {
      await connection.execute(`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_cloud_faqs_keywords ON whatsapp_cloud_faqs(keywords(100))
      `);
      await connection.execute(`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_cloud_faqs_usage ON whatsapp_cloud_faqs(usage_count DESC)
      `);
      logger.info('✅ Added performance indexes to whatsapp_cloud_faqs table');
    } catch (e) {
      logger.warn('FAQ indexes:', e.message);
    }

    // Create enhanced FAQ system tables for intelligent processing
    
    // Table for tracking failed searches (for learning purposes)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_faq_failed_searches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        account_id INT NULL,
        conversation_id INT NULL,
        query TEXT NOT NULL,
        intent VARCHAR(50) NULL,
        search_count INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_tenant_query (tenant_id, query(100)),
        INDEX idx_account_intent (account_id, intent),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_faq_failed_searches table created/verified');

    // Table for FAQ performance metrics (for machine learning)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_faq_metrics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        faq_id INT NOT NULL,
        total_uses INT DEFAULT 0,
        successful_uses INT DEFAULT 0,
        avg_confidence DECIMAL(4,3) DEFAULT 0.000,
        last_used_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_faq (tenant_id, faq_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (faq_id) REFERENCES whatsapp_cloud_faqs(id) ON DELETE CASCADE,
        INDEX idx_performance (successful_uses, total_uses),
        INDEX idx_confidence (avg_confidence)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_faq_metrics table created/verified');

    // Table for user feedback on FAQ responses
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_faq_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        faq_id INT NOT NULL,
        conversation_id INT NULL,
        user_phone VARCHAR(20) NULL,
        rating TINYINT(1) NULL COMMENT '1=helpful, 0=not helpful',
        feedback_text TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (faq_id) REFERENCES whatsapp_cloud_faqs(id) ON DELETE CASCADE,
        INDEX idx_tenant_faq (tenant_id, faq_id),
        INDEX idx_rating (rating),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_faq_feedback table created/verified');

    // Table for conversation context tracking
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_conversation_context (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        conversation_id INT NOT NULL,
        user_phone VARCHAR(20) NOT NULL,
        preferred_category VARCHAR(50) NULL,
        interaction_count INT DEFAULT 0,
        last_intent VARCHAR(50) NULL,
        context_data JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_tenant_conversation (tenant_id, conversation_id),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX idx_user_phone (user_phone),
        INDEX idx_category (preferred_category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_conversation_context table created/verified');

    // Add enhanced columns to existing FAQ usage table
    const [usageColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'whatsapp_cloud_faq_usage'
    `);
    const existingUsageColumns = usageColumns.map(col => col.COLUMN_NAME);

    if (!existingUsageColumns.includes('confidence_score')) {
      try {
        await connection.execute(`
          ALTER TABLE whatsapp_cloud_faq_usage 
          ADD COLUMN confidence_score DECIMAL(4,3) NULL AFTER user_message,
          ADD COLUMN intent VARCHAR(50) NULL AFTER confidence_score,
          ADD COLUMN algorithm_used VARCHAR(50) NULL AFTER intent,
          ADD COLUMN context_data JSON NULL AFTER algorithm_used
        `);
        logger.info('✅ Added enhanced tracking columns to whatsapp_cloud_faq_usage table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('FAQ usage enhanced columns:', e.message);
        }
      }
    }

    // Add enhanced columns to FAQ settings table
    const [settingsColumns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'whatsapp_cloud_faq_settings'
    `);
    const existingSettingsColumns = settingsColumns.map(col => col.COLUMN_NAME);

    if (!existingSettingsColumns.includes('learning_enabled')) {
      try {
        await connection.execute(`
          ALTER TABLE whatsapp_cloud_faq_settings
          ADD COLUMN learning_enabled BOOLEAN DEFAULT TRUE AFTER similarity_threshold,
          ADD COLUMN context_awareness BOOLEAN DEFAULT TRUE AFTER learning_enabled,
          ADD COLUMN feedback_collection BOOLEAN DEFAULT TRUE AFTER context_awareness,
          ADD COLUMN suggestion_threshold DECIMAL(4,3) DEFAULT 0.500 AFTER feedback_collection,
          ADD COLUMN max_suggestions TINYINT(2) DEFAULT 3 AFTER suggestion_threshold
        `);
        logger.info('✅ Added enhanced settings columns to whatsapp_cloud_faq_settings table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('FAQ settings enhanced columns:', e.message);
        }
      }
    }

    // Add performance tracking columns to main FAQ table
    if (!existingFaqColumns.includes('performance_score')) {
      try {
        await connection.execute(`
          ALTER TABLE whatsapp_cloud_faqs
          ADD COLUMN performance_score DECIMAL(4,3) DEFAULT 0.000 AFTER usage_count,
          ADD COLUMN avg_confidence DECIMAL(4,3) DEFAULT 0.000 AFTER performance_score,
          ADD COLUMN success_rate DECIMAL(4,3) DEFAULT 0.000 AFTER avg_confidence
        `);
        logger.info('✅ Added performance tracking columns to whatsapp_cloud_faqs table');
      } catch (e) {
        if (e.code !== 'ER_DUP_FIELDNAME') {
          logger.warn('FAQ performance columns:', e.message);
        }
      }
    }

    // Add performance indexes
    try {
      await connection.execute(`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_cloud_faqs_performance ON whatsapp_cloud_faqs(performance_score)
      `);
      await connection.execute(`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_cloud_faqs_success_rate ON whatsapp_cloud_faqs(success_rate)
      `);
      await connection.execute(`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_cloud_faq_usage_confidence ON whatsapp_cloud_faq_usage(confidence_score)
      `);
      await connection.execute(`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_cloud_faq_usage_intent ON whatsapp_cloud_faq_usage(intent)
      `);
      await connection.execute(`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_cloud_faq_usage_algorithm ON whatsapp_cloud_faq_usage(algorithm_used)
      `);
      logger.info('✅ Added enhanced performance indexes');
    } catch (e) {
      logger.warn('Enhanced FAQ indexes:', e.message);
    }

    // Create analytics view for FAQ performance
    try {
      await connection.execute(`
        CREATE OR REPLACE VIEW whatsapp_cloud_faq_analytics AS
        SELECT 
            f.id,
            f.tenant_id,
            f.account_id,
            f.question,
            f.category,
            f.active,
            f.usage_count,
            f.performance_score,
            f.avg_confidence,
            f.success_rate,
            f.last_used_at,
            COALESCE(m.total_uses, 0) as metric_total_uses,
            COALESCE(m.successful_uses, 0) as metric_successful_uses,
            COALESCE(fb.helpful_count, 0) as helpful_feedback,
            COALESCE(fb.unhelpful_count, 0) as unhelpful_feedback,
            COALESCE(fb.avg_rating, 0) as avg_user_rating
        FROM whatsapp_cloud_faqs f
        LEFT JOIN whatsapp_cloud_faq_metrics m ON f.id = m.faq_id AND f.tenant_id = m.tenant_id
        LEFT JOIN (
            SELECT 
                faq_id,
                tenant_id,
                SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as helpful_count,
                SUM(CASE WHEN rating = 0 THEN 1 ELSE 0 END) as unhelpful_count,
                AVG(rating) as avg_rating
            FROM whatsapp_cloud_faq_feedback 
            GROUP BY faq_id, tenant_id
        ) fb ON f.id = fb.faq_id AND f.tenant_id = fb.tenant_id
      `);
      logger.info('✅ Created whatsapp_cloud_faq_analytics view');
    } catch (e) {
      logger.warn('FAQ analytics view:', e.message);
    }

    // Insert default enhanced settings for existing tenants without settings
    try {
      await connection.execute(`
        INSERT IGNORE INTO whatsapp_cloud_faq_settings 
        (tenant_id, account_id, auto_reply_enabled, menu_enabled, menu_trigger_keyword, 
         welcome_message, no_match_message, menu_header, menu_footer, similarity_threshold,
         learning_enabled, context_awareness, feedback_collection, suggestion_threshold, max_suggestions)
        SELECT DISTINCT 
            tenant_id, 
            NULL as account_id,
            TRUE as auto_reply_enabled,
            TRUE as menu_enabled,
            'menu' as menu_trigger_keyword,
            'Hello! 👋 How can I help you today?\\n\\nType "menu" to see available options.' as welcome_message,
            'I\\'m sorry, I couldn\\'t find an answer to your question. 🤔\\n\\nPlease contact our support team for assistance, or type "menu" to see available options.' as no_match_message,
            '📋 *Available Options*\\n\\nPlease select an option by typing the corresponding number:' as menu_header,
            '\\n💬 You can also ask me any question directly!' as menu_footer,
            0.70 as similarity_threshold,
            TRUE as learning_enabled,
            TRUE as context_awareness,
            TRUE as feedback_collection,
            0.50 as suggestion_threshold,
            3 as max_suggestions
        FROM whatsapp_cloud_faqs 
        WHERE tenant_id NOT IN (SELECT tenant_id FROM whatsapp_cloud_faq_settings WHERE account_id IS NULL)
      `);
      logger.info('✅ Inserted default enhanced FAQ settings for existing tenants');
    } catch (e) {
      logger.warn('Default FAQ settings:', e.message);
    }

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_flows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        flow_id VARCHAR(64) NOT NULL,
        tenant_id INT NOT NULL,
        account_id VARCHAR(64),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        active BOOLEAN DEFAULT FALSE,
        trigger_type VARCHAR(50),
        trigger_value VARCHAR(255),
        nodes JSON,
        connections JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_flow (tenant_id, flow_id),
        INDEX idx_tenant (tenant_id),
        INDEX idx_account (account_id),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_flows table created/verified');

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_flow_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        account_id VARCHAR(64),
        contact_phone VARCHAR(30) NOT NULL,
        flow_id VARCHAR(64) NOT NULL,
        current_node_id VARCHAR(64),
        waiting_node_id VARCHAR(64),
        waiting_type VARCHAR(32),
        variables JSON,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_session (tenant_id, account_id, contact_phone, flow_id),
        INDEX idx_contact (contact_phone),
        INDEX idx_flow (flow_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    logger.info('✅ whatsapp_cloud_flow_sessions table created/verified');

    logger.info('✅ Database initialization completed successfully');
    connection.release();
  } catch (error) {
    if (connection) connection.release();
    logger.error('❌ Database initialization failed', { error: error.message });
    throw error;
  }
}

module.exports = {
  pool,
  initDatabase,
  testConnection
};
