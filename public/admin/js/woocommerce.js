/**
 * WooCommerce Module - Multi-tenant
 * Handles WooCommerce integration, products, and notifications
 */

console.log('WooCommerce.js loaded');

// Initialize WooCommerce page handlers
window.pageHandlers = window.pageHandlers || {};

// Handler for WooCommerce Settings page
window.pageHandlers['woocommerce-settings'] = function() {
    console.log('WooCommerce Settings handler called');
    // Check if feature is enabled before loading
    checkFeatureEnabled('woocommerce').then(enabled => {
        if (enabled) {
            loadWooCommerceSettings();
        }
    });
};

// Handler for WooCommerce Products page
window.pageHandlers['woocommerce-products'] = function() {
    console.log('WooCommerce Products handler called');
    // Check if feature is enabled before loading
    checkFeatureEnabled('woocommerce-products').then(enabled => {
        if (enabled) {
            loadWooCommerceProducts();
        }
    });
};

// Handler for WooCommerce Notifications page
window.pageHandlers['woocommerce-notifications'] = function() {
    console.log('WooCommerce Notifications handler called');
    // Check if feature is enabled before loading
    checkFeatureEnabled('woocommerce-notifications').then(enabled => {
        if (enabled) {
            loadWooCommerceNotifications();
        }
    });
};

// Legacy handler for backward compatibility
window.pageHandlers.woocommerce = function() {
    console.log('WooCommerce handler called');
    checkFeatureEnabled('woocommerce').then(enabled => {
        if (enabled) {
            loadWooCommercePage();
        }
    });
};

async function loadWooCommercePage() {
    console.log('Loading WooCommerce page...');
    
    // Load settings
    await loadWooCommerceSettings();
    
    // Load products
    await loadWooCommerceProducts();
    
    // Load notifications
    await loadWooCommerceNotifications();
    
    console.log('WooCommerce page loaded');
}

// ===== WOOCOMMERCE SETTINGS =====

async function loadWooCommerceSettings() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/woocommerce/settings', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load settings');

        const result = await response.json();
        const data = result.data || result;
        
        console.log('[WooCommerce Settings] Loaded data:', data);
        
        if (data.configured && data.settings) {
            document.getElementById('wcStoreUrl').value = data.settings.store_url || '';
            document.getElementById('wcConsumerKey').value = data.settings.consumer_key || '';
            document.getElementById('wcConsumerSecret').value = data.settings.consumer_secret || '';
            
            if (data.settings.last_sync) {
                const lastSync = new Date(data.settings.last_sync).toLocaleString();
                document.getElementById('wcConnectionStatus').innerHTML = `
                    <div class="connection-status success">
                        <span class="connection-status-icon">✅</span>
                        <span data-i18n="woocommerce.connected">Connected</span> - <span data-i18n="woocommerce.last_sync">Last sync</span>: ${lastSync}
                    </div>
                `;
            } else {
                document.getElementById('wcConnectionStatus').innerHTML = `
                    <div class="connection-status success">
                        <span class="connection-status-icon">✅</span>
                        <span data-i18n="woocommerce.connected">Connected</span>
                    </div>
                `;
            }
        }
        
        // Add URL sanitization
        const urlInput = document.getElementById('wcStoreUrl');
        if (urlInput && !urlInput.dataset.listenerAdded) {
            urlInput.addEventListener('blur', function() {
                let value = this.value.trim();
                const textarea = document.createElement('textarea');
                textarea.innerHTML = value;
                value = textarea.value;
                value = value.replace(/\/+$/, '');
                value = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
                
                if (value.includes('&') || value.includes('<') || value.includes('>')) {
                    showNotification('URL contains invalid characters. Please enter a clean URL.', 'warning');
                    value = value.replace(/[&<>]/g, '');
                }
                
                this.value = value;
            });
            
            urlInput.addEventListener('input', function() {
                const cursorPos = this.selectionStart;
                let value = this.value;
                const cleaned = value.replace(/[&<>"']/g, '');
                
                if (cleaned !== value) {
                    this.value = cleaned;
                    this.setSelectionRange(cursorPos - 1, cursorPos - 1);
                }
            });
            
            urlInput.dataset.listenerAdded = 'true';
        }
    } catch (error) {
        console.error('Error loading WooCommerce settings:', error);
    }
}

