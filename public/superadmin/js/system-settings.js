/**
 * System Settings Modal
 * Handles system logo, favicon, name configuration, and admin profile
 */

let systemSettingsData = null;
let adminProfileData = null;

/**
 * Open System Settings Modal
 */
async function openSystemSettingsModal() {
    try {
        // Load current settings and profile
        const [brandingRes, profileRes] = await Promise.all([
            fetch('/api/superadmin/system-branding', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}` }
            }),
            fetch('/api/superadmin/profile', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}` }
            })
        ]);
        
        const brandingData = await brandingRes.json();
        const profileData = await profileRes.json();

        systemSettingsData = brandingData.success ? brandingData.data : {};
        adminProfileData = profileData.success ? profileData.data : {};
        
    } catch (error) {
        console.error('Error loading settings:', error);
        systemSettingsData = {};
        adminProfileData = {};
    }

    const modalHtml = `
        <div class="modal-overlay active" id="systemSettingsModal" onclick="closeSystemSettingsModal(event)">
            <div class="modal-dialog modal-lg" onclick="event.stopPropagation()">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-cog"></i> <span data-i18n="settings.branding.title">System Settings</span></h3>
                        <button class="modal-close" onclick="closeSystemSettingsModal()">&times;</button>
                    </div>
                    <div class="modal-body p-0">
                        <div class="settings-tabs">
                             <button class="tab-btn active" onclick="switchSettingsTab('branding', event)">
                                <i class="fas fa-paint-brush"></i> <span data-i18n="settings.branding.title">Branding</span>
                            </button>
                            <button class="tab-btn" onclick="switchSettingsTab('profile', event)">
                                <i class="fas fa-user-shield"></i> <span data-i18n="settings.profile.title">Admin Profile</span>
                            </button>
                        </div>
                        
                        <!-- Branding Tab -->
                        <div id="brandingTab" class="settings-tab-content active p-4">
                            <form id="systemSettingsForm" onsubmit="saveSystemSettings(event)">
                                <!-- System Name -->
                                <div class="form-group">
                                    <label for="systemName">System Name</label>
                                    <input type="text" id="systemName" class="form-control" 
                                        value="${systemSettingsData.system_name || 'Misayan SaaS'}" 
                                        placeholder="Enter system name">
                                    <small class="form-text">This name appears in the sidebar header and page titles</small>
                                </div>

                                <!-- System Logo -->
                                <div class="form-group">
                                    <label>System Logo</label>
                                    <div style="display: flex; gap: 20px; align-items: flex-start;">
                                        <div style="flex: 1;">
                                            <div style="background: #f8f9fa; border: 2px dashed #ddd; border-radius: 8px; padding: 20px; text-align: center; min-height: 120px; display: flex; align-items: center; justify-content: center;">
                                                ${systemSettingsData.system_logo ? 
                                                    `<img src="${systemSettingsData.system_logo}" alt="System Logo" style="max-height: 80px; max-width: 200px;" id="logoPreview">` : 
                                                    `<span style="color: #999;" id="logoPreview">No logo uploaded</span>`
                                                }
                                            </div>
                                            <input type="file" id="systemLogoInput" accept="image/*" style="display: none;" onchange="previewLogo(event, 'logo')">
                                            <div style="margin-top: 10px; display: flex; gap: 10px;">
                                                <button type="button" class="btn btn-secondary" onclick="document.getElementById('systemLogoInput').click()">
                                                    <i class="fas fa-upload"></i> Upload Logo
                                                </button>
                                                ${systemSettingsData.system_logo ? 
                                                    `<button type="button" class="btn btn-danger" onclick="removeLogo()">
                                                        <i class="fas fa-trash"></i> Remove
                                                    </button>` : ''
                                                }
                                            </div>
                                            <small class="form-text">Recommended: 200x60px, PNG or SVG with transparent background</small>
                                        </div>
                                    </div>
                                </div>

                                <!-- Favicon -->
                                <div class="form-group">
                                    <label>Favicon</label>
                                    <div style="display: flex; gap: 20px; align-items: flex-start;">
                                        <div style="flex: 1;">
                                            <div style="background: #f8f9fa; border: 2px dashed #ddd; border-radius: 8px; padding: 20px; text-align: center; min-height: 80px; display: flex; align-items: center; justify-content: center;">
                                                ${systemSettingsData.favicon ? 
                                                    `<img src="${systemSettingsData.favicon}" alt="Favicon" style="max-height: 48px; max-width: 48px;" id="faviconPreview">` : 
                                                    `<span style="color: #999;" id="faviconPreview">No favicon uploaded</span>`
                                                }
                                            </div>
                                            <input type="file" id="faviconInput" accept="image/x-icon,image/png,image/svg+xml" style="display: none;" onchange="previewLogo(event, 'favicon')">
                                            <div style="margin-top: 10px; display: flex; gap: 10px;">
                                                <button type="button" class="btn btn-secondary" onclick="document.getElementById('faviconInput').click()">
                                                    <i class="fas fa-upload"></i> Upload Favicon
                                                </button>
                                                ${systemSettingsData.favicon ? 
                                                    `<button type="button" class="btn btn-danger" onclick="removeFavicon()">
                                                        <i class="fas fa-trash"></i> Remove
                                                    </button>` : ''
                                                }
                                            </div>
                                            <small class="form-text">Recommended: 32x32px or 64x64px, ICO or PNG format</small>
                                        </div>
                                    </div>
                                </div>

                                <!-- Support Email -->
                                <div class="form-group">
                                    <label for="supportEmail">Support Email</label>
                                    <input type="email" id="supportEmail" class="form-control" 
                                        value="${systemSettingsData.support_email || ''}" 
                                        placeholder="support@yourdomain.com">
                                    <small class="form-text">Email displayed in notifications and support links</small>
                                </div>
                                
                                <div class="form-actions mt-4 text-right">
                                    <button type="button" class="btn btn-secondary" onclick="closeSystemSettingsModal()">Cancel</button>
                                    <button type="submit" class="btn btn-primary">
                                        <i class="fas fa-save"></i> Save Branding
                                    </button>
                                </div>
                            </form>
                        </div>

                        <!-- Profile Tab -->
                        <div id="profileTab" class="settings-tab-content p-4" style="display: none;">
                            <form id="adminProfileForm" onsubmit="saveAdminProfile(event)">
                                <div class="form-group">
                                    <label data-i18n="settings.profile.email">Email Address</label>
                                    <input type="email" id="adminEmail" class="form-control" 
                                        value="${adminProfileData.email || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label data-i18n="settings.profile.current_password">Current Password</label>
                                    <input type="password" id="currentPassword" class="form-control" 
                                        data-i18n-placeholder="settings.profile.current_password_required">
                                    <small class="form-text text-muted" data-i18n="settings.profile.current_password_required">Required to change password</small>
                                </div>
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="form-group">
                                            <label data-i18n="settings.profile.new_password">New Password</label>
                                            <input type="password" id="newPassword" class="form-control" 
                                                data-i18n-placeholder="settings.profile.password_hint">
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="form-group">
                                            <label data-i18n="settings.profile.confirm_password">Confirm Password</label>
                                            <input type="password" id="confirmPassword" class="form-control" 
                                                data-i18n-placeholder="settings.profile.confirm_password">
                                        </div>
                                    </div>
                                </div>
                                <div class="form-actions mt-4 text-right">
                                    <button type="button" class="btn btn-secondary" onclick="closeSystemSettingsModal()">Cancel</button>
                                    <button type="submit" class="btn btn-primary">
                                        <i class="fas fa-save"></i> <span data-i18n="settings.profile.save_success">Save Profile</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <style>
            .settings-tabs {
                display: flex;
                border-bottom: 1px solid #dee2e6;
                background: #f8f9fa;
                padding: 0 1rem;
            }
            .tab-btn {
                padding: 1rem 1.5rem;
                border: none;
                background: none;
                cursor: pointer;
                border-bottom: 2px solid transparent;
                color: #6c757d;
                font-weight: 500;
                outline: none;
            }
            .tab-btn.active {
                color: #0d6efd;
                border-bottom-color: #0d6efd;
            }
            .tab-btn:hover:not(.active) {
                color: #495057;
            }
            .p-4 {
                padding: 1.5rem !important;
            }
        </style>
    `;

    document.getElementById('modalContainer').innerHTML = modalHtml;
    
    // Apply translations
    if (window.i18n && window.i18n.translatePage) {
        window.i18n.translatePage();
    }
}

