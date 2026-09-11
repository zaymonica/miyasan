/**
 * Super Admin App - Main JavaScript
 */

// API Base URL
const API_URL = '/api';

// Global state
const state = {
    token: localStorage.getItem('superadmin_token'),
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    currentPage: 'dashboard',
    defaultCurrencyCode: null
};

// Check authentication on load
document.addEventListener('DOMContentLoaded', async () => {
    if (!state.token) {
        window.location.href = '/superadmin/login';
        return;
    }

    // SECURITY: Immediate role check before any API calls
    try {
        const payload = JSON.parse(atob(state.token.split('.')[1]));
        const userRole = payload.role;
        
        // Only superadmin can access this panel
        if (userRole !== 'superadmin') {
            console.warn('Access denied: Only superadmin can access this panel');
            localStorage.removeItem('superadmin_token');
            localStorage.removeItem('user');
            
            // Redirect based on role
            if (userRole === 'admin') {
                window.location.href = '/admin';
            } else if (userRole === 'user') {
                window.location.href = '/user';
            } else {
                window.location.href = '/login';
            }
            return;
        }
    } catch (e) {
        console.error('Error parsing token:', e);
        localStorage.removeItem('superadmin_token');
        localStorage.removeItem('user');
        window.location.href = '/superadmin/login';
        return;
    }

    // Initialize i18n first and wait for it to complete
    if (typeof i18n !== 'undefined') {
        try {
            await i18n.init();
        } catch (err) {
            console.error('Failed to initialize i18n:', err);
        }
    }

    // Verify token
    verifyToken();

    // Load default currency
    await loadDefaultCurrency();

    // Setup navigation
    setupNavigation();

    // Setup menu toggle
    setupMenuToggle();

    // Setup routing
    setupRouting();

    // Load page based on URL or default to dashboard
    loadPageFromURL();
});

// Verify token
async function verifyToken() {
    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Invalid token');
        }

        const data = await response.json();
        
        if (data.data.user.role !== 'superadmin') {
            alert('Access denied. Super Admin only.');
            logout();
            return;
        }

        state.user = data.data.user;
        document.getElementById('userName').textContent = state.user.name || state.user.email;
    } catch (error) {
        console.error('Token verification failed:', error);
        logout();
    }
}

// Setup navigation
function setupNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateToPage(page);
        });
    });
}

// Setup routing
function setupRouting() {
    // Handle browser back/forward buttons
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.page) {
            loadPage(e.state.page, false);
            updateActiveNav(e.state.page);
        } else {
            loadPageFromURL();
        }
    });
}

// Load page from URL
function loadPageFromURL() {
    const path = window.location.pathname;
    const page = path.replace('/superadmin/', '') || 'dashboard';
    
    // If path is just /superadmin or /superadmin/, load dashboard
    if (page === 'superadmin' || page === '') {
        navigateToPage('dashboard', true);
    } else {
        loadPage(page, false);
        updateActiveNav(page);
    }
}

// Navigate to page with URL update
function navigateToPage(page, replace = false) {
    const url = `/superadmin/${page}`;
    
    if (replace) {
        window.history.replaceState({ page }, '', url);
    } else {
        window.history.pushState({ page }, '', url);
    }
    
    loadPage(page, false);
    updateActiveNav(page);
}

// Update active navigation item
function updateActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (activeNav) {
        activeNav.classList.add('active');
    }
}

// Setup menu toggle for mobile
function setupMenuToggle() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');

    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        }
    });
}

// Load page content
function loadPage(page, updateURL = true) {
    state.currentPage = page;
    const content = document.getElementById('content');

    // Update URL if needed
    if (updateURL) {
        const url = `/superadmin/${page}`;
        window.history.pushState({ page }, '', url);
    }

    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'tenants':
            loadTenants();
            break;
        case 'plans':
            loadPlans();
            break;
        case 'plan-addons':
            loadPlanAddons();
            break;
        case 'addon-purchases':
            loadAddonPurchases();
            break;
        case 'payment-gateways':
            loadPaymentGateways();
            break;
        case 'payments':
            loadPayments();
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'currencies':
            loadCurrencies();
            break;
        case 'translations':
            loadTranslations();
            break;
        case 'landing':
            loadLandingPage();
            break;
        case 'email-notifications':
            loadEmailNotifications();
            break;
        case 'whatsapp-notifications':
            loadWhatsAppNotifications();
            break;
        case 'system-addons':
            loadSystemAddons();
            break;
        default:
            content.innerHTML = '<div class="card"><p>Page not found</p></div>';
    }
    applyTranslations();
}

