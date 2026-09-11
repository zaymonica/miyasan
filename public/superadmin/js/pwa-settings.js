/**
 * PWA Settings Modal
 * Handles PWA icon, preloader, and app settings configuration
 */

let pwaSettingsData = null;

/**
 * Open PWA Settings Modal
 */
async function openPWASettingsModal() {
    try {
        // Load current settings
        const response = await fetch('/api/pwa/settings', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            }
        });
        
        const data = await response.json();
        if (data.success) {
            pwaSettingsData = data.data;
        } else {
            pwaSettingsData = {};
        }
    } catch (error) {
        console.error('Error loading PWA settings:', error);
        pwaSettingsData = {};
    }

    const modalHtml = `
        <div class="modal-overlay active" id="pwaSettingsModal" onclick="closePWASettingsModal(event)">
            <div class="modal-dialog modal-xl" onclick="event.stopPropagation()">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-mobile-alt"></i> <span data-i18n="pwa.settings_title">PWA Settings</span></h3>
                        <button class="modal-close" onclick="closePWASettingsModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="pwa-settings-grid">
                            <!-- Left Column: Settings -->
                            <div class="pwa-settings-form">
                                <form id="pwaSettingsForm" onsubmit="savePWASettings(event)">
                                    <!-- PWA Icon 192x192 -->
                                    <div class="form-group">
                                        <label data-i18n="pwa.icon_192">App Icon (192x192)</label>
                                        <div class="icon-upload-area">
                                            <div class="icon-preview" id="pwaIcon192Preview">
                                                ${pwaSettingsData.pwa_icon_192 ? 
                                                    `<img src="${pwaSettingsData.pwa_icon_192}" alt="Icon 192">` : 
                                                    `<i class="fas fa-image"></i>`
                                                }
                                            </div>
                                            <div class="icon-upload-actions">
                                                <input type="file" id="pwaIcon192Input" accept="image/png,image/jpeg" style="display: none;" onchange="previewPWAIcon(event, '192')">
                                                <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('pwaIcon192Input').click()">
                                                    <i class="fas fa-upload"></i> <span data-i18n="common.upload">Upload</span>
                                                </button>
                                                ${pwaSettingsData.pwa_icon_192 ? 
                                                    `<button type="button" class="btn btn-danger btn-sm" onclick="removePWAIcon('192')">
                                                        <i class="fas fa-trash"></i>
                                                    </button>` : ''
                                                }
                                            </div>
                                        </div>
                                        <small class="form-text" data-i18n="pwa.icon_192_help">Used for home screen icon. PNG format, 192x192 pixels.</small>
                                    </div>

                                    <!-- PWA Icon 512x512 -->
                                    <div class="form-group">
                                        <label data-i18n="pwa.icon_512">Splash Icon (512x512)</label>
                                        <div class="icon-upload-area">
                                            <div class="icon-preview icon-preview-lg" id="pwaIcon512Preview">
                                                ${pwaSettingsData.pwa_icon_512 ? 
                                                    `<img src="${pwaSettingsData.pwa_icon_512}" alt="Icon 512">` : 
                                                    `<i class="fas fa-image"></i>`
                                                }
                                            </div>
                                            <div class="icon-upload-actions">
                                                <input type="file" id="pwaIcon512Input" accept="image/png,image/jpeg" style="display: none;" onchange="previewPWAIcon(event, '512')">
                                                <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('pwaIcon512Input').click()">
                                                    <i class="fas fa-upload"></i> <span data-i18n="common.upload">Upload</span>
                                                </button>
                                                ${pwaSettingsData.pwa_icon_512 ? 
                                                    `<button type="button" class="btn btn-danger btn-sm" onclick="removePWAIcon('512')">
                                                        <i class="fas fa-trash"></i>
                                                    </button>` : ''
                                                }
                                            </div>
                                        </div>
                                        <small class="form-text" data-i18n="pwa.icon_512_help">Used for splash screen. PNG format, 512x512 pixels.</small>
                                    </div>

                                    <!-- Preloader Background Color -->
                                    <div class="form-group">
                                        <label data-i18n="pwa.preloader_bg">Preloader Background Color</label>
                                        <div class="color-picker-wrapper">
                                            <input type="color" id="preloaderBgColor" class="form-control-color" 
                                                value="${pwaSettingsData.preloader_bg_color || '#075E54'}" 
                                                onchange="updatePreloaderPreview()">
                                            <input type="text" id="preloaderBgColorText" class="form-control" 
                                                value="${pwaSettingsData.preloader_bg_color || '#075E54'}" 
                                                onchange="syncColorPicker('preloaderBgColor', this.value); updatePreloaderPreview()">
                                        </div>
                                    </div>

                                    <!-- Preloader Text -->
                                    <div class="form-group">
                                        <label data-i18n="pwa.preloader_text">Preloader Text (Optional)</label>
                                        <input type="text" id="preloaderText" class="form-control" 
                                            value="${pwaSettingsData.preloader_text || ''}" 
                                            maxlength="35"
                                            placeholder="Loading..."
                                            oninput="updatePreloaderPreview()">
                                        <small class="form-text" data-i18n="pwa.preloader_text_help">Max 35 characters. Displayed below the logo.</small>
                                    </div>

                                    <!-- Theme Color -->
                                    <div class="form-group">
                                        <label data-i18n="pwa.theme_color">Theme Color</label>
                                        <div class="color-picker-wrapper">
                                            <input type="color" id="pwaThemeColor" class="form-control-color" 
                                                value="${pwaSettingsData.pwa_theme_color || '#075E54'}" 
                                                onchange="updateMobilePreview()">
                                            <input type="text" id="pwaThemeColorText" class="form-control" 
                                                value="${pwaSettingsData.pwa_theme_color || '#075E54'}" 
                                                onchange="syncColorPicker('pwaThemeColor', this.value); updateMobilePreview()">
                                        </div>
                                        <small class="form-text" data-i18n="pwa.theme_color_help">Browser toolbar color on mobile devices.</small>
                                    </div>
                                </form>
                            </div>

                            <!-- Right Column: Previews -->
                            <div class="pwa-settings-preview">
                                <!-- Preloader Preview -->
                                <div class="preview-section">
                                    <h4 data-i18n="pwa.preloader_preview">Preloader Preview</h4>
                                    <div class="preloader-preview-container" id="preloaderPreviewContainer">
                                        <div class="preloader-preview" id="preloaderPreview" style="background: ${pwaSettingsData.preloader_bg_color || '#075E54'}">
                                            <div class="preloader-logo">
                                                <img src="${pwaSettingsData.pwa_icon_192 || '/images/default-pwa-icon.svg'}" alt="Logo" id="preloaderLogoPreview">
                                            </div>
                                            <div class="preloader-spinner"></div>
                                            <div class="preloader-text" id="preloaderTextPreview">${pwaSettingsData.preloader_text || ''}</div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Mobile Home Screen Preview -->
                                <div class="preview-section">
                                    <h4 data-i18n="pwa.mobile_preview">Home Screen Preview</h4>
                                    <div class="mobile-preview-container">
                                        <div class="mobile-preview">
                                            <div class="mobile-status-bar" id="mobileStatusBar" style="background: ${pwaSettingsData.pwa_theme_color || '#075E54'}">
                                                <span>9:41</span>
                                                <span><i class="fas fa-signal"></i> <i class="fas fa-wifi"></i> <i class="fas fa-battery-full"></i></span>
                                            </div>
                                            <div class="mobile-home-screen">
                                                <div class="app-icon-grid">
                                                    <div class="app-icon placeholder"></div>
                                                    <div class="app-icon placeholder"></div>
                                                    <div class="app-icon placeholder"></div>
                                                    <div class="app-icon pwa-icon" id="mobileAppIcon">
                                                        <img src="${pwaSettingsData.pwa_icon_192 || '/images/default-pwa-icon.svg'}" alt="App">
                                                        <span>Misayan</span>
                                                    </div>
                                                    <div class="app-icon placeholder"></div>
                                                    <div class="app-icon placeholder"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="closePWASettingsModal()" data-i18n="common.cancel">Cancel</button>
                        <button type="button" class="btn btn-primary" onclick="savePWASettings()">
                            <i class="fas fa-save"></i> <span data-i18n="common.save">Save Settings</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHtml;
    
    // Add styles for the modal
    addPWAModalStyles();
}

/**
 * Add PWA modal specific styles
 */
function addPWAModalStyles() {
    if (document.getElementById('pwaModalStyles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'pwaModalStyles';
    styles.textContent = `
        .pwa-settings-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
        }
        
        .pwa-settings-form {
            padding-right: 20px;
            border-right: 1px solid #e9edef;
        }
        
        .icon-upload-area {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-top: 8px;
        }
        
        .icon-preview {
            width: 64px;
            height: 64px;
            border: 2px dashed #ddd;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f8f9fa;
            overflow: hidden;
        }
        
        .icon-preview.icon-preview-lg {
            width: 80px;
            height: 80px;
        }
        
        .icon-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        
        .icon-preview i {
            font-size: 24px;
            color: #ccc;
        }
        
        .icon-upload-actions {
            display: flex;
            gap: 8px;
        }
        
        .color-picker-wrapper {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        
        .form-control-color {
            width: 50px;
            height: 38px;
            padding: 2px;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .preview-section {
            margin-bottom: 30px;
        }
        
        .preview-section h4 {
            margin-bottom: 15px;
            font-size: 14px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .preloader-preview-container {
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .preloader-preview {
            width: 100%;
            height: 200px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 15px;
        }
        
        .preloader-logo {
            width: 60px;
            height: 60px;
        }
        
        .preloader-logo img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
        
        .preloader-spinner {
            width: 30px;
            height: 30px;
            border: 3px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        .preloader-text {
            color: white;
            font-size: 14px;
            font-weight: 500;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .mobile-preview-container {
            display: flex;
            justify-content: center;
        }
        
        .mobile-preview {
            width: 180px;
            height: 320px;
            background: #1a1a1a;
            border-radius: 24px;
            padding: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        
        .mobile-status-bar {
            height: 24px;
            border-radius: 16px 16px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 12px;
            color: white;
            font-size: 10px;
        }
        
        .mobile-home-screen {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: calc(100% - 24px);
            border-radius: 0 0 16px 16px;
            padding: 20px 10px;
        }
        
        .app-icon-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
        }
        
        .app-icon {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        }
        
        .app-icon.placeholder::before {
            content: '';
            width: 40px;
            height: 40px;
            background: rgba(255,255,255,0.2);
            border-radius: 10px;
        }
        
        .app-icon.pwa-icon img {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        .app-icon.pwa-icon span {
            color: white;
            font-size: 9px;
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        }
        
        @media (max-width: 768px) {
            .pwa-settings-grid {
                grid-template-columns: 1fr;
            }
            
            .pwa-settings-form {
                padding-right: 0;
                border-right: none;
                border-bottom: 1px solid #e9edef;
                padding-bottom: 20px;
            }
        }
    `;
    document.head.appendChild(styles);
}

/**
 * Close PWA Settings Modal
 */
function closePWASettingsModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modalContainer').innerHTML = '';
}

/**
 * Preview PWA icon
 */
function previewPWAIcon(event, size) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const previewId = `pwaIcon${size}Preview`;
        const preview = document.getElementById(previewId);
        
        preview.innerHTML = `<img src="${e.target.result}" alt="Icon ${size}">`;
        
        // Update other previews
        if (size === '192') {
            document.getElementById('preloaderLogoPreview').src = e.target.result;
            document.querySelector('#mobileAppIcon img').src = e.target.result;
        }
    };
    reader.readAsDataURL(file);
}

/**
 * Remove PWA icon
 */
function removePWAIcon(size) {
    const previewId = `pwaIcon${size}Preview`;
    const preview = document.getElementById(previewId);
    preview.innerHTML = '<i class="fas fa-image"></i>';
    
    const inputId = `pwaIcon${size}Input`;
    document.getElementById(inputId).value = '';
    
    pwaSettingsData[`pwa_icon_${size}`] = null;
    pwaSettingsData[`remove_icon_${size}`] = true;
    
    if (size === '192') {
        document.getElementById('preloaderLogoPreview').src = '/images/default-pwa-icon.svg';
        document.querySelector('#mobileAppIcon img').src = '/images/default-pwa-icon.svg';
    }
}

/**
 * Sync color picker with text input
 */
function syncColorPicker(pickerId, value) {
    const picker = document.getElementById(pickerId);
    if (picker && /^#[0-9A-Fa-f]{6}$/.test(value)) {
        picker.value = value;
    }
}

/**
 * Update preloader preview
 */
function updatePreloaderPreview() {
    const bgColor = document.getElementById('preloaderBgColor').value;
    const text = document.getElementById('preloaderText').value;
    
    document.getElementById('preloaderBgColorText').value = bgColor;
    document.getElementById('preloaderPreview').style.background = bgColor;
    document.getElementById('preloaderTextPreview').textContent = text;
}

/**
 * Update mobile preview
 */
function updateMobilePreview() {
    const themeColor = document.getElementById('pwaThemeColor').value;
    document.getElementById('pwaThemeColorText').value = themeColor;
    document.getElementById('mobileStatusBar').style.background = themeColor;
}

/**
 * Save PWA Settings
 */
async function savePWASettings() {
    try {
        const formData = new FormData();
        
        // Add color and text settings
        formData.append('preloader_bg_color', document.getElementById('preloaderBgColor').value);
        formData.append('preloader_text', document.getElementById('preloaderText').value);
        formData.append('pwa_theme_color', document.getElementById('pwaThemeColor').value);
        formData.append('pwa_background_color', document.getElementById('preloaderBgColor').value);
        
        // Add icon files
        const icon192Input = document.getElementById('pwaIcon192Input');
        if (icon192Input.files.length > 0) {
            formData.append('pwa_icon_192_file', icon192Input.files[0]);
        }
        
        const icon512Input = document.getElementById('pwaIcon512Input');
        if (icon512Input.files.length > 0) {
            formData.append('pwa_icon_512_file', icon512Input.files[0]);
        }
        
        // Add remove flags
        if (pwaSettingsData.remove_icon_192) {
            formData.append('remove_icon_192', 'true');
        }
        if (pwaSettingsData.remove_icon_512) {
            formData.append('remove_icon_512', 'true');
        }

        const response = await fetch('/api/pwa/settings', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showNotification('PWA settings saved successfully', 'success');
            closePWASettingsModal();
        } else {
            showNotification(data.message || 'Error saving settings', 'error');
        }
    } catch (error) {
        console.error('Error saving PWA settings:', error);
        showNotification('Error saving settings', 'error');
    }
}
