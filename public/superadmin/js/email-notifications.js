/**
 * Email Notifications Module
 * Manages email notification settings, templates, and SMTP configuration
 * 
 * @module EmailNotifications
 */

const EmailNotifications = {
  currentSettings: null,
  templates: [],
  expirationSettings: null,

  async init() {
    await this.loadSettings();
    await this.loadTemplates();
    await this.loadExpirationSettings();
    this.setupEventListeners();
  },

  setupEventListeners() {
    // Save settings
    document.getElementById('saveEmailSettings')?.addEventListener('click', () => this.saveSettings());
    
    // Test connection
    document.getElementById('testEmailConnection')?.addEventListener('click', () => this.testConnection());
    
    // Template category filter
    document.getElementById('templateCategory')?.addEventListener('change', (e) => {
      this.filterTemplates(e.target.value);
    });
    
    // Search templates
    document.getElementById('searchTemplates')?.addEventListener('input', (e) => {
      this.searchTemplates(e.target.value);
    });

    // Save expiration settings - usando o ID correto da página de email
    document.getElementById('saveEmailExpirationSettings')?.addEventListener('click', () => {
      this.saveExpirationSettings();
    });
  },

  async loadSettings() {
    try {
      const response = await apiRequest('/superadmin/notifications/email/settings');
      
      if (response.success && response.data) {
        this.currentSettings = response.data;
        this.populateSettings(response.data);
      }
    } catch (error) {
      console.error('Error loading email settings:', error);
      const container = document.getElementById('content');
      if (container && window.showError) {
        showError('notifications.error_loading_settings');
      }
    }
  },

  populateSettings(settings) {
    const fields = ['smtp_host', 'smtp_port', 'smtp_user', 'from_email', 'from_name'];
    fields.forEach(field => {
      const el = document.getElementById(field);
      if (el) el.value = settings[field] || '';
    });

    const secureEl = document.getElementById('smtp_secure');
    if (secureEl) secureEl.checked = settings.smtp_secure || false;

    const enabledEl = document.getElementById('email_enabled');
    if (enabledEl) enabledEl.checked = settings.enabled || false;
  },

  async saveSettings() {
    const settings = {
      smtp_host: document.getElementById('smtp_host')?.value,
      smtp_port: parseInt(document.getElementById('smtp_port')?.value) || 587,
      smtp_secure: document.getElementById('smtp_secure')?.checked || false,
      smtp_user: document.getElementById('smtp_user')?.value,
      smtp_password: document.getElementById('smtp_password')?.value || undefined,
      from_email: document.getElementById('from_email')?.value,
      from_name: document.getElementById('from_name')?.value,
      enabled: document.getElementById('email_enabled')?.checked || false
    };

    // Remove password if empty
    if (!settings.smtp_password) {
      delete settings.smtp_password;
    }

    try {
      const response = await apiRequest('/superadmin/notifications/email/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      
      if (response.success) {
        if (window.showSuccess) {
          showSuccess('notifications.settings_saved');
        }
        await this.loadSettings();
      }
    } catch (error) {
      console.error('Error saving email settings:', error);
      if (window.showError) {
        showError('notifications.error_saving_settings');
      }
    }
  },

  async testConnection() {
    const settings = {
      smtp_host: document.getElementById('smtp_host')?.value,
      smtp_port: parseInt(document.getElementById('smtp_port')?.value) || 587,
      smtp_secure: document.getElementById('smtp_secure')?.checked || false,
      smtp_user: document.getElementById('smtp_user')?.value,
      smtp_password: document.getElementById('smtp_password')?.value,
      from_email: document.getElementById('from_email')?.value,
      test_recipient: document.getElementById('test_recipient')?.value
    };

    if (!settings.test_recipient) {
      if (window.showError) {
        showError('notifications.test_recipient_required');
      }
      return;
    }

    const btn = document.getElementById('testEmailConnection');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span data-i18n="notifications.testing">Testing...</span>';
    }

    try {
      const response = await apiRequest('/superadmin/notifications/email/test', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      
      if (response.success) {
        if (window.showSuccess) {
          showSuccess('notifications.test_email_sent');
        }
      }
    } catch (error) {
      console.error('Error testing email:', error);
      if (window.showError) {
        showError(error.message || 'notifications.test_email_error');
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> <span data-i18n="notifications.send_test">Send Test Email</span>';
      }
    }
  },

  async loadTemplates() {
    try {
      const response = await apiRequest('/superadmin/notifications/email/templates');
      
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
                       onchange="EmailNotifications.toggleTemplate(${template.id}, this.checked)">
                <span class="slider"></span>
              </label>
              <button class="btn btn-sm btn-primary" onclick="EmailNotifications.editTemplate(${template.id})">
                <i class="fas fa-edit"></i> <span data-i18n="common.edit">Edit</span>
              </button>
            </div>
          </div>
          <div class="template-body">
            <p><strong data-i18n="notifications.subject">Subject:</strong> ${template.subject}</p>
            <p><strong data-i18n="notifications.variables">Variables:</strong> ${variables.join(', ')}</p>
            <div class="template-preview">
              ${(template.body || '').substring(0, 200)}${(template.body || '').length > 200 ? '...' : ''}
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
      t.subject.toLowerCase().includes(query.toLowerCase())
    );
    this.renderTemplates(filtered);
  },

  async toggleTemplate(id, enabled) {
    try {
      await apiRequest(`/superadmin/notifications/email/templates/${id}`, {
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
        <label data-i18n="notifications.subject">Subject</label>
        <input type="text" id="edit_subject" class="form-control" value="${this.escapeHtml(template.subject)}">
      </div>
      <div class="form-group">
        <label data-i18n="notifications.body_text">Body (Plain Text)</label>
        <textarea id="edit_body" class="form-control" rows="6">${this.escapeHtml(template.body || '')}</textarea>
      </div>
      <div class="form-group">
        <label data-i18n="notifications.body_html">Body (HTML)</label>
        <textarea id="edit_html_body" class="form-control" rows="10">${this.escapeHtml(template.html_body || '')}</textarea>
        <small class="form-text text-muted" data-i18n="notifications.html_help">
          Paste your custom HTML email template here. Leave empty to use plain text.
        </small>
      </div>
      <div class="alert alert-info">
        <strong data-i18n="notifications.available_variables">Available Variables:</strong> 
        ${variables.map(v => `<code>{{${v}}}</code>`).join(', ')}
      </div>
    `;

    const modalFooter = `
      <button class="btn btn-secondary" onclick="closeCustomModal()" data-i18n="common.cancel">Cancel</button>
      <button class="btn btn-info" onclick="EmailNotifications.previewTemplate(${id})">
        <i class="fas fa-eye"></i> <span data-i18n="notifications.preview">Preview</span>
      </button>
      <button class="btn btn-primary" onclick="EmailNotifications.saveTemplate(${id})">
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

    setTimeout(() => {
      if (window.i18n) i18n.translatePage();
    }, 100);
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  async saveTemplate(id) {
    const subject = document.getElementById('edit_subject')?.value;
    const body = document.getElementById('edit_body')?.value;
    const html_body = document.getElementById('edit_html_body')?.value;

    if (!subject) {
      if (window.showError) {
        showError('notifications.subject_required');
      }
      return;
    }

    try {
      await apiRequest(`/superadmin/notifications/email/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ subject, body, html_body })
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

  previewTemplate(id) {
    const html_body = document.getElementById('edit_html_body')?.value;
    const body = document.getElementById('edit_body')?.value;
    const subject = document.getElementById('edit_subject')?.value;

    const previewContent = html_body || `<pre>${this.escapeHtml(body)}</pre>`;

    // Open preview in new window
    const previewWindow = window.open('', '_blank', 'width=800,height=600');
    previewWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Email Preview: ${subject}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .email-container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .subject { font-size: 18px; font-weight: bold; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="subject">${subject}</div>
          ${previewContent}
        </div>
      </body>
      </html>
    `);
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
    // Days before expiration - usando os IDs corretos da página de email
    for (let i = 1; i <= 4; i++) {
      const select = document.getElementById(`email_days_before_${i}`);
      if (select) select.value = settings[`days_before_${i}`] || 0;
    }
    
    // Days after expiration - usando os IDs corretos da página de email
    for (let i = 1; i <= 3; i++) {
      const select = document.getElementById(`email_days_after_${i}`);
      if (select) select.value = settings[`days_after_${i}`] || 0;
    }

    // Enabled toggle - usando o ID correto da página de email
    const enabledToggle = document.getElementById('email_expiration_enabled');
    if (enabledToggle) enabledToggle.checked = settings.enabled;
  },

  async saveExpirationSettings() {
    const btn = document.getElementById('saveEmailExpirationSettings');
    
    // Desabilitar botão durante o salvamento
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span data-i18n="common.saving">Saving...</span>';
    }

    // Usando os IDs corretos da página de email
    const settings = {
      days_before_1: parseInt(document.getElementById('email_days_before_1')?.value) || 0,
      days_before_2: parseInt(document.getElementById('email_days_before_2')?.value) || 0,
      days_before_3: parseInt(document.getElementById('email_days_before_3')?.value) || 0,
      days_before_4: parseInt(document.getElementById('email_days_before_4')?.value) || 0,
      days_after_1: parseInt(document.getElementById('email_days_after_1')?.value) || 0,
      days_after_2: parseInt(document.getElementById('email_days_after_2')?.value) || 0,
      days_after_3: parseInt(document.getElementById('email_days_after_3')?.value) || 0,
      enabled: document.getElementById('email_expiration_enabled')?.checked || false
    };

    console.log('Saving expiration settings:', settings);

    try {
      const response = await apiRequest('/superadmin/notifications/expiration-settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      
      console.log('Save response:', response);
      
      if (response.success) {
        if (window.showSuccess) {
          showSuccess('notifications.expiration_settings_saved');
        }
        // Recarregar as configurações para confirmar que foram salvas
        await this.loadExpirationSettings();
      } else {
        throw new Error(response.message || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving expiration settings:', error);
      if (window.showError) {
        showError(error.message || 'notifications.error_saving_settings');
      }
    } finally {
      // Reabilitar botão
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> <span data-i18n="common.save">Save</span>';
        if (window.i18n) i18n.translatePage();
      }
    }
  },

  closeModal() {
    if (window.closeCustomModal) {
      closeCustomModal();
    }
  }
};

// Make globally available
window.EmailNotifications = EmailNotifications;

/**
 * Test expiration notifications manually
 */
async function testExpirationNotifications() {
  const btn = document.getElementById('testExpirationCheck');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span data-i18n="notifications.checking">Checking...</span>';
  }

  try {
    const response = await apiRequest('/superadmin/notifications/check-expirations', {
      method: 'POST'
    });

    if (response.success) {
      if (window.showSuccess) {
        showSuccess('Expiration check completed! Check the notification logs.');
      }
    }
  } catch (error) {
    console.error('Error testing expiration check:', error);
    if (window.showError) {
      showError(error.message || 'Error checking expirations');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-play"></i> <span data-i18n="notifications.test_check">Test Check Now</span>';
      if (window.i18n) i18n.translatePage();
    }
  }
}

window.testExpirationNotifications = testExpirationNotifications;