// Logout
function logout() {
    window.showConfirm('common.logout_confirm', () => {
        localStorage.removeItem('superadmin_token');
        localStorage.removeItem('user');
        window.location.href = '/superadmin/login';
    });
}

// API Helper Functions
/**
 * Global API Request helper
 * All endpoints should NOT include '/api' prefix - it's added automatically
 * Example: apiRequest('/superadmin/dashboard') -> fetches /api/superadmin/dashboard
 */
async function apiRequest(endpoint, options = {}) {
    // Ensure token exists
    if (!state.token) {
        console.error('No authentication token found');
        logout();
        throw new Error('No authentication token. Please login again.');
    }

    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.token}`
        }
    };

    // Build the full URL - API_URL is '/api'
    const fullUrl = `${API_URL}${endpoint}`;
    
    console.log(`📡 API Request: ${options.method || 'GET'} ${fullUrl}`);

    try {
        const response = await fetch(fullUrl, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        });

        // Check for authentication errors first
        if (response.status === 401) {
            console.error('Authentication failed - redirecting to login');
            logout();
            throw new Error('Session expired. Please login again.');
        }

        // Check content type before parsing
        const contentType = response.headers.get('content-type');
        
        if (!contentType || !contentType.includes('application/json')) {
            // Response is not JSON - likely an HTML error page
            const text = await response.text();
            console.error('❌ Non-JSON response received:', {
                url: fullUrl,
                status: response.status,
                contentType: contentType,
                preview: text.substring(0, 300)
            });
            
            // Check if it's an HTML page (common routing issue)
            if (text.includes('<!DOCTYPE html>') || text.includes('<html')) {
                throw new Error(`API routing error: Server returned HTML instead of JSON. Check if the endpoint ${endpoint} exists.`);
            }
            
            throw new Error(`Server returned ${response.status}: Expected JSON but got ${contentType || 'unknown content type'}`);
        }

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ API Error:', data);
            throw new Error(data.error || data.message || `HTTP ${response.status}`);
        }

        console.log(`✅ API Response: ${fullUrl}`, { success: data.success });
        return data;
    } catch (error) {
        // Handle network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            console.error('Network error:', error);
            throw new Error('Network error. Please check your connection.');
        }
        
        // Handle JSON parsing errors
        if (error.name === 'SyntaxError') {
            console.error('JSON parsing error:', error);
            throw new Error('Invalid response from server. Please try again.');
        }
        
        // Re-throw other errors
        throw error;
    }
}

// Show loading
function showLoading(container) {
    container.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p data-i18n="common.loading">${typeof i18n !== 'undefined' ? i18n.t('common.loading') : 'Loading...'}</p>
        </div>
    `;
    if (typeof i18n !== 'undefined') {
        i18n.translatePage();
    }
}

// Show error
function showError(container, message) {
    container.innerHTML = `
        <div class="alert alert-danger">
            <i class="fas fa-exclamation-circle"></i> 
            <span>${typeof i18n !== 'undefined' ? i18n.t(message) : message}</span>
        </div>
    `;
}

// Deprecated - use window.showSuccess from modals.js
function showSuccess(message) {
    if (window.modalSystem && window.modalSystem.toast) {
        window.modalSystem.toast(message, 'success');
    }
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    // Check if date is valid
    if (isNaN(date.getTime())) {
        return 'N/A';
    }
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Format currency
function formatCurrency(amount, currency) {
    // Priority: 1. Passed currency, 2. Default currency from state, 3. localStorage, 4. USD fallback
    const resolved = currency || state.defaultCurrencyCode || localStorage.getItem('system_default_currency') || 'USD';
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: resolved
        }).format(amount);
    } catch (e) {
        console.error('Currency formatting error:', e);
        return `${resolved} ${parseFloat(amount || 0).toFixed(2)}`;
    }
}

async function loadDefaultCurrency() {
    try {
        const response = await apiRequest('/superadmin/currencies');
        const currencies = response.data?.currencies || [];
        const defaultCurrency = currencies.find(c => c.is_default) || currencies[0];
        if (defaultCurrency?.code) {
            state.defaultCurrencyCode = defaultCurrency.code;
            localStorage.setItem('system_default_currency', defaultCurrency.code);
            return;
        }
    } catch (error) {
        // Fallback to public API
    }
    try {
        const response = await fetch('/api/public/default-currency');
        const data = await response.json();
        state.defaultCurrencyCode = data?.data?.code || 'USD';
        localStorage.setItem('system_default_currency', state.defaultCurrencyCode);
    } catch (e) {
        state.defaultCurrencyCode = 'USD';
        localStorage.setItem('system_default_currency', state.defaultCurrencyCode);
    }
}

