/**
 * WhatsApp Cloud Module
 * A comprehensive module for managing WhatsApp Cloud API integration
 * Features: Sales Pipeline, Flow Builder, Mass Campaigns, Multi-Account Connection
 * 
 * @version 2.0.0
 * @author Beloma
 */

const WhatsAppCloud = {
  userMode: false,
  // ============================================
  // STATE MANAGEMENT
  // ============================================
  
  state: {
    // Active tab
    activeTab: 'connection',
    
    // Accounts
    accounts: [],
    activeAccountId: null,
    whatsappWebActive: false,
    readOnly: false,
    hideSidebar: true,
    filters: {
      attended: 'all',
      attendant: ''
    },
    directories: {
      stores: [],
      departments: []
    },
    
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
    dragDropInitialized: false,
    flowConnecting: null,
    flowConnectionTarget: null,
    selectedConnection: null,
    flowConnectionListenersInitialized: false,
    eventListenersInitialized: false,
    flowNodeDragging: null,
    flowCanvasDragging: null,
    flowMinimapDragging: null,
    
    // AI Configurations
    aiConfigs: [],

    // WooCommerce Products
    wooProducts: [],
    
    // Campaigns
    campaigns: [],
    templates: [],
    campaignSource: 'meta',
    campaignAudienceType: 'all',
    campaignFilters: {
      tags: false,
      activity: false,
      optin: false
    },
    campaignGroupIds: [],
    campaignCustomNumbers: '',
    contactGroups: [],
    scheduledCampaigns: [],
    activeApiRestTab: 'overview',
    
    // UI State
    initialized: false,
    loading: false
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
    
    // Load saved state from localStorage (only UI preferences)
    this.loadState();
    this.state.hideSidebar = true;
    
    const cfg = window.TenantConversationsConfig || {};
    this.state.readOnly = !!cfg.readOnly;
    this.state.whatsappWebActive = !!cfg.whatsappWebActive;
    
    // Load real data from backend
    this.loadAccounts();
    this.loadPipelineStages();
    this.loadDirectories();
    this.loadConversations();
    this.loadTemplates();
    this.loadFlows();
    /* FAQ disabled for now
    this.loadFAQs();
    */
    this.loadAiConfigs();
    this.loadWooProducts();
    this.loadContactGroups();
    this.loadScheduledCampaigns();
    
    // Render the UI
    this.render();
    
    // Initialize event listeners
    this.initEventListeners();
    this.checkFacebookCallback();
    
    // Initialize drag and drop
    this.initDragAndDrop();
    
    this.state.initialized = true;
    console.log('✅ WhatsApp Cloud Module initialized');
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
          const allowed = new Set(['flow-builder', 'api-rest', 'campaigns', 'connection']);
          this.state.activeTab = allowed.has(parsed.activeTab) ? parsed.activeTab : 'connection';
        }
        if (parsed.flowZoom) {
          this.state.flowZoom = parsed.flowZoom;
        }
        if (parsed.flowPan) {
          this.state.flowPan = parsed.flowPan;
        }
        // Load activeAccountId but validate it exists when accounts are loaded
        if (parsed.activeAccountId) {
          this.state.activeAccountId = parsed.activeAccountId;
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
    
    // Reset activeAccountId to prevent 404 errors
    this.state.activeAccountId = null;
    this.saveState();
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
        const mapped = result.data.map(acc => {
          const isConnected = String(acc.status || '').toLowerCase() === 'connected' && !!acc.webhook_verified;
          const connectionStatus = isConnected ? 'connected' : (String(acc.status || '').toLowerCase() === 'pending' ? 'pending' : 'disconnected');
          return {
          id: acc.id,
          name: acc.account_name,
          phoneNumber: acc.phone_number,
          phoneNumberId: acc.phone_number_id,
          wabaId: acc.waba_id,
          status: acc.status,
          isDefault: acc.is_default,
          webhookStatus: acc.webhook_verified ? 'verified' : 'pending',
          verifyToken: acc.verify_token || '',
          templateSyncStatus: acc.templates_count > 0 || acc.templates_synced_at ? 'synced' : 'pending',
          connectionStatus
          };
        });
        this.state.accounts = mapped;
        this.state.whatsappWebActive = false;
        
        // Validate activeAccountId from localStorage
        const savedActiveId = this.state.activeAccountId;
        const accountExists = savedActiveId && this.state.accounts.find(a => String(a.id) === String(savedActiveId));
        
        if (accountExists) {
          // Keep the saved activeAccountId if it exists
          this.state.activeAccountId = savedActiveId;
        } else {
          // Set active account to default or first account if saved ID doesn't exist
          const defaultAccount = this.state.accounts.find(a => a.isDefault && a.connectionStatus === 'connected');
          if (defaultAccount) {
            this.state.activeAccountId = defaultAccount.id;
          } else {
            const firstConnected = this.state.accounts.find(a => a.connectionStatus === 'connected');
            if (firstConnected) {
              this.state.activeAccountId = firstConnected.id;
            } else if (this.state.accounts.length > 0) {
              this.state.activeAccountId = this.state.accounts[0].id;
            } else {
              this.state.activeAccountId = null;
            }
          }
        }
        
        this.saveState();
        this.render();
        /* FAQ disabled for now
        this.loadFAQs();
        */
      }
    })
    .catch(error => {
      console.error('Error loading accounts:', error);
    });
  },

  loadPipelineStages() {
    // Load pipeline stages from backend
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('No auth token found');
      return;
    }

    const url = this.userMode ? '/api/user/whatsapp-cloud/pipeline-stages' : '/api/admin/pipeline-stages';
    fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => response.json())
    .then(result => {
      if (result.success && result.data) {
        this.state.pipeline.stages = result.data.map(stage => ({
          id: stage.stage_key,
          name: stage.stage_name,
          icon: stage.icon || 'fas fa-circle',
          color: stage.color || '#6b7280'
        }));
        
        console.log(`✅ Loaded ${this.state.pipeline.stages.length} pipeline stages`);
        this.render();
      }
    })
    .catch(error => {
      console.error('Error loading pipeline stages:', error);
      // Keep default stages if loading fails
      console.log('Using default pipeline stages');
    });
  },

  loadConversations() {
    // Load conversations from backend
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('No auth token found');
      return;
    }

    const isWeb = this.state.whatsappWebActive || this.state.activeAccountId === '__web__';
    let url;
    if (this.userMode) {
      url = isWeb ? '/api/user/whatsapp-cloud/web-conversations' : '/api/user/whatsapp-cloud/conversations';
      if (!isWeb && this.state.activeAccountId) {
        const params = new URLSearchParams({ accountId: this.state.activeAccountId });
        url = `${url}?${params.toString()}`;
      }
    } else {
      url = isWeb ? '/api/tenant/conversations' : '/api/whatsapp-cloud/conversations';
    }
    fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true'
      }
    })
    .then(response => response.json())
    .then(result => {
      if (result.success && result.data) {
        const data = result.data;
        this.state.pipeline.cards = (data || []).map(conv => {
          const name = conv.contact_name || conv.name || conv.phone_number || conv.phone || 'Unknown';
          const phone = conv.contact_phone || conv.phone_number || conv.phone || '';
          const avatar = conv.contact_profile_pic || conv.profile_pic || conv.avatar || null;
          const lastMessage = conv.last_message_text || conv.last_message || '';
          const timestamp = conv.last_message_time || conv.last_message_at || conv.updated_at || conv.timestamp || Date.now();
          const stageId = conv.stage_id || conv.pipeline_stage || 'unassigned';
          const tags = conv.tags ? (Array.isArray(conv.tags) ? conv.tags : (() => { try { return JSON.parse(conv.tags); } catch(e){ return []; } })()) : [];
          return {
            id: conv.id,
            name,
            phone,
            avatar,
            lastMessage,
            timestamp,
            stageId,
            account: conv.account_name || 'Inbox',
            claimed_by: conv.claimed_by_name || null,
            storeId: conv.store_id || conv.storeId || null,
            departmentId: conv.department_id || conv.departmentId || null,
            tags
          };
        });
        
        console.log(`✅ Loaded ${this.state.pipeline.cards.length} conversations`);
      }
    })
    .catch(error => {
      console.error('Error loading conversations:', error);
    });
  },

  loadTemplates() {
    const token = localStorage.getItem('token');
    const accountId = this.state.activeAccountId && this.state.activeAccountId !== '__web__'
      ? this.state.activeAccountId
      : null;
    
    // Validate that accountId exists in our accounts list
    const accountExists = accountId && this.state.accounts.find(a => String(a.id) === String(accountId));
    
    if (!token || !accountId || !accountExists) {
      this.state.templates = [];
      return;
    }
    return fetch(`/api/whatsapp-cloud/accounts/${accountId}/templates`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data && Array.isArray(res.data.templates)) {
          this.state.templates = res.data.templates.map(t => ({
            id: t.id,
            name: t.name,
            language: t.language,
            status: (t.status || '').toLowerCase(),
            category: t.category,
            header: t.header ? { text: t.header } : (t.components?.find(c => c.type === 'HEADER') ? { text: t.components.find(c => c.type === 'HEADER').text || '' } : null),
            body: t.body || '',
            footer: t.footer || '',
            buttons: t.buttons || []
          }));
        } else {
          this.state.templates = [];
        }
        if (this.state.activeTab === 'campaigns') {
          this.renderWorkspace();
        }
      })
      .catch(() => {
        this.state.templates = [];
        if (this.state.activeTab === 'campaigns') {
          this.renderWorkspace();
        }
      });
  },

  loadContactGroups() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.state.contactGroups = [];
      return;
    }
    return fetch('/api/tenant/contact-groups', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          this.state.contactGroups = res.data;
        } else {
          this.state.contactGroups = [];
        }
        if (this.state.activeTab === 'campaigns') {
          this.renderWorkspace();
        }
      })
      .catch(() => {
        this.state.contactGroups = [];
      });
  },

  loadScheduledCampaigns() {
    const token = localStorage.getItem('token');
    const accountId = this.state.activeAccountId;
    if (!token || !accountId) {
      this.state.scheduledCampaigns = [];
      return;
    }
    const params = new URLSearchParams({ status: 'scheduled', accountId });
    return fetch(`/api/whatsapp-cloud/campaigns?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          this.state.scheduledCampaigns = res.data;
        } else {
          this.state.scheduledCampaigns = [];
        }
        if (this.state.activeTab === 'campaigns') {
          this.renderWorkspace();
        }
      })
      .catch(() => {
        this.state.scheduledCampaigns = [];
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
      return Promise.resolve([]);
    }
    return fetch('/api/tenant/ai-config/settings', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true'
      }
    })
      .then(res => res.json())
      .then(result => {
        if (result && result.success && Array.isArray(result.data)) {
          this.state.aiConfigs = result.data;
        } else {
          this.state.aiConfigs = [];
        }
        return this.state.aiConfigs;
      })
      .catch(() => {
        this.state.aiConfigs = [];
        return [];
      });
  },

  loadWooProducts() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.state.wooProducts = [];
      return Promise.resolve([]);
    }
    return fetch('/api/tenant/woocommerce/products', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true'
      }
    })
      .then(res => res.json())
      .then(result => {
        if (result && result.success && Array.isArray(result.data)) {
          this.state.wooProducts = result.data;
        } else {
          this.state.wooProducts = [];
        }
        return this.state.wooProducts;
      })
      .catch(() => {
        this.state.wooProducts = [];
        return [];
      });
  },

  loadFAQs() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.state.faqs = [];
      return;
    }
    const accountId = this.state.activeAccountId;
    const params = new URLSearchParams();
    if (accountId) {
      params.set('accountId', accountId);
    }
    const url = `/api/user/whatsapp-cloud/faqs${params.toString() ? `?${params.toString()}` : ''}`;
    return fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true'
      }
    })
      .then(res => res.json())
      .then(result => {
        if (result.success && Array.isArray(result.data)) {
          this.state.faqs = result.data.map(faq => this.normalizeFaq(faq));
        } else {
          this.state.faqs = [];
        }
        if (this.state.activeTab === 'faq') {
          this.renderWorkspace();
        }
      })
      .catch(() => {
        this.state.faqs = [];
        if (this.state.activeTab === 'faq') {
          this.renderWorkspace();
        }
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
        ${this.state.hideSidebar ? '' : `
        <div class="wc-internal-sidebar" id="wcInternalSidebar">
          ${this.renderInternalSidebar()}
        </div>
        `}
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
    const activeAccount = accounts.find(a => String(a.id) === String(this.state.activeAccountId));

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
            <span class="wc-sidebar-account-status ${activeAccount.connectionStatus || activeAccount.status}">${activeAccount.connectionStatus || activeAccount.status}</span>
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
        <input type="text" id="wcSidebarSearch" data-i18n-placeholder="conversations.search_placeholder" placeholder="Search conversations...">
      </div>
      
      <div class="wc-sidebar-filters">
        <div class="wc-filter-item">
          <label data-i18n="conversations.status">Status</label>
          <select id="wcAttendedFilter">
            <option value="all" data-i18n="conversations.all_status">All</option>
            <option value="attended" data-i18n="conversations.status_attended">Attended</option>
            <option value="unassigned" data-i18n="conversations.status_unassigned">Unassigned</option>
          </select>
        </div>
        <div class="wc-filter-item">
          <label data-i18n="chat.attendant">Attendant</label>
          <input type="text" id="wcAttendantFilter" data-i18n-placeholder="chat.attendant_placeholder" placeholder="Attendant name" value="${this.state.filters.attendant}">
        </div>
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
    const cards = this.getFilteredCards();
    
    if (cards.length === 0) {
      return `
        <div class="wc-sidebar-empty">
          <i class="fas fa-comments"></i>
          <h4 data-i18n="conversations.no_conversations">No conversations</h4>
          <p data-i18n="conversations.no_conversations_desc">New conversations will appear here</p>
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
      { id: 'flow-builder', icon: 'fas fa-project-diagram', label: this.t('whatsapp_cloud.tab_flow_builder', 'Flow Builder') },
      { id: 'api-rest', icon: 'fas fa-code', label: this.t('whatsapp_cloud.tab_api_rest', 'API Rest') },
      { id: 'campaigns', icon: 'fas fa-bullhorn', label: this.t('whatsapp_cloud.tab_campaigns', 'Campaigns') },
      { id: 'connection', icon: 'fas fa-plug', label: this.t('whatsapp_cloud.tab_connection', 'Connection') }
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
      <div class="wc-tab-panel ${this.state.activeTab === 'flow-builder' ? 'active' : ''}" data-panel="flow-builder">
        ${this.state.flowEditorMode ? this.renderFlowEditor() : this.renderFlowList()}
      </div>
      <div class="wc-tab-panel ${this.state.activeTab === 'api-rest' ? 'active' : ''}" data-panel="api-rest">
        ${this.renderApiRestTabV2()}
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

  formatDateTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
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
            <h2 class="wc-pipeline-title">Sales Pipeline</h2>
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
            <span class="wc-pipeline-column-count">${this.getFilteredCards(cards).length}</span>
          </div>
          <button class="wc-pipeline-column-menu" data-stage-id="${stage.id}">
            <i class="fas fa-ellipsis-h"></i>
          </button>
        </div>
        <div class="wc-pipeline-column-body" data-stage-id="${stage.id}">
          ${this.getFilteredCards(cards).map(card => this.renderPipelineCard(card)).join('')}
        </div>
      </div>
    `;
  },

  renderPipelineCard(card) {
    return `
      <div class="wc-pipeline-card" draggable="true" data-card-id="${card.id}">
        <div class="wc-pipeline-card-top">
          <span class="wc-pipeline-card-attendant">${this.getAttendantLabel(card)}</span>
        </div>
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
    const activeAccount = this.state.accounts.find(a => String(a.id) === String(this.state.activeAccountId));

    return `
      <div class="wc-flow-list-container">
        <div class="wc-flow-list-header">
          <div>
            <h2 class="wc-flow-list-title">${this.t('whatsapp_cloud.flow_title', 'Automations')}</h2>
            <p class="wc-flow-list-subtitle">${this.t('whatsapp_cloud.flow_subtitle', 'Manage your conversation flows')}</p>
          </div>
          <button class="btn btn-primary" id="wcNewFlowBtn">
            <i class="fas fa-plus"></i>
            <span>${this.t('whatsapp_cloud.flow_new_automation', 'New Automation')}</span>
          </button>
        </div>
        
        ${flows.length === 0 ? `
          <div class="wc-flow-empty">
            <div class="wc-flow-empty-icon">
              <i class="fas fa-project-diagram"></i>
            </div>
            <h3>${this.t('whatsapp_cloud.flow_no_flows', 'No automations yet')}</h3>
            <p>${this.t('whatsapp_cloud.flow_no_flows_desc', 'Create your first automation to get started')}</p>
            <button class="btn btn-primary" id="wcNewFlowBtnEmpty">
              <i class="fas fa-plus"></i>
              <span>${this.t('whatsapp_cloud.flow_create_automation', 'Create Automation')}</span>
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
    const triggerTypeRaw = flow.trigger || 'keyword';
    const triggerValueRaw = (flow.triggerValue || '').trim();
    const triggerType = triggerValueRaw === '*' ? 'any' : triggerTypeRaw;
    const triggerTypeLabel = triggerType === 'welcome'
      ? this.t('whatsapp_cloud.flow_trigger_welcome', 'Welcome')
      : triggerType === 'any'
        ? this.t('whatsapp_cloud.flow_trigger_any', 'Any')
        : this.t('whatsapp_cloud.flow_trigger_keyword', 'Keyword');
    const triggerLabel = triggerType === 'welcome'
      ? this.t('whatsapp_cloud.flow_welcome_label', 'Welcome')
      : triggerType === 'any'
        ? '*'
        : (triggerValueRaw || this.t('whatsapp_cloud.flow_any', 'Any'));
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
              ${triggerTypeLabel}: ${triggerLabel}
            </p>
          </div>
          <label class="wc-flow-card-toggle">
            <input type="checkbox" ${flow.active ? 'checked' : ''} data-flow-id="${flow.id}">
            <span class="wc-toggle-slider"></span>
          </label>
        </div>
        <div class="wc-flow-card-body">
          <p class="wc-flow-card-description">${flow.description || this.t('whatsapp_cloud.flow_no_description', 'No description')}</p>
          <div class="wc-flow-card-stats">
            <span><i class="fas fa-cube"></i> ${flow.nodes?.length || 0} ${this.t('whatsapp_cloud.flow_nodes_label', 'nodes')}</span>
            <span><i class="fas fa-link"></i> ${flow.connections?.length || 0} ${this.t('whatsapp_cloud.flow_connections_label', 'connections')}</span>
          </div>
        </div>
        <div class="wc-flow-card-footer">
          <button class="btn btn-secondary btn-sm" data-action="edit" data-flow-id="${flow.id}">
            <i class="fas fa-edit"></i>
            <span>${this.t('whatsapp_cloud.flow_edit_flow', 'Edit Flow')}</span>
          </button>
          <button class="btn btn-danger-outline btn-sm" data-action="delete" data-flow-id="${flow.id}">
            <i class="fas fa-trash"></i>
            <span>${this.t('common.delete', 'Delete')}</span>
          </button>
        </div>
      </div>
    `;
  },

  renderFlowEditor() {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    if (!flow) return '';

    const nodeTypes = [
      { type: 'send_message', icon: 'fas fa-comment', label: this.t('whatsapp_cloud.flow_node_send_message', 'Send Message'), color: '#3b82f6' },
      { type: 'send_media', icon: 'fas fa-image', label: this.t('whatsapp_cloud.flow_node_send_media', 'Send Media'), color: '#8b5cf6' },
      { type: 'button_message', icon: 'fas fa-hand-pointer', label: this.t('whatsapp_cloud.flow_node_button_message', 'Button Message'), color: '#ec4899' },
      { type: 'list_message', icon: 'fas fa-list', label: this.t('whatsapp_cloud.flow_node_list_message', 'List Message'), color: '#14b8a6' },
      { type: 'cta_message', icon: 'fas fa-external-link-alt', label: this.t('whatsapp_cloud.flow_node_cta', 'Call to Action (CTA)'), color: '#f97316' },
      { type: 'menu_options', icon: 'fas fa-bars', label: this.t('whatsapp_cloud.flow_node_menu_options', 'Menu Options'), color: '#6366f1' },
      { type: 'ai_control', icon: 'fas fa-robot', label: this.t('whatsapp_cloud.flow_node_ai_control', 'AI Control'), color: '#a855f7' },
      { type: 'products', icon: 'fas fa-box', label: this.t('whatsapp_cloud.flow_node_products', 'WooCommerce Products'), color: '#f59e0b' },
      { type: 'transfer', icon: 'fas fa-random', label: this.t('whatsapp_cloud.flow_node_transfer', 'Transfer'), color: '#0ea5e9' },
      { type: 'delay', icon: 'fas fa-clock', label: this.t('whatsapp_cloud.flow_node_delay', 'Wait / Delay'), color: '#6b7280' },
      { type: 'end_chat', icon: 'fas fa-stop-circle', label: this.t('whatsapp_cloud.flow_node_end_chat', 'End Chat'), color: '#22c55e' }
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
              <span class="wc-flow-editor-id">${this.t('whatsapp_cloud.flow_id_label', 'ID')}: ${flow.id}</span>
              <span class="wc-flow-editor-status ${flow.active ? 'active' : 'inactive'}">
                ${flow.active ? this.t('whatsapp_cloud.status_active', 'Active') : this.t('whatsapp_cloud.status_paused', 'Paused')}
              </span>
            </div>
          </div>
          <div class="wc-flow-editor-header-right">
            <button class="btn btn-secondary" id="wcFlowSettingsBtn">
              <i class="fas fa-sliders-h"></i>
              <span>${this.t('whatsapp_cloud.flow_settings', 'Flow Settings')}</span>
            </button>
            <button class="btn btn-secondary" id="wcFlowPauseBtn">
              <i class="fas fa-pause"></i>
              <span>${this.t('whatsapp_cloud.flow_pause', 'Pause')}</span>
            </button>
            <button class="btn btn-primary" id="wcFlowSaveBtn">
              <i class="fas fa-save"></i>
              <span>${this.t('whatsapp_cloud.flow_save', 'Save Flow')}</span>
            </button>
          </div>
        </div>
        
        <div class="wc-flow-editor-body">
          <div class="wc-flow-editor-sidebar">
            <div class="wc-flow-editor-sidebar-header">
              <h4>${this.t('whatsapp_cloud.flow_components', 'Components')}</h4>
              <p>${this.t('whatsapp_cloud.flow_components_hint', 'Drag and drop to canvas')}</p>
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
            <div class="wc-flow-canvas-inner" id="wcFlowCanvasInner" style="transform: translate(${this.state.flowPan.x}px, ${this.state.flowPan.y}px) scale(${this.state.flowZoom})">
              <svg class="wc-flow-connections" id="wcFlowConnections">
                ${this.renderFlowConnections(flow)}
              </svg>
              ${this.renderFlowNodes(flow.nodes)}
            </div>
            <div class="wc-flow-minimap" id="wcFlowMinimap">
              <div class="wc-flow-minimap-canvas" id="wcFlowMinimapCanvas"></div>
              <div class="wc-flow-minimap-viewport" id="wcFlowMinimapViewport"></div>
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
          <p>${this.t('whatsapp_cloud.flow_canvas_empty', 'Drag components here to build your flow')}</p>
        </div>
      `;
    }

    const neutralColor = '#d1d5db';
    const nodeColors = {
      'send_message': neutralColor,
      'send_media': neutralColor,
      'button_message': neutralColor,
      'list_message': neutralColor,
      'cta_message': neutralColor,
      'menu_options': neutralColor,
      'collect_input': neutralColor,
      'save_contact': neutralColor,
      'update_contact': neutralColor,
      'ai_control': neutralColor,
      'products': neutralColor,
      'transfer': neutralColor,
      'condition': neutralColor,
      'delay': neutralColor,
      'webhook': neutralColor,
      'assign_agent': neutralColor,
      'add_tag': neutralColor,
      'move_stage': neutralColor,
      'end_chat': neutralColor
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
      'products': 'fas fa-box',
      'transfer': 'fas fa-random',
      'condition': 'fas fa-code-branch',
      'delay': 'fas fa-clock',
      'webhook': 'fas fa-globe',
      'assign_agent': 'fas fa-user-tie',
      'add_tag': 'fas fa-tag',
      'move_stage': 'fas fa-arrows-alt',
      'end_chat': 'fas fa-stop-circle'
    };

    return nodes.map(node => `
      <div class="wc-flow-node ${this.state.selectedNode === node.id ? 'selected' : ''}" 
           data-node-id="${node.id}" 
           data-type="${node.type}"
           style="left: ${node.x}px; top: ${node.y}px; border-color: ${nodeColors[node.type] || '#d1d5db'}">
        <div class="wc-flow-node-header">
          <i class="${nodeIcons[node.type] || 'fas fa-cube'}"></i>
          <span>${this.getNodeLabel(node.type)}</span>
        </div>
        ${this.renderFlowNodeBody(node)}
        ${this.renderFlowNodeConnectors(node)}
      </div>
    `).join('');
  },

  renderFlowNodeBody(node) {
    const summary = this.truncate(this.getNodeSummary(node) || this.t('whatsapp_cloud.flow_click_configure', 'Click to configure'), 60);
    if (node.type !== 'button_message') {
      return `
        <div class="wc-flow-node-body">
          <p>${summary}</p>
          ${node.config?.saveAs ? '<span class="wc-flow-node-var">SAVE TO: {{' + node.config.saveAs + '}}</span>' : ''}
        </div>
      `;
    }

    const buttons = node.config?.buttons || [];
    const buttonsHtml = buttons.length > 0
      ? `
        <div class="wc-flow-node-buttons">
          ${buttons.map((button, index) => `
            <div class="wc-flow-node-button">${button.text || `${this.t('whatsapp_cloud.flow_button_label', 'Button')} ${index + 1}`}</div>
          `).join('')}
        </div>
      `
      : '';
    return `
      <div class="wc-flow-node-body">
        <p>${summary}</p>
        ${buttonsHtml}
      </div>
    `;
  },

  renderFlowNodeConnectors(node) {
    const buttons = node.config?.buttons || [];
    const outputConnectors = node.type === 'button_message'
      ? buttons.map((_, index) => `
          <div class="wc-flow-node-connector output" data-connector="output" data-handle="button-${index}" style="top: ${this.getButtonConnectorOffset(index)}px;"></div>
        `).join('')
      : `<div class="wc-flow-node-connector output" data-connector="output" data-handle="default"></div>`;

    return `
      <div class="wc-flow-node-connectors">
        <div class="wc-flow-node-connector input" data-connector="input" data-handle="default"></div>
        ${outputConnectors}
      </div>
    `;
  },

  getNodeLabel(type) {
    const labels = {
      'send_message': this.t('whatsapp_cloud.flow_node_send_message', 'Send Message'),
      'send_media': this.t('whatsapp_cloud.flow_node_send_media', 'Send Media'),
      'button_message': this.t('whatsapp_cloud.flow_node_button_message', 'Button Message'),
      'list_message': this.t('whatsapp_cloud.flow_node_list_message', 'List Message'),
      'cta_message': this.t('whatsapp_cloud.flow_node_cta', 'Call to Action (CTA)'),
      'menu_options': this.t('whatsapp_cloud.flow_node_menu_options', 'Menu Options'),
      'collect_input': this.t('whatsapp_cloud.flow_node_collect_input', 'Collect Input'),
      'save_contact': this.t('whatsapp_cloud.flow_node_save_contact', 'Save Contact'),
      'update_contact': this.t('whatsapp_cloud.flow_node_update_contact', 'Update Contact'),
      'ai_control': this.t('whatsapp_cloud.flow_node_ai_control', 'AI Control'),
      'products': this.t('whatsapp_cloud.flow_node_products', 'WooCommerce Products'),
      'transfer': this.t('whatsapp_cloud.flow_node_transfer', 'Transfer'),
      'condition': this.t('whatsapp_cloud.flow_node_conditions', 'Conditions'),
      'delay': this.t('whatsapp_cloud.flow_node_delay', 'Wait / Delay'),
      'webhook': this.t('whatsapp_cloud.flow_node_webhook', 'Webhook'),
      'assign_agent': this.t('whatsapp_cloud.flow_node_assign_agent', 'Assign Agent'),
      'add_tag': this.t('whatsapp_cloud.flow_node_add_tag', 'Add Tag'),
      'move_stage': this.t('whatsapp_cloud.flow_node_move_stage', 'Move Stage'),
      'end_chat': this.t('whatsapp_cloud.flow_node_end_chat', 'End Chat')
    };
    return labels[type] || type;
  },

  getNodeDescription(type) {
    const descriptions = {
      'send_message': this.t('whatsapp_cloud.flow_desc_send_message', 'Send a plain text message to the user.'),
      'send_media': this.t('whatsapp_cloud.flow_desc_send_media', 'Send an image, video, audio, or document.'),
      'button_message': this.t('whatsapp_cloud.flow_desc_button_message', 'Send a message with up to 3 quick reply buttons.'),
      'list_message': this.t('whatsapp_cloud.flow_desc_list_message', 'Send a structured list with selectable options.'),
      'cta_message': this.t('whatsapp_cloud.flow_desc_cta', 'Send a message with a call-to-action button.'),
      'menu_options': this.t('whatsapp_cloud.flow_desc_menu_options', 'Offer a menu with multiple options.'),
      'collect_input': this.t('whatsapp_cloud.flow_desc_collect_input', 'Capture a response and save it to a variable.'),
      'save_contact': this.t('whatsapp_cloud.flow_desc_save_contact', 'Create a new contact record from variables.'),
      'update_contact': this.t('whatsapp_cloud.flow_desc_update_contact', 'Update an existing contact with new values.'),
      'ai_control': this.t('whatsapp_cloud.flow_desc_ai_control', 'Control AI behavior for the next steps.'),
      'products': this.t('whatsapp_cloud.flow_desc_products', 'Send WooCommerce products to the customer.'),
      'transfer': this.t('whatsapp_cloud.flow_desc_transfer', 'Transfer the conversation to a store or department.'),
      'condition': this.t('whatsapp_cloud.flow_desc_conditions', 'Branch the flow based on a condition.'),
      'delay': this.t('whatsapp_cloud.flow_desc_delay', 'Wait for a specified amount of time.'),
      'webhook': this.t('whatsapp_cloud.flow_desc_webhook', 'Call an external URL with payload data.'),
      'assign_agent': this.t('whatsapp_cloud.flow_desc_assign_agent', 'Assign the conversation to a specific agent.'),
      'add_tag': this.t('whatsapp_cloud.flow_desc_add_tag', 'Add a tag to the conversation.'),
      'move_stage': this.t('whatsapp_cloud.flow_desc_move_stage', 'Move the conversation to a different stage.'),
      'end_chat': this.t('whatsapp_cloud.flow_desc_end_chat', 'End the chat. The flow starts again when the user sends a new message.')
    };
    return descriptions[type] || '';
  },

  getNodeSummary(node) {
    if (!node) return '';
    if (node.type === 'send_message') return node.config?.message || node.content || '';
    if (node.type === 'send_media') return node.config?.mediaUrl || node.content || '';
    if (node.type === 'button_message') return node.config?.message || node.content || '';
    if (node.type === 'list_message') return node.config?.body || node.content || '';
    if (node.type === 'cta_message') return node.config?.body || node.content || '';
    if (node.type === 'menu_options') return node.config?.prompt || node.content || '';
    if (node.type === 'collect_input') return node.config?.prompt || node.content || '';
    if (node.type === 'save_contact') return node.config?.nameVariable || '';
    if (node.type === 'update_contact') return node.config?.nameVariable || '';
    if (node.type === 'ai_control') return node.config?.prompt || node.config?.instructions || '';
    if (node.type === 'products') return node.config?.productIds || '';
    if (node.type === 'transfer') return node.config?.targetType ? `${node.config.targetType}` : '';
    if (node.type === 'end_chat') return this.t('whatsapp_cloud.flow_end_chat_summary', 'Ends the chat. The flow starts again when the user sends a new message.');
    return node.content || '';
  },

  renderFlowSection(title, content) {
    return `
      <div class="wc-flow-properties-section">
        <div class="wc-flow-properties-section-title">${title}</div>
        ${content}
      </div>
    `;
  },

  renderFlowInput({ id, label, value = '', placeholder = '', help = '', type = 'text' }) {
    return `
      <div class="wc-flow-properties-field">
        <label class="wc-flow-properties-label" for="${id}">${label}</label>
        <input type="${type}" class="wc-flow-properties-input" id="${id}" value="${value || ''}" placeholder="${placeholder}">
        ${help ? `<div class="wc-flow-properties-help">${help}</div>` : ''}
      </div>
    `;
  },

  renderFlowTextarea({ id, label, value = '', placeholder = '', help = '', rows = 4 }) {
    return `
      <div class="wc-flow-properties-field">
        <label class="wc-flow-properties-label" for="${id}">${label}</label>
        <textarea class="wc-flow-properties-textarea" id="${id}" rows="${rows}" placeholder="${placeholder}">${value || ''}</textarea>
        ${help ? `<div class="wc-flow-properties-help">${help}</div>` : ''}
      </div>
    `;
  },

  renderFlowSelect({ id, label, value = '', options = [], help = '' }) {
    return `
      <div class="wc-flow-properties-field">
        <label class="wc-flow-properties-label" for="${id}">${label}</label>
        <select class="wc-flow-properties-select" id="${id}">
          ${options.map(option => `
            <option value="${option.value}" ${String(option.value) === String(value) ? 'selected' : ''}>${option.label}</option>
          `).join('')}
        </select>
        ${help ? `<div class="wc-flow-properties-help">${help}</div>` : ''}
      </div>
    `;
  },

  renderFlowRepeater({ title, addLabel, actionAdd, itemsHtml, countLabel, maxCount, disabled = false }) {
    return `
      <div class="wc-flow-properties-section">
        <div class="wc-flow-properties-section-title wc-flow-properties-repeater-header">
          <span>${title}</span>
          <button class="wc-flow-properties-add-btn" data-flow-action="${actionAdd}" ${maxCount ? 'data-max-count="' + maxCount + '"' : ''} ${disabled ? 'disabled' : ''}>
            <i class="fas fa-plus"></i>
            <span>${addLabel}</span>
          </button>
        </div>
        ${countLabel ? `<div class="wc-flow-properties-help">${countLabel}</div>` : ''}
        <div class="wc-flow-properties-repeater-list">
          ${itemsHtml}
        </div>
      </div>
    `;
  },

  renderFlowRepeaterItem({ title, index, removeAction, content }) {
    return `
      <div class="wc-flow-properties-item">
        <div class="wc-flow-properties-item-header">
          <span>${title} ${index + 1}</span>
          <button class="wc-flow-properties-icon-btn" data-flow-action="${removeAction}" data-index="${index}">
            <i class="fas fa-trash"></i>
          </button>
        </div>
        ${content}
      </div>
    `;
  },

  renderFlowConnections(flow) {
    if (!flow.connections || flow.connections.length === 0) return '';
    
    return flow.connections.map(conn => {
      const fromNode = flow.nodes.find(n => n.id === conn.from);
      const toNode = flow.nodes.find(n => n.id === conn.to);
      
      if (!fromNode || !toNode) return '';
      
      const handle = conn.fromHandle || 'default';
      const startPoint = this.getNodeOutputPoint(fromNode, handle);
      const endPoint = this.getNodeInputPoint(toNode);
      const x1 = startPoint.x;
      const y1 = startPoint.y;
      const x2 = endPoint.x;
      const y2 = endPoint.y;
      const direction = x2 >= x1 ? 1 : -1;
      const curveOffset = Math.max(80, Math.abs(x2 - x1) * 0.5);
      const c1x = x1 + curveOffset * direction;
      const c2x = x2 - curveOffset * direction;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const isSelected = this.state.selectedConnection
        && this.state.selectedConnection.from === conn.from
        && this.state.selectedConnection.to === conn.to
        && (this.state.selectedConnection.handle || 'default') === handle;
      
      return `
        <g class="wc-flow-connection-group${isSelected ? ' selected' : ''}" data-from="${conn.from}" data-to="${conn.to}" data-handle="${handle}">
          <path class="wc-flow-connection-line" data-from="${conn.from}" data-to="${conn.to}" data-handle="${handle}"
                d="M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}"/>
          <g class="wc-flow-connection-delete" transform="translate(${midX}, ${midY})">
            <circle class="wc-flow-connection-delete-circle" r="10"></circle>
            <text class="wc-flow-connection-delete-text" text-anchor="middle" dominant-baseline="central">×</text>
          </g>
        </g>
      `;
    }).join('');
  },

  renderFlowProperties() {
    if (!this.state.selectedNode) {
      return `
        <div class="wc-flow-properties-empty">
          <i class="fas fa-mouse-pointer"></i>
          <h4>${this.t('whatsapp_cloud.flow_select_node_title', 'Select a node to edit')}</h4>
          <p>${this.t('whatsapp_cloud.flow_select_node_desc', 'Click on a node in the canvas to view and edit its properties')}</p>
        </div>
      `;
    }

    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    const node = flow?.nodes?.find(n => n.id === this.state.selectedNode);
    
    if (!node) return '';

    const buttons = node.config?.buttons || [];
    const listItems = node.config?.items || [];
    const menuOptions = node.config?.options || [];
    const transferType = node.config?.targetType || 'store';
    const transferTargets = transferType === 'department' ? this.state.directories.departments : this.state.directories.stores;
    const transferOptions = transferTargets.length > 0
      ? transferTargets.map(item => ({ value: item.id, label: item.name || item.title || `${item.id}` }))
      : [{ value: '', label: this.t('conversations.no_options', 'No options available') }];

    const sections = [];

    if (node.type === 'send_message') {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_message', 'Message'),
        this.renderFlowTextarea({
          id: 'wcNodeMessage',
          label: this.t('whatsapp_cloud.flow_field_message', 'Message'),
          value: node.config?.message || '',
          placeholder: this.t('whatsapp_cloud.flow_field_message_placeholder', 'Enter your message...')
        }) +
        this.renderFlowInput({
          id: 'wcNodeFooter',
          label: this.t('whatsapp_cloud.flow_field_footer', 'Footer (Optional)'),
          value: node.config?.footer || '',
          placeholder: this.t('whatsapp_cloud.flow_field_footer_placeholder', 'Enter footer text')
        })
      ));
    }

    if (node.type === 'send_media') {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_media', 'Media'),
        this.renderFlowSelect({
          id: 'wcNodeMediaType',
          label: this.t('whatsapp_cloud.flow_field_media_type', 'Media Type'),
          value: node.config?.mediaType || 'image',
          options: [
            { value: 'image', label: this.t('whatsapp_cloud.flow_media_image', 'Image') },
            { value: 'video', label: this.t('whatsapp_cloud.flow_media_video', 'Video') },
            { value: 'audio', label: this.t('whatsapp_cloud.flow_media_audio', 'Audio') },
            { value: 'document', label: this.t('whatsapp_cloud.flow_media_document', 'Document') }
          ]
        }) +
        this.renderFlowInput({
          id: 'wcNodeMediaUrl',
          label: this.t('whatsapp_cloud.flow_field_media_url', 'Media URL'),
          value: node.config?.mediaUrl || '',
          placeholder: this.t('whatsapp_cloud.flow_field_media_url_placeholder', 'https://example.com/file')
        }) +
        this.renderFlowTextarea({
          id: 'wcNodeCaption',
          label: this.t('whatsapp_cloud.flow_field_caption', 'Caption (Optional)'),
          value: node.config?.caption || '',
          placeholder: this.t('whatsapp_cloud.flow_field_caption_placeholder', 'Enter a caption')
        })
      ));
    }

    if (node.type === 'button_message') {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_message', 'Message'),
        this.renderFlowTextarea({
          id: 'wcNodeMessage',
          label: this.t('whatsapp_cloud.flow_field_message', 'Message'),
          value: node.config?.message || '',
          placeholder: this.t('whatsapp_cloud.flow_field_message_placeholder', 'Enter your message...')
        }) +
        this.renderFlowInput({
          id: 'wcNodeFooter',
          label: this.t('whatsapp_cloud.flow_field_footer', 'Footer (Optional)'),
          value: node.config?.footer || '',
          placeholder: this.t('whatsapp_cloud.flow_field_footer_placeholder', 'Enter footer text')
        })
      ));

      const buttonItemsHtml = buttons.map((btn, index) => this.renderFlowRepeaterItem({
        title: this.t('whatsapp_cloud.flow_button_label', 'Button'),
        index,
        removeAction: 'remove-button',
        content: this.renderFlowInput({
          id: `wcNodeButtonText_${index}`,
          label: this.t('whatsapp_cloud.flow_field_button_text', 'Button Text'),
          value: btn.text || '',
          placeholder: this.t('whatsapp_cloud.flow_field_button_text_placeholder', 'Button text (max 20 characters)')
        }) +
        this.renderFlowInput({
          id: `wcNodeButtonPayload_${index}`,
          label: this.t('whatsapp_cloud.flow_field_button_payload', 'Payload'),
          value: btn.payload || '',
          placeholder: this.t('whatsapp_cloud.flow_field_button_payload_placeholder', 'Payload value')
        })
      })).join('');

      sections.push(this.renderFlowRepeater({
        title: this.t('whatsapp_cloud.flow_field_buttons', 'Buttons'),
        addLabel: this.t('whatsapp_cloud.flow_field_add_button', 'Add Button'),
        actionAdd: 'add-button',
        itemsHtml: buttonItemsHtml,
        countLabel: this.t('whatsapp_cloud.flow_buttons_limit', 'Up to 3 buttons'),
        maxCount: 3,
        disabled: buttons.length >= 3
      }));
    }

    if (node.type === 'list_message') {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_list', 'List Message'),
        this.renderFlowInput({
          id: 'wcNodeHeader',
          label: this.t('whatsapp_cloud.flow_field_header', 'Header (Optional)'),
          value: node.config?.header || '',
          placeholder: this.t('whatsapp_cloud.flow_field_header_placeholder', 'Header text')
        }) +
        this.renderFlowTextarea({
          id: 'wcNodeBody',
          label: this.t('whatsapp_cloud.flow_field_body', 'Body'),
          value: node.config?.body || '',
          placeholder: this.t('whatsapp_cloud.flow_field_body_placeholder', 'Body text')
        }) +
        this.renderFlowInput({
          id: 'wcNodeFooter',
          label: this.t('whatsapp_cloud.flow_field_footer', 'Footer (Optional)'),
          value: node.config?.footer || '',
          placeholder: this.t('whatsapp_cloud.flow_field_footer_placeholder', 'Footer text')
        }) +
        this.renderFlowInput({
          id: 'wcNodeButtonText',
          label: this.t('whatsapp_cloud.flow_field_button_text', 'Button Text'),
          value: node.config?.buttonText || '',
          placeholder: this.t('whatsapp_cloud.flow_field_button_text_placeholder', 'Button text (max 20 characters)')
        })
      ));

      const listItemsHtml = listItems.map((item, index) => this.renderFlowRepeaterItem({
        title: this.t('whatsapp_cloud.flow_list_item_label', 'Item'),
        index,
        removeAction: 'remove-list-item',
        content: this.renderFlowInput({
          id: `wcNodeListTitle_${index}`,
          label: this.t('whatsapp_cloud.flow_field_item_title', 'Item Title'),
          value: item.title || '',
          placeholder: this.t('whatsapp_cloud.flow_field_item_title_placeholder', 'Item title')
        }) +
        this.renderFlowInput({
          id: `wcNodeListDescription_${index}`,
          label: this.t('whatsapp_cloud.flow_field_item_description', 'Item Description'),
          value: item.description || '',
          placeholder: this.t('whatsapp_cloud.flow_field_item_description_placeholder', 'Optional description')
        }) +
        this.renderFlowInput({
          id: `wcNodeListId_${index}`,
          label: this.t('whatsapp_cloud.flow_field_item_id', 'Row ID'),
          value: item.id || '',
          placeholder: this.t('whatsapp_cloud.flow_field_item_id_placeholder', 'Unique row ID')
        })
      })).join('');

      sections.push(this.renderFlowRepeater({
        title: this.t('whatsapp_cloud.flow_field_list_items', 'List Items'),
        addLabel: this.t('whatsapp_cloud.flow_field_add_item', 'Add Item'),
        actionAdd: 'add-list-item',
        itemsHtml: listItemsHtml,
        countLabel: this.t('whatsapp_cloud.flow_list_limit', 'Up to 10 items'),
        maxCount: 10,
        disabled: listItems.length >= 10
      }));
    }

    if (node.type === 'cta_message') {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_message', 'Message'),
        this.renderFlowInput({
          id: 'wcNodeHeader',
          label: this.t('whatsapp_cloud.flow_field_header', 'Header (Optional)'),
          value: node.config?.header || '',
          placeholder: this.t('whatsapp_cloud.flow_field_header_placeholder', 'Header text')
        }) +
        this.renderFlowTextarea({
          id: 'wcNodeBody',
          label: this.t('whatsapp_cloud.flow_field_body', 'Body'),
          value: node.config?.body || '',
          placeholder: this.t('whatsapp_cloud.flow_field_body_placeholder', 'Body text')
        }) +
        this.renderFlowInput({
          id: 'wcNodeFooter',
          label: this.t('whatsapp_cloud.flow_field_footer', 'Footer (Optional)'),
          value: node.config?.footer || '',
          placeholder: this.t('whatsapp_cloud.flow_field_footer_placeholder', 'Footer text')
        })
      ));

      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_action', 'Action'),
        this.renderFlowInput({
          id: 'wcNodeButtonText',
          label: this.t('whatsapp_cloud.flow_field_button_text', 'Button Text'),
          value: node.config?.buttonText || '',
          placeholder: this.t('whatsapp_cloud.flow_field_button_text_placeholder', 'Button text')
        }) +
        this.renderFlowSelect({
          id: 'wcNodeCtaType',
          label: this.t('whatsapp_cloud.flow_field_cta_type', 'CTA Type'),
          value: node.config?.ctaType || 'url',
          options: [
            { value: 'url', label: this.t('whatsapp_cloud.flow_cta_url', 'Website URL') },
            { value: 'phone', label: this.t('whatsapp_cloud.flow_cta_phone', 'Phone Number') }
          ]
        }) +
        this.renderFlowInput({
          id: 'wcNodeCtaValue',
          label: this.t('whatsapp_cloud.flow_field_cta_value', 'CTA Value'),
          value: node.config?.ctaValue || '',
          placeholder: this.t('whatsapp_cloud.flow_field_cta_value_placeholder', 'https:// or +123...')
        })
      ));
    }

    if (node.type === 'menu_options') {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_menu', 'Menu'),
        this.renderFlowTextarea({
          id: 'wcNodePrompt',
          label: this.t('whatsapp_cloud.flow_field_prompt', 'Prompt'),
          value: node.config?.prompt || '',
          placeholder: this.t('whatsapp_cloud.flow_field_prompt_placeholder', 'Enter menu prompt')
        })
      ));

      const menuItemsHtml = menuOptions.map((option, index) => this.renderFlowRepeaterItem({
        title: this.t('whatsapp_cloud.flow_menu_option_label', 'Option'),
        index,
        removeAction: 'remove-menu-option',
        content: this.renderFlowInput({
          id: `wcNodeMenuLabel_${index}`,
          label: this.t('whatsapp_cloud.flow_field_option_label', 'Option Label'),
          value: option.label || '',
          placeholder: this.t('whatsapp_cloud.flow_field_option_label_placeholder', 'Option label')
        }) +
        this.renderFlowInput({
          id: `wcNodeMenuValue_${index}`,
          label: this.t('whatsapp_cloud.flow_field_option_value', 'Option Value'),
          value: option.value || '',
          placeholder: this.t('whatsapp_cloud.flow_field_option_value_placeholder', 'Option value')
        })
      })).join('');

      sections.push(this.renderFlowRepeater({
        title: this.t('whatsapp_cloud.flow_field_menu_options', 'Menu Options'),
        addLabel: this.t('whatsapp_cloud.flow_field_add_option', 'Add Option'),
        actionAdd: 'add-menu-option',
        itemsHtml: menuItemsHtml,
        countLabel: this.t('whatsapp_cloud.flow_menu_limit', 'Up to 10 options'),
        maxCount: 10,
        disabled: menuOptions.length >= 10
      }));
    }

    if (node.type === 'collect_input') {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_prompt', 'Prompt'),
        this.renderFlowTextarea({
          id: 'wcNodePrompt',
          label: this.t('whatsapp_cloud.flow_field_prompt', 'Prompt'),
          value: node.config?.prompt || '',
          placeholder: this.t('whatsapp_cloud.flow_field_prompt_placeholder', 'Ask the user for input')
        })
      ));

      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_capture', 'Capture'),
        this.renderFlowInput({
          id: 'wcNodeSaveAs',
          label: this.t('whatsapp_cloud.flow_field_save_variable', 'Save to Variable'),
          value: node.config?.saveAs || '',
          placeholder: this.t('whatsapp_cloud.flow_field_save_variable_placeholder', 'e.g., name, email')
        }) +
        this.renderFlowSelect({
          id: 'wcNodeInputType',
          label: this.t('whatsapp_cloud.flow_field_input_type', 'Input Type'),
          value: node.config?.inputType || 'text',
          options: [
            { value: 'text', label: this.t('whatsapp_cloud.flow_input_text', 'Text') },
            { value: 'email', label: this.t('whatsapp_cloud.flow_input_email', 'Email') },
            { value: 'phone', label: this.t('whatsapp_cloud.flow_input_phone', 'Phone') },
            { value: 'number', label: this.t('whatsapp_cloud.flow_input_number', 'Number') }
          ]
        })
      ));
    }

    if (node.type === 'save_contact' || node.type === 'update_contact') {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_contact', 'Contact'),
        this.renderFlowInput({
          id: 'wcNodeContactName',
          label: this.t('whatsapp_cloud.flow_field_contact_name_variable', 'Name Variable'),
          value: node.config?.nameVariable || '',
          placeholder: this.t('whatsapp_cloud.flow_field_contact_name_placeholder', '{{name}}')
        }) +
        this.renderFlowInput({
          id: 'wcNodeContactPhone',
          label: this.t('whatsapp_cloud.flow_field_contact_phone_variable', 'Phone Variable'),
          value: node.config?.phoneVariable || '',
          placeholder: this.t('whatsapp_cloud.flow_field_contact_phone_placeholder', '{{phone}}')
        }) +
        this.renderFlowInput({
          id: 'wcNodeContactEmail',
          label: this.t('whatsapp_cloud.flow_field_contact_email_variable', 'Email Variable'),
          value: node.config?.emailVariable || '',
          placeholder: this.t('whatsapp_cloud.flow_field_contact_email_placeholder', '{{email}}')
        }) +
        this.renderFlowInput({
          id: 'wcNodeContactTags',
          label: this.t('whatsapp_cloud.flow_field_contact_tags', 'Tags (Optional)'),
          value: node.config?.tags || '',
          placeholder: this.t('whatsapp_cloud.flow_field_contact_tags_placeholder', 'tag1, tag2')
        })
      ));
    }

    if (node.type === 'ai_control') {
      const aiConfigs = this.state.aiConfigs || [];
      const activeConfig = aiConfigs.find(cfg => cfg.active) || aiConfigs[0];
      const aiOptions = aiConfigs.length > 0
        ? aiConfigs.map(cfg => ({
          value: String(cfg.id),
          label: `${cfg.persona_name || cfg.model_name || cfg.provider} (${cfg.provider})`
        }))
        : [{ value: '', label: this.t('whatsapp_cloud.flow_ai_no_configs', 'No AI configurations available') }];
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_ai', 'AI Control'),
        this.renderFlowSelect({
          id: 'wcNodeAiMode',
          label: this.t('whatsapp_cloud.flow_field_ai_mode', 'Mode'),
          value: node.config?.mode || 'enable',
          options: [
            { value: 'enable', label: this.t('whatsapp_cloud.flow_ai_enable', 'Enable AI') },
            { value: 'disable', label: this.t('whatsapp_cloud.flow_ai_disable', 'Disable AI') }
          ]
        }) +
        this.renderFlowSelect({
          id: 'wcNodeAiConfig',
          label: this.t('whatsapp_cloud.flow_field_ai_config', 'AI Configuration'),
          value: node.config?.aiConfigId || (activeConfig ? String(activeConfig.id) : ''),
          options: aiOptions
        }) +
        this.renderFlowInput({
          id: 'wcNodeAiTemperature',
          label: this.t('whatsapp_cloud.flow_field_ai_temperature', 'Temperature'),
          value: node.config?.temperature ?? '',
          type: 'number',
          placeholder: '0.7'
        }) +
        this.renderFlowInput({
          id: 'wcNodeAiMaxTokens',
          label: this.t('whatsapp_cloud.flow_field_ai_max_tokens', 'Response Size'),
          value: node.config?.maxTokens ?? '',
          type: 'number',
          placeholder: '1000'
        }) +
        this.renderFlowTextarea({
          id: 'wcNodeAiPrompt',
          label: this.t('whatsapp_cloud.flow_field_ai_prompt', 'Prompt'),
          value: node.config?.prompt || node.config?.instructions || '',
          placeholder: this.t('whatsapp_cloud.flow_field_ai_prompt_placeholder', 'Describe how the AI should behave')
        }) +
        this.renderFlowTextarea({
          id: 'wcNodeAiWelcomeMessage',
          label: this.t('whatsapp_cloud.flow_field_ai_welcome', 'Welcome Message'),
          value: node.config?.welcomeMessage || this.t('whatsapp_cloud.flow_field_ai_welcome_default', 'Hi, my name is {{persona}}. How can I help you?'),
          placeholder: this.t('whatsapp_cloud.flow_field_ai_welcome_placeholder', 'Message sent when AI is enabled')
        })
      ));
    }

    if (node.type === 'products') {
      const wooProducts = this.state.wooProducts || [];
      const selectedProductIds = (node.config?.productIds || '')
        .split(/[\s,;]+/)
        .map(value => parseInt(value, 10))
        .filter(value => Number.isFinite(value))
        .map(value => String(value));
      const productOptions = wooProducts.length > 0
        ? wooProducts.map(product => ({
          value: String(product.wc_product_id ?? product.id ?? ''),
          label: product.name || `#${product.wc_product_id || product.id || ''}`
        }))
        : [{ value: '', label: this.t('whatsapp_cloud.flow_no_products', 'No products available') }];
      const productSelect = `
        <div class="wc-flow-properties-field">
          <label class="wc-flow-properties-label" for="wcNodeProductIds">${this.t('whatsapp_cloud.flow_field_product_ids', 'Products')}</label>
          <select class="wc-flow-properties-select" id="wcNodeProductIds" multiple>
            ${productOptions.map(option => `
              <option value="${option.value}" ${selectedProductIds.includes(String(option.value)) ? 'selected' : ''}>${option.label}</option>
            `).join('')}
          </select>
          <div class="wc-flow-properties-help">${this.t('whatsapp_cloud.flow_field_product_ids_help', 'Select one or more synced products')}</div>
        </div>
      `;
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_products', 'Products'),
        productSelect +
        this.renderFlowInput({
          id: 'wcNodeProductLimit',
          label: this.t('whatsapp_cloud.flow_field_product_limit', 'Max Products'),
          value: node.config?.limit || 5,
          type: 'number',
          placeholder: '5'
        }) +
        this.renderFlowTextarea({
          id: 'wcNodeProductMessage',
          label: this.t('whatsapp_cloud.flow_field_product_message', 'Message (Optional)'),
          value: node.config?.message || '',
          placeholder: this.t('whatsapp_cloud.flow_field_product_message_placeholder', 'Add a message for the products')
        })
      ));

      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_products_display', 'Display'),
        this.renderFlowSelect({
          id: 'wcNodeProductMode',
          label: this.t('whatsapp_cloud.flow_field_product_mode', 'Display Mode'),
          value: node.config?.displayMode || 'list',
          options: [
            { value: 'list', label: this.t('whatsapp_cloud.flow_product_mode_list', 'List') },
            { value: 'carousel', label: this.t('whatsapp_cloud.flow_product_mode_carousel', 'Carousel') }
          ]
        }) +
        this.renderFlowSelect({
          id: 'wcNodeProductPrice',
          label: this.t('whatsapp_cloud.flow_field_product_price', 'Include Price'),
          value: node.config?.includePrice ? 'yes' : 'no',
          options: [
            { value: 'yes', label: this.t('whatsapp_cloud.flow_yes', 'Yes') },
            { value: 'no', label: this.t('whatsapp_cloud.flow_no', 'No') }
          ]
        })
      ));
    }

    if (node.type === 'transfer') {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_transfer', 'Transfer'),
        this.renderFlowSelect({
          id: 'wcNodeTransferType',
          label: this.t('whatsapp_cloud.flow_field_transfer_type', 'Transfer Type'),
          value: transferType,
          options: [
            { value: 'store', label: this.t('whatsapp_cloud.flow_transfer_store', 'Store') },
            { value: 'department', label: this.t('whatsapp_cloud.flow_transfer_department', 'Department') }
          ]
        }) +
        this.renderFlowSelect({
          id: 'wcNodeTransferTarget',
          label: this.t('whatsapp_cloud.flow_field_transfer_target', 'Target'),
          value: node.config?.targetId || '',
          options: transferOptions
        })
      ));
    }

    if (node.type === 'condition') {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_conditions', 'Conditions'),
        this.renderFlowInput({
          id: 'wcNodeCondition',
          label: this.t('whatsapp_cloud.flow_field_condition', 'Condition'),
          value: node.config?.condition || '',
          placeholder: this.t('whatsapp_cloud.flow_field_condition_placeholder', 'e.g., {{name}} == \'John\'')
        })
      ));
    }

    if (node.type === 'delay') {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_delay', 'Delay'),
        this.renderFlowInput({
          id: 'wcNodeDelayTime',
          label: this.t('whatsapp_cloud.flow_field_delay', 'Delay Time (seconds)'),
          value: node.config?.delay || 7,
          type: 'number',
          placeholder: '7',
          min: 7
        }) +
        this.renderFlowInput({
          id: 'wcNodeDelayReaction',
          label: this.t('whatsapp_cloud.flow_field_delay_reaction', 'Reaction'),
          value: node.config?.reaction || '',
          placeholder: '👍'
        }) +
        this.renderFlowSelect({
          id: 'wcNodeDelayTyping',
          label: this.t('whatsapp_cloud.flow_field_delay_typing', 'Typing Effect'),
          value: node.config?.typingEffect ? 'yes' : 'no',
          options: [
            { value: 'yes', label: this.t('whatsapp_cloud.flow_yes', 'Yes') },
            { value: 'no', label: this.t('whatsapp_cloud.flow_no', 'No') }
          ]
        })
      ));
    }

    if (node.type === 'end_chat') {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_end_chat', 'End Chat'),
        `<div class="wc-flow-properties-help">${this.t('whatsapp_cloud.flow_end_chat_summary', 'Ends the chat.')}</div>`
      ));
    }

    if (sections.length === 0) {
      sections.push(this.renderFlowSection(
        this.t('whatsapp_cloud.flow_section_content', 'Content'),
        this.renderFlowTextarea({
          id: 'wcNodeContent',
          label: this.t('whatsapp_cloud.flow_field_content', 'Content'),
          value: node.content || '',
          placeholder: this.t('whatsapp_cloud.flow_field_message_placeholder', 'Enter your message...')
        })
      ));
    }

    return `
      <div class="wc-flow-properties-header">
        <h4>${this.getNodeLabel(node.type)}</h4>
        <p>${this.getNodeDescription(node.type)}</p>
      </div>
      <div class="wc-flow-properties-body">
        ${sections.join('')}
      </div>
      <div class="wc-flow-properties-actions">
        <button class="wc-flow-properties-btn wc-flow-properties-btn-primary" id="wcSaveNodeBtn">
          <i class="fas fa-save"></i>
          <span>${this.t('common.save', 'Save')}</span>
        </button>
        <button class="wc-flow-properties-btn wc-flow-properties-btn-danger" id="wcDeleteNodeBtn">
          <i class="fas fa-trash"></i>
          <span>${this.t('common.delete', 'Delete')}</span>
        </button>
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
    const campaigns = this.state.scheduledCampaigns || [];
    const groups = this.state.contactGroups || [];
    const source = this.state.campaignSource;
    const audienceType = this.state.campaignAudienceType;
    const filters = this.state.campaignFilters || {};
    const selectedGroups = new Set((this.state.campaignGroupIds || []).map(id => String(id)));

    return `
      <div class="wc-campaigns-container">
        <div class="wc-campaigns-header">
          <div>
            <h2 class="wc-campaigns-title" data-i18n="whatsapp_cloud.campaigns_title">${this.t('whatsapp_cloud.campaigns_title', 'Mass Campaigns')}</h2>
            <p class="wc-campaigns-subtitle" data-i18n="whatsapp_cloud.campaigns_description">${this.t('whatsapp_cloud.campaigns_description', 'Send compliant template campaigns using Meta-approved content.')}</p>
          </div>
          <div class="wc-campaigns-header-actions">
            <button class="btn btn-secondary" id="wcSyncTemplatesBtn">
              <i class="fas fa-sync"></i>
              <span data-i18n="whatsapp_cloud.campaigns_template_sync">${this.t('whatsapp_cloud.campaigns_template_sync', 'Sync Templates')}</span>
            </button>
            <button class="btn btn-primary" id="wcCreateTemplateBtn">
              <i class="fas fa-plus"></i>
              <span data-i18n="whatsapp_cloud.campaigns_template_create">${this.t('whatsapp_cloud.campaigns_template_create', 'Create Template')}</span>
            </button>
          </div>
        </div>
        
        <div class="wc-campaigns-section">
          <h3 class="wc-campaigns-section-title">
            <i class="fas fa-file-alt"></i>
            <span data-i18n="whatsapp_cloud.campaigns_template_section">${this.t('whatsapp_cloud.campaigns_template_section', 'Template')}</span>
            <span class="wc-campaigns-section-count">${templates.length}</span>
          </h3>
          
          ${templates.length === 0 ? `
            <div class="wc-campaigns-empty">
              <i class="fas fa-file-alt"></i>
              <p data-i18n="whatsapp_cloud.campaigns_no_templates">${this.t('whatsapp_cloud.campaigns_no_templates', 'No templates available. Sync from Meta or create a new one.')}</p>
            </div>
          ` : `
            <div class="wc-templates-grid">
              ${templates.map(template => this.renderTemplateCard(template)).join('')}
            </div>
          `}
        </div>
        
        <div class="wc-campaigns-builder">
          <h3 class="wc-campaigns-section-title">
            <i class="fas fa-bullhorn"></i>
            <span data-i18n="whatsapp_cloud.campaigns_create_title">${this.t('whatsapp_cloud.campaigns_create_title', 'Create Campaign')}</span>
          </h3>
          
          <div class="wc-campaigns-grid">
            <div class="wc-campaigns-card">
              <h4><i class="fas fa-file-alt"></i> ${this.t('whatsapp_cloud.campaigns_template_section', 'Template')}</h4>
              <div class="form-group">
                <label data-i18n="whatsapp_cloud.campaigns_template_label">${this.t('whatsapp_cloud.campaigns_template_label', 'Template')}</label>
                <select class="form-control" id="wcCampaignTemplate">
                  <option value="" data-i18n="whatsapp_cloud.campaigns_template_placeholder">${this.t('whatsapp_cloud.campaigns_template_placeholder', 'Select a template')}</option>
                  ${templates.filter(t => (t.status || '').toLowerCase() === 'approved').map(t => `
                    <option value="${t.id}">${t.name} (${t.language})</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group">
                <label data-i18n="whatsapp_cloud.campaigns_template_source_label">${this.t('whatsapp_cloud.campaigns_template_source_label', 'Source')}</label>
                <div class="wc-chip-row">
                  <button class="wc-chip ${source === 'meta' ? 'active' : ''}" data-campaign-source="meta">${this.t('whatsapp_cloud.campaigns_source_meta', 'Meta Business')}</button>
                  <button class="wc-chip ${source === 'custom' ? 'active' : ''}" data-campaign-source="custom">${this.t('whatsapp_cloud.campaigns_source_custom', 'Created in Workspace')}</button>
                </div>
              </div>
            </div>
            
            <div class="wc-campaigns-card">
              <h4><i class="fas fa-users"></i> ${this.t('whatsapp_cloud.campaigns_audience_section', 'Audience')}</h4>
              <div class="form-group">
                <label data-i18n="whatsapp_cloud.campaigns_audience_label">${this.t('whatsapp_cloud.campaigns_audience_label', 'Contact List')}</label>
                <div class="wc-chip-row">
                  <button class="wc-chip ${audienceType === 'all' ? 'active' : ''}" data-campaign-audience="all">${this.t('whatsapp_cloud.campaigns_audience_all', 'All Contacts')}</button>
                  <button class="wc-chip ${audienceType === 'groups' ? 'active' : ''}" data-campaign-audience="groups">${this.t('whatsapp_cloud.campaigns_audience_groups', 'Groups')}</button>
                  <button class="wc-chip ${audienceType === 'custom' ? 'active' : ''}" data-campaign-audience="custom">${this.t('whatsapp_cloud.campaigns_audience_custom', 'Custom')}</button>
                </div>
              </div>
              <div class="form-group">
                <label data-i18n="whatsapp_cloud.campaigns_filters_label">${this.t('whatsapp_cloud.campaigns_filters_label', 'Filters')}</label>
                <div class="wc-chip-row">
                  <button class="wc-chip ${filters.tags ? 'active' : ''}" data-campaign-filter="tags">${this.t('whatsapp_cloud.campaigns_filter_tags', 'Tags')}</button>
                  <button class="wc-chip ${filters.activity ? 'active' : ''}" data-campaign-filter="activity">${this.t('whatsapp_cloud.campaigns_filter_activity', 'Last activity')}</button>
                  <button class="wc-chip ${filters.optin ? 'active' : ''}" data-campaign-filter="optin">${this.t('whatsapp_cloud.campaigns_filter_optin', 'Opt-in')}</button>
                </div>
              </div>
              <div class="form-group ${audienceType === 'groups' ? '' : 'hidden'}" id="wcCampaignGroupsSection">
                <label data-i18n="whatsapp_cloud.campaigns_groups_label">${this.t('whatsapp_cloud.campaigns_groups_label', 'Select Groups')}</label>
                <div class="wc-campaign-groups">
                  ${groups.length > 0 ? groups.map(group => `
                    <label class="wc-campaign-group-item">
                      <input type="checkbox" data-campaign-group-id="${group.id}" ${selectedGroups.has(String(group.id)) ? 'checked' : ''}>
                      <span>${group.group_name}</span>
                      <span class="wc-campaign-group-count">${group.contact_count || 0}</span>
                    </label>
                  `).join('') : `
                    <div class="wc-campaign-empty" data-i18n="whatsapp_cloud.campaigns_groups_empty">${this.t('whatsapp_cloud.campaigns_groups_empty', 'No groups available')}</div>
                  `}
                </div>
              </div>
              <div class="form-group ${audienceType === 'custom' ? '' : 'hidden'}" id="wcCampaignCustomSection">
                <label data-i18n="whatsapp_cloud.campaigns_custom_numbers">${this.t('whatsapp_cloud.campaigns_custom_numbers', 'Custom Numbers')}</label>
                <textarea class="form-control" id="wcCampaignCustomNumbers" rows="5" placeholder="${this.t('whatsapp_cloud.campaigns_custom_numbers_placeholder', 'Enter one number per line')}">${this.escapeHtml(this.state.campaignCustomNumbers || '')}</textarea>
              </div>
            </div>
          </div>
          
          <div class="wc-campaigns-preview">
            <div class="wc-campaigns-preview-header">
              <h4 class="wc-campaigns-preview-title" data-i18n="whatsapp_cloud.campaigns_preview_title">${this.t('whatsapp_cloud.campaigns_preview_title', 'Preview')}</h4>
            </div>
            <div class="wc-campaigns-preview-content">
              <div class="wc-campaigns-preview-phone">
                <div class="wc-campaigns-preview-phone-header">
                  <div class="wc-campaigns-preview-phone-avatar">
                    <i class="fas fa-user"></i>
                  </div>
                  <span class="wc-campaigns-preview-phone-name" data-i18n="whatsapp_cloud.campaigns_preview_business">${this.t('whatsapp_cloud.campaigns_preview_business', 'Your Business')}</span>
                </div>
                <div class="wc-campaigns-preview-phone-body">
                  <div class="wc-campaigns-preview-message">
                    <div class="wc-campaigns-preview-message-text" id="wcCampaignPreviewText">
                      ${this.t('whatsapp_cloud.campaigns_preview_body_text', 'Your message preview will appear here.')}
                    </div>
                    <div class="wc-campaigns-preview-message-time">12:00 PM</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="wc-campaigns-preview-actions">
              <button class="btn btn-secondary" id="wcSendNowBtn">
                <span data-i18n="whatsapp_cloud.campaigns_send_now">${this.t('whatsapp_cloud.campaigns_send_now', 'Send Now')}</span>
              </button>
              <button class="btn btn-primary" id="wcScheduleCampaignBtn">
                <span data-i18n="whatsapp_cloud.campaigns_send">${this.t('whatsapp_cloud.campaigns_send', 'Schedule Campaign')}</span>
              </button>
            </div>
          </div>
        </div>
        <div class="wc-campaigns-section">
          <h3 class="wc-campaigns-section-title">
            <i class="fas fa-calendar-alt"></i>
            <span data-i18n="whatsapp_cloud.campaigns_scheduled_title">${this.t('whatsapp_cloud.campaigns_scheduled_title', 'Scheduled Campaigns')}</span>
            <span class="wc-campaigns-section-count">${campaigns.length}</span>
          </h3>
          ${this.renderScheduledCampaigns(campaigns)}
        </div>
      </div>
    `;
  },

  renderScheduledCampaigns(campaigns) {
    if (!campaigns || campaigns.length === 0) {
      return `
        <div class="wc-campaigns-empty">
          <i class="fas fa-calendar-times"></i>
          <p data-i18n="whatsapp_cloud.campaigns_no_scheduled">${this.t('whatsapp_cloud.campaigns_no_scheduled', 'No scheduled campaigns')}</p>
        </div>
      `;
    }
    return `
      <div class="wc-campaigns-scheduled-list">
        ${campaigns.map(campaign => `
          <div class="wc-campaign-scheduled-card">
            <div class="wc-campaign-scheduled-info">
              <div class="wc-campaign-scheduled-title">${this.escapeHtml(campaign.name || campaign.template_name || this.t('whatsapp_cloud.campaigns_default_name', 'Campaign'))}</div>
              <div class="wc-campaign-scheduled-meta">
                <span>${this.escapeHtml(campaign.template_name || campaign.template_id || '')}</span>
                <span>${this.formatDateTime(campaign.schedule_at)}</span>
                <span>${campaign.timezone || 'UTC'}</span>
              </div>
            </div>
            <div class="wc-campaign-scheduled-actions">
              <button class="btn btn-secondary btn-sm" data-action="edit-scheduled" data-campaign-id="${campaign.id}">
                <i class="fas fa-edit"></i>
                <span>${this.t('common.edit', 'Edit')}</span>
              </button>
              <button class="btn btn-danger-outline btn-sm" data-action="delete-scheduled" data-campaign-id="${campaign.id}">
                <i class="fas fa-trash"></i>
                <span>${this.t('common.delete', 'Delete')}</span>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  getTimezoneOptions() {
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Sao_Paulo',
      'America/Bogota',
      'America/Mexico_City',
      'Europe/London',
      'Europe/Paris',
      'Europe/Madrid',
      'Europe/Berlin',
      'Europe/Rome',
      'Europe/Lisbon',
      'Africa/Johannesburg',
      'Asia/Dubai',
      'Asia/Kolkata',
      'Asia/Singapore',
      'Asia/Shanghai',
      'Asia/Tokyo',
      'Australia/Sydney',
      'Pacific/Auckland'
    ];
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

    const normalizedStatus = (template.status || '').toLowerCase();
    return `
      <div class="wc-template-card" data-template-id="${template.id}">
        <div class="wc-template-card-header">
          <span class="wc-template-card-category">
            <i class="${categoryIcons[template.category] || 'fas fa-file'}"></i>
            ${template.category}
          </span>
          <span class="wc-template-card-status" style="background: ${statusColors[normalizedStatus] || '#6b7280'}">
            ${normalizedStatus || template.status}
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
            <span data-i18n="whatsapp_cloud.template_preview">${this.t('whatsapp_cloud.template_preview', 'Preview')}</span>
          </button>
          <button class="btn btn-primary btn-sm" data-action="use" data-template-id="${template.id}" ${normalizedStatus !== 'approved' ? 'disabled' : ''}>
            <i class="fas fa-paper-plane"></i>
            <span data-i18n="whatsapp_cloud.template_use">${this.t('whatsapp_cloud.template_use', 'Use')}</span>
          </button>
        </div>
      </div>
    `;
  },


  // ============================================
  // CONNECTION TAB
  // ============================================

  renderApiRestTab() {
    const baseUrl = `${window.location.origin}/api/whatsapp-cloud`;
    const userBaseUrl = `${window.location.origin}/api/user/whatsapp-cloud`;
    const docsUrl = `${window.location.origin}/api-docs`;
    const webhookUrl = `${window.location.origin}/webhook`;

    return `
      <div class="wc-connection-container">
        <div class="wc-connection-header">
          <div>
            <h2 class="wc-connection-title" data-i18n="whatsapp_cloud.api_rest_title">${this.t('whatsapp_cloud.api_rest_title', 'WhatsApp Cloud API Rest')}</h2>
            <p class="wc-connection-subtitle" data-i18n="whatsapp_cloud.api_rest_subtitle">${this.t('whatsapp_cloud.api_rest_subtitle', 'Use the REST API to manage messages, flows, and templates.')}</p>
          </div>
          <a class="btn btn-secondary" href="${docsUrl}" target="_blank" rel="noopener">
            <i class="fas fa-book"></i>
            <span data-i18n="whatsapp_cloud.api_rest_docs">${this.t('whatsapp_cloud.api_rest_docs', 'Documentation')}</span>
          </a>
        </div>

        <div class="wc-connection-status-grid">
          <div class="wc-connection-status-card">
            <span class="wc-connection-status-label" data-i18n="whatsapp_cloud.api_rest_base_url">${this.t('whatsapp_cloud.api_rest_base_url', 'Base URL')}</span>
            <span class="wc-connection-status-value">/api/whatsapp-cloud</span>
          </div>
          <div class="wc-connection-status-card">
            <span class="wc-connection-status-label" data-i18n="whatsapp_cloud.api_rest_user_base_url">${this.t('whatsapp_cloud.api_rest_user_base_url', 'User API Base')}</span>
            <span class="wc-connection-status-value">/api/user/whatsapp-cloud</span>
          </div>
          <div class="wc-connection-status-card">
            <span class="wc-connection-status-label" data-i18n="whatsapp_cloud.api_rest_webhook_label">${this.t('whatsapp_cloud.api_rest_webhook_label', 'Webhook')}</span>
            <span class="wc-connection-status-value">/webhook</span>
          </div>
        </div>

        <div class="wc-connection-manual">
          <h3 data-i18n="whatsapp_cloud.api_rest_endpoints">${this.t('whatsapp_cloud.api_rest_endpoints', 'API Endpoints')}</h3>
          <div class="wc-connection-webhook">
            <h4 data-i18n="whatsapp_cloud.api_rest_base_url">${this.t('whatsapp_cloud.api_rest_base_url', 'Base URL')}</h4>
            <div class="wc-connection-webhook-url">
              <input type="text" readonly value="${baseUrl}" id="wcApiRestBaseUrl">
              <button type="button" class="btn btn-secondary" data-copy-target="wcApiRestBaseUrl">
                <i class="fas fa-copy"></i>
                <span data-i18n="whatsapp_cloud.copy">${this.t('whatsapp_cloud.copy', 'Copy')}</span>
              </button>
            </div>
          </div>
          <div class="wc-connection-webhook">
            <h4 data-i18n="whatsapp_cloud.api_rest_user_base_url">${this.t('whatsapp_cloud.api_rest_user_base_url', 'User API Base')}</h4>
            <div class="wc-connection-webhook-url">
              <input type="text" readonly value="${userBaseUrl}" id="wcApiRestUserBaseUrl">
              <button type="button" class="btn btn-secondary" data-copy-target="wcApiRestUserBaseUrl">
                <i class="fas fa-copy"></i>
                <span data-i18n="whatsapp_cloud.copy">${this.t('whatsapp_cloud.copy', 'Copy')}</span>
              </button>
            </div>
          </div>
          <div class="wc-connection-webhook">
            <h4 data-i18n="whatsapp_cloud.api_rest_webhook_label">${this.t('whatsapp_cloud.api_rest_webhook_label', 'Webhook')}</h4>
            <div class="wc-connection-webhook-url">
              <input type="text" readonly value="${webhookUrl}" id="wcApiRestWebhookUrl">
              <button type="button" class="btn btn-secondary" data-copy-target="wcApiRestWebhookUrl">
                <i class="fas fa-copy"></i>
                <span data-i18n="whatsapp_cloud.copy">${this.t('whatsapp_cloud.copy', 'Copy')}</span>
              </button>
            </div>
            <p class="wc-connection-webhook-desc" data-i18n="whatsapp_cloud.api_rest_webhook_desc">${this.t('whatsapp_cloud.api_rest_webhook_desc', 'Configure this URL in your Meta App webhook settings.')}</p>
          </div>
        </div>

        <div class="wc-connection-manual">
          <h3 data-i18n="whatsapp_cloud.api_rest_use_cases_title">${this.t('whatsapp_cloud.api_rest_use_cases_title', 'Casos de uso')}</h3>
          <ul class="wc-connection-facebook-benefits" style="margin-top: 8px;">
            <li data-i18n="whatsapp_cloud.api_rest_use_case_messages">${this.t('whatsapp_cloud.api_rest_use_case_messages', 'Automatizar disparos e respostas via API oficial.')}</li>
            <li data-i18n="whatsapp_cloud.api_rest_use_case_flows">${this.t('whatsapp_cloud.api_rest_use_case_flows', 'Controlar flows, campanhas e templates por integração.')}</li>
            <li data-i18n="whatsapp_cloud.api_rest_use_case_webhooks">${this.t('whatsapp_cloud.api_rest_use_case_webhooks', 'Receber eventos em tempo real via webhook.')}</li>
          </ul>
        </div>

        <div class="card" id="wcApiDocsTabs" style="padding: 20px;">
          <div style="display: grid; gap: 16px;">
            <div style="display: grid; gap: 8px;">
              <strong data-i18n="integration.docs_connection_title">${this.t('integration.docs_connection_title', 'Connection')}</strong>
              <div style="display: grid; gap: 6px; color: #475569;">
                <div><strong data-i18n="integration.docs_base_url_label">${this.t('integration.docs_base_url_label', 'Base URL:')}</strong> <code id="wcApiDocsBaseUrl">https://example.com</code></div>
                <div><strong data-i18n="integration.docs_auth_label">${this.t('integration.docs_auth_label', 'Authentication:')}</strong> <code>Authorization: Bearer YOUR_TOKEN</code></div>
                <div><strong data-i18n="integration.docs_tenant_label">${this.t('integration.docs_tenant_label', 'Tenant:')}</strong> <code>X-Tenant-ID: 1</code></div>
              </div>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn btn-sm" data-doc-tab="auth" style="background: var(--primary); color: #fff; border: 1px solid var(--primary);"><span data-i18n="integration.docs_tab_auth">${this.t('integration.docs_tab_auth', 'Authentication')}</span></button>
              <button class="btn btn-sm" data-doc-tab="api-keys" style="background: #f8fafc; color: #0f172a; border: 1px solid #e2e8f0;"><span data-i18n="integration.docs_tab_api_keys">${this.t('integration.docs_tab_api_keys', 'API Keys')}</span></button>
              <button class="btn btn-sm" data-doc-tab="webhooks" style="background: #f8fafc; color: #0f172a; border: 1px solid #e2e8f0;"><span data-i18n="integration.docs_tab_webhooks">${this.t('integration.docs_tab_webhooks', 'Webhooks')}</span></button>
              <button class="btn btn-sm" data-doc-tab="conversations" style="background: #f8fafc; color: #0f172a; border: 1px solid #e2e8f0;"><span data-i18n="integration.docs_tab_conversations">${this.t('integration.docs_tab_conversations', 'Conversations')}</span></button>
              <button class="btn btn-sm" data-doc-tab="contacts" style="background: #f8fafc; color: #0f172a; border: 1px solid #e2e8f0;"><span data-i18n="integration.docs_tab_contacts">${this.t('integration.docs_tab_contacts', 'Contacts')}</span></button>
              <button class="btn btn-sm" data-doc-tab="payments" style="background: #f8fafc; color: #0f172a; border: 1px solid #e2e8f0;"><span data-i18n="integration.docs_tab_payments">${this.t('integration.docs_tab_payments', 'Payments')}</span></button>
              <button class="btn btn-sm" data-doc-tab="invoices" style="background: #f8fafc; color: #0f172a; border: 1px solid #e2e8f0;"><span data-i18n="integration.docs_tab_invoices">${this.t('integration.docs_tab_invoices', 'Invoices')}</span></button>
              <button class="btn btn-sm" data-doc-tab="whatsapp" style="background: #f8fafc; color: #0f172a; border: 1px solid #e2e8f0;"><span data-i18n="integration.docs_tab_whatsapp">${this.t('integration.docs_tab_whatsapp', 'WhatsApp')}</span></button>
            </div>
            <div data-doc-panel="auth" style="display: block;">
              <h3 style="margin-bottom: 10px;" data-i18n="integration.docs_section_auth">${this.t('integration.docs_section_auth', 'Authentication')}</h3>
              <div style="display: grid; gap: 12px;">
                <div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge badge-success">POST</span>
                    <code>/api/auth/login</code>
                  </div>
                  <p style="margin: 6px 0 0; color: #475569;" data-i18n="integration.docs_auth_login_desc">${this.t('integration.docs_auth_login_desc', 'Generates the access token.')}</p>
                  <pre style="margin-top: 8px;"><code>curl -X POST __BASE_URL__/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com","password":"PASSWORD"}'</code></pre>
                </div>
                <div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge badge-success">POST</span>
                    <code>/api/auth/forgot-password</code>
                  </div>
                  <pre style="margin-top: 8px;"><code>curl -X POST __BASE_URL__/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa.com"}'</code></pre>
                </div>
              </div>
            </div>
            <div data-doc-panel="api-keys" style="display: none;">
              <h3 style="margin-bottom: 10px;" data-i18n="integration.docs_section_api_keys">${this.t('integration.docs_section_api_keys', 'API Keys')}</h3>
              <div style="display: grid; gap: 12px;">
                <div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge badge-info">GET</span>
                    <code>/api/tenant/api-keys</code>
                  </div>
                  <pre style="margin-top: 8px;"><code>curl __BASE_URL__/api/tenant/api-keys \
  -H "Authorization: Bearer YOUR_TOKEN"</code></pre>
                </div>
                <div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge badge-success">POST</span>
                    <code>/api/tenant/api-keys</code>
                  </div>
                  <pre style="margin-top: 8px;"><code>curl -X POST __BASE_URL__/api/tenant/api-keys \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production Key"}'</code></pre>
                </div>
              </div>
            </div>
            <div data-doc-panel="webhooks" style="display: none;">
              <h3 style="margin-bottom: 10px;" data-i18n="integration.docs_section_webhooks">${this.t('integration.docs_section_webhooks', 'Webhooks')}</h3>
              <div style="display: grid; gap: 12px;">
                <div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge badge-info">GET</span>
                    <code>/api/webhooks</code>
                  </div>
                  <pre style="margin-top: 8px;"><code>curl __BASE_URL__/api/webhooks \
  -H "Authorization: Bearer YOUR_TOKEN"</code></pre>
                </div>
                <div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge badge-success">POST</span>
                    <code>/api/webhooks</code>
                  </div>
                  <pre style="margin-top: 8px;"><code>curl -X POST __BASE_URL__/api/webhooks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event":"conversation.created","webhook_url":"https://example.com/webhook"}'</code></pre>
                </div>
              </div>
            </div>
            <div data-doc-panel="conversations" style="display: none;">
              <h3 style="margin-bottom: 10px;" data-i18n="integration.docs_section_conversations">${this.t('integration.docs_section_conversations', 'Conversations')}</h3>
              <div style="display: grid; gap: 12px;">
                <div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge badge-info">GET</span>
                    <code>/api/tenant/conversations</code>
                  </div>
                  <pre style="margin-top: 8px;"><code>curl __BASE_URL__/api/tenant/conversations \
  -H "Authorization: Bearer YOUR_TOKEN"</code></pre>
                </div>
              </div>
            </div>
            <div data-doc-panel="contacts" style="display: none;">
              <h3 style="margin-bottom: 10px;" data-i18n="integration.docs_section_contacts">${this.t('integration.docs_section_contacts', 'Contacts')}</h3>
              <div style="display: grid; gap: 12px;">
                <div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge badge-info">GET</span>
                    <code>/api/tenant/contacts</code>
                  </div>
                  <pre style="margin-top: 8px;"><code>curl __BASE_URL__/api/tenant/contacts \
  -H "Authorization: Bearer YOUR_TOKEN"</code></pre>
                </div>
              </div>
            </div>
            <div data-doc-panel="payments" style="display: none;">
              <h3 style="margin-bottom: 10px;" data-i18n="integration.docs_section_payments">${this.t('integration.docs_section_payments', 'Payments')}</h3>
              <div style="display: grid; gap: 12px;">
                <div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge badge-info">GET</span>
                    <code>/api/tenant/payments</code>
                  </div>
                  <pre style="margin-top: 8px;"><code>curl __BASE_URL__/api/tenant/payments \
  -H "Authorization: Bearer YOUR_TOKEN"</code></pre>
                </div>
              </div>
            </div>
            <div data-doc-panel="invoices" style="display: none;">
              <h3 style="margin-bottom: 10px;" data-i18n="integration.docs_section_invoices">${this.t('integration.docs_section_invoices', 'Invoices')}</h3>
              <div style="display: grid; gap: 12px;">
                <div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge badge-info">GET</span>
                    <code>/api/tenant/invoices</code>
                  </div>
                  <pre style="margin-top: 8px;"><code>curl __BASE_URL__/api/tenant/invoices \
  -H "Authorization: Bearer YOUR_TOKEN"</code></pre>
                </div>
              </div>
            </div>
            <div data-doc-panel="whatsapp" style="display: none;">
              <h3 style="margin-bottom: 10px;" data-i18n="integration.docs_section_whatsapp">${this.t('integration.docs_section_whatsapp', 'WhatsApp')}</h3>
              <div style="display: grid; gap: 12px;">
                <div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge badge-info">GET</span>
                    <code>/api/user/whatsapp-cloud/conversations</code>
                  </div>
                  <pre style="margin-top: 8px;"><code>curl __BASE_URL__/api/user/whatsapp-cloud/conversations \
  -H "Authorization: Bearer YOUR_TOKEN"</code></pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderApiRestTabV2() {
    const baseUrl = `${window.location.origin}/api/whatsapp-cloud`;
    const docsUrl = `${window.location.origin}/api-docs`;
    const webhookUrl = `${window.location.origin}/webhook`;
    const activeTab = this.state.activeApiRestTab || 'overview';

    return `
      <div class="wc-connection-container">
        <div class="wc-connection-header">
          <div>
            <h2 class="wc-connection-title" data-i18n="whatsapp_cloud.api_rest_title">${this.t('whatsapp_cloud.api_rest_title', 'WhatsApp Cloud API Rest')}</h2>
            <p class="wc-connection-subtitle" data-i18n="whatsapp_cloud.api_rest_subtitle">${this.t('whatsapp_cloud.api_rest_subtitle', 'Use the REST API to manage messages, flows, and templates.')}</p>
          </div>
          <a class="btn btn-secondary" href="${docsUrl}" target="_blank" rel="noopener">
            <i class="fas fa-book"></i>
            <span data-i18n="whatsapp_cloud.api_rest_docs">${this.t('whatsapp_cloud.api_rest_docs', 'Documentation')}</span>
          </a>
        </div>

        <div class="wc-api-tabs">
          <button class="wc-api-tab ${activeTab === 'overview' ? 'active' : ''}" data-api-rest-tab="overview">${this.t('whatsapp_cloud.api_tab_overview', 'Overview')}</button>
          <button class="wc-api-tab ${activeTab === 'messages' ? 'active' : ''}" data-api-rest-tab="messages">${this.t('whatsapp_cloud.api_tab_messages', 'Messages')}</button>
          <button class="wc-api-tab ${activeTab === 'templates' ? 'active' : ''}" data-api-rest-tab="templates">${this.t('whatsapp_cloud.api_tab_templates', 'Templates')}</button>
          <button class="wc-api-tab ${activeTab === 'campaigns' ? 'active' : ''}" data-api-rest-tab="campaigns">${this.t('whatsapp_cloud.api_tab_campaigns', 'Campaigns')}</button>
          <button class="wc-api-tab ${activeTab === 'flows' ? 'active' : ''}" data-api-rest-tab="flows">${this.t('whatsapp_cloud.api_tab_flows', 'Flows')}</button>
          <button class="wc-api-tab ${activeTab === 'webhook' ? 'active' : ''}" data-api-rest-tab="webhook">${this.t('whatsapp_cloud.api_tab_webhook', 'Webhook')}</button>
        </div>

        <div class="wc-api-panels">
          <div class="wc-api-panel ${activeTab === 'overview' ? 'active' : ''}" data-api-panel="overview">
            <div class="wc-connection-status-grid">
              <div class="wc-connection-status-card">
                <span class="wc-connection-status-label" data-i18n="whatsapp_cloud.api_rest_base_url">${this.t('whatsapp_cloud.api_rest_base_url', 'Base URL')}</span>
                <span class="wc-connection-status-value">/api/whatsapp-cloud</span>
              </div>
              <div class="wc-connection-status-card">
                <span class="wc-connection-status-label" data-i18n="whatsapp_cloud.api_rest_user_base_url">${this.t('whatsapp_cloud.api_rest_user_base_url', 'User Base URL')}</span>
                <span class="wc-connection-status-value">/api/user/whatsapp-cloud</span>
              </div>
              <div class="wc-connection-status-card">
                <span class="wc-connection-status-label" data-i18n="whatsapp_cloud.api_rest_webhook">${this.t('whatsapp_cloud.api_rest_webhook', 'Webhook URL')}</span>
                <span class="wc-connection-status-value">${webhookUrl}</span>
              </div>
            </div>
            <div class="wc-api-usecases">
              <div class="wc-api-usecase-card">
                <h4>${this.t('whatsapp_cloud.api_usecase_send_template', 'Send Template Message')}</h4>
                <p>${this.t('whatsapp_cloud.api_usecase_send_template_desc', 'Send an approved template to a contact.')}</p>
                <div class="wc-code-block"><code>POST ${baseUrl}/send-message</code></div>
              </div>
              <div class="wc-api-usecase-card">
                <h4>${this.t('whatsapp_cloud.api_usecase_campaign', 'Send Campaign')}</h4>
                <p>${this.t('whatsapp_cloud.api_usecase_campaign_desc', 'Send bulk templates to your audience.')}</p>
                <div class="wc-code-block"><code>POST ${baseUrl}/campaigns/send</code></div>
              </div>
              <div class="wc-api-usecase-card">
                <h4>${this.t('whatsapp_cloud.api_usecase_flow', 'Trigger Flow')}</h4>
                <p>${this.t('whatsapp_cloud.api_usecase_flow_desc', 'Use flows for automated experiences.')}</p>
                <div class="wc-code-block"><code>POST ${baseUrl}/flows</code></div>
              </div>
            </div>
          </div>

          <div class="wc-api-panel ${activeTab === 'messages' ? 'active' : ''}" data-api-panel="messages">
            <div class="wc-api-endpoint">
              <div class="wc-api-endpoint-title">POST ${baseUrl}/send-message</div>
              <pre class="wc-code-block"><code>{
  "accountId": 1,
  "to": "15551234567",
  "type": "template",
  "templateName": "order_update",
  "language": "en"
}</code></pre>
            </div>
            <div class="wc-api-endpoint">
              <div class="wc-api-endpoint-title">POST ${baseUrl}/send-media</div>
              <pre class="wc-code-block"><code>{
  "accountId": 1,
  "to": "15551234567",
  "type": "image",
  "mediaUrl": "https://example.com/photo.jpg"
}</code></pre>
            </div>
          </div>

          <div class="wc-api-panel ${activeTab === 'templates' ? 'active' : ''}" data-api-panel="templates">
            <div class="wc-api-endpoint">
              <div class="wc-api-endpoint-title">GET ${baseUrl}/templates</div>
              <pre class="wc-code-block"><code>curl -X GET "${baseUrl}/templates" -H "Authorization: Bearer &lt;token&gt;"</code></pre>
            </div>
            <div class="wc-api-endpoint">
              <div class="wc-api-endpoint-title">POST ${baseUrl}/templates/sync</div>
              <pre class="wc-code-block"><code>curl -X POST "${baseUrl}/templates/sync" -H "Authorization: Bearer &lt;token&gt;"</code></pre>
            </div>
          </div>

          <div class="wc-api-panel ${activeTab === 'campaigns' ? 'active' : ''}" data-api-panel="campaigns">
            <div class="wc-api-endpoint">
              <div class="wc-api-endpoint-title">POST ${baseUrl}/campaigns/send</div>
              <pre class="wc-code-block"><code>{
  "accountId": 1,
  "templateId": "template_123",
  "audienceType": "all"
}</code></pre>
            </div>
            <div class="wc-api-endpoint">
              <div class="wc-api-endpoint-title">POST ${baseUrl}/campaigns</div>
              <pre class="wc-code-block"><code>{
  "accountId": 1,
  "templateId": "template_123",
  "audienceType": "groups",
  "audienceGroups": [1, 2],
  "scheduleAt": "2026-02-05T14:30",
  "timezone": "UTC"
}</code></pre>
            </div>
          </div>

          <div class="wc-api-panel ${activeTab === 'flows' ? 'active' : ''}" data-api-panel="flows">
            <div class="wc-api-endpoint">
              <div class="wc-api-endpoint-title">GET ${baseUrl}/flows</div>
              <pre class="wc-code-block"><code>curl -X GET "${baseUrl}/flows" -H "Authorization: Bearer &lt;token&gt;"</code></pre>
            </div>
            <div class="wc-api-endpoint">
              <div class="wc-api-endpoint-title">POST ${baseUrl}/flows</div>
              <pre class="wc-code-block"><code>{
  "name": "Welcome Flow",
  "trigger": "keyword",
  "nodes": []
}</code></pre>
            </div>
          </div>

          <div class="wc-api-panel ${activeTab === 'webhook' ? 'active' : ''}" data-api-panel="webhook">
            <div class="wc-api-endpoint">
              <div class="wc-api-endpoint-title">Webhook</div>
              <pre class="wc-code-block"><code>${webhookUrl}</code></pre>
            </div>
            <div class="wc-api-endpoint">
              <div class="wc-api-endpoint-title">${this.t('whatsapp_cloud.api_webhook_events', 'Events')}</div>
              <pre class="wc-code-block"><code>messages
message_deliveries
message_reads</code></pre>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderConnectionTab() {
    const accounts = this.state.accounts;
    const activeAccount = accounts.find(a => String(a.id) === String(this.state.activeAccountId));

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
            <span class="wc-connection-status-value ${activeAccount?.status || 'pending'}">
              <i class="fas fa-circle" style="font-size: 8px;"></i>
              ${activeAccount ? (activeAccount.status || 'Pending') : 'No Account'}
            </span>
          </div>
          <div class="wc-connection-status-card">
            <span class="wc-connection-status-label" >Webhook Status</span>
            <span class="wc-connection-status-value ${String(activeAccount?.webhookStatus || '').toLowerCase() === 'verified' ? 'verified' : 'error'}">
              <i class="fas fa-circle" style="font-size: 8px;"></i>
              ${activeAccount?.webhookStatus || 'Pending'}
            </span>
          </div>
          <div class="wc-connection-status-card">
            <span class="wc-connection-status-label" >Template Sync</span>
            <span class="wc-connection-status-value ${String(activeAccount?.templateSyncStatus || '').toLowerCase() === 'synced' ? 'synced' : 'error'}">
              <i class="fas fa-circle" style="font-size: 8px;"></i>
              ${activeAccount?.templateSyncStatus || 'Pending'}
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
                <label >App ID</label>
                <input type="text" class="form-control" id="wcConnectionAppId" placeholder="Meta App ID" value="${activeAccount?.appId || ''}">
              </div>
              <div class="form-group">
                <label >Access Token</label>
                <input type="password" class="form-control" id="wcConnectionAccessToken" placeholder="Paste your access token" value="${activeAccount ? '********' : ''}">
                <small class="form-text">Use a System User token for production</small>
              </div>
              <div class="form-group">
                <label >Webhook Verify Token</label>
                <input type="text" class="form-control" id="wcConnectionVerifyToken" placeholder="Custom verify token" value="${activeAccount?.verifyToken || ''}">
              </div>
              <div class="form-group">
                <label >App Secret</label>
                <input type="password" class="form-control" id="wcConnectionAppSecret" placeholder="Meta App Secret" value="${activeAccount ? '********' : ''}">
              </div>
            </div>

            <div class="wc-connection-webhook">
              <h4 >Webhook URL</h4>
              <p class="wc-connection-webhook-desc" >Configure this URL in your Meta App webhook settings.</p>
              <div class="wc-connection-webhook-url">
                <input type="text" readonly value="${window.location.origin}/webhook" id="wcWebhookUrl">
                <button type="button" class="btn btn-secondary" id="wcCopyWebhookBtn">
                  <i class="fas fa-copy"></i>
                  <span >Copy</span>
                </button>
                <button type="button" class="btn btn-primary" id="wcMarkWebhookVerifiedBtn">
                  <i class="fas fa-check-circle"></i>
                  <span >Mark as Verified</span>
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
                <div class="wc-connection-account-item ${String(account.id) === String(this.state.activeAccountId) ? 'active' : ''}" data-account-id="${account.id}">
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
                    <span class="wc-connection-account-status ${account.connectionStatus || account.status || 'pending'}">${account.connectionStatus || account.status || 'Pending'}</span>
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
    if (this.state.eventListenersInitialized) return;
    this.state.eventListenersInitialized = true;

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
      if (e.target.closest('#wcFlowSettingsBtn')) {
        this.showFlowSettingsModal();
        return;
      }
      const deleteConnectionBtn = e.target.closest('.wc-flow-connection-delete');
      if (deleteConnectionBtn) {
        const group = deleteConnectionBtn.closest('.wc-flow-connection-group');
        if (group) {
          this.deleteFlowConnection({
            from: group.dataset.from,
            to: group.dataset.to,
            handle: group.dataset.handle || 'default'
          });
        }
        e.preventDefault();
        return;
      }
      const nodeElement = e.target.closest('.wc-flow-node');
      if (nodeElement && !e.target.closest('.wc-flow-node-connector')) {
        this.selectNode(nodeElement.dataset.nodeId);
      }
      const connectionGroup = e.target.closest('.wc-flow-connection-group');
      if (connectionGroup) {
        this.selectFlowConnection({
          from: connectionGroup.dataset.from,
          to: connectionGroup.dataset.to,
          handle: connectionGroup.dataset.handle || 'default'
        });
        e.preventDefault();
        return;
      }
      if (this.state.selectedConnection) {
        this.clearFlowConnectionSelection();
      }
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
      if (e.target.closest('[data-flow-action="add-button"]')) {
        this.addFlowButton();
      }
      if (e.target.closest('[data-flow-action="remove-button"]')) {
        const index = parseInt(e.target.closest('[data-flow-action="remove-button"]').dataset.index, 10);
        this.removeFlowButton(index);
      }
      if (e.target.closest('[data-flow-action="add-list-item"]')) {
        this.addFlowListItem();
      }
      if (e.target.closest('[data-flow-action="remove-list-item"]')) {
        const index = parseInt(e.target.closest('[data-flow-action="remove-list-item"]').dataset.index, 10);
        this.removeFlowListItem(index);
      }
      if (e.target.closest('[data-flow-action="add-menu-option"]')) {
        this.addFlowMenuOption();
      }
      if (e.target.closest('[data-flow-action="remove-menu-option"]')) {
        const index = parseInt(e.target.closest('[data-flow-action="remove-menu-option"]').dataset.index, 10);
        this.removeFlowMenuOption(index);
      }
    });

    page.addEventListener('change', (e) => {
      if (e.target.closest('#wcNodeTransferType')) {
        const node = this.getSelectedFlowNode();
        if (node) {
          node.config.targetType = e.target.value;
          node.config.targetId = '';
          this.refreshFlowPropertiesPanel();
        }
      }
      if (e.target.closest('#wcNodeCtaType')) {
        const node = this.getSelectedFlowNode();
        if (node) {
          node.config.ctaType = e.target.value;
        }
      }
    });

    page.addEventListener('mousedown', (e) => {
      const minimap = e.target.closest('#wcFlowMinimap');
      if (minimap) {
        this.startFlowMinimapDrag(e.clientX, e.clientY);
        e.preventDefault();
        return;
      }

      const nodeElement = e.target.closest('.wc-flow-node');
      if (!nodeElement) return;
      if (e.target.closest('.wc-flow-node-connector')) return;
      if (this.state.flowConnecting) return;
      if (e.button !== 0) return;
      const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
      const node = flow?.nodes?.find(n => n.id === nodeElement.dataset.nodeId);
      if (!node) return;
      this.selectNode(node.id);
      const point = this.getFlowCanvasPoint(e.clientX, e.clientY);
      this.state.flowCanvasDragging = null;
      this.state.flowMinimapDragging = null;
      this.state.flowNodeDragging = {
        nodeId: node.id,
        offsetX: point.x - node.x,
        offsetY: point.y - node.y
      };
      nodeElement.classList.add('dragging');
      e.stopPropagation();
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (this.state.flowNodeDragging) {
        const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
        const node = flow?.nodes?.find(n => n.id === this.state.flowNodeDragging.nodeId);
        const nodeElement = document.querySelector(`.wc-flow-node[data-node-id="${this.state.flowNodeDragging.nodeId}"]`);
        if (!node || !nodeElement) return;
        const point = this.getFlowCanvasPoint(e.clientX, e.clientY);
        node.x = Math.max(0, point.x - this.state.flowNodeDragging.offsetX);
        node.y = Math.max(0, point.y - this.state.flowNodeDragging.offsetY);
        nodeElement.style.left = `${node.x}px`;
        nodeElement.style.top = `${node.y}px`;
        this.updateFlowConnectionsSvg();
        this.updateFlowMinimap();
        return;
      }
      if (this.state.flowCanvasDragging) {
        this.updateFlowCanvasPan(e.clientX, e.clientY);
        return;
      }
      if (this.state.flowMinimapDragging) {
        this.updateFlowMinimapDrag(e.clientX, e.clientY);
      }
    });

    document.addEventListener('mouseup', () => {
      if (this.state.flowNodeDragging) {
        const nodeElement = document.querySelector(`.wc-flow-node[data-node-id="${this.state.flowNodeDragging.nodeId}"]`);
        nodeElement?.classList.remove('dragging');
        this.state.flowNodeDragging = null;
        this.saveState();
      }
      if (this.state.flowCanvasDragging) {
        this.stopFlowCanvasPan();
      }
      if (this.state.flowMinimapDragging) {
        this.stopFlowMinimapDrag();
      }
    });

    if (!this.state.flowConnectionListenersInitialized) {
      this.state.flowConnectionListenersInitialized = true;
    page.addEventListener('mousedown', (e) => {
      const outputConnector = e.target.closest('.wc-flow-node-connector.output');
        if (!outputConnector) return;
        const node = outputConnector.closest('.wc-flow-node');
        if (!node) return;
        e.preventDefault();
      this.startFlowConnection(node.dataset.nodeId, outputConnector.dataset.handle || 'default');
      });

      document.addEventListener('mousemove', (e) => {
        if (!this.state.flowConnecting) return;
        this.updateFlowConnectionTemp(e.clientX, e.clientY);
      });

      document.addEventListener('mouseup', (e) => {
        if (!this.state.flowConnecting) return;
        const inputConnector = e.target.closest?.('.wc-flow-node-connector.input');
        const node = inputConnector?.closest('.wc-flow-node');
        const targetNodeId = node?.dataset.nodeId || null;
        this.finishFlowConnection(targetNodeId);
      });
    }

    page.addEventListener('mousedown', (e) => {
      const canvas = e.target.closest('#wcFlowCanvas');
      if (!canvas) return;
      if (this.state.flowNodeDragging) return;
      if (e.target.closest('.wc-flow-node')) return;
      if (e.target.closest('.wc-flow-node-connector')) return;
      if (e.target.closest('.wc-flow-canvas-controls')) return;
      if (this.state.flowConnecting) return;
      if (e.button !== 0) return;
      this.startFlowCanvasPan(e.clientX, e.clientY);
      e.preventDefault();
    });

    page.addEventListener('wheel', (e) => {
      const canvas = e.target.closest('#wcFlowCanvas');
      if (!canvas) return;
      if (!this.state.flowEditorMode) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      this.zoomFlow(delta, { clientX: e.clientX, clientY: e.clientY });
    }, { passive: false });

    /* FAQ actions disabled for now
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
    */

    // Campaign actions
    page.addEventListener('click', (e) => {
      if (e.target.closest('#wcSyncTemplatesBtn')) {
        this.syncTemplates();
      }

      if (e.target.closest('#wcCreateTemplateBtn')) {
        this.showCreateTemplateModal();
      }

      if (e.target.closest('#wcSendNowBtn')) {
        this.sendCampaignNow();
      }

      if (e.target.closest('#wcScheduleCampaignBtn')) {
        this.openScheduleCampaignModal();
      }

      const previewTemplateBtn = e.target.closest('[data-action="preview"][data-template-id]');
      if (previewTemplateBtn) {
        this.previewTemplate(previewTemplateBtn.dataset.templateId);
      }

      const useTemplateBtn = e.target.closest('[data-action="use"][data-template-id]');
      if (useTemplateBtn) {
        this.useTemplate(useTemplateBtn.dataset.templateId);
      }

      const apiRestTab = e.target.closest('[data-api-rest-tab]');
      if (apiRestTab) {
        this.state.activeApiRestTab = apiRestTab.dataset.apiRestTab || 'overview';
        this.renderWorkspace();
      }

      const sourceBtn = e.target.closest('[data-campaign-source]');
      if (sourceBtn) {
        this.setCampaignSource(sourceBtn.dataset.campaignSource);
      }

      const audienceBtn = e.target.closest('[data-campaign-audience]');
      if (audienceBtn) {
        this.setCampaignAudience(audienceBtn.dataset.campaignAudience);
      }

      const filterBtn = e.target.closest('[data-campaign-filter]');
      if (filterBtn) {
        this.toggleCampaignFilter(filterBtn.dataset.campaignFilter);
      }

      const editScheduledBtn = e.target.closest('[data-action="edit-scheduled"][data-campaign-id]');
      if (editScheduledBtn) {
        this.openEditScheduledCampaignModal(editScheduledBtn.dataset.campaignId);
      }

      const deleteScheduledBtn = e.target.closest('[data-action="delete-scheduled"][data-campaign-id]');
      if (deleteScheduledBtn) {
        this.deleteScheduledCampaign(deleteScheduledBtn.dataset.campaignId);
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

      const copyTargetBtn = e.target.closest('[data-copy-target]');
      if (copyTargetBtn) {
        this.copyInputValue(copyTargetBtn.dataset.copyTarget);
      }

      if (e.target.closest('#wcTestConnectionBtn')) {
        this.testConnection();
      }
      if (e.target.closest('#wcMarkWebhookVerifiedBtn')) {
        const token = localStorage.getItem('token');
        const accountId = this.state.activeAccountId;
        const verifyToken = document.getElementById('wcConnectionVerifyToken')?.value?.trim();
        
        // Validate that accountId exists in our accounts list
        const accountExists = accountId && this.state.accounts.find(a => String(a.id) === String(accountId));
        
        if (!token || !accountId || !accountExists || !verifyToken) {
          this.notify('error', 'Enter verify token and select a valid account');
          return;
        }
        fetch(`/api/whatsapp-cloud/accounts/${accountId}/mark-webhook-verified`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ verify_token: verifyToken })
        })
          .then(r => r.json())
          .then(res => {
            if (res.success) {
              this.notify('success', 'Webhook verified');
              this.loadAccounts();
            } else {
              this.notify('error', res.message || 'Verification failed');
            }
          })
          .catch(() => this.notify('error', 'Verification failed'));
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
      if (e.target.matches('[data-campaign-group-id]')) {
        this.toggleCampaignGroup(e.target.dataset.campaignGroupId, e.target.checked);
      }
      if (e.target.id === 'wcAttendedFilter') {
        this.state.filters.attended = e.target.value || 'all';
        this.renderWorkspace();
      }
      if (e.target.id === 'wcAttendantFilter') {
        this.state.filters.attendant = e.target.value || '';
        this.renderWorkspace();
      }
    });

    page.addEventListener('input', (e) => {
      if (e.target.id === 'wcCampaignCustomNumbers') {
        this.state.campaignCustomNumbers = e.target.value;
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
  
  loadDirectories() {
    const token = localStorage.getItem('token');
    if (!token) return;
    const storesUrl = this.userMode ? '/api/user/whatsapp-cloud/stores' : '/api/tenant/stores';
    const departmentsUrl = this.userMode ? '/api/user/whatsapp-cloud/departments' : '/api/tenant/departments';
    Promise.all([
      fetch(storesUrl, { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch(departmentsUrl, { headers: { 'Authorization': `Bearer ${token}` } })
    ])
      .then(async ([storesRes, deptsRes]) => {
        const storesData = storesRes.ok ? await storesRes.json() : { data: [] };
        const deptsData = deptsRes.ok ? await deptsRes.json() : { data: [] };
        this.state.directories.stores = storesData.data || [];
        this.state.directories.departments = deptsData.data || [];
      })
      .catch(() => {
        this.state.directories.stores = this.state.directories.stores || [];
        this.state.directories.departments = this.state.directories.departments || [];
      });
  },
  
  getFilteredCards(list) {
    const source = Array.isArray(list) ? list.slice() : this.state.pipeline.cards.slice();
    const attended = this.state.filters.attended || 'all';
    const attendant = (this.state.filters.attendant || '').toLowerCase();
    let result = source;
    if (attended === 'attended') {
      result = result.filter(c => !!c.claimed_by);
    } else if (attended === 'unassigned') {
      result = result.filter(c => !c.claimed_by);
    }
    if (attendant) {
      result = result.filter(c => (c.claimed_by || '').toLowerCase().includes(attendant));
    }
    return result;
  },
  
  getAttendantLabel(card) {
    if (!card.claimed_by) return 'Unassigned';
    const store = (() => {
      const sid = card.storeId;
      if (!sid) return '';
      const s = this.state.directories.stores.find(x => String(x.id) === String(sid) || String(x.name) === String(sid));
      return s?.name || s?.store_name || '';
    })();
    const dept = (() => {
      const did = card.departmentId;
      if (!did) return '';
      const d = this.state.directories.departments.find(x => String(x.id) === String(did) || String(x.name) === String(did));
      return d?.name || d?.department_name || '';
    })();
    const loc = [store, dept].filter(Boolean).join('/');
    return loc ? `${card.claimed_by} - ${loc}` : card.claimed_by;
  },

  // ============================================
  // DRAG AND DROP
  // ============================================

  initDragAndDrop() {
    if (this.state.dragDropInitialized) return;
    this.state.dragDropInitialized = true;
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
      if (column && this.state.draggedColumn && this.state.draggedColumn !== column.dataset.stageId) {
        e.preventDefault();
        column.classList.add('drag-over');
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
      const column = e.target.closest('.wc-pipeline-column');
      if (column && this.state.draggedColumn) {
        e.preventDefault();
        column.classList.remove('drag-over');
        this.reorderColumn(this.state.draggedColumn, column.dataset.stageId);
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
        const point = this.getFlowCanvasPoint(e.clientX, e.clientY);
        const x = point.x;
        const y = point.y;
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

    if (tabId === 'campaigns') {
      Promise.resolve(this.loadTemplates()).finally(() => this.renderWorkspace());
    } else {
      this.renderWorkspace();
    }
  },

  renderWorkspace() {
    const contentArea = document.querySelector('.wc-tab-content');
    if (contentArea) {
      contentArea.innerHTML = this.renderTabContent();
    }
    
    // Re-initialize drag and drop after re-render
    this.initDragAndDrop();
    if (this.state.activeTab === 'flow-builder' && this.state.flowEditorMode) {
      requestAnimationFrame(() => {
        this.applyFlowCanvasTransform();
        this.updateFlowConnectionsSvg();
        this.updateFlowMinimap();
      });
    }
    if (typeof i18n !== 'undefined' && i18n.translatePage) {
      i18n.translatePage();
    }
  },
  
  // Global initializer for the WhatsApp Cloud page (without sidebar)
  // Called by main.js when navigating to /admin/#whatsapp-cloud
  // Ensures sidebar stays hidden on the Cloud page
  initCloudPage() {
    this.state.hideSidebar = true;
    if (!this.state.initialized) {
      this.init();
    } else {
      this.render();
      this.initEventListeners();
      this.initDragAndDrop();
    }
  },
  
  mountConversationsPage() {
    const host = document.getElementById('conversations-page');
    if (!host) return;
    
    // Set user mode configuration
    this.state.readOnly = false; // Allow drag and drop for users
    this.state.hideSidebar = false;
    
    const containerId = 'whatsapp-cloud-page';
    let container = host.querySelector('#' + containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      host.innerHTML = '';
      host.appendChild(container);
    }
    
    Promise.all([this.loadAccounts(), this.loadPipelineStages(), this.loadConversations()]).finally(() => {
      container.innerHTML = `
        <div class="wc-workspace" id="wcWorkspace">
          <div class="wc-internal-sidebar" id="wcInternalSidebar">
            ${this.renderInternalSidebar()}
          </div>
          <div class="wc-main-content">
            <div class="wc-tab-content">
              <div class="wc-tab-panel active" data-panel="conversations">
                ${this.renderConversationsTab()}
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Inject user-specific CSS
      this.injectUserConversationsCSS();
      
      // Apply translations
      if (typeof i18n !== 'undefined' && i18n.translatePage) {
        i18n.translatePage();
      }
      
      // Initialize event listeners and drag and drop
      this.initEventListeners();
      this.initDragAndDrop();
      
      // Ensure drag and drop is working by adding additional initialization
      setTimeout(() => {
        this.ensureDragAndDropWorking();
      }, 500);
    });
  },
  
  // Ensure drag and drop is working properly for users
  ensureDragAndDropWorking() {
    const cards = document.querySelectorAll('.wc-pipeline-card');
    cards.forEach(card => {
      if (!card.hasAttribute('draggable')) {
        card.setAttribute('draggable', 'true');
      }
    });
    
    const columns = document.querySelectorAll('.wc-pipeline-column-body');
    columns.forEach(column => {
      // Add visual feedback for drop zones
      column.addEventListener('dragenter', (e) => {
        if (this.state.draggedCard) {
          e.preventDefault();
          column.classList.add('drag-over');
        }
      });
      
      column.addEventListener('dragleave', (e) => {
        // Only remove if we're actually leaving the column
        if (!column.contains(e.relatedTarget)) {
          column.classList.remove('drag-over');
        }
      });
    });
    
    console.log('✅ Drag and drop functionality ensured for user mode');
  },
  
  injectUserConversationsCSS() {
    const linkId = 'tenant-conversations-user-css';
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = '/user/css/conversations-user.css';
      document.head.appendChild(link);
    }
  },

  // ============================================
  // PIPELINE METHODS
  // ============================================

  moveCard(cardId, newStageId) {
    const card = this.state.pipeline.cards.find(c => c.id === cardId);
    if (!card || card.stageId === newStageId) {
      return;
    }

    const oldStageId = card.stageId;
    const oldStage = this.state.pipeline.stages.find(s => s.id === oldStageId);
    const newStage = this.state.pipeline.stages.find(s => s.id === newStageId);
    
    console.log(`Moving card ${cardId} from ${oldStage?.name || oldStageId} to ${newStage?.name || newStageId}`);
    
    // Add visual feedback
    const cardElement = document.querySelector(`[data-card-id="${cardId}"]`);
    if (cardElement) {
      cardElement.classList.add('moving');
    }
    
    // Update local state immediately for better UX
    card.stageId = newStageId;
    this.saveState();
    this.renderWorkspace();
    
    // Show loading notification
    this.notify('info', 'Updating conversation stage...');
    
    // Persist to backend
    this.updateConversationStage(cardId, newStageId)
      .then(() => {
        this.notify('success', `Conversation moved to ${newStage?.name || 'new stage'}`);
        
        // Add success animation
        setTimeout(() => {
          const newCardElement = document.querySelector(`[data-card-id="${cardId}"]`);
          if (newCardElement) {
            newCardElement.classList.remove('moving');
            newCardElement.classList.add('just-moved');
            setTimeout(() => {
              newCardElement.classList.remove('just-moved');
            }, 600);
          }
        }, 100);
      })
      .catch((error) => {
        console.error('Failed to update conversation stage:', error);
        
        // Remove loading state
        if (cardElement) {
          cardElement.classList.remove('moving');
        }
        
        // Revert local state on error
        card.stageId = oldStageId;
        this.saveState();
        this.renderWorkspace();
        this.notify('error', 'Failed to update conversation stage. Please try again.');
      });
  },

  async updateConversationStage(conversationId, stageId) {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token');
    }

    const isWeb = this.state.whatsappWebActive || this.state.activeAccountId === '__web__';
    const url = isWeb 
      ? `/api/tenant/conversations/${conversationId}/stage`
      : `/api/user/whatsapp-cloud/conversations/${conversationId}/stage`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({ stage: stageId })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  },

  reorderColumn(draggedStageId, targetStageId) {
    if (draggedStageId === targetStageId) return;

    const stages = this.state.pipeline.stages;
    const draggedIndex = stages.findIndex(s => s.id === draggedStageId);
    const targetIndex = stages.findIndex(s => s.id === targetStageId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Remove the dragged stage from its current position
    const [draggedStage] = stages.splice(draggedIndex, 1);

    // Insert it at the target position
    stages.splice(targetIndex, 0, draggedStage);

    // Save and re-render
    this.saveState();
    this.renderWorkspace();
    this.notify('success', 'Column order updated');
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
        this.notify('success', this.t('common.saved', 'Saved'));
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
        this.notify('success', this.t('common.saved', 'Saved'));
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
            <h3 data-i18n="conversations.title">Conversations</h3>
          </div>
          <div class="wc-chat-search">
            <i class="fas fa-search"></i>
            <input type="text" data-i18n-placeholder="conversations.search_placeholder" placeholder="Search conversations...">
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
          
          <div class="wc-chat-messages" id="wcChatMessages"></div>
          
          ${this.state.readOnly ? `
            <div class="wc-chat-readonly-banner">
              <i class="fas fa-eye"></i>
              <span data-i18n="conversations.admin_notice">You are viewing this conversation in monitoring mode. Only assigned users can send messages.</span>
            </div>
          ` : `
            <div class="wc-chat-input-area">
              <button class="wc-chat-attach-btn" title="Attach file">
                <i class="fas fa-paperclip"></i>
              </button>
              <button class="wc-chat-emoji-btn" title="Emoji">
                <i class="fas fa-smile"></i>
              </button>
              <input type="text" class="wc-chat-input" data-i18n-placeholder="chat.input_placeholder" placeholder="Type a message or type / for shortcuts" id="wcChatInput">
              <button class="wc-chat-mic-btn" title="Voice message">
                <i class="fas fa-microphone"></i>
              </button>
            </div>
          `}
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
              `).join('') : '<p class="wc-empty-text">No tags</p>'}
            </div>
          </div>
          
          <div class="wc-chat-section">
            <div class="wc-chat-section-header">
              <i class="fas fa-user-tie"></i>
              <span>Assign agent</span>
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
              <span>Pipeline stage</span>
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
              <span>Notes</span>
            </div>
            <div class="wc-chat-section-content">
              <textarea class="form-control" rows="4" placeholder="Add notes here..."></textarea>
            </div>
          </div>
          
          <div class="wc-chat-section">
            <div class="wc-chat-section-header">
              <i class="fas fa-photo-video"></i>
              <span>Media Assets</span>
            </div>
            <div class="wc-chat-section-content">
              <p class="wc-empty-text">No media shared</p>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    if (typeof i18n !== 'undefined' && i18n.translatePage) {
      i18n.translatePage();
    }
    
    // Load real messages
    this.loadMessages(card.id);
    
    // Auto-scroll to bottom
    const messagesContainer = document.getElementById('wcChatMessages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  },

  async loadMessages(conversationId) {
    try {
      const token = localStorage.getItem('token');
      const isWeb = this.state.whatsappWebActive || this.state.activeAccountId === '__web__';
      let url;
      if (this.userMode) {
        url = isWeb
          ? `/api/user/whatsapp-cloud/conversations/${conversationId}/messages?source=whatsapp_web`
          : `/api/user/whatsapp-cloud/conversations/${conversationId}/messages`;
      } else {
        url = isWeb
          ? `/api/tenant/conversations/${conversationId}/messages`
          : `/api/whatsapp-cloud/conversations/${conversationId}/messages`;
      }
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'ngrok-skip-browser-warning': 'true'
        }
      });
      const data = await res.json();
      const messages = data.data || [];
      const container = document.getElementById('wcChatMessages');
      if (!container) return;
      container.innerHTML = messages.map(msg => {
        const isOutgoing = msg.direction === 'outgoing' || msg.is_from_me || msg.sender_type === 'user';
        const bubbleClass = isOutgoing ? 'wc-chat-message-sent' : 'wc-chat-message-received';
        const text = msg.message_text || msg.body || msg.content || msg.text_content || '';
        const time = this.formatTime(msg.created_at || msg.timestamp || Date.now());
        return `
          <div class="wc-chat-message ${bubbleClass}">
            <div class="wc-chat-message-content">
              <p>${this.escapeHtml(text)}</p>
              <span class="wc-chat-message-time">${time}</span>
            </div>
          </div>
        `;
      }).join('');
      container.scrollTop = container.scrollHeight;
    } catch (e) {
      console.error('Error loading messages:', e);
    }
  },
  
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  closeChatModal() {
    const modal = document.getElementById('wcChatModal');
    if (modal) {
      modal.remove();
    }
    this.state.selectedCard = null;
  },

  sendMessage() {
    if (this.state.readOnly) return;
    const input = document.getElementById('wcChatInput');
    if (!input || !input.value.trim()) return;
    
    const message = input.value.trim();
    const conversationId = this.state.selectedCard?.id;
    if (!conversationId) return;
    const messagesContainer = document.getElementById('wcChatMessages');
    
    if (!this.userMode) {
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
      input.value = '';
      this.notify('success', this.t('whatsapp_cloud.message_sent', 'Message sent'));
      return;
    }
    
    const token = localStorage.getItem('token');
    if (!token) return;
    const isWeb = this.state.whatsappWebActive || this.state.activeAccountId === '__web__';
    fetch(`/api/user/whatsapp-cloud/conversations/${conversationId}/send-message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message, source: isWeb ? 'whatsapp_web' : 'whatsapp_cloud' })
    })
      .then(res => res.json())
      .then(result => {
        if (!result.success) {
          this.notify('error', result.message || this.t('common.error_sending_message', 'Error sending message'));
          return;
        }
        input.value = '';
        this.loadMessages(conversationId);
      })
      .catch(() => {
        this.notify('error', this.t('common.error_sending_message', 'Error sending message'));
      });
  },


  // ============================================
  // FLOW BUILDER METHODS
  // ============================================

  createNewFlow() {
    const newFlow = {
      id: 'flow_' + Date.now(),
      name: this.t('whatsapp_cloud.flow_default_name', 'New Flow'),
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

  showFlowSettingsModal() {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    if (!flow) return;
    const triggerValueRaw = (flow.triggerValue || '').trim();
    const resolvedTrigger = triggerValueRaw === '*' ? 'any' : (flow.trigger || 'keyword');
    this.showModal({
      title: this.t('whatsapp_cloud.flow_settings', 'Flow Settings'),
      content: `
        <div class="form-group">
          <label data-i18n="whatsapp_cloud.flow_name">${this.t('whatsapp_cloud.flow_name', 'Name')}</label>
          <input type="text" class="form-control" id="wcFlowName" value="${flow.name || ''}" data-i18n-placeholder="whatsapp_cloud.flow_name">
        </div>
        <div class="form-group">
          <label data-i18n="whatsapp_cloud.flow_description">${this.t('whatsapp_cloud.flow_description', 'Description')}</label>
          <textarea class="form-control" id="wcFlowDescription" rows="3" data-i18n-placeholder="whatsapp_cloud.flow_description">${flow.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label data-i18n="whatsapp_cloud.flow_trigger_type">${this.t('whatsapp_cloud.flow_trigger_type', 'Trigger')}</label>
          <select class="form-control" id="wcFlowTriggerType">
            <option value="any" ${resolvedTrigger === 'any' ? 'selected' : ''} data-i18n="whatsapp_cloud.flow_trigger_any">${this.t('whatsapp_cloud.flow_trigger_any', 'Any')}</option>
            <option value="keyword" ${resolvedTrigger === 'keyword' ? 'selected' : ''} data-i18n="whatsapp_cloud.flow_trigger_keyword">${this.t('whatsapp_cloud.flow_trigger_keyword', 'Keyword')}</option>
            <option value="welcome" ${resolvedTrigger === 'welcome' ? 'selected' : ''} data-i18n="whatsapp_cloud.flow_trigger_welcome">${this.t('whatsapp_cloud.flow_trigger_welcome', 'Welcome')}</option>
          </select>
        </div>
        <div class="form-group">
          <label data-i18n="whatsapp_cloud.flow_trigger_value">${this.t('whatsapp_cloud.flow_trigger_value', 'Trigger Word')}</label>
          <input type="text" class="form-control" id="wcFlowTriggerValue" value="${resolvedTrigger === 'any' ? '*' : triggerValueRaw}" placeholder="*" data-i18n-placeholder="whatsapp_cloud.flow_trigger_value">
          <div class="wc-flow-properties-help" data-i18n="whatsapp_cloud.flow_trigger_help">${this.t('whatsapp_cloud.flow_trigger_help', 'Use * for Any, or type a keyword')}</div>
        </div>
      `,
      onSubmit: () => {
        flow.name = document.getElementById('wcFlowName')?.value?.trim() || flow.name;
        flow.description = document.getElementById('wcFlowDescription')?.value?.trim() || '';
        const selectedTrigger = document.getElementById('wcFlowTriggerType')?.value || 'keyword';
        let triggerValue = document.getElementById('wcFlowTriggerValue')?.value?.trim() || '';
        if (selectedTrigger === 'any') triggerValue = '*';
        if (selectedTrigger === 'welcome') triggerValue = '';
        flow.trigger = selectedTrigger;
        flow.triggerValue = triggerValue;
        this.saveFlowToServer(flow)
          .then(() => {
            this.renderWorkspace();
            this.notify('success', this.t('whatsapp_cloud.flow_saved', 'Flow saved successfully'));
          })
          .catch(() => {
            this.notify('error', this.t('common.error_saving', 'Error saving changes'));
          });
        return true;
      }
    });
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
          this.notify('success', this.t('whatsapp_cloud.flow_status_updated', 'Flow status updated'));
        })
        .catch(() => {
          this.notify('error', this.t('common.error_saving', 'Error saving changes'));
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
          this.notify('success', this.t('whatsapp_cloud.flow_status_updated', 'Flow status updated'));
        })
        .catch(() => {
          this.notify('error', this.t('common.error_saving', 'Error saving changes'));
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
            this.notify('error', this.t('common.error_saving', 'Error saving changes'));
          });
      }
    });
  },

  saveFlow() {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    if (!flow) return;
    this.saveFlowToServer(flow)
      .then(() => {
        this.notify('success', this.t('whatsapp_cloud.flow_saved', 'Flow saved successfully'));
      })
      .catch(() => {
        this.notify('error', this.t('common.error_saving', 'Error saving changes'));
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
      return true;
    });
  },

  getDefaultNodeConfig(type) {
    if (type === 'send_message') return { message: '', footer: '' };
    if (type === 'send_media') return { mediaType: 'image', mediaUrl: '', caption: '' };
    if (type === 'button_message') return { message: '', footer: '', buttons: [{ text: '', payload: '' }] };
    if (type === 'list_message') return { header: '', body: '', footer: '', buttonText: '', items: [{ title: '', description: '', id: '' }] };
    if (type === 'cta_message') return { header: '', body: '', footer: '', buttonText: '', ctaType: 'url', ctaValue: '' };
    if (type === 'menu_options') return { prompt: '', options: [{ label: '', value: '' }] };
    if (type === 'collect_input') return { prompt: '', saveAs: '', inputType: 'text' };
    if (type === 'save_contact') return { nameVariable: '', phoneVariable: '', emailVariable: '', tags: '' };
    if (type === 'update_contact') return { nameVariable: '', phoneVariable: '', emailVariable: '', tags: '' };
    if (type === 'ai_control') return { mode: 'enable', aiConfigId: '', temperature: '', maxTokens: '', prompt: '', welcomeMessage: this.t('whatsapp_cloud.flow_field_ai_welcome_default', 'Hi, my name is {{persona}}. How can I help you?') };
    if (type === 'products') return { productIds: '', limit: 5, message: '', displayMode: 'list', includePrice: true };
    if (type === 'transfer') return { targetType: 'store', targetId: '' };
    if (type === 'delay') return { delay: 7, reaction: '', typingEffect: false };
    if (type === 'condition') return { condition: '' };
    if (type === 'end_chat') return {};
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
    this.clearFlowConnectionSelection();
    
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

  refreshFlowPropertiesPanel() {
    const propertiesPanel = document.getElementById('wcFlowProperties');
    if (propertiesPanel) {
      propertiesPanel.innerHTML = this.renderFlowProperties();
    }
  },

  getSelectedFlowNode() {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    return flow?.nodes?.find(n => n.id === this.state.selectedNode);
  },

  getFlowCanvasPoint(clientX, clientY) {
    const canvas = document.getElementById('wcFlowCanvas');
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.state.flowPan.x) / this.state.flowZoom,
      y: (clientY - rect.top - this.state.flowPan.y) / this.state.flowZoom
    };
  },

  applyFlowCanvasTransform() {
    const canvas = document.getElementById('wcFlowCanvasInner');
    if (canvas) {
      canvas.style.transform = `translate(${this.state.flowPan.x}px, ${this.state.flowPan.y}px) scale(${this.state.flowZoom})`;
    }
    this.updateFlowMinimapViewport();
  },

  getNodeDimensions(nodeId) {
    const el = document.querySelector(`.wc-flow-node[data-node-id="${nodeId}"]`);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      width: rect.width / this.state.flowZoom,
      height: rect.height / this.state.flowZoom
    };
  },

  updateFlowConnectionsSvg() {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    const svg = document.getElementById('wcFlowConnections');
    if (flow && svg) {
      if (this.state.selectedConnection) {
        const exists = (flow.connections || []).some(c => {
          const handle = c.fromHandle || 'default';
          return c.from === this.state.selectedConnection.from
            && c.to === this.state.selectedConnection.to
            && handle === (this.state.selectedConnection.handle || 'default');
        });
        if (!exists) {
          this.state.selectedConnection = null;
        }
      }
      const bounds = this.getFlowBounds(flow.nodes || []);
      const padding = 200;
      const width = Math.max(bounds.maxX + padding, 1000);
      const height = Math.max(bounds.maxY + padding, 800);
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      svg.innerHTML = this.renderFlowConnections(flow);
    }
  },

  initApiRestDocsTabs() {
    const container = document.getElementById('wcApiDocsTabs');
    if (!container) return;
    const tabs = Array.from(container.querySelectorAll('[data-doc-tab]'));
    const panels = Array.from(container.querySelectorAll('[data-doc-panel]'));
    const activateTab = (name) => {
      tabs.forEach(tab => {
        const isActive = tab.dataset.docTab === name;
        tab.style.background = isActive ? 'var(--primary)' : '#f8fafc';
        tab.style.color = isActive ? '#fff' : '#0f172a';
        tab.style.borderColor = isActive ? 'var(--primary)' : '#e2e8f0';
      });
      panels.forEach(panel => {
        panel.style.display = panel.dataset.docPanel === name ? 'block' : 'none';
      });
    };
    tabs.forEach(tab => {
      tab.addEventListener('click', () => activateTab(tab.dataset.docTab));
    });
    const initial = tabs[0];
    if (initial) {
      activateTab(initial.dataset.docTab);
    }
  },

  updateApiRestDocsBaseUrl() {
    const baseUrl = window.location.origin;
    const baseUrlElement = document.getElementById('wcApiDocsBaseUrl');
    if (baseUrlElement) {
      baseUrlElement.textContent = baseUrl;
    }
    const container = document.getElementById('wcApiDocsTabs');
    if (!container) return;
    const codeBlocks = Array.from(container.querySelectorAll('pre code'));
    codeBlocks.forEach(block => {
      if (block.textContent.includes('__BASE_URL__')) {
        block.textContent = block.textContent.replaceAll('__BASE_URL__', baseUrl);
      }
    });
  },

  getButtonConnectorOffset(index) {
    const headerHeight = 40;
    const messageHeight = 24;
    const messageGap = 10;
    const rowHeight = 36;
    return headerHeight + messageHeight + messageGap + (rowHeight * index) + (rowHeight / 2);
  },

  getNodeOutputPoint(node, handle) {
    const dims = this.getNodeDimensions(node.id);
    const width = dims?.width || 200;
    const x = node.x + width;
    if (node.type === 'button_message' && handle && handle.startsWith('button-')) {
      const index = parseInt(handle.replace('button-', ''), 10);
      if (!Number.isNaN(index)) {
        return { x, y: node.y + this.getButtonConnectorOffset(index) };
      }
    }
    const height = dims?.height || 80;
    return { x, y: node.y + height / 2 };
  },

  getNodeInputPoint(node) {
    const dims = this.getNodeDimensions(node.id);
    const height = dims?.height || 80;
    return { x: node.x, y: node.y + height / 2 };
  },

  startFlowConnection(nodeId, handle) {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    const fromNode = flow?.nodes?.find(n => n.id === nodeId);
    if (!fromNode) return;
    this.state.flowConnecting = { fromNodeId: nodeId, fromHandle: handle || 'default' };
    this.state.flowConnectionTarget = null;
    document.getElementById('wcFlowCanvasInner')?.classList.add('connecting');
    document.querySelector(`.wc-flow-node[data-node-id="${nodeId}"]`)?.classList.add('connection-source');
    const svg = document.getElementById('wcFlowConnections');
    if (svg && !document.getElementById('wcFlowConnectionTemp')) {
      const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tempPath.setAttribute('id', 'wcFlowConnectionTemp');
      tempPath.setAttribute('class', 'wc-flow-connection-temp');
      svg.appendChild(tempPath);
    }
  },

  updateFlowConnectionTemp(clientX, clientY) {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    const fromNode = flow?.nodes?.find(n => n.id === this.state.flowConnecting?.fromNodeId);
    if (!fromNode) return;
    const startPoint = this.getNodeOutputPoint(fromNode, this.state.flowConnecting?.fromHandle);
    const startX = startPoint.x;
    const startY = startPoint.y;
    const end = this.getFlowCanvasPoint(clientX, clientY);
    const curveOffset = Math.max(80, Math.abs(end.x - startX) / 2);
    const d = `M ${startX} ${startY} C ${startX + curveOffset} ${startY}, ${end.x - curveOffset} ${end.y}, ${end.x} ${end.y}`;
    const tempPath = document.getElementById('wcFlowConnectionTemp');
    if (tempPath) {
      tempPath.setAttribute('d', d);
    }

    const hoverConnector = document.elementFromPoint(clientX, clientY)?.closest('.wc-flow-node-connector.input');
    const hoverNode = hoverConnector?.closest('.wc-flow-node');
    const hoverId = hoverNode?.dataset.nodeId || null;
    if (hoverId !== this.state.flowConnectionTarget) {
      if (this.state.flowConnectionTarget) {
        document.querySelector(`.wc-flow-node[data-node-id="${this.state.flowConnectionTarget}"]`)?.classList.remove('connection-target');
      }
      if (hoverId) {
        hoverNode?.classList.add('connection-target');
      }
      this.state.flowConnectionTarget = hoverId;
    }
  },

  finishFlowConnection(targetNodeId) {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    const fromNodeId = this.state.flowConnecting?.fromNodeId;
    const fromHandle = this.state.flowConnecting?.fromHandle || 'default';
    if (!flow || !fromNodeId) {
      this.clearFlowConnectionState();
      return;
    }
    if (targetNodeId && targetNodeId !== fromNodeId) {
      flow.connections = flow.connections || [];
      const exists = flow.connections.some(c => c.from === fromNodeId && c.to === targetNodeId && (c.fromHandle || 'default') === fromHandle);
      if (!exists) {
        flow.connections.push({ from: fromNodeId, to: targetNodeId, fromHandle });
        this.clearFlowConnectionState();
        this.saveState();
        this.renderWorkspace();
        return;
      }
    }
    this.clearFlowConnectionState();
  },

  clearFlowConnectionState() {
    this.state.flowConnecting = null;
    if (this.state.flowConnectionTarget) {
      document.querySelector(`.wc-flow-node[data-node-id="${this.state.flowConnectionTarget}"]`)?.classList.remove('connection-target');
    }
    this.state.flowConnectionTarget = null;
    document.getElementById('wcFlowCanvasInner')?.classList.remove('connecting');
    document.querySelectorAll('.wc-flow-node.connection-source').forEach(node => node.classList.remove('connection-source'));
    document.getElementById('wcFlowConnectionTemp')?.remove();
  },

  selectFlowConnection({ from, to, handle }) {
    this.state.selectedConnection = {
      from,
      to,
      handle: handle || 'default'
    };
    this.updateFlowConnectionsSvg();
  },

  clearFlowConnectionSelection() {
    if (!this.state.selectedConnection) return;
    this.state.selectedConnection = null;
    this.updateFlowConnectionsSvg();
  },

  deleteFlowConnection({ from, to, handle }) {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    if (!flow || !flow.connections) return;
    const normalizedHandle = handle || 'default';
    flow.connections = flow.connections.filter(c => {
      const connHandle = c.fromHandle || 'default';
      return !(c.from === from && c.to === to && connHandle === normalizedHandle);
    });
    this.state.selectedConnection = null;
    this.updateFlowConnectionsSvg();
    this.saveState();
  },

  syncButtonMessageDraft() {
    const node = this.getSelectedFlowNode();
    if (!node || node.type !== 'button_message') return;
    const getValue = (id) => document.getElementById(id)?.value || '';
    node.config.message = getValue('wcNodeMessage').trim();
    node.config.footer = getValue('wcNodeFooter').trim();
    const currentButtons = node.config.buttons || [];
    node.config.buttons = currentButtons.map((btn, index) => ({
      text: getValue(`wcNodeButtonText_${index}`).trim(),
      payload: getValue(`wcNodeButtonPayload_${index}`).trim()
    }));
    node.content = node.config.message;
  },

  addFlowButton() {
    const node = this.getSelectedFlowNode();
    if (!node) return;
    this.syncButtonMessageDraft();
    node.config.buttons = node.config.buttons || [];
    if (node.config.buttons.length >= 3) return;
    node.config.buttons.push({ text: '', payload: '' });
    this.refreshFlowPropertiesPanel();
  },

  removeFlowButton(index) {
    const node = this.getSelectedFlowNode();
    if (!node || !node.config.buttons) return;
    this.syncButtonMessageDraft();
    node.config.buttons.splice(index, 1);
    this.refreshFlowPropertiesPanel();
  },

  addFlowListItem() {
    const node = this.getSelectedFlowNode();
    if (!node) return;
    node.config.items = node.config.items || [];
    if (node.config.items.length >= 10) return;
    node.config.items.push({ title: '', description: '', id: '' });
    this.refreshFlowPropertiesPanel();
  },

  removeFlowListItem(index) {
    const node = this.getSelectedFlowNode();
    if (!node || !node.config.items) return;
    node.config.items.splice(index, 1);
    this.refreshFlowPropertiesPanel();
  },

  addFlowMenuOption() {
    const node = this.getSelectedFlowNode();
    if (!node) return;
    node.config.options = node.config.options || [];
    if (node.config.options.length >= 10) return;
    node.config.options.push({ label: '', value: '' });
    this.refreshFlowPropertiesPanel();
  },

  removeFlowMenuOption(index) {
    const node = this.getSelectedFlowNode();
    if (!node || !node.config.options) return;
    node.config.options.splice(index, 1);
    this.refreshFlowPropertiesPanel();
  },

  saveNodeProperties() {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    const node = flow?.nodes?.find(n => n.id === this.state.selectedNode);
    
    if (!node) return;

    const getValue = (id) => document.getElementById(id)?.value || '';

    if (node.type === 'send_message') {
      const message = getValue('wcNodeMessage').trim();
      node.config.message = message;
      node.config.footer = getValue('wcNodeFooter').trim();
      node.content = message;
    } else if (node.type === 'send_media') {
      node.config.mediaType = getValue('wcNodeMediaType') || 'image';
      node.config.mediaUrl = getValue('wcNodeMediaUrl').trim();
      node.config.caption = getValue('wcNodeCaption').trim();
      node.content = node.config.mediaUrl;
    } else if (node.type === 'button_message') {
      const message = getValue('wcNodeMessage').trim();
      if (!message) {
        this.notify('error', this.t('whatsapp_cloud.flow_error_message_required', 'Message is required.'));
        return;
      }
      node.config.message = message;
      node.config.footer = getValue('wcNodeFooter').trim();
      const buttons = [];
      const currentButtons = node.config.buttons || [];
      currentButtons.forEach((_, index) => {
        const text = getValue(`wcNodeButtonText_${index}`).trim();
        const payload = getValue(`wcNodeButtonPayload_${index}`).trim();
        if (!text) {
          this.notify('error', this.t('whatsapp_cloud.flow_error_button_text_required', 'Button title is required.'));
          return;
        }
        if (text || payload) {
          buttons.push({ text, payload });
        }
      });
      if (buttons.length !== currentButtons.length) return;
      node.config.buttons = buttons;
      node.content = message;
    } else if (node.type === 'list_message') {
      node.config.header = getValue('wcNodeHeader').trim();
      node.config.body = getValue('wcNodeBody').trim();
      node.config.footer = getValue('wcNodeFooter').trim();
      node.config.buttonText = getValue('wcNodeButtonText').trim();
      const items = [];
      const currentItems = node.config.items || [];
      currentItems.forEach((_, index) => {
        const title = getValue(`wcNodeListTitle_${index}`).trim();
        const description = getValue(`wcNodeListDescription_${index}`).trim();
        const id = getValue(`wcNodeListId_${index}`).trim();
        if (title || description || id) {
          items.push({ title, description, id });
        }
      });
      node.config.items = items;
      node.content = node.config.body;
    } else if (node.type === 'cta_message') {
      node.config.header = getValue('wcNodeHeader').trim();
      node.config.body = getValue('wcNodeBody').trim();
      node.config.footer = getValue('wcNodeFooter').trim();
      node.config.buttonText = getValue('wcNodeButtonText').trim();
      node.config.ctaType = getValue('wcNodeCtaType') || 'url';
      node.config.ctaValue = getValue('wcNodeCtaValue').trim();
      node.content = node.config.body;
    } else if (node.type === 'menu_options') {
      node.config.prompt = getValue('wcNodePrompt').trim();
      const options = [];
      const currentOptions = node.config.options || [];
      currentOptions.forEach((_, index) => {
        const label = getValue(`wcNodeMenuLabel_${index}`).trim();
        const value = getValue(`wcNodeMenuValue_${index}`).trim();
        if (label || value) {
          options.push({ label, value });
        }
      });
      node.config.options = options;
      node.content = node.config.prompt;
    } else if (node.type === 'collect_input') {
      node.config.prompt = getValue('wcNodePrompt').trim();
      node.config.saveAs = getValue('wcNodeSaveAs').trim();
      node.config.inputType = getValue('wcNodeInputType') || 'text';
      node.content = node.config.prompt;
    } else if (node.type === 'save_contact' || node.type === 'update_contact') {
      node.config.nameVariable = getValue('wcNodeContactName').trim();
      node.config.phoneVariable = getValue('wcNodeContactPhone').trim();
      node.config.emailVariable = getValue('wcNodeContactEmail').trim();
      node.config.tags = getValue('wcNodeContactTags').trim();
      node.content = node.config.nameVariable;
    } else if (node.type === 'ai_control') {
      node.config.mode = getValue('wcNodeAiMode') || 'enable';
      node.config.aiConfigId = getValue('wcNodeAiConfig') || '';
      node.config.temperature = getValue('wcNodeAiTemperature').trim();
      node.config.maxTokens = getValue('wcNodeAiMaxTokens').trim();
      node.config.prompt = getValue('wcNodeAiPrompt').trim();
      node.config.welcomeMessage = getValue('wcNodeAiWelcomeMessage').trim();
      node.config.instructions = node.config.prompt;
      node.content = node.config.prompt;
    } else if (node.type === 'products') {
      const productSelect = document.getElementById('wcNodeProductIds');
      const selectedValues = productSelect
        ? Array.from(productSelect.selectedOptions || []).map(option => option.value).filter(Boolean)
        : [];
      node.config.productIds = selectedValues.join(',');
      node.config.limit = parseInt(getValue('wcNodeProductLimit'), 10) || 5;
      node.config.message = getValue('wcNodeProductMessage').trim();
      node.config.displayMode = getValue('wcNodeProductMode') || 'list';
      node.config.includePrice = getValue('wcNodeProductPrice') === 'yes';
      node.content = node.config.productIds;
    } else if (node.type === 'transfer') {
      node.config.targetType = getValue('wcNodeTransferType') || 'store';
      node.config.targetId = getValue('wcNodeTransferTarget') || '';
      node.content = node.config.targetType;
    } else if (node.type === 'delay') {
      const delayValue = parseInt(getValue('wcNodeDelayTime'), 10);
      node.config.delay = Number.isFinite(delayValue) ? Math.max(7, delayValue) : 7;
      node.config.reaction = getValue('wcNodeDelayReaction').trim();
      node.config.typingEffect = getValue('wcNodeDelayTyping') === 'yes';
      node.content = String(node.config.delay);
    } else if (node.type === 'end_chat') {
      node.content = this.t('whatsapp_cloud.flow_end_chat_summary', 'Ends the chat.');
    } else if (node.type === 'condition') {
      node.config.condition = getValue('wcNodeCondition').trim();
      node.content = node.config.condition;
    } else {
      node.content = getValue('wcNodeContent').trim();
    }

    this.saveState();
    this.renderWorkspace();
    this.notify('success', this.t('whatsapp_cloud.flow_node_saved', 'Node saved successfully'));
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
    this.notify('success', this.t('whatsapp_cloud.flow_node_deleted', 'Node deleted successfully'));
  },

  zoomFlow(delta, origin = null) {
    const canvas = document.getElementById('wcFlowCanvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const oldZoom = this.state.flowZoom;
    const nextZoom = Math.max(0.25, Math.min(2, oldZoom + delta));
    if (nextZoom === oldZoom) return;
    const originX = origin?.clientX ?? rect.left + rect.width / 2;
    const originY = origin?.clientY ?? rect.top + rect.height / 2;
    const ox = originX - rect.left;
    const oy = originY - rect.top;
    const worldX = (ox - this.state.flowPan.x) / oldZoom;
    const worldY = (oy - this.state.flowPan.y) / oldZoom;
    this.state.flowZoom = nextZoom;
    this.state.flowPan.x = ox - worldX * nextZoom;
    this.state.flowPan.y = oy - worldY * nextZoom;
    this.applyFlowCanvasTransform();
    this.saveState();
  },

  resetFlowZoom() {
    this.state.flowZoom = 1;
    this.state.flowPan = { x: 0, y: 0 };
    this.applyFlowCanvasTransform();
    this.saveState();
  },

  startFlowCanvasPan(clientX, clientY) {
    const canvas = document.getElementById('wcFlowCanvas');
    if (canvas) {
      canvas.classList.add('panning');
    }
    this.state.flowCanvasDragging = {
      startX: clientX,
      startY: clientY,
      startPanX: this.state.flowPan.x,
      startPanY: this.state.flowPan.y
    };
  },

  updateFlowCanvasPan(clientX, clientY) {
    if (!this.state.flowCanvasDragging) return;
    const dx = clientX - this.state.flowCanvasDragging.startX;
    const dy = clientY - this.state.flowCanvasDragging.startY;
    this.state.flowPan.x = this.state.flowCanvasDragging.startPanX + dx;
    this.state.flowPan.y = this.state.flowCanvasDragging.startPanY + dy;
    this.applyFlowCanvasTransform();
  },

  stopFlowCanvasPan() {
    const canvas = document.getElementById('wcFlowCanvas');
    if (canvas) {
      canvas.classList.remove('panning');
    }
    this.state.flowCanvasDragging = null;
    this.saveState();
  },

  getFlowBounds(nodes) {
    if (!nodes || nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    nodes.forEach(node => {
      const dims = this.getNodeDimensions(node.id);
      const width = dims?.width || 200;
      const height = dims?.height || 80;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + width);
      maxY = Math.max(maxY, node.y + height);
    });
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  },

  updateFlowMinimap() {
    const flow = this.state.flows.find(f => f.id === this.state.activeFlowId);
    const minimap = document.getElementById('wcFlowMinimap');
    const canvas = document.getElementById('wcFlowMinimapCanvas');
    if (!flow || !minimap || !canvas) return;
    const nodes = flow.nodes || [];
    if (nodes.length === 0) {
      canvas.innerHTML = '';
      this.updateFlowMinimapViewport();
      return;
    }
    const bounds = this.getFlowBounds(nodes);
    const width = minimap.clientWidth;
    const height = minimap.clientHeight;
    const padding = 24;
    const scale = Math.max(0.05, Math.min((width - padding) / (bounds.width || 1), (height - padding) / (bounds.height || 1)));
    const offsetX = (width - bounds.width * scale) / 2 - bounds.minX * scale;
    const offsetY = (height - bounds.height * scale) / 2 - bounds.minY * scale;
    canvas.dataset.scale = String(scale);
    canvas.dataset.offsetX = String(offsetX);
    canvas.dataset.offsetY = String(offsetY);
    canvas.innerHTML = nodes.map(node => {
      const dims = this.getNodeDimensions(node.id);
      const nodeWidth = (dims?.width || 200) * scale;
      const nodeHeight = (dims?.height || 80) * scale;
      return `
        <div class="wc-flow-minimap-node" style="left: ${node.x * scale + offsetX}px; top: ${node.y * scale + offsetY}px; width: ${nodeWidth}px; height: ${nodeHeight}px;"></div>
      `;
    }).join('');
    this.updateFlowMinimapViewport();
  },

  updateFlowMinimapViewport() {
    const viewport = document.getElementById('wcFlowMinimapViewport');
    const minimap = document.getElementById('wcFlowMinimap');
    const canvas = document.getElementById('wcFlowMinimapCanvas');
    const flowCanvas = document.getElementById('wcFlowCanvas');
    if (!viewport || !minimap || !canvas || !flowCanvas) return;
    const scale = parseFloat(canvas.dataset.scale || '0');
    const offsetX = parseFloat(canvas.dataset.offsetX || '0');
    const offsetY = parseFloat(canvas.dataset.offsetY || '0');
    if (!scale) {
      viewport.style.display = 'none';
      return;
    }
    const rect = flowCanvas.getBoundingClientRect();
    const viewWidth = rect.width / this.state.flowZoom;
    const viewHeight = rect.height / this.state.flowZoom;
    const viewX = (-this.state.flowPan.x) / this.state.flowZoom;
    const viewY = (-this.state.flowPan.y) / this.state.flowZoom;
    viewport.style.display = 'block';
    viewport.style.width = `${viewWidth * scale}px`;
    viewport.style.height = `${viewHeight * scale}px`;
    viewport.style.left = `${viewX * scale + offsetX}px`;
    viewport.style.top = `${viewY * scale + offsetY}px`;
  },

  startFlowMinimapDrag(clientX, clientY) {
    this.state.flowMinimapDragging = true;
    this.updateFlowMinimapDrag(clientX, clientY);
  },

  updateFlowMinimapDrag(clientX, clientY) {
    if (!this.state.flowMinimapDragging) return;
    const minimap = document.getElementById('wcFlowMinimap');
    const canvas = document.getElementById('wcFlowMinimapCanvas');
    const flowCanvas = document.getElementById('wcFlowCanvas');
    if (!minimap || !canvas || !flowCanvas) return;
    const scale = parseFloat(canvas.dataset.scale || '0');
    const offsetX = parseFloat(canvas.dataset.offsetX || '0');
    const offsetY = parseFloat(canvas.dataset.offsetY || '0');
    if (!scale) return;
    const miniRect = minimap.getBoundingClientRect();
    const canvasRect = flowCanvas.getBoundingClientRect();
    const localX = clientX - miniRect.left;
    const localY = clientY - miniRect.top;
    const worldX = (localX - offsetX) / scale;
    const worldY = (localY - offsetY) / scale;
    this.state.flowPan.x = canvasRect.width / 2 - worldX * this.state.flowZoom;
    this.state.flowPan.y = canvasRect.height / 2 - worldY * this.state.flowZoom;
    this.applyFlowCanvasTransform();
  },

  stopFlowMinimapDrag() {
    this.state.flowMinimapDragging = null;
    this.saveState();
  },

  // ============================================
  // FAQ METHODS
  // ============================================

  normalizeFaq(faq) {
    const keywords = Array.isArray(faq.keywords)
      ? faq.keywords
      : (typeof faq.keywords === 'string' && faq.keywords.length > 0
          ? faq.keywords.split(',').map(k => k.trim()).filter(k => k)
          : []);
    return {
      ...faq,
      keywords
    };
  },

  createFaq(payload) {
    const token = localStorage.getItem('token');
    if (!token) {
      this.notify('error', this.t('common.unauthorized', 'Unauthorized'));
      return;
    }
    fetch('/api/user/whatsapp-cloud/faqs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(res => res.json().then(data => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok || !data.success) {
          this.notify('error', data.error || this.t('common.error_saving', 'Error saving changes'));
          return;
        }
        this.loadFAQs();
        this.notify('success', this.t('whatsapp_cloud.faq_created_success', 'FAQ created successfully'));
        this.closeModal();
      })
      .catch(() => {
        this.notify('error', this.t('common.error_saving', 'Error saving changes'));
      });
  },

  updateFaq(faqId, payload) {
    const token = localStorage.getItem('token');
    if (!token) {
      this.notify('error', this.t('common.unauthorized', 'Unauthorized'));
      return;
    }
    fetch(`/api/user/whatsapp-cloud/faqs/${faqId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(res => res.json().then(data => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok || !data.success) {
          this.notify('error', data.error || this.t('common.error_saving', 'Error saving changes'));
          return;
        }
        this.loadFAQs();
        this.notify('success', this.t('whatsapp_cloud.faq_updated_success', 'FAQ updated successfully'));
        this.closeModal();
      })
      .catch(() => {
        this.notify('error', this.t('common.error_saving', 'Error saving changes'));
      });
  },

  deleteFaqRequest(faqId) {
    const token = localStorage.getItem('token');
    if (!token) {
      this.notify('error', this.t('common.unauthorized', 'Unauthorized'));
      return;
    }
    fetch(`/api/user/whatsapp-cloud/faqs/${faqId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => res.json().then(data => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok || !data.success) {
          this.notify('error', data.error || this.t('common.error_deleting', 'Error deleting'));
          return;
        }
        this.loadFAQs();
        this.notify('success', this.t('whatsapp_cloud.faq_deleted_success', 'FAQ deleted successfully'));
      })
      .catch(() => {
        this.notify('error', this.t('common.error_deleting', 'Error deleting'));
      });
  },

  toggleFaqStatus(faqId) {
    const token = localStorage.getItem('token');
    if (!token) {
      this.notify('error', this.t('common.unauthorized', 'Unauthorized'));
      return;
    }
    fetch(`/api/user/whatsapp-cloud/faqs/${faqId}/toggle`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => res.json().then(data => ({ res, data })))
      .then(({ res, data }) => {
        if (!res.ok || !data.success) {
          this.notify('error', data.error || this.t('common.error_saving', 'Error saving changes'));
          return;
        }
        this.loadFAQs();
      })
      .catch(() => {
        this.notify('error', this.t('common.error_saving', 'Error saving changes'));
      });
  },

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

        const payload = {
          question,
          answer,
          keywords: keywords && keywords.length ? keywords.join(', ') : null,
          category: category || 'general',
          active: true,
          account_id: this.state.activeAccountId && this.state.activeAccountId !== '__web__'
            ? this.state.activeAccountId
            : null
        };

        this.createFaq(payload);
        return false;
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
        const question = document.getElementById('wcFaqQuestion')?.value?.trim();
        const answer = document.getElementById('wcFaqAnswer')?.value?.trim();
        const keywords = document.getElementById('wcFaqKeywords')?.value?.split(',').map(k => k.trim()).filter(k => k);
        const category = document.getElementById('wcFaqCategory')?.value;
        const active = document.getElementById('wcFaqActive')?.checked;

        if (!question || !answer) {
          this.notify('error', this.t('whatsapp_cloud.faq_validation_error', 'Please enter question and answer'));
          return false;
        }

        const payload = {
          question,
          answer,
          keywords: keywords && keywords.length ? keywords.join(', ') : null,
          category: category || 'general',
          active: active !== false
        };

        this.updateFaq(faq.id, payload);
        return false;
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
        this.deleteFaqRequest(faqId);
      }
    });
  },

  toggleFaq(faqId) {
    this.toggleFaqStatus(faqId);
  },

  // ============================================
  // CAMPAIGN METHODS
  // ============================================

  syncTemplates() {
    const accountId = this.state.activeAccountId;
    const token = localStorage.getItem('token');
    
    // Validate that accountId exists in our accounts list
    const accountExists = accountId && this.state.accounts.find(a => String(a.id) === String(accountId));
    
    if (!accountId || !token || !accountExists) {
      this.notify('error', 'Select a valid account and ensure authentication');
      return;
    }
    this.notify('info', 'Syncing templates from Meta...');
    fetch(`/api/whatsapp-cloud/accounts/${accountId}/sync-templates`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          this.notify('success', 'Templates synced successfully');
          Promise.all([this.loadAccounts(), this.loadTemplates()]).finally(() => {
            if (this.state.activeTab === 'campaigns') {
              this.renderWorkspace();
            }
          });
        } else {
          this.notify('error', res.message || 'Failed to sync templates');
        }
      })
      .catch(() => this.notify('error', 'Failed to sync templates'));
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
        this.notify('success', this.t('common.saved', 'Saved'));
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
      previewText.innerHTML = this.t('whatsapp_cloud.campaigns_preview_body_text', 'Your message preview will appear here.');
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

  setCampaignSource(source) {
    if (!source) return;
    this.state.campaignSource = source;
    this.renderWorkspace();
  },

  setCampaignAudience(audienceType) {
    if (!audienceType) return;
    this.state.campaignAudienceType = audienceType;
    if (audienceType !== 'groups') {
      this.state.campaignGroupIds = [];
    }
    if (audienceType !== 'custom') {
      this.state.campaignCustomNumbers = '';
    }
    this.renderWorkspace();
  },

  toggleCampaignFilter(filterKey) {
    if (!filterKey) return;
    const filters = this.state.campaignFilters || {};
    filters[filterKey] = !filters[filterKey];
    this.state.campaignFilters = filters;
    this.renderWorkspace();
  },

  toggleCampaignGroup(groupId, isChecked) {
    const current = new Set((this.state.campaignGroupIds || []).map(id => String(id)));
    const id = String(groupId);
    if (isChecked) {
      current.add(id);
    } else {
      current.delete(id);
    }
    this.state.campaignGroupIds = Array.from(current);
  },

  getCampaignPayload() {
    const templateId = document.getElementById('wcCampaignTemplate')?.value;
    return {
      accountId: this.state.activeAccountId,
      templateId,
      source: this.state.campaignSource,
      audienceType: this.state.campaignAudienceType,
      audienceGroups: this.state.campaignGroupIds || [],
      audienceCustomNumbers: this.parseCustomNumbers(this.state.campaignCustomNumbers || ''),
      filters: this.state.campaignFilters || {}
    };
  },

  parseCustomNumbers(raw) {
    return String(raw || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
  },

  validateCampaignAudience(payload) {
    if (payload.audienceType === 'groups' && (!payload.audienceGroups || payload.audienceGroups.length === 0)) {
      this.notify('error', this.t('whatsapp_cloud.campaigns_groups_required', 'Select at least one group'));
      return false;
    }
    if (payload.audienceType === 'custom' && (!payload.audienceCustomNumbers || payload.audienceCustomNumbers.length === 0)) {
      this.notify('error', this.t('whatsapp_cloud.campaigns_custom_required', 'Add at least one custom number'));
      return false;
    }
    return true;
  },

  async sendCampaignNow() {
    const token = localStorage.getItem('token');
    const payload = this.getCampaignPayload();
    if (!token || !payload.accountId || !payload.templateId) {
      this.notify('error', this.t('whatsapp_cloud.campaigns_missing_fields', 'Required fields are missing'));
      return;
    }
    if (!this.validateCampaignAudience(payload)) {
      return;
    }
    if (payload.source !== 'meta') {
      this.notify('error', this.t('whatsapp_cloud.campaigns_source_not_supported', 'Custom source is not available for Cloud templates'));
      return;
    }
    this.notify('info', this.t('whatsapp_cloud.campaigns_sending', 'Sending campaign...'));
    try {
      const response = await fetch('/api/whatsapp-cloud/campaigns/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to send campaign');
      }
      const stats = data.data || {};
      this.notify('success', `${this.t('whatsapp_cloud.campaigns_sent_success', 'Campaign sent')}: ${stats.sent || 0}/${stats.total || 0}`);
    } catch (error) {
      this.notify('error', error.message || 'Failed to send campaign');
    }
  },

  openScheduleCampaignModal() {
    const timezones = this.getTimezoneOptions();
    const defaultTimezone = timezones[0] || 'UTC';
    this.showModal({
      title: this.t('whatsapp_cloud.campaigns_schedule_title', 'Schedule Campaign'),
      content: `
        <div class="form-group">
          <label>${this.t('whatsapp_cloud.campaigns_schedule_time', 'Send Time')}</label>
          <input type="datetime-local" class="form-control" id="wcCampaignScheduleTime">
        </div>
        <div class="form-group">
          <label>${this.t('whatsapp_cloud.campaigns_schedule_timezone', 'Time Zone')}</label>
          <select class="form-control" id="wcCampaignScheduleTimezone">
            ${timezones.map(tz => `<option value="${tz}" ${tz === defaultTimezone ? 'selected' : ''}>${tz}</option>`).join('')}
          </select>
        </div>
      `,
      submitText: this.t('whatsapp_cloud.campaigns_schedule', 'Schedule Campaign'),
      onSubmit: () => this.scheduleCampaign()
    });
  },

  async scheduleCampaign() {
    const token = localStorage.getItem('token');
    const payload = this.getCampaignPayload();
    const scheduleAt = document.getElementById('wcCampaignScheduleTime')?.value;
    const timezone = document.getElementById('wcCampaignScheduleTimezone')?.value || 'UTC';
    if (!token || !payload.accountId || !payload.templateId || !scheduleAt) {
      this.notify('error', this.t('whatsapp_cloud.campaigns_missing_fields', 'Required fields are missing'));
      return false;
    }
    if (!this.validateCampaignAudience(payload)) {
      return false;
    }
    if (payload.source !== 'meta') {
      this.notify('error', this.t('whatsapp_cloud.campaigns_source_not_supported', 'Custom source is not available for Cloud templates'));
      return false;
    }
    try {
      const response = await fetch('/api/whatsapp-cloud/campaigns', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...payload,
          scheduleAt,
          timezone
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to schedule campaign');
      }
      this.notify('success', this.t('whatsapp_cloud.campaigns_scheduled_success', 'Campaign scheduled'));
      this.loadScheduledCampaigns();
    } catch (error) {
      this.notify('error', error.message || 'Failed to schedule campaign');
      return false;
    }
    return true;
  },

  openEditScheduledCampaignModal(campaignId) {
    const campaign = (this.state.scheduledCampaigns || []).find(c => String(c.id) === String(campaignId));
    if (!campaign) return;
    const timezones = this.getTimezoneOptions();
    this.showModal({
      title: this.t('whatsapp_cloud.campaigns_edit_title', 'Edit Scheduled Campaign'),
      content: `
        <div class="form-group">
          <label>${this.t('whatsapp_cloud.campaigns_schedule_time', 'Send Time')}</label>
          <input type="datetime-local" class="form-control" id="wcEditCampaignScheduleTime" value="${campaign.schedule_at ? this.toDateTimeLocal(campaign.schedule_at) : ''}">
        </div>
        <div class="form-group">
          <label>${this.t('whatsapp_cloud.campaigns_schedule_timezone', 'Time Zone')}</label>
          <select class="form-control" id="wcEditCampaignScheduleTimezone">
            ${timezones.map(tz => `<option value="${tz}" ${tz === campaign.timezone ? 'selected' : ''}>${tz}</option>`).join('')}
          </select>
        </div>
      `,
      submitText: this.t('common.save', 'Save'),
      onSubmit: () => this.updateScheduledCampaign(campaignId)
    });
  },

  async updateScheduledCampaign(campaignId) {
    const token = localStorage.getItem('token');
    const scheduleAt = document.getElementById('wcEditCampaignScheduleTime')?.value;
    const timezone = document.getElementById('wcEditCampaignScheduleTimezone')?.value || 'UTC';
    if (!token || !scheduleAt) {
      this.notify('error', this.t('whatsapp_cloud.campaigns_missing_fields', 'Required fields are missing'));
      return false;
    }
    try {
      const response = await fetch(`/api/whatsapp-cloud/campaigns/${campaignId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scheduleAt,
          timezone
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to update campaign');
      }
      this.notify('success', this.t('whatsapp_cloud.campaigns_updated_success', 'Campaign updated'));
      this.loadScheduledCampaigns();
    } catch (error) {
      this.notify('error', error.message || 'Failed to update campaign');
      return false;
    }
    return true;
  },

  async deleteScheduledCampaign(campaignId) {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const response = await fetch(`/api/whatsapp-cloud/campaigns/${campaignId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.message || 'Failed to delete campaign');
      }
      this.notify('success', this.t('whatsapp_cloud.campaigns_deleted_success', 'Campaign deleted'));
      this.loadScheduledCampaigns();
    } catch (error) {
      this.notify('error', error.message || 'Failed to delete campaign');
    }
  },

  toDateTimeLocal(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
      `&config_id=${configId}` +
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

  checkFacebookCallback() {
    const code = localStorage.getItem('facebook_callback_code');
    const error = localStorage.getItem('facebook_callback_error');
    const timestampRaw = localStorage.getItem('facebook_callback_timestamp');
    const timestamp = timestampRaw ? parseInt(timestampRaw, 10) : null;
    if (error) {
      localStorage.removeItem('facebook_callback_error');
      this.notify('error', `Facebook login error: ${error}`);
    }
    if (!code) return;
    if (!timestamp || Date.now() - timestamp > 10 * 60 * 1000) {
      localStorage.removeItem('facebook_callback_code');
      localStorage.removeItem('facebook_callback_timestamp');
      return;
    }
    localStorage.removeItem('facebook_callback_code');
    localStorage.removeItem('facebook_callback_timestamp');
    this.handleFacebookLoginSuccess({ code });
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
    .then(response => response.json())
    .then(result => {
      if (result.success) {
        // Account connected successfully
        this.notify('success', 'WhatsApp account connected successfully!');
        
        // Reload accounts from backend
        this.loadAccounts();
        
        // Switch to the new account
        if (result.data.account_id) {
          this.state.activeAccountId = result.data.account_id;
        }
        
        // Re-render after a short delay to allow accounts to load
        setTimeout(() => {
          this.render();
        }, 500);
      } else {
        this.notify('error', result.message || 'Failed to connect account');
      }
    })
    .catch(error => {
      console.error('Error processing Facebook login:', error);
      this.notify('error', 'Failed to process Facebook login');
    });
  },

  copyWebhookUrl() {
    const webhookUrl = document.getElementById('wcWebhookUrl')?.value || `${window.location.origin}/webhook`;
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

  copyInputValue(inputId) {
    const input = document.getElementById(inputId);
    const value = input?.value || '';
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      this.notify('success', this.t('whatsapp_cloud.copy_success', 'Copied to clipboard'));
    }).catch(() => {
      if (input) {
        input.select();
        document.execCommand('copy');
        this.notify('success', this.t('whatsapp_cloud.copy_success', 'Copied to clipboard'));
      }
    });
  },

  testConnection() {
    const accountId = this.state.activeAccountId;
    const token = localStorage.getItem('token');
    
    // Validate that accountId exists in our accounts list
    const accountExists = accountId && this.state.accounts.find(a => String(a.id) === String(accountId));
    
    if (!accountId || !token || !accountExists) {
      this.notify('error', 'Select a valid account and ensure authentication');
      return;
    }
    this.notify('info', 'Testing connection...');
    fetch(`/api/whatsapp-cloud/accounts/${accountId}/test`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          this.notify('success', this.t('whatsapp_cloud.connection_test_success', 'Connection test successful'));
        } else {
          this.notify('error', res.message || this.t('whatsapp_cloud.connection_test_failed', 'Connection test failed'));
        }
      })
      .catch(() => this.notify('error', this.t('whatsapp_cloud.connection_test_failed', 'Connection test failed')));
  },

  saveConnection() {
    const name = document.getElementById('wcConnectionName')?.value?.trim();
    const wabaId = document.getElementById('wcConnectionWabaId')?.value?.trim();
    const phoneNumberId = document.getElementById('wcConnectionPhoneId')?.value?.trim();
    const appId = document.getElementById('wcConnectionAppId')?.value?.trim();
    const accessToken = document.getElementById('wcConnectionAccessToken')?.value?.trim();
    const verifyToken = document.getElementById('wcConnectionVerifyToken')?.value?.trim();
    const appSecret = document.getElementById('wcConnectionAppSecret')?.value?.trim();

    if (!name) {
      this.notify('error', 'Account name is required');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      this.notify('error', 'Authentication required');
      return;
    }

    const existingId = this.state.activeAccountId;
    
    // Validate that existingId actually exists in our accounts list
    const accountExists = existingId && this.state.accounts.find(a => String(a.id) === String(existingId));
    const shouldUpdate = existingId && accountExists;
    
    const payload = {
      account_name: name,
      waba_id: wabaId || undefined,
      phone_number_id: phoneNumberId || undefined,
      access_token: accessToken || '********',
      app_id: appId || undefined,
      app_secret: appSecret || '********',
      verify_token: verifyToken || undefined
    };

    const request = shouldUpdate
      ? fetch(`/api/whatsapp-cloud/accounts/${existingId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        })
      : fetch('/api/whatsapp-cloud/facebook-callback', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            manual: true,
            account_name: name,
            waba_id: wabaId || '',
            phone_number_id: phoneNumberId || '',
            phone_number: '',
            access_token: accessToken || ''
          })
        });

    request
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          this.notify('success', this.t('whatsapp_cloud.account_saved_success', 'Account saved successfully'));
          this.loadAccounts();
          this.switchTab('connection');
        } else {
          this.notify('error', res.message || this.t('common.error_saving', 'Error saving changes'));
        }
      })
      .catch(() => this.notify('error', this.t('common.error_saving', 'Error saving changes')));
  },

  selectAccount(accountId) {
    const account = this.state.accounts.find(a => String(a.id) === String(accountId));
    this.state.activeAccountId = accountId;
    this.saveState();
    Promise.all([
      this.loadFlows(),
      this.loadTemplates(),
      this.loadScheduledCampaigns()
    ]).finally(() => {
      this.renderWorkspace();
      this.notify('success', 'Account selected');
    });
  },

  editAccount(accountId) {
    this.state.activeAccountId = accountId;
    this.switchTab('connection');
  },

  deleteAccount(accountId) {
    // Find the account to get its name for confirmation
    const account = this.state.accounts.find(a => String(a.id) === String(accountId));
    const accountName = account ? account.name : 'this account';
    
    this.showConfirm({
      title: 'Delete WhatsApp Account',
      message: `Are you sure you want to delete "${accountName}"? This will permanently remove the account and all its data from the database. This action cannot be undone.`,
      confirmText: 'Delete Account',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        const token = localStorage.getItem('token');
        if (!token) {
          this.notify('error', 'Authentication required');
          return;
        }
        
        try {
          // Show loading state
          this.notify('info', 'Deleting account...');
          
          const res = await fetch(`/api/whatsapp-cloud/accounts/${accountId}`, {
            method: 'DELETE',
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          const data = await res.json();
          
          if (res.ok && data.success) {
            // Remove account from local state immediately
            this.state.accounts = this.state.accounts.filter(a => String(a.id) !== String(accountId));
            
            // If deleted account was active, set new active account
            if (String(this.state.activeAccountId) === String(accountId)) {
              this.state.activeAccountId = this.state.accounts.length > 0 ? this.state.accounts[0].id : null;
            }
            
            // Save state and re-render
            this.saveState();
            this.renderWorkspace();
            
            // Show success message
            this.notify('success', `Account "${accountName}" has been permanently deleted from the database`);
            
            // Reload accounts from server to ensure consistency
            await this.loadAccounts();
          } else {
            this.notify('error', data.message || 'Failed to delete account from database');
          }
        } catch (err) {
          console.error('Delete account error:', err);
          this.notify('error', 'Network error: Failed to delete account');
        }
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
        this.notify('success', this.t('common.saved', 'Saved'));
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
            <div class="wc-account-selector-item ${String(account.id) === String(this.state.activeAccountId) && !this.state.whatsappWebActive ? 'active' : ''}" 
                 data-account-id="${account.id}" data-account-status="${account.connectionStatus || account.status || 'pending'}">
              <div class="wc-account-selector-icon">
                <i class="fab fa-whatsapp"></i>
              </div>
              <div class="wc-account-selector-info">
                <h4>${account.name}</h4>
                <p>${account.phoneNumber || 'Phone ID: ' + (account.phoneNumberId || 'Not set')}</p>
              </div>
              <span class="wc-account-selector-status ${account.connectionStatus || account.status || 'pending'}">${account.connectionStatus || account.status || 'Pending'}</span>
            </div>
          `).join('')}
        </div>
      `,
      hideSubmit: true
    });

    setTimeout(() => {
      document.querySelectorAll('.wc-modal .wc-account-selector-item').forEach(item => {
        item.addEventListener('click', () => {
          const account = this.state.accounts.find(a => String(a.id) === String(item.dataset.accountId));
          const status = account?.connectionStatus || account?.status || 'disconnected';
          if (String(status).toLowerCase() !== 'connected') {
            this.notify('error', 'Account is disconnected');
            return;
          }
          this.state.whatsappWebActive = false;
          this.selectAccount(item.dataset.accountId);
          this.closeModal();
          this.loadConversations();
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
  
  setWhatsappWebActive() {
    this.state.whatsappWebActive = true;
    this.state.activeAccountId = '__web__';
    this.saveState();
    this.render();
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
          <button class="btn btn-danger" id="wcConfirmOk">${confirmBtn}</button>
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
  }
};

// Initialize when page loads
function initWhatsAppCloudPage() {
  WhatsAppCloud.init();
}

// Global initializer used by main.js routing
function initWhatsAppCloudPage() {
  try {
    WhatsAppCloud.initCloudPage();
  } catch (e) {
    console.error('Error initializing WhatsApp Cloud page:', e);
  }
}

// Export for global access
window.WhatsAppCloud = WhatsAppCloud;
window.initWhatsAppCloudPage = initWhatsAppCloudPage;