async function testWooCommerceConnection() {
    let storeUrl = document.getElementById('wcStoreUrl').value.trim();
    const consumerKey = document.getElementById('wcConsumerKey').value.trim();
    const consumerSecret = document.getElementById('wcConsumerSecret').value.trim();

    if (!storeUrl || !consumerKey || !consumerSecret) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    // Decode HTML entities and sanitize
    const textarea = document.createElement('textarea');
    textarea.innerHTML = storeUrl;
    storeUrl = textarea.value;
    storeUrl = storeUrl.replace(/\/+$/, '');
    storeUrl = storeUrl.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
    
    // Check for invalid characters
    const invalidChars = ['&', '<', '>', '"', "'", '`', ' '];
    for (const char of invalidChars) {
        if (storeUrl.includes(char)) {
            showNotification(`Invalid character "${char}" found in URL. Please remove it and try again.`, 'error');
            const input = document.getElementById('wcStoreUrl');
            input.value = storeUrl;
            input.focus();
            input.setSelectionRange(storeUrl.indexOf(char), storeUrl.indexOf(char) + 1);
            return;
        }
    }
    
    // Validate URL format
    try {
        const urlObj = new URL(storeUrl);
        if (!urlObj.protocol.startsWith('http')) {
            throw new Error('URL must start with http:// or https://');
        }
    } catch (e) {
        showNotification('Invalid URL format. Please use format: https://yourstore.com', 'error');
        return;
    }

    const statusDiv = document.getElementById('wcConnectionStatus');
    statusDiv.innerHTML = '<div class="spinner"></div>';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/woocommerce/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ store_url: storeUrl, consumer_key: consumerKey, consumer_secret: consumerSecret })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            const versionInfo = data.data?.store_info || data.store_info || {};
            statusDiv.innerHTML = `
                <div class="connection-status success">
                    <span class="connection-status-icon">✅</span>
                    <div>
                        <strong data-i18n="woocommerce.connection_success">Connection successful</strong>
                        <div style="font-size: 12px; margin-top: 4px;">
                            WooCommerce: ${versionInfo.version || 'Unknown'} | WordPress: ${versionInfo.wp_version || 'Unknown'}
                        </div>
                    </div>
                </div>
            `;
            showNotification('Connection successful!', 'success');
        } else {
            const errorMsg = data.error || data.message || 'Connection failed';
            statusDiv.innerHTML = `
                <div class="connection-status error">
                    <span class="connection-status-icon">❌</span>
                    <div>
                        <strong data-i18n="woocommerce.connection_failed">Connection failed</strong>
                        <div style="font-size: 13px; margin-top: 6px; color: #991b1b; line-height: 1.5;">
                            ${errorMsg}
                        </div>
                        ${errorMsg.includes('not found') ? `
                        <div style="font-size: 12px; margin-top: 8px; padding: 8px; background: #fef3c7; border-left: 3px solid #f59e0b; color: #92400e;">
                            <strong>💡 Quick Fix:</strong><br>
                            1. Verify WooCommerce plugin is installed and active<br>
                            2. Check WordPress permalinks (Settings > Permalinks) - must NOT be "Plain"<br>
                            3. Ensure your Store URL is correct (e.g., https://yourstore.com)<br>
                            4. Test if you can access: <code>${storeUrl}/wp-json/wc/v3</code>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
            showNotification(errorMsg, 'error');
        }
    } catch (error) {
        console.error('WooCommerce connection test error:', error);
        statusDiv.innerHTML = `
            <div class="connection-status error">
                <span class="connection-status-icon">❌</span>
                <div>
                    <strong>Connection test failed</strong>
                    <div style="font-size: 12px; margin-top: 4px; color: #666;">
                        ${error.message}
                    </div>
                </div>
            </div>
        `;
        showNotification('Connection test failed: ' + error.message, 'error');
    }
}

