-- Bio Link Tables Migration
-- Run this manually if tables are not created automatically

-- Create biolink_projects table
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create biolink_pages table (for biopage type projects)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create biolink_blocks table
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create biolink_analytics table
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add biolink columns to subscription_plans if not exist
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS biolink_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_bio_pages INT DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_short_links INT DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_file_transfers INT DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_vcards INT DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_event_links INT DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_html_pages INT DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_qr_codes INT DEFAULT 0;
