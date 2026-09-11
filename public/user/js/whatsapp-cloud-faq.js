/**
 * WhatsApp Cloud FAQ Management Module
 * Handles FAQ CRUD operations with i18n support
 * 
 * @module WhatsAppCloudFAQ
 */

const WhatsAppCloudFAQ = {
  state: {
    faqs: [],
    settings: {},
    accounts: [],
    selectedAccountId: null,
    editingFaq: null,
    statistics: {},
    isLoading: false
  },

  /**
   * Initialize FAQ module
   */
  async init() {
    console.log('🚀 Initializing WhatsApp Cloud FAQ module...');
    
    // Test authentication token
    console.log('🔑 Testing authentication...');
    const token = localStorage.getItem('token');
    console.log('Token exists:', !!token);
    console.log('Token length:', token ? token.length : 0);
    console.log('Token preview:', token ? token.substring(0, 20) + '...' : 'No token');
    
    // Test i18n system
    console.log('🧪 Testing i18n system...');
    console.log('window.i18n exists:', !!window.i18n);
    if (window.i18n) {
      console.log('i18n.t function exists:', typeof window.i18n.t);
      console.log('i18n current language:', window.i18n.currentLanguage);
      console.log('i18n is loaded:', window.i18n.isLoaded);
      
      // Test a simple translation
      const testTranslation = window.i18n.t('faq.title');
      console.log('Test translation for "faq.title":', testTranslation);
      
      // Test the problematic key
      const problemKey = window.i18n.t('faq.created_success');
      console.log('Test translation for "faq.created_success":', problemKey);
    }
    
    // Test API connectivity
    console.log('🌐 Testing API connectivity...');
    try {
      const testResponse = await fetch('/api/user/whatsapp-cloud/accounts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('API test response status:', testResponse.status);
      console.log('API test response ok:', testResponse.ok);
    } catch (apiError) {
      console.error('❌ API test failed:', apiError);
    }
    
    try {
      await this.loadAccounts();
      await this.loadFAQs();
      await this.loadSettings();
      await this.loadStatistics();
      this.render();
      this.attachEventListeners();
      
      console.log('✅ FAQ module initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing FAQ module:', error);
      this.showNotification(this.t('faq.error_loading', 'Error loading FAQs'), 'error');
    }
  },

  /**
   * Translation helper with enhanced debugging
   */
  t(key, fallback = '') {
    if (window.i18n && window.i18n.t) {
      const result = window.i18n.t(key);
      if (result && result !== key) {
        return result;
      }
    }
    return fallback || key;
  },

  /**
   * Load WhatsApp Cloud accounts
   */
  async loadAccounts() {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/whatsapp-cloud/accounts', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        this.state.accounts = data.data || [];
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  },

  /**
   * Load FAQs from API with enhanced debugging
   */
  async loadFAQs() {
    console.log('📋 Starting loadFAQs...');
    
    this.state.isLoading = true;
    this.render();

    try {
      const token = localStorage.getItem('token');
      
      const accountParam = this.state.selectedAccountId ? `?accountId=${this.state.selectedAccountId}` : '';
      const url = `/api/user/whatsapp-cloud/faqs${accountParam}`;
      
      console.log('🌐 Loading FAQs from:', url);
      console.log('🏢 Selected account ID:', this.state.selectedAccountId);
      
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(url, { headers });

      console.log('📥 LoadFAQs response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (response.ok) {
        const data = await response.json();
        console.log('📊 FAQs loaded:', {
          success: data.success,
          count: data.data ? data.data.length : 0,
          data: data.data
        });
        
        this.state.faqs = data.data || [];
        console.log('💾 FAQs stored in state:', this.state.faqs.length);
      } else {
        const errorData = await response.json();
        console.error('❌ LoadFAQs failed:', errorData);
        throw new Error('Failed to load FAQs: ' + (errorData.error || response.statusText));
      }
    } catch (error) {
      console.error('❌ Error loading FAQs:', error);
      this.showNotification(this.t('faq.error_loading'), 'error');
    } finally {
      this.state.isLoading = false;
      console.log('🔄 Rendering after loadFAQs...');
      this.render();
    }
  },

  /**
   * Load FAQ settings
   */
  async loadSettings() {
    try {
      const token = localStorage.getItem('token');
      const accountParam = this.state.selectedAccountId ? `?accountId=${this.state.selectedAccountId}` : '';
      
      const response = await fetch(`/api/user/whatsapp-cloud/faqs/settings${accountParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        this.state.settings = data.data || {};
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  },

  /**
   * Load statistics with enhanced metrics
   */
  async loadStatistics() {
    try {
      const token = localStorage.getItem('token');
      const accountParam = this.state.selectedAccountId ? `?accountId=${this.state.selectedAccountId}` : '';
      
      const response = await fetch(`/api/user/whatsapp-cloud/faqs/statistics${accountParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        this.state.statistics = data.data || {};
        
        // Load additional analytics
        await this.loadAnalytics();
      }
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  },

  /**
   * Load advanced analytics
   */
  async loadAnalytics() {
    try {
      const token = localStorage.getItem('token');
      const accountParam = this.state.selectedAccountId ? `?accountId=${this.state.selectedAccountId}` : '';
      
      const response = await fetch(`/api/user/whatsapp-cloud/faqs/analytics${accountParam}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        this.state.analytics = data.data || {};
      }
    } catch (error) {
      console.warn('Analytics not available:', error);
      this.state.analytics = {};
    }
  },

  /**
   * Save FAQ (create or update) with enhanced debugging
   */
  async saveFAQ(faqData) {
    try {
      console.log('💾 Starting saveFAQ process...');
      console.log('📊 FAQ Data:', JSON.stringify(faqData, null, 2));
      
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('❌ No authentication token found in localStorage');
        throw new Error('No authentication token found');
      }
      
      console.log('🔑 Token found, length:', token.length);
      console.log('🔑 Token preview:', token.substring(0, 30) + '...');
      
      const isEdit = !!faqData.id;
      const url = isEdit 
        ? `/api/user/whatsapp-cloud/faqs/${faqData.id}`
        : '/api/user/whatsapp-cloud/faqs';
      
      // Clean up data - remove null/empty values except for boolean fields
      const cleanData = {};
      for (const [key, value] of Object.entries(faqData)) {
        if (key === 'active') {
          // Always include active field
          cleanData[key] = value;
        } else if (value !== null && value !== undefined && value !== '') {
          cleanData[key] = value;
        }
      }
      
      console.log('🧹 Cleaned data:', JSON.stringify(cleanData, null, 2));
      console.log('🌐 Request details:', { 
        method: isEdit ? 'PUT' : 'POST', 
        url, 
        isEdit,
        dataKeys: Object.keys(cleanData)
      });
      
      console.log('📡 Sending request to:', url);
      console.log('📡 Request method:', isEdit ? 'PUT' : 'POST');
      console.log('📡 Request headers:', {
        'Authorization': `Bearer ${token.substring(0, 20)}...`,
        'Content-Type': 'application/json'
      });
      console.log('📡 Request body:', JSON.stringify(cleanData, null, 2));
      
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(cleanData)
      });

      console.log('📥 Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      let responseData;
      const responseText = await response.text();
      console.log('📄 Raw response text:', responseText);
      
      try {
        responseData = JSON.parse(responseText);
        console.log('📄 Parsed response data:', responseData);
      } catch (jsonError) {
        console.error('❌ Failed to parse response as JSON:', jsonError);
        console.log('📄 Response as text:', responseText);
        throw new Error('Invalid JSON response from server: ' + responseText);
      }

      if (response.ok) {
        console.log('✅ Request successful!');
        
        const successKey = isEdit ? 'faq.updated_success' : 'faq.created_success';
        console.log('🔑 Success key to translate:', successKey);
        
        const translatedMessage = this.t(successKey, isEdit ? 'FAQ updated successfully!' : 'FAQ created successfully!');
        console.log('📝 Translated message:', translatedMessage);
        
        this.showNotification(translatedMessage, 'success');
        
        console.log('🔄 Reloading FAQs and statistics...');
        await this.loadFAQs();
        await this.loadStatistics();
        
        console.log('🚪 Closing modal...');
        this.closeModal();
        
        return responseData.data;
      } else {
        console.error('❌ Server returned error:', {
          status: response.status,
          statusText: response.statusText,
          data: responseData
        });
        
        if (response.status === 401) {
          console.error('🔐 Authentication failed - token might be expired');
          console.error('🔐 Current token:', token.substring(0, 50) + '...');
        } else if (response.status === 403) {
          console.error('🚫 Access forbidden - insufficient permissions');
        } else if (response.status === 400) {
          console.error('📝 Validation error - check form data');
        } else if (response.status === 404) {
          console.error('🔍 Route not found - check API endpoint');
        } else if (response.status === 500) {
          console.error('💥 Server error - check backend logs');
        }
        
        throw new Error(responseData.error || `Server error: ${response.status} - ${responseText}`);
      }
    } catch (error) {
      console.error('❌ Error in saveFAQ:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      let errorMessage = this.t('faq.error_saving', 'Error saving FAQ') + ': ';
      
      if (error.message.includes('Failed to fetch')) {
        errorMessage += 'Network error - check if server is running';
      } else if (error.message.includes('token')) {
        errorMessage += 'Authentication error - please login again';
      } else {
        errorMessage += error.message;
      }
      
      this.showNotification(errorMessage, 'error');
      throw error;
    }
  },

  /**
   * Delete FAQ
   */
  async deleteFAQ(faqId) {
    if (!confirm(this.t('faq.delete_confirm'))) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/user/whatsapp-cloud/faqs/${faqId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        this.showNotification(this.t('faq.deleted_success'), 'success');
        await this.loadFAQs();
        await this.loadStatistics();
      } else {
        throw new Error('Failed to delete FAQ');
      }
    } catch (error) {
      console.error('Error deleting FAQ:', error);
      this.showNotification(this.t('faq.error_deleting'), 'error');
    }
  },

  /**
   * Toggle FAQ active status
   */
  async toggleFAQ(faqId) {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/user/whatsapp-cloud/faqs/${faqId}/toggle`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        await this.loadFAQs();
        await this.loadStatistics();
      } else {
        throw new Error('Failed to toggle FAQ');
      }
    } catch (error) {
      console.error('Error toggling FAQ:', error);
      this.showNotification(this.t('faq.error_saving', 'Error saving FAQ'), 'error');
    }
  },

  /**
   * Save settings
   */
  async saveSettings(settings) {
    try {
      const token = localStorage.getItem('token');
      const payload = {
        ...settings,
        accountId: this.state.selectedAccountId
      };

      const response = await fetch('/api/user/whatsapp-cloud/faqs/settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        this.showNotification(this.t('faq.settings_saved', 'Settings saved successfully!'), 'success');
        await this.loadSettings();
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showNotification(this.t('faq.error_saving', 'Error saving FAQ'), 'error');
    }
  },

  /**
   * Render FAQ list
   */
  render() {
    const container = document.getElementById('faq-container');
    if (!container) return;

    container.innerHTML = `
      <div class="faq-module">
        ${this.renderHeader()}
        ${this.renderStatistics()}
        ${this.renderFilters()}
        ${this.state.isLoading ? this.renderLoading() : this.renderFAQList()}
      </div>
    `;
  },

  /**
   * Render header
   */
  renderHeader() {
    return `
      <div class="faq-header">
        <div class="faq-header-left">
          <h2>${this.t('faq.title')}</h2>
          <p class="faq-subtitle">${this.t('faq.subtitle')}</p>
        </div>
        <div class="faq-header-right">
          <button class="btn btn-secondary" onclick="WhatsAppCloudFAQ.showSettings()">
            <i class="fas fa-cog"></i> ${this.t('faq.settings')}
          </button>
          <button class="btn btn-primary" onclick="WhatsAppCloudFAQ.showCreateModal()">
            <i class="fas fa-plus"></i> ${this.t('faq.add_new')}
          </button>
        </div>
      </div>
    `;
  },

  /**
   * Render enhanced statistics with AI metrics
   */
  renderStatistics() {
    const { 
      total = 0, 
      active = 0, 
      inactive = 0, 
      total_usage = 0,
      avg_usage = 0,
      used_count = 0,
      unused_count = 0
    } = this.state.statistics;
    
    const { 
      avg_confidence = 0,
      success_rate = 0,
      learning_insights = 0
    } = this.state.analytics || {};
    
    return `
      <div class="faq-statistics">
        <div class="stat-card">
          <div class="stat-icon"><i class="fas fa-list"></i></div>
          <div class="stat-content">
            <div class="stat-value">${total}</div>
            <div class="stat-label">${this.t('faq.total')}</div>
          </div>
        </div>
        <div class="stat-card stat-success">
          <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
          <div class="stat-content">
            <div class="stat-value">${active}</div>
            <div class="stat-label">${this.t('faq.active_count')}</div>
          </div>
        </div>
        <div class="stat-card stat-info">
          <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
          <div class="stat-content">
            <div class="stat-value">${total_usage}</div>
            <div class="stat-label">${this.t('faq.total_usage')}</div>
          </div>
        </div>
        <div class="stat-card stat-primary">
          <div class="stat-icon"><i class="fas fa-brain"></i></div>
          <div class="stat-content">
            <div class="stat-value">${(avg_confidence * 100).toFixed(1)}%</div>
            <div class="stat-label">${this.t('faq.avg_confidence')}</div>
          </div>
        </div>
        <div class="stat-card stat-success">
          <div class="stat-icon"><i class="fas fa-bullseye"></i></div>
          <div class="stat-content">
            <div class="stat-value">${(success_rate * 100).toFixed(1)}%</div>
            <div class="stat-label">${this.t('faq.success_rate')}</div>
          </div>
        </div>
        <div class="stat-card stat-warning">
          <div class="stat-icon"><i class="fas fa-pause-circle"></i></div>
          <div class="stat-content">
            <div class="stat-value">${unused_count}</div>
            <div class="stat-label">${this.t('faq.unused_count')}</div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Render filters
   */
  renderFilters() {
    return `
      <div class="faq-filters">
        <div class="filter-group">
          <label>${this.t('faq.account')}</label>
          <select id="faq-account-filter" onchange="WhatsAppCloudFAQ.onAccountChange(this.value)">
            <option value="">${this.t('faq.all_accounts')}</option>
            ${this.state.accounts.map(acc => `
              <option value="${acc.id}" ${this.state.selectedAccountId == acc.id ? 'selected' : ''}>
                ${acc.account_name}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="filter-group">
          <input 
            type="text" 
            id="faq-search" 
            placeholder="${this.t('faq.search')}"
            onkeyup="WhatsAppCloudFAQ.onSearch(this.value)"
          />
        </div>
      </div>
    `;
  },

  /**
   * Render loading state
   */
  renderLoading() {
    return `
      <div class="faq-loading">
        <div class="spinner"></div>
        <p>${this.t('faq.loading', 'Loading FAQs...')}</p>
      </div>
    `;
  },

  /**
   * Render FAQ list
   */
  renderFAQList() {
    if (this.state.faqs.length === 0) {
      return `
        <div class="faq-empty">
          <i class="fas fa-question-circle"></i>
          <h3>${this.t('faq.no_faqs')}</h3>
          <p>${this.t('faq.create_first')}</p>
          <button class="btn btn-primary" onclick="WhatsAppCloudFAQ.showCreateModal()">
            <i class="fas fa-plus"></i> ${this.t('faq.add_new')}
          </button>
        </div>
      `;
    }

    return `
      <div class="faq-list">
        ${this.state.faqs.map(faq => this.renderFAQCard(faq)).join('')}
      </div>
    `;
  },

  /**
   * Render enhanced FAQ card with performance metrics
   */
  renderFAQCard(faq) {
    const confidenceColor = faq.avg_confidence > 0.8 ? 'success' : faq.avg_confidence > 0.6 ? 'warning' : 'danger';
    const successColor = faq.success_rate > 0.8 ? 'success' : faq.success_rate > 0.6 ? 'warning' : 'danger';
    
    return `
      <div class="faq-card ${!faq.active ? 'faq-inactive' : ''}" data-faq-id="${faq.id}">
        <div class="faq-card-header">
          <div class="faq-card-title">
            ${faq.emoji ? `<span class="faq-emoji">${faq.emoji}</span>` : ''}
            <span class="faq-question">${this.escapeHtml(faq.question)}</span>
          </div>
          <div class="faq-card-actions">
            <button 
              class="btn-icon ${faq.active ? 'text-success' : 'text-muted'}" 
              onclick="WhatsAppCloudFAQ.toggleFAQ(${faq.id})"
              title="${faq.active ? this.t('faq.active') : this.t('faq.inactive')}"
            >
              <i class="fas fa-${faq.active ? 'check-circle' : 'pause-circle'}"></i>
            </button>
            <button 
              class="btn-icon" 
              onclick="WhatsAppCloudFAQ.showEditModal(${faq.id})"
              title="${this.t('faq.edit')}"
            >
              <i class="fas fa-edit"></i>
            </button>
            <button 
              class="btn-icon text-info" 
              onclick="WhatsAppCloudFAQ.showAnalytics(${faq.id})"
              title="${this.t('faq.analytics')}"
            >
              <i class="fas fa-chart-bar"></i>
            </button>
            <button 
              class="btn-icon text-danger" 
              onclick="WhatsAppCloudFAQ.deleteFAQ(${faq.id})"
              title="${this.t('faq.delete')}"
            >
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="faq-card-body">
          <p class="faq-answer">${this.escapeHtml(faq.answer)}</p>
          ${faq.keywords ? `
            <div class="faq-keywords">
              <i class="fas fa-tags"></i>
              ${faq.keywords.split(',').map(k => `<span class="faq-keyword">${k.trim()}</span>`).join('')}
            </div>
          ` : ''}
          
          <!-- Performance Metrics -->
          <div class="faq-metrics">
            <div class="metric-item">
              <span class="metric-label">
                <i class="fas fa-eye"></i> ${this.t('faq.usage')}
              </span>
              <span class="metric-value">${faq.usage_count || 0}</span>
            </div>
            ${faq.avg_confidence ? `
              <div class="metric-item">
                <span class="metric-label">
                  <i class="fas fa-brain"></i> ${this.t('faq.confidence')}
                </span>
                <span class="metric-value text-${confidenceColor}">
                  ${(faq.avg_confidence * 100).toFixed(1)}%
                </span>
              </div>
            ` : ''}
            ${faq.success_rate ? `
              <div class="metric-item">
                <span class="metric-label">
                  <i class="fas fa-bullseye"></i> ${this.t('faq.success')}
                </span>
                <span class="metric-value text-${successColor}">
                  ${(faq.success_rate * 100).toFixed(1)}%
                </span>
              </div>
            ` : ''}
          </div>
        </div>
        <div class="faq-card-footer">
          <span class="faq-category">
            <i class="fas fa-folder"></i> ${this.t(`faq.category_${faq.category}`, faq.category)}
          </span>
          <span class="faq-trigger">
            <i class="fas fa-bolt"></i> ${this.t(`faq.trigger_${faq.trigger_type}`, faq.trigger_type)}
          </span>
          ${faq.last_used_at ? `
            <span class="faq-last-used">
              <i class="fas fa-clock"></i> ${new Date(faq.last_used_at).toLocaleDateString()}
            </span>
          ` : ''}
        </div>
      </div>
    `;
  },

  /**
   * Show create modal
   */
  showCreateModal() {
    this.state.editingFaq = null;
    this.showFAQModal();
  },

  /**
   * Show edit modal
   */
  showEditModal(faqId) {
    this.state.editingFaq = this.state.faqs.find(f => f.id === faqId);
    this.showFAQModal();
  },

  /**
   * Show FAQ modal
   */
  showFAQModal() {
    const faq = this.state.editingFaq || {};
    const isEdit = !!faq.id;

    const modalHTML = `
      <div class="modal-overlay" id="faq-modal" onclick="WhatsAppCloudFAQ.closeModal(event)">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>${isEdit ? this.t('faq.edit') : this.t('faq.add_new')}</h3>
            <button class="modal-close" onclick="WhatsAppCloudFAQ.closeModal()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <form id="faq-form" onsubmit="WhatsAppCloudFAQ.handleSubmit(event)">
              <div class="form-group">
                <label>${this.t('faq.question')} *</label>
                <input 
                  type="text" 
                  name="question" 
                  value="${this.escapeHtml(faq.question || '')}"
                  required
                  maxlength="500"
                />
              </div>

              <div class="form-group">
                <label>${this.t('faq.answer')} *</label>
                <textarea 
                  name="answer" 
                  rows="5"
                  required
                  minlength="10"
                >${this.escapeHtml(faq.answer || '')}</textarea>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>${this.t('faq.emoji')}</label>
                  <input 
                    type="text" 
                    name="emoji" 
                    value="${this.escapeHtml(faq.emoji || '')}"
                    maxlength="10"
                  />
                </div>

                <div class="form-group">
                  <label>${this.t('faq.category')}</label>
                  <select name="category">
                    <option value="general" ${faq.category === 'general' ? 'selected' : ''}>
                      ${this.t('faq.category_general')}
                    </option>
                    <option value="support" ${faq.category === 'support' ? 'selected' : ''}>
                      ${this.t('faq.category_support')}
                    </option>
                    <option value="sales" ${faq.category === 'sales' ? 'selected' : ''}>
                      ${this.t('faq.category_sales')}
                    </option>
                    <option value="billing" ${faq.category === 'billing' ? 'selected' : ''}>
                      ${this.t('faq.category_billing')}
                    </option>
                    <option value="technical" ${faq.category === 'technical' ? 'selected' : ''}>
                      ${this.t('faq.category_technical')}
                    </option>
                    <option value="other" ${faq.category === 'other' ? 'selected' : ''}>
                      ${this.t('faq.category_other')}
                    </option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label>${this.t('faq.keywords')}</label>
                <input 
                  type="text" 
                  name="keywords" 
                  value="${this.escapeHtml(faq.keywords || '')}"
                  placeholder="${this.t('faq.keywords_placeholder', 'keyword1, keyword2, keyword3')}"
                />
                <small>${this.t('faq.keywords_help')}</small>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>${this.t('faq.trigger_type')}</label>
                  <select name="trigger_type">
                    <option value="keyword" ${faq.trigger_type === 'keyword' ? 'selected' : ''}>
                      ${this.t('faq.trigger_keyword')}
                    </option>
                    <option value="menu" ${faq.trigger_type === 'menu' ? 'selected' : ''}>
                      ${this.t('faq.trigger_menu')}
                    </option>
                    <option value="auto" ${faq.trigger_type === 'auto' ? 'selected' : ''}>
                      ${this.t('faq.trigger_auto')}
                    </option>
                  </select>
                </div>

                <div class="form-group">
                  <label>
                    <input 
                      type="checkbox" 
                      name="active" 
                      ${faq.active !== false ? 'checked' : ''}
                    />
                    ${this.t('faq.active')}
                  </label>
                </div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="WhatsAppCloudFAQ.closeModal()">
                  ${this.t('faq.cancel')}
                </button>
                <button type="submit" class="btn btn-primary">
                  ${this.t('faq.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  },

  /**
   * Show enhanced settings modal with AI configuration
   */
  showSettings() {
    const settings = this.state.settings;

    const modalHTML = `
      <div class="modal-overlay" id="settings-modal" onclick="WhatsAppCloudFAQ.closeModal(event)">
        <div class="modal-content modal-large" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>${this.t('faq.settings')}</h3>
            <button class="modal-close" onclick="WhatsAppCloudFAQ.closeModal()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body">
            <form id="settings-form" onsubmit="WhatsAppCloudFAQ.handleSettingsSubmit(event)">
              
              <!-- Basic Settings -->
              <div class="settings-section">
                <h4><i class="fas fa-cog"></i> ${this.t('faq.basic_settings')}</h4>
                
                <div class="form-group">
                  <label>
                    <input 
                      type="checkbox" 
                      name="auto_reply_enabled" 
                      ${settings.auto_reply_enabled !== false ? 'checked' : ''}
                    />
                    ${this.t('faq.auto_reply_enabled')}
                  </label>
                </div>

                <div class="form-group">
                  <label>
                    <input 
                      type="checkbox" 
                      name="menu_enabled" 
                      ${settings.menu_enabled !== false ? 'checked' : ''}
                    />
                    ${this.t('faq.menu_enabled')}
                  </label>
                </div>

                <div class="form-group">
                  <label>${this.t('faq.menu_trigger')}</label>
                  <input 
                    type="text" 
                    name="menu_trigger_keyword" 
                    value="${this.escapeHtml(settings.menu_trigger_keyword || 'menu')}"
                  />
                  <small>${this.t('faq.menu_trigger_help')}</small>
                </div>
              </div>

              <!-- AI & Intelligence Settings -->
              <div class="settings-section">
                <h4><i class="fas fa-brain"></i> ${this.t('faq.ai_settings')}</h4>
                
                <div class="form-group">
                  <label>
                    <input 
                      type="checkbox" 
                      name="learning_enabled" 
                      ${settings.learning_enabled !== false ? 'checked' : ''}
                    />
                    ${this.t('faq.learning_enabled')}
                  </label>
                  <small>${this.t('faq.learning_enabled_help')}</small>
                </div>

                <div class="form-group">
                  <label>
                    <input 
                      type="checkbox" 
                      name="context_awareness" 
                      ${settings.context_awareness !== false ? 'checked' : ''}
                    />
                    ${this.t('faq.context_awareness')}
                  </label>
                  <small>${this.t('faq.context_awareness_help')}</small>
                </div>

                <div class="form-group">
                  <label>
                    <input 
                      type="checkbox" 
                      name="feedback_collection" 
                      ${settings.feedback_collection !== false ? 'checked' : ''}
                    />
                    ${this.t('faq.feedback_collection')}
                  </label>
                  <small>${this.t('faq.feedback_collection_help')}</small>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label>${this.t('faq.similarity_threshold')}</label>
                    <input 
                      type="number" 
                      name="similarity_threshold" 
                      value="${settings.similarity_threshold || 0.70}"
                      min="0"
                      max="1"
                      step="0.01"
                    />
                    <small>${this.t('faq.similarity_threshold_help')}</small>
                  </div>

                  <div class="form-group">
                    <label>${this.t('faq.suggestion_threshold')}</label>
                    <input 
                      type="number" 
                      name="suggestion_threshold" 
                      value="${settings.suggestion_threshold || 0.50}"
                      min="0"
                      max="1"
                      step="0.01"
                    />
                    <small>${this.t('faq.suggestion_threshold_help')}</small>
                  </div>
                </div>

                <div class="form-group">
                  <label>${this.t('faq.max_suggestions')}</label>
                  <input 
                    type="number" 
                    name="max_suggestions" 
                    value="${settings.max_suggestions || 3}"
                    min="1"
                    max="10"
                  />
                  <small>${this.t('faq.max_suggestions_help')}</small>
                </div>
              </div>

              <!-- Message Templates -->
              <div class="settings-section">
                <h4><i class="fas fa-comments"></i> ${this.t('faq.message_templates')}</h4>

                <div class="form-group">
                  <label>${this.t('faq.welcome_message')}</label>
                  <textarea 
                    name="welcome_message" 
                    rows="3"
                  >${this.escapeHtml(settings.welcome_message || '')}</textarea>
                  <small>${this.t('faq.welcome_message_help')}</small>
                </div>

                <div class="form-group">
                  <label>${this.t('faq.no_match_message')}</label>
                  <textarea 
                    name="no_match_message" 
                    rows="3"
                  >${this.escapeHtml(settings.no_match_message || '')}</textarea>
                  <small>${this.t('faq.no_match_message_help')}</small>
                </div>

                <div class="form-group">
                  <label>${this.t('faq.menu_header')}</label>
                  <textarea 
                    name="menu_header" 
                    rows="2"
                  >${this.escapeHtml(settings.menu_header || '')}</textarea>
                  <small>${this.t('faq.menu_header_help')}</small>
                </div>

                <div class="form-group">
                  <label>${this.t('faq.menu_footer')}</label>
                  <textarea 
                    name="menu_footer" 
                    rows="2"
                  >${this.escapeHtml(settings.menu_footer || '')}</textarea>
                  <small>${this.t('faq.menu_footer_help')}</small>
                </div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="WhatsAppCloudFAQ.closeModal()">
                  ${this.t('faq.cancel')}
                </button>
                <button type="submit" class="btn btn-primary">
                  ${this.t('faq.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  },

  /**
   * Handle FAQ form submit with enhanced debugging
   */
  async handleSubmit(event) {
    event.preventDefault();
    
    console.log('🚀 FAQ form submitted');
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Collect form data with proper validation
    const question = formData.get('question');
    const answer = formData.get('answer');
    const emoji = formData.get('emoji');
    const category = formData.get('category');
    const keywords = formData.get('keywords');
    const trigger_type = formData.get('trigger_type');
    const active = formData.get('active') === 'on';

    console.log('📝 Raw form data:', {
      question,
      answer,
      emoji,
      category,
      keywords,
      trigger_type,
      active
    });

    // Validate required fields
    if (!question || question.trim().length === 0) {
      console.error('❌ Validation failed: Question is empty');
      this.showNotification(this.t('faq.validation_question_required', 'Question is required'), 'error');
      return;
    }

    if (!answer || answer.trim().length === 0) {
      console.error('❌ Validation failed: Answer is empty');
      this.showNotification(this.t('faq.validation_answer_required', 'Answer is required'), 'error');
      return;
    }

    if (question.trim().length < 5) {
      console.error('❌ Validation failed: Question too short');
      this.showNotification(this.t('faq.validation_question_length', 'Question must be at least 5 characters'), 'error');
      return;
    }

    if (answer.trim().length < 10) {
      console.error('❌ Validation failed: Answer too short');
      this.showNotification(this.t('faq.validation_answer_length', 'Answer must be at least 10 characters'), 'error');
      return;
    }

    // Build FAQ data object
    const faqData = {
      question: question.trim(),
      answer: answer.trim(),
      emoji: emoji && emoji.trim().length > 0 ? emoji.trim() : null,
      category: category || 'general',
      keywords: keywords && keywords.trim().length > 0 ? keywords.trim() : null,
      trigger_type: trigger_type || 'keyword',
      active: active,
      account_id: this.state.selectedAccountId || null
    };

    // Add ID if editing
    if (this.state.editingFaq) {
      faqData.id = this.state.editingFaq.id;
      console.log('✏️ Editing FAQ with ID:', faqData.id);
    } else {
      console.log('➕ Creating new FAQ');
    }

    console.log('📊 Final FAQ data to send:', JSON.stringify(faqData, null, 2));
    console.log('🔑 Current token:', localStorage.getItem('token') ? 'Present' : 'Missing');
    console.log('🏢 Selected account ID:', this.state.selectedAccountId);
    console.log('✅ Validation passed, calling saveFAQ...');

    try {
      const result = await this.saveFAQ(faqData);
      console.log('✅ FAQ saved successfully:', result);
    } catch (error) {
      console.error('❌ Error in handleSubmit:', error);
      // Error already handled in saveFAQ
    }
  },

  /**
   * Handle enhanced settings form submit
   */
  async handleSettingsSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    const settings = {
      auto_reply_enabled: formData.get('auto_reply_enabled') === 'on',
      menu_enabled: formData.get('menu_enabled') === 'on',
      learning_enabled: formData.get('learning_enabled') === 'on',
      context_awareness: formData.get('context_awareness') === 'on',
      feedback_collection: formData.get('feedback_collection') === 'on',
      menu_trigger_keyword: formData.get('menu_trigger_keyword'),
      welcome_message: formData.get('welcome_message'),
      no_match_message: formData.get('no_match_message'),
      menu_header: formData.get('menu_header'),
      menu_footer: formData.get('menu_footer'),
      similarity_threshold: parseFloat(formData.get('similarity_threshold')),
      suggestion_threshold: parseFloat(formData.get('suggestion_threshold')),
      max_suggestions: parseInt(formData.get('max_suggestions'))
    };

    try {
      await this.saveSettings(settings);
      this.closeModal();
    } catch (error) {
      // Error already handled in saveSettings
    }
  },

  /**
   * Show FAQ analytics modal
   */
  async showAnalytics(faqId) {
    const faq = this.state.faqs.find(f => f.id === faqId);
    if (!faq) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/user/whatsapp-cloud/faqs/${faqId}/analytics`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      let analytics = {};
      if (response.ok) {
        const data = await response.json();
        analytics = data.data || {};
      }

      const modalHTML = `
        <div class="modal-overlay" id="analytics-modal" onclick="WhatsAppCloudFAQ.closeModal(event)">
          <div class="modal-content modal-large" onclick="event.stopPropagation()">
            <div class="modal-header">
              <h3><i class="fas fa-chart-bar"></i> ${this.t('faq.analytics')} - ${this.escapeHtml(faq.question)}</h3>
              <button class="modal-close" onclick="WhatsAppCloudFAQ.closeModal()">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="analytics-grid">
                <div class="analytics-card">
                  <div class="analytics-icon"><i class="fas fa-eye"></i></div>
                  <div class="analytics-content">
                    <div class="analytics-value">${faq.usage_count || 0}</div>
                    <div class="analytics-label">${this.t('faq.total_uses')}</div>
                  </div>
                </div>
                
                <div class="analytics-card">
                  <div class="analytics-icon"><i class="fas fa-brain"></i></div>
                  <div class="analytics-content">
                    <div class="analytics-value">${faq.avg_confidence ? (faq.avg_confidence * 100).toFixed(1) + '%' : 'N/A'}</div>
                    <div class="analytics-label">${this.t('faq.avg_confidence')}</div>
                  </div>
                </div>
                
                <div class="analytics-card">
                  <div class="analytics-icon"><i class="fas fa-bullseye"></i></div>
                  <div class="analytics-content">
                    <div class="analytics-value">${faq.success_rate ? (faq.success_rate * 100).toFixed(1) + '%' : 'N/A'}</div>
                    <div class="analytics-label">${this.t('faq.success_rate')}</div>
                  </div>
                </div>
                
                <div class="analytics-card">
                  <div class="analytics-icon"><i class="fas fa-thumbs-up"></i></div>
                  <div class="analytics-content">
                    <div class="analytics-value">${analytics.helpful_feedback || 0}</div>
                    <div class="analytics-label">${this.t('faq.helpful_feedback')}</div>
                  </div>
                </div>
              </div>
              
              ${analytics.recent_usage ? `
                <div class="analytics-section">
                  <h4>${this.t('faq.recent_usage')}</h4>
                  <div class="usage-timeline">
                    ${analytics.recent_usage.map(usage => `
                      <div class="usage-item">
                        <div class="usage-date">${new Date(usage.created_at).toLocaleDateString()}</div>
                        <div class="usage-details">
                          <div class="usage-message">${this.escapeHtml(usage.user_message || 'N/A')}</div>
                          <div class="usage-meta">
                            <span class="usage-confidence">${usage.confidence_score ? (usage.confidence_score * 100).toFixed(1) + '%' : 'N/A'}</span>
                            <span class="usage-algorithm">${usage.algorithm_used || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
              
              ${analytics.failed_searches ? `
                <div class="analytics-section">
                  <h4>${this.t('faq.related_failed_searches')}</h4>
                  <div class="failed-searches">
                    ${analytics.failed_searches.map(search => `
                      <div class="failed-search-item">
                        <div class="search-query">${this.escapeHtml(search.query)}</div>
                        <div class="search-count">${search.search_count} ${this.t('faq.times')}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="WhatsAppCloudFAQ.closeModal()">
                ${this.t('faq.close')}
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', modalHTML);
    } catch (error) {
      console.error('Error loading FAQ analytics:', error);
      this.showNotification(this.t('faq.error_loading_analytics'), 'error');
    }
  },

  /**
   * Close modal
   */
  closeModal(event) {
    if (event && event.target.classList.contains('modal-content')) {
      return;
    }
    
    const modals = document.querySelectorAll('.modal-overlay');
    modals.forEach(modal => modal.remove());
  },

  /**
   * Handle account filter change
   */
  async onAccountChange(accountId) {
    this.state.selectedAccountId = accountId || null;
    await this.loadFAQs();
    await this.loadSettings();
    await this.loadStatistics();
  },

  /**
   * Handle search
   */
  onSearch(query) {
    // Implement client-side filtering or API search
    console.log('Search:', query);
  },

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Add any global event listeners here
  },

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    console.log(`📢 Notification [${type}]:`, message);
    
    // Try multiple notification systems
    if (window.showNotification) {
      window.showNotification(message, type);
    } else if (window.toastr) {
      window.toastr[type](message);
    } else if (window.Swal) {
      window.Swal.fire({
        icon: type === 'error' ? 'error' : type === 'success' ? 'success' : 'info',
        title: type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Info',
        text: message,
        timer: 3000
      });
    } else {
      // Fallback to custom notification
      this.showCustomNotification(message, type);
    }
  },

  /**
   * Show custom notification
   */
  showCustomNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `custom-notification notification-${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
      </div>
    `;
    
    // Add styles if not exists
    if (!document.getElementById('notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        .custom-notification {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 15px 20px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 10000;
          animation: slideIn 0.3s ease;
          display: flex;
          align-items: center;
          gap: 10px;
          max-width: 400px;
        }
        .notification-success { border-left: 4px solid #10b981; }
        .notification-error { border-left: 4px solid #ef4444; }
        .notification-info { border-left: 4px solid #3b82f6; }
        .notification-content { display: flex; align-items: center; gap: 10px; }
        .notification-success i { color: #10b981; }
        .notification-error i { color: #ef4444; }
        .notification-info i { color: #3b82f6; }
        @keyframes slideIn {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  },

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Auto-initialize if container exists
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('faq-container')) {
    WhatsAppCloudFAQ.init();
  }
});