async function saveWooCommerceSettings(event) {
    event.preventDefault();

    let storeUrl = document.getElementById('wcStoreUrl').value;
    const consumerKey = document.getElementById('wcConsumerKey').value.trim();
    const consumerSecret = document.getElementById('wcConsumerSecret').value.trim();

    // Decode HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = storeUrl;
    storeUrl = textarea.value;
    textarea.innerHTML = storeUrl;
    storeUrl = textarea.value;
    
    storeUrl = storeUrl.replace(/\/+$/, '').trim();
    storeUrl = storeUrl.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    
    // Check for invalid characters
    const invalidChars = ['&', '<', '>', '"', "'", '`', ' '];
    for (const char of invalidChars) {
        if (storeUrl.includes(char)) {
            showNotification(`Invalid character "${char}" found in URL. Please remove it and try again.`, 'error');
            const input = document.getElementById('wcStoreUrl');
            input.value = storeUrl;
            input.focus();
            input.setSelectionRange(storeUrl.indexOf(char), storeUrl.indexOf(char) + 1);
            return;
        }
    }
    
    // Validate URL format
    try {
        const urlObj = new URL(storeUrl);
        if (!urlObj.protocol.startsWith('http')) {
            throw new Error('URL must start with http:// or https://');
        }
    } catch (e) {
        showNotification('Invalid URL format. Please use format: https://yourstore.com', 'error');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/woocommerce/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ store_url: storeUrl, consumer_key: consumerKey, consumer_secret: consumerSecret })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('Settings saved successfully!', 'success');
            document.getElementById('wcConnectionStatus').innerHTML = `
                <div class="connection-status success">
                    <span class="connection-status-icon">✅</span>
                    <span data-i18n="woocommerce.settings_saved">Settings saved successfully</span>
                </div>
            `;
        } else {
            console.error('Failed to save WooCommerce settings:', data);
            const errorMessage = data.error || data.message || 'Failed to save settings';
            showNotification(errorMessage, 'error');
            
            // Show error in connection status
            document.getElementById('wcConnectionStatus').innerHTML = `
                <div class="connection-status error">
                    <span class="connection-status-icon">❌</span>
                    <span>${errorMessage}</span>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showNotification('Error saving settings: ' + error.message, 'error');
    }
}

// ===== WOOCOMMERCE PRODUCTS =====

async function loadWooCommerceProducts() {
    const container = document.getElementById('wcProductsList');
    
    try {
        container.innerHTML = '<div style="text-align: center; padding: 40px;"><div class="spinner"></div></div>';

        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/woocommerce/products', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load products');

        const result = await response.json();
        const products = result.data || result || [];

        if (!Array.isArray(products)) {
            throw new Error('Invalid response format');
        }

        if (products.length === 0) {
            container.innerHTML = `
                <div class="wc-no-products">
                    <div class="wc-no-products-icon">📦</div>
                    <h3 data-i18n="woocommerce.no_products">No products found</h3>
                    <p data-i18n="woocommerce.configure_first">Please sync products first</p>
                </div>
            `;
            return;
        }

        container.innerHTML = products.map(product => {
            const hasImage = product.thumbnail_url && product.thumbnail_url !== '';
            const hasSale = product.sale_price && product.sale_price > 0 && product.sale_price < product.regular_price;
            const stockClass = product.stock_status === 'instock' ? 'in-stock' : 
                              product.stock_status === 'outofstock' ? 'out-of-stock' : 'on-backorder';
            const stockText = product.stock_status === 'instock' ? 'In Stock' : 
                             product.stock_status === 'outofstock' ? 'Out of Stock' : 'On Backorder';

            return `
                <div class="wc-product-card">
                    ${hasImage ? 
                        `<img src="${product.thumbnail_url}" alt="${product.name}" class="wc-product-image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22sans-serif%22 font-size=%2216%22 fill=%22%239ca3af%22%3ENo Image%3C/text%3E%3C/svg%3E'">` :
                        `<div class="wc-product-image" style="display: flex; align-items: center; justify-content: center; color: #9ca3af;">No Image</div>`
                    }
                    <div class="wc-product-content">
                        <h3 class="wc-product-name">${product.name}</h3>
                        ${product.sku ? `<div class="wc-product-sku">SKU: ${product.sku}</div>` : ''}
                        
                        <div class="wc-product-prices">
                            <span class="wc-product-price">${parseFloat(product.price).toFixed(2)}</span>
                            ${hasSale ? `
                                <span class="wc-product-regular-price">${parseFloat(product.regular_price).toFixed(2)}</span>
                                <span class="wc-product-sale-badge">SALE</span>
                            ` : ''}
                        </div>

                        <div class="wc-product-stock">
                            <span class="wc-stock-indicator ${stockClass}"></span>
                            <span class="wc-product-stock-text">${stockText} (${product.stock_quantity || 0})</span>
                        </div>

                        <div class="wc-product-placeholder" title="Use this placeholder in FAQs">
                            {{${product.placeholder_key}}}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading products:', error);
        container.innerHTML = `
            <div class="wc-no-products">
                <div class="wc-no-products-icon">❌</div>
                <h3>Error loading products</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

async function syncWooCommerceProducts() {
    const loadingDiv = document.getElementById('wcProductsLoading');
    const listDiv = document.getElementById('wcProductsList');

    loadingDiv.style.display = 'block';
    listDiv.style.display = 'none';

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/woocommerce/sync-products', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const result = await response.json();
        const data = result.data || result;

        if (response.ok && result.success) {
            const syncedCount = data.synced || 0;
            showNotification(`Products synced successfully: ${syncedCount} products`, 'success');
            await loadWooCommerceProducts();
        } else {
            showNotification(result.error || data.error || 'Sync failed', 'error');
        }
    } catch (error) {
        console.error('Error syncing products:', error);
        showNotification('Sync failed', 'error');
    } finally {
        loadingDiv.style.display = 'none';
        listDiv.style.display = 'grid';
    }
}

// ===== WOOCOMMERCE NOTIFICATIONS =====

async function loadWooCommerceNotifications() {
    try {
        const webhookUrlEl = document.getElementById('webhookUrl');
        if (!webhookUrlEl) {
            console.warn('[WooCommerce Notifications] Page elements not found, skipping load');
            return;
        }

        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/woocommerce/notifications/settings', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load notification settings');

        const result = await response.json();
        const data = result.data || result;

        // Get tenant ID from token
        const tokenData = JSON.parse(atob(token.split('.')[1]));
        const tenantId = tokenData.tenantId;

        // Set webhook URL with tenant ID
        const webhookUrl = `${window.location.origin}/api/woocommerce/webhook/${tenantId}`;
        webhookUrlEl.value = webhookUrl;

        if (data.configured && data.settings) {
            const settings = data.settings;

            if (document.getElementById('webhookSecret')) document.getElementById('webhookSecret').value = settings.webhook_secret || '';
            if (document.getElementById('newOrderEnabled')) document.getElementById('newOrderEnabled').checked = settings.new_order_enabled || false;
            if (document.getElementById('newOrderTemplate')) document.getElementById('newOrderTemplate').value = settings.new_order_template || '';
            if (document.getElementById('customerRegistrationEnabled')) document.getElementById('customerRegistrationEnabled').checked = settings.customer_registration_enabled || false;
            if (document.getElementById('customerRegistrationTemplate')) document.getElementById('customerRegistrationTemplate').value = settings.customer_registration_template || '';
            if (document.getElementById('passwordResetEnabled')) document.getElementById('passwordResetEnabled').checked = settings.password_reset_enabled || false;
            if (document.getElementById('passwordResetTemplate')) document.getElementById('passwordResetTemplate').value = settings.password_reset_template || '';
            if (document.getElementById('productCommentEnabled')) document.getElementById('productCommentEnabled').checked = settings.product_comment_enabled || false;
            if (document.getElementById('productCommentTemplate')) document.getElementById('productCommentTemplate').value = settings.product_comment_template || '';
        } else {
            loadDefaultTemplates();
        }
    } catch (error) {
        console.error('Error loading WooCommerce notification settings:', error);
    }
}

function loadDefaultTemplates() {
    if (document.getElementById('newOrderTemplate')) {
        document.getElementById('newOrderTemplate').value = `🛒 *Order Confirmation*

Hello {{customer_name}}!

Thank you for your order #{{order_number}}

*Order Details:*
Total: {{currency}} {{total}}
Payment: {{payment_method}}
Items: {{items_count}}
Status: {{order_status}}

Date: {{order_date}}

We'll process your order shortly!`;
    }

    if (document.getElementById('customerRegistrationTemplate')) {
        document.getElementById('customerRegistrationTemplate').value = `👋 *Welcome to Our Store!*

Hello {{customer_name}}!

Thank you for registering with us!

*Your Account Details:*
Email: {{customer_email}}
Username: {{customer_username}}

You can now enjoy exclusive benefits and track your orders.

Happy shopping! 🛍️`;
    }

    if (document.getElementById('passwordResetTemplate')) {
        document.getElementById('passwordResetTemplate').value = `🔐 *Password Reset Request*

Hello!

We received a request to reset your password for: {{customer_email}}

Click the link below to reset your password:
{{reset_link}}

If you didn't request this, please ignore this message.

Request time: {{request_time}}`;
    }

    if (document.getElementById('productCommentTemplate')) {
        document.getElementById('productCommentTemplate').value = `💬 *Thank You for Your Review!*

Hello {{customer_name}}!

Thank you for reviewing *{{product_name}}*!

Your rating: {{rating}} ⭐

Your comment:
"{{comment_text}}"

We appreciate your feedback!

Date: {{comment_date}}`;
    }
}