/**
 * Switch settings tab
 */
function switchSettingsTab(tabName, event) {
    if (event) event.preventDefault();
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (event) event.currentTarget.classList.add('active');
    
    // Update content
    document.querySelectorAll('.settings-tab-content').forEach(content => {
        content.style.display = 'none';
        content.classList.remove('active');
    });
    
    const targetTab = document.getElementById(`${tabName}Tab`);
    if (targetTab) {
        targetTab.style.display = 'block';
        targetTab.classList.add('active');
    }
}

/**
 * Close System Settings Modal
 */
function closeSystemSettingsModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modalContainer').innerHTML = '';
}

/**
 * Preview uploaded logo/favicon
 */
function previewLogo(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const previewId = type === 'logo' ? 'logoPreview' : 'faviconPreview';
        const preview = document.getElementById(previewId);
        
        if (preview.tagName === 'IMG') {
            preview.src = e.target.result;
        } else {
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = type === 'logo' ? 'System Logo' : 'Favicon';
            img.style.maxHeight = type === 'logo' ? '80px' : '48px';
            img.style.maxWidth = type === 'logo' ? '200px' : '48px';
            img.id = previewId;
            preview.parentNode.replaceChild(img, preview);
        }
    };
    reader.readAsDataURL(file);
}

/**
 * Remove logo
 */
