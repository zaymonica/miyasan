/**
 * Migration: Create whatsapp_cloud_templates table
 * Stores message templates synced from Meta
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

async function up() {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

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

    await connection.commit();
    logger.info('✅ Migration completed: whatsapp_cloud_templates table created');
  } catch (error) {
    await connection.rollback();
    logger.error('❌ Migration failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

async function down() {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    await connection.execute('DROP TABLE IF EXISTS whatsapp_cloud_templates');
    await connection.commit();
    logger.info('✅ Rollback completed: whatsapp_cloud_templates table dropped');
  } catch (error) {
    await connection.rollback();
    logger.error('❌ Rollback failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { up, down };