async function saveNotificationSettings() {
    const settings = {
        webhook_secret: document.getElementById('webhookSecret').value.trim(),
        admin_phone: null,
        new_order_enabled: document.getElementById('newOrderEnabled').checked,
        new_order_template: document.getElementById('newOrderTemplate').value,
        customer_registration_enabled: document.getElementById('customerRegistrationEnabled').checked,
        customer_registration_template: document.getElementById('customerRegistrationTemplate').value,
        password_reset_enabled: document.getElementById('passwordResetEnabled').checked,
        password_reset_template: document.getElementById('passwordResetTemplate').value,
        product_comment_enabled: document.getElementById('productCommentEnabled').checked,
        product_comment_template: document.getElementById('productCommentTemplate').value
    };

    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/woocommerce/notifications/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(settings)
        });

        if (!response.ok) throw new Error('Failed to save settings');

        showNotification('Notification settings saved successfully!', 'success');
    } catch (error) {
        console.error('Error saving notification settings:', error);
        showNotification('Failed to save notification settings', 'error');
    }
}

async function generateWebhookSecret() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/woocommerce/notifications/generate-secret', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to generate secret');

        const result = await response.json();
        const secret = result.data?.secret || result.secret;

        document.getElementById('webhookSecret').value = secret;
        showNotification('Webhook secret generated!', 'success');
    } catch (error) {
        console.error('Error generating webhook secret:', error);
        showNotification('Failed to generate webhook secret', 'error');
    }
}

