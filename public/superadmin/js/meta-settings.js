/**
 * Meta/Facebook App Settings Modal
 * Handles WhatsApp Cloud API configuration for Embedded Signup
 */

let metaSettingsData = null;

/**
 * Open Meta Settings Modal
 */
async function openMetaSettingsModal() {
    try {
        // Load current Meta settings
        const response = await fetch('/api/superadmin/settings/meta', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}` }
        });
        
        const data = await response.json();
        metaSettingsData = data.success ? data.data : {};
        
    } catch (error) {
        console.error('Error loading Meta settings:', error);
        metaSettingsData = {};
    }

    const modalHtml = `
        <div class="modal-overlay active" id="metaSettingsModal" onclick="closeMetaSettingsModal(event)">
            <div class="modal-dialog modal-lg" onclick="event.stopPropagation()">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>
                            <i class="fab fa-facebook"></i> 
                            <span>Meta/Facebook App Configuration</span>
                        </h3>
                        <button class="modal-close" onclick="closeMetaSettingsModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <!-- Info Banner -->
                        <div class="meta-info-banner">
                            <div class="meta-info-icon">
                                <i class="fas fa-info-circle"></i>
                            </div>
                            <div class="meta-info-content">
                                <h4>WhatsApp Cloud API - Embedded Signup</h4>
                                <p>Configure your Meta Business Partner credentials to enable one-click WhatsApp account connection for your tenants.</p>
                            </div>
                        </div>

                        <form id="metaSettingsForm" onsubmit="saveMetaSettings(event)">
                            <!-- Enable/Disable Toggle -->
                            <div class="form-group">
                                <div class="meta-toggle-container">
                                    <div class="meta-toggle-info">
                                        <label class="meta-toggle-label">Enable Facebook Embedded Signup</label>
                                        <small class="form-text">Allow tenants to connect WhatsApp accounts via Facebook Login</small>
                                    </div>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="metaEmbeddedSignupEnabled" 
                                            ${metaSettingsData.meta_embedded_signup_enabled === '1' || metaSettingsData.meta_embedded_signup_enabled === 'true' ? 'checked' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>

                            <div class="meta-divider"></div>

                            <!-- Meta App ID -->
                            <div class="form-group">
                                <label for="metaAppId">
                                    Meta App ID
                                    <span class="required-badge">Required</span>
                                </label>
                                <input type="text" id="metaAppId" class="form-control" 
                                    value="${metaSettingsData.meta_app_id || ''}" 
                                    placeholder="123456789012345">
                                <small class="form-text">
                                    <i class="fas fa-question-circle"></i>
                                    Find this in <a href="https://developers.facebook.com/apps" target="_blank">Facebook Developers Console</a> > Your App > Settings > Basic
                                </small>
                            </div>

                            <!-- Meta App Secret -->
                            <div class="form-group">
                                <label for="metaAppSecret">
                                    Meta App Secret
                                    <span class="required-badge">Required</span>
                                </label>
                                <div class="input-with-icon">
                                    <input type="password" id="metaAppSecret" class="form-control" 
                                        value="${metaSettingsData.meta_app_secret || ''}" 
                                        placeholder="${metaSettingsData.meta_app_secret ? '********' : 'Enter your app secret'}">
                                    <button type="button" class="input-icon-btn" onclick="togglePasswordVisibility('metaAppSecret')">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                </div>
                                <small class="form-text">
                                    <i class="fas fa-shield-alt"></i>
                                    Keep this secret secure. Never share it publicly.
                                </small>
                            </div>

                            <!-- Meta Config ID -->
                            <div class="form-group">
                                <label for="metaConfigId">
                                    Configuration ID (Embedded Signup)
                                    <span class="required-badge">Required</span>
                                </label>
                                <input type="text" id="metaConfigId" class="form-control" 
                                    value="${metaSettingsData.meta_config_id || ''}" 
                                    placeholder="987654321098765">
                                <small class="form-text">
                                    <i class="fas fa-question-circle"></i>
                                    Find this in Facebook Developers > Your App > WhatsApp > Configuration > Embedded Signup
                                </small>
                            </div>

                            <!-- Meta Business ID -->
                            <div class="form-group">
                                <label for="metaBusinessId">
                                    Meta Business ID
                                    <span class="optional-badge">Optional</span>
                                </label>
                                <input type="text" id="metaBusinessId" class="form-control" 
                                    value="${metaSettingsData.meta_business_id || ''}" 
                                    placeholder="123456789012345">
                                <small class="form-text">
                                    <i class="fas fa-question-circle"></i>
                                    Your Meta Business Manager ID (optional but recommended)
                                </small>
                            </div>

                            <!-- JavaScript SDK Domain -->
                            <div class="form-group">
                                <label for="jsSdkDomain">
                                    JavaScript SDK Domain
                                    <span class="required-badge" style="background: #f59e0b;">Add to Facebook</span>
                                </label>
                                <div class="input-with-icon">
                                    <input type="text" id="jsSdkDomain" class="form-control" 
                                        value="${window.location.origin}" 
                                        readonly>
                                    <button type="button" class="input-icon-btn" onclick="copyJsSdkDomain()">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                                <small class="form-text" style="color: #f59e0b; font-weight: 500;">
                                    <i class="fas fa-exclamation-triangle"></i>
                                    <strong>IMPORTANT:</strong> Add this domain in Facebook App > Settings > Basic > "App Domains"
                                </small>
                            </div>

                            <!-- OAuth Redirect URI -->
                            <div class="form-group">
                                <label for="oauthRedirectUri">
                                    OAuth Redirect URI
                                    <span class="required-badge" style="background: #f59e0b;">Add to Facebook</span>
                                </label>
                                <div class="input-with-icon">
                                    <input type="text" id="oauthRedirectUri" class="form-control" 
                                        value="${window.location.origin}/admin/facebook-callback.html" 
                                        readonly>
                                    <button type="button" class="input-icon-btn" onclick="copyOAuthRedirectUri()">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                                <small class="form-text" style="color: #f59e0b; font-weight: 500;">
                                    <i class="fas fa-exclamation-triangle"></i>
                                    <strong>IMPORTANT:</strong> Add this URL in Facebook App > Settings > Basic > "Valid OAuth Redirect URIs"
                                </small>
                            </div>

                            <div class="meta-divider"></div>

                            <!-- Setup Guide -->
                            <div class="meta-setup-guide">
                                <h4>
                                    <i class="fas fa-book"></i>
                                    Setup Guide
                                </h4>
                                <ol class="meta-setup-steps">
                                    <li>
                                        <strong>Register as Meta Business Partner</strong>
                                        <p>Go to <a href="https://developers.facebook.com/docs/development/register" target="_blank">Meta for Developers</a> and register your business</p>
                                    </li>
                                    <li>
                                        <strong>Create a Meta App</strong>
                                        <p>Create a new app in <a href="https://developers.facebook.com/apps" target="_blank">Facebook Developers Console</a> and add the WhatsApp product</p>
                                    </li>
                                    <li>
                                        <strong>Configure Embedded Signup</strong>
                                        <p>In your app, go to WhatsApp > Configuration and set up Embedded Signup. Copy the Configuration ID.</p>
                                    </li>
                                    <li>
                                        <strong>Get App Credentials</strong>
                                        <p>Go to Settings > Basic and copy your App ID and App Secret</p>
                                    </li>
                                    <li>
                                        <strong>Configure Webhook</strong>
                                        <p>Set up your webhook URL in WhatsApp > Configuration > Webhooks</p>
                                    </li>
                                </ol>
                                <div class="meta-setup-links">
                                    <a href="https://developers.facebook.com/docs/whatsapp/embedded-signup" target="_blank" class="btn btn-secondary btn-sm">
                                        <i class="fas fa-book"></i>
                                        View Documentation
                                    </a>
                                    <a href="https://developers.facebook.com/apps" target="_blank" class="btn btn-secondary btn-sm">
                                        <i class="fab fa-facebook"></i>
                                        Open Developers Console
                                    </a>
                                </div>
                            </div>

                            <!-- Connection Status -->
                            <div class="meta-connection-status" id="metaConnectionStatus" style="display: none;">
                                <div class="status-icon">
                                    <i class="fas fa-check-circle"></i>
                                </div>
                                <div class="status-content">
                                    <h5>Connection Status</h5>
                                    <p id="metaConnectionMessage">Not tested yet</p>
                                </div>
                            </div>
                            
                            <div class="form-actions mt-4">
                                <button type="button" class="btn btn-secondary" onclick="closeMetaSettingsModal()">
                                    Cancel
                                </button>
                                <button type="button" class="btn btn-info" onclick="testMetaConnection()">
                                    <i class="fas fa-vial"></i>
                                    Test Connection
                                </button>
                                <button type="submit" class="btn btn-primary">
                                    <i class="fas fa-save"></i>
                                    Save Configuration
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Apply translations if available
    if (typeof i18n !== 'undefined' && i18n.translatePage) {
        i18n.translatePage();
    }
}

/**
 * Close Meta Settings Modal
 */
function closeMetaSettingsModal(event) {
    if (event && event.target !== event.currentTarget) return;
    
    const modal = document.getElementById('metaSettingsModal');
    if (modal) {
        modal.remove();
    }
}

/**
 * Toggle password visibility
 */
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

/**
 * Copy JavaScript SDK Domain to clipboard
 */
function copyJsSdkDomain() {
    const input = document.getElementById('jsSdkDomain');
    const button = input.nextElementSibling;
    const icon = button.querySelector('i');
    
    // Copy to clipboard using modern API
    navigator.clipboard.writeText(input.value).then(() => {
        // Visual feedback
        icon.classList.remove('fa-copy');
        icon.classList.add('fa-check');
        button.style.color = '#10b981';
        
        showNotification('Domain copied! Paste it in Facebook App Settings > Basic > App Domains', 'success');
        
        // Reset icon after 2 seconds
        setTimeout(() => {
            icon.classList.remove('fa-check');
            icon.classList.add('fa-copy');
            button.style.color = '';
        }, 2000);
    }).catch(() => {
        // Fallback for older browsers
        input.select();
        document.execCommand('copy');
        showNotification('Domain copied!', 'success');
    });
}

/**
 * Copy OAuth Redirect URI to clipboard
 */
function copyOAuthRedirectUri() {
    const input = document.getElementById('oauthRedirectUri');
    const button = input.nextElementSibling;
    const icon = button.querySelector('i');
    
    // Copy to clipboard using modern API
    navigator.clipboard.writeText(input.value).then(() => {
        // Visual feedback
        icon.classList.remove('fa-copy');
        icon.classList.add('fa-check');
        button.style.color = '#10b981';
        
        showNotification('OAuth Redirect URI copied! Paste it in Facebook App Settings > Basic > Valid OAuth Redirect URIs', 'success');
        
        // Reset icon after 2 seconds
        setTimeout(() => {
            icon.classList.remove('fa-check');
            icon.classList.add('fa-copy');
            button.style.color = '';
        }, 2000);
    }).catch(() => {
        // Fallback for older browsers
        input.select();
        document.execCommand('copy');
        showNotification('OAuth Redirect URI copied!', 'success');
    });
}

/**
 * Test Meta Connection
 */
async function testMetaConnection() {
    const statusDiv = document.getElementById('metaConnectionStatus');
    const statusIcon = statusDiv.querySelector('.status-icon i');
    const statusMessage = document.getElementById('metaConnectionMessage');
    
    // Show status div
    statusDiv.style.display = 'flex';
    statusDiv.className = 'meta-connection-status testing';
    statusIcon.className = 'fas fa-spinner fa-spin';
    statusMessage.textContent = 'Testing connection to Meta API...';
    
    try {
        const response = await fetch('/api/superadmin/settings/meta/test', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`,
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            statusDiv.className = 'meta-connection-status success';
            statusIcon.className = 'fas fa-check-circle';
            statusMessage.innerHTML = `
                <strong>Connection Successful!</strong><br>
                App Name: ${result.data.app_name || 'N/A'}<br>
                Category: ${result.data.app_category || 'N/A'}
            `;
            showNotification('Meta App connection successful!', 'success');
        } else {
            statusDiv.className = 'meta-connection-status error';
            statusIcon.className = 'fas fa-times-circle';
            statusMessage.innerHTML = `
                <strong>Connection Failed</strong><br>
                ${result.message || 'Unknown error'}
                ${result.error ? `<br><small>${result.error}</small>` : ''}
            `;
            showNotification(result.message || 'Connection test failed', 'error');
        }
    } catch (error) {
        console.error('Error testing Meta connection:', error);
        statusDiv.className = 'meta-connection-status error';
        statusIcon.className = 'fas fa-times-circle';
        statusMessage.innerHTML = `
            <strong>Connection Failed</strong><br>
            ${error.message}
        `;
        showNotification('Error testing connection', 'error');
    }
}

/**
 * Save Meta Settings
 */
async function saveMetaSettings(event) {
    event.preventDefault();
    
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    try {
        const formData = {
            meta_app_id: document.getElementById('metaAppId').value.trim(),
            meta_app_secret: document.getElementById('metaAppSecret').value.trim(),
            meta_config_id: document.getElementById('metaConfigId').value.trim(),
            meta_business_id: document.getElementById('metaBusinessId').value.trim(),
            meta_embedded_signup_enabled: document.getElementById('metaEmbeddedSignupEnabled').checked
        };
        
        // Don't send app secret if it's masked
        if (formData.meta_app_secret === '********') {
            delete formData.meta_app_secret;
        }
        
        const response = await fetch('/api/superadmin/settings/meta', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Meta settings saved successfully!', 'success');
            
            // Update cached data
            metaSettingsData = { ...metaSettingsData, ...formData };
            
            // Close modal after a short delay
            setTimeout(() => {
                closeMetaSettingsModal();
            }, 1000);
        } else {
            showNotification(result.message || 'Failed to save settings', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    } catch (error) {
        console.error('Error saving Meta settings:', error);
        showNotification('Error saving settings', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    // Check if there's a global notification function (not this one)
    if (typeof window.globalShowNotification === 'function') {
        window.globalShowNotification(message, type);
        return;
    }
    
    // Fallback notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