function removeLogo() {
    systemSettingsData.system_logo = null;
    systemSettingsData.remove_logo = true;
    const preview = document.getElementById('logoPreview');
    const span = document.createElement('span');
    span.style.color = '#999';
    span.id = 'logoPreview';
    span.textContent = 'No logo uploaded';
    preview.parentNode.replaceChild(span, preview);
    document.getElementById('systemLogoInput').value = '';
}

/**
 * Remove favicon
 */
function removeFavicon() {
    systemSettingsData.favicon = null;
    systemSettingsData.remove_favicon = true;
    const preview = document.getElementById('faviconPreview');
    const span = document.createElement('span');
    span.style.color = '#999';
    span.id = 'faviconPreview';
    span.textContent = 'No favicon uploaded';
    preview.parentNode.replaceChild(span, preview);
    document.getElementById('faviconInput').value = '';
}

/**
 * Save System Settings (Branding)
 */
async function saveSystemSettings(event) {
    if (event) event.preventDefault();
    
    try {
        const formData = new FormData();
        
        // Add text fields
        formData.append('system_name', document.getElementById('systemName').value);
        formData.append('support_email', document.getElementById('supportEmail').value);
        
        // Add logo file if selected
        const logoInput = document.getElementById('systemLogoInput');
        if (logoInput.files.length > 0) {
            formData.append('system_logo', logoInput.files[0]);
        }
        
        // Add favicon file if selected
        const faviconInput = document.getElementById('faviconInput');
        if (faviconInput.files.length > 0) {
            formData.append('favicon', faviconInput.files[0]);
        }
        
        // Add remove flags
        if (systemSettingsData.remove_logo) {
            formData.append('remove_logo', 'true');
        }
        if (systemSettingsData.remove_favicon) {
            formData.append('remove_favicon', 'true');
        }

        const response = await fetch('/api/superadmin/system-branding', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showNotification('System settings saved successfully', 'success');
            
            // Clear branding cache
            localStorage.removeItem('system_branding');
            
            // Always reload page to apply changes correctly
            setTimeout(() => location.reload(), 1000);
        } else {
            showNotification(data.message || 'Error saving settings', 'error');
        }
    } catch (error) {
        console.error('Error saving system settings:', error);
        showNotification('Error saving settings', 'error');
    }
}

/**
 * Save Admin Profile
 */
async function saveAdminProfile(event) {
    if (event) event.preventDefault();
    
    const email = document.getElementById('adminEmail').value;
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validation
    if (newPassword && newPassword !== confirmPassword) {
        showNotification(window.i18n.t('settings.profile.password_mismatch'), 'error');
        return;
    }

    if (newPassword && !currentPassword) {
        showNotification(window.i18n.t('settings.profile.current_password_required'), 'error');
        return;
    }

    try {
        const response = await fetch('/api/superadmin/profile', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                current_password: currentPassword,
                new_password: newPassword
            })
        });

        const data = await response.json();

        if (data.success) {
            showNotification(window.i18n.t('settings.profile.save_success'), 'success');
            // Don't close modal, just clear password fields
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        } else {
            showNotification(data.message || 'Error updating profile', 'error');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showNotification('Error updating profile', 'error');
    }
}

// Initialize dropdown toggle
document.addEventListener('DOMContentLoaded', function() {
    const toggle = document.getElementById('userDropdownToggle');
    const menu = document.getElementById('userDropdownMenu');
    
    if (toggle && menu) {
        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            menu.classList.toggle('show');
        });
        
        document.addEventListener('click', function() {
            menu.classList.remove('show');
        });
    }
});