function copyWebhookUrl() {
    const input = document.getElementById('webhookUrl');
    input.select();
    input.setSelectionRange(0, 99999);

    try {
        document.execCommand('copy');
        showNotification('Webhook URL copied to clipboard!', 'success');
    } catch (error) {
        navigator.clipboard.writeText(input.value).then(() => {
            showNotification('Webhook URL copied to clipboard!', 'success');
        }).catch(() => {
            showNotification('Failed to copy URL', 'error');
        });
    }
}

function insertPlaceholder(templateId, placeholder) {
    const textarea = document.getElementById(templateId);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    textarea.value = text.substring(0, start) + placeholder + text.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
}

async function testNotification(type) {
    Modal.prompt(
        'Test Notification',
        'Enter a test phone number (international format):<br><small style="color: #666;">💡 Tip: Use a different number than the one connected to WhatsApp</small>',
        '+',
        async (phone) => {
            if (!phone) {
                showNotification('Phone number is required for testing', 'error');
                return;
            }

            // Validate phone format
            const phoneRegex = /^\+?[1-9]\d{1,14}$/;
            if (!phoneRegex.test(phone.replace(/[\s-]/g, ''))) {
                showNotification('Invalid phone format. Use international format: +1234567890', 'error');
                return;
            }

            let templateId;
            switch (type) {
                case 'new_order':
                    templateId = 'newOrderTemplate';
                    break;
                case 'customer_registration':
                    templateId = 'customerRegistrationTemplate';
                    break;
                case 'password_reset':
                    templateId = 'passwordResetTemplate';
                    break;
                case 'product_comment':
                    templateId = 'productCommentTemplate';
                    break;
                default:
                    showNotification('Invalid notification type', 'error');
                    return;
            }

            const template = document.getElementById(templateId).value;

            if (!template) {
                showNotification('Please enter a message template first', 'error');
                return;
            }

            try {
                const token = localStorage.getItem('token');
                const response = await fetch('/api/tenant/woocommerce/notifications/test', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ type, phone, template })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    showNotification(data.message || 'Test notification sent successfully!', 'success');
                } else {
                    const errorMsg = data.error || data.message || 'Failed to send test notification';
                    
                    if (errorMsg.includes('WhatsApp')) {
                        showNotification('⚠️ ' + errorMsg + ' Go to WhatsApp Settings to connect.', 'error');
                    } else {
                        showNotification(errorMsg, 'error');
                    }
                }
            } catch (error) {
                console.error('Error sending test notification:', error);
                showNotification('Failed to send test notification. Please check your connection.', 'error');
            }
        }
    );
}

console.log('WooCommerce module fully loaded');
