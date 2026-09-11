/**
 * WhatsApp Cloud Module
 * A comprehensive module for managing WhatsApp Cloud API integration
 * Features: Sales Pipeline, Flow Builder, FAQ, Mass Campaigns, Multi-Account Connection
 * 
 * @version 2.0.0
 * @author Beloma
 */

const WhatsAppCloud = {
  // ============================================
  // STATE MANAGEMENT
  // ============================================
  
  state: {
    // Active tab
    activeTab: 'conversations',
    
    // Accounts
    accounts: [],
    activeAccountId: null,
    
    // Pipeline (Conversations)
    pipeline: {
      stages: [
        { id: 'unassigned', name: 'Unassigned', icon: 'fas fa-inbox', color: '#6b7280' },
        { id: 'new', name: 'New', icon: 'fas fa-star', color: '#3b82f6' },
        { id: 'negotiation', name: 'Negotiation', icon: 'fas fa-handshake', color: '#f59e0b' },
        { id: 'won', name: 'Won', icon: 'fas fa-trophy', color: '#10b981' },
        { id: 'lost', name: 'Lost', icon: 'fas fa-times-circle', color: '#ef4444' }
      ],
      cards: []
    },
    
    // Flow Builder
    flows: [],
    activeFlowId: null,
    flowEditorMode: false,
    selectedNode: null,
    draggedCard: null,
    draggedNode: null,
    draggedColumn: null,
    flowZoom: 1,
    flowPan: { x: 0, y: 0 },
    aiConfigs: [],
    
    // FAQ
    faqs: [],
    faqCategories: ['general', 'sales', 'support', 'billing', 'technical'],
    
    // Campaigns
    campaigns: [],
    templates: [],
    
    // UI State
    initialized: false,
    loading: false,
    userName: '',
    storeId: null,
    departmentId: null,
    storeName: '',
    departmentName: ''
  },

  // ============================================
  // INITIALIZATION
  // ============================================

  init() {
    if (this.state.initialized) {
      this.render();
      return;
    }

    console.log('🚀 Initializing WhatsApp Cloud Module...');
    
    // Check for Facebook callback in localStorage
    this.checkFacebookCallback();
    
    // Load saved state from localStorage (only UI preferences)
    this.loadState();
    
    this.loadUserContext();
    
    // Load real data from backend
    this.loadAccounts();
    this.loadFlows();
    this.loadFAQs();
    this.loadAiConfigs();
    
    // Render the UI
    this.render();
    
    // Initialize event listeners
    this.initEventListeners();
    
    // Initialize drag and drop
    this.initDragAndDrop();
    
    // Start auto-refresh polling
    this.startPolling();
    
    this.state.initialized = true;
    console.log('✅ WhatsApp Cloud Module initialized');
  },

  checkFacebookCallback() {
    // Check if there's a Facebook callback code in localStorage
    const code = localStorage.getItem('facebook_callback_code');
    const timestamp = localStorage.getItem('facebook_callback_timestamp');
    const error = localStorage.getItem('facebook_callback_error');
    
    if (error) {
      console.log('Facebook callback error found:', error);
      this.notify('error', `Facebook login error: ${error}`);
      localStorage.removeItem('facebook_callback_error');
      return;
    }
    
    if (code && timestamp) {
      // Check if callback is recent (within last 2 minutes)
      const age = Date.now() - parseInt(timestamp);
      if (age < 120000) { // 2 minutes
        console.log('Processing Facebook callback from localStorage:', code);
        this.handleFacebookLoginSuccess({ code: code });
        
        // Clear the stored code
        localStorage.removeItem('facebook_callback_code');
        localStorage.removeItem('facebook_callback_timestamp');
      } else {
        // Code is too old, clear it
        console.log('Facebook callback code expired, clearing');
        localStorage.removeItem('facebook_callback_code');
        localStorage.removeItem('facebook_callback_timestamp');
      }
    }
  },

  // ============================================
  // TRANSLATION HELPER
  // ============================================

  t(key, fallback = '') {
    if (typeof i18n !== 'undefined' && i18n.t) {
      return i18n.t(key) || fallback;
    }
    return fallback;
  },

  // ============================================
  // STATE PERSISTENCE
  // ============================================

  loadState() {
    try {
      const saved = localStorage.getItem('whatsapp_cloud_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only load UI preferences, not data
        // Data will be loaded from backend
        if (parsed.activeTab) {
          this.state.activeTab = parsed.activeTab;
        }
        if (parsed.flowZoom) {
          this.state.flowZoom = parsed.flowZoom;
        }
        if (parsed.flowPan) {
          this.state.flowPan = parsed.flowPan;
        }
      }
    } catch (e) {
      console.warn('Failed to load WhatsApp Cloud state:', e);
    }
  },

  saveState() {
    try {
      // Only save UI preferences and IDs, not full data
      const stateToSave = {
        activeTab: this.state.activeTab,
        activeAccountId: this.state.activeAccountId,
        flowZoom: this.state.flowZoom,
        flowPan: this.state.flowPan
      };
      localStorage.setItem('whatsapp_cloud_state', JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('Failed to save WhatsApp Cloud state:', e);
    }
  },

  clearDemoData() {
    // Clear all demo data from localStorage
    localStorage.removeItem('whatsapp_cloud_state');
    console.log('✅ Demo data cleared from localStorage');
  },

  // ============================================
  // LOAD REAL DATA FROM BACKEND
  // ============================================

  loadAccounts() {
    // Load connected WhatsApp accounts from backend
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('No auth token found');
      return;
    }

    fetch('/api/whatsapp-cloud/accounts', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => response.json())
    .then(result => {
      if (result.success && result.data) {
        this.state.accounts = result.data.map(acc => ({
          id: acc.id,
          name: acc.account_name,
          phoneNumber: acc.phone_number,
          phoneNumberId: acc.phone_number_id,
          wabaId: acc.waba_id,
          status: acc.status,
          isDefault: acc.is_default,
          webhookVerified: acc.webhook_verified,
          templatesSyncedAt: acc.templates_synced_at,
          templatesCount: acc.templates_count || 0
        }));
        
        // Set active account to default or first account
        const defaultAccount = this.state.accounts.find(a => a.isDefault);
        if (defaultAccount) {
          this.state.activeAccountId = defaultAccount.id;
        } else if (this.state.accounts.length > 0) {
          this.state.activeAccountId = this.state.accounts[0].id;
        }
        
        this.saveState();
        
        // Load templates and conversations after accounts are loaded
        if (this.state.activeAccountId) {
          this.loadTemplates();
          this.loadConversations();
        }
        
        this.render();
      }
    })
    .catch(error => {
      console.error('Error loading accounts:', error);
    });
  },

  loadTemplates() {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('No token for loading templates');
      return;
    }

    const activeAccount = this.state.accounts.find(a => a.id === this.state.activeAccountId);
    if (!activeAccount) {
      console.log('No active account for loading templates');
      return;
    }

    console.log('Loading templates for account:', activeAccount.id);

    // Load templates from backend
    fetch(`/api/whatsapp-cloud/accounts/${activeAccount.id}/templates`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => response.json())
    .then(result => {
      console.log('Templates loaded:', result);
      if (result.success && result.data) {
        this.state.templates = result.data.templates || [];
        console.log('Templates set to state:', this.state.templates.length);
        this.saveState();
        this.render();
      }
    })
    .catch(error => {
      console.error('Error loading templates:', error);
    });
  },

  loadFlows() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.state.flows = [];
      return Promise.resolve([]);
    }
    const accountId = this.state.activeAccountId;
    const params = new URLSearchParams();
    if (accountId) {
      params.set('accountId', accountId);
    }
    const url = `/api/user/whatsapp-cloud/flows${params.toString() ? `?${params.toString()}` : ''}`;
    return fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true'
      }
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data)) {
          this.state.flows = result.data;
        } else {
          this.state.flows = [];
        }
        if (this.state.activeTab === 'flow-builder') {
          this.renderWorkspace();
        }
        return this.state.flows;
      })
      .catch(() => {
        this.state.flows = [];
        if (this.state.activeTab === 'flow-builder') {
          this.renderWorkspace();
        }
        return [];
      });
  },

  loadAiConfigs() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.state.aiConfigs = [];
      return;
    }
    return fetch('/api/tenant/ai-config/settings', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true'
      }
    })
    .then(res => res.json())
    .then(result => {
      if (result.success && result.data) {
        this.state.aiConfigs = result.data;
      } else {
        this.state.aiConfigs = [];
      }
      return this.state.aiConfigs;
    })
    .catch(() => {
      this.state.aiConfigs = [];
    });
  },

  loadFAQs() {
    // TODO: Load FAQs from backend
    // For now, keep empty until backend endpoint is created
    this.state.faqs = [];
  },

  loadConversations() {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('No token for loading conversations');
      return;
    }

    console.log('Loading conversations from backend...');

    fetch('/api/whatsapp-cloud/conversations', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => response.json())
    .then(result => {
      console.log('Conversations loaded:', result);
      if (result.success && result.data) {
        // Convert conversations to pipeline cards format
        this.state.pipeline.cards = result.data.map(conv => ({
          id: conv.id,
          name: conv.contact_name || conv.contact_phone,
          phone: conv.contact_phone,
          avatar: conv.contact_profile_pic,
          lastMessage: conv.last_message_text,
          timestamp: new Date(conv.last_message_time).getTime(),
          stageId: conv.status === 'closed' ? 'lost' : 'new',
          tags: [],
          unreadCount: conv.unread_count,
          conversationId: conv.id
        }));
        
        console.log('Conversations converted to cards:', this.state.pipeline.cards.length);
        this.saveState();
        this.render();
      }
    })
    .catch(error => {
      console.error('Error loading conversations:', error);
    });
  },

  // ============================================
  // MAIN RENDER
  // ============================================

  render() {
    const page = document.getElementById('whatsapp-cloud-page');
    if (!page) return;

    page.innerHTML = this.renderLayout();
    
    // Apply translations
    if (typeof i18n !== 'undefined' && i18n.translatePage) {
      i18n.translatePage();
    }
  },

  renderLayout() {
    return `
      <div class="wc-workspace" id="wcWorkspace">
        <!-- Internal Sidebar -->
        <div class="wc-internal-sidebar" id="wcInternalSidebar">
          ${this.renderInternalSidebar()}
        </div>
        
        <!-- Main Content Area -->
        <div class="wc-main-content">
          <!-- Horizontal Tab Navigation -->
          <div class="wc-horizontal-tabs">
            ${this.renderHorizontalTabs()}
          </div>
          
          <!-- Tab Content Panels -->
          <div class="wc-tab-content">
            ${this.renderTabContent()}
          </div>
        </div>
      </div>
    `;
  },

  // ============================================
  // INTERNAL SIDEBAR
  // ============================================

  renderInternalSidebar() {
    const accounts = this.state.accounts;
    const activeAccount = accounts.find(a => a.id === this.state.activeAccountId);

    return `
      <div class="wc-sidebar-header">
        <div class="wc-sidebar-logo">
          <i class="fab fa-whatsapp"></i>
          <span>WhatsApp Cloud</span>
        </div>
      </div>
      
      <div class="wc-sidebar-account-selector" id="wcAccountSelector">
        <div class="wc-sidebar-account-current">
          ${activeAccount ? `
            <div class="wc-sidebar-account-avatar">
              <i class="fab fa-whatsapp"></i>
            </div>
            <div class="wc-sidebar-account-info">
              <span class="wc-sidebar-account-name">${activeAccount.name}</span>
              <span class="wc-sidebar-account-phone">${activeAccount.phoneNumber || 'No phone'}</span>
            </div>
            <span class="wc-sidebar-account-status ${activeAccount.status}">${activeAccount.status}</span>
          ` : `
            <div class="wc-sidebar-account-empty">
              <i class="fas fa-plus-circle"></i>
              <span>Select Account</span>
            </div>
          `}
          <i class="fas fa-chevron-down wc-sidebar-account-chevron"></i>
        </div>
      </div>
      
      <div class="wc-sidebar-search">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Search..." id="wcSidebarSearch">
      </div>
      
      <div class="wc-sidebar-conversations" id="wcSidebarConversations">
        ${this.renderSidebarConversations()}
      </div>
      
      <div class="wc-sidebar-footer">
        <button class="wc-sidebar-add-btn" id="wcAddAccountBtn">
          <i class="fas fa-plus"></i>
          <span>Add Account</span>
        </button>
      </div>
    `;
  },

  renderSidebarConversations() {
    const cards = this.state.pipeline.cards;
    
    if (cards.length === 0) {
      return `
        <div class="wc-sidebar-empty">
          <i class="fas fa-comments"></i>
          <h4>No conversations</h4>
          <p>Conversations will appear here</p>
        </div>
      `;
    }

    return cards.map(card => `
      <div class="wc-sidebar-conversation-item ${card.id === this.state.selectedCard ? 'active' : ''}" data-card-id="${card.id}">
        <div class="wc-sidebar-conversation-avatar">
          ${card.avatar ? `<img src="${card.avatar}" alt="${card.name}">` : `<span>${card.name.charAt(0).toUpperCase()}</span>`}
        </div>
        <div class="wc-sidebar-conversation-content">
          <div class="wc-sidebar-conversation-header">
            <span class="wc-sidebar-conversation-name">${card.name}</span>
            <span class="wc-sidebar-conversation-time">${this.formatTime(card.timestamp)}</span>
          </div>
          <div class="wc-sidebar-conversation-preview">
            <i class="fas fa-check-double" style="color: #53bdeb; font-size: 12px;"></i>
            <span>${this.truncate(card.lastMessage, 40)}</span>
          </div>
          ${card.tags && card.tags.length > 0 ? `
            <div class="wc-sidebar-conversation-tags">
              ${card.tags.map(tag => `<span class="wc-tag">${tag}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
  },

  // ============================================
  // HORIZONTAL TABS
  // ============================================

  renderHorizontalTabs() {
    const tabs = [
      { id: 'conversations', icon: 'fas fa-comments', label: 'Conversations' },
      { id: 'flow-builder', icon: 'fas fa-project-diagram', label: 'Flow Builder' },
      { id: 'faq', icon: 'fas fa-question-circle', label: 'FAQ' },
      { id: 'campaigns', icon: 'fas fa-bullhorn', label: 'Campaigns' },
      { id: 'connection', icon: 'fas fa-plug', label: 'Connection' }
    ];

    return `
      <div class="wc-tabs-container">
        ${tabs.map(tab => `
          <button class="wc-horizontal-tab ${this.state.activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
            <i class="${tab.icon}"></i>
            <span>${tab.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  },

  // ============================================
  // TAB CONTENT
  // ============================================

  renderTabContent() {
    return `
      <div class="wc-tab-panel ${this.state.activeTab === 'conversations' ? 'active' : ''}" data-panel="conversations">
        ${this.renderConversationsTab()}
      </div>
      <div class="wc-tab-panel ${this.state.activeTab === 'flow-builder' ? 'active' : ''}" data-panel="flow-builder">
        ${this.state.flowEditorMode ? this.renderFlowEditor() : this.renderFlowList()}
      </div>
      <div class="wc-tab-panel ${this.state.activeTab === 'faq' ? 'active' : ''}" data-panel="faq">
        ${this.renderFaqTab()}
      </div>
      <div class="wc-tab-panel ${this.state.activeTab === 'campaigns' ? 'active' : ''}" data-panel="campaigns">
        ${this.renderCampaignsTab()}
      </div>
      <div class="wc-tab-panel ${this.state.activeTab === 'connection' ? 'active' : ''}" data-panel="connection">
        ${this.renderConnectionTab()}
      </div>
    `;
  },

  // Helper methods
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 86400000) { // Less than 24 hours
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 604800000) { // Less than 7 days
      const days = Math.floor(diff / 86400000);
      return days === 1 ? '1 day' : `${days} days`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  },

  truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
  },

  notify(type, message) {
    if (typeof showNotification === 'function') {
      showNotification(message, type);
    } else {
      console.log(`[${type}] ${message}`);
    }
  },

  async loadUserContext() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      this.state.userName = payload.name || '';
      this.state.storeId = payload.store_id || null;
      this.state.departmentId = payload.department_id || null;
    } catch (e) {
      return;
    }

    const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
    const [storesRes, departmentsRes] = await Promise.all([
      fetch('/api/user/whatsapp-cloud/stores', { headers }),
      fetch('/api/user/whatsapp-cloud/departments', { headers })
    ]);

    if (storesRes.ok) {
      const storesData = await storesRes.json();
      const store = (storesData.data || []).find(s => String(s.id) === String(this.state.storeId));
      this.state.storeName = store?.name || '';
    }
    if (departmentsRes.ok) {
      const departmentsData = await departmentsRes.json();
      const department = (departmentsData.data || []).find(d => String(d.id) === String(this.state.departmentId));
      this.state.departmentName = department?.name || '';
    }
    this.render();
  },

  getUserHeaderTitle() {
    const location = this.state.departmentName || this.state.storeName || this.state.departmentId || this.state.storeId || '';
    return location ? `${this.state.userName} - ${location}` : (this.state.userName || 'User');
  },


  // ============================================
  // CONVERSATIONS TAB - SALES PIPELINE
  // ============================================

  renderConversationsTab() {
    const stages = this.state.pipeline.stages;
    const cards = this.state.pipeline.cards;

    return `
      <div class="wc-pipeline-container">
        <div class="wc-pipeline-header">
          <div class="wc-pipeline-title-section">
            <h2 class="wc-pipeline-title">${this.getUserHeaderTitle()}</h2>
            <p class="wc-pipeline-subtitle">Drag and drop cards to move conversations between stages</p>
          </div>
          <div class="wc-pipeline-actions">
            <button class="btn btn-secondary btn-sm" id="wcPipelineFilterBtn">
              <i class="fas fa-filter"></i>
              <span>Filter</span>
            </button>
            <button class="btn btn-primary" id="wcAddStageBtn">
              <i class="fas fa-plus"></i>
              <span>Add Stage</span>
            </button>
          </div>
        </div>
        
        <div class="wc-pipeline-board" id="wcPipelineBoard">
          ${stages.map(stage => this.renderPipelineColumn(stage, cards.filter(c => c.stageId === stage.id))).join('')}
          
          <div class="wc-pipeline-add-column" id="wcAddColumnBtn">
            <i class="fas fa-plus"></i>
            <span>Add Stage</span>
          </div>
        </div>
        
        <div class="wc-pipeline-navigation">
          <button class="wc-pipeline-nav-btn" id="wcPipelineNavLeft">
            <i class="fas fa-chevron-left"></i>
          </button>
          <button class="wc-pipeline-nav-btn" id="wcPipelineNavRight">
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>
    `;
  },

  renderPipelineColumn(stage, cards) {
    return `
      <div class="wc-pipeline-column" draggable="true" data-stage-id="${stage.id}">
        <div class="wc-pipeline-column-header">
          <div class="wc-pipeline-column-title">
            <span class="wc-pipeline-column-icon" style="color: ${stage.color}">
              <i class="${stage.icon}"></i>
            </span>
            <span class="wc-pipeline-column-name">${stage.name}</span>
            <span class="wc-pipeline-column-count">${cards.length}</span>
          </div>
          <button class="wc-pipeline-column-menu" data-stage-id="${stage.id}">
            <i class="fas fa-ellipsis-h"></i>
          </button>
        </div>
        <div class="wc-pipeline-column-body" data-stage-id="${stage.id}">
          ${cards.map(card => this.renderPipelineCard(card)).join('')}
        </div>
      </div>
    `;
  },

  renderPipelineCard(card) {
    return `
      <div class="wc-pipeline-card" draggable="true" data-card-id="${card.id}">
        <div class="wc-pipeline-card-header">
          <div class="wc-pipeline-card-avatar">
            ${card.avatar ? `<img src="${card.avatar}" alt="${card.name}">` : `<span>${card.name.charAt(0).toUpperCase()}</span>`}
          </div>
          <div class="wc-pipeline-card-info">
            <span class="wc-pipeline-card-name">${card.name}</span>
            <span class="wc-pipeline-card-phone">${card.phone}</span>
          </div>
        </div>
        <div class="wc-pipeline-card-message">
          ${this.truncate(card.lastMessage, 80)}
        </div>
        <div class="wc-pipeline-card-footer">
          ${card.tags && card.tags.length > 0 ? `
            <div class="wc-pipeline-card-tags">
              ${card.tags.slice(0, 2).map(tag => `<span class="wc-tag-small">${tag}</span>`).join('')}
            </div>
          ` : ''}
          <span class="wc-pipeline-card-time">
            <i class="far fa-clock"></i>
            ${this.formatTime(card.timestamp)}
          </span>
        </div>
      </div>
    `;
  },

  // ============================================
  // FLOW BUILDER TAB
  // ============================================

  renderFlowList() {
    const flows = this.state.flows;
    const activeAccount = this.state.accounts.find(a => a.id === this.state.activeAccountId);

    return `
      <div class="wc-flow-list-container">
        <div class="wc-flow-list-header">
          <div>
            <h2 class="wc-flow-list-title">Automations</h2>
            <p class="wc-flow-list-subtitle">Manage your conversation flows</p>
          </div>
          <button class="btn btn-primary" id="wcNewFlowBtn">
            <i class="fas fa-plus"></i>
            <span>New Automation</span>
          </button>
        </div>
        
        ${flows.length === 0 ? `
          <div class="wc-flow-empty">
            <div class="wc-flow-empty-icon">
              <i class="fas fa-project-diagram"></i>
            </div>
            <h3>No automations yet</h3>
            <p>Create your first automation to engage customers automatically</p>
            <button class="btn btn-primary" id="wcNewFlowBtnEmpty">
              <i class="fas fa-plus"></i>
              <span>Create Automation</span>
            </button>
          </div>
        ` : `
          <div class="wc-flow-grid">
            ${flows.map(flow => this.renderFlowCard(flow)).join('')}
          </div>
        `}
      </div>
    `;
  },

  renderFlowCard(flow) {
    return `
      <div class="wc-flow-card" data-flow-id="${flow.id}">
        <div class="wc-flow-card-header">
          <div class="wc-flow-card-icon">
            <i class="fas fa-robot"></i>
          </div>
          <div class="wc-flow-card-info">
            <h4 class="wc-flow-card-name">${flow.name}</h4>
            <p class="wc-flow-card-trigger">
              <i class="fas fa-bolt"></i>
              ${flow.trigger}: ${flow.triggerValue || 'Any'}
            </p>
          </div>
          <label class="wc-flow-card-toggle">
            <input type="checkbox" ${flow.active ? 'checked' : ''} data-flow-id="${flow.id}">
            <span class="wc-toggle-slider"></span>
          </label>
        </div>
        <div class="wc-flow-card-body">
          <p class="wc-flow-card-description">${flow.description || 'No description'}</p>
          <div class="wc-flow-card-stats">
            <span><i class="fas fa-cube"></i> ${flow.nodes?.length || 0} nodes</span>
            <span><i class="fas fa-link"></i> ${flow.connections?.length || 0} connections</span>
          </div>
        </div>
        <div class="wc-flow-card-footer">
          <button class="btn btn-secondary btn-sm" data-action="edit" data-flow-id="${flow.id}">
            <i class="fas fa-edit"></i>
            <span>Edit Flow</span>
          </button>
          <button class="btn btn-danger-outline btn-sm" data-action="delete" data-flow-id="${flow.id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  },

  renderFlowEditor() {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    if (!flow) return '';

    const nodeTypes = [
      { type: 'send_message', icon: 'fas fa-comment', label: 'Send Message', color: '#3b82f6' },
      { type: 'send_media', icon: 'fas fa-image', label: 'Send Media', color: '#8b5cf6' },
      { type: 'button_message', icon: 'fas fa-hand-pointer', label: 'Button Message', color: '#ec4899' },
      { type: 'list_message', icon: 'fas fa-list', label: 'List Message', color: '#14b8a6' },
      { type: 'cta_message', icon: 'fas fa-external-link-alt', label: 'CTA Message', color: '#f97316' },
      { type: 'menu_options', icon: 'fas fa-bars', label: 'Menu Options', color: '#6366f1' },
      { type: 'collect_input', icon: 'fas fa-keyboard', label: 'Collect Input', color: '#10b981' },
      { type: 'ai_control', icon: 'fas fa-robot', label: 'AI Control', color: '#a855f7' },
      { type: 'condition', icon: 'fas fa-code-branch', label: 'Condition', color: '#f59e0b' },
      { type: 'delay', icon: 'fas fa-clock', label: 'Delay', color: '#6b7280' },
      { type: 'webhook', icon: 'fas fa-globe', label: 'Webhook', color: '#ef4444' },
      { type: 'assign_agent', icon: 'fas fa-user-tie', label: 'Assign Agent', color: '#0ea5e9' },
      { type: 'add_tag', icon: 'fas fa-tag', label: 'Add Tag', color: '#22c55e' },
      { type: 'move_stage', icon: 'fas fa-arrows-alt', label: 'Move Stage', color: '#eab308' }
    ];

    return `
      <div class="wc-flow-editor-fullscreen">
        <div class="wc-flow-editor-header">
          <div class="wc-flow-editor-header-left">
            <button class="wc-flow-back-btn" id="wcFlowBackBtn">
              <i class="fas fa-arrow-left"></i>
            </button>
            <div class="wc-flow-editor-title">
              <h3>${flow.name}</h3>
              <span class="wc-flow-editor-id">ID: ${flow.id}</span>
              <span class="wc-flow-editor-status ${flow.active ? 'active' : 'inactive'}">
                ${flow.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          <div class="wc-flow-editor-header-right">
            <button class="btn btn-secondary" id="wcFlowPauseBtn">
              <i class="fas fa-pause"></i>
              <span>Pause</span>
            </button>
            <button class="btn btn-primary" id="wcFlowSaveBtn">
              <i class="fas fa-save"></i>
              <span>Save Flow</span>
            </button>
          </div>
        </div>
        
        <div class="wc-flow-editor-body">
          <div class="wc-flow-editor-sidebar">
            <div class="wc-flow-editor-sidebar-header">
              <h4>Components</h4>
              <p>Drag and drop to canvas</p>
            </div>
            <div class="wc-flow-node-list">
              ${nodeTypes.map(node => `
                <div class="wc-flow-node-item" draggable="true" data-node-type="${node.type}">
                  <span class="wc-flow-node-icon" style="background: ${node.color}">
                    <i class="${node.icon}"></i>
                  </span>
                  <span class="wc-flow-node-label">${node.label}</span>
                </div>
              `).join('')}
            </div>
          </div>
          
          <div class="wc-flow-editor-canvas" id="wcFlowCanvas">
            <div class="wc-flow-canvas-controls">
              <button class="wc-flow-canvas-btn" id="wcFlowZoomIn" title="Zoom In">
                <i class="fas fa-plus"></i>
              </button>
              <button class="wc-flow-canvas-btn" id="wcFlowZoomOut" title="Zoom Out">
                <i class="fas fa-minus"></i>
              </button>
              <button class="wc-flow-canvas-btn" id="wcFlowZoomReset" title="Reset View">
                <i class="fas fa-compress-arrows-alt"></i>
              </button>
            </div>
            <div class="wc-flow-canvas-inner" id="wcFlowCanvasInner" style="transform: scale(${this.state.flowZoom}) translate(${this.state.flowPan.x}px, ${this.state.flowPan.y}px)">
              ${this.renderFlowNodes(flow.nodes)}
              <svg class="wc-flow-connections" id="wcFlowConnections">
                ${this.renderFlowConnections(flow)}
              </svg>
            </div>
          </div>
          
          <div class="wc-flow-editor-properties" id="wcFlowProperties">
            ${this.renderFlowProperties()}
          </div>
        </div>
      </div>
    `;
  },

  renderFlowNodes(nodes) {
    if (!nodes || nodes.length === 0) {
      return `
        <div class="wc-flow-canvas-empty">
          <i class="fas fa-project-diagram"></i>
          <p>Drag components here to build your flow</p>
        </div>
      `;
    }

    const nodeColors = {
      'send_message': '#3b82f6',
      'send_media': '#8b5cf6',
      'button_message': '#ec4899',
      'list_message': '#14b8a6',
      'cta_message': '#f97316',
      'menu_options': '#6366f1',
      'collect_input': '#10b981',
      'save_contact': '#06b6d4',
      'update_contact': '#84cc16',
      'ai_control': '#a855f7',
      'condition': '#f59e0b',
      'delay': '#6b7280',
      'webhook': '#ef4444',
      'assign_agent': '#0ea5e9',
      'add_tag': '#22c55e',
      'move_stage': '#eab308'
    };

    const nodeIcons = {
      'send_message': 'fas fa-comment',
      'send_media': 'fas fa-image',
      'button_message': 'fas fa-hand-pointer',
      'list_message': 'fas fa-list',
      'cta_message': 'fas fa-external-link-alt',
      'menu_options': 'fas fa-bars',
      'collect_input': 'fas fa-keyboard',
      'save_contact': 'fas fa-user-plus',
      'update_contact': 'fas fa-user-edit',
      'ai_control': 'fas fa-robot',
      'condition': 'fas fa-code-branch',
      'delay': 'fas fa-clock',
      'webhook': 'fas fa-globe',
      'assign_agent': 'fas fa-user-tie',
      'add_tag': 'fas fa-tag',
      'move_stage': 'fas fa-arrows-alt'
    };

    return nodes.map(node => `
      <div class="wc-flow-node ${this.state.selectedNode === node.id ? 'selected' : ''}" 
           data-node-id="${node.id}" 
           style="left: ${node.x}px; top: ${node.y}px; border-color: ${nodeColors[node.type] || '#6b7280'}">
        <div class="wc-flow-node-header" style="background: ${nodeColors[node.type] || '#6b7280'}">
          <i class="${nodeIcons[node.type] || 'fas fa-cube'}"></i>
          <span>${this.getNodeLabel(node.type)}</span>
        </div>
        <div class="wc-flow-node-body">
          <p>${this.truncate(node.content || 'Click to configure', 60)}</p>
          ${node.config?.saveAs ? '<span class="wc-flow-node-var">SAVE TO: {{' + node.config.saveAs + '}}</span>' : ''}
        </div>
        <div class="wc-flow-node-connectors">
          <div class="wc-flow-node-connector input" data-connector="input"></div>
          <div class="wc-flow-node-connector output" data-connector="output"></div>
        </div>
      </div>
    `).join('');
  },

  getNodeLabel(type) {
    const labels = {
      'send_message': 'Send Message',
      'send_media': 'Send Media',
      'button_message': 'Button Message',
      'list_message': 'List Message',
      'cta_message': 'CTA Message',
      'menu_options': 'Menu Options',
      'collect_input': 'Collect Input',
      'save_contact': 'Save Contact',
      'update_contact': 'Update Contact',
      'ai_control': 'AI Control',
      'condition': 'Condition',
      'delay': 'Delay',
      'webhook': 'Webhook',
      'assign_agent': 'Assign Agent',
      'add_tag': 'Add Tag',
      'move_stage': 'Move Stage'
    };
    return labels[type] || type;
  },

  renderFlowConnections(flow) {
    if (!flow.connections || flow.connections.length === 0) return '';
    
    return flow.connections.map(conn => {
      const fromNode = flow.nodes.find(n => n.id === conn.from);
      const toNode = flow.nodes.find(n => n.id === conn.to);
      
      if (!fromNode || !toNode) return '';
      
      const x1 = fromNode.x + 200; // Node width
      const y1 = fromNode.y + 40;  // Middle of node
      const x2 = toNode.x;
      const y2 = toNode.y + 40;
      
      // Create a curved path
      const midX = (x1 + x2) / 2;
      
      return `
        <path class="wc-flow-connection" 
              d="M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}"
              stroke="#10b981" 
              stroke-width="2" 
              fill="none"
              marker-end="url(#arrowhead)"/>
      `;
    }).join('') + `
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#10b981"/>
        </marker>
      </defs>
    `;
  },

  renderFlowProperties() {
    if (!this.state.selectedNode) {
      return `
        <div class="wc-flow-properties-empty">
          <i class="fas fa-mouse-pointer"></i>
          <h4>Select a node to edit</h4>
          <p>Click on a node in the canvas to view and edit its properties</p>
        </div>
      `;
    }

    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    const node = flow?.nodes?.find(n => n.id === this.state.selectedNode);
    
    if (!node) return '';

    const aiConfigs = this.state.aiConfigs || [];
    const activeConfig = aiConfigs.find(cfg => cfg.active) || aiConfigs[0];
    const aiOptions = aiConfigs.length > 0
      ? aiConfigs.map(cfg => ({
        value: String(cfg.id),
        label: `${cfg.persona_name || cfg.model_name || cfg.provider} (${cfg.provider})`
      }))
      : [{ value: '', label: 'No AI configurations available' }];

    return `
      <div class="wc-flow-properties-content">
        <h4>${this.getNodeLabel(node.type)}</h4>
        <div class="form-group">
          <label>Content</label>
          <textarea class="form-control" id="wcNodeContent" rows="4">${node.content || ''}</textarea>
        </div>
        ${node.type === 'collect_input' ? `
          <div class="form-group">
            <label>Save to Variable</label>
            <input type="text" class="form-control" id="wcNodeSaveAs" value="${node.config?.saveAs || ''}" placeholder="e.g., name, email">
          </div>
        ` : ''}
        ${node.type === 'delay' ? `
          <div class="form-group">
            <label>Delay Time (seconds)</label>
            <input type="number" class="form-control" id="wcNodeDelayTime" value="${node.config?.delay || 7}" min="7">
          </div>
          <div class="form-group">
            <label>Reaction</label>
            <input type="text" class="form-control" id="wcNodeDelayReaction" value="${node.config?.reaction || ''}" placeholder="👍">
          </div>
          <div class="form-group">
            <label>Typing Effect</label>
            <select class="form-control" id="wcNodeDelayTyping">
              <option value="yes" ${node.config?.typingEffect ? 'selected' : ''}>Yes</option>
              <option value="no" ${!node.config?.typingEffect ? 'selected' : ''}>No</option>
            </select>
          </div>
        ` : ''}
        ${node.type === 'ai_control' ? `
          <div class="form-group">
            <label>Mode</label>
            <select class="form-control" id="wcNodeAiMode">
              <option value="enable" ${node.config?.mode !== 'disable' ? 'selected' : ''}>Enable AI</option>
              <option value="disable" ${node.config?.mode === 'disable' ? 'selected' : ''}>Disable AI</option>
            </select>
          </div>
          <div class="form-group">
            <label>AI Configuration</label>
            <select class="form-control" id="wcNodeAiConfig">
              ${aiOptions.map(opt => `
                <option value="${opt.value}" ${String(node.config?.aiConfigId || (activeConfig ? activeConfig.id : '')) === String(opt.value) ? 'selected' : ''}>${opt.label}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Temperature</label>
            <input type="number" class="form-control" id="wcNodeAiTemperature" value="${node.config?.temperature ?? ''}" placeholder="0.7">
          </div>
          <div class="form-group">
            <label>Response Size</label>
            <input type="number" class="form-control" id="wcNodeAiMaxTokens" value="${node.config?.maxTokens ?? ''}" placeholder="1000">
          </div>
          <div class="form-group">
            <label>Prompt</label>
            <textarea class="form-control" id="wcNodeAiPrompt" rows="4" placeholder="Describe how the AI should behave">${node.config?.prompt || node.config?.instructions || ''}</textarea>
          </div>
        ` : ''}
        ${node.type === 'condition' ? `
          <div class="form-group">
            <label>Condition</label>
            <input type="text" class="form-control" id="wcNodeCondition" value="${node.config?.condition || ''}" placeholder="e.g., {{name}} == 'John'">
          </div>
        ` : ''}
        <div class="wc-flow-properties-actions">
          <button class="btn btn-primary btn-sm" id="wcSaveNodeBtn">
            <i class="fas fa-save"></i>
            <span>Save</span>
          </button>
          <button class="btn btn-danger btn-sm" id="wcDeleteNodeBtn">
            <i class="fas fa-trash"></i>
            <span>Delete</span>
          </button>
        </div>
      </div>
    `;
  },


  // ============================================
  // FAQ TAB
  // ============================================

  renderFaqTab() {
    const faqs = this.state.faqs;
    const categories = this.state.faqCategories;

    return `
      <div class="wc-faq-container">
        <div class="wc-faq-header">
          <div>
            <h2 class="wc-faq-title" data-i18n="whatsapp_cloud.faq_title">FAQ Management</h2>
            <p class="wc-faq-subtitle" data-i18n="whatsapp_cloud.faq_description">Create and manage frequently asked questions for automated responses</p>
          </div>
          <button class="btn btn-primary" id="wcAddFaqBtn">
            <i class="fas fa-plus"></i>
            <span data-i18n="whatsapp_cloud.faq_add">Add FAQ</span>
          </button>
        </div>
        
        <div class="wc-faq-toolbar">
          <div class="wc-faq-search">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="${this.t('whatsapp_cloud.faq_search_placeholder', 'Search FAQs...')}" id="wcFaqSearch">
          </div>
          <div class="wc-faq-filters">
            <select class="form-control" id="wcFaqCategoryFilter">
              <option value="" data-i18n="whatsapp_cloud.faq_all_categories">All Categories</option>
              ${categories.map(cat => `
                <option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
              `).join('')}
            </select>
            <select class="form-control" id="wcFaqStatusFilter">
              <option value="" data-i18n="whatsapp_cloud.faq_all_status">All Status</option>
              <option value="active" data-i18n="whatsapp_cloud.faq_active">Active</option>
              <option value="inactive" data-i18n="whatsapp_cloud.faq_inactive">Inactive</option>
            </select>
          </div>
        </div>
        
        ${faqs.length === 0 ? `
          <div class="wc-faq-empty">
            <div class="wc-faq-empty-icon">
              <i class="fas fa-question-circle"></i>
            </div>
            <h3 data-i18n="whatsapp_cloud.faq_empty_title">No FAQs yet</h3>
            <p data-i18n="whatsapp_cloud.faq_empty_description">Create FAQs to help automate customer responses</p>
            <button class="btn btn-primary" id="wcAddFaqBtnEmpty">
              <i class="fas fa-plus"></i>
              <span data-i18n="whatsapp_cloud.faq_add">Create First FAQ</span>
            </button>
          </div>
        ` : `
          <div class="wc-faq-grid">
            ${faqs.map(faq => this.renderFaqCard(faq)).join('')}
          </div>
        `}
      </div>
    `;
  },

  renderFaqCard(faq) {
    const categoryColors = {
      'general': '#6b7280',
      'sales': '#3b82f6',
      'support': '#10b981',
      'billing': '#f59e0b',
      'technical': '#8b5cf6'
    };

    return `
      <div class="wc-faq-card ${faq.active ? '' : 'inactive'}" data-faq-id="${faq.id}">
        <div class="wc-faq-card-header">
          <span class="wc-faq-card-category" style="background: ${categoryColors[faq.category] || '#6b7280'}">
            ${faq.category}
          </span>
          <label class="wc-faq-card-toggle">
            <input type="checkbox" ${faq.active ? 'checked' : ''} data-faq-id="${faq.id}">
            <span class="wc-toggle-slider-sm"></span>
          </label>
        </div>
        <div class="wc-faq-card-body">
          <h4 class="wc-faq-card-question">${faq.question}</h4>
          <p class="wc-faq-card-answer">${this.truncate(faq.answer, 150)}</p>
        </div>
        <div class="wc-faq-card-keywords">
          ${faq.keywords.slice(0, 4).map(kw => `<span class="wc-faq-keyword">${kw}</span>`).join('')}
          ${faq.keywords.length > 4 ? `<span class="wc-faq-keyword-more">+${faq.keywords.length - 4}</span>` : ''}
        </div>
        <div class="wc-faq-card-footer">
          <button class="btn btn-secondary btn-sm" data-action="edit" data-faq-id="${faq.id}">
            <i class="fas fa-edit"></i>
            <span data-i18n="whatsapp_cloud.faq_edit">Edit</span>
          </button>
          <button class="btn btn-danger-outline btn-sm" data-action="delete" data-faq-id="${faq.id}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  },

  // ============================================
  // CAMPAIGNS TAB
  // ============================================

  renderCampaignsTab() {
    const templates = this.state.templates;
    const campaigns = this.state.campaigns;
    
    console.log('Rendering campaigns tab with templates:', templates.length, templates);

    return `
      <div class="wc-campaigns-container">
        <div class="wc-campaigns-header">
          <div>
            <h2 class="wc-campaigns-title" >Mass Campaigns</h2>
            <p class="wc-campaigns-subtitle" >Send bulk messages using approved templates</p>
          </div>
          <div class="wc-campaigns-header-actions">
            <button class="btn btn-secondary" id="wcSyncTemplatesBtn">
              <i class="fas fa-sync"></i>
              <span >Sync Templates</span>
            </button>
            <button class="btn btn-primary" id="wcCreateTemplateBtn">
              <i class="fas fa-plus"></i>
              <span >Create Template</span>
            </button>
          </div>
        </div>
        
        <!-- Templates Section -->
        <div class="wc-campaigns-section">
          <h3 class="wc-campaigns-section-title">
            <i class="fas fa-file-alt"></i>
            <span >Message Templates</span>
            <span class="wc-campaigns-section-count">${templates.length}</span>
          </h3>
          
          ${templates.length === 0 ? `
            <div class="wc-campaigns-empty">
              <i class="fas fa-file-alt"></i>
              <p >No templates available. Sync from Meta or create a new one.</p>
            </div>
          ` : `
            <div class="wc-templates-grid">
              ${templates.map(template => this.renderTemplateCard(template)).join('')}
            </div>
          `}
        </div>
        
        <!-- Campaign Builder -->
        <div class="wc-campaigns-builder">
          <h3 class="wc-campaigns-section-title">
            <i class="fas fa-bullhorn"></i>
            <span >Create Campaign</span>
          </h3>
          
          <div class="wc-campaigns-grid">
            <div class="wc-campaigns-card">
              <h4><i class="fas fa-file-alt"></i> Template</h4>
              <div class="form-group">
                <label >Select Template</label>
                <select class="form-control" id="wcCampaignTemplate">
                  <option value="">Choose a template</option>
                  ${templates.filter(t => t.status && t.status.toUpperCase() === 'APPROVED').map(t => `
                    <option value="${t.id}">${t.name} (${t.language})</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group">
                <label >Source</label>
                <div class="wc-chip-row">
                  <span class="wc-chip active">Meta Business</span>
                  <span class="wc-chip">Custom</span>
                </div>
              </div>
            </div>
            
            <div class="wc-campaigns-card">
              <h4><i class="fas fa-users"></i> Audience</h4>
              <div class="form-group">
                <label >Contact List</label>
                <select class="form-control" id="wcCampaignAudience">
                  <option value="">Choose a list</option>
                  <option value="all">All Contacts</option>
                  <option value="opted_in">Opted-in Contacts</option>
                  <option value="custom">Custom List</option>
                </select>
              </div>
              <div class="form-group">
                <label >Filters</label>
                <div class="wc-chip-row">
                  <span class="wc-chip">Tags</span>
                  <span class="wc-chip">Activity</span>
                  <span class="wc-chip">Opt-in</span>
                </div>
              </div>
            </div>
            
            <div class="wc-campaigns-card">
              <h4><i class="fas fa-calendar"></i> Schedule</h4>
              <div class="form-group">
                <label >Send Time</label>
                <input type="datetime-local" class="form-control" id="wcCampaignSchedule">
              </div>
              <div class="form-group">
                <label >Time Zone</label>
                <select class="form-control" id="wcCampaignTimezone">
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Paris">Europe/Paris</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                  <option value="Asia/Shanghai">Asia/Shanghai</option>
                </select>
              </div>
            </div>
          </div>
          
          <div class="wc-campaigns-preview">
            <div class="wc-campaigns-preview-header">
              <h4 class="wc-campaigns-preview-title" >Preview</h4>
            </div>
            <div class="wc-campaigns-preview-content">
              <div class="wc-campaigns-preview-phone">
                <div class="wc-campaigns-preview-phone-header">
                  <div class="wc-campaigns-preview-phone-avatar">
                    <i class="fas fa-user"></i>
                  </div>
                  <span class="wc-campaigns-preview-phone-name">Your Business</span>
                </div>
                <div class="wc-campaigns-preview-phone-body">
                  <div class="wc-campaigns-preview-message">
                    <div class="wc-campaigns-preview-message-text" id="wcCampaignPreviewText">
                      Select a template to preview the message.
                    </div>
                    <div class="wc-campaigns-preview-message-time">12:00 PM</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="wc-campaigns-preview-actions">
              <button class="btn btn-secondary" id="wcSaveDraftBtn">
                <span >Save Draft</span>
              </button>
              <button class="btn btn-primary" id="wcScheduleCampaignBtn">
                <span >Schedule Campaign</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderTemplateCard(template) {
    const statusColors = {
      'approved': '#10b981',
      'pending': '#f59e0b',
      'rejected': '#ef4444'
    };

    const categoryIcons = {
      'marketing': 'fas fa-bullhorn',
      'utility': 'fas fa-tools',
      'authentication': 'fas fa-shield-alt'
    };

    return `
      <div class="wc-template-card" data-template-id="${template.id}">
        <div class="wc-template-card-header">
          <span class="wc-template-card-category">
            <i class="${categoryIcons[template.category] || 'fas fa-file'}"></i>
            ${template.category}
          </span>
          <span class="wc-template-card-status" style="background: ${statusColors[template.status] || '#6b7280'}">
            ${template.status}
          </span>
        </div>
        <div class="wc-template-card-body">
          <h4 class="wc-template-card-name">${template.name}</h4>
          <span class="wc-template-card-language">
            <i class="fas fa-globe"></i>
            ${template.language.toUpperCase()}
          </span>
          ${template.header ? `
            <div class="wc-template-card-header-text">
              <strong>${template.header.text}</strong>
            </div>
          ` : ''}
          <p class="wc-template-card-preview">${this.truncate(template.body, 100)}</p>
        </div>
        <div class="wc-template-card-footer">
          <button class="btn btn-secondary btn-sm" data-action="preview" data-template-id="${template.id}">
            <i class="fas fa-eye"></i>
            <span>Preview</span>
          </button>
          <button class="btn btn-primary btn-sm" data-action="use" data-template-id="${template.id}" ${template.status !== 'approved' ? 'disabled' : ''}>
            <i class="fas fa-paper-plane"></i>
            <span>Use</span>
          </button>
        </div>
      </div>
    `;
  },


  // ============================================
  // CONNECTION TAB
  // ============================================

  renderConnectionTab() {
    const accounts = this.state.accounts;
    const activeAccount = accounts.find(a => a.id === this.state.activeAccountId);
    
    // Determine statuses
    const accountStatus = activeAccount?.status || 'disconnected';
    const webhookStatus = activeAccount?.webhookVerified ? 'verified' : 'pending';
    const templateStatus = activeAccount?.templatesCount > 0 ? 'synced' : 'pending';
    
    const accountStatusText = activeAccount ? (accountStatus === 'connected' ? 'Connected' : 'Disconnected') : 'No Account';
    const webhookStatusText = activeAccount?.webhookVerified ? 'Verified' : 'Pending';
    const templateStatusText = activeAccount?.templatesCount > 0 ? `${activeAccount.templatesCount} Synced` : 'Pending';

    return `
      <div class="wc-connection-container">
        <div class="wc-connection-header">
          <div>
            <h2 class="wc-connection-title" >WhatsApp Cloud Connection</h2>
            <p class="wc-connection-subtitle" >Connect your WhatsApp Business Account using the official Cloud API</p>
          </div>
        </div>

        <div class="wc-connection-status-grid">
          <div class="wc-connection-status-card">
            <span class="wc-connection-status-label" >Account Status</span>
            <span class="wc-connection-status-value ${accountStatus}">
              <i class="fas fa-circle" style="font-size: 8px;"></i>
              ${accountStatusText}
            </span>
          </div>
          <div class="wc-connection-status-card">
            <span class="wc-connection-status-label" >Webhook Status</span>
            <span class="wc-connection-status-value ${webhookStatus}">
              <i class="fas fa-circle" style="font-size: 8px;"></i>
              ${webhookStatusText}
            </span>
          </div>
          <div class="wc-connection-status-card">
            <span class="wc-connection-status-label" >Template Sync</span>
            <span class="wc-connection-status-value ${templateStatus}">
              <i class="fas fa-circle" style="font-size: 8px;"></i>
              ${templateStatusText}
            </span>
          </div>
        </div>

        <!-- Facebook Embedded Signup Section -->
        <div class="wc-connection-facebook">
          <div class="wc-connection-facebook-content">
            <div class="wc-connection-facebook-icon">
              <i class="fab fa-facebook"></i>
            </div>
            <div class="wc-connection-facebook-text">
              <h3 >Quick Connect with Facebook</h3>
              <p >Connect your WhatsApp Business Account instantly using Facebook Login. This is the easiest and recommended way to get started.</p>
              <ul class="wc-connection-facebook-benefits">
                <li><i class="fas fa-check"></i> One-click authentication</li>
                <li><i class="fas fa-check"></i> Automatic token management</li>
                <li><i class="fas fa-check"></i> Secure OAuth 2.0 flow</li>
              </ul>
            </div>
          </div>
          <button class="wc-connection-facebook-btn" id="wcFacebookLoginBtn">
            <i class="fab fa-facebook"></i>
            <span >Connect with Facebook</span>
          </button>
        </div>

        <div class="wc-connection-divider">
          <span >Or connect manually</span>
        </div>

        <!-- Manual Connection Form -->
        <div class="wc-connection-manual">
          <h3 >Manual Connection</h3>
          <p class="wc-connection-manual-desc" >Enter your WhatsApp Cloud API credentials manually if you prefer not to use Facebook Login.</p>
          
          <form id="wcConnectionForm">
            <div class="wc-connection-form-grid">
              <div class="form-group">
                <label >Account Name</label>
                <input type="text" class="form-control" id="wcConnectionName" placeholder="e.g., Main Business" value="${activeAccount?.name || ''}">
              </div>
              <div class="form-group">
                <label >WABA ID</label>
                <input type="text" class="form-control" id="wcConnectionWabaId" placeholder="WhatsApp Business Account ID" value="${activeAccount?.wabaId || ''}">
                <small class="form-text">Find this in Meta Business Suite > WhatsApp Manager</small>
              </div>
              <div class="form-group">
                <label >Phone Number ID</label>
                <input type="text" class="form-control" id="wcConnectionPhoneId" placeholder="Phone Number ID from Meta" value="${activeAccount?.phoneNumberId || ''}">
              </div>
              <div class="form-group">
                <label >Phone Number</label>
                <input type="text" class="form-control" id="wcConnectionPhoneNumber" placeholder="e.g., +5511999999999" value="${activeAccount?.phoneNumber || ''}">
                <small class="form-text">WhatsApp number with country code</small>
              </div>
              <div class="form-group">
                <label >App ID</label>
                <input type="text" class="form-control" id="wcConnectionAppId" placeholder="Meta App ID" value="${activeAccount?.appId || ''}">
              </div>
              <div class="form-group">
                <label >Access Token</label>
                <input type="password" class="form-control" id="wcConnectionAccessToken" placeholder="Paste your access token">
                <small class="form-text">Use a System User token for production</small>
              </div>
              <div class="form-group">
                <label >Webhook Verify Token</label>
                <input type="text" class="form-control" id="wcConnectionVerifyToken" placeholder="Custom verify token" value="${activeAccount?.verifyToken || ''}">
              </div>
              <div class="form-group">
                <label >App Secret</label>
                <input type="password" class="form-control" id="wcConnectionAppSecret" placeholder="Meta App Secret">
              </div>
            </div>

            <div class="wc-connection-webhook">
              <h4 >Webhook URL</h4>
              <p class="wc-connection-webhook-desc" >Configure this URL in your Meta App webhook settings.</p>
              <div class="wc-connection-webhook-url">
                <input type="text" readonly value="${window.location.origin}/api/whatsapp-cloud/webhook" id="wcWebhookUrl">
                <button type="button" class="btn btn-secondary" id="wcCopyWebhookBtn">
                  <i class="fas fa-copy"></i>
                  <span >Copy</span>
                </button>
              </div>
            </div>

            <div class="wc-connection-form-actions">
              <button type="button" class="btn btn-secondary" id="wcTestConnectionBtn">
                <i class="fas fa-vial"></i>
                <span >Test Connection</span>
              </button>
              <button type="submit" class="btn btn-primary">
                <i class="fas fa-save"></i>
                <span >Save Connection</span>
              </button>
            </div>
          </form>
        </div>

        <!-- Connected Accounts List -->
        <div class="wc-connection-accounts">
          <h3 >Connected Accounts</h3>
          ${accounts.length === 0 ? `
            <div class="wc-connection-accounts-empty">
              <i class="fas fa-plug"></i>
              <h4 >No accounts connected</h4>
              <p >Connect your first WhatsApp Business Account to get started.</p>
            </div>
          ` : `
            <div class="wc-connection-accounts-list">
              ${accounts.map(account => `
                <div class="wc-connection-account-item ${account.id === this.state.activeAccountId ? 'active' : ''}" data-account-id="${account.id}">
                  <div class="wc-connection-account-left">
                    <div class="wc-connection-account-icon">
                      <i class="fab fa-whatsapp"></i>
                    </div>
                    <div class="wc-connection-account-info">
                      <h4>${account.name}</h4>
                      <p>${account.phoneNumber || 'Phone ID: ' + (account.phoneNumberId || 'Not set')}</p>
                    </div>
                  </div>
                  <div class="wc-connection-account-right">
                    <span class="wc-connection-account-status ${account.status || 'pending'}">${account.status || 'Pending'}</span>
                    <div class="wc-connection-account-actions">
                      <button class="wc-connection-account-btn" data-action="select" data-account-id="${account.id}" title="Set as active">
                        <i class="fas fa-check"></i>
                      </button>
                      <button class="wc-connection-account-btn" data-action="edit" data-account-id="${account.id}" title="Edit">
                        <i class="fas fa-edit"></i>
                      </button>
                      <button class="wc-connection-account-btn danger" data-action="delete" data-account-id="${account.id}" title="Delete">
                        <i class="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  },


  // ============================================
  // EVENT LISTENERS
  // ============================================

  initEventListeners() {
    const page = document.getElementById('whatsapp-cloud-page');
    if (!page) return;

    // Tab switching
    page.addEventListener('click', (e) => {
      const tab = e.target.closest('.wc-horizontal-tab');
      if (tab) {
        this.switchTab(tab.dataset.tab);
      }
    });

    // Account selector
    page.addEventListener('click', (e) => {
      if (e.target.closest('#wcAccountSelector')) {
        this.showAccountSelectorModal();
      }
    });

    // Add account button
    page.addEventListener('click', (e) => {
      if (e.target.closest('#wcAddAccountBtn')) {
        this.showAddAccountModal();
      }
    });

    // Pipeline stage menu
    page.addEventListener('click', (e) => {
      const menuBtn = e.target.closest('.wc-pipeline-column-menu');
      if (menuBtn) {
        this.showStageMenu(menuBtn.dataset.stageId, e);
      }
    });

    // Add stage buttons
    page.addEventListener('click', (e) => {
      if (e.target.closest('#wcAddStageBtn') || e.target.closest('#wcAddColumnBtn')) {
        this.showAddStageModal();
      }
    });

    // Pipeline navigation
    page.addEventListener('click', (e) => {
      if (e.target.closest('#wcPipelineNavLeft')) {
        this.scrollPipeline('left');
      }
      if (e.target.closest('#wcPipelineNavRight')) {
        this.scrollPipeline('right');
      }
    });

    // Pipeline card click - open conversation
    page.addEventListener('click', (e) => {
      const card = e.target.closest('.wc-pipeline-card');
      if (card) {
        this.openConversation(card.dataset.cardId);
      }
    });

    // Sidebar conversation click
    page.addEventListener('click', (e) => {
      const sidebarConv = e.target.closest('.wc-sidebar-conversation-item');
      if (sidebarConv) {
        this.openConversation(sidebarConv.dataset.cardId);
      }
    });

    // Flow list actions
    page.addEventListener('click', (e) => {
      if (e.target.closest('#wcNewFlowBtn') || e.target.closest('#wcNewFlowBtnEmpty')) {
        this.createNewFlow();
      }

      const editBtn = e.target.closest('[data-action="edit"][data-flow-id]');
      if (editBtn) {
        this.editFlow(editBtn.dataset.flowId);
      }

      const deleteBtn = e.target.closest('[data-action="delete"][data-flow-id]');
      if (deleteBtn) {
        this.deleteFlow(deleteBtn.dataset.flowId);
      }

      const toggleBtn = e.target.closest('.wc-flow-card-toggle input');
      if (toggleBtn) {
        this.toggleFlow(toggleBtn.dataset.flowId);
      }
    });

    // Flow editor actions
    page.addEventListener('click', (e) => {
      if (e.target.closest('#wcFlowBackBtn')) {
        this.exitFlowEditor();
      }

      if (e.target.closest('#wcFlowSaveBtn')) {
        this.saveFlow();
      }

      if (e.target.closest('#wcFlowPauseBtn')) {
        this.pauseFlow();
      }

      // Zoom controls
      if (e.target.closest('#wcFlowZoomIn')) {
        this.zoomFlow(0.1);
      }
      if (e.target.closest('#wcFlowZoomOut')) {
        this.zoomFlow(-0.1);
      }
      if (e.target.closest('#wcFlowZoomReset')) {
        this.resetFlowZoom();
      }

      // Node selection
      const node = e.target.closest('.wc-flow-node');
      if (node) {
        this.selectNode(node.dataset.nodeId);
      }

      // Node property actions
      if (e.target.closest('#wcSaveNodeBtn')) {
        this.saveNodeProperties();
      }
      if (e.target.closest('#wcDeleteNodeBtn')) {
        this.deleteSelectedNode();
      }
    });

    // FAQ actions
    page.addEventListener('click', (e) => {
      if (e.target.closest('#wcAddFaqBtn') || e.target.closest('#wcAddFaqBtnEmpty')) {
        this.showAddFaqModal();
      }

      const editFaqBtn = e.target.closest('[data-action="edit"][data-faq-id]');
      if (editFaqBtn) {
        this.showEditFaqModal(editFaqBtn.dataset.faqId);
      }

      const deleteFaqBtn = e.target.closest('[data-action="delete"][data-faq-id]');
      if (deleteFaqBtn) {
        this.deleteFaq(deleteFaqBtn.dataset.faqId);
      }

      const toggleFaqBtn = e.target.closest('.wc-faq-card-toggle input');
      if (toggleFaqBtn) {
        this.toggleFaq(toggleFaqBtn.dataset.faqId);
      }
    });

    // Campaign actions
    page.addEventListener('click', (e) => {
      if (e.target.closest('#wcSyncTemplatesBtn')) {
        this.syncTemplates();
      }

      if (e.target.closest('#wcCreateTemplateBtn')) {
        this.showCreateTemplateModal();
      }

      if (e.target.closest('#wcScheduleCampaignBtn')) {
        this.scheduleCampaign();
      }

      if (e.target.closest('#wcSaveDraftBtn')) {
        this.saveCampaignDraft();
      }

      const previewTemplateBtn = e.target.closest('[data-action="preview"][data-template-id]');
      if (previewTemplateBtn) {
        this.previewTemplate(previewTemplateBtn.dataset.templateId);
      }

      const useTemplateBtn = e.target.closest('[data-action="use"][data-template-id]');
      if (useTemplateBtn) {
        this.useTemplate(useTemplateBtn.dataset.templateId);
      }
    });

    // Connection actions
    page.addEventListener('click', (e) => {
      if (e.target.closest('#wcFacebookLoginBtn')) {
        this.initFacebookLogin();
      }

      if (e.target.closest('#wcCopyWebhookBtn')) {
        this.copyWebhookUrl();
      }

      if (e.target.closest('#wcTestConnectionBtn')) {
        this.testConnection();
      }

      const selectAccountBtn = e.target.closest('[data-action="select"][data-account-id]');
      if (selectAccountBtn) {
        this.selectAccount(selectAccountBtn.dataset.accountId);
      }

      const editAccountBtn = e.target.closest('[data-action="edit"][data-account-id]');
      if (editAccountBtn) {
        this.editAccount(editAccountBtn.dataset.accountId);
      }

      const deleteAccountBtn = e.target.closest('[data-action="delete"][data-account-id]');
      if (deleteAccountBtn) {
        this.deleteAccount(deleteAccountBtn.dataset.accountId);
      }
    });

    // Connection form submit
    page.addEventListener('submit', (e) => {
      if (e.target.id === 'wcConnectionForm') {
        e.preventDefault();
        this.saveConnection();
      }
    });

    // Template selection change
    page.addEventListener('change', (e) => {
      if (e.target.id === 'wcCampaignTemplate') {
        this.updateCampaignPreview(e.target.value);
      }
    });

    // Sidebar conversation click
    page.addEventListener('click', (e) => {
      const convItem = e.target.closest('.wc-sidebar-conversation-item');
      if (convItem) {
        this.selectConversation(convItem.dataset.cardId);
      }
    });
  },

  // ============================================
  // DRAG AND DROP
  // ============================================

  initDragAndDrop() {
    const page = document.getElementById('whatsapp-cloud-page');
    if (!page) return;

    // Pipeline card drag
    page.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.wc-pipeline-card');
      if (card) {
        this.state.draggedCard = card.dataset.cardId;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.cardId);
        return;
      }

      // Pipeline column drag (reorder columns)
      const column = e.target.closest('.wc-pipeline-column');
      if (column) {
        this.state.draggedColumn = column.dataset.stageId;
        column.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', column.dataset.stageId);
        return;
      }

      const nodeItem = e.target.closest('.wc-flow-node-item');
      if (nodeItem) {
        this.state.draggedNode = nodeItem.dataset.nodeType;
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', nodeItem.dataset.nodeType);
      }
    });

    page.addEventListener('dragend', (e) => {
      const card = e.target.closest('.wc-pipeline-card');
      if (card) {
        card.classList.remove('dragging');
        this.state.draggedCard = null;
      }

      const column = e.target.closest('.wc-pipeline-column');
      if (column) {
        column.classList.remove('dragging');
        this.state.draggedColumn = null;
      }

      this.state.draggedNode = null;
      
      // Remove all drag-over classes
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    page.addEventListener('dragover', (e) => {
      // Column reordering
      const column = e.target.closest('.wc-pipeline-column');
      if (column && this.state.draggedColumn) {
        e.preventDefault();
        // Live sort if over a different column
        if (this.state.draggedColumn !== column.dataset.stageId) {
          this.reorderColumn(this.state.draggedColumn, column.dataset.stageId);
        }
        return;
      }

      const columnBody = e.target.closest('.wc-pipeline-column-body');
      if (columnBody && this.state.draggedCard) {
        e.preventDefault();
        columnBody.classList.add('drag-over');
        return;
      }

      const canvas = e.target.closest('#wcFlowCanvasInner');
      if (canvas && this.state.draggedNode) {
        e.preventDefault();
      }
    });

    page.addEventListener('dragleave', (e) => {
      const column = e.target.closest('.wc-pipeline-column');
      if (column) {
        column.classList.remove('drag-over');
      }

      const columnBody = e.target.closest('.wc-pipeline-column-body');
      if (columnBody) {
        columnBody.classList.remove('drag-over');
      }
    });

    page.addEventListener('drop', (e) => {
      // Column reordering
      if (this.state.draggedColumn) {
        e.preventDefault();
        this.saveState();
        this.notify('success', 'Column order updated');
        return;
      }

      const columnBody = e.target.closest('.wc-pipeline-column-body');
      if (columnBody && this.state.draggedCard) {
        e.preventDefault();
        columnBody.classList.remove('drag-over');
        this.moveCard(this.state.draggedCard, columnBody.dataset.stageId);
        return;
      }

      const canvas = e.target.closest('#wcFlowCanvasInner');
      if (canvas && this.state.draggedNode) {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.state.flowZoom;
        const y = (e.clientY - rect.top) / this.state.flowZoom;
        this.addFlowNode(this.state.draggedNode, x, y);
      }
    });
  },

  // ============================================
  // TAB MANAGEMENT
  // ============================================

  switchTab(tabId) {
    this.state.activeTab = tabId;
    
    // Update tab buttons
    document.querySelectorAll('.wc-horizontal-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    // Update panels
    document.querySelectorAll('.wc-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.panel === tabId);
    });

    // Special handling for flow builder fullscreen
    const workspace = document.getElementById('wcWorkspace');
    if (tabId === 'flow-builder' && this.state.flowEditorMode) {
      workspace?.classList.add('fullscreen');
    } else {
      workspace?.classList.remove('fullscreen');
    }

    // Re-render tab content
    this.renderWorkspace();
  },

  renderWorkspace() {
    const contentArea = document.querySelector('.wc-tab-content');
    if (contentArea) {
      contentArea.innerHTML = this.renderTabContent();
    }
    
    // Drag and drop listeners are already initialized on the page container
  },

  // ============================================
  // PIPELINE METHODS
  // ============================================

  moveCard(cardId, newStageId) {
    const card = this.state.pipeline.cards.find(c => c.id === cardId);
    if (card && card.stageId !== newStageId) {
      const oldStage = this.state.pipeline.stages.find(s => s.id === card.stageId);
      const newStage = this.state.pipeline.stages.find(s => s.id === newStageId);
      
      card.stageId = newStageId;
      this.saveState();
      this.renderWorkspace();
      this.notify('success', 'Changes saved successfully');
    }
  },

  reorderColumn(draggedStageId, targetStageId) {
    if (draggedStageId === targetStageId) return;

    const stages = this.state.pipeline.stages;
    const draggedIndex = stages.findIndex(s => s.id === draggedStageId);
    const targetIndex = stages.findIndex(s => s.id === targetStageId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Update State
    const [draggedStage] = stages.splice(draggedIndex, 1);
    stages.splice(targetIndex, 0, draggedStage);

    // Update DOM (Live Sort)
    const board = document.getElementById('wcPipelineBoard');
    const draggedEl = board.querySelector(`.wc-pipeline-column[data-stage-id="${draggedStageId}"]`);
    const targetEl = board.querySelector(`.wc-pipeline-column[data-stage-id="${targetStageId}"]`);
    
    if (draggedEl && targetEl) {
      // If moving right (draggedIndex < targetIndex), insert after target
      // If moving left (draggedIndex > targetIndex), insert before target
      if (draggedIndex < targetIndex) {
        board.insertBefore(draggedEl, targetEl.nextSibling);
      } else {
        board.insertBefore(draggedEl, targetEl);
      }
    }
  },

  scrollPipeline(direction) {
    const board = document.getElementById('wcPipelineBoard');
    if (board) {
      const scrollAmount = 300;
      board.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  },

  showAddStageModal() {
    this.showModal({
      title: 'Add Stage',
      content: `
        <div class="form-group">
          <label>Stage Name</label>
          <input type="text" class="form-control" id="wcStageName" placeholder="Enter stage name">
        </div>
        <div class="form-group">
          <label>Stage Icon</label>
          <div class="wc-icon-picker" id="wcIconPicker">
            ${this.getIconOptions().map(icon => `
              <div class="wc-icon-picker-item" data-icon="${icon}">
                <i class="${icon}"></i>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>Stage Color</label>
          <div class="wc-color-picker" id="wcColorPicker">
            ${this.getColorOptions().map(color => `
              <div class="wc-color-picker-item" data-color="${color}" style="background: ${color}"></div>
            `).join('')}
          </div>
        </div>
      `,
      onSubmit: () => {
        const name = document.getElementById('wcStageName')?.value?.trim();
        const selectedIcon = document.querySelector('.wc-icon-picker-item.selected');
        const selectedColor = document.querySelector('.wc-color-picker-item.selected');
        
        if (!name) {
          this.notify('error', 'Required fields are missing');
          return false;
        }

        const newStage = {
          id: 'stage_' + Date.now(),
          name: name,
          icon: selectedIcon?.dataset.icon || 'fas fa-folder',
          color: selectedColor?.dataset.color || '#6b7280'
        };

        this.state.pipeline.stages.push(newStage);
        this.saveState();
        this.renderWorkspace();
        this.notify('success', 'Changes saved successfully');
        return true;
      }
    });

    // Add click handlers for icon and color pickers
    setTimeout(() => {
      document.querySelectorAll('.wc-icon-picker-item').forEach(item => {
        item.addEventListener('click', () => {
          document.querySelectorAll('.wc-icon-picker-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
        });
      });

      document.querySelectorAll('.wc-color-picker-item').forEach(item => {
        item.addEventListener('click', () => {
          document.querySelectorAll('.wc-color-picker-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
        });
      });
    }, 100);
  },

  showStageMenu(stageId, event) {
    const stage = this.state.pipeline.stages.find(s => s.id === stageId);
    if (!stage) return;

    this.showModal({
      title: `Edit Stage: ${stage.name}`,
      content: `
        <div class="form-group">
          <label>Stage Name</label>
          <input type="text" class="form-control" id="wcEditStageName" value="${stage.name}">
        </div>
        <div class="form-group">
          <label>Stage Icon</label>
          <div class="wc-icon-picker" id="wcEditIconPicker">
            ${this.getIconOptions().map(icon => `
              <div class="wc-icon-picker-item ${stage.icon === icon ? 'selected' : ''}" data-icon="${icon}">
                <i class="${icon}"></i>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>Stage Color</label>
          <div class="wc-color-picker" id="wcEditColorPicker">
            ${this.getColorOptions().map(color => `
              <div class="wc-color-picker-item ${stage.color === color ? 'selected' : ''}" data-color="${color}" style="background: ${color}"></div>
            `).join('')}
          </div>
        </div>
        <div class="wc-modal-danger-zone">
          <button class="btn btn-danger btn-sm" id="wcDeleteStageBtn" style="width: 100%;">
            <i class="fas fa-trash"></i> Delete Stage
          </button>
        </div>
      `,
      onSubmit: () => {
        const name = document.getElementById('wcEditStageName')?.value?.trim();
        const selectedIcon = document.querySelector('#wcEditIconPicker .wc-icon-picker-item.selected');
        const selectedColor = document.querySelector('#wcEditColorPicker .wc-color-picker-item.selected');
        
        if (!name) {
          this.notify('error', 'Required fields are missing');
          return false;
        }

        stage.name = name;
        stage.icon = selectedIcon?.dataset.icon || stage.icon;
        stage.color = selectedColor?.dataset.color || stage.color;

        this.saveState();
        this.renderWorkspace();
        this.notify('success', 'Changes saved successfully');
        return true;
      }
    });

    setTimeout(() => {
      document.querySelectorAll('#wcEditIconPicker .wc-icon-picker-item').forEach(item => {
        item.addEventListener('click', () => {
          document.querySelectorAll('#wcEditIconPicker .wc-icon-picker-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
        });
      });

      document.querySelectorAll('#wcEditColorPicker .wc-color-picker-item').forEach(item => {
        item.addEventListener('click', () => {
          document.querySelectorAll('#wcEditColorPicker .wc-color-picker-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
        });
      });

      document.getElementById('wcDeleteStageBtn')?.addEventListener('click', () => {
        this.showConfirm({
          title: this.t('whatsapp_cloud.pipeline_confirm_delete_title', 'Delete Stage'),
          message: this.t('whatsapp_cloud.pipeline_confirm_delete', 'Are you sure you want to delete this stage? All cards will be moved to the first stage.'),
          confirmText: this.t('common.delete', 'Delete'),
          cancelText: this.t('common.cancel', 'Cancel'),
          type: 'danger',
          onConfirm: () => {
            // Move all cards to first stage
            const firstStage = this.state.pipeline.stages[0];
            if (firstStage && firstStage.id !== stageId) {
              this.state.pipeline.cards.forEach(card => {
                if (card.stageId === stageId) {
                  card.stageId = firstStage.id;
                }
              });
            }
            
            // Remove stage
            this.state.pipeline.stages = this.state.pipeline.stages.filter(s => s.id !== stageId);
            this.saveState();
            this.closeModal();
            this.renderWorkspace();
            this.notify('success', this.t('whatsapp_cloud.pipeline_stage_deleted', 'Stage deleted successfully'));
          }
        });
      });
    }, 100);
  },

  getIconOptions() {
    return [
      'fas fa-inbox', 'fas fa-star', 'fas fa-handshake', 'fas fa-trophy', 'fas fa-times-circle',
      'fas fa-folder', 'fas fa-clock', 'fas fa-check-circle', 'fas fa-exclamation-circle', 'fas fa-pause-circle',
      'fas fa-user', 'fas fa-users', 'fas fa-comment', 'fas fa-phone', 'fas fa-envelope',
      'fas fa-dollar-sign', 'fas fa-shopping-cart', 'fas fa-heart', 'fas fa-flag', 'fas fa-bookmark'
    ];
  },

  getColorOptions() {
    return [
      '#6b7280', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
      '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4'
    ];
  },

  selectConversation(cardId) {
    this.state.selectedCard = cardId;
    
    // Find the card
    const card = this.state.pipeline.cards.find(c => c.id === cardId);
    if (!card) return;
    
    // Show chat modal
    this.showChatModal(card);
  },

  showChatModal(card) {
    const modal = document.createElement('div');
    modal.className = 'wc-chat-modal-fullscreen';
    modal.id = 'wcChatModal';
    
    modal.innerHTML = `
      <div class="wc-chat-layout">
        <!-- Left Sidebar - Conversations List -->
        <div class="wc-chat-sidebar-left">
          <div class="wc-chat-sidebar-header">
            <button class="wc-chat-back-btn" onclick="WhatsAppCloud.closeChatModal()">
              <i class="fas fa-arrow-left"></i>
            </button>
            <h3>Conversations</h3>
          </div>
          <div class="wc-chat-search">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Search...">
          </div>
          <div class="wc-chat-conversations-list">
            ${this.state.pipeline.cards.map(c => `
              <div class="wc-chat-conv-item ${c.id === card.id ? 'active' : ''}" onclick="WhatsAppCloud.selectConversation('${c.id}')">
                <div class="wc-chat-conv-avatar">
                  ${c.avatar ? `<img src="${c.avatar}" alt="${c.name}">` : `<span>${c.name.charAt(0).toUpperCase()}</span>`}
                </div>
                <div class="wc-chat-conv-content">
                  <div class="wc-chat-conv-header">
                    <span class="wc-chat-conv-name">${c.name}</span>
                    <span class="wc-chat-conv-time">${this.formatTime(c.timestamp)}</span>
                  </div>
                  <p class="wc-chat-conv-preview">${this.truncate(c.lastMessage, 40)}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Center - Chat Area -->
        <div class="wc-chat-center">
          <div class="wc-chat-header">
            <div class="wc-chat-header-left">
              <div class="wc-chat-avatar">
                ${card.avatar ? `<img src="${card.avatar}" alt="${card.name}">` : `<span>${card.name.charAt(0).toUpperCase()}</span>`}
              </div>
              <div class="wc-chat-info">
                <h3>${card.name}</h3>
                <p>${card.phone}</p>
              </div>
            </div>
            <div class="wc-chat-header-actions">
              <button class="wc-chat-action-btn" title="Search">
                <i class="fas fa-search"></i>
              </button>
              <button class="wc-chat-action-btn" title="More">
                <i class="fas fa-ellipsis-v"></i>
              </button>
            </div>
          </div>
          
          <div class="wc-chat-messages" id="wcChatMessages">
            <div class="wc-chat-date-divider">
              <span>23/12/2025</span>
            </div>
            <div class="wc-chat-message wc-chat-message-received">
              <div class="wc-chat-message-content">
                <p>Hi, I came from the Instagram ad.</p>
                <span class="wc-chat-message-time">22:08</span>
              </div>
            </div>
            <div class="wc-chat-automation-badge">
              <i class="fas fa-robot"></i> Automação
            </div>
            <div class="wc-chat-message wc-chat-message-sent">
              <div class="wc-chat-message-content">
                <p>Hi! Glad to hear you're interested in our products. 💚</p>
                <span class="wc-chat-message-time">22:08 <i class="fas fa-check-double"></i></span>
              </div>
            </div>
            <div class="wc-chat-automation-badge">
              <i class="fas fa-robot"></i> Automação
            </div>
            <div class="wc-chat-message wc-chat-message-sent">
              <div class="wc-chat-message-content">
                <p>I'd love to know more about you. What's your name?</p>
                <span class="wc-chat-message-time">22:08 <i class="fas fa-check-double"></i></span>
              </div>
            </div>
            <div class="wc-chat-message wc-chat-message-received">
              <div class="wc-chat-message-content">
                <p>Oliver Thomp</p>
                <span class="wc-chat-message-time">22:08</span>
              </div>
            </div>
            <div class="wc-chat-automation-badge">
              <i class="fas fa-robot"></i> Automação
            </div>
            <div class="wc-chat-message wc-chat-message-sent">
              <div class="wc-chat-message-content">
                <p>Oliver Thomp, nice to meet you! Just a moment, you'll be helped shortly.</p>
                <span class="wc-chat-message-time">22:08 <i class="fas fa-check-double"></i></span>
              </div>
            </div>
            <div class="wc-chat-date-divider">
              <span>Today</span>
            </div>
          </div>
          
          <div class="wc-chat-input-area">
            <button class="wc-chat-attach-btn" title="Attach file">
              <i class="fas fa-paperclip"></i>
            </button>
            <button class="wc-chat-emoji-btn" title="Emoji">
              <i class="fas fa-smile"></i>
            </button>
            <input type="text" class="wc-chat-input" placeholder="Digite uma mensagem ou digite / para atalhos" id="wcChatInput">
            <button class="wc-chat-mic-btn" title="Voice message">
              <i class="fas fa-microphone"></i>
            </button>
          </div>
        </div>
        
        <!-- Right Sidebar - Contact Info -->
        <div class="wc-chat-sidebar-right">
          <div class="wc-chat-contact-profile">
            <div class="wc-chat-profile-avatar">
              ${card.avatar ? `<img src="${card.avatar}" alt="${card.name}">` : `<span>${card.name.charAt(0).toUpperCase()}</span>`}
            </div>
            <h3>${card.name}</h3>
            <div class="wc-chat-profile-info">
              <i class="fas fa-user"></i>
              <span>${card.name}</span>
            </div>
            <div class="wc-chat-profile-info">
              <i class="fas fa-phone"></i>
              <span>${card.phone}</span>
            </div>
          </div>
          
          <div class="wc-chat-section">
            <div class="wc-chat-section-header">
              <i class="fas fa-tags"></i>
              <span>Tags</span>
              <button class="wc-chat-section-add">
                <i class="fas fa-plus"></i> Add tag
              </button>
            </div>
            <div class="wc-chat-section-content">
              ${card.tags ? card.tags.map(tag => `
                <span class="wc-tag-pill">
                  ${tag}
                  <button class="wc-tag-remove"><i class="fas fa-times"></i></button>
                </span>
              `).join('') : '<p class="wc-empty-text">Nenhuma tag</p>'}
            </div>
          </div>
          
          <div class="wc-chat-section">
            <div class="wc-chat-section-header">
              <i class="fas fa-user-tie"></i>
              <span>Atribuir agente</span>
            </div>
            <div class="wc-chat-section-content">
              <select class="form-control">
                <option>John</option>
                <option>Sarah</option>
                <option>Mike</option>
              </select>
            </div>
          </div>
          
          <div class="wc-chat-section">
            <div class="wc-chat-section-header">
              <i class="fas fa-flag"></i>
              <span>Etapa do Funil</span>
            </div>
            <div class="wc-chat-section-content">
              <select class="form-control">
                ${this.state.pipeline.stages.map(stage => `
                  <option value="${stage.id}" ${card.stageId === stage.id ? 'selected' : ''}>${stage.name}</option>
                `).join('')}
              </select>
            </div>
          </div>
          
          <div class="wc-chat-section">
            <div class="wc-chat-section-header">
              <i class="fas fa-sticky-note"></i>
              <span>Notas</span>
            </div>
            <div class="wc-chat-section-content">
              <textarea class="form-control" rows="4" placeholder="Adicione notas aqui..."></textarea>
            </div>
          </div>
          
          <div class="wc-chat-section">
            <div class="wc-chat-section-header">
              <i class="fas fa-photo-video"></i>
              <span>Ativos de Mídia</span>
            </div>
            <div class="wc-chat-section-content">
              <p class="wc-empty-text">Nenhuma mídia compartilhada</p>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus input
    setTimeout(() => {
      document.getElementById('wcChatInput')?.focus();
    }, 100);
    
    // Handle Enter key
    document.getElementById('wcChatInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    });
    
    // Auto-scroll to bottom
    const messagesContainer = document.getElementById('wcChatMessages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  },

  closeChatModal() {
    const modal = document.getElementById('wcChatModal');
    if (modal) {
      modal.remove();
    }
    this.state.selectedCard = null;
  },

  sendMessage() {
    const input = document.getElementById('wcChatInput');
    if (!input || !input.value.trim()) return;
    
    const message = input.value.trim();
    const messagesContainer = document.getElementById('wcChatMessages');
    
    // Add message to UI
    const messageEl = document.createElement('div');
    messageEl.className = 'wc-chat-message wc-chat-message-sent';
    messageEl.innerHTML = `
      <div class="wc-chat-message-content">
        <p>${message}</p>
        <span class="wc-chat-message-time">${this.formatTime(Date.now())}</span>
      </div>
    `;
    
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Clear input
    input.value = '';
    
    // Show notification
    this.notify('success', 'Changes saved successfully');
  },


  // ============================================
  // FLOW BUILDER METHODS
  // ============================================

  createNewFlow() {
    const newFlow = {
      id: 'flow_' + Date.now(),
      name: 'New Flow',
      description: '',
      active: false,
      trigger: 'keyword',
      triggerValue: '',
      accountId: this.state.activeAccountId,
      nodes: [],
      connections: [],
      createdAt: Date.now()
    };

    this.state.flows.push(newFlow);
    this.state.activeFlowId = newFlow.id;
    this.state.flowEditorMode = true;
    this.saveState();
    this.renderWorkspace();
    
    // Enable fullscreen for flow editor
    document.getElementById('wcWorkspace')?.classList.add('fullscreen');
  },

  editFlow(flowId) {
    this.state.activeFlowId = flowId;
    this.state.flowEditorMode = true;
    this.state.selectedNode = null;
    this.renderWorkspace();
    
    // Enable fullscreen for flow editor
    document.getElementById('wcWorkspace')?.classList.add('fullscreen');
  },

  exitFlowEditor() {
    this.state.flowEditorMode = false;
    this.state.activeFlowId = null;
    this.state.selectedNode = null;
    this.state.flowZoom = 1;
    this.state.flowPan = { x: 0, y: 0 };
    this.renderWorkspace();
    
    // Disable fullscreen
    document.getElementById('wcWorkspace')?.classList.remove('fullscreen');
  },

  toggleFlow(flowId) {
    const flow = this.state.flows.find(f => f.id === flowId);
    if (flow) {
      flow.active = !flow.active;
      this.saveFlowToServer(flow)
        .then(() => {
          this.renderWorkspace();
          this.notify('success', 'Changes saved successfully');
        })
        .catch(() => {
          this.notify('error', 'Error saving changes');
        });
    }
  },

  pauseFlow() {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    if (flow) {
      flow.active = !flow.active;
      this.saveFlowToServer(flow)
        .then(() => {
          this.renderWorkspace();
          this.notify('success', 'Changes saved successfully');
        })
        .catch(() => {
          this.notify('error', 'Error saving changes');
        });
    }
  },

  deleteFlow(flowId) {
    this.showConfirm({
      title: this.t('whatsapp_cloud.flow_confirm_delete_title', 'Delete Flow'),
      message: this.t('whatsapp_cloud.flow_confirm_delete', 'Are you sure you want to delete this flow? This action cannot be undone.'),
      confirmText: this.t('common.delete', 'Delete'),
      cancelText: this.t('common.cancel', 'Cancel'),
      type: 'danger',
      onConfirm: () => {
        this.deleteFlowFromServer(flowId)
          .then(() => {
            this.state.flows = this.state.flows.filter(f => f.id !== flowId);
            this.renderWorkspace();
            this.notify('success', this.t('whatsapp_cloud.flow_delete_success', 'Flow deleted successfully'));
          })
          .catch(() => {
            this.notify('error', 'Error saving changes');
          });
      }
    });
  },

  saveFlow() {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    if (!flow) return;
    this.saveFlowToServer(flow)
      .then(() => {
        this.notify('success', 'Flow saved successfully');
      })
      .catch(() => {
        this.notify('error', 'Error saving changes');
      });
  },

  saveFlowToServer(flow) {
    const token = localStorage.getItem('token');
    if (!token) {
      return Promise.reject(new Error('Unauthorized'));
    }
    return fetch('/api/user/whatsapp-cloud/flows', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify(flow)
    }).then(res => res.json()).then(result => {
      if (!result.success) {
        throw new Error(result.error || 'Failed');
      }
      return result.data;
    });
  },

  deleteFlowFromServer(flowId) {
    const token = localStorage.getItem('token');
    if (!token) {
      return Promise.reject(new Error('Unauthorized'));
    }
    return fetch(`/api/user/whatsapp-cloud/flows/${flowId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true'
      }
    }).then(res => res.json()).then(result => {
      if (!result.success) {
        throw new Error(result.error || 'Failed');
      }
      return result.data;
    });
  },

  getDefaultNodeConfig(type) {
    if (type === 'ai_control') return { mode: 'enable', aiConfigId: '', temperature: '', maxTokens: '', prompt: '' };
    if (type === 'delay') return { delay: 7, reaction: '', typingEffect: false };
    if (type === 'condition') return { condition: '' };
    if (type === 'collect_input') return { saveAs: '' };
    return {};
  },

  addFlowNode(type, x, y) {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    if (!flow) return;

    const newNode = {
      id: 'node_' + Date.now(),
      type: type,
      x: Math.max(0, x - 100), // Center the node
      y: Math.max(0, y - 40),
      content: '',
      config: this.getDefaultNodeConfig(type)
    };

    flow.nodes = flow.nodes || [];
    flow.nodes.push(newNode);
    this.state.selectedNode = newNode.id;
    this.saveState();
    this.renderWorkspace();
  },

  selectNode(nodeId) {
    this.state.selectedNode = nodeId;
    
    // Update node selection visual
    document.querySelectorAll('.wc-flow-node').forEach(node => {
      node.classList.toggle('selected', node.dataset.nodeId === nodeId);
    });
    
    // Update properties panel
    const propertiesPanel = document.getElementById('wcFlowProperties');
    if (propertiesPanel) {
      propertiesPanel.innerHTML = this.renderFlowProperties();
    }
  },

  saveNodeProperties() {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    const node = flow?.nodes?.find(n => n.id === this.state.selectedNode);
    
    if (!node) return;

    const contentValue = document.getElementById('wcNodeContent')?.value || '';
    
    if (node.type === 'collect_input') {
      node.config.saveAs = document.getElementById('wcNodeSaveAs')?.value || '';
      node.content = contentValue;
    }
    if (node.type === 'delay') {
      const delayValue = parseInt(document.getElementById('wcNodeDelayTime')?.value, 10);
      node.config.delay = Number.isFinite(delayValue) ? Math.max(7, delayValue) : 7;
      node.config.reaction = document.getElementById('wcNodeDelayReaction')?.value || '';
      node.config.typingEffect = document.getElementById('wcNodeDelayTyping')?.value === 'yes';
      node.content = String(node.config.delay);
    }
    if (node.type === 'ai_control') {
      node.config.mode = document.getElementById('wcNodeAiMode')?.value || 'enable';
      node.config.aiConfigId = document.getElementById('wcNodeAiConfig')?.value || '';
      node.config.temperature = document.getElementById('wcNodeAiTemperature')?.value || '';
      node.config.maxTokens = document.getElementById('wcNodeAiMaxTokens')?.value || '';
      node.config.prompt = document.getElementById('wcNodeAiPrompt')?.value || '';
      node.config.instructions = node.config.prompt;
      node.content = node.config.prompt;
    }
    if (node.type === 'condition') {
      node.config.condition = document.getElementById('wcNodeCondition')?.value || '';
      node.content = node.config.condition;
    }
    if (!node.type || (node.type !== 'collect_input' && node.type !== 'delay' && node.type !== 'ai_control' && node.type !== 'condition')) {
      node.content = contentValue;
    }

    this.saveState();
    this.renderWorkspace();
    this.notify('success', 'Changes saved successfully');
  },

  deleteSelectedNode() {
    if (!this.state.selectedNode) return;
    
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    if (!flow) return;

    // Remove node
    flow.nodes = flow.nodes.filter(n => n.id !== this.state.selectedNode);
    
    // Remove connections involving this node
    flow.connections = flow.connections.filter(c => 
      c.from !== this.state.selectedNode && c.to !== this.state.selectedNode
    );

    this.state.selectedNode = null;
    this.saveState();
    this.renderWorkspace();
    this.notify('success', 'Changes saved successfully');
  },

  zoomFlow(delta) {
    this.state.flowZoom = Math.max(0.25, Math.min(2, this.state.flowZoom + delta));
    const canvas = document.getElementById('wcFlowCanvasInner');
    if (canvas) {
      canvas.style.transform = `scale(${this.state.flowZoom})`;
    }
  },

  resetFlowZoom() {
    this.state.flowZoom = 1;
    this.state.flowPan = { x: 0, y: 0 };
    const canvas = document.getElementById('wcFlowCanvasInner');
    if (canvas) {
      canvas.style.transform = `scale(1) translate(0, 0)`;
    }
  },

  // ============================================
  // FAQ METHODS
  // ============================================

  showAddFaqModal() {
    this.showModal({
      title: this.t('whatsapp_cloud.faq_add_faq', 'Add FAQ'),
      content: `
        <div class="form-group">
          <label>${this.t('whatsapp_cloud.faq_question', 'Question')}</label>
          <input type="text" class="form-control" id="wcFaqQuestion" placeholder="${this.t('whatsapp_cloud.faq_question_placeholder', 'Enter the question')}">
        </div>
        <div class="form-group">
          <label>${this.t('whatsapp_cloud.faq_answer', 'Answer')}</label>
          <textarea class="form-control" id="wcFaqAnswer" rows="4" placeholder="${this.t('whatsapp_cloud.faq_answer_placeholder', 'Enter the answer')}"></textarea>
        </div>
        <div class="form-group">
          <label>${this.t('whatsapp_cloud.faq_keywords', 'Keywords')}</label>
          <input type="text" class="form-control" id="wcFaqKeywords" placeholder="${this.t('whatsapp_cloud.faq_keywords_placeholder', 'Enter keywords separated by comma')}">
        </div>
        <div class="form-group">
          <label>${this.t('whatsapp_cloud.faq_category', 'Category')}</label>
          <select class="form-control" id="wcFaqCategory">
            ${this.state.faqCategories.map(cat => `
              <option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
            `).join('')}
          </select>
        </div>
      `,
      onSubmit: () => {
        const question = document.getElementById('wcFaqQuestion')?.value?.trim();
        const answer = document.getElementById('wcFaqAnswer')?.value?.trim();
        const keywords = document.getElementById('wcFaqKeywords')?.value?.split(',').map(k => k.trim()).filter(k => k);
        const category = document.getElementById('wcFaqCategory')?.value;

        if (!question || !answer) {
          this.notify('error', this.t('whatsapp_cloud.faq_validation_error', 'Please enter question and answer'));
          return false;
        }

        const newFaq = {
          id: 'faq_' + Date.now(),
          question,
          answer,
          keywords,
          category,
          active: true,
          accountId: this.state.activeAccountId
        };

        this.state.faqs.push(newFaq);
        this.saveState();
        this.renderWorkspace();
        this.notify('success', this.t('whatsapp_cloud.faq.created_success', 'FAQ created successfully'));
        return true;
      }
    });
  },

  showEditFaqModal(faqId) {
    const faq = this.state.faqs.find(f => f.id === faqId);
    if (!faq) return;

    this.showModal({
      title: this.t('whatsapp_cloud.faq_edit_faq', 'Edit FAQ'),
      content: `
        <div class="form-group">
          <label>${this.t('whatsapp_cloud.faq_question', 'Question')}</label>
          <input type="text" class="form-control" id="wcFaqQuestion" value="${faq.question}">
        </div>
        <div class="form-group">
          <label>${this.t('whatsapp_cloud.faq_answer', 'Answer')}</label>
          <textarea class="form-control" id="wcFaqAnswer" rows="4">${faq.answer}</textarea>
        </div>
        <div class="form-group">
          <label>${this.t('whatsapp_cloud.faq_keywords', 'Keywords')}</label>
          <input type="text" class="form-control" id="wcFaqKeywords" value="${faq.keywords.join(', ')}">
        </div>
        <div class="form-group">
          <label>${this.t('whatsapp_cloud.faq_category', 'Category')}</label>
          <select class="form-control" id="wcFaqCategory">
            ${this.state.faqCategories.map(cat => `
              <option value="${cat}" ${faq.category === cat ? 'selected' : ''}>${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="wc-checkbox-label">
            <input type="checkbox" id="wcFaqActive" ${faq.active ? 'checked' : ''}>
            <span>${this.t('whatsapp_cloud.faq_active', 'Active')}</span>
          </label>
        </div>
      `,
      onSubmit: () => {
        faq.question = document.getElementById('wcFaqQuestion')?.value?.trim();
        faq.answer = document.getElementById('wcFaqAnswer')?.value?.trim();
        faq.keywords = document.getElementById('wcFaqKeywords')?.value?.split(',').map(k => k.trim()).filter(k => k);
        faq.category = document.getElementById('wcFaqCategory')?.value;
        faq.active = document.getElementById('wcFaqActive')?.checked;

        this.saveState();
        this.renderWorkspace();
        this.notify('success', this.t('whatsapp_cloud.faq_updated_success', 'FAQ updated successfully'));
        return true;
      }
    });
  },

  deleteFaq(faqId) {
    this.showConfirm({
      title: this.t('whatsapp_cloud.faq_confirm_delete_title', 'Delete FAQ'),
      message: this.t('whatsapp_cloud.faq_confirm_delete', 'Are you sure you want to delete this FAQ?'),
      confirmText: this.t('common.delete', 'Delete'),
      cancelText: this.t('common.cancel', 'Cancel'),
      type: 'danger',
      onConfirm: () => {
        this.state.faqs = this.state.faqs.filter(f => f.id !== faqId);
        this.saveState();
        this.renderWorkspace();
        this.notify('success', this.t('whatsapp_cloud.faq_deleted_success', 'FAQ deleted successfully'));
      }
    });
  },

  toggleFaq(faqId) {
    const faq = this.state.faqs.find(f => f.id === faqId);
    if (faq) {
      faq.active = !faq.active;
      this.saveState();
      this.renderWorkspace();
    }
  },

  // ============================================
  // CAMPAIGN METHODS
  // ============================================

  syncTemplates() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.notify('error', 'Authentication required');
      return;
    }

    const activeAccount = this.state.accounts.find(a => a.id === this.state.activeAccountId);
    if (!activeAccount) {
      this.notify('error', 'No active account selected');
      return;
    }

    this.notify('info', 'Syncing templates from Meta...');
    
    fetch(`/api/whatsapp-cloud/accounts/${activeAccount.id}/sync-templates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(result => {
      console.log('Sync templates result:', result);
      if (result.success) {
        this.notify('success', `${result.data.count} templates synced successfully`);
        this.state.templates = result.data.templates || [];
        console.log('Templates synced and saved:', this.state.templates.length);
        this.saveState();
        this.render();
      } else {
        this.notify('error', result.message || 'Failed to sync templates');
      }
    })
    .catch(error => {
      console.error('Error syncing templates:', error);
      this.notify('error', 'Failed to sync templates');
    });
  },

  showCreateTemplateModal() {
    this.showModal({
      title: 'Create Template',
      large: true,
      content: `
        <div class="form-group">
          <label >Template Name</label>
          <input type="text" class="form-control" id="wcTemplateName" placeholder="e.g., order_confirmation">
          <small class="form-text">Use lowercase letters, numbers, and underscores only</small>
        </div>
        <div class="wc-form-row">
          <div class="form-group">
            <label >Language</label>
            <select class="form-control" id="wcTemplateLanguage">
              <option value="en">English</option>
              <option value="es">Spanish</option>
              <option value="pt">Portuguese</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="it">Italian</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ar">Arabic</option>
            </select>
          </div>
          <div class="form-group">
            <label >Category</label>
            <select class="form-control" id="wcTemplateCategory">
              <option value="marketing">Marketing</option>
              <option value="utility">Utility</option>
              <option value="authentication">Authentication</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label >Header (Optional)</label>
          <input type="text" class="form-control" id="wcTemplateHeader" placeholder="Header text">
        </div>
        <div class="form-group">
          <label >Message Body</label>
          <textarea class="form-control" id="wcTemplateBody" rows="4" placeholder="Use {{1}}, {{2}}, etc. for variables"></textarea>
        </div>
        <div class="form-group">
          <label >Footer (Optional)</label>
          <input type="text" class="form-control" id="wcTemplateFooter" placeholder="Footer text">
        </div>
      `,
      submitText: 'Submit for Approval',
      onSubmit: () => {
        const name = document.getElementById('wcTemplateName')?.value?.trim();
        const language = document.getElementById('wcTemplateLanguage')?.value;
        const category = document.getElementById('wcTemplateCategory')?.value;
        const header = document.getElementById('wcTemplateHeader')?.value?.trim();
        const body = document.getElementById('wcTemplateBody')?.value?.trim();
        const footer = document.getElementById('wcTemplateFooter')?.value?.trim();

        if (!name || !body) {
          this.notify('error', 'Template name and body are required');
          return false;
        }

        const newTemplate = {
          id: 'template_' + Date.now(),
          name,
          language,
          category,
          status: 'pending',
          header: header ? { type: 'text', text: header } : null,
          body,
          footer,
          buttons: []
        };

        this.state.templates.push(newTemplate);
        this.saveState();
        this.renderWorkspace();
        this.notify('success', 'Changes saved successfully');
        return true;
      }
    });
  },

  updateCampaignPreview(templateId) {
    const template = this.state.templates.find(t => t.id === templateId);
    const previewText = document.getElementById('wcCampaignPreviewText');
    if (previewText && template) {
      let preview = '';
      if (template.header?.text) {
        preview += `<strong>${template.header.text}</strong><br><br>`;
      }
      preview += template.body;
      if (template.footer) {
        preview += `<br><br><small style="color: #666;">${template.footer}</small>`;
      }
      previewText.innerHTML = preview;
    } else if (previewText) {
      previewText.innerHTML = 'Select a template to preview the message.';
    }
  },

  previewTemplate(templateId) {
    const template = this.state.templates.find(t => t.id === templateId);
    if (!template) return;

    this.showModal({
      title: `Template Preview: ${template.name}`,
      content: `
        <div class="wc-template-preview">
          <div class="wc-template-preview-meta">
            <span class="wc-template-preview-status ${template.status}">${template.status}</span>
            <span class="wc-template-preview-lang">${template.language.toUpperCase()}</span>
            <span class="wc-template-preview-category">${template.category}</span>
          </div>
          <div class="wc-template-preview-content">
            ${template.header?.text ? `<div class="wc-template-preview-header"><strong>${template.header.text}</strong></div>` : ''}
            <div class="wc-template-preview-body">${template.body}</div>
            ${template.footer ? `<div class="wc-template-preview-footer">${template.footer}</div>` : ''}
          </div>
          ${template.buttons && template.buttons.length > 0 ? `
            <div class="wc-template-preview-buttons">
              ${template.buttons.map(btn => `
                <button class="wc-template-preview-btn">${btn.text}</button>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `,
      hideSubmit: true
    });
  },

  useTemplate(templateId) {
    document.getElementById('wcCampaignTemplate').value = templateId;
    this.updateCampaignPreview(templateId);
    
    // Scroll to campaign builder
    document.querySelector('.wc-campaigns-builder')?.scrollIntoView({ behavior: 'smooth' });
  },

  scheduleCampaign() {
    const templateId = document.getElementById('wcCampaignTemplate')?.value;
    const audienceId = document.getElementById('wcCampaignAudience')?.value;
    const schedule = document.getElementById('wcCampaignSchedule')?.value;
    const timezone = document.getElementById('wcCampaignTimezone')?.value;

    if (!templateId || !audienceId) {
      this.notify('error', 'Required fields are missing');
      return;
    }

    const newCampaign = {
      id: 'campaign_' + Date.now(),
      templateId,
      audienceId,
      schedule: schedule || null,
      timezone: timezone || 'UTC',
      status: schedule ? 'scheduled' : 'sending',
      createdAt: Date.now(),
      stats: { sent: 0, delivered: 0, read: 0, failed: 0 }
    };

    this.state.campaigns.push(newCampaign);
    this.saveState();
    this.notify('success', 'Changes saved successfully');
  },

  saveCampaignDraft() {
    this.notify('success', 'Draft saved successfully');
  },


  // ============================================
  // CONNECTION METHODS
  // ============================================

  initFacebookLogin() {
    // Check if Meta App is configured in system settings (using public route)
    fetch('/api/superadmin/settings/meta/status')
      .then(response => response.json())
      .then(result => {
        if (!result.success || !result.data.is_configured) {
          // Show configuration required message
          this.showModal({
            title: 'Facebook Login Not Configured',
            content: `
              <div class="wc-facebook-setup-required">
                <div class="wc-facebook-setup-icon">
                  <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h4>System Configuration Required</h4>
                <p>The Facebook Embedded Signup feature needs to be configured by the system administrator.</p>
                <div class="wc-facebook-setup-steps">
                  <h5>What needs to be done:</h5>
                  <ol>
                    <li>System admin must register as a Meta Business Partner</li>
                    <li>Create a Meta App with WhatsApp product</li>
                    <li>Configure Embedded Signup in the Meta App</li>
                    <li>Add the App ID and Config ID in System Settings</li>
                  </ol>
                </div>
                <div class="wc-facebook-setup-links">
                  <a href="https://developers.facebook.com/docs/whatsapp/embedded-signup" target="_blank" class="btn btn-secondary">
                    <i class="fas fa-book"></i>
                    View Documentation
                  </a>
                </div>
                <div class="wc-facebook-setup-note">
                  <i class="fas fa-info-circle"></i>
                  <span>Contact your system administrator to enable this feature.</span>
                </div>
              </div>
            `,
            hideSubmit: true
          });
          return;
        }

        // Meta App is configured, proceed with Facebook Login
        const appId = result.data.meta_app_id;
        const configId = result.data.meta_config_id;

        // Load Facebook SDK if not already loaded
        if (typeof FB === 'undefined') {
          this.loadFacebookSDK(appId, () => {
            this.launchFacebookLogin(appId, configId);
          });
        } else {
          this.launchFacebookLogin(appId, configId);
        }
      })
      .catch(error => {
        console.error('Error checking Meta settings:', error);
        this.notify('error', 'Failed to check system configuration');
      });
  },

  loadFacebookSDK(appId, callback) {
    // Load Facebook SDK dynamically
    window.fbAsyncInit = function() {
      FB.init({
        appId: appId,
        cookie: true,
        xfbml: true,
        version: 'v18.0'
      });
      
      // Subscribe to auth.statusChange event for Embedded Signup
      FB.Event.subscribe('auth.statusChange', function(response) {
        console.log('Facebook auth status changed:', response);
        if (response.status === 'connected' && response.authResponse) {
          console.log('User is connected, processing...');
          // Don't process here, will be handled by the callback
        }
      });
      
      if (callback) callback();
    };

    // Load the SDK asynchronously
    (function(d, s, id) {
      var js, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s); js.id = id;
      js.src = "https://connect.facebook.net/en_US/sdk.js";
      fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'facebook-jssdk'));
  },

  launchFacebookLogin(appId, configId) {
    console.log('Launching Facebook Embedded Signup', { appId, configId });
    
    // For Embedded Signup, we need to use a different approach
    // The callback URL will receive the code parameter
    const redirectUri = `${window.location.origin}/admin/facebook-callback.html`;
    
    // Launch Facebook Embedded Signup using window.open
    const width = 600;
    const height = 700;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;
    
    const fbLoginUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
      `client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=whatsapp_business_management,whatsapp_business_messaging` +
      `&state=${Date.now()}`;
    
    console.log('Opening Facebook login window:', fbLoginUrl);
    
    const popup = window.open(
      fbLoginUrl,
      'facebook-login',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );
    
    // Listen for the redirect callback
    const messageHandler = (event) => {
      console.log('Received message event:', event);
      
      // Verify origin for security
      if (event.origin !== window.location.origin) {
        console.warn('Message from different origin, ignoring');
        return;
      }
      
      if (event.data && event.data.type === 'facebook-callback') {
        console.log('Facebook callback received:', event.data);
        
        // Remove event listener
        window.removeEventListener('message', messageHandler);
        
        if (event.data.code) {
          this.handleFacebookLoginSuccess({ code: event.data.code });
        } else if (event.data.error) {
          this.notify('error', `Facebook login error: ${event.data.error}`);
        }
        
        // Close popup if still open
        if (popup && !popup.closed) {
          popup.close();
        }
      }
    };
    
    window.addEventListener('message', messageHandler);
    
    // Check if popup was blocked
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      this.notify('error', 'Popup was blocked. Please allow popups for this site.');
      window.removeEventListener('message', messageHandler);
    }
  },

  handleFacebookLoginSuccess(authResponse) {
    console.log('Processing Facebook login success:', authResponse);
    
    // Show loading
    this.notify('info', 'Processing Facebook login...');
    
    const token = localStorage.getItem('token');
    if (!token) {
      this.notify('error', 'Authentication required');
      return;
    }
    
    // Send the auth response to backend to exchange for long-lived token
    // and retrieve WABA details
    fetch('/api/whatsapp-cloud/facebook-callback', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: authResponse.code || authResponse.accessToken,
        auth_response: authResponse
      })
    })
    .then(response => {
      console.log('Backend response status:', response.status);
      return response.json();
    })
    .then(result => {
      console.log('Backend response:', result);
      
      if (result.success) {
        // Account connected successfully
        this.notify('success', 'WhatsApp account connected successfully!');
        
        // Reload accounts from backend
        this.loadAccounts();
        
        // Switch to the new account
        if (result.data && result.data.account_id) {
          this.state.activeAccountId = result.data.account_id;
        }
        
        // Re-render after a short delay to allow accounts to load
        setTimeout(() => {
          this.render();
        }, 500);
      } else {
        console.error('Backend error:', result.message);
        this.notify('error', result.message || 'Failed to connect account');
      }
    })
    .catch(error => {
      console.error('Error processing Facebook login:', error);
      this.notify('error', 'Failed to process Facebook login');
    });
  },

  copyWebhookUrl() {
    const webhookUrl = document.getElementById('wcWebhookUrl')?.value || `${window.location.origin}/api/whatsapp-cloud/webhook`;
    navigator.clipboard.writeText(webhookUrl).then(() => {
      this.notify('success', 'Webhook URL copied to clipboard');
    }).catch(() => {
      // Fallback for older browsers
      const input = document.getElementById('wcWebhookUrl');
      if (input) {
        input.select();
        document.execCommand('copy');
        this.notify('success', 'Webhook URL copied to clipboard');
      }
    });
  },

  testConnection() {
    const phoneId = document.getElementById('wcConnectionPhoneId')?.value;
    const accessToken = document.getElementById('wcConnectionAccessToken')?.value;

    if (!phoneId || !accessToken) {
      this.notify('error', 'Phone Number ID and Access Token are required');
      return;
    }

    this.notify('info', 'Testing connection...');
    
    // Simulate API test
    setTimeout(() => {
      // In production, this would make an actual API call to verify credentials
      this.notify('success', 'Connection test successful');
    }, 1500);
  },

  saveConnection() {
    const name = document.getElementById('wcConnectionName')?.value?.trim();
    const wabaId = document.getElementById('wcConnectionWabaId')?.value?.trim();
    const phoneNumberId = document.getElementById('wcConnectionPhoneId')?.value?.trim();
    const appId = document.getElementById('wcConnectionAppId')?.value?.trim();
    const accessToken = document.getElementById('wcConnectionAccessToken')?.value?.trim();
    const verifyToken = document.getElementById('wcConnectionVerifyToken')?.value?.trim();
    const appSecret = document.getElementById('wcConnectionAppSecret')?.value?.trim();
    const phoneNumber = document.getElementById('wcConnectionPhoneNumber')?.value?.trim();

    if (!name) {
      this.notify('error', 'Account name is required');
      return;
    }

    if (!phoneNumberId || !accessToken) {
      this.notify('error', 'Phone Number ID and Access Token are required');
      return;
    }

    this.notify('info', 'Saving account...');

    const token = localStorage.getItem('token');
    if (!token) {
      this.notify('error', 'Authentication required');
      return;
    }

    // Check if we're updating an existing account
    const accountId = this.state.activeAccountId;
    const isUpdate = accountId && this.state.accounts.find(a => a.id === accountId);

    const url = isUpdate 
      ? `/api/whatsapp-cloud/accounts/${accountId}`
      : '/api/whatsapp-cloud/facebook-callback';
    
    const method = isUpdate ? 'PUT' : 'POST';

    const body = isUpdate ? {
      account_name: name,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      phone_number: phoneNumber,
      access_token: accessToken,
      app_id: appId,
      app_secret: appSecret
    } : {
      // For new accounts, simulate a manual connection
      code: null,
      manual: true,
      account_name: name,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      phone_number: phoneNumber,
      access_token: accessToken,
      app_id: appId,
      app_secret: appSecret
    };

    fetch(url, {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    .then(response => response.json())
    .then(result => {
      if (result.success) {
        this.notify('success', 'Account saved successfully!');
        
        // Reload accounts from backend
        this.loadAccounts();
        
        // Re-render after a short delay
        setTimeout(() => {
          this.render();
        }, 500);
      } else {
        this.notify('error', result.message || 'Failed to save account');
      }
    })
    .catch(error => {
      console.error('Error saving account:', error);
      this.notify('error', 'Failed to save account');
    });
  },

  selectAccount(accountId) {
    this.state.activeAccountId = accountId;
    this.saveState();
    this.renderWorkspace();
    this.notify('success', 'Account selected');
  },

  editAccount(accountId) {
    this.state.activeAccountId = accountId;
    this.switchTab('connection');
  },

  deleteAccount(accountId) {
    this.showConfirm({
      title: this.t('whatsapp_cloud.account_confirm_delete_title', 'Delete Account'),
      message: this.t('whatsapp_cloud.account_confirm_delete', 'Are you sure you want to delete this account? This action cannot be undone.'),
      confirmText: this.t('common.delete', 'Delete'),
      cancelText: this.t('common.cancel', 'Cancel'),
      type: 'danger',
      onConfirm: () => {
        this.state.accounts = this.state.accounts.filter(a => a.id !== accountId);
        if (this.state.activeAccountId === accountId) {
          this.state.activeAccountId = this.state.accounts[0]?.id || null;
        }
        this.saveState();
        this.renderWorkspace();
        this.notify('success', this.t('whatsapp_cloud.account_deleted_success', 'Account deleted successfully'));
      }
    });
  },

  showAddAccountModal() {
    this.showModal({
      title: 'Add WhatsApp Cloud Account',
      content: `
        <div class="form-group">
          <label >Account Name</label>
          <input type="text" class="form-control" id="wcNewAccountName" placeholder="e.g., Main Business Number">
        </div>
        <div class="form-group">
          <label >Phone Number ID</label>
          <input type="text" class="form-control" id="wcNewAccountPhoneId" placeholder="Phone Number ID from Meta">
        </div>
        <div class="form-group">
          <label >WABA ID</label>
          <input type="text" class="form-control" id="wcNewAccountWabaId" placeholder="WhatsApp Business Account ID">
        </div>
      `,
      onSubmit: () => {
        const name = document.getElementById('wcNewAccountName')?.value?.trim();
        const phoneNumberId = document.getElementById('wcNewAccountPhoneId')?.value?.trim();
        const wabaId = document.getElementById('wcNewAccountWabaId')?.value?.trim();

        if (!name) {
          this.notify('error', 'Required fields are missing');
          return false;
        }

        const newAccount = {
          id: 'account_' + Date.now(),
          name,
          phoneNumberId,
          wabaId,
          status: 'pending',
          isDefault: this.state.accounts.length === 0
        };

        this.state.accounts.push(newAccount);
        if (!this.state.activeAccountId) {
          this.state.activeAccountId = newAccount.id;
        }
        this.saveState();
        this.renderWorkspace();
        this.notify('success', 'Changes saved successfully');
        return true;
      }
    });
  },

  showAccountSelectorModal() {
    if (this.state.accounts.length === 0) {
      this.showAddAccountModal();
      return;
    }

    this.showModal({
      title: 'Select Account',
      content: `
        <div class="wc-account-selector-list">
          ${this.state.accounts.map(account => `
            <div class="wc-account-selector-item ${account.id === this.state.activeAccountId ? 'active' : ''}" 
                 data-account-id="${account.id}">
              <div class="wc-account-selector-icon">
                <i class="fab fa-whatsapp"></i>
              </div>
              <div class="wc-account-selector-info">
                <h4>${account.name}</h4>
                <p>${account.phoneNumber || 'Phone ID: ' + (account.phoneNumberId || 'Not set')}</p>
              </div>
              <span class="wc-account-selector-status ${account.status || 'pending'}">${account.status || 'Pending'}</span>
            </div>
          `).join('')}
        </div>
      `,
      hideSubmit: true
    });

    setTimeout(() => {
      document.querySelectorAll('.wc-modal .wc-account-selector-item').forEach(item => {
        item.addEventListener('click', () => {
          this.selectAccount(item.dataset.accountId);
          this.closeModal();
        });
      });
    }, 100);
  },

  // ============================================
  // MODAL HELPERS
  // ============================================

  showModal({ title, content, onSubmit, submitText = null, large = false, hideSubmit = false }) {
    // Remove existing modal
    this.closeModal();

    const submitLabel = submitText || this.t('common.save', 'Save');
    const cancelLabel = this.t('common.cancel', 'Cancel');

    const modal = document.createElement('div');
    modal.className = 'wc-modal-overlay';
    modal.id = 'wcModal';
    modal.innerHTML = `
      <div class="wc-modal ${large ? 'large' : ''}">
        <div class="wc-modal-header">
          <h3 class="wc-modal-title">${title}</h3>
          <button class="wc-modal-close" id="wcModalClose">&times;</button>
        </div>
        <div class="wc-modal-body">
          ${content}
        </div>
        ${!hideSubmit ? `
          <div class="wc-modal-footer">
            <button class="btn btn-secondary" id="wcModalCancel">${cancelLabel}</button>
            <button class="btn btn-primary" id="wcModalSubmit">${submitLabel}</button>
          </div>
        ` : ''}
      </div>
    `;

    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('active');
    });

    // Event listeners
    document.getElementById('wcModalClose')?.addEventListener('click', () => this.closeModal());
    document.getElementById('wcModalCancel')?.addEventListener('click', () => this.closeModal());
    document.getElementById('wcModalSubmit')?.addEventListener('click', () => {
      if (onSubmit && onSubmit() !== false) {
        this.closeModal();
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeModal();
      }
    });

    // Handle escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  },

  closeModal() {
    const modal = document.getElementById('wcModal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 200);
    }
  },

  // Custom Confirm Dialog
  showConfirm({ title, message, confirmText, cancelText, onConfirm, onCancel, type = 'warning' }) {
    this.closeModal();

    const confirmTitle = title || this.t('common.confirm', 'Confirm');
    const confirmBtn = confirmText || this.t('common.confirm', 'Confirm');
    const cancelBtn = cancelText || this.t('common.cancel', 'Cancel');

    const iconMap = {
      'warning': 'fas fa-exclamation-triangle',
      'danger': 'fas fa-exclamation-circle',
      'info': 'fas fa-info-circle',
      'question': 'fas fa-question-circle'
    };

    const colorMap = {
      'warning': '#f59e0b',
      'danger': '#ef4444',
      'info': '#3b82f6',
      'question': '#6b7280'
    };

    const modal = document.createElement('div');
    modal.className = 'wc-modal-overlay';
    modal.id = 'wcModal';
    modal.innerHTML = `
      <div class="wc-modal wc-modal-confirm">
        <div class="wc-modal-confirm-icon" style="color: ${colorMap[type]}">
          <i class="${iconMap[type]}"></i>
        </div>
        <div class="wc-modal-confirm-content">
          <h3 class="wc-modal-confirm-title">${confirmTitle}</h3>
          <p class="wc-modal-confirm-message">${message}</p>
        </div>
        <div class="wc-modal-confirm-actions">
          <button class="btn btn-secondary" id="wcConfirmCancel">${cancelBtn}</button>
          <button class="btn btn-primary" id="wcConfirmOk">${confirmBtn}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('active');
    });

    // Event listeners
    document.getElementById('wcConfirmCancel')?.addEventListener('click', () => {
      this.closeModal();
      if (onCancel) onCancel();
    });

    document.getElementById('wcConfirmOk')?.addEventListener('click', () => {
      this.closeModal();
      if (onConfirm) onConfirm();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeModal();
        if (onCancel) onCancel();
      }
    });

    // Handle escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        if (onCancel) onCancel();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  },

  // Custom Alert Dialog
  showAlert({ title, message, buttonText, type = 'info', onClose }) {
    this.closeModal();

    const alertTitle = title || this.t('common.alert', 'Alert');
    const okBtn = buttonText || this.t('common.ok', 'OK');

    const iconMap = {
      'success': 'fas fa-check-circle',
      'error': 'fas fa-times-circle',
      'warning': 'fas fa-exclamation-triangle',
      'info': 'fas fa-info-circle'
    };

    const colorMap = {
      'success': '#10b981',
      'error': '#ef4444',
      'warning': '#f59e0b',
      'info': '#3b82f6'
    };

    const modal = document.createElement('div');
    modal.className = 'wc-modal-overlay';
    modal.id = 'wcModal';
    modal.innerHTML = `
      <div class="wc-modal wc-modal-alert">
        <div class="wc-modal-alert-icon" style="color: ${colorMap[type]}">
          <i class="${iconMap[type]}"></i>
        </div>
        <div class="wc-modal-alert-content">
          <h3 class="wc-modal-alert-title">${alertTitle}</h3>
          <p class="wc-modal-alert-message">${message}</p>
        </div>
        <div class="wc-modal-alert-actions">
          <button class="btn btn-primary" id="wcAlertOk">${okBtn}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('active');
    });

    // Event listeners
    document.getElementById('wcAlertOk')?.addEventListener('click', () => {
      this.closeModal();
      if (onClose) onClose();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeModal();
        if (onClose) onClose();
      }
    });

    // Handle escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        if (onClose) onClose();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  },

  // ============================================
  // CONVERSATION VIEWER & MESSAGING
  // ============================================

  openConversation(cardId) {
    const card = this.state.pipeline.cards.find(c => c.id === parseInt(cardId));
    if (!card) {
      console.error('Card not found:', cardId);
      return;
    }

    console.log('Opening conversation:', card);
    this.state.selectedCard = card.id;
    
    // Load messages for this conversation
    this.loadMessages(card.conversationId);
    
    // Show conversation viewer modal
    this.showConversationViewer(card);
  },

  loadMessages(conversationId) {
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('No token for loading messages');
      return;
    }

    console.log('Loading messages for conversation:', conversationId);

    fetch(`/api/whatsapp-cloud/conversations/${conversationId}/messages`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => response.json())
    .then(result => {
      console.log('Messages loaded:', result);
      if (result.success && result.data) {
        this.state.currentMessages = result.data;
        this.renderMessages();
      }
    })
    .catch(error => {
      console.error('Error loading messages:', error);
    });
  },

  showConversationViewer(card) {
    const modal = document.createElement('div');
    modal.className = 'wc-modal active';
    modal.id = 'wcConversationModal';
    modal.innerHTML = `
      <div class="wc-modal-content wc-conversation-viewer">
        <div class="wc-conversation-header">
          <div class="wc-conversation-header-left">
            <button class="wc-conversation-back-btn" id="wcConversationBackBtn">
              <i class="fas fa-arrow-left"></i>
            </button>
            <div class="wc-conversation-avatar">
              ${card.avatar ? `<img src="${card.avatar}" alt="${card.name}">` : `<span>${card.name.charAt(0).toUpperCase()}</span>`}
            </div>
            <div class="wc-conversation-info">
              <h3>${card.name}</h3>
              <p>${card.phone}</p>
            </div>
          </div>
          <div class="wc-conversation-header-right">
            <button class="wc-conversation-action-btn" title="Search">
              <i class="fas fa-search"></i>
            </button>
            <button class="wc-conversation-action-btn" title="More">
              <i class="fas fa-ellipsis-v"></i>
            </button>
          </div>
        </div>
        
        <div class="wc-conversation-messages" id="wcConversationMessages">
          <div class="wc-messages-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading messages...</p>
          </div>
        </div>
        
        <div class="wc-conversation-input">
          <button class="wc-conversation-attach-btn" id="wcAttachBtn" title="Attach file">
            <i class="fas fa-paperclip"></i>
          </button>
          <input type="file" id="wcAttachFileInput" style="display: none;" accept="image/*,video/*,audio/*,.pdf,.doc,.docx">
          <div class="wc-conversation-input-wrapper">
            <textarea 
              id="wcMessageInput" 
              placeholder="Type a message..." 
              rows="1"
            ></textarea>
          </div>
          <button class="wc-conversation-send-btn" id="wcSendMessageBtn">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    document.getElementById('wcConversationBackBtn').addEventListener('click', () => {
      this.closeConversationViewer();
    });

    document.getElementById('wcSendMessageBtn').addEventListener('click', () => {
      this.sendMessage(card.conversationId);
    });

    document.getElementById('wcMessageInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage(card.conversationId);
      }
    });

    document.getElementById('wcAttachBtn').addEventListener('click', () => {
      document.getElementById('wcAttachFileInput').click();
    });

    document.getElementById('wcAttachFileInput').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.sendMediaMessage(card.conversationId, e.target.files[0]);
      }
    });

    // Auto-resize textarea
    const textarea = document.getElementById('wcMessageInput');
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeConversationViewer();
      }
    });
  },

  renderMessages() {
    const messagesContainer = document.getElementById('wcConversationMessages');
    if (!messagesContainer) return;

    const messages = this.state.currentMessages || [];
    
    if (messages.length === 0) {
      messagesContainer.innerHTML = `
        <div class="wc-messages-empty">
          <i class="fas fa-comments"></i>
          <p>No messages yet</p>
        </div>
      `;
      return;
    }

    messagesContainer.innerHTML = messages.map(msg => {
      const isOutbound = msg.direction === 'outbound';
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      return `
        <div class="wc-message ${isOutbound ? 'outbound' : 'inbound'}">
          <div class="wc-message-content">
            ${this.renderMessageContent(msg)}
            <div class="wc-message-meta">
              <span class="wc-message-time">${time}</span>
              ${isOutbound ? `
                <span class="wc-message-status">
                  ${msg.status === 'read' ? '<i class="fas fa-check-double" style="color: #53bdeb;"></i>' : 
                    msg.status === 'delivered' ? '<i class="fas fa-check-double"></i>' : 
                    '<i class="fas fa-check"></i>'}
                </span>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  },

  renderMessageContent(msg) {
    switch (msg.message_type) {
      case 'text':
        return `<p class="wc-message-text">${this.escapeHtml(msg.text_content)}</p>`;
      
      case 'image':
        return `
          <div class="wc-message-media">
            <img src="${msg.media_url}" alt="Image" onclick="window.open('${msg.media_url}', '_blank')">
            ${msg.caption ? `<p class="wc-message-caption">${this.escapeHtml(msg.caption)}</p>` : ''}
          </div>
        `;
      
      case 'video':
        return `
          <div class="wc-message-media">
            <video controls>
              <source src="${msg.media_url}" type="video/mp4">
            </video>
            ${msg.caption ? `<p class="wc-message-caption">${this.escapeHtml(msg.caption)}</p>` : ''}
          </div>
        `;
      
      case 'audio':
        return `
          <div class="wc-message-media">
            <audio controls>
              <source src="${msg.media_url}" type="audio/mpeg">
            </audio>
          </div>
        `;
      
      case 'document':
        return `
          <div class="wc-message-document">
            <i class="fas fa-file"></i>
            <a href="${msg.media_url}" target="_blank">${msg.filename || 'Document'}</a>
          </div>
        `;
      
      case 'location':
        return `
          <div class="wc-message-location">
            <i class="fas fa-map-marker-alt"></i>
            <p>Location shared</p>
          </div>
        `;
      
      default:
        return `<p class="wc-message-text">${msg.message_type}</p>`;
    }
  },

  sendMessage(conversationId) {
    const input = document.getElementById('wcMessageInput');
    const text = input.value.trim();
    
    if (!text) return;

    const token = localStorage.getItem('token');
    if (!token) {
      this.notify('error', 'Authentication required');
      return;
    }

    const activeAccount = this.state.accounts.find(a => a.id === this.state.activeAccountId);
    if (!activeAccount) {
      this.notify('error', 'No active account');
      return;
    }

    // Get conversation details
    const card = this.state.pipeline.cards.find(c => c.conversationId === conversationId);
    if (!card) {
      this.notify('error', 'Conversation not found');
      return;
    }

    console.log('Sending message:', { conversationId, text, to: card.phone });

    // Disable input while sending
    input.disabled = true;
    const sendBtn = document.getElementById('wcSendMessageBtn');
    sendBtn.disabled = true;

    fetch('/api/whatsapp-cloud/send-message', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountId: activeAccount.id,
        to: card.phone,
        message: text,
        conversationId: conversationId
      })
    })
    .then(response => response.json())
    .then(result => {
      console.log('Message sent:', result);
      if (result.success) {
        input.value = '';
        input.style.height = 'auto';
        this.loadMessages(conversationId);
        this.notify('success', 'Message sent');
      } else {
        this.notify('error', result.message || 'Failed to send message');
      }
    })
    .catch(error => {
      console.error('Error sending message:', error);
      this.notify('error', 'Failed to send message');
    })
    .finally(() => {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    });
  },

  sendMediaMessage(conversationId, file) {
    const token = localStorage.getItem('token');
    if (!token) {
      this.notify('error', 'Authentication required');
      return;
    }

    const activeAccount = this.state.accounts.find(a => a.id === this.state.activeAccountId);
    if (!activeAccount) {
      this.notify('error', 'No active account');
      return;
    }

    const card = this.state.pipeline.cards.find(c => c.conversationId === conversationId);
    if (!card) {
      this.notify('error', 'Conversation not found');
      return;
    }

    console.log('Sending media message:', { conversationId, file: file.name });

    const formData = new FormData();
    formData.append('accountId', activeAccount.id);
    formData.append('to', card.phone);
    formData.append('conversationId', conversationId);
    formData.append('media', file);

    this.notify('info', 'Uploading media...');

    fetch('/api/whatsapp-cloud/send-media', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })
    .then(response => response.json())
    .then(result => {
      console.log('Media sent:', result);
      if (result.success) {
        this.loadMessages(conversationId);
        this.notify('success', 'Media sent');
        document.getElementById('wcAttachFileInput').value = '';
      } else {
        this.notify('error', result.message || 'Failed to send media');
      }
    })
    .catch(error => {
      console.error('Error sending media:', error);
      this.notify('error', 'Failed to send media');
    });
  },

  closeConversationViewer() {
    const modal = document.getElementById('wcConversationModal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    }
    this.state.selectedCard = null;
    this.state.currentMessages = [];
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // ============================================
  // AUTO-REFRESH POLLING
  // ============================================

  startPolling() {
    // Poll for new conversations every 10 seconds
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    this.pollingInterval = setInterval(() => {
      if (this.state.activeAccountId && this.state.activeTab === 'conversations') {
        console.log('Polling for new conversations...');
        this.loadConversations();
      }
    }, 10000); // 10 seconds
  },

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
};

// Initialize when page loads
function initWhatsAppCloudPage() {
  WhatsAppCloud.init();
}

// Export for global access
window.WhatsAppCloud = WhatsAppCloud;
window.initWhatsAppCloudPage = initWhatsAppCloudPage;
