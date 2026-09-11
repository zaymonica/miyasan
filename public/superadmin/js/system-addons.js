/**
 * System Add-ons Module
 * Manages system add-ons/plugins for the SuperAdmin panel
 */

window.systemAddonsModule = {
    addons: [],

    init: function() {
        this.render();
        this.loadAddons();
    },

    render: function() {
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="page-header">
                <h1><i class="fas fa-plug"></i> <span data-i18n="system_addons.title">System Add-ons</span></h1>
                <p data-i18n="system_addons.description">Upload and manage system extensions and plugins</p>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3><i class="fas fa-upload"></i> <span data-i18n="system_addons.upload">Upload Add-on</span></h3>
                </div>
                <div class="card-body">
                    <div class="upload-zone" id="uploadZone">
                        <div class="upload-zone-content">
                            <i class="fas fa-cloud-upload-alt"></i>
                            <p data-i18n="system_addons.drag_drop">Drag & drop your add-on ZIP file here</p>
                            <span data-i18n="system_addons.or">or</span>
                            <button class="btn btn-primary" onclick="document.getElementById('addonFile').click()">
                                <i class="fas fa-folder-open"></i> <span data-i18n="system_addons.browse">Browse Files</span>
                            </button>
                            <input type="file" id="addonFile" accept=".zip" style="display: none;" onchange="systemAddonsModule.handleFileSelect(event)">
                        </div>
                        <div class="upload-progress" id="uploadProgress" style="display: none;">
                            <div class="progress-bar">
                                <div class="progress-fill" id="progressFill"></div>
                            </div>
                            <p id="uploadStatus">Uploading...</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card mt-4">
                <div class="card-header">
                    <h3><i class="fas fa-puzzle-piece"></i> <span data-i18n="system_addons.installed">Installed Add-ons</span></h3>
                    <div class="card-actions">
                        <button class="btn btn-secondary btn-sm" onclick="systemAddonsModule.loadAddons()">
                            <i class="fas fa-sync-alt"></i> <span data-i18n="common.refresh">Refresh</span>
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div id="addonsContainer">
                        <div class="loading">
                            <div class="spinner"></div>
                            <p data-i18n="common.loading">Loading...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupDragDrop();
        
        if (typeof i18n !== 'undefined') {
            i18n.translatePage();
        }
    },

    setupDragDrop: function() {
        const uploadZone = document.getElementById('uploadZone');
        if (!uploadZone) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            uploadZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            uploadZone.addEventListener(eventName, () => {
                uploadZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            uploadZone.addEventListener(eventName, () => {
                uploadZone.classList.remove('drag-over');
            });
        });

        uploadZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.uploadAddon(files[0]);
            }
        });
    },

    handleFileSelect: function(event) {
        const file = event.target.files[0];
        if (file) {
            this.uploadAddon(file);
        }
    },

    uploadAddon: async function(file) {
        if (!file.name.endsWith('.zip')) {
            window.showNotification('Only ZIP files are allowed', 'error');
            return;
        }

        const uploadProgress = document.getElementById('uploadProgress');
        const uploadContent = document.querySelector('.upload-zone-content');
        const progressFill = document.getElementById('progressFill');
        const uploadStatus = document.getElementById('uploadStatus');

        uploadContent.style.display = 'none';
        uploadProgress.style.display = 'block';
        progressFill.style.width = '0%';
        uploadStatus.textContent = 'Uploading...';

        const formData = new FormData();
        formData.append('addon', file);

        try {
            // Simulate progress
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += 10;
                if (progress <= 90) {
                    progressFill.style.width = progress + '%';
                }
            }, 200);

            const response = await fetch('/api/superadmin/system-addons/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${state.token}`
                },
                body: formData
            });

            clearInterval(progressInterval);
            progressFill.style.width = '100%';

            const data = await response.json();

            if (data.success) {
                uploadStatus.textContent = 'Upload complete!';
                window.showNotification(data.message || 'Add-on installed successfully', 'success');
                
                setTimeout(() => {
                    uploadContent.style.display = 'block';
                    uploadProgress.style.display = 'none';
                    document.getElementById('addonFile').value = '';
                    this.loadAddons();
                }, 1000);
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (error) {
            uploadStatus.textContent = 'Upload failed!';
            window.showNotification(error.message, 'error');
            
            setTimeout(() => {
                uploadContent.style.display = 'block';
                uploadProgress.style.display = 'none';
            }, 2000);
        }
    },

    loadAddons: async function() {
        const container = document.getElementById('addonsContainer');
        
        try {
            const data = await apiRequest('/superadmin/system-addons');
            this.addons = data.data.addons || [];
            this.renderAddons();
        } catch (error) {
            container.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-circle"></i> ${error.message}
                </div>
            `;
        }
    },

    renderAddons: function() {
        const container = document.getElementById('addonsContainer');

        if (this.addons.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-puzzle-piece"></i>
                    <h3 data-i18n="system_addons.no_addons">No Add-ons Installed</h3>
                    <p data-i18n="system_addons.no_addons_desc">Upload your first add-on to get started</p>
                </div>
            `;
            if (typeof i18n !== 'undefined') i18n.translatePage();
            return;
        }

        container.innerHTML = `
            <div class="addons-grid">
                ${this.addons.map(addon => this.renderAddonCard(addon)).join('')}
            </div>
        `;

        if (typeof i18n !== 'undefined') i18n.translatePage();
    },

    renderAddonCard: function(addon) {
        const statusClass = addon.active ? 'active' : 'inactive';
        const statusText = addon.active ? 'Active' : 'Inactive';
        const iconClass = this.getIconClass(addon.icon);
        
        // Check if addon has an image icon - use public URL with fallback
        let iconHtml;
        if (addon.has_icon_image && addon.directory) {
            iconHtml = `<img src="/addons/${addon.directory}/icon.png" alt="${this.escapeHtml(addon.name)}" class="addon-icon-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><i class="${iconClass}" style="display:none;"></i>`;
        } else {
            iconHtml = `<i class="${iconClass}"></i>`;
        }

        return `
            <div class="addon-card ${statusClass}">
                <div class="addon-icon">
                    ${iconHtml}
                </div>
                <div class="addon-info">
                    <h4 class="addon-name">${this.escapeHtml(addon.name)}</h4>
                    <p class="addon-description">${this.escapeHtml(addon.description || 'No description')}</p>
                    <div class="addon-meta">
                        <span class="addon-version"><i class="fas fa-tag"></i> v${addon.version || '1.0.0'}</span>
                        <span class="addon-author"><i class="fas fa-user"></i> ${this.escapeHtml(addon.author || 'Unknown')}</span>
                    </div>
                </div>
                <div class="addon-actions">
                    <div class="addon-toggle">
                        <label class="switch">
                            <input type="checkbox" ${addon.active ? 'checked' : ''} onchange="systemAddonsModule.toggleAddon(${addon.id}, this.checked)">
                            <span class="slider"></span>
                        </label>
                        <span class="toggle-label">${statusText}</span>
                    </div>
                    <div class="addon-buttons">
                        <button class="btn btn-sm btn-danger" onclick="systemAddonsModule.deleteAddon(${addon.id}, '${this.escapeHtml(addon.name)}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    },

    getIconClass: function(icon) {
        if (!icon) return 'fas fa-puzzle-piece';
        
        // Check if it's already a full class
        if (icon.startsWith('fa')) return icon;
        
        // Map common icon names to FontAwesome classes
        const iconMap = {
            'puzzle-piece': 'fas fa-puzzle-piece',
            'link': 'fas fa-link',
            'cog': 'fas fa-cog',
            'plug': 'fas fa-plug',
            'cube': 'fas fa-cube',
            'box': 'fas fa-box',
            'star': 'fas fa-star',
            'bolt': 'fas fa-bolt',
            'rocket': 'fas fa-rocket',
            'magic': 'fas fa-magic',
            'paint-brush': 'fas fa-paint-brush',
            'palette': 'fas fa-palette',
            'chart-line': 'fas fa-chart-line',
            'database': 'fas fa-database',
            'cloud': 'fas fa-cloud',
            'shield': 'fas fa-shield-alt',
            'lock': 'fas fa-lock',
            'users': 'fas fa-users',
            'envelope': 'fas fa-envelope',
            'bell': 'fas fa-bell',
            'calendar': 'fas fa-calendar',
            'file': 'fas fa-file',
            'image': 'fas fa-image',
            'video': 'fas fa-video',
            'music': 'fas fa-music',
            'shopping-cart': 'fas fa-shopping-cart',
            'credit-card': 'fas fa-credit-card',
            'qrcode': 'fas fa-qrcode'
        };

        return iconMap[icon] || `fas fa-${icon}`;
    },

    toggleAddon: async function(id, active) {
        try {
            const data = await apiRequest(`/superadmin/system-addons/${id}/toggle`, {
                method: 'PUT'
            });

            window.showNotification(data.message || `Add-on ${active ? 'activated' : 'deactivated'}`, 'success');
            this.loadAddons();
        } catch (error) {
            window.showNotification(error.message, 'error');
            this.loadAddons(); // Reload to reset toggle state
        }
    },

    deleteAddon: function(id, name) {
        window.showConfirm(
            `Are you sure you want to delete "${name}"? This action cannot be undone.`,
            async () => {
                try {
                    const data = await apiRequest(`/superadmin/system-addons/${id}`, {
                        method: 'DELETE'
                    });

                    window.showNotification(data.message || 'Add-on deleted successfully', 'success');
                    this.loadAddons();
                } catch (error) {
                    window.showNotification(error.message, 'error');
                }
            }
        );
    },

    escapeHtml: function(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