// Create modal
function createModal(title, content, footer = '') {
    const modalHTML = `
        <div class="modal active" id="dynamicModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
            </div>
        </div>
    `;

    const container = document.getElementById('modalContainer');
    container.innerHTML = modalHTML;

    // Close on background click
    document.getElementById('dynamicModal').addEventListener('click', (e) => {
        if (e.target.id === 'dynamicModal') {
            closeModal();
        }
    });
}

function showRestartRequiredModal() {
    const translate = (key, fallback) => {
        if (typeof i18n !== 'undefined' && i18n.t) {
            const value = i18n.t(key);
            return value !== key ? value : fallback;
        }
        return fallback;
    };
    const content = `
        <div style="max-width: 760px; min-width: 600px;">
            <p style="margin: 0 0 12px 0; font-size: 1rem;">${translate('superadmin.restart_modal.description', 'To apply all Super Admin translations, you need to restart the server.')}</p>
            <div style="margin: 16px 0;">
                <div style="font-weight: 600; margin-bottom: 6px;">${translate('superadmin.restart_modal.option1_title', 'Option 1: cPanel (NodeJS)')}</div>
                <ol style="margin: 0 0 0 18px; line-height: 1.6;">
                    <li>${translate('superadmin.restart_modal.option1_step1', 'Open cPanel and go to Node.js App.')}</li>
                    <li>${translate('superadmin.restart_modal.option1_step2', 'Select the system application.')}</li>
                    <li>${translate('superadmin.restart_modal.option1_step3', 'Click Restart and wait for it to finish.')}</li>
                    <li>${translate('superadmin.restart_modal.option1_step4', 'Reload the Super Admin panel.')}</li>
                </ol>
            </div>
            <div style="margin: 16px 0 0 0;">
                <div style="font-weight: 600; margin-bottom: 6px;">${translate('superadmin.restart_modal.option2_title', 'Option 2: Terminal/SSH')}</div>
                <ol style="margin: 0 0 0 18px; line-height: 1.6;">
                    <li>${translate('superadmin.restart_modal.option2_step1', 'Open the server terminal.')}</li>
                    <li>${translate('superadmin.restart_modal.option2_step2', 'Run the command below:')}</li>
                </ol>
                <div style="margin: 8px 0 0 0; padding: 10px 12px; background: #0f172a; color: #fff; border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
                    pm2 restart misayan-saas
                </div>
                <div style="margin-top: 10px;">${translate('superadmin.restart_modal.option2_step3', 'After that, refresh the Super Admin page.')}</div>
            </div>
        </div>
    `;
    const footer = `
        <button class="btn btn-primary" onclick="closeModal()">${translate('superadmin.restart_modal.cta', 'Got it')}</button>
    `;
    createModal(translate('superadmin.restart_modal.title', 'Attention: restart required'), content, footer);
}

// Close modal
function closeModal(element) {
    // Support both calling conventions:
    // 1. closeModal() - close the modal in modalContainer
    // 2. closeModal(element) - close the modal containing the element
    
    if (element && element.closest) {
        // If an element is passed, find and close its parent modal
        const modal = element.closest('.modal-overlay') || element.closest('.modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
            return;
        }
    }
    
    // Default behavior: close modal in modalContainer
    const container = document.getElementById('modalContainer');
    if (container) {
        container.innerHTML = '';
    }
    
    // Also try to close any custom modal
    const customModal = document.getElementById('customModal');
    if (customModal) {
        customModal.classList.remove('active');
        setTimeout(() => customModal.remove(), 300);
    }
}

function applyTranslations() {
    if (typeof i18n !== 'undefined' && i18n.translatePage) {
        i18n.translatePage();
        setTimeout(() => i18n.translatePage(), 200);
    }
}

// Confirm dialog - deprecated, use window.showConfirm from modals.js
function confirm(message, callback) {
    if (window.showConfirm) {
        window.showConfirm(message, callback);
    }
}

