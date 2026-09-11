/**
 * WhatsApp Notifications Module
 * Manages WhatsApp notification settings, templates, and connection
 * 
 * @module WhatsAppNotifications
 */

const WhatsAppNotifications = {
  templates: [],
  expirationSettings: null,
  statusInterval: null,
  socket: null,

  async init() {
    // Initialize Socket.IO FIRST (to receive QR immediately)
    this.initSocket();
    
    await this.checkWhatsAppStatus();
    await this.loadTemplates();
    await this.loadExpirationSettings();
    this.setupEventListeners();
    
    // Poll status every 10 seconds (less frequent since we have socket)
    this.statusInterval = setInterval(() => this.checkWhatsAppStatus(), 10000);
  },

  initSocket() {
    if (this.socket) return;
    
    // Connect to tenant 0 namespace (superadmin/system tenant)
    const tenantId = 0;
    this.socket = io(`/tenant/${tenantId}`, {
      transports: ['websocket', 'polling']
    });

    console.log(`Connecting to Socket.IO namespace: /tenant/${tenantId}`);

    // Listen for QR code
    this.socket.on('qr-code', (qrCode) => {
      console.log('QR code received via socket:', qrCode ? 'Yes' : 'No');
      console.log('QR code length:', qrCode ? qrCode.length : 0);
      if (qrCode) {
        console.log('QR code starts with:', qrCode.substring(0, 30) + '...');
        this.displayQRCode(qrCode);
      }
    });

    // Listen for connection status
    this.socket.on('connection-status', (data) => {
      console.log('Connection status received via socket', data);
      this.updateConnectionUI({
        connected: data.status === 'connected',
        phoneNumber: data.phoneNumber
      });
    });

    this.socket.on('connect', () => {
      console.log('Socket.IO connected for superadmin');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket.IO disconnected for superadmin');
    });
  },

  displayQRCode(qrCode) {
    console.log('displayQRCode called with:', qrCode ? 'QR CODE' : 'NULL');
    
    const qrContainer = document.getElementById('qrCodeContainer');
    const disconnectedContainer = document.getElementById('disconnectedContainer');
    const connectedContainer = document.getElementById('connectedContainer');
    
    if (!qrContainer) {
      console.error('qrCodeContainer not found in DOM!');
      return;
    }

    if (qrCode && typeof qrCode === 'string' && qrCode.startsWith('data:')) {
      console.log('Displaying QR Code image');
      
      // Hide other containers
      if (disconnectedContainer) disconnectedContainer.style.display = 'none';
      if (connectedContainer) connectedContainer.style.display = 'none';
      
      // Show QR container
      qrContainer.style.display = 'block';
      
      const qrImg = document.getElementById('qrCodeImage');
      if (qrImg) {
        qrImg.src = qrCode;
        qrImg.alt = 'QR Code';
        qrImg.style.display = 'block';
      }
      
      // Hide loading if present
      const loadingEl = qrContainer.querySelector('.qr-loading');
      if (loadingEl) loadingEl.style.display = 'none';
      
      console.log('QR Code displayed successfully');
    } else {
      console.log('Hiding QR Code (invalid or null)');
      qrContainer.style.display = 'none';
    }
  },

  setupEventListeners() {
    // Template category filter
    document.getElementById('templateCategory')?.addEventListener('change', (e) => {
      this.filterTemplates(e.target.value);
    });
    
    // Search templates
    document.getElementById('searchTemplates')?.addEventListener('input', (e) => {
      this.searchTemplates(e.target.value);
    });

    // Save expiration settings
    document.getElementById('saveExpirationSettings')?.addEventListener('click', () => {
      this.saveExpirationSettings();
    });
  },

  async checkWhatsAppStatus() {
    try {
      const response = await apiRequest('/superadmin/notifications/whatsapp/status');
      
      if (response.success) {
        console.log('WhatsApp status:', {
          connected: response.data.connected,
          hasQR: !!response.data.qrCode,
          qrLength: response.data.qrCode ? response.data.qrCode.length : 0
        });
        this.updateConnectionUI(response.data);
      }
    } catch (error) {
      console.error('Error checking WhatsApp status:', error);
    }
  },

  updateConnectionUI(status) {
    const statusContainer = document.getElementById('whatsappStatusContainer');
    const qrContainer = document.getElementById('qrCodeContainer');
    const connectedContainer = document.getElementById('connectedContainer');
    const disconnectedContainer = document.getElementById('disconnectedContainer');

    // Hide all containers
    [statusContainer, qrContainer, connectedContainer, disconnectedContainer].forEach(el => {
      if (el) el.style.display = 'none';
    });

    if (status.connected) {
      // Show connected state
      if (connectedContainer) {
        connectedContainer.style.display = 'block';
        const phoneEl = document.getElementById('connectedPhone');
        const lastConnEl = document.getElementById('lastConnected');
        if (phoneEl) phoneEl.textContent = status.phoneNumber || 'Unknown';
        if (lastConnEl && status.lastConnected) {
          lastConnEl.textContent = new Date(status.lastConnected).toLocaleString();
        }
      }
      // Hide QR code when connected
      if (qrContainer) qrContainer.style.display = 'none';
    } else if (status.qrCode && typeof status.qrCode === 'string' && status.qrCode.startsWith('data:')) {
      // Show QR code using the displayQRCode method
      this.displayQRCode(status.qrCode);
    } else {
      // Show disconnected state
      if (disconnectedContainer) {
        disconnectedContainer.style.display = 'block';
      }
    }
  },

  async initWhatsApp() {
    try {
      // Show loading state
      const qrContainer = document.getElementById('qrCodeContainer');
      const disconnectedContainer = document.getElementById('disconnectedContainer');
      
      if (disconnectedContainer) disconnectedContainer.style.display = 'none';
      if (qrContainer) {
        qrContainer.style.display = 'block';
        const qrImg = document.getElementById('qrCodeImage');
        if (qrImg) {
          qrImg.src = '';
          qrImg.alt = 'Loading QR Code...';
          qrImg.style.display = 'none';
        }
        // Add loading text
        let loadingEl = qrContainer.querySelector('.qr-loading');
        if (!loadingEl) {
          loadingEl = document.createElement('div');
          loadingEl.className = 'qr-loading';
          loadingEl.innerHTML = '<div class="spinner"></div><p>Generating QR Code...</p>';
          loadingEl.style.cssText = 'text-align: center; padding: 20px;';
          qrContainer.appendChild(loadingEl);
        }
        loadingEl.style.display = 'block';
      }
      
      if (window.showNotification) {
        showNotification('notifications.whatsapp.initializing', 'info');
      }
      
      const response = await apiRequest('/superadmin/notifications/whatsapp/init', {
        method: 'POST'
      });
      
      if (response.success) {
        if (window.showSuccess) {
          showSuccess('notifications.whatsapp.init_success');
        }
        
        // Poll more frequently for QR code (every 2 seconds for 30 seconds)
        let attempts = 0;
        const maxAttempts = 15;
        const pollForQR = async () => {
          attempts++;
          await this.checkWhatsAppStatus();
          
          // Check if we got a QR code
          const qrImg = document.getElementById('qrCodeImage');
          if (qrImg && qrImg.src && qrImg.src.startsWith('data:')) {
            console.log('QR code received');
            // Hide loading
            const loadingEl = qrContainer?.querySelector('.qr-loading');
            if (loadingEl) loadingEl.style.display = 'none';
            return; // QR received, stop polling
          }
          
          if (attempts < maxAttempts) {
            setTimeout(pollForQR, 2000);
          } else {
            // Hide loading after max attempts
            const loadingEl = qrContainer?.querySelector('.qr-loading');
            if (loadingEl) loadingEl.style.display = 'none';
          }
        };
        
        setTimeout(pollForQR, 1000);
      }
    } catch (error) {
      console.error('Error initializing WhatsApp:', error);
      if (window.showError) {
        showError('notifications.whatsapp.init_error');
      }
      // Hide loading on error
      const qrContainer = document.getElementById('qrCodeContainer');
      const loadingEl = qrContainer?.querySelector('.qr-loading');
      if (loadingEl) loadingEl.style.display = 'none';
    }
  },

  async disconnectWhatsApp() {
    if (window.showConfirm) {
      showConfirm('notifications.whatsapp.disconnect_confirm', async () => {
        await this.doDisconnect();
      });
    } else {
      await this.doDisconnect();
    }
  },

  async doDisconnect() {
    try {
      const response = await apiRequest('/superadmin/notifications/whatsapp/disconnect', {
        method: 'POST'
      });
      
      if (response.success) {
        if (window.showSuccess) {
          showSuccess('notifications.whatsapp.disconnected');
        }
        await this.checkWhatsAppStatus();
      }
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error);
      if (window.showError) {
        showError('notifications.whatsapp.disconnect_error');
      }
    }
  },

  async loadTemplates() {
    try {
      const response = await apiRequest('/superadmin/notifications/whatsapp/templates');
      
      if (response.success) {
        this.templates = response.data;
        this.renderTemplates(response.data);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      const container = document.getElementById('templatesContainer');
      if (container) {
        container.innerHTML = `<div class="alert alert-danger" data-i18n="notifications.error_loading_templates">Error loading templates</div>`;
      }
    }
  },

  renderTemplates(templates) {
    const container = document.getElementById('templatesContainer');
    if (!container) return;

    if (templates.length === 0) {
      container.innerHTML = `<p class="text-muted" data-i18n="notifications.no_templates">No templates found</p>`;
      if (window.i18n) i18n.translatePage();
      return;
    }

    container.innerHTML = templates.map(template => {
      const variables = this.parseVariables(template.variables);
      return `
        <div class="template-card" data-category="${template.category}">
          <div class="template-header">
            <div>
              <h4>${template.template_name}</h4>
              <span class="badge badge-${this.getCategoryColor(template.category)}" data-i18n="notifications.category.${template.category}">${template.category}</span>
            </div>
            <div class="template-actions">
              <label class="switch">
                <input type="checkbox" ${template.enabled ? 'checked' : ''} 
                       onchange="WhatsAppNotifications.toggleTemplate(${template.id}, this.checked)">
                <span class="slider"></span>
              </label>
              <button class="btn btn-sm btn-primary" onclick="WhatsAppNotifications.editTemplate(${template.id})">
                <i class="fas fa-edit"></i> <span data-i18n="common.edit">Edit</span>
              </button>
            </div>
          </div>
          <div class="template-body">
            <p><strong data-i18n="notifications.variables">Variables:</strong> ${variables.join(', ')}</p>
            <div class="template-preview whatsapp-preview">
              ${this.formatWhatsAppMessage(template.message)}
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.i18n) i18n.translatePage();
  },

  parseVariables(variables) {
    if (!variables) return [];
    try {
      return typeof variables === 'string' ? JSON.parse(variables) : variables;
    } catch (e) {
      return [];
    }
  },

  formatWhatsAppMessage(message) {
    if (!message) return '';
    return message
      .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
      .substring(0, 300) + (message.length > 300 ? '...' : '');
  },

  getCategoryColor(category) {
    const colors = {
      tenant: 'primary',
      subscription: 'success',
      security: 'warning',
      system: 'info'
    };
    return colors[category] || 'secondary';
  },

  filterTemplates(category) {
    const templates = category ? this.templates.filter(t => t.category === category) : this.templates;
    this.renderTemplates(templates);
  },

  searchTemplates(query) {
    const filtered = this.templates.filter(t => 
      t.template_name.toLowerCase().includes(query.toLowerCase()) ||
      t.message.toLowerCase().includes(query.toLowerCase())
    );
    this.renderTemplates(filtered);
  },

  async toggleTemplate(id, enabled) {
    try {
      await apiRequest(`/superadmin/notifications/whatsapp/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled })
      });
      if (window.showSuccess) {
        showSuccess(enabled ? 'notifications.template_enabled' : 'notifications.template_disabled');
      }
      await this.loadTemplates();
    } catch (error) {
      console.error('Error toggling template:', error);
      if (window.showError) {
        showError('notifications.error_updating_template');
      }
    }
  },

  editTemplate(id) {
    const template = this.templates.find(t => t.id === id);
    if (!template) return;

    const variables = this.parseVariables(template.variables);

    const modalContent = `
      <div class="form-group">
        <label data-i18n="notifications.message">Message</label>
        <textarea id="edit_message" class="form-control" rows="8">${template.message}</textarea>
        <small class="form-text text-muted" data-i18n="notifications.whatsapp_format_help">
          Use *text* for bold. Use emojis for better engagement.
        </small>
      </div>
      <div class="alert alert-info">
        <strong data-i18n="notifications.available_variables">Available Variables:</strong> 
        ${variables.map(v => `<code>{{${v}}}</code>`).join(', ')}
      </div>
      <div class="whatsapp-preview-box">
        <h5 data-i18n="notifications.preview">Preview:</h5>
        <div class="whatsapp-message" id="messagePreview">
          ${this.formatWhatsAppMessage(template.message)}
        </div>
      </div>
    `;

    const modalFooter = `
      <button class="btn btn-secondary" onclick="closeCustomModal()" data-i18n="common.cancel">Cancel</button>
      <button class="btn btn-primary" onclick="WhatsAppNotifications.saveTemplate(${id})">
        <i class="fas fa-save"></i> <span data-i18n="common.save">Save</span>
      </button>
    `;

    if (window.showModal) {
      showModal({
        title: `${window.i18n ? i18n.t('notifications.edit_template') : 'Edit Template'}: ${template.template_name}`,
        content: modalContent,
        footer: modalFooter,
        size: 'large'
      });
    }

    // Update preview on typing
    setTimeout(() => {
      const textarea = document.getElementById('edit_message');
      if (textarea) {
        textarea.addEventListener('input', (e) => {
          const preview = document.getElementById('messagePreview');
          if (preview) {
            preview.innerHTML = this.formatWhatsAppMessage(e.target.value);
          }
        });
      }
      if (window.i18n) i18n.translatePage();
    }, 100);
  },

  async saveTemplate(id) {
    const message = document.getElementById('edit_message')?.value;
    if (!message) return;

    try {
      await apiRequest(`/superadmin/notifications/whatsapp/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ message })
      });
      if (window.showSuccess) {
        showSuccess('notifications.template_updated');
      }
      closeCustomModal();
      await this.loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      if (window.showError) {
        showError('notifications.error_saving_template');
      }
    }
  },

  async loadExpirationSettings() {
    try {
      const response = await apiRequest('/superadmin/notifications/expiration-settings');
      
      if (response.success) {
        this.expirationSettings = response.data;
        this.populateExpirationSettings(response.data);
      }
    } catch (error) {
      console.error('Error loading expiration settings:', error);
    }
  },

  populateExpirationSettings(settings) {
    // Days before expiration
    for (let i = 1; i <= 4; i++) {
      const select = document.getElementById(`days_before_${i}`);
      if (select) select.value = settings[`days_before_${i}`] || 0;
    }
    
    // Days after expiration
    for (let i = 1; i <= 3; i++) {
      const select = document.getElementById(`days_after_${i}`);
      if (select) select.value = settings[`days_after_${i}`] || 0;
    }

    // Enabled toggle
    const enabledToggle = document.getElementById('expiration_enabled');
    if (enabledToggle) enabledToggle.checked = settings.enabled;
  },

  async saveExpirationSettings() {
    const settings = {
      days_before_1: parseInt(document.getElementById('days_before_1')?.value) || 0,
      days_before_2: parseInt(document.getElementById('days_before_2')?.value) || 0,
      days_before_3: parseInt(document.getElementById('days_before_3')?.value) || 0,
      days_before_4: parseInt(document.getElementById('days_before_4')?.value) || 0,
      days_after_1: parseInt(document.getElementById('days_after_1')?.value) || 0,
      days_after_2: parseInt(document.getElementById('days_after_2')?.value) || 0,
      days_after_3: parseInt(document.getElementById('days_after_3')?.value) || 0,
      enabled: document.getElementById('expiration_enabled')?.checked || false
    };

    try {
      await apiRequest('/superadmin/notifications/expiration-settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      if (window.showSuccess) {
        showSuccess('notifications.expiration_settings_saved');
      }
    } catch (error) {
      console.error('Error saving expiration settings:', error);
      if (window.showError) {
        showError('notifications.error_saving_settings');
      }
    }
  },

  async sendTestMessage() {
    const phone = document.getElementById('test_phone')?.value;
    const message = document.getElementById('test_message')?.value;

    if (!phone || !message) {
      if (window.showError) {
        showError('notifications.test_fields_required');
      }
      return;
    }

    try {
      await apiRequest('/superadmin/notifications/whatsapp/test', {
        method: 'POST',
        body: JSON.stringify({ phone_number: phone, message })
      });
      if (window.showSuccess) {
        showSuccess('notifications.test_sent');
      }
    } catch (error) {
      console.error('Error sending test message:', error);
      if (window.showError) {
        showError('notifications.test_error');
      }
    }
  },

  closeModal() {
    if (window.closeCustomModal) {
      closeCustomModal();
    }
  },

  destroy() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    
    // Disconnect socket
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
};

// Make globally available
window.WhatsAppNotifications = WhatsAppNotifications;
