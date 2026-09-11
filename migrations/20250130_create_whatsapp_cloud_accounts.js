/**
 * Migration: Create WhatsApp Cloud Accounts Table
 * Date: 2025-01-30
 * Description: Creates table to store WhatsApp Cloud API accounts connected via Facebook Embedded Signup
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

async function up() {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    logger.info('Creating whatsapp_cloud_accounts table...');

    // Create whatsapp_cloud_accounts table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_accounts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        account_name VARCHAR(255) DEFAULT 'WhatsApp Business Account',
        waba_id VARCHAR(255) NOT NULL,
        phone_number_id VARCHAR(255) NOT NULL,
        phone_number VARCHAR(50),
        verified_name VARCHAR(255),
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_expires_at DATETIME,
        app_id VARCHAR(255),
        app_secret VARCHAR(255),
        status ENUM('connected', 'pending', 'disconnected', 'expired') DEFAULT 'connected',
        is_default BOOLEAN DEFAULT FALSE,
        webhook_verified BOOLEAN DEFAULT FALSE,
        verify_token VARCHAR(255) NULL,
        quality_rating VARCHAR(50),
        last_sync_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        UNIQUE KEY unique_waba_tenant (waba_id, tenant_id),
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_status (status),
        INDEX idx_is_default (is_default)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('whatsapp_cloud_accounts table created successfully');

    await connection.commit();
    logger.info('Migration completed successfully');
  } catch (error) {
    await connection.rollback();
    logger.error('Migration failed', { error: error.message });
    throw error;
  } finally {
    connection.release();
  }
}

async function down() {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    logger.info('Dropping whatsapp_cloud_accounts table...');

    await connection.execute('DROP TABLE IF EXISTS whatsapp_cloud_accounts');

    logger.info('whatsapp_cloud_accounts table dropped successfully');

    await connection.commit();
    logger.info('Rollback completed successfully');
  } catch (error) {
    await connection.rollback();
    logger.error('Rollback failed', { error: error.message });
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { up, down };