// Load Email Notifications page
function loadEmailNotifications() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-envelope"></i> Email Notifications</h1>
            <p>Configure SMTP settings and manage email notification templates</p>
        </div>

        <div class="row">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-cog"></i> SMTP Configuration</h3>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>SMTP Host</label>
                                    <input type="text" id="smtp_host" class="form-control" placeholder="smtp.gmail.com">
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>SMTP Port</label>
                                    <input type="number" id="smtp_port" class="form-control" value="587">
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Use SSL/TLS</label>
                                    <label class="switch">
                                        <input type="checkbox" id="smtp_secure">
                                        <span class="slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>SMTP Username</label>
                                    <input type="text" id="smtp_user" class="form-control">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>SMTP Password</label>
                                    <input type="password" id="smtp_password" class="form-control" placeholder="Leave empty to keep current">
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>From Email</label>
                                    <input type="email" id="from_email" class="form-control" placeholder="noreply@yourdomain.com">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>From Name</label>
                                    <input type="text" id="from_name" class="form-control" placeholder="Misayan SaaS">
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Test Recipient Email</label>
                                    <input type="email" id="test_recipient" class="form-control" placeholder="test@example.com">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Enable Email Notifications</label>
                                    <label class="switch">
                                        <input type="checkbox" id="email_enabled">
                                        <span class="slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button id="testEmailConnection" class="btn btn-secondary">
                                <i class="fas fa-paper-plane"></i> Send Test Email
                            </button>
                            <button id="saveEmailSettings" class="btn btn-primary">
                                <i class="fas fa-save"></i> Save Settings
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row mt-4">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-file-alt"></i> Email Templates</h3>
                        <div class="card-actions">
                            <select id="templateCategory" class="form-control">
                                <option value="">All Categories</option>
                                <option value="tenant">Tenant</option>
                                <option value="subscription">Subscription</option>
                                <option value="security">Security</option>
                                <option value="system">System</option>
                            </select>
                            <input type="text" id="searchTemplates" class="form-control" placeholder="Search templates...">
                        </div>
                    </div>
                    <div class="card-body">
                        <div id="templatesContainer"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Load the email notifications module
    const script = document.createElement('script');
    script.src = '/superadmin/js/email-notifications.js';
    document.body.appendChild(script);
}

// Load Payments page
function loadPayments() {
    // Initialize the payments module directly
    if (window.paymentsModule && typeof window.paymentsModule.init === 'function') {
        window.paymentsModule.init();
    } else {
        // Module not loaded yet, load it dynamically
        const existingScript = document.querySelector('script[src="/superadmin/js/payments.js"]');
        if (!existingScript) {
            const script = document.createElement('script');
            script.src = '/superadmin/js/payments.js';
            script.onload = () => {
                if (window.paymentsModule && typeof window.paymentsModule.init === 'function') {
                    window.paymentsModule.init();
                }
            };
            document.body.appendChild(script);
        } else if (window.paymentsModule) {
            window.paymentsModule.init();
        }
    }
}

// Load Analytics page
function loadAnalytics() {
    // Initialize the analytics module directly
    if (window.analyticsModule && typeof window.analyticsModule.init === 'function') {
        window.analyticsModule.init();
    } else {
        // Module not loaded yet, load it dynamically
        const existingScript = document.querySelector('script[src="/superadmin/js/analytics.js"]');
        if (!existingScript) {
            const script = document.createElement('script');
            script.src = '/superadmin/js/analytics.js';
            script.onload = () => {
                if (window.analyticsModule && typeof window.analyticsModule.init === 'function') {
                    window.analyticsModule.init();
                }
            };
            document.body.appendChild(script);
        } else if (window.analyticsModule) {
            window.analyticsModule.init();
        }
    }
}

