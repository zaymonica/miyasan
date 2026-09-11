-- Migration: Create system_addons table
-- Description: Table to store system add-ons/plugins information

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Example addon.json structure for reference:
-- {
--   "slug": "my-addon",
--   "name": "My Addon",
--   "description": "Description of the addon",
--   "version": "1.0.0",
--   "author": "Author Name",
--   "icon": "puzzle-piece",
--   "config": {
--     "settings": {}
--   }
-- }
