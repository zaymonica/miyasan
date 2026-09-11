/**
 * Bio Link Module
 * Manages bio link pages, short links, QR codes, files, vcards, and events
 * 
 * IMPORTANT: This module requires the 'biolink' addon to be installed and active
 */

const BioLink = {
    projects: [],
    currentProject: null,
    currentPage: null,
    limits: {},
    usage: {},
    blockTypes: [],
    addonActive: false,

    // Initialize module
    init: async function() {
        console.log('🔗 Initializing Bio Link module...');
        
        // Check if addon is active
        const addonStatus = await this.checkAddonStatus();
        if (!addonStatus.active) {
            this.renderAddonDisabled(addonStatus);
            return;
        }
        
        this.addonActive = true;
        await this.loadLimits();
        await this.loadBlockTypes();
        await this.loadProjects();
        this.render();
    },

    // Check if biolink addon is active
    checkAddonStatus: async function() {
        try {
            const response = await api.get('/addon-status/biolink');
            if (response.success && response.data) {
                return {
                    installed: response.data.installed,
                    active: response.data.active
                };
            }
        } catch (error) {
            console.error('Error checking biolink addon status:', error);
        }
        return { installed: false, active: false };
    },

    // Render addon disabled message
    renderAddonDisabled: function(status) {
        const container = document.getElementById('biolink-page');
        if (!container) return;

        const message = !status.installed 
            ? 'The Bio Link addon is not installed. Please contact your administrator to install it.'
            : 'The Bio Link addon is not active. Please contact your administrator to activate it.';

        container.innerHTML = `
            <div class="addon-disabled-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; text-align: center; padding: 40px;">
                <div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 12px; padding: 40px; max-width: 500px;">
                    <i class="fas fa-lock" style="font-size: 48px; color: #721c24; margin-bottom: 20px;"></i>
                    <h2 style="color: #721c24; margin-bottom: 15px;" data-i18n="biolink.addon_disabled">Bio Link Unavailable</h2>
                    <p style="color: #856404; margin-bottom: 20px;">${message}</p>
                    <a href="#dashboard" class="btn btn-secondary" onclick="navigateTo('dashboard')">
                        <i class="fas fa-arrow-left"></i> <span data-i18n="common.back_to_dashboard">Back to Dashboard</span>
                    </a>
                </div>
            </div>
        `;

        // Apply translations
        if (window.applyTranslations) {
            window.applyTranslations();
        }
    },

    // Load tenant limits
    loadLimits: async function() {
        try {
            const response = await api.get('/biolink/limits');
            if (response.success) {
                this.limits = response.data.limits || {};
                this.usage = response.data.usage || {};
            }
        } catch (error) {
            console.error('Error loading biolink limits:', error);
            // Check if error is due to addon not being active
            if (error.message && error.message.includes('addon')) {
                this.addonActive = false;
                this.renderAddonDisabled({ installed: true, active: false });
            }
        }
    },

    // Load block types
    loadBlockTypes: async function() {
        try {
            const response = await api.get('/biolink/block-types');
            if (response.success) {
                this.blockTypes = response.data || [];
            }
        } catch (error) {
            console.error('Error loading block types:', error);
        }
    },

    // Load projects
    loadProjects: async function() {
        try {
            const response = await api.get('/biolink/projects');
            if (response.success) {
                this.projects = response.data.projects || [];
            }
        } catch (error) {
            console.error('Error loading projects:', error);
        }
    },

    // Main render function
    render: function() {
        const container = document.getElementById('biolink-page');
        if (!container) return;

        container.innerHTML = `
            <div class="page-header">
                <h1><i class="fas fa-link"></i> <span data-i18n="biolink.title">Bio Link</span></h1>
                <div class="header-actions">
                    <button class="btn btn-primary" onclick="BioLink.showCreateModal()">
                        <i class="fas fa-plus"></i> <span data-i18n="biolink.create_new">Create New</span>
                    </button>
                </div>
            </div>

            <!-- Usage Stats -->
            <div class="biolink-stats">
                ${this.renderUsageStats()}
            </div>

            <!-- Tabs -->
            <div class="biolink-tabs">
                <button class="tab-btn active" data-type="all" onclick="BioLink.filterByType('all')">
                    <i class="fas fa-th-large"></i> All
                </button>
                <button class="tab-btn" data-type="biopage" onclick="BioLink.filterByType('biopage')">
                    <i class="fas fa-id-card"></i> Bio Pages
                </button>
                <button class="tab-btn" data-type="shortlink" onclick="BioLink.filterByType('shortlink')">
                    <i class="fas fa-link"></i> Short Links
                </button>
                <button class="tab-btn" data-type="qrcode" onclick="BioLink.filterByType('qrcode')">
                    <i class="fas fa-qrcode"></i> QR Codes
                </button>
                <button class="tab-btn" data-type="file" onclick="BioLink.filterByType('file')">
                    <i class="fas fa-file"></i> Files
                </button>
                <button class="tab-btn" data-type="vcard" onclick="BioLink.filterByType('vcard')">
                    <i class="fas fa-address-card"></i> vCards
                </button>
                <button class="tab-btn" data-type="event" onclick="BioLink.filterByType('event')">
                    <i class="fas fa-calendar"></i> Events
                </button>
            </div>

            <!-- Projects Grid -->
            <div class="biolink-projects" id="biolinkProjects">
                ${this.renderProjects()}
            </div>
        `;

        if (typeof i18n !== 'undefined') {
            i18n.translatePage();
        }
    },

    // Render usage stats
    renderUsageStats: function() {
        const stats = [
            { key: 'biopage', icon: 'fa-id-card', label: 'Bio Pages', limit: this.limits.bio_pages || 0 },
            { key: 'shortlink', icon: 'fa-link', label: 'Short Links', limit: this.limits.short_links || 0 },
            { key: 'qrcode', icon: 'fa-qrcode', label: 'QR Codes', limit: this.limits.qr_codes || 0 },
            { key: 'file', icon: 'fa-file', label: 'Files', limit: this.limits.file_transfers || 0 },
            { key: 'vcard', icon: 'fa-address-card', label: 'vCards', limit: this.limits.vcards || 0 },
            { key: 'event', icon: 'fa-calendar', label: 'Events', limit: this.limits.event_links || 0 }
        ];

        return stats.map(stat => {
            const used = this.usage[stat.key] || 0;
            const percentage = stat.limit > 0 ? Math.min((used / stat.limit) * 100, 100) : 0;
            const isDisabled = stat.limit <= 0;

            return `
                <div class="stat-card ${isDisabled ? 'disabled' : ''}">
                    <div class="stat-icon"><i class="fas ${stat.icon}"></i></div>
                    <div class="stat-info">
                        <div class="stat-label">${stat.label}</div>
                        <div class="stat-value">${isDisabled ? 'Disabled' : `${used} / ${stat.limit}`}</div>
                        ${!isDisabled ? `<div class="stat-bar"><div class="stat-fill" style="width: ${percentage}%"></div></div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    // Render projects grid
    renderProjects: function(filter = 'all') {
        let filtered = this.projects;
        if (filter !== 'all') {
            filtered = this.projects.filter(p => p.type === filter);
        }

        if (filtered.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-link"></i>
                    <h3>No projects yet</h3>
                    <p>Create your first bio link, short link, or QR code</p>
                    <button class="btn btn-primary" onclick="BioLink.showCreateModal()">
                        <i class="fas fa-plus"></i> Create New
                    </button>
                </div>
            `;
        }

        return `
            <div class="projects-grid">
                ${filtered.map(project => this.renderProjectCard(project)).join('')}
            </div>
        `;
    },

    // Render single project card
    renderProjectCard: function(project) {
        const typeIcons = {
            biopage: 'fa-id-card',
            shortlink: 'fa-link',
            qrcode: 'fa-qrcode',
            file: 'fa-file',
            vcard: 'fa-address-card',
            event: 'fa-calendar',
            html: 'fa-code'
        };

        const typeLabels = {
            biopage: 'Bio Page',
            shortlink: 'Short Link',
            qrcode: 'QR Code',
            file: 'File Transfer',
            vcard: 'vCard',
            event: 'Event',
            html: 'HTML Page'
        };

        const statusClass = project.status === 'active' ? 'active' : project.status === 'draft' ? 'draft' : 'inactive';

        return `
            <div class="project-card ${statusClass}" data-id="${project.id}">
                <div class="project-header">
                    <div class="project-type">
                        <i class="fas ${typeIcons[project.type] || 'fa-link'}"></i>
                        <span>${typeLabels[project.type] || project.type}</span>
                    </div>
                    <div class="project-status">
                        <span class="status-badge ${statusClass}">${project.status}</span>
                    </div>
                </div>
                <div class="project-body">
                    <h4 class="project-name">${this.escapeHtml(project.name)}</h4>
                    <div class="project-slug">
                        <i class="fas fa-link"></i>
                        <span>/b/${project.slug}</span>
                        <button class="btn-icon" onclick="BioLink.copyLink('${project.slug}')" title="Copy link">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    <div class="project-stats">
                        <div class="stat">
                            <i class="fas fa-eye"></i>
                            <span>${project.total_views || project.clicks || 0}</span>
                        </div>
                        <div class="stat">
                            <i class="fas fa-clock"></i>
                            <span>${this.formatDate(project.created_at)}</span>
                        </div>
                    </div>
                </div>
                <div class="project-actions">
                    <button class="btn btn-sm btn-primary" onclick="BioLink.editProject(${project.id})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="BioLink.viewAnalytics(${project.id})">
                        <i class="fas fa-chart-bar"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="BioLink.deleteProject(${project.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    },

    // Filter by type
    filterByType: function(type) {
        document.querySelectorAll('.biolink-tabs .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        const container = document.getElementById('biolinkProjects');
        if (container) {
            container.innerHTML = this.renderProjects(type);
        }
    },

    // Show create modal
    showCreateModal: function() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'createProjectModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-medium">
                <div class="modal-header">
                    <h3><i class="fas fa-plus"></i> Create New Project</h3>
                    <button class="modal-close" onclick="BioLink.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="create-type-grid">
                        ${this.renderCreateOptions()}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    // Render create options
    renderCreateOptions: function() {
        const options = [
            { type: 'biopage', icon: 'fa-id-card', label: 'Bio Page', desc: 'Create a customizable bio link page', limit: this.limits.bio_pages },
            { type: 'shortlink', icon: 'fa-link', label: 'Short Link', desc: 'Shorten any URL', limit: this.limits.short_links },
            { type: 'qrcode', icon: 'fa-qrcode', label: 'QR Code', desc: 'Generate QR codes', limit: this.limits.qr_codes },
            { type: 'file', icon: 'fa-file', label: 'File Transfer', desc: 'Share files securely', limit: this.limits.file_transfers },
            { type: 'vcard', icon: 'fa-address-card', label: 'vCard', desc: 'Share contact info', limit: this.limits.vcards },
            { type: 'event', icon: 'fa-calendar', label: 'Event Link', desc: 'Create event pages', limit: this.limits.event_links }
        ];

        return options.map(opt => {
            const used = this.usage[opt.type] || 0;
            const isDisabled = !opt.limit || opt.limit <= 0;
            const isAtLimit = opt.limit > 0 && used >= opt.limit;

            return `
                <div class="create-option ${isDisabled || isAtLimit ? 'disabled' : ''}" 
                     onclick="${!isDisabled && !isAtLimit ? `BioLink.showCreateForm('${opt.type}')` : ''}">
                    <div class="option-icon"><i class="fas ${opt.icon}"></i></div>
                    <div class="option-info">
                        <h4>${opt.label}</h4>
                        <p>${opt.desc}</p>
                        ${isDisabled ? '<span class="badge badge-warning">Not available in your plan</span>' : 
                          isAtLimit ? `<span class="badge badge-danger">Limit reached (${used}/${opt.limit})</span>` :
                          `<span class="badge badge-success">${used}/${opt.limit} used</span>`}
                    </div>
                </div>
            `;
        }).join('');
    },

    // Show create form
    showCreateForm: function(type) {
        this.closeModal();

        const typeLabels = {
            biopage: 'Bio Page',
            shortlink: 'Short Link',
            qrcode: 'QR Code',
            file: 'File Transfer',
            vcard: 'vCard',
            event: 'Event Link'
        };

        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'createFormModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-medium">
                <div class="modal-header">
                    <h3><i class="fas fa-plus"></i> Create ${typeLabels[type]}</h3>
                    <button class="modal-close" onclick="BioLink.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="createProjectForm" onsubmit="BioLink.createProject(event, '${type}')">
                        <div class="form-group">
                            <label>Name *</label>
                            <input type="text" name="name" class="form-control" required placeholder="Enter a name for your ${typeLabels[type].toLowerCase()}">
                        </div>
                        <div class="form-group">
                            <label>Custom Slug (optional)</label>
                            <div class="input-group">
                                <span class="input-prefix">/b/</span>
                                <input type="text" name="slug" class="form-control" placeholder="auto-generated">
                            </div>
                            <small>Leave empty for auto-generated slug</small>
                        </div>
                        ${type === 'shortlink' ? `
                            <div class="form-group">
                                <label>Destination URL *</label>
                                <input type="url" name="destination_url" class="form-control" required placeholder="https://example.com">
                            </div>
                        ` : ''}
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="BioLink.closeModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Create</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    // Create project
    createProject: async function(event, type) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);

        const data = {
            name: formData.get('name'),
            type: type,
            slug: formData.get('slug') || undefined
        };

        try {
            const response = await api.post('/biolink/projects', data);
            if (response.success) {
                showNotification('Project created successfully!', 'success');
                this.closeModal();
                await this.loadProjects();
                this.render();

                // If biopage, open editor
                if (type === 'biopage') {
                    this.editProject(response.data.id);
                }
            } else {
                showNotification(response.message || 'Error creating project', 'error');
            }
        } catch (error) {
            showNotification(error.message || 'Error creating project', 'error');
        }
    },

    // Edit project
    editProject: async function(id) {
        try {
            const response = await api.get(`/biolink/projects/${id}`);
            if (response.success) {
                this.currentProject = response.data;
                
                if (this.currentProject.type === 'biopage') {
                    this.openBioPageEditor();
                } else {
                    this.openProjectEditor();
                }
            }
        } catch (error) {
            showNotification(error.message || 'Error loading project', 'error');
        }
    },

    // Open bio page editor - New Design with blocks list
    openBioPageEditor: function() {
        const container = document.getElementById('biolink-page');
        if (!container) return;

        // Hide sidebar for fullscreen editor
        document.body.classList.add('biolink-editor-fullscreen');

        const page = this.currentProject.page || {};
        const blocks = page.blocks || [];

        container.innerHTML = `
            <div class="biopage-editor-v2">
                <!-- Editor Header -->
                <div class="editor-header-v2">
                    <div class="editor-nav">
                        <button class="btn-back" onclick="BioLink.closeEditor()">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <div class="editor-breadcrumb">
                            <span class="breadcrumb-link" onclick="BioLink.closeEditor()">Bio Links</span>
                            <i class="fas fa-chevron-right"></i>
                            <span class="breadcrumb-current">${this.escapeHtml(this.currentProject.name)}</span>
                        </div>
                    </div>
                    <div class="editor-status">
                        <span class="status-indicator ${this.currentProject.status === 'active' ? 'active' : ''}"></span>
                        <span class="status-text">${this.currentProject.status === 'active' ? 'Published' : 'Draft'}</span>
                    </div>
                </div>

                <!-- Editor Content -->
                <div class="editor-content-v2">
                    <!-- Left Panel - Blocks List -->
                    <div class="editor-panel-left">
                        <div class="panel-tabs">
                            <button class="panel-tab active" data-tab="blocks" onclick="BioLink.switchPanelTab('blocks')">
                                <i class="fas fa-th-large"></i> Blocks
                            </button>
                            <button class="panel-tab" data-tab="settings" onclick="BioLink.switchPanelTab('settings')">
                                <i class="fas fa-cog"></i> Settings
                            </button>
                        </div>
                        
                        <div class="panel-content" id="panelContent">
                            <!-- Add Block Button -->
                            <button class="btn-add-block" onclick="BioLink.showAddBlockModal()">
                                <i class="fas fa-plus"></i> Add block
                            </button>
                            
                            <!-- Blocks List -->
                            <div class="blocks-list" id="blocksList">
                                ${this.renderBlocksList(blocks)}
                            </div>
                        </div>
                    </div>

                    <!-- Right Panel - Phone Preview -->
                    <div class="editor-panel-right">
                        <div class="preview-header">
                            <button class="btn btn-sm btn-secondary" onclick="BioLink.previewPage()">
                                <i class="fas fa-external-link-alt"></i> Open Preview
                            </button>
                            <button class="btn btn-sm btn-primary" onclick="BioLink.savePage()">
                                <i class="fas fa-save"></i> Save
                            </button>
                            <button class="btn btn-sm btn-success" onclick="BioLink.publishPage()">
                                <i class="fas fa-globe"></i> Publish
                            </button>
                        </div>
                        <div class="phone-preview-container">
                            <div class="phone-frame-v2">
                                <div class="phone-notch"></div>
                                <div class="phone-screen-v2" id="phoneScreen">
                                    ${this.renderPhonePreview(page, blocks)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.initBlocksDragDrop();
    },

    // Render blocks list for left panel
    renderBlocksList: function(blocks) {
        if (!blocks || blocks.length === 0) {
            return `
                <div class="blocks-empty">
                    <i class="fas fa-layer-group"></i>
                    <p>No blocks yet</p>
                    <span>Click "Add block" to get started</span>
                </div>
            `;
        }

        return blocks.map((block, index) => {
            const content = typeof block.content === 'string' ? JSON.parse(block.content || '{}') : block.content || {};
            const blockInfo = this.getBlockTypeInfo(block.type);
            
            return `
                <div class="block-item-v2" data-block-id="${block.id}" data-position="${index}">
                    <div class="block-drag-handle">
                        <i class="fas fa-grip-vertical"></i>
                    </div>
                    <div class="block-icon" style="background: ${blockInfo.color}">
                        <i class="${blockInfo.icon}"></i>
                    </div>
                    <div class="block-info">
                        <span class="block-title">${this.escapeHtml(block.title || blockInfo.name)}</span>
                        <span class="block-type">${blockInfo.name}</span>
                    </div>
                    <div class="block-actions">
                        <label class="toggle-switch">
                            <input type="checkbox" ${block.is_active !== false ? 'checked' : ''} onchange="BioLink.toggleBlockActive(${block.id}, this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                        <div class="block-menu">
                            <button class="btn-icon" onclick="BioLink.showBlockMenu(${block.id}, event)">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // Get block type info
    getBlockTypeInfo: function(type) {
        const types = {
            // Standard blocks
            link_url: { name: 'Link', icon: 'fas fa-link', color: '#3b82f6' },
            heading_text: { name: 'Heading', icon: 'fas fa-heading', color: '#8b5cf6' },
            paragraph_text: { name: 'Paragraph', icon: 'fas fa-paragraph', color: '#6366f1' },
            avatar_image: { name: 'Avatar', icon: 'fas fa-user-circle', color: '#ec4899' },
            custom_image: { name: 'Image', icon: 'fas fa-image', color: '#14b8a6' },
            social_links: { name: 'Social Links', icon: 'fas fa-share-alt', color: '#f59e0b' },
            divider: { name: 'Divider', icon: 'fas fa-minus', color: '#94a3b8' },
            // Advanced blocks
            email_signup: { name: 'Email Signup', icon: 'fas fa-envelope', color: '#06b6d4' },
            phone_collector: { name: 'Phone Collector', icon: 'fas fa-phone', color: '#84cc16' },
            contact_form: { name: 'Contact Form', icon: 'fas fa-address-card', color: '#8b5cf6' },
            // Embed blocks
            youtube_embed: { name: 'YouTube', icon: 'fab fa-youtube', color: '#ef4444' },
            spotify_embed: { name: 'Spotify', icon: 'fab fa-spotify', color: '#1db954' },
            soundcloud_embed: { name: 'SoundCloud', icon: 'fab fa-soundcloud', color: '#ff5500' },
            tiktok_embed: { name: 'TikTok', icon: 'fab fa-tiktok', color: '#000000' },
            vimeo_embed: { name: 'Vimeo', icon: 'fab fa-vimeo', color: '#1ab7ea' },
            twitch_embed: { name: 'Twitch', icon: 'fab fa-twitch', color: '#9146ff' },
            map_embed: { name: 'Map', icon: 'fas fa-map-marker-alt', color: '#ea4335' },
            // Payment blocks
            stripe_payment: { name: 'Stripe Payment', icon: 'fab fa-stripe', color: '#635bff' },
            paypal_payment: { name: 'PayPal Payment', icon: 'fab fa-paypal', color: '#003087' },
            // Web3 blocks
            opensea_nft: { name: 'OpenSea NFT', icon: 'fas fa-gem', color: '#2081e2' }
        };
        return types[type] || { name: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), icon: 'fas fa-cube', color: '#64748b' };
    },

    // Render phone preview
    renderPhonePreview: function(page, blocks) {
        const bgStyle = page.background_type === 'gradient' 
            ? `background: ${page.background_value};`
            : page.background_type === 'image'
            ? `background-image: url('${page.background_value}'); background-size: cover;`
            : `background-color: ${page.background_value || '#ffffff'};`;

        let blocksHtml = '';
        if (blocks && blocks.length > 0) {
            blocksHtml = blocks.filter(b => b.is_active !== false).map(block => this.renderPreviewBlock(block)).join('');
        }

        return `
            <div class="preview-page" style="${bgStyle}; color: ${page.text_color || '#000000'};">
                ${page.avatar_url ? `<img src="${page.avatar_url}" class="preview-avatar" alt="Avatar">` : ''}
                <h1 class="preview-title">${this.escapeHtml(page.title || this.currentProject.name)}</h1>
                ${page.description ? `<p class="preview-description">${this.escapeHtml(page.description)}</p>` : ''}
                <div class="preview-blocks">
                    ${blocksHtml || '<p class="preview-empty">Add blocks to see preview</p>'}
                </div>
            </div>
        `;
    },

    // Get block style string from settings
    getBlockStyle: function(settings) {
        if (!settings) return '';
        
        const styles = [];
        
        // Background with opacity
        if (settings.bgColor) {
            const opacity = (settings.bgOpacity ?? 100) / 100;
            const hex = settings.bgColor.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            styles.push(`background-color: rgba(${r}, ${g}, ${b}, ${opacity})`);
        }
        
        // Text color
        if (settings.textColor) {
            styles.push(`color: ${settings.textColor}`);
        }
        
        // Border
        if (settings.borderWidth && settings.borderWidth !== '0') {
            styles.push(`border: ${settings.borderWidth}px solid ${settings.borderColor || '#ffffff'}`);
        }
        
        // Border radius
        if (settings.borderRadius) {
            styles.push(`border-radius: ${settings.borderRadius}px`);
        }
        
        // Shadow
        if (settings.shadow && settings.shadow !== 'none') {
            const shadows = {
                'sm': '0 1px 2px rgba(0,0,0,0.1)',
                'md': '0 4px 6px rgba(0,0,0,0.1)',
                'lg': '0 10px 15px rgba(0,0,0,0.2)'
            };
            styles.push(`box-shadow: ${shadows[settings.shadow] || 'none'}`);
        }
        
        return styles.length > 0 ? `style="${styles.join('; ')}"` : '';
    },

    // Render single preview block
    renderPreviewBlock: function(block) {
        const content = typeof block.content === 'string' ? JSON.parse(block.content || '{}') : block.content || {};
        const settings = typeof block.settings === 'string' ? JSON.parse(block.settings || '{}') : block.settings || {};
        const blockStyle = this.getBlockStyle(settings);
        
        switch (block.type) {
            case 'link_url':
                return `<a href="#" class="preview-link" ${blockStyle}>${content.icon ? `<i class="${content.icon}"></i>` : ''} ${this.escapeHtml(block.title || 'Link')}</a>`;
            case 'heading_text':
                return `<h2 class="preview-heading" ${blockStyle}>${this.escapeHtml(block.title || 'Heading')}</h2>`;
            case 'paragraph_text':
                return `<p class="preview-text" ${blockStyle}>${this.escapeHtml(content.text || block.title || '')}</p>`;
            case 'custom_image':
                return content.url ? `<img src="${content.url}" class="preview-image" ${blockStyle} alt="">` : '<div class="preview-image-placeholder"><i class="fas fa-image"></i></div>';
            case 'avatar_image':
                return content.url ? `<img src="${content.url}" class="preview-image preview-avatar-block" ${blockStyle} alt="">` : '<div class="preview-avatar-placeholder"><i class="fas fa-user"></i></div>';
            case 'social_links':
                const links = content.links || [];
                if (links.length === 0) {
                    return `<div class="preview-socials" ${blockStyle}><span class="preview-placeholder">Social links</span></div>`;
                }
                return `<div class="preview-socials" ${blockStyle}>${links.map(l => `<a href="#" class="social-icon"><i class="fab fa-${l.platform}"></i></a>`).join('')}</div>`;
            case 'divider':
                return `<hr class="preview-divider" ${blockStyle}>`;
            case 'email_signup':
                return `
                    <div class="preview-form" ${blockStyle}>
                        <input type="email" class="preview-input" placeholder="${content.placeholder || 'Enter your email'}" disabled>
                        <button class="preview-btn">${content.buttonText || 'Subscribe'}</button>
                    </div>
                `;
            case 'phone_collector':
                return `
                    <div class="preview-form" ${blockStyle}>
                        <input type="tel" class="preview-input" placeholder="${content.placeholder || 'Enter your phone'}" disabled>
                        <button class="preview-btn">${content.buttonText || 'Submit'}</button>
                    </div>
                `;
            case 'contact_form':
                return `
                    <div class="preview-contact-form">
                        <input type="text" class="preview-input" placeholder="Name" disabled>
                        <input type="email" class="preview-input" placeholder="Email" disabled>
                        <textarea class="preview-textarea" placeholder="Message" disabled></textarea>
                        <button class="preview-btn">${content.buttonText || 'Send'}</button>
                    </div>
                `;
            case 'youtube_embed':
                let ytVideoId = content.videoId || '';
                // Try to extract from URL if it's a full URL
                if (ytVideoId && (ytVideoId.includes('youtube') || ytVideoId.includes('youtu.be'))) {
                    const match = ytVideoId.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/);
                    if (match) ytVideoId = match[1];
                }
                if (ytVideoId && /^[a-zA-Z0-9_-]{11}$/.test(ytVideoId)) {
                    // Show thumbnail with play button in preview (iframe doesn't work well in nested contexts)
                    return `
                        <div class="preview-youtube-thumb" onclick="window.open('https://youtube.com/watch?v=${ytVideoId}', '_blank')">
                            <img src="https://img.youtube.com/vi/${ytVideoId}/mqdefault.jpg" alt="YouTube Video">
                            <div class="play-overlay"><i class="fab fa-youtube"></i></div>
                        </div>
                    `;
                }
                return `<div class="preview-embed-placeholder"><i class="fab fa-youtube"></i> YouTube</div>`;
            case 'spotify_embed':
                return `<div class="preview-embed-placeholder"><i class="fab fa-spotify"></i> Spotify</div>`;
            case 'soundcloud_embed':
                return `<div class="preview-embed-placeholder"><i class="fab fa-soundcloud"></i> SoundCloud</div>`;
            case 'tiktok_embed':
                return `<div class="preview-embed-placeholder"><i class="fab fa-tiktok"></i> TikTok</div>`;
            case 'vimeo_embed':
                return `<div class="preview-embed-placeholder"><i class="fab fa-vimeo"></i> Vimeo</div>`;
            case 'twitch_embed':
                return `<div class="preview-embed-placeholder"><i class="fab fa-twitch"></i> Twitch</div>`;
            case 'map_embed':
                return `<div class="preview-embed-placeholder"><i class="fas fa-map-marker-alt"></i> Map</div>`;
            case 'stripe_payment':
            case 'paypal_payment':
                return `<button class="preview-btn preview-payment-btn"><i class="fas fa-credit-card"></i> ${block.title || 'Pay Now'}</button>`;
            case 'opensea_nft':
                return `<div class="preview-embed-placeholder"><i class="fas fa-gem"></i> NFT</div>`;
            default:
                return `<div class="preview-block-placeholder"><i class="fas fa-cube"></i> ${block.type}</div>`;
        }
    },

    // Show add block modal
    showAddBlockModal: function() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'addBlockModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-large">
                <div class="modal-header">
                    <h3><i class="fas fa-plus-circle"></i> Add a new block</h3>
                    <button class="modal-close" onclick="BioLink.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="block-search">
                        <input type="text" class="form-control" placeholder="Search blocks..." oninput="BioLink.filterBlockTypes(this.value)">
                    </div>
                    <div class="block-categories" id="blockCategories">
                        ${this.renderBlockCategories()}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    // Render block categories in modal
    renderBlockCategories: function() {
        const categories = {
            standard: { label: 'Standard', desc: 'The base blocks to help you with your general needs', blocks: ['link_url', 'heading_text', 'paragraph_text', 'avatar_image', 'custom_image', 'social_links', 'divider'] },
            advanced: { label: 'Advanced', desc: 'The blocks which help you achieve more complex functionality', blocks: ['email_signup', 'phone_collector', 'contact_form'] },
            embeds: { label: 'Embeds', desc: 'Embed content from other platforms', blocks: ['youtube_embed', 'spotify_embed', 'soundcloud_embed', 'vimeo_embed', 'twitch_embed', 'tiktok_embed'] } // map_embed disabled temporarily
            // payments: { label: 'Payments', desc: 'Accept payments directly from your page', blocks: ['stripe_payment', 'paypal_payment'] }, // disabled temporarily
            // web3: { label: 'Web3', desc: 'NFTs and blockchain content', blocks: ['opensea_nft'] } // disabled temporarily
        };

        let html = '';
        for (const [key, cat] of Object.entries(categories)) {
            html += `
                <div class="block-category-section">
                    <div class="category-header">
                        <h4>${cat.label}</h4>
                        <p>${cat.desc}</p>
                    </div>
                    <div class="category-blocks">
                        ${cat.blocks.map(type => {
                            const info = this.getBlockTypeInfo(type);
                            return `
                                <div class="block-type-card" onclick="BioLink.showCreateBlockForm('${type}')">
                                    <div class="block-type-icon" style="background: ${info.color}">
                                        <i class="${info.icon}"></i>
                                    </div>
                                    <span class="block-type-name">${info.name}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
        return html;
    },

    // Filter block types in modal
    filterBlockTypes: function(query) {
        const cards = document.querySelectorAll('.block-type-card');
        const q = query.toLowerCase();
        cards.forEach(card => {
            const name = card.querySelector('.block-type-name').textContent.toLowerCase();
            card.style.display = name.includes(q) ? '' : 'none';
        });
    },

    // Show create block form
    showCreateBlockForm: function(type) {
        const info = this.getBlockTypeInfo(type);
        const modal = document.getElementById('addBlockModal');
        if (!modal) return;

        modal.querySelector('.modal-dialog').innerHTML = `
            <div class="modal-header">
                <h3><i class="${info.icon}" style="color: ${info.color}"></i> Add ${info.name}</h3>
                <button class="modal-close" onclick="BioLink.closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="createBlockForm" onsubmit="BioLink.createBlock(event, '${type}')">
                    ${this.renderBlockFields(type, {})}
                    <div class="form-group">
                        <label>Name / Title</label>
                        <input type="text" name="title" class="form-control" placeholder="Enter a name for this block" required>
                    </div>
                    <p class="form-hint"><i class="fas fa-info-circle"></i> All customization options available after creation.</p>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="BioLink.showAddBlockModal()">
                            <i class="fas fa-arrow-left"></i> Back
                        </button>
                        <button type="submit" class="btn btn-primary">
                            Create block
                        </button>
                    </div>
                </form>
            </div>
        `;
    },

    // Create block
    createBlock: async function(event, type) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        
        const data = {
            type: type,
            title: formData.get('title'),
            content: {},
            settings: {}
        };

        // Collect content based on type
        if (formData.get('url')) data.content.url = formData.get('url');
        if (formData.get('text')) data.content.text = formData.get('text');
        
        // Images - check uploadedImageUrl first (from upload), then imageUrl (manual input)
        const uploadedUrl = formData.get('uploadedImageUrl');
        const manualUrl = formData.get('imageUrl');
        if (uploadedUrl && uploadedUrl.trim()) {
            data.content.url = uploadedUrl.trim();
        } else if (manualUrl && manualUrl.trim()) {
            data.content.url = manualUrl.trim();
        }
        
        // Validate image URL for image types
        if ((type === 'custom_image' || type === 'avatar_image') && !data.content.url) {
            showNotification('Please upload an image or enter an image URL', 'error');
            return;
        }
        
        if (formData.get('embedUrl')) data.content.embedUrl = formData.get('embedUrl');
        
        // YouTube - extract video ID from URL if needed
        if (formData.get('videoId')) {
            let videoInput = formData.get('videoId').trim();
            const youtubeMatch = videoInput.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/);
            if (youtubeMatch) {
                data.content.videoId = youtubeMatch[1];
            } else if (/^[a-zA-Z0-9_-]{11}$/.test(videoInput)) {
                data.content.videoId = videoInput;
            } else {
                data.content.videoId = videoInput;
            }
        }

        try {
            const pageId = this.currentProject.page?.id;
            if (!pageId) {
                showNotification('Page not found', 'error');
                return;
            }

            const response = await api.post(`/biolink/pages/${pageId}/blocks`, data);
            if (response.success) {
                showNotification('Block created!', 'success');
                this.closeModal();
                // Only reload blocks, preserve current page settings
                await this.reloadBlocksOnly();
            }
        } catch (error) {
            showNotification(error.message || 'Error creating block', 'error');
        }
    },

    // Toggle block active state
    toggleBlockActive: async function(blockId, isActive) {
        try {
            const response = await api.put(`/biolink/blocks/${blockId}`, { is_active: isActive });
            if (response.success) {
                showNotification(isActive ? 'Block enabled' : 'Block disabled', 'success');
                // Update preview without full reload
                const blocks = this.currentProject.page?.blocks || [];
                const block = blocks.find(b => b.id === blockId);
                if (block) {
                    block.is_active = isActive;
                    const screen = document.getElementById('phoneScreen');
                    if (screen) {
                        const page = this.currentProject.page || {};
                        screen.innerHTML = this.renderPhonePreview(page, blocks);
                    }
                }
            }
        } catch (error) {
            showNotification(error.message || 'Error updating block', 'error');
            // Revert checkbox state on error - reload only blocks
            await this.reloadBlocksOnly();
        }
    },

    // Show block menu
    showBlockMenu: function(blockId, event) {
        event.stopPropagation();
        
        // Remove existing menus
        document.querySelectorAll('.block-dropdown-menu').forEach(m => m.remove());
        
        const menu = document.createElement('div');
        menu.className = 'block-dropdown-menu';
        menu.innerHTML = `
            <button onclick="BioLink.editBlock(${blockId})"><i class="fas fa-edit"></i> Edit</button>
            <button onclick="BioLink.duplicateBlock(${blockId})"><i class="fas fa-copy"></i> Duplicate</button>
            <button class="danger" onclick="BioLink.deleteBlock(${blockId})"><i class="fas fa-trash"></i> Delete</button>
        `;
        
        const btn = event.target.closest('.btn-icon');
        btn.parentElement.appendChild(menu);
        
        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            });
        }, 10);
    },

    // Switch panel tab
    switchPanelTab: function(tab) {
        // Save current settings before switching tabs
        const currentSettings = this.getCurrentPageSettingsFromDOM();
        if (currentSettings) {
            // Update local page data with current settings
            this.currentProject.page.background_type = currentSettings.background_type;
            this.currentProject.page.background_value = currentSettings.background_value;
            this.currentProject.page.text_color = currentSettings.text_color;
            this.currentProject.page.font_family = currentSettings.font_family;
            this.currentProject.page.title = currentSettings.title;
            this.currentProject.page.description = currentSettings.description;
            this.currentProject.page.avatar_url = currentSettings.avatar_url;
        }
        
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.panel-tab[data-tab="${tab}"]`).classList.add('active');
        
        const content = document.getElementById('panelContent');
        if (tab === 'blocks') {
            const blocks = this.currentProject.page?.blocks || [];
            content.innerHTML = `
                <button class="btn-add-block" onclick="BioLink.showAddBlockModal()">
                    <i class="fas fa-plus"></i> Add block
                </button>
                <div class="blocks-list" id="blocksList">
                    ${this.renderBlocksList(blocks)}
                </div>
            `;
            this.initBlocksDragDrop();
        } else {
            content.innerHTML = this.renderSettingsPanel();
        }
    },

    // Render settings panel
    renderSettingsPanel: function() {
        const page = this.currentProject.page || {};
        // Parse gradient values if exists
        let gradientColor1 = '#667eea';
        let gradientColor2 = '#764ba2';
        let gradientDirection = '135';
        
        if (page.background_type === 'gradient' && page.background_value) {
            const match = page.background_value.match(/linear-gradient\((\d+)deg,\s*([^,]+),\s*([^)]+)\)/);
            if (match) {
                gradientDirection = match[1];
                gradientColor1 = match[2].trim();
                gradientColor2 = match[3].trim();
            }
        }

        return `
            <div class="settings-panel">
                <div class="settings-section">
                    <h5>Profile</h5>
                    <div class="form-group">
                        <label>Title</label>
                        <input type="text" id="pageTitle" class="form-control" value="${this.escapeHtml(page.title || '')}" oninput="BioLink.updatePreview()">
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="pageDescription" class="form-control" rows="3" oninput="BioLink.updatePreview()">${this.escapeHtml(page.description || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Avatar URL</label>
                        <input type="url" id="avatarUrl" class="form-control" value="${page.avatar_url || ''}" oninput="BioLink.updatePreview()">
                    </div>
                </div>
                <div class="settings-section">
                    <h5>Background</h5>
                    <div class="form-group">
                        <label>Type</label>
                        <select id="bgType" class="form-control" onchange="BioLink.toggleBgOptions(); BioLink.updatePreview()">
                            <option value="color" ${page.background_type === 'color' || !page.background_type ? 'selected' : ''}>Solid Color</option>
                            <option value="gradient" ${page.background_type === 'gradient' ? 'selected' : ''}>Gradient</option>
                        </select>
                    </div>
                    <!-- Solid Color Option -->
                    <div id="bgColorOption" class="form-group" style="${page.background_type === 'gradient' ? 'display:none' : ''}">
                        <label>Color</label>
                        <input type="color" id="bgColor" class="form-control" value="${page.background_type !== 'gradient' ? (page.background_value || '#ffffff') : '#ffffff'}" oninput="BioLink.updatePreview()">
                    </div>
                    <!-- Gradient Options -->
                    <div id="bgGradientOptions" style="${page.background_type === 'gradient' ? '' : 'display:none'}">
                        <div class="form-group">
                            <label>Color 1</label>
                            <input type="color" id="gradientColor1" class="form-control" value="${gradientColor1}" oninput="BioLink.updatePreview()">
                        </div>
                        <div class="form-group">
                            <label>Color 2</label>
                            <input type="color" id="gradientColor2" class="form-control" value="${gradientColor2}" oninput="BioLink.updatePreview()">
                        </div>
                        <div class="form-group">
                            <label>Direction</label>
                            <div class="gradient-direction-picker">
                                <button type="button" class="dir-btn ${gradientDirection === '0' ? 'active' : ''}" data-dir="0" onclick="BioLink.setGradientDirection(0)"><i class="fas fa-arrow-up"></i></button>
                                <button type="button" class="dir-btn ${gradientDirection === '45' ? 'active' : ''}" data-dir="45" onclick="BioLink.setGradientDirection(45)"><i class="fas fa-arrow-up" style="transform:rotate(45deg)"></i></button>
                                <button type="button" class="dir-btn ${gradientDirection === '90' ? 'active' : ''}" data-dir="90" onclick="BioLink.setGradientDirection(90)"><i class="fas fa-arrow-right"></i></button>
                                <button type="button" class="dir-btn ${gradientDirection === '135' ? 'active' : ''}" data-dir="135" onclick="BioLink.setGradientDirection(135)"><i class="fas fa-arrow-down" style="transform:rotate(-45deg)"></i></button>
                                <button type="button" class="dir-btn ${gradientDirection === '180' ? 'active' : ''}" data-dir="180" onclick="BioLink.setGradientDirection(180)"><i class="fas fa-arrow-down"></i></button>
                                <button type="button" class="dir-btn ${gradientDirection === '225' ? 'active' : ''}" data-dir="225" onclick="BioLink.setGradientDirection(225)"><i class="fas fa-arrow-down" style="transform:rotate(45deg)"></i></button>
                                <button type="button" class="dir-btn ${gradientDirection === '270' ? 'active' : ''}" data-dir="270" onclick="BioLink.setGradientDirection(270)"><i class="fas fa-arrow-left"></i></button>
                                <button type="button" class="dir-btn ${gradientDirection === '315' ? 'active' : ''}" data-dir="315" onclick="BioLink.setGradientDirection(315)"><i class="fas fa-arrow-up" style="transform:rotate(-45deg)"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="settings-section">
                    <h5>Typography</h5>
                    <div class="form-group">
                        <label>Text Color</label>
                        <input type="color" id="textColor" class="form-control" value="${page.text_color || '#000000'}" oninput="BioLink.updatePreview()">
                    </div>
                    <div class="form-group">
                        <label>Font</label>
                        <select id="fontFamily" class="form-control" onchange="BioLink.updatePreview()">
                            <option value="Inter" ${page.font_family === 'Inter' ? 'selected' : ''}>Inter</option>
                            <option value="Roboto" ${page.font_family === 'Roboto' ? 'selected' : ''}>Roboto</option>
                            <option value="Poppins" ${page.font_family === 'Poppins' ? 'selected' : ''}>Poppins</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    },

    // Toggle background options based on type
    toggleBgOptions: function() {
        const bgType = document.getElementById('bgType')?.value;
        const colorOption = document.getElementById('bgColorOption');
        const gradientOptions = document.getElementById('bgGradientOptions');
        
        if (bgType === 'gradient') {
            if (colorOption) colorOption.style.display = 'none';
            if (gradientOptions) gradientOptions.style.display = 'block';
        } else {
            if (colorOption) colorOption.style.display = 'block';
            if (gradientOptions) gradientOptions.style.display = 'none';
        }
    },

    // Set gradient direction
    setGradientDirection: function(deg) {
        document.querySelectorAll('.dir-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.dir-btn[data-dir="${deg}"]`)?.classList.add('active');
        this.updatePreview();
    },

    // Get current gradient direction
    getGradientDirection: function() {
        const activeBtn = document.querySelector('.dir-btn.active');
        return activeBtn ? activeBtn.dataset.dir : '135';
    },

    // Update preview in real-time
    updatePreview: function() {
        const screen = document.getElementById('phoneScreen');
        if (!screen) return;

        const bgType = document.getElementById('bgType')?.value;
        let backgroundValue = '';
        
        if (bgType === 'gradient') {
            const color1 = document.getElementById('gradientColor1')?.value || '#667eea';
            const color2 = document.getElementById('gradientColor2')?.value || '#764ba2';
            const direction = this.getGradientDirection();
            backgroundValue = `linear-gradient(${direction}deg, ${color1}, ${color2})`;
        } else {
            backgroundValue = document.getElementById('bgColor')?.value || '#ffffff';
        }

        const page = {
            title: document.getElementById('pageTitle')?.value,
            description: document.getElementById('pageDescription')?.value,
            avatar_url: document.getElementById('avatarUrl')?.value,
            background_type: bgType,
            background_value: backgroundValue,
            text_color: document.getElementById('textColor')?.value
        };

        // Also update local page data to keep in sync
        if (this.currentProject && this.currentProject.page) {
            this.currentProject.page.background_type = bgType;
            this.currentProject.page.background_value = backgroundValue;
            if (page.title !== undefined) this.currentProject.page.title = page.title;
            if (page.description !== undefined) this.currentProject.page.description = page.description;
            if (page.avatar_url !== undefined) this.currentProject.page.avatar_url = page.avatar_url;
            if (page.text_color !== undefined) this.currentProject.page.text_color = page.text_color;
        }

        const blocks = this.currentProject.page?.blocks || [];
        screen.innerHTML = this.renderPhonePreview(page, blocks);
    },

    // Initialize blocks drag and drop
    initBlocksDragDrop: function() {
        const list = document.getElementById('blocksList');
        if (!list) return;

        let draggedItem = null;

        list.querySelectorAll('.block-item-v2').forEach(item => {
            const handle = item.querySelector('.block-drag-handle');
            
            handle.addEventListener('mousedown', () => {
                item.setAttribute('draggable', 'true');
            });

            item.addEventListener('dragstart', (e) => {
                draggedItem = item;
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                item.setAttribute('draggable', 'false');
                draggedItem = null;
                this.saveBlocksOrder();
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (draggedItem && draggedItem !== item) {
                    const rect = item.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) {
                        list.insertBefore(draggedItem, item);
                    } else {
                        list.insertBefore(draggedItem, item.nextSibling);
                    }
                }
            });
        });
    },

    // Save blocks order after drag
    saveBlocksOrder: async function() {
        const list = document.getElementById('blocksList');
        if (!list) return;

        const blocks = [];
        list.querySelectorAll('.block-item-v2').forEach((item, index) => {
            blocks.push({
                id: parseInt(item.dataset.blockId),
                position: index
            });
        });

        try {
            const pageId = this.currentProject.page?.id;
            await api.put(`/biolink/pages/${pageId}/blocks/reorder`, { blocks });
            // Only reload blocks, preserve current page settings
            await this.reloadBlocksOnly();
        } catch (error) {
            console.error('Error saving order:', error);
        }
    },

    // Close editor and restore sidebar
    closeEditor: function() {
        document.body.classList.remove('biolink-editor-fullscreen');
        this.render();
    },

    // Render block types for sidebar (legacy - keeping for compatibility)
    renderBlockTypes: function() {
        const categories = {
            basic: { label: 'Basic', icon: 'fa-cube' },
            social: { label: 'Social', icon: 'fa-share-alt' },
            forms: { label: 'Forms', icon: 'fa-wpforms' },
            embeds: { label: 'Embeds', icon: 'fa-code' },
            payments: { label: 'Payments', icon: 'fa-credit-card' },
            web3: { label: 'Web3', icon: 'fa-ethereum' }
        };

        let html = '';
        for (const [catKey, cat] of Object.entries(categories)) {
            const catBlocks = this.blockTypes.filter(b => b.category === catKey);
            if (catBlocks.length === 0) continue;

            html += `
                <div class="block-category">
                    <h5><i class="fas ${cat.icon}"></i> ${cat.label}</h5>
                    <div class="block-list">
                        ${catBlocks.map(block => `
                            <div class="block-item" draggable="true" data-type="${block.type}">
                                <i class="${block.icon}"></i>
                                <span>${block.name}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        return html;
    },

    // Render page preview
    renderPagePreview: function(page, blocks) {
        const bgStyle = page.background_type === 'gradient' 
            ? `background: ${page.background_value};`
            : page.background_type === 'image'
            ? `background-image: url('${page.background_value}'); background-size: cover;`
            : `background-color: ${page.background_value || '#ffffff'};`;

        return `
            <div class="biopage-preview" style="${bgStyle}; color: ${page.text_color || '#000000'};">
                ${page.avatar_url ? `<img src="${page.avatar_url}" class="avatar" alt="Avatar">` : ''}
                <h1 class="page-title">${this.escapeHtml(page.title || this.currentProject.name)}</h1>
                ${page.description ? `<p class="page-description">${this.escapeHtml(page.description)}</p>` : ''}
                
                <div class="blocks-container" id="blocksContainer">
                    ${blocks.length === 0 ? `
                        <div class="drop-zone empty">
                            <i class="fas fa-plus-circle"></i>
                            <p>Drag blocks here</p>
                        </div>
                    ` : blocks.map(block => this.renderBlock(block)).join('')}
                </div>
            </div>
        `;
    },

    // Render single block
    renderBlock: function(block) {
        const content = typeof block.content === 'string' ? JSON.parse(block.content) : block.content || {};
        const settings = typeof block.settings === 'string' ? JSON.parse(block.settings) : block.settings || {};

        let blockHtml = '';
        switch (block.type) {
            case 'link_url':
                blockHtml = `
                    <a href="${content.url || '#'}" class="block-link" target="_blank">
                        ${content.icon ? `<i class="${content.icon}"></i>` : ''}
                        <span>${this.escapeHtml(block.title || content.text || 'Link')}</span>
                    </a>
                `;
                break;
            case 'heading_text':
                blockHtml = `<h2 class="block-heading">${this.escapeHtml(block.title || 'Heading')}</h2>`;
                break;
            case 'custom_image':
                blockHtml = `<img src="${content.url || ''}" class="block-image" alt="${block.title || 'Image'}">`;
                break;
            case 'social_links':
                blockHtml = `
                    <div class="block-social">
                        ${(content.links || []).map(link => `
                            <a href="${link.url}" target="_blank" class="social-icon">
                                <i class="fab fa-${link.platform}"></i>
                            </a>
                        `).join('')}
                    </div>
                `;
                break;
            case 'youtube_embed':
                blockHtml = `
                    <div class="block-embed youtube">
                        <iframe src="https://www.youtube.com/embed/${content.videoId || ''}" frameborder="0" allowfullscreen></iframe>
                    </div>
                `;
                break;
            default:
                blockHtml = `<div class="block-placeholder">${block.type}</div>`;
        }

        return `
            <div class="block-wrapper" data-block-id="${block.id}" data-type="${block.type}">
                <div class="block-controls">
                    <button class="btn-icon drag-handle"><i class="fas fa-grip-vertical"></i></button>
                    <button class="btn-icon" onclick="BioLink.editBlock(${block.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" onclick="BioLink.deleteBlock(${block.id})"><i class="fas fa-trash"></i></button>
                </div>
                ${blockHtml}
            </div>
        `;
    },

    // Render design settings
    renderDesignSettings: function(page) {
        return `
            <div class="settings-section">
                <h5>Background</h5>
                <div class="form-group">
                    <label>Type</label>
                    <select id="bgType" class="form-control" onchange="BioLink.updateDesign()">
                        <option value="color" ${page.background_type === 'color' ? 'selected' : ''}>Solid Color</option>
                        <option value="gradient" ${page.background_type === 'gradient' ? 'selected' : ''}>Gradient</option>
                        <option value="image" ${page.background_type === 'image' ? 'selected' : ''}>Image</option>
                    </select>
                </div>
                <div class="form-group" id="bgColorGroup">
                    <label>Color</label>
                    <input type="color" id="bgColor" class="form-control" value="${page.background_value || '#ffffff'}" onchange="BioLink.updateDesign()">
                </div>
            </div>

            <div class="settings-section">
                <h5>Typography</h5>
                <div class="form-group">
                    <label>Text Color</label>
                    <input type="color" id="textColor" class="form-control" value="${page.text_color || '#000000'}" onchange="BioLink.updateDesign()">
                </div>
                <div class="form-group">
                    <label>Font Family</label>
                    <select id="fontFamily" class="form-control" onchange="BioLink.updateDesign()">
                        <option value="Inter" ${page.font_family === 'Inter' ? 'selected' : ''}>Inter</option>
                        <option value="Roboto" ${page.font_family === 'Roboto' ? 'selected' : ''}>Roboto</option>
                        <option value="Poppins" ${page.font_family === 'Poppins' ? 'selected' : ''}>Poppins</option>
                        <option value="Montserrat" ${page.font_family === 'Montserrat' ? 'selected' : ''}>Montserrat</option>
                        <option value="Open Sans" ${page.font_family === 'Open Sans' ? 'selected' : ''}>Open Sans</option>
                    </select>
                </div>
            </div>

            <div class="settings-section">
                <h5>Profile</h5>
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="pageTitle" class="form-control" value="${this.escapeHtml(page.title || '')}" onchange="BioLink.updateDesign()">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="pageDescription" class="form-control" rows="3" onchange="BioLink.updateDesign()">${this.escapeHtml(page.description || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>Avatar URL</label>
                    <input type="url" id="avatarUrl" class="form-control" value="${page.avatar_url || ''}" onchange="BioLink.updateDesign()">
                </div>
            </div>
        `;
    },

    // Switch settings tab
    switchSettingsTab: function(tab) {
        document.querySelectorAll('.settings-tabs .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        const content = document.getElementById('settingsContent');
        const page = this.currentProject.page || {};

        switch (tab) {
            case 'design':
                content.innerHTML = this.renderDesignSettings(page);
                break;
            case 'seo':
                content.innerHTML = this.renderSeoSettings(page);
                break;
            case 'settings':
                content.innerHTML = this.renderAdvancedSettings(page);
                break;
        }
    },

    // Render SEO settings
    renderSeoSettings: function(page) {
        return `
            <div class="settings-section">
                <h5>SEO Settings</h5>
                <div class="form-group">
                    <label>SEO Title</label>
                    <input type="text" id="seoTitle" class="form-control" value="${this.escapeHtml(page.seo_title || '')}">
                </div>
                <div class="form-group">
                    <label>SEO Description</label>
                    <textarea id="seoDescription" class="form-control" rows="3">${this.escapeHtml(page.seo_description || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>Social Image URL</label>
                    <input type="url" id="seoImage" class="form-control" value="${page.seo_image || ''}">
                </div>
                <div class="form-group">
                    <label>Favicon URL</label>
                    <input type="url" id="favicon" class="form-control" value="${page.favicon || ''}">
                </div>
            </div>
        `;
    },

    // Render advanced settings
    renderAdvancedSettings: function(page) {
        return `
            <div class="settings-section">
                <h5>Advanced Settings</h5>
                <div class="form-group">
                    <label>Password Protection</label>
                    <input type="password" id="pagePassword" class="form-control" placeholder="Leave empty for no password">
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="sensitiveContent" ${page.sensitive_content ? 'checked' : ''}>
                        <span>Mark as sensitive content</span>
                    </label>
                </div>
                <div class="form-group">
                    <label>Leap Link (redirect after X seconds)</label>
                    <input type="url" id="leapLink" class="form-control" value="${page.leap_link || ''}" placeholder="https://example.com">
                </div>
            </div>
            <div class="settings-section">
                <h5>Custom Code</h5>
                <div class="form-group">
                    <label>Analytics Code</label>
                    <textarea id="analyticsCode" class="form-control" rows="3" placeholder="Google Analytics, Facebook Pixel, etc.">${this.escapeHtml(page.analytics_code || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>Custom CSS</label>
                    <textarea id="customCss" class="form-control" rows="3">${this.escapeHtml(page.custom_css || '')}</textarea>
                </div>
            </div>
        `;
    },

    // Initialize drag and drop
    initDragDrop: function() {
        const blockItems = document.querySelectorAll('.block-item');
        const blocksContainer = document.getElementById('blocksContainer');

        blockItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('blockType', item.dataset.type);
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });
        });

        if (blocksContainer) {
            blocksContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                blocksContainer.classList.add('drag-over');
            });

            blocksContainer.addEventListener('dragleave', () => {
                blocksContainer.classList.remove('drag-over');
            });

            blocksContainer.addEventListener('drop', async (e) => {
                e.preventDefault();
                blocksContainer.classList.remove('drag-over');
                
                const blockType = e.dataTransfer.getData('blockType');
                if (blockType) {
                    await this.addBlock(blockType);
                }
            });
        }
    },

    // Add new block
    addBlock: async function(type) {
        if (!this.currentProject || !this.currentProject.page) return;

        try {
            const response = await api.post(`/biolink/pages/${this.currentProject.page.id}/blocks`, {
                type: type,
                title: '',
                content: {},
                settings: {}
            });

            if (response.success) {
                // Only reload blocks, preserve current page settings
                await this.reloadBlocksOnly();
                showNotification('Block added!', 'success');
            }
        } catch (error) {
            showNotification(error.message || 'Error adding block', 'error');
        }
    },

    // Reload only blocks without losing page settings (background, etc.)
    reloadBlocksOnly: async function() {
        if (!this.currentProject || !this.currentProject.page) return;

        try {
            // Get current page settings from DOM or stored data before reload
            const currentPageSettings = this.getCurrentPageSettingsFromDOM();
            
            // Fetch updated blocks from server
            const response = await api.get(`/biolink/pages/${this.currentProject.page.id}/blocks`);
            if (response.success) {
                // Update only blocks in currentProject
                this.currentProject.page.blocks = response.data || [];
                
                // Always merge current settings back to page object to preserve background
                if (currentPageSettings) {
                    this.currentProject.page.background_type = currentPageSettings.background_type;
                    this.currentProject.page.background_value = currentPageSettings.background_value;
                    this.currentProject.page.text_color = currentPageSettings.text_color;
                    this.currentProject.page.font_family = currentPageSettings.font_family;
                    this.currentProject.page.title = currentPageSettings.title;
                    this.currentProject.page.description = currentPageSettings.description;
                    this.currentProject.page.avatar_url = currentPageSettings.avatar_url;
                }
                
                // Update blocks list UI
                const blocksList = document.getElementById('blocksList');
                if (blocksList) {
                    blocksList.innerHTML = this.renderBlocksList(this.currentProject.page.blocks);
                    this.initBlocksDragDrop();
                }
                
                // Update phone preview with current settings
                const phoneScreen = document.getElementById('phoneScreen');
                if (phoneScreen) {
                    phoneScreen.innerHTML = this.renderPhonePreview(this.currentProject.page, this.currentProject.page.blocks);
                }
            }
        } catch (error) {
            console.error('Error reloading blocks:', error);
        }
    },

    // Get current page settings from DOM inputs or from stored page data
    getCurrentPageSettingsFromDOM: function() {
        const bgTypeEl = document.getElementById('bgType');
        const page = this.currentProject?.page || {};
        
        // If settings panel is not open, return stored page settings
        if (!bgTypeEl) {
            return {
                title: page.title,
                description: page.description,
                avatar_url: page.avatar_url,
                background_type: page.background_type || 'color',
                background_value: page.background_value || '#ffffff',
                text_color: page.text_color || '#000000',
                font_family: page.font_family || 'Inter'
            };
        }
        
        const bgType = bgTypeEl.value;
        let backgroundValue = '';
        if (bgType === 'gradient') {
            const color1 = document.getElementById('gradientColor1')?.value || '#667eea';
            const color2 = document.getElementById('gradientColor2')?.value || '#764ba2';
            const direction = this.getGradientDirection();
            backgroundValue = `linear-gradient(${direction}deg, ${color1}, ${color2})`;
        } else {
            backgroundValue = document.getElementById('bgColor')?.value || '#ffffff';
        }

        return {
            title: document.getElementById('pageTitle')?.value || page.title,
            description: document.getElementById('pageDescription')?.value || page.description,
            avatar_url: document.getElementById('avatarUrl')?.value || page.avatar_url,
            background_type: bgType,
            background_value: backgroundValue,
            text_color: document.getElementById('textColor')?.value || page.text_color || '#000000',
            font_family: document.getElementById('fontFamily')?.value || page.font_family || 'Inter'
        };
    },

    // Edit block
    editBlock: function(blockId) {
        const block = this.currentProject.page.blocks.find(b => b.id === blockId);
        if (!block) return;

        const content = typeof block.content === 'string' ? JSON.parse(block.content) : block.content || {};
        const settings = typeof block.settings === 'string' ? JSON.parse(block.settings || '{}') : block.settings || {};

        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'editBlockModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-medium">
                <div class="modal-header">
                    <h3><i class="fas fa-edit"></i> Edit Block</h3>
                    <button class="modal-close" onclick="BioLink.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="editBlockForm" onsubmit="BioLink.saveBlock(event, ${blockId})">
                        <div class="form-group">
                            <label>Title / Text</label>
                            <input type="text" name="title" class="form-control" value="${this.escapeHtml(block.title || '')}">
                        </div>
                        ${this.renderBlockFields(block.type, content)}
                        
                        <!-- Block Style Settings -->
                        <div class="block-style-section">
                            <h5><i class="fas fa-palette"></i> Block Style</h5>
                            <div class="style-grid">
                                <div class="form-group">
                                    <label>Background Color</label>
                                    <div class="color-input-group">
                                        <input type="color" name="bgColor" class="form-control color-picker" value="${settings.bgColor || '#000000'}">
                                        <input type="range" name="bgOpacity" min="0" max="100" value="${settings.bgOpacity ?? 100}" class="opacity-slider" oninput="this.nextElementSibling.textContent = this.value + '%'">
                                        <span class="opacity-value">${settings.bgOpacity ?? 100}%</span>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label>Text Color</label>
                                    <input type="color" name="textColor" class="form-control color-picker" value="${settings.textColor || '#ffffff'}">
                                </div>
                                <div class="form-group">
                                    <label>Border Width</label>
                                    <select name="borderWidth" class="form-control">
                                        <option value="0" ${settings.borderWidth === '0' || !settings.borderWidth ? 'selected' : ''}>None</option>
                                        <option value="1" ${settings.borderWidth === '1' ? 'selected' : ''}>1px</option>
                                        <option value="2" ${settings.borderWidth === '2' ? 'selected' : ''}>2px</option>
                                        <option value="3" ${settings.borderWidth === '3' ? 'selected' : ''}>3px</option>
                                        <option value="4" ${settings.borderWidth === '4' ? 'selected' : ''}>4px</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Border Color</label>
                                    <input type="color" name="borderColor" class="form-control color-picker" value="${settings.borderColor || '#ffffff'}">
                                </div>
                                <div class="form-group">
                                    <label>Border Radius</label>
                                    <select name="borderRadius" class="form-control">
                                        <option value="0" ${settings.borderRadius === '0' ? 'selected' : ''}>Square</option>
                                        <option value="8" ${settings.borderRadius === '8' || !settings.borderRadius ? 'selected' : ''}>Rounded (8px)</option>
                                        <option value="12" ${settings.borderRadius === '12' ? 'selected' : ''}>More Rounded (12px)</option>
                                        <option value="20" ${settings.borderRadius === '20' ? 'selected' : ''}>Pill (20px)</option>
                                        <option value="50" ${settings.borderRadius === '50' ? 'selected' : ''}>Circle (50px)</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Shadow</label>
                                    <select name="shadow" class="form-control">
                                        <option value="none" ${settings.shadow === 'none' || !settings.shadow ? 'selected' : ''}>None</option>
                                        <option value="sm" ${settings.shadow === 'sm' ? 'selected' : ''}>Small</option>
                                        <option value="md" ${settings.shadow === 'md' ? 'selected' : ''}>Medium</option>
                                        <option value="lg" ${settings.shadow === 'lg' ? 'selected' : ''}>Large</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" name="is_active" ${block.is_active !== false ? 'checked' : ''}>
                                <span>Active</span>
                            </label>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn btn-secondary" onclick="BioLink.closeModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">Save</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    // Render block-specific fields
    renderBlockFields: function(type, content) {
        switch (type) {
            case 'link_url':
                return `
                    <div class="form-group">
                        <label>URL *</label>
                        <input type="url" name="url" class="form-control" value="${content.url || ''}" required placeholder="https://example.com">
                    </div>
                    <div class="form-group">
                        <label>Icon (FontAwesome class)</label>
                        <input type="text" name="icon" class="form-control" value="${content.icon || ''}" placeholder="fas fa-link">
                    </div>
                `;
            
            case 'heading_text':
                return `
                    <div class="form-group">
                        <label>Heading Size</label>
                        <select name="headingSize" class="form-control">
                            <option value="h2" ${content.headingSize === 'h2' ? 'selected' : ''}>H2 - Large</option>
                            <option value="h3" ${content.headingSize === 'h3' ? 'selected' : ''}>H3 - Medium</option>
                            <option value="h4" ${content.headingSize === 'h4' ? 'selected' : ''}>H4 - Small</option>
                        </select>
                    </div>
                `;
            
            case 'paragraph_text':
                return `
                    <div class="form-group">
                        <label>Text Content</label>
                        <textarea name="text" class="form-control" rows="4" placeholder="Enter your text here...">${content.text || ''}</textarea>
                    </div>
                `;
            
            case 'avatar_image':
                return `
                    <div class="form-group">
                        <label>Avatar Image</label>
                        <div class="image-upload-container avatar-upload">
                            <div class="image-preview-circle" id="avatarPreview">
                                ${content.url ? `<img src="${content.url}" alt="Avatar">` : '<i class="fas fa-user"></i>'}
                            </div>
                            <div class="image-upload-actions">
                                <label class="btn btn-secondary btn-sm">
                                    <i class="fas fa-upload"></i> Upload Image
                                    <input type="file" accept="image/*" style="display:none" onchange="BioLink.handleImageUpload(this, 'avatar')">
                                </label>
                                <span class="upload-hint">or paste URL below</span>
                            </div>
                        </div>
                        <input type="url" name="imageUrl" id="imageUrlInput" class="form-control" value="${content.url || ''}" placeholder="https://example.com/image.jpg" style="margin-top: 10px;">
                        <input type="hidden" name="uploadedImageUrl" id="uploadedImageUrl" value="${content.url || ''}">
                    </div>
                `;
            
            case 'custom_image':
                return `
                    <div class="form-group">
                        <label>Image</label>
                        <div class="image-upload-container">
                            <div class="image-preview-box" id="imagePreview">
                                ${content.url ? `<img src="${content.url}" alt="Image">` : '<i class="fas fa-image"></i><span>No image selected</span>'}
                            </div>
                            <div class="image-upload-actions">
                                <label class="btn btn-secondary btn-sm">
                                    <i class="fas fa-upload"></i> Upload Image
                                    <input type="file" accept="image/*" style="display:none" onchange="BioLink.handleImageUpload(this, 'image')">
                                </label>
                                <span class="upload-hint">or paste URL below</span>
                            </div>
                        </div>
                        <input type="url" name="imageUrl" id="imageUrlInput" class="form-control" value="${content.url || ''}" placeholder="https://example.com/image.jpg" style="margin-top: 10px;">
                        <input type="hidden" name="uploadedImageUrl" id="uploadedImageUrl" value="${content.url || ''}">
                    </div>
                    <div class="form-group">
                        <label>Alt Text</label>
                        <input type="text" name="altText" class="form-control" value="${content.altText || ''}" placeholder="Image description">
                    </div>
                `;
            
            case 'social_links':
                const existingLinks = content.links || [];
                // If no links exist, show one empty row by default
                const linksToShow = existingLinks.length > 0 ? existingLinks : [{ platform: 'instagram', url: '' }];
                return `
                    <div class="form-group">
                        <label>Social Links</label>
                        <div id="socialLinksContainer">
                            ${linksToShow.map((link, i) => `
                                <div class="social-link-row" style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                                    <select name="platform_${i}" class="form-control" style="width: 130px;">
                                        <option value="facebook" ${link.platform === 'facebook' ? 'selected' : ''}>Facebook</option>
                                        <option value="instagram" ${link.platform === 'instagram' ? 'selected' : ''}>Instagram</option>
                                        <option value="twitter" ${link.platform === 'twitter' ? 'selected' : ''}>Twitter/X</option>
                                        <option value="linkedin" ${link.platform === 'linkedin' ? 'selected' : ''}>LinkedIn</option>
                                        <option value="youtube" ${link.platform === 'youtube' ? 'selected' : ''}>YouTube</option>
                                        <option value="tiktok" ${link.platform === 'tiktok' ? 'selected' : ''}>TikTok</option>
                                        <option value="whatsapp" ${link.platform === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
                                        <option value="telegram" ${link.platform === 'telegram' ? 'selected' : ''}>Telegram</option>
                                        <option value="github" ${link.platform === 'github' ? 'selected' : ''}>GitHub</option>
                                        <option value="pinterest" ${link.platform === 'pinterest' ? 'selected' : ''}>Pinterest</option>
                                        <option value="snapchat" ${link.platform === 'snapchat' ? 'selected' : ''}>Snapchat</option>
                                        <option value="discord" ${link.platform === 'discord' ? 'selected' : ''}>Discord</option>
                                        <option value="twitch" ${link.platform === 'twitch' ? 'selected' : ''}>Twitch</option>
                                        <option value="spotify" ${link.platform === 'spotify' ? 'selected' : ''}>Spotify</option>
                                    </select>
                                    <input type="url" name="socialUrl_${i}" class="form-control" value="${link.url || ''}" placeholder="https://..." style="flex: 1;">
                                    <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()" style="padding: 6px 10px;">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                        <button type="button" class="btn btn-sm btn-secondary" onclick="BioLink.addSocialLinkField()" style="margin-top: 5px;">
                            <i class="fas fa-plus"></i> Add Link
                        </button>
                    </div>
                `;
            
            case 'youtube_embed':
                return `
                    <div class="form-group">
                        <label>YouTube Video URL or ID *</label>
                        <input type="text" name="videoId" class="form-control" value="${content.videoId || ''}" required placeholder="https://youtube.com/watch?v=... or video ID">
                    </div>
                `;
            
            case 'spotify_embed':
                return `
                    <div class="form-group">
                        <label>Spotify Embed URL *</label>
                        <input type="url" name="embedUrl" class="form-control" value="${content.embedUrl || ''}" required placeholder="https://open.spotify.com/embed/...">
                        <small>Get the embed URL from Spotify's share menu</small>
                    </div>
                `;
            
            case 'soundcloud_embed':
                return `
                    <div class="form-group">
                        <label>SoundCloud Track URL *</label>
                        <input type="url" name="trackUrl" class="form-control" value="${content.trackUrl || ''}" required placeholder="https://soundcloud.com/...">
                    </div>
                `;
            
            case 'tiktok_embed':
                return `
                    <div class="form-group">
                        <label>TikTok Video URL *</label>
                        <input type="url" name="videoUrl" class="form-control" value="${content.videoUrl || ''}" required placeholder="https://tiktok.com/@user/video/...">
                    </div>
                `;
            
            case 'email_signup':
                return `
                    <div class="form-group">
                        <label>Email para receber notificações *</label>
                        <input type="email" name="notificationEmail" class="form-control" value="${content.notificationEmail || ''}" required placeholder="seu@email.com">
                        <small>Você receberá um email quando alguém se inscrever</small>
                    </div>
                    <div class="form-group">
                        <label>Button Text</label>
                        <input type="text" name="buttonText" class="form-control" value="${content.buttonText || 'Subscribe'}" placeholder="Subscribe">
                    </div>
                    <div class="form-group">
                        <label>Placeholder Text</label>
                        <input type="text" name="placeholder" class="form-control" value="${content.placeholder || 'Enter your email'}" placeholder="Enter your email">
                    </div>
                    <div class="form-group">
                        <label>Webhook URL (optional)</label>
                        <input type="url" name="webhookUrl" class="form-control" value="${content.webhookUrl || ''}" placeholder="https://...">
                        <small>Receive submissions via webhook</small>
                    </div>
                `;
            
            case 'phone_collector':
                return `
                    <div class="form-group">
                        <label>Email para receber notificações *</label>
                        <input type="email" name="notificationEmail" class="form-control" value="${content.notificationEmail || ''}" required placeholder="seu@email.com">
                        <small>Você receberá um email quando alguém enviar o telefone</small>
                    </div>
                    <div class="form-group">
                        <label>Button Text</label>
                        <input type="text" name="buttonText" class="form-control" value="${content.buttonText || 'Submit'}" placeholder="Submit">
                    </div>
                    <div class="form-group">
                        <label>Placeholder Text</label>
                        <input type="text" name="placeholder" class="form-control" value="${content.placeholder || 'Enter your phone'}" placeholder="Enter your phone">
                    </div>
                `;
            
            case 'contact_form':
                return `
                    <div class="form-group">
                        <label>Email to receive submissions *</label>
                        <input type="email" name="recipientEmail" class="form-control" value="${content.recipientEmail || ''}" required placeholder="your@email.com">
                    </div>
                    <div class="form-group">
                        <label>Success Message</label>
                        <input type="text" name="successMessage" class="form-control" value="${content.successMessage || 'Thank you!'}" placeholder="Thank you!">
                    </div>
                `;
            
            case 'map_embed':
                return `
                    <div class="form-group">
                        <label>Google Maps Embed URL *</label>
                        <input type="url" name="mapUrl" class="form-control" value="${content.mapUrl || ''}" required placeholder="https://www.google.com/maps/embed?...">
                        <small>Get the embed URL from Google Maps share menu</small>
                    </div>
                `;
            
            case 'countdown_timer':
                return `
                    <div class="form-group">
                        <label>Target Date & Time *</label>
                        <input type="datetime-local" name="targetDate" class="form-control" value="${content.targetDate || ''}" required>
                    </div>
                    <div class="form-group">
                        <label>Expired Message</label>
                        <input type="text" name="expiredMessage" class="form-control" value="${content.expiredMessage || 'Event has ended'}" placeholder="Event has ended">
                    </div>
                `;
            
            case 'divider':
                return `
                    <div class="form-group">
                        <label>Divider Style</label>
                        <select name="dividerStyle" class="form-control">
                            <option value="line" ${content.dividerStyle === 'line' ? 'selected' : ''}>Line</option>
                            <option value="dashed" ${content.dividerStyle === 'dashed' ? 'selected' : ''}>Dashed</option>
                            <option value="dotted" ${content.dividerStyle === 'dotted' ? 'selected' : ''}>Dotted</option>
                            <option value="space" ${content.dividerStyle === 'space' ? 'selected' : ''}>Space Only</option>
                        </select>
                    </div>
                `;
            
            default:
                return `
                    <div class="form-group">
                        <label>Content (JSON)</label>
                        <textarea name="rawContent" class="form-control" rows="4">${JSON.stringify(content, null, 2)}</textarea>
                        <small>Advanced: Edit raw JSON content</small>
                    </div>
                `;
        }
    },

    // Add social link field dynamically
    addSocialLinkField: function() {
        const container = document.getElementById('socialLinksContainer');
        if (!container) return;
        
        const count = container.querySelectorAll('.social-link-row').length;
        const newRow = document.createElement('div');
        newRow.className = 'social-link-row';
        newRow.style.cssText = 'display: flex; gap: 10px; margin-bottom: 10px; align-items: center;';
        newRow.innerHTML = `
            <select name="platform_${count}" class="form-control" style="width: 130px;">
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="twitter">Twitter/X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="youtube">YouTube</option>
                <option value="tiktok">TikTok</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
                <option value="github">GitHub</option>
                <option value="pinterest">Pinterest</option>
                <option value="snapchat">Snapchat</option>
                <option value="discord">Discord</option>
                <option value="twitch">Twitch</option>
                <option value="spotify">Spotify</option>
            </select>
            <input type="url" name="socialUrl_${count}" class="form-control" placeholder="https://..." style="flex: 1;">
            <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()" style="padding: 6px 10px;">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(newRow);
    },

    // Save block
    saveBlock: async function(event, blockId) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);

        const data = {
            title: formData.get('title'),
            is_active: formData.get('is_active') === 'on',
            content: {}
        };

        // Get all form fields and build content object
        // Link URL
        if (formData.get('url')) data.content.url = formData.get('url');
        if (formData.get('icon')) data.content.icon = formData.get('icon');
        
        // Heading
        if (formData.get('headingSize')) data.content.headingSize = formData.get('headingSize');
        
        // Text/Paragraph
        if (formData.get('text')) data.content.text = formData.get('text');
        
        // Images - check uploadedImageUrl first (from upload), then imageUrl (manual input)
        const uploadedUrl = formData.get('uploadedImageUrl');
        const manualUrl = formData.get('imageUrl');
        if (uploadedUrl && uploadedUrl.trim()) {
            data.content.url = uploadedUrl.trim();
        } else if (manualUrl && manualUrl.trim()) {
            data.content.url = manualUrl.trim();
        }
        if (formData.get('altText')) data.content.altText = formData.get('altText');
        
        // YouTube - extract video ID from URL if needed
        if (formData.get('videoId')) {
            let videoInput = formData.get('videoId').trim();
            // Extract video ID from various YouTube URL formats
            const youtubeMatch = videoInput.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/);
            if (youtubeMatch) {
                data.content.videoId = youtubeMatch[1];
            } else if (/^[a-zA-Z0-9_-]{11}$/.test(videoInput)) {
                // Already a video ID
                data.content.videoId = videoInput;
            } else {
                data.content.videoId = videoInput; // Save as-is, will show placeholder
            }
        }
        
        // Spotify
        if (formData.get('embedUrl')) data.content.embedUrl = formData.get('embedUrl');
        
        // SoundCloud
        if (formData.get('trackUrl')) data.content.trackUrl = formData.get('trackUrl');
        
        // TikTok
        if (formData.get('videoUrl')) data.content.videoUrl = formData.get('videoUrl');
        
        // Forms
        if (formData.get('buttonText')) data.content.buttonText = formData.get('buttonText');
        if (formData.get('placeholder')) data.content.placeholder = formData.get('placeholder');
        if (formData.get('webhookUrl')) data.content.webhookUrl = formData.get('webhookUrl');
        if (formData.get('recipientEmail')) data.content.recipientEmail = formData.get('recipientEmail');
        if (formData.get('notificationEmail')) data.content.notificationEmail = formData.get('notificationEmail');
        if (formData.get('successMessage')) data.content.successMessage = formData.get('successMessage');
        
        // Map
        if (formData.get('mapUrl')) data.content.mapUrl = formData.get('mapUrl');
        
        // Countdown
        if (formData.get('targetDate')) data.content.targetDate = formData.get('targetDate');
        if (formData.get('expiredMessage')) data.content.expiredMessage = formData.get('expiredMessage');
        
        // Divider
        if (formData.get('dividerStyle')) data.content.dividerStyle = formData.get('dividerStyle');
        
        // Social Links - collect from dynamic fields (always check, not just when count > 0)
        const socialLinksContainer = document.getElementById('socialLinksContainer');
        if (socialLinksContainer) {
            const links = [];
            for (let i = 0; i < 20; i++) { // Check up to 20 possible links
                const platform = formData.get(`platform_${i}`);
                const url = formData.get(`socialUrl_${i}`);
                if (platform && url) {
                    links.push({ platform, url });
                }
            }
            if (links.length > 0) {
                data.content.links = links;
            }
        }
        
        // Raw content (fallback for unknown types)
        if (formData.get('rawContent')) {
            try {
                data.content = JSON.parse(formData.get('rawContent'));
            } catch (e) {
                // Keep existing content if JSON parse fails
            }
        }

        // Block style settings
        data.settings = {
            bgColor: formData.get('bgColor') || '#000000',
            bgOpacity: formData.get('bgOpacity') || '100',
            textColor: formData.get('textColor') || '#ffffff',
            borderWidth: formData.get('borderWidth') || '0',
            borderColor: formData.get('borderColor') || '#ffffff',
            borderRadius: formData.get('borderRadius') || '8',
            shadow: formData.get('shadow') || 'none'
        };

        try {
            const response = await api.put(`/biolink/blocks/${blockId}`, data);
            if (response.success) {
                showNotification('Block saved!', 'success');
                this.closeModal();
                // Only reload blocks, preserve current page settings
                await this.reloadBlocksOnly();
            }
        } catch (error) {
            showNotification(error.message || 'Error saving block', 'error');
        }
    },

    // Delete block
    deleteBlock: async function(blockId) {
        this.showConfirmModal(
            'Delete Block',
            'Are you sure you want to delete this block?',
            async () => {
                try {
                    const response = await api.delete(`/biolink/blocks/${blockId}`);
                    if (response.success) {
                        showNotification('Block deleted!', 'success');
                        // Only reload blocks, preserve current page settings
                        await this.reloadBlocksOnly();
                    }
                } catch (error) {
                    showNotification(error.message || 'Error deleting block', 'error');
                }
            }
        );
    },

    // Save page
    savePage: async function() {
        if (!this.currentProject || !this.currentProject.page) return;

        // Get current settings from DOM or stored data
        const currentSettings = this.getCurrentPageSettingsFromDOM();
        
        // Build data object, only including defined values
        const data = {};
        
        // Always include background settings
        if (currentSettings.background_type) {
            data.background_type = currentSettings.background_type;
        }
        if (currentSettings.background_value) {
            data.background_value = currentSettings.background_value;
        }
        if (currentSettings.text_color) {
            data.text_color = currentSettings.text_color;
        }
        if (currentSettings.font_family) {
            data.font_family = currentSettings.font_family;
        }
        
        // Include other settings if they have values
        if (currentSettings.title !== undefined) {
            data.title = currentSettings.title || '';
        }
        if (currentSettings.description !== undefined) {
            data.description = currentSettings.description || '';
        }
        if (currentSettings.avatar_url !== undefined) {
            data.avatar_url = currentSettings.avatar_url || '';
        }
        
        // SEO and advanced settings
        const seoTitle = document.getElementById('seoTitle')?.value;
        const seoDescription = document.getElementById('seoDescription')?.value;
        const seoImage = document.getElementById('seoImage')?.value;
        const favicon = document.getElementById('favicon')?.value;
        const pagePassword = document.getElementById('pagePassword')?.value;
        const sensitiveContent = document.getElementById('sensitiveContent')?.checked;
        const leapLink = document.getElementById('leapLink')?.value;
        const analyticsCode = document.getElementById('analyticsCode')?.value;
        const customCss = document.getElementById('customCss')?.value;
        
        if (seoTitle !== undefined) data.seo_title = seoTitle || this.currentProject.page.seo_title || '';
        if (seoDescription !== undefined) data.seo_description = seoDescription || this.currentProject.page.seo_description || '';
        if (seoImage !== undefined) data.seo_image = seoImage || this.currentProject.page.seo_image || '';
        if (favicon !== undefined) data.favicon = favicon || this.currentProject.page.favicon || '';
        if (pagePassword !== undefined) data.password = pagePassword || null;
        if (sensitiveContent !== undefined) data.sensitive_content = sensitiveContent;
        if (leapLink !== undefined) data.leap_link = leapLink || this.currentProject.page.leap_link || '';
        if (analyticsCode !== undefined) data.analytics_code = analyticsCode || this.currentProject.page.analytics_code || '';
        if (customCss !== undefined) data.custom_css = customCss || this.currentProject.page.custom_css || '';

        console.log('Saving page with data:', data); // Debug log

        try {
            const response = await api.put(`/biolink/pages/${this.currentProject.page.id}`, data);
            if (response.success) {
                // Update local data to keep in sync
                Object.assign(this.currentProject.page, data);
                showNotification('Page saved!', 'success');
            }
        } catch (error) {
            showNotification(error.message || 'Error saving page', 'error');
        }
    },

    // Publish page
    publishPage: async function() {
        if (!this.currentProject) return;

        try {
            // First save any pending changes
            await this.savePage();
            
            // Then update status to active
            const response = await api.put(`/biolink/projects/${this.currentProject.id}`, {
                status: 'active'
            });
            if (response.success) {
                this.currentProject.status = 'active';
                showNotification('Page published!', 'success');
                // Just update the status indicator without full refresh
                const statusIndicator = document.querySelector('.status-indicator');
                const statusText = document.querySelector('.status-text');
                if (statusIndicator) statusIndicator.classList.add('active');
                if (statusText) statusText.textContent = 'Published';
            }
        } catch (error) {
            showNotification(error.message || 'Error publishing page', 'error');
        }
    },

    // Preview page
    previewPage: function() {
        if (!this.currentProject) return;
        window.open(`/b/${this.currentProject.slug}`, '_blank');
    },

    // Update design (live preview)
    updateDesign: function() {
        const preview = document.querySelector('.biopage-preview');
        if (!preview) return;

        const bgType = document.getElementById('bgType')?.value;
        const bgColor = document.getElementById('bgColor')?.value;
        const textColor = document.getElementById('textColor')?.value;

        if (bgType === 'color') {
            preview.style.background = bgColor;
        }
        preview.style.color = textColor;

        const title = document.getElementById('pageTitle')?.value;
        const titleEl = preview.querySelector('.page-title');
        if (titleEl) titleEl.textContent = title;

        const desc = document.getElementById('pageDescription')?.value;
        const descEl = preview.querySelector('.page-description');
        if (descEl) descEl.textContent = desc;
    },

    // View analytics
    viewAnalytics: async function(projectId) {
        try {
            const response = await api.get(`/biolink/projects/${projectId}/analytics`);
            if (response.success) {
                this.showAnalyticsModal(response.data);
            }
        } catch (error) {
            showNotification(error.message || 'Error loading analytics', 'error');
        }
    },

    // Show analytics modal
    showAnalyticsModal: function(data) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'analyticsModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-large">
                <div class="modal-header">
                    <h3><i class="fas fa-chart-bar"></i> Analytics</h3>
                    <button class="modal-close" onclick="BioLink.closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="analytics-summary">
                        <div class="stat-card">
                            <div class="stat-value">${data.summary.views || 0}</div>
                            <div class="stat-label">Views</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${data.summary.clicks || 0}</div>
                            <div class="stat-label">Clicks</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${data.summary.unique_visitors || 0}</div>
                            <div class="stat-label">Unique Visitors</div>
                        </div>
                    </div>
                    <div class="analytics-charts">
                        <div class="chart-container">
                            <h4>Top Countries</h4>
                            <div class="chart-list">
                                ${(data.countries || []).map(c => `
                                    <div class="chart-item">
                                        <span>${c.country || 'Unknown'}</span>
                                        <span>${c.count}</span>
                                    </div>
                                `).join('') || '<p>No data</p>'}
                            </div>
                        </div>
                        <div class="chart-container">
                            <h4>Devices</h4>
                            <div class="chart-list">
                                ${(data.devices || []).map(d => `
                                    <div class="chart-item">
                                        <span>${d.device_type || 'Unknown'}</span>
                                        <span>${d.count}</span>
                                    </div>
                                `).join('') || '<p>No data</p>'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    },

    // Delete project
    deleteProject: async function(id) {
        this.showConfirmModal(
            'Delete Project',
            'Are you sure you want to delete this project? This action cannot be undone.',
            async () => {
                try {
                    const response = await api.delete(`/biolink/projects/${id}`);
                    if (response.success) {
                        showNotification('Project deleted!', 'success');
                        await this.loadProjects();
                        this.render();
                    }
                } catch (error) {
                    showNotification(error.message || 'Error deleting project', 'error');
                }
            }
        );
    },

    // Copy link
    copyLink: function(slug) {
        const url = `${window.location.origin}/b/${slug}`;
        navigator.clipboard.writeText(url).then(() => {
            showNotification('Link copied to clipboard!', 'success');
        });
    },

    // Show confirm modal (custom confirmation dialog)
    showConfirmModal: function(title, message, onConfirm, onCancel = null) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'confirmModal';
        modal.innerHTML = `
            <div class="modal-dialog modal-confirm">
                <div class="modal-header">
                    <h3><i class="fas fa-exclamation-triangle"></i> ${title}</h3>
                </div>
                <div class="modal-body">
                    <p class="confirm-message">${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="confirmCancelBtn">Cancel</button>
                    <button class="btn btn-danger" id="confirmOkBtn">Delete</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Handle confirm
        document.getElementById('confirmOkBtn').onclick = () => {
            modal.remove();
            if (onConfirm) onConfirm();
        };

        // Handle cancel
        document.getElementById('confirmCancelBtn').onclick = () => {
            modal.remove();
            if (onCancel) onCancel();
        };

        // Close on overlay click
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                if (onCancel) onCancel();
            }
        };
    },

    // Close modal
    closeModal: function() {
        const modals = document.querySelectorAll('.modal-overlay');
        modals.forEach(m => m.remove());
    },

    // Open project editor (non-biopage)
    openProjectEditor: function() {
        // TODO: Implement editors for other project types
        showNotification('Editor for this type coming soon!', 'info');
    },

    // Handle image upload for avatar/image blocks
    handleImageUpload: async function(input, type) {
        const file = input.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            showNotification('Please select an image file', 'error');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showNotification('Image must be less than 5MB', 'error');
            return;
        }

        // Show loading state
        const previewEl = type === 'avatar' 
            ? document.getElementById('avatarPreview')
            : document.getElementById('imagePreview');
        
        if (previewEl) {
            previewEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/tenant/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            const result = await response.json();

            if (result.success && result.url) {
                // Update preview
                if (previewEl) {
                    previewEl.innerHTML = `<img src="${result.url}" alt="${type}">`;
                }

                // Store uploaded URL in hidden field (this is the primary source)
                const hiddenInput = document.getElementById('uploadedImageUrl');
                if (hiddenInput) {
                    hiddenInput.value = result.url;
                }

                // Update visible URL input to show the uploaded URL
                const urlInput = document.getElementById('imageUrlInput');
                if (urlInput) {
                    urlInput.value = result.url;
                }

                // Clear the file input to prevent re-upload issues
                input.value = '';

                showNotification('Image uploaded successfully!', 'success');
            } else {
                throw new Error(result.message || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            showNotification(error.message || 'Error uploading image', 'error');
            
            // Reset preview
            if (previewEl) {
                if (type === 'avatar') {
                    previewEl.innerHTML = '<i class="fas fa-user"></i>';
                } else {
                    previewEl.innerHTML = '<i class="fas fa-image"></i><span>No image selected</span>';
                }
            }
        }
    },

    // Helper functions
    escapeHtml: function(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    formatDate: function(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString();
    }
};

// Initialize when page loads
function loadBioLink() {
    BioLink.init();
}
