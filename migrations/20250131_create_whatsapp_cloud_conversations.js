/**
 * Migration: Create WhatsApp Cloud Conversations Table
 * Date: 2025-01-31
 * Description: Creates table to store WhatsApp Cloud conversations and messages
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

async function up() {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    logger.info('Creating whatsapp_cloud_conversations table...');

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
        FOREIGN KEY (account_id) REFERENCES whatsapp_cloud_accounts(id) ON DELETE SET NULL,
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

    logger.info('Creating whatsapp_cloud_messages table...');

    // Create whatsapp_cloud_messages table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_messages (
        id INT PRIMARY KEY AUTO_INCREMENT,
        tenant_id INT NOT NULL,
        conversation_id INT NOT NULL,
        message_id VARCHAR(255),
        content TEXT,
        message_type ENUM('text', 'image', 'document', 'audio', 'video', 'location', 'contact', 'sticker') DEFAULT 'text',
        sender_type ENUM('customer', 'agent', 'system', 'bot') DEFAULT 'customer',
        sender_id INT,
        media_url TEXT,
        media_filename VARCHAR(255),
        media_mime_type VARCHAR(100),
        status ENUM('sent', 'delivered', 'read', 'failed') DEFAULT 'sent',
        is_internal_note BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        FOREIGN KEY (conversation_id) REFERENCES whatsapp_cloud_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_tenant_id (tenant_id),
        INDEX idx_conversation_id (conversation_id),
        INDEX idx_message_id (message_id),
        INDEX idx_sender_type (sender_type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    logger.info('WhatsApp Cloud tables created successfully');

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

    logger.info('Dropping WhatsApp Cloud tables...');

    await connection.execute('DROP TABLE IF EXISTS whatsapp_cloud_messages');
    await connection.execute('DROP TABLE IF EXISTS whatsapp_cloud_conversations');

    logger.info('WhatsApp Cloud tables dropped successfully');

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