// Load Landing Page editor
function loadLandingPage() {
    // Initialize the landing page module directly
    if (window.pageHandlers && typeof window.pageHandlers.landing === 'function') {
        window.pageHandlers.landing();
    } else {
        // Module not loaded yet, it should already be loaded from index.html
        // But if not, try calling it after a short delay
        setTimeout(() => {
            if (window.pageHandlers && typeof window.pageHandlers.landing === 'function') {
                window.pageHandlers.landing();
            } else {
                console.error('Landing page module not loaded');
                const content = document.getElementById('content');
                content.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-circle"></i>
                        Landing page module failed to load. Please refresh the page.
                    </div>
                `;
            }
        }, 100);
    }
}

// Load WhatsApp Notifications page
function loadWhatsAppNotifications() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="page-header">
            <h1><i class="fab fa-whatsapp"></i> WhatsApp Notifications</h1>
            <p>Connect WhatsApp Web to send automated notifications</p>
        </div>

        <div class="row">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-link"></i> WhatsApp Web Connection</h3>
                    </div>
                    <div class="card-body">
                        <!-- Loading Status -->
                        <div id="whatsappStatusContainer" style="text-center padding: 40px;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 3em; color: #25d366;"></i>
                            <p style="margin-top: 20px;">Checking connection status...</p>
                        </div>

                        <!-- QR Code Container -->
                        <div id="qrCodeContainer" style="display: none; text-align: center; padding: 40px;">
                            <h3 style="color: #25d366;"><i class="fab fa-whatsapp"></i> Scan QR Code</h3>
                            <p>Open WhatsApp on your phone → Settings → Linked Devices → Link a Device</p>
                            <div style="margin: 30px auto; max-width: 350px; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                                <img id="qrCodeImage" src="" alt="QR Code" style="max-width: 100%; border: 3px solid #25d366; border-radius: 8px;">
                            </div>
                            <p style="color: #666; font-size: 14px;">QR Code refreshes automatically</p>
                        </div>

                        <!-- Connected Container -->
                        <div id="connectedContainer" style="display: none; text-align: center; padding: 40px;">
                            <i class="fas fa-check-circle" style="font-size: 5em; color: #25d366;"></i>
                            <h3 style="margin-top: 20px; color: #25d366;">WhatsApp Connected!</h3>
                            <div style="margin: 30px auto; max-width: 400px; background: #f0f9ff; padding: 20px; border-radius: 10px;">
                                <p style="margin: 10px 0;"><strong>Phone:</strong> <span id="connectedPhone">-</span></p>
                                <p style="margin: 10px 0;"><strong>Connected:</strong> <span id="lastConnected">-</span></p>
                                <p style="margin: 10px 0; color: #25d366;"><i class="fas fa-circle" style="font-size: 8px;"></i> Active</p>
                            </div>
                            <button onclick="WhatsAppNotifications.disconnectWhatsApp()" class="btn btn-danger" style="margin-top: 20px;">
                                <i class="fas fa-unlink"></i> Disconnect WhatsApp
                            </button>
                        </div>

                        <!-- Disconnected Container -->
                        <div id="disconnectedContainer" style="display: none; text-align: center; padding: 40px;">
                            <i class="fas fa-times-circle" style="font-size: 5em; color: #f44336;"></i>
                            <h3 style="margin-top: 20px;">WhatsApp Not Connected</h3>
                            <p style="color: #666; margin: 20px 0;">Connect your WhatsApp to start sending automated notifications</p>
                            <button onclick="WhatsAppNotifications.initWhatsApp()" class="btn btn-success btn-lg" style="margin-top: 20px;">
                                <i class="fab fa-whatsapp"></i> Connect WhatsApp Web
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row mt-4">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-file-alt"></i> Notification Templates</h3>
                        <div class="card-actions">
                            <select id="templateCategory" class="form-control">
                                <option value="">All Categories</option>
                                <option value="tenant">Tenant</option>
                                <option value="subscription">Subscription</option>
                                <option value="security">Security</option>
                                <option value="system">System</option>
                            </select>
                            <input type="text" id="searchTemplates" class="form-control" placeholder="Search templates...">
                        </div>
                    </div>
                    <div class="card-body">
                        <div id="templatesContainer"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Load the WhatsApp notifications module
    const script = document.createElement('script');
    script.src = '/superadmin/js/whatsapp-notifications.js';
    document.body.appendChild(script);
}


// Load System Add-ons page
function loadSystemAddons() {
    // Initialize the system addons module directly
    if (window.systemAddonsModule && typeof window.systemAddonsModule.init === 'function') {
        window.systemAddonsModule.init();
    } else {
        // Module not loaded yet, load it dynamically
        const existingScript = document.querySelector('script[src="/superadmin/js/system-addons.js"]');
        if (!existingScript) {
            const script = document.createElement('script');
            script.src = '/superadmin/js/system-addons.js?v=1';
            script.onload = () => {
                if (window.systemAddonsModule && typeof window.systemAddonsModule.init === 'function') {
                    window.systemAddonsModule.init();
                }
            };
            document.body.appendChild(script);
        } else if (window.systemAddonsModule) {
            window.systemAddonsModule.init();
        }
    }
}
