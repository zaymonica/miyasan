/**
 * WooCommerce Controller
 * 
 * Handles WooCommerce integration, product sync, and settings
 */

const BaseController = require('./BaseController');
const { asyncHandler } = require('../middleware/errorHandler');
const axios = require('axios');
const crypto = require('crypto');

class WooCommerceController extends BaseController {
  /**
   * Get WooCommerce settings
   * GET /api/tenant/woocommerce/settings
   */
  static getSettings = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const connection = await BaseController.getConnection();

    try {
      const [settings] = await connection.execute(
        'SELECT id, store_url, consumer_key, consumer_secret, is_active, last_sync, created_at, updated_at FROM woocommerce_settings WHERE tenant_id = ? AND is_active = TRUE LIMIT 1',
        [tenantId]
      );

      if (settings.length === 0) {
        return BaseController.sendSuccess(res, { configured: false });
      }

      console.log('[WooCommerce Get] Retrieved store_url:', settings[0].store_url);
      console.log('[WooCommerce Get] URL char codes:', Array.from(settings[0].store_url).map(c => `${c}(${c.charCodeAt(0)})`).join(' '));

      // Return settings with consumer_secret masked for security
      const settingsData = {
        ...settings[0],
        consumer_secret: settings[0].consumer_secret // Keep full secret for editing
      };

      return BaseController.sendSuccess(res, {
        configured: true,
        settings: settingsData
      });
    } finally {
      connection.release();
    }
  });

  /**
   * Save WooCommerce settings
   * POST /api/tenant/woocommerce/settings
   */
  static saveSettings = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    let { store_url, consumer_key, consumer_secret } = req.body;

    console.log('[WooCommerce Save] Tenant ID:', tenantId);
    console.log('[WooCommerce Save] Received store_url:', store_url);
    console.log('[WooCommerce Save] URL char codes:', Array.from(store_url).map(c => `${c}(${c.charCodeAt(0)})`).join(' '));

    if (!store_url || !consumer_key || !consumer_secret) {
      return BaseController.sendError(res, 'Store URL, Consumer Key, and Consumer Secret are required', 400);
    }

    // Decode HTML entities that might come from frontend
    const originalUrl = store_url;
    store_url = WooCommerceController.decodeHtmlEntities(store_url).trim();
    consumer_key = consumer_key.trim();
    consumer_secret = consumer_secret.trim();

    console.log('[WooCommerce Save] Original URL:', originalUrl);
    console.log('[WooCommerce Save] After decode:', store_url);
    console.log('[WooCommerce Save] URL changed:', originalUrl !== store_url);

    // Validate URL format
    try {
      new URL(store_url);
    } catch (error) {
      return BaseController.sendError(res, 'Invalid store URL format', 400);
    }

    const connection = await BaseController.getConnection();

    try {
      // Test connection first
      const testResult = await WooCommerceController.testConnection(store_url, consumer_key, consumer_secret);
      
      if (!testResult.success) {
        return BaseController.sendError(res, `Connection test failed: ${testResult.error}`, 400);
      }

      // Deactivate existing settings for this tenant
      await connection.execute('UPDATE woocommerce_settings SET is_active = FALSE WHERE tenant_id = ?', [tenantId]);

      // Insert new settings with tenant_id
      await connection.execute(
        'INSERT INTO woocommerce_settings (tenant_id, store_url, consumer_key, consumer_secret, is_active) VALUES (?, ?, ?, ?, TRUE)',
        [tenantId, store_url, consumer_key, consumer_secret]
      );

      return BaseController.sendSuccess(res, { 
        message: 'WooCommerce settings saved successfully',
        connection_test: testResult
      });
    } finally {
      connection.release();
    }
  });

  /**
   * Test WooCommerce connection
   * POST /api/woocommerce/test-connection
   */
  static testConnectionEndpoint = asyncHandler(async (req, res) => {
    let { store_url, consumer_key, consumer_secret } = req.body;

    console.log('[WooCommerce Test] Raw request body:', JSON.stringify(req.body));
    console.log('[WooCommerce Test] Store URL received:', store_url);
    console.log('[WooCommerce Test] Store URL length:', store_url?.length);
    console.log('[WooCommerce Test] Store URL char codes:', store_url?.split('').map(c => `${c}(${c.charCodeAt(0)})`).join(' '));

    if (!store_url || !consumer_key || !consumer_secret) {
      return BaseController.sendError(res, 'Store URL, Consumer Key, and Consumer Secret are required', 400);
    }

    // Decode HTML entities
    const originalUrl = store_url;
    store_url = WooCommerceController.decodeHtmlEntities(store_url).trim();
    consumer_key = consumer_key.trim();
    consumer_secret = consumer_secret.trim();

    console.log(`[WooCommerce Test] Original URL: "${originalUrl}"`);
    console.log(`[WooCommerce Test] After decode: "${store_url}"`);
    console.log(`[WooCommerce Test] URL changed:`, originalUrl !== store_url);

    const result = await WooCommerceController.testConnection(store_url, consumer_key, consumer_secret);

    if (result.success) {
      return BaseController.sendSuccess(res, result);
    } else {
      return BaseController.sendError(res, result.error, 400);
    }
  });

  /**
   * Helper: Test WooCommerce connection
   */
  static async testConnection(store_url, consumer_key, consumer_secret) {
    // Sanitize and validate URL - declare outside try-catch for error handling
    let cleanUrl = store_url.trim().replace(/\/+$/, '');
    
    try {
      console.log(`[WooCommerce] Received store_url: "${store_url}"`);
      console.log(`[WooCommerce] URL length: ${store_url.length}`);
      console.log(`[WooCommerce] URL charCodes:`, Array.from(store_url).map(c => `${c}(${c.charCodeAt(0)})`).join(' '));
      
      // Check for HTML entities in URL (these should not be present in a valid URL)
      if (cleanUrl.includes('&amp;') || cleanUrl.includes('&lt;') || cleanUrl.includes('&gt;') || cleanUrl.includes('&quot;')) {
        console.error(`[WooCommerce] URL contains HTML entities: "${cleanUrl}"`);
        return {
          success: false,
          error: `Invalid URL: contains HTML entities. Please enter a clean URL like: https://yourstore.com`
        };
      }
      
      // Check for standalone & character (should not be in domain)
      const urlParts = cleanUrl.split('//');
      if (urlParts.length > 1) {
        const domainPart = urlParts[1].split('/')[0];
        if (domainPart.includes('&')) {
          console.error(`[WooCommerce] Domain contains & character: "${domainPart}"`);
          return {
            success: false,
            error: `Invalid domain: "${domainPart}". Domain should not contain & character.`
          };
        }
      }
      
      console.log(`[WooCommerce] After sanitization: "${cleanUrl}"`);
      
      // Validate URL format
      try {
        const urlObj = new URL(cleanUrl);
        if (!urlObj.protocol.startsWith('http')) {
          throw new Error('Invalid protocol');
        }
        console.log(`[WooCommerce] URL parsed successfully - hostname: ${urlObj.hostname}`);
      } catch (urlError) {
        console.error(`[WooCommerce] URL parsing failed:`, urlError);
        return {
          success: false,
          error: `Invalid URL format: "${cleanUrl}". Please use format: https://yourstore.com`
        };
      }
      
      // Step 1: Check if WordPress REST API is accessible
      console.log(`[WooCommerce] Step 1: Testing WordPress REST API...`);
      const wpApiUrl = `${cleanUrl}/wp-json`;
      
      try {
        const wpResponse = await axios.get(wpApiUrl, {
          timeout: 10000,
          validateStatus: function (status) {
            return status < 500;
          }
        });
        
        if (wpResponse.status === 404) {
          return {
            success: false,
            error: 'WordPress REST API not found. Please check: 1) Your Store URL is correct, 2) WordPress permalinks are enabled (not using "Plain" permalinks), 3) .htaccess file is configured correctly.'
          };
        }
        
        console.log(`[WooCommerce] WordPress REST API accessible (Status: ${wpResponse.status})`);
      } catch (wpError) {
        console.error(`[WooCommerce] WordPress REST API check failed:`, wpError.message);
        return {
          success: false,
          error: `Cannot access WordPress REST API at ${cleanUrl}. Error: ${wpError.message}`
        };
      }
      
      // Step 2: Check if WooCommerce REST API is accessible
      console.log(`[WooCommerce] Step 2: Testing WooCommerce REST API...`);
      const wcApiUrl = `${cleanUrl}/wp-json/wc/v3`;
      
      try {
        const wcCheckResponse = await axios.get(wcApiUrl, {
          timeout: 10000,
          validateStatus: function (status) {
            return status < 500;
          }
        });
        
        if (wcCheckResponse.status === 404) {
          return {
            success: false,
            error: 'WooCommerce REST API not found. Make sure WooCommerce is installed and activated. Go to WordPress Admin > Plugins and verify WooCommerce is active.'
          };
        }
        
        console.log(`[WooCommerce] WooCommerce REST API accessible (Status: ${wcCheckResponse.status})`);
      } catch (wcError) {
        console.error(`[WooCommerce] WooCommerce REST API check failed:`, wcError.message);
        if (wcError.response?.status === 404) {
          return {
            success: false,
            error: 'WooCommerce REST API not found. Make sure WooCommerce is installed and activated.'
          };
        }
      }
      
      // Step 3: Test authentication with system_status endpoint
      console.log(`[WooCommerce] Step 3: Testing authentication...`);
      const url = `${cleanUrl}/wp-json/wc/v3/system_status`;
      
      const response = await axios.get(url, {
        auth: {
          username: consumer_key,
          password: consumer_secret
        },
        timeout: 10000,
        validateStatus: function (status) {
          return status < 500;
        }
      });

      if (response.status === 401) {
        return {
          success: false,
          error: 'Authentication failed. Please verify: 1) Consumer Key and Consumer Secret are correct, 2) The keys have "Read/Write" permissions, 3) The keys are not expired. Generate new keys in WooCommerce > Settings > Advanced > REST API.'
        };
      }

      if (response.status === 403) {
        return {
          success: false,
          error: 'Access forbidden. Your API keys may not have sufficient permissions. Please ensure the keys have "Read/Write" access.'
        };
      }

      if (response.status === 404) {
        return {
          success: false,
          error: 'WooCommerce REST API endpoint not found. Please verify WooCommerce is properly installed and the REST API is enabled in WooCommerce > Settings > Advanced > REST API.'
        };
      }

      if (response.status >= 400) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`
        };
      }

      console.log('[WooCommerce] Connection successful');
      console.log('[WooCommerce] Response data:', JSON.stringify(response.data).substring(0, 500));

      // Check if response has the expected structure
      if (!response.data) {
        return {
          success: false,
          error: 'Invalid response from WooCommerce API: No data received'
        };
      }

      return {
        success: true,
        message: 'Connection successful',
        store_info: {
          version: response.data?.environment?.version || response.data?.version || 'Unknown',
          wp_version: response.data?.environment?.wp_version || response.data?.wp_version || 'Unknown'
        }
      };
    } catch (error) {
      console.error('[WooCommerce] Connection error:', error);
      console.error('[WooCommerce] Error code:', error.code);
      console.error('[WooCommerce] Error hostname:', error.hostname);
      console.error('[WooCommerce] Attempted URL:', cleanUrl);
      
      let errorMessage = 'Connection failed';
      
      if (error.code === 'ENOTFOUND') {
        const hostname = error.hostname || cleanUrl || 'unknown';
        errorMessage = `Domain not found: ${hostname}. Please verify the Store URL is correct and accessible.`;
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused. The server is not responding. Please check if your website is online.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Connection timeout. The server took too long to respond. Please try again.';
      } else if (error.code === 'CERT_HAS_EXPIRED') {
        errorMessage = 'SSL certificate has expired. Please renew your SSL certificate.';
      } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        errorMessage = 'SSL certificate verification failed. Your SSL certificate may be invalid or self-signed.';
      } else if (error.response) {
        if (error.response.status === 404) {
          errorMessage = 'WooCommerce REST API not found. Make sure WooCommerce is installed and activated.';
        } else {
          errorMessage = error.response.data?.message || `HTTP ${error.response.status}: ${error.response.statusText}`;
        }
      } else {
        errorMessage = error.message || 'Unknown error occurred';
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Sync products from WooCommerce
   * POST /api/tenant/woocommerce/sync-products
   */
  static syncProducts = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const connection = await BaseController.getConnection();

    try {
      // Get active settings for this tenant
      const [settings] = await connection.execute(
        'SELECT store_url, consumer_key, consumer_secret FROM woocommerce_settings WHERE tenant_id = ? AND is_active = TRUE LIMIT 1',
        [tenantId]
      );

      if (settings.length === 0) {
        return BaseController.sendError(res, 'WooCommerce not configured', 400);
      }

      const { store_url, consumer_key, consumer_secret } = settings[0];

      // Fetch products from WooCommerce
      const products = await WooCommerceController.fetchAllProducts(store_url, consumer_key, consumer_secret);

      if (products.length === 0) {
        return BaseController.sendSuccess(res, { 
          message: 'No products found',
          synced: 0
        });
      }

      // Sync products to database
      let synced = 0;
      for (const product of products) {
        const placeholderKey = `product_${product.id}`;
        
        await connection.execute(`
          INSERT INTO woocommerce_products (
            tenant_id, wc_product_id, name, slug, permalink, description, short_description,
            sku, price, regular_price, sale_price, stock_quantity, stock_status,
            image_url, thumbnail_url, categories, tags, attributes, placeholder_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            slug = VALUES(slug),
            permalink = VALUES(permalink),
            description = VALUES(description),
            short_description = VALUES(short_description),
            sku = VALUES(sku),
            price = VALUES(price),
            regular_price = VALUES(regular_price),
            sale_price = VALUES(sale_price),
            stock_quantity = VALUES(stock_quantity),
            stock_status = VALUES(stock_status),
            image_url = VALUES(image_url),
            thumbnail_url = VALUES(thumbnail_url),
            categories = VALUES(categories),
            tags = VALUES(tags),
            attributes = VALUES(attributes),
            updated_at = CURRENT_TIMESTAMP
        `, [
          tenantId,
          product.id,
          product.name,
          product.slug,
          product.permalink,
          product.description || '',
          product.short_description || '',
          product.sku || '',
          parseFloat(product.price) || 0,
          parseFloat(product.regular_price) || 0,
          parseFloat(product.sale_price) || 0,
          product.stock_quantity || 0,
          product.stock_status || 'instock',
          product.images?.[0]?.src || '',
          product.images?.[0]?.src || '',
          JSON.stringify(product.categories || []),
          JSON.stringify(product.tags || []),
          JSON.stringify(product.attributes || []),
          placeholderKey
        ]);

        synced++;
      }

      // Update last sync time for this tenant
      await connection.execute(
        'UPDATE woocommerce_settings SET last_sync = NOW() WHERE tenant_id = ? AND is_active = TRUE',
        [tenantId]
      );

      return BaseController.sendSuccess(res, {
        message: 'Products synced successfully',
        synced,
        total: products.length
      });
    } finally {
      connection.release();
    }
  });

  /**
   * Helper: Fetch all products from WooCommerce (with pagination)
   */
  static async fetchAllProducts(store_url, consumer_key, consumer_secret) {
    const products = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const url = `${store_url.replace(/\/$/, '')}/wp-json/wc/v3/products`;
        
        const response = await axios.get(url, {
          auth: {
            username: consumer_key,
            password: consumer_secret
          },
          params: {
            per_page: 100,
            page,
            status: 'publish'
          },
          timeout: 30000
        });

        products.push(...response.data);

        // Check if there are more pages
        const totalPages = parseInt(response.headers['x-wp-totalpages'] || '1');
        hasMore = page < totalPages;
        page++;
      } catch (error) {
        if (error.response?.status === 400 && page > 1) {
          // No more pages
          hasMore = false;
        } else {
          throw error;
        }
      }
    }

    return products;
  }

  /**
   * Get all products
   * GET /api/tenant/woocommerce/products
   */
  static getProducts = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const connection = await BaseController.getConnection();

    try {
      const [products] = await connection.execute(`
        SELECT 
          id, wc_product_id, name, sku, price, regular_price, sale_price,
          stock_quantity, stock_status, thumbnail_url, image_url, permalink,
          placeholder_key, is_active, updated_at
        FROM woocommerce_products
        WHERE tenant_id = ? AND is_active = TRUE
        ORDER BY name ASC
      `, [tenantId]);

      // Format products with images array for frontend compatibility
      const formattedProducts = products.map(p => ({
        ...p,
        images: p.thumbnail_url || p.image_url ? [{ src: p.thumbnail_url || p.image_url }] : []
      }));

      return BaseController.sendSuccess(res, formattedProducts);
    } finally {
      connection.release();
    }
  });

  /**
   * Get single product
   * GET /api/tenant/woocommerce/products/:id
   */
  static getProduct = asyncHandler(async (req, res) => {
    const tenantId = req.user.tenantId;
    const { id } = req.params;
    const connection = await BaseController.getConnection();

    try {
      const [products] = await connection.execute(
        'SELECT * FROM woocommerce_products WHERE id = ? AND tenant_id = ? AND is_active = TRUE',
        [id, tenantId]
      );

      if (products.length === 0) {
        return BaseController.sendError(res, 'Product not found', 404);
      }

      return BaseController.sendSuccess(res, products[0]);
    } finally {
      connection.release();
    }
  });

  /**
   * Delete WooCommerce settings
   * DELETE /api/woocommerce/settings
   */
  static deleteSettings = asyncHandler(async (req, res) => {
    const connection = await BaseController.getConnection();

    try {
      await connection.execute('UPDATE woocommerce_settings SET is_active = FALSE');
      
      return BaseController.sendSuccess(res, { 
        message: 'WooCommerce settings deleted successfully'
      });
    } finally {
      connection.release();
    }
  });

  /**
   * Helper: Decode HTML entities
   */
  static decodeHtmlEntities(text) {
    if (!text) return text;
    
    // First pass: decode common named entities
    let decoded = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#x60;/g, '`')
      .replace(/&#x3D;/g, '=');
    
    // Second pass: decode numeric entities (&#123; or &#xAB;)
    decoded = decoded.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
    decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
    
    // Third pass: if still has entities, try again (for double-encoded)
    if (decoded.includes('&') && decoded !== text) {
      return WooCommerceController.decodeHtmlEntities(decoded);
    }
    
    return decoded;
  }
}

module.exports = WooCommerceController;
