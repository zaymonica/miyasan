/**
 * User Conversations Module
 * Complete implementation for store/department users
 * Features: Real-time messaging, Pipeline management, Conversation locking
 * 
 * @version 1.0.0
 * @author Misayan Team
 */

const UserConversations = {
  // ============================================
  // STATE MANAGEMENT
  // ============================================
  
  state: {
    // User info
    userId: null,
    userName: null,
    tenantId: null,
    storeId: null,
    departmentId: null,
    
    // Accounts
    accounts: [],
    activeAccountId: null,
    whatsappWebActive: false,
    webConnectionStatus: null,
    webConnectionFetchedAt: 0,
    transferOptions: {
      users: [],
      departments: [],
      stores: []
    },
    transferTargetType: 'department',
    
    // Conversations
    conversations: [],
    filteredConversations: [],
    selectedConversationId: null,
    selectedConversation: null,
    claimDeniedConversations: {},
    
    // Messages
    messages: [],
    messagesPagination: {
      page: 1,
      limit: 50,
      total: 0
    },
    lastMessagesRefreshAt: 0,
    
    // Pipeline
    pipeline: {
      stages: [], // Will be loaded from API
      cards: []
    },
    
    // UI State
    initialized: false,
    loading: false,
    searchQuery: '',
    mobileMenuOpen: false,
    conversationModalOpen: false,
    conversationMenuOpen: false,
    mobileQuickFilter: 'all',
    filterPanelOpen: false,
    mobileFilterQuery: '',
    theme: 'light',
    filters: {
      stages: [],
      departments: [],
      stores: [],
      tags: []
    },
    
    // Conversation Notes
    conversationNotes: [],
    activeSidebarTab: 'info',
    notesLoading: false,
    
    // Socket.IO
    socket: null,
    connected: false,
    webSyncRequestedAt: null,
    pollingInterval: null,
    pollingActive: false,
    socketDisabled: false,
    endChatMessage: null,
    systemCurrencyCode: null,
    systemCurrencySymbol: null
  },

  // ============================================
  // INITIALIZATION
  // ============================================

  init() {
    if (this.state.initialized) {
      this.render();
      return;
    }

    console.log('🚀 Initializing User Conversations Module...');
    
    if (typeof i18n !== 'undefined' && i18n.init) {
      i18n.init();
    }
    
    // Check if user is authenticated
    const cfgAuth = window.UserConversationsConfig || {};
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('❌ No authentication token found.');
      // In admin/tenant context, do not redirect; render read-only UI with fallbacks
      if (!cfgAuth.adminMode) {
        window.location.href = '/login';
        return;
      }
    }
    
    // Get user info from token
    this.getUserInfo();
    
    // Load state from localStorage
    this.loadState();
    this.applyTheme(this.state.theme || this.getThemePreference());
    
    // Initialize Socket.IO
    this.initSocket();
    
    // Load real data
    this.getUserInfo(); // Load user context first
    this.loadPipelineStages();
    this.loadAccounts();
    this.loadTransferOptions();
    this.loadConversations();
    
    // Render UI
    this.render();
    
    // Re-render after data is loaded
    setTimeout(() => {
      console.log('🔄 Re-rendering after data load...');
      this.renderPipeline();
    }, 1000);
    
    // Initialize event listeners
    this.initEventListeners();
    
    this.state.initialized = true;
    console.log('✅ User Conversations Module initialized');
  },

  getUserInfo() {
    // Get user info from JWT token stored in localStorage
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        this.state.userId = payload.id;
        this.state.userName = payload.name;
        this.state.tenantId = payload.tenantId;
        this.state.storeId = payload.store_id;
        this.state.departmentId = payload.department_id;
      } catch (error) {
        console.error('Error parsing token:', error);
      }
    }
  },

  initSocket() {
    const host = window.location.host || '';
    const isNgrok = host.includes('ngrok');
    if (isNgrok) {
      this.state.socketDisabled = true;
      this.startPolling();
      return;
    }

    const tenantId = this.state.tenantId;
    const namespace = tenantId ? `/tenant/${tenantId}` : undefined;
    this.state.socket = namespace ? io(namespace, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      query: { 'ngrok-skip-browser-warning': '1' },
      transportOptions: {
        polling: { extraHeaders: { 'ngrok-skip-browser-warning': '1' } },
        websocket: { extraHeaders: { 'ngrok-skip-browser-warning': '1' } }
      }
    }) : io({
      transports: ['websocket', 'polling'],
      withCredentials: true,
      query: { 'ngrok-skip-browser-warning': '1' },
      transportOptions: {
        polling: { extraHeaders: { 'ngrok-skip-browser-warning': '1' } },
        websocket: { extraHeaders: { 'ngrok-skip-browser-warning': '1' } }
      }
    });
    
    this.state.socket.on('connect', () => {
      console.log('✅ Socket.IO connected');
      this.state.connected = true;
      this.stopPolling();
      if (!namespace && this.state.tenantId) {
        this.state.socket.emit('join-tenant', this.state.tenantId);
      }
    });
    
    this.state.socket.on('disconnect', () => {
      console.log('❌ Socket.IO disconnected');
      this.state.connected = false;
      this.startPolling();
    });
    
    // Listen for new messages
    this.state.socket.on('whatsapp-cloud:new-message', (data) => {
      if (data.conversationId === this.state.selectedConversationId) {
        this.addMessageToView(data.message);
      }
      this.updateConversationPreview(data.conversationId, data.message);
    });

    this.state.socket.on('new-message', async (data) => {
      if (!this.state.whatsappWebActive) return;
      await this.loadConversations();
      if (this.state.selectedConversationId && String(data.conversationId) === String(this.state.selectedConversationId)) {
        const ok = await this.loadMessages(this.state.selectedConversationId);
        if (ok !== false) this.refreshMessagesView();
      }
    });
    
    // Listen for conversation claimed
    this.state.socket.on('whatsapp-cloud:conversation-claimed', (data) => {
      if (data.userId !== this.state.userId) {
        this.updateConversationClaim(data.conversationId, data.userId, data.userName);
      }
    });
    
    // Listen for conversation released
    this.state.socket.on('whatsapp-cloud:conversation-released', (data) => {
      this.updateConversationRelease(data.conversationId);
    });

    this.state.socket.on('message-sent', async (data) => {
      if (!this.state.whatsappWebActive) return;
      await this.loadConversations();
      if (this.state.selectedConversationId && String(data.conversationId) === String(this.state.selectedConversationId)) {
        const ok = await this.loadMessages(this.state.selectedConversationId);
        if (ok !== false) this.refreshMessagesView();
      }
    });

    this.state.socket.on('conversation-transferred', (data) => {
      if (!data?.conversationId) return;
      if (data.conversationId === this.state.selectedConversationId) {
        this.closeConversation();
        this.removeConversationFromView(data.conversationId);
      }
      this.loadConversations();
    });
    
    // Listen for pipeline stage changes (real-time sync from tenant)
    this.state.socket.on('pipeline-stage-created', (data) => {
      console.log('📊 Pipeline stage created:', data.stage);
      this.state.pipeline.stages.push(data.stage);
      this.state.pipeline.stages.sort((a, b) => a.stage_order - b.stage_order);
      this.renderPipeline();
    });
    
    this.state.socket.on('pipeline-stage-updated', (data) => {
      console.log('📊 Pipeline stage updated:', data.stage);
      const index = this.state.pipeline.stages.findIndex(s => s.stage_key === data.stage.stage_key);
      if (index !== -1) {
        this.state.pipeline.stages[index] = data.stage;
        this.state.pipeline.stages.sort((a, b) => a.stage_order - b.stage_order);
        this.renderPipeline();
      }
    });
    
    this.state.socket.on('pipeline-stage-deleted', (data) => {
      console.log('📊 Pipeline stage deleted:', data.stageKey);
      this.state.pipeline.stages = this.state.pipeline.stages.filter(s => s.stage_key !== data.stageKey);
      this.renderPipeline();
    });
    
    this.state.socket.on('pipeline-stages-reordered', (data) => {
      console.log('📊 Pipeline stages reordered');
      this.state.pipeline.stages = data.stages;
      this.renderPipeline();
    });
  },

  startPolling() {
    if (this.state.pollingActive) return;
    this.state.pollingActive = true;
    this.state.pollingInterval = setInterval(async () => {
      if (this.state.loading) return;
      await this.loadConversations();
      if (this.state.selectedConversationId) {
        const now = Date.now();
        if (!this.state.lastMessagesRefreshAt || now - this.state.lastMessagesRefreshAt > 5000) {
          this.state.lastMessagesRefreshAt = now;
          await this.loadMessages(this.state.selectedConversationId);
          if (this.state.selectedConversation) {
            this.renderActiveConversation();
          }
        }
      }
    }, 5000);
  },

  stopPolling() {
    if (this.state.pollingInterval) {
      clearInterval(this.state.pollingInterval);
      this.state.pollingInterval = null;
    }
    this.state.pollingActive = false;
  },

  loadState() {
    const savedState = localStorage.getItem('uc_state');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        this.state.activeAccountId = state.activeAccountId;
        this.state.searchQuery = state.searchQuery || '';
        this.state.whatsappWebActive = state.whatsappWebActive || false;
        this.state.transferTargetType = state.transferTargetType || 'department';
        if (this.state.transferTargetType === 'user') {
          this.state.transferTargetType = 'department';
        }
        this.state.mobileQuickFilter = state.mobileQuickFilter || 'all';
        this.state.filters = state.filters || { stages: [], departments: [], stores: [], tags: [] };
        this.state.theme = 'light';
      } catch (error) {
        console.error('Error loading state:', error);
      }
    }
  },

  saveState() {
    const stateToSave = {
      activeAccountId: this.state.activeAccountId,
      searchQuery: this.state.searchQuery,
      whatsappWebActive: this.state.whatsappWebActive,
      transferTargetType: this.state.transferTargetType,
      mobileQuickFilter: this.state.mobileQuickFilter,
      filters: this.state.filters,
      theme: this.state.theme
    };
    localStorage.setItem('uc_state', JSON.stringify(stateToSave));
  },

  getThemePreference() {
    return 'light';
  },

  applyTheme() {
    this.state.theme = 'light';
    document.body.classList.remove('uc-theme-dark');
    localStorage.setItem('uc_theme', 'light');
  },

  toggleTheme() {
    this.applyTheme();
  },

  syncThemeToggle() {},

  // ============================================
  // TRANSLATION HELPER
  // ============================================
  t(key, fallback, params) {
    if (typeof i18n !== 'undefined' && i18n.t) {
      const translation = i18n.t(key, params || undefined);
      if (translation !== key) return translation;
      
      // Try with 'conversation.' prefix if not already there
      if (!key.includes('.')) {
        const altTranslation = i18n.t('conversation.' + key, params || undefined);
        if (altTranslation !== 'conversation.' + key) return altTranslation;
      }
    }
    return fallback || this.getEnglishFallback(key);
  },

  async loadSystemCurrency() {
    if (this.state.systemCurrencyCode) {
      return this.state.systemCurrencyCode;
    }
    try {
      const response = await fetch('/api/public/default-currency');
      const data = await response.json();
      const code = data?.data?.code || 'USD';
      const symbol = data?.data?.symbol || code;
      this.state.systemCurrencyCode = code;
      this.state.systemCurrencySymbol = symbol;
      localStorage.setItem('system_default_currency', code);
      localStorage.setItem('system_default_currency_symbol', symbol);
      return code;
    } catch (error) {
      const fallbackCode = localStorage.getItem('system_default_currency') || 'USD';
      const fallbackSymbol = localStorage.getItem('system_default_currency_symbol') || fallbackCode;
      this.state.systemCurrencyCode = fallbackCode;
      this.state.systemCurrencySymbol = fallbackSymbol;
      return fallbackCode;
    }
  },

  buildPaymentCurrencyOptions(defaultCode) {
    const baseCurrencies = ['USD', 'EUR', 'GBP'];
    const codes = baseCurrencies.includes(defaultCode) ? baseCurrencies : [defaultCode, ...baseCurrencies];
    return codes.map(code => `<option value="${code}" ${code === defaultCode ? 'selected' : ''}>${code}</option>`).join('');
  },

  formatSystemCurrency(amount) {
    const code = this.state.systemCurrencyCode || localStorage.getItem('system_default_currency') || 'USD';
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return amount;
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(numericAmount);
    } catch (e) {
      return `${code} ${numericAmount.toFixed(2)}`;
    }
  },

  formatWooPrice(rawValue) {
    if (rawValue === null || rawValue === undefined) return '';
    const raw = String(rawValue).trim();
    if (!raw) return '';
    const normalized = raw.replace(',', '.');
    if (/^[0-9]+(\.[0-9]+)?$/.test(normalized)) {
      return this.formatSystemCurrency(parseFloat(normalized));
    }
    return raw;
  },

  getEnglishFallback(key) {
    const englishFallbacks = {
      'conversation.phone': 'Phone',
      'conversation.tags': 'Tags',
      'conversation.contact': 'Contact',
      'conversation.transfer_conversation': 'Transfer Conversation',
      'conversation.transfer_title': 'Transfer Conversation',
      'conversation.transfer_department': 'Department',
      'conversation.transfer_store': 'Store',
      'conversation.no_options': 'No options available',
      'conversation.add_tag': 'Add tag',
      'conversation.no_tags': 'No tags',
      'conversation.contact_info': 'Contact Info',
      'conversation.info': 'Info',
      'conversation.notes': 'Notes',
      'conversation.back': 'Back',
      'conversation.send': 'Send',
      'conversation.type_message': 'Type a message...',
      'conversation.internal_notes': 'Internal Notes',
      'conversation.transfer': 'Transfer',
      'conversation.transfer_reason': 'Reason (optional)',
      'conversation.transfer_confirm': 'Transfer',
      'conversation.end_chat': 'End chat',
      'conversation.end_chat_title': 'End chat',
      'conversation.end_chat_confirm': 'End this chat and let the bot handle new messages?',
      'conversation.end_chat_not_claimed': 'Only the assigned user can end this chat.',
      'conversation.release_success': 'Chat ended. Bot can reply again.',
      'conversation.end_chat_message_failed': 'Failed to send end chat message',
      'conversation.loading': 'Loading...',
      'conversation.no_conversations': 'No conversations found',
      'conversation.select_account': 'Select Account',
      'conversation.search': 'Search...',
      'conversation.all': 'All',
      'conversation.unclaimed': 'Unclaimed',
      'conversation.mine': 'Mine',
      'conversation.no_messages': 'No messages yet',
      'conversation.just_now': 'just now',
      'conversation.online': 'Online',
      'conversation.offline': 'Offline',
      'transfer.title': 'Transfer Conversation',
      'transfer.to_store': 'To Store',
      'transfer.to_department': 'To Department',
      'transfer.reason': 'Reason',
      'transfer.confirm': 'Transfer',
      'transfer.cancel': 'Cancel'
    };
    return englishFallbacks[key] || key;
  },

  resolveContactPhone(source) {
    const raw = source?.contact_phone
      || source?.phone_number
      || source?.phone
      || source?.contactPhone
      || source?.phoneNumber
      || source?.chat_id
      || source?.chatId
      || source?.conversationId
      || source?.id
      || '';
    const normalized = String(raw || '').trim();
    if (!normalized) return '';
    const lower = normalized.toLowerCase();
    if (lower === 'unknown' || lower === 'desconhecido' || lower === '—' || lower === '-') return '';
    return normalized;
  },

  resolveContactName(source) {
    const rawName = source?.name
      || source?.contact_name
      || source?.contactName
      || source?.profile_name
      || source?.display_name
      || source?.push_name
      || source?.whatsapp_name;
    const normalizedName = String(rawName || '').trim();
    if (normalizedName) {
      const lowerName = normalizedName.toLowerCase();
      if (!['unknown', 'desconhecido', '—', '-', 'null', 'undefined', 'n/a'].includes(lowerName)) {
        return normalizedName;
      }
    }
    const phone = this.resolveContactPhone(source);
    if (phone) return phone;
    const idValue = source?.conversationId || source?.conversation_id || source?.id;
    if (idValue) return String(idValue);
    return 'Contato';
  },

  getConversationDisplayName(conversation) {
    return this.resolveContactName(conversation);
  },

  getTransferOptionLabel(option) {
    return option?.name || option?.label || option?.id || '—';
  },

  // ============================================
  // API CALLS
  // ============================================

  async loadPipelineStages() {
    try {
      console.log('🔄 Loading pipeline stages...');
      const cfg = window.UserConversationsConfig || {};
      const stagesUrl = cfg.adminMode ? '/api/admin/pipeline-stages' : '/api/user/whatsapp-cloud/pipeline-stages';
      const response = await fetch(stagesUrl, {
        headers: this.getAuthHeaders()
      });
      
      console.log('📊 Pipeline stages response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Pipeline stages error:', response.status, errorText);
        throw new Error('Failed to load pipeline stages');
      }
      
      const data = await response.json();
      console.log('📊 Pipeline stages data:', data);
      
      this.state.pipeline.stages = data.data || [];
      
      console.log('✅ Pipeline stages loaded:', this.state.pipeline.stages.length, this.state.pipeline.stages);
    } catch (error) {
      console.error('❌ Error loading pipeline stages:', error);
      // Fallback to default stages
      this.state.pipeline.stages = [
        { stage_key: 'unassigned', stage_name: 'Unassigned', stage_icon: 'fas fa-inbox', stage_color: '#6b7280', stage_order: 0 },
        { stage_key: 'new', stage_name: 'New', stage_icon: 'fas fa-star', stage_color: '#3b82f6', stage_order: 1 },
        { stage_key: 'negotiation', stage_name: 'Negotiation', stage_icon: 'fas fa-handshake', stage_color: '#f59e0b', stage_order: 2 },
        { stage_key: 'won', stage_name: 'Won', stage_icon: 'fas fa-trophy', stage_color: '#10b981', stage_order: 3 },
        { stage_key: 'lost', stage_name: 'Lost', stage_icon: 'fas fa-times-circle', stage_color: '#ef4444', stage_order: 4 }
      ];
      console.log('🔄 Using fallback stages:', this.state.pipeline.stages.length);
    }
  },

  async loadAccounts() {
    try {
      console.log('🔄 Loading accounts...');
      const cfg = window.UserConversationsConfig || {};
      const url = cfg.adminMode ? '/api/whatsapp-cloud/accounts' : '/api/user/whatsapp-cloud/accounts';
      console.log('📡 Accounts URL:', url);
      
      const response = await fetch(url, {
        headers: this.getAuthHeaders()
      });
      
      console.log('📡 Accounts response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Accounts error:', response.status, errorText);
        throw new Error('Failed to load accounts');
      }
      
      const data = await response.json();
      console.log('📊 Accounts data:', data);
      
      this.state.accounts = data.data || [];
      const connectedAccounts = this.state.accounts.filter(account => this.isAccountConnected(account));
      
      if (!connectedAccounts.some(acc => String(acc.id) === String(this.state.activeAccountId))) {
        this.state.activeAccountId = connectedAccounts[0]?.id || null;
      }
      if (!this.state.activeAccountId && connectedAccounts.length === 0) {
        this.state.whatsappWebActive = true;
      }
      
      this.saveState();
      if (this.state.whatsappWebActive) {
        await this.loadWebConnectionStatus(true);
      }
      this.render();
      this.initEventListeners();
      this.loadConversations();
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  },

  async loadTransferOptions() {
    try {
      console.log('🔄 Loading transfer options...');
      
      // Check if options are already loaded
      if (this.state.transferOptions.departments.length > 0 || this.state.transferOptions.stores.length > 0) {
        console.log('✅ Transfer options already loaded, skipping...');
        return;
      }
      
      const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` };
      const cfg = window.UserConversationsConfig || {};
      const base = cfg.adminMode ? '/api/tenant' : '/api/user/whatsapp-cloud';
      
      const [departmentsRes, storesRes] = await Promise.all([
        fetch(`${base}/departments`, { headers }),
        fetch(`${base}/stores`, { headers })
      ]);
      
      console.log('📊 Transfer API responses:', {
        departments: departmentsRes.status,
        stores: storesRes.status
      });
      
      if (departmentsRes.ok) {
        const departmentsData = await departmentsRes.json();
        console.log('📊 Departments loaded:', departmentsData);
        this.state.transferOptions.departments = departmentsData.data || [];
      } else {
        console.error('❌ Departments failed:', departmentsRes.status);
        this.state.transferOptions.departments = [];
      }
      
      if (storesRes.ok) {
        const storesData = await storesRes.json();
        console.log('📊 Stores loaded:', storesData);
        this.state.transferOptions.stores = storesData.data || [];
      } else {
        console.error('❌ Stores failed:', storesRes.status);
        this.state.transferOptions.stores = [];
      }
      
      console.log('✅ Transfer options final state:', {
        departments: this.state.transferOptions.departments.length,
        stores: this.state.transferOptions.stores.length
      });
      
    } catch (error) {
      console.error('❌ Error loading transfer options:', error);
      this.state.transferOptions.departments = [];
      this.state.transferOptions.stores = [];
    }
  },

  async loadConversations() {
    try {
      const token = localStorage.getItem('token');
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const config = window.UserConversationsConfig || {};
      const webSource = config.webSource || 'service';
      console.log('🔄 Loading conversations...', {
        requestId,
        whatsappWebActive: this.state.whatsappWebActive,
        activeAccountId: this.state.activeAccountId,
        searchQuery: this.state.searchQuery,
        webSource,
        hasToken: !!token
      });
      this.state.loading = true;
      if (!this.state.whatsappWebActive && !this.state.activeAccountId) {
        this.state.conversations = [];
        this.state.filteredConversations = [];
        this.updatePipelineCards();
        this.updateSidebar();
        this.updateMobileFilterPanel();
        this.updateMobileFilterChips();
        this.renderPipeline();
        this.state.loading = false;
        return;
      }
      
      const headers = this.getAuthHeaders({ 'X-Request-Id': requestId });
      let response;
      if (this.state.whatsappWebActive) {
        const params = new URLSearchParams();
        if (this.state.searchQuery) {
          params.append('search', this.state.searchQuery);
        }
        let url = '/api/user/whatsapp-cloud/web-conversations';
        if (webSource === 'legacy') {
          url = '/api/tenant/conversations';
        }
        const queryString = params.toString();
        if (queryString) {
          url = `${url}?${queryString}`;
        }
        console.log('🌐 Requesting web conversations', { requestId, url, webSource });
        response = await fetch(url, { headers });
      } else {
        const params = new URLSearchParams();
        if (this.state.activeAccountId) {
          params.append('accountId', this.state.activeAccountId);
        }
        if (this.state.searchQuery) {
          params.append('search', this.state.searchQuery);
        }
        const cfgCloud = window.UserConversationsConfig || {};
        const base = cfgCloud.adminMode ? '/api/whatsapp-cloud/admin/conversations' : '/api/user/whatsapp-cloud/conversations';
        const url = `${base}?${params}`;
        console.log('🌐 Requesting cloud conversations', { requestId, url });
        response = await fetch(url, { headers });
      }
      
      console.log('💬 Conversations response status:', response.status, {
        requestId,
        ok: response.ok,
        statusText: response.statusText
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Conversations error:', response.status, {
          requestId,
          errorText: errorText?.slice(0, 500)
        });
        
        // Handle 401 - invalid token, force re-login
        if (response.status === 401) {
          console.warn('🔐 Token invalid/expired, clearing and redirecting to login');
          localStorage.removeItem('token');
          window.location.href = '/login';
          return;
        }
        
        throw new Error(`Failed to load conversations (${response.status})`);
      }
      
      const data = await response.json();
      console.log('💬 Conversations data:', {
        requestId,
        success: data?.success,
        dataCount: Array.isArray(data?.data) ? data.data.length : null,
        meta: data?.meta
      });
      if (this.state.whatsappWebActive && data?.meta?.connection) {
        this.state.webConnectionStatus = data.meta.connection;
        this.state.webConnectionFetchedAt = Date.now();
      }
      if (this.state.whatsappWebActive && webSource === 'legacy') {
        await this.loadWebConnectionStatus();
      }
      if (this.state.whatsappWebActive && webSource !== 'legacy' && data.meta) {
        console.log('💬 Web conversations meta:', data.meta);
        if (data.meta.storeStats) {
          console.log('💬 Web store stats:', data.meta.storeStats);
        }
        const lastSync = this.state.webSyncRequestedAt || 0;
        if (data.meta.connected && data.meta.chatsCount === 0 && Date.now() - lastSync > 30000) {
          this.requestWebSync();
        }
      }
      
      let rawConversations = data.data || [];
      const cfgCloud2 = window.UserConversationsConfig || {};
      if (!this.state.whatsappWebActive && cfgCloud2.adminMode && this.state.activeAccountId) {
        rawConversations = rawConversations.filter(c => String(c.account_id || c.accountId) === String(this.state.activeAccountId));
      }
      const isLegacyWeb = this.state.whatsappWebActive && webSource === 'legacy';
      let mappedConversations = this.state.whatsappWebActive
          ? rawConversations.map(chat => {
            if (isLegacyWeb) {
              const tags = Array.isArray(chat.tags)
                ? chat.tags
                : (chat.tags ? JSON.parse(chat.tags) : []);
            return {
                id: chat.id || chat.conversationId,
                contact_name: this.resolveContactName(chat),
                contact_phone: this.resolveContactPhone(chat),
                contact_profile_pic: chat.contact_profile_pic || chat.profile_pic || '',
                last_message_text: chat.last_message || chat.last_message_text || '',
                last_message_time: chat.last_message_time || chat.last_message_at || chat.updated_at || '',
                stage_id: chat.pipeline_stage || chat.stage_id || 'new',
                tags,
                unread_count: chat.unread_count || 0,
                claimed_by_user_id: chat.claimed_by_user_id,
              claimed_by_name: chat.claimed_by_name,
              claimed_by_store: chat.claimed_by_store,
              claimed_by_department: chat.claimed_by_department,
              source: 'whatsapp_web'
              };
            }
            return {
              id: chat.id || chat.conversationId,
              contact_name: this.resolveContactName(chat),
              contact_phone: this.resolveContactPhone(chat),
              contact_profile_pic: chat.avatar || chat.contact_profile_pic || '',
              last_message_text: chat.lastMessage || chat.last_message_text || chat.last_message || '',
              last_message_time: chat.timestamp || chat.last_message_time || '',
              stage_id: chat.stageId || chat.stage_id || 'new',
              tags: Array.isArray(chat.tags) ? chat.tags : [],
              unread_count: chat.unreadCount || chat.unread_count || 0,
              source: 'whatsapp_web'
            };
          })
        : rawConversations.map(conv => ({
            ...conv,
            contact_name: this.resolveContactName(conv),
            contact_phone: this.resolveContactPhone(conv),
            tags: conv.tags ? (Array.isArray(conv.tags) ? conv.tags : JSON.parse(conv.tags)) : [],
            claimed_by_store: conv.claimed_by_store,
            claimed_by_department: conv.claimed_by_department,
            source: 'whatsapp_cloud'
          }));
      if (this.state.whatsappWebActive && !isLegacyWeb) {
        mappedConversations = mappedConversations.filter(conv => {
          const name = (conv.contact_name || '').trim().toLowerCase();
          const phone = (conv.contact_phone || '').trim().toLowerCase();
          const lastMessage = (conv.last_message_text || '').trim();
          
          // Filter out conversations with invalid data
          if (!name || name === 'unknown' || name === '—') return false;
          if (!phone || phone === 'unknown' || phone === '—') return false;
          
          const hasMessage = !!lastMessage;
          const hasTimestamp = !!conv.last_message_time;
          if (!hasMessage && !hasTimestamp) return false;
          
          // Filter out very old conversations (older than 30 days)
          if (conv.last_message_time) {
            const messageDate = new Date(conv.last_message_time);
            const daysSinceMessage = (Date.now() - messageDate.getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceMessage > 30) return false;
          }
          
          return true;
        });
      }
      this.state.conversations = mappedConversations;
      this.applyFilters();
      
      console.log('✅ Conversations loaded:', this.state.conversations.length);
      
      // Update pipeline cards
      this.updatePipelineCards();
      console.log('📊 Pipeline cards updated:', this.state.pipeline.cards.length);
      
      // Update sidebar conversations
      this.updateSidebar();
      this.updateMobileFilterPanel();
      this.updateMobileFilterChips();
      
      // Re-render pipeline with new data
      this.renderPipeline();
    } catch (error) {
      console.error('❌ Error loading conversations:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack
      });
    } finally {
      this.state.loading = false;
    }
  },

  async loadWebConnectionStatus(force = false) {
    const now = Date.now();
    if (!force && this.state.webConnectionFetchedAt && now - this.state.webConnectionFetchedAt < 15000) {
      return;
    }
    try {
      const cfg = window.UserConversationsConfig || {};
      const preferWebMeta = !!cfg.adminMode || this.state.whatsappWebActive;
      if (preferWebMeta) {
        const fallback = await fetch('/api/user/whatsapp-cloud/web-conversations', { headers: this.getAuthHeaders() });
        if (fallback.ok) {
          const data = await fallback.json();
          const payload = data?.meta?.connection || {};
          this.state.webConnectionStatus = {
            status: payload.status || (payload.connected ? 'connected' : 'disconnected'),
            connected: payload.connected === true,
            hasSession: payload.hasSession || false,
            phoneNumber: payload.phoneNumber || null
          };
          this.state.webConnectionFetchedAt = now;
          return;
        }
      }
      const response = await fetch('/api/tenant/whatsapp/status', { headers: this.getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        const payload = data?.data || data || {};
        this.state.webConnectionStatus = {
          status: payload.status || (payload.connected ? 'connected' : 'disconnected'),
          connected: payload.status === 'connected' || payload.connected === true,
          hasSession: payload.hasSession || payload.session?.hasSession || false,
          phoneNumber: payload.phoneNumber || payload.phone_number || null
        };
        this.state.webConnectionFetchedAt = now;
        return;
      }
      if (response.status !== 403) {
        return;
      }
      const fallback = await fetch('/api/user/whatsapp-cloud/web-conversations', { headers: this.getAuthHeaders() });
      if (!fallback.ok) {
        return;
      }
      const data = await fallback.json();
      const payload = data?.meta?.connection || {};
      this.state.webConnectionStatus = {
        status: payload.status || (payload.connected ? 'connected' : 'disconnected'),
        connected: payload.connected === true,
        hasSession: payload.hasSession || false,
        phoneNumber: payload.phoneNumber || null
      };
      this.state.webConnectionFetchedAt = now;
    } catch (error) {
      console.warn('Failed to load WhatsApp Web status:', error?.message || error);
    }
  },

  async requestWebSync() {
    this.state.webSyncRequestedAt = Date.now();
    try {
      const token = localStorage.getItem('token');
      const requestId = `websync-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      console.log('🔁 Forcing web sync...', {
        requestId,
        hasToken: !!token,
        online: navigator.onLine,
        origin: window.location.origin
      });
      const postResponse = await fetch('/api/user/whatsapp-cloud/web-conversations/force-sync', {
        method: 'POST',
        headers: this.getAuthHeaders({
          'Content-Type': 'application/json',
          'X-Request-Id': requestId
        })
      });
      const response = postResponse.ok ? postResponse : await fetch(`/api/user/whatsapp-cloud/web-conversations/force-sync?t=${Date.now()}`, {
        method: 'GET',
        headers: this.getAuthHeaders({ 'X-Request-Id': requestId })
      });
      if (response.ok) {
        const data = await response.json();
        console.log('💬 Web conversations meta (force):', {
          requestId,
          meta: data?.meta,
          dataCount: Array.isArray(data?.data) ? data.data.length : null
        });
      } else {
        const errorText = await response.text();
        console.error('❌ Web sync error:', response.status, {
          requestId,
          errorText: errorText?.slice(0, 500)
        });
      }
    } catch (error) {
      console.error('Error forcing web sync:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack
      });
    } finally {
      setTimeout(() => {
        this.loadConversations();
      }, 2000);
    }
  },

  async loadMessages(conversationId, options = {}) {
    try {
      const cfg = window.UserConversationsConfig || {};
      const base = cfg.adminMode ? '/api/whatsapp-cloud/conversations' : '/api/user/whatsapp-cloud/conversations';
      const requestedPage = options.page || this.state.messagesPagination.page;
      const requestedLimit = options.limit || this.state.messagesPagination.limit;
      const sourceParam = this.state.whatsappWebActive ? '&source=whatsapp_web' : '';
      const response = await fetch(
        `${base}/${conversationId}/messages?page=${requestedPage}&limit=${requestedLimit}${sourceParam}`,
        { headers: this.getAuthHeaders() }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.warn('Failed to load messages:', errorData.message || response.statusText);
        return false;
      }
      
      const data = await response.json();
      const pagination = data.pagination || null;
      const raw = data.data || [];
      
      console.log('🔍 Raw messages from API:', raw);
      raw.forEach((msg, index) => {
        if (msg.message_type !== 'text') {
          console.log(`🔍 Media message ${index}:`, {
            id: msg.id,
            message_type: msg.message_type,
            media_url: msg.media_url,
            content: msg.content,
            text_body: msg.text_body,
            caption: msg.caption,
            media_filename: msg.media_filename,
            direction: msg.direction
          });
        }
      });
      
      if (!options.skipPaginationJump && pagination?.pages && requestedPage < pagination.pages) {
        this.state.messagesPagination.total = pagination.total ?? raw.length;
        this.state.messagesPagination.page = pagination.pages;
        this.state.messagesPagination.limit = requestedLimit;
        return await this.loadMessages(conversationId, {
          page: pagination.pages,
          limit: requestedLimit,
          skipPaginationJump: true
        });
      }
      this.state.messages = raw.map(m => {
        const ts = (() => {
          const t = m.timestamp || m.created_at;
          if (!t) return Date.now();
          if (typeof t === 'number') {
            return t < 1e12 ? t * 1000 : t;
          }
          const num = Number(t);
          if (!Number.isNaN(num)) {
            return num < 1e12 ? num * 1000 : num;
          }
          return t;
        })();
        return {
          id: m.id,
          sender_type: m.direction === 'outbound' ? 'user' : 'contact',
          sent_by_user_id: m.sent_by_user_id,
          sent_by_name: m.sent_by_name,
          sent_by_store: m.sent_by_store,
          sent_by_department: m.sent_by_department,
          message_type: m.message_type || 'text',
          content: m.text_content || m.text_body || m.content || '',
          text_body: m.text_body,
          media_url: m.media_url,
          media_filename: m.media_filename,
          caption: m.caption,
          created_at: ts
        };
      }).sort((a, b) => {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return timeA - timeB;
      });
      this.state.messagesPagination.total = pagination?.total ?? raw.length;
      this.state.messagesPagination.page = requestedPage;
      this.state.messagesPagination.limit = requestedLimit;
      if (!cfg.adminMode && !this.state.whatsappWebActive) {
        const conversation = this.state.conversations.find(c => String(c.id) === String(conversationId));
        const isWebConversation = conversation?.source === 'whatsapp_web';
        const alreadyClaimedByMe = conversation?.claimed_by_user_id
          && String(conversation.claimed_by_user_id) === String(this.state.userId);
        const claimBlocked = !!this.state.claimDeniedConversations?.[conversationId];
        if (!isWebConversation && !alreadyClaimedByMe && !claimBlocked) {
          await this.ensureConversationVisibility(conversationId);
          await this.claimConversation(conversationId);
        }
      }
      return true;
    } catch (error) {
      console.error('Error loading messages:', error);
      return false;
    }
  },

  async claimConversation(conversationId) {
    try {
      const response = await fetch(
        `/api/user/whatsapp-cloud/conversations/${conversationId}/claim`,
        {
          method: 'POST',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' })
        }
      );
      
      if (!response.ok) {
        if (response.status === 403 || response.status === 404 || response.status === 409) {
          if (!this.state.claimDeniedConversations) {
            this.state.claimDeniedConversations = {};
          }
          this.state.claimDeniedConversations[conversationId] = true;
          return false;
        }
        const error = await response.json();
        console.warn('Could not claim conversation:', error.message);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error claiming conversation:', error);
      return false;
    }
  },

  async releaseConversation(conversationId) {
    try {
      const response = await fetch(
        `/api/user/whatsapp-cloud/conversations/${conversationId}/release`,
        {
          method: 'POST',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' })
        }
      );
      
      if (response.status === 404) {
        return true;
      }
      return response.ok;
    } catch (error) {
      console.error('Error releasing conversation:', error);
      return false;
    }
  },

  async releaseWebConversation(conversationId) {
    try {
      console.log('🛑 End chat request', { conversationId });
      const response = await fetch(
        `/api/tenant/conversations/${conversationId}/release`,
        {
          method: 'POST',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' })
        }
      );
      
      if (response.status === 404) {
        console.warn('🛑 End chat release not found', { conversationId });
        return true;
      }
      console.log('🛑 End chat response', { status: response.status, ok: response.ok });
      return response.ok;
    } catch (error) {
      console.error('Error releasing web conversation:', error);
      return false;
    }
  },

  async endChatConversation() {
    const conversationId = this.state.selectedConversationId;
    if (!conversationId) return;
    const isWeb = this.state.whatsappWebActive || this.state.selectedConversation?.source === 'whatsapp_web';
    if (!isWeb) return;
    const onConfirm = async () => {
      const endChatMessage = await this.getEndChatMessage();
      if (endChatMessage) {
        const sent = await this.sendWebMessage(conversationId, endChatMessage);
        if (!sent) {
          if (typeof Modal !== 'undefined' && Modal.alert) {
            Modal.alert(this.t('common.error', 'Error'), this.t('conversation.end_chat_message_failed', 'Failed to send end chat message'), 'warning');
          }
          return;
        }
      }
      const ok = await this.releaseWebConversation(conversationId);
      if (!ok) {
        if (typeof Modal !== 'undefined' && Modal.alert) {
          Modal.alert(this.t('common.error', 'Error'), this.t('conversation.release_failed', 'Failed to end chat'), 'warning');
        }
        console.warn('🛑 End chat failed', { conversationId });
        return;
      }
      const conv = this.state.conversations.find(c => c.id === conversationId);
      if (conv) {
        conv.is_claimed = false;
        conv.claimed_by_user_id = null;
        conv.status = 'waiting';
      }
      if (this.state.selectedConversation) {
        this.state.selectedConversation.is_claimed = false;
        this.state.selectedConversation.claimed_by_user_id = null;
        this.state.selectedConversation.status = 'waiting';
      }
      await this.loadConversations();
      this.updateSidebar();
      if (typeof Modal !== 'undefined' && Modal.alert) {
        Modal.alert(this.t('common.success', 'Success'), this.t('conversation.release_success', 'Chat ended. Bot can reply again.'), 'success');
      }
      console.log('🛑 End chat success', { conversationId });
    };
    if (typeof Modal !== 'undefined' && Modal.confirm) {
      Modal.confirm('conversation.end_chat_title', 'conversation.end_chat_confirm', onConfirm);
    } else {
      onConfirm();
    }
  },

  async getEndChatMessage() {
    if (this.state.endChatMessage !== null) {
      return this.state.endChatMessage;
    }
    const fallback = "Obrigado(a) por entrar em contato!\n*Essa conversa foi encerrada*";
    try {
      const response = await fetch('/api/tenant/end-chat-settings', {
        method: 'GET',
        headers: this.getAuthHeaders()
      });
      const data = await response.json().catch(() => ({}));
      const message = data?.data?.message || fallback;
      this.state.endChatMessage = message || '';
      return this.state.endChatMessage;
    } catch (e) {
      this.state.endChatMessage = fallback;
      return this.state.endChatMessage;
    }
  },

  async sendMessage(conversationId, content) {
    try {
      const payload = { message: content, content };
      if (this.state.whatsappWebActive) {
        payload.source = 'whatsapp_web';
      }
      const response = await fetch(
        `/api/user/whatsapp-cloud/conversations/${conversationId}/send-message`,
        {
          method: 'POST',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload)
        }
      );
      
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        return {
          success: false,
          message: data?.message || 'Error sending message'
        };
      }
      return {
        success: true,
        data: data?.data
      };
    } catch (error) {
      console.error('Error sending message:', error);
      return {
        success: false,
        message: 'Error sending message'
      };
    }
  },

  // ============================================
  // CONVERSATION NOTES MANAGEMENT
  // ============================================

  async loadConversationNotes(conversationId) {
    try {
      this.state.notesLoading = true;
      const config = window.UserConversationsConfig || {};
      const isLegacyWeb = this.state.whatsappWebActive && (config.webSource === 'legacy');
      const selectedSource = this.state.selectedConversation?.source;
      if (isLegacyWeb || selectedSource === 'whatsapp_web') {
        this.state.conversationNotes = [];
        if (this.state.activeSidebarTab === 'notes') {
          this.updateSidebarContent();
        }
        return true;
      }

      const response = await fetch(
        `/api/user/whatsapp-cloud/conversations/${conversationId}/notes`,
        {
          headers: this.getAuthHeaders()
        }
      );
      
      if (!response.ok) {
        console.warn('Failed to load conversation notes:', response.status);
        return false;
      }
      
      const data = await response.json();
      this.state.conversationNotes = data.data || [];
      
      // Update notes tab if it's active
      if (this.state.activeSidebarTab === 'notes') {
        this.updateSidebarContent();
      }
      
      return true;
    } catch (error) {
      console.error('Error loading conversation notes:', error);
      return false;
    } finally {
      this.state.notesLoading = false;
    }
  },

  async addConversationNote(conversationId, noteText) {
    try {
      if (!noteText || !noteText.trim()) {
        return { success: false, message: 'Note text is required' };
      }

      const response = await fetch(
        `/api/user/whatsapp-cloud/conversations/${conversationId}/notes`,
        {
          method: 'POST',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ 
            noteText: noteText.trim(),
            noteType: 'general'
          })
        }
      );
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        return {
          success: false,
          message: data.message || 'Failed to add note'
        };
      }
      
      // Add note to local state
      this.state.conversationNotes.unshift(data.data);
      
      // Update UI if notes tab is active
      if (this.state.activeSidebarTab === 'notes') {
        this.updateSidebarContent();
      }
      
      return { success: true, data: data.data };
    } catch (error) {
      console.error('Error adding conversation note:', error);
      return {
        success: false,
        message: 'Failed to add note'
      };
    }
  },

  switchSidebarTab(tabName) {
    this.state.activeSidebarTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.conversation-sidebar-tab').forEach(tab => {
      const isActive = tab.getAttribute('data-tab') === tabName;
      if (isActive) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
    
    if (tabName === 'notes' && this.state.selectedConversationId) {
      this.loadConversationNotes(this.state.selectedConversationId).finally(() => {
        this.updateSidebarContent();
      });
      return;
    }

    this.updateSidebarContent();
  },

  updateSidebarContent() {
    const content = document.getElementById('conversationSidebarContent');
    if (content && this.state.selectedConversation) {
      content.innerHTML = this.renderConversationSidebar(this.state.selectedConversation);
      this.attachSidebarListeners();
    }
  },

  attachSidebarListeners() {
    // Tab switching
    document.querySelectorAll('.conversation-sidebar-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.target.getAttribute('data-tab');
        this.switchSidebarTab(tabName);
      });
    });

    // Transfer functionality with enhanced options loading
    this.attachTransferListeners();
    this.refreshTagControls();
  },

  refreshTagControls() {
    const addBtn = document.getElementById('conversationTagAddBtn');
    if (addBtn) {
      addBtn.onclick = () => this.addTagFromInput();
    }
    const input = document.getElementById('conversationTagInput');
    if (input) {
      input.onkeypress = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.addTagFromInput();
        }
      };
    }
    document.querySelectorAll('[data-tag-remove]').forEach(btn => {
      btn.onclick = () => {
        const tag = btn.getAttribute('data-tag-remove');
        if (tag) {
          this.removeTagFromConversation(tag);
        }
      };
    });
  },

  addTagFromInput() {
    const input = document.getElementById('conversationTagInput');
    if (!input) return;
    const tag = input.value.trim();
    if (!tag) return;
    input.value = '';
    this.addTagToConversation(tag);
  },

  async addTagToConversation(tag) {
    const conversationId = this.state.selectedConversationId;
    if (!conversationId) return;
    const conversation = this.state.selectedConversation;
    const tags = Array.isArray(conversation?.tags) ? conversation.tags : [];
    if (tags.includes(tag.toLowerCase())) {
      return;
    }
    if (tags.length >= 3) {
      if (typeof Modal !== 'undefined' && Modal.alert) {
        Modal.alert('conversation.error_title', 'conversation.tags_limit', 'warning');
      }
      return;
    }
    const result = await this.updateConversationTags(conversationId, [tag], 'add');
    if (result?.success) {
      const updatedTags = [...new Set([...tags, tag.toLowerCase()])];
      conversation.tags = updatedTags;
      this.updateSidebarContent();
      this.updateSidebar();
    }
  },

  async removeTagFromConversation(tag) {
    const conversationId = this.state.selectedConversationId;
    if (!conversationId) return;
    const conversation = this.state.selectedConversation;
    const tags = Array.isArray(conversation?.tags) ? conversation.tags : [];
    if (!tags.includes(tag)) return;
    const result = await this.updateConversationTags(conversationId, [tag], 'remove');
    if (result?.success) {
      conversation.tags = tags.filter(t => t !== tag);
      this.updateSidebarContent();
      this.updateSidebar();
    }
  },

  async updateConversationTags(conversationId, tags, action) {
    const cfg = window.UserConversationsConfig || {};
    if (this.state.whatsappWebActive && cfg.webSource === 'legacy') {
      if (typeof Modal !== 'undefined' && Modal.alert) {
        Modal.alert('conversation.error_title', 'conversation.tags_error', 'warning');
      }
      return null;
    }
    const headers = this.getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`/api/user/whatsapp-cloud/conversations/${conversationId}/tags`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ tags, action })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      if (typeof Modal !== 'undefined' && Modal.alert) {
        Modal.alert('conversation.error_title', data?.message || 'conversation.tags_error', 'warning');
      }
      return null;
    }
    return data;
  },

  async loadEnhancedTransferOptions() {
    return this.loadTransferOptions();
  },

  attachTransferListeners() {
    // Transfer type buttons
    document.querySelectorAll('.conversation-transfer-type').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const transferType = e.target.getAttribute('data-transfer-type');
        this.state.transferTargetType = transferType;
        
        // Update active state
        document.querySelectorAll('.conversation-transfer-type').forEach(b => {
          b.classList.remove('active');
        });
        e.target.classList.add('active');
        
        // Update options
        this.updateTransferOptions();
      });
    });

    // Transfer confirm button
    // Transfer button listener is handled in initEventListeners
  },

  async handleEnhancedTransferConversation() {
    const select = document.getElementById('conversationTransferSelect');
    const reasonInput = document.getElementById('conversationTransferReason');
    
    if (!select || !select.value || !this.state.selectedConversationId) {
      this.showNotification('Please select a destination', 'error');
      return;
    }

    const transferBtn = document.getElementById('conversationTransferConfirm');
    const conversationId = this.state.selectedConversationId;
    if (transferBtn) {
      transferBtn.disabled = true;
      transferBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transferring...';
    }

    try {
      const optionsKey = this.state.transferTargetType === 'store' ? 'stores' : 'departments';
      const options = this.state.transferOptions[optionsKey] || [];
      const selectedOption = options.find(option => String(option.id) === String(select.value) || String(option.name) === String(select.value));
      
      if (!selectedOption) {
        throw new Error('Selected option not found');
      }

      // Validate conversation ID
      if (!conversationId || conversationId === 'null' || conversationId === 'undefined') {
        console.error('❌ Invalid conversation ID:', conversationId);
        throw new Error('Invalid conversation ID');
      }

      // Use whatsapp-cloud user API endpoint
      const endpoint = `/api/user/whatsapp-cloud/conversations/${conversationId}/transfer`;
      const method = 'PUT';
      const payload = {
        newStoreId: this.state.transferTargetType === 'store' ? selectedOption.id : null,
        newDepartmentId: this.state.transferTargetType === 'department' ? selectedOption.id : null,
        reason: reasonInput?.value?.trim() || ''
      };

      console.log('🔄 Transferring conversation:', {
        conversationId,
        transferType: this.state.transferTargetType,
        selectedOption,
        endpoint,
        method,
        payload,
        whatsappWebActive: this.state.whatsappWebActive
      });

      const response = await fetch(endpoint, {
        method,
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      console.log('📡 Raw response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      let data = {};
      const responseText = await response.text();
      console.log('📡 Raw response text:', responseText);
      
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.warn('Failed to parse response as JSON:', e);
        data = { message: responseText };
      }
      
      console.log('📡 Transfer response:', {
        status: response.status,
        ok: response.ok,
        data
      });

      if (response.ok && data.success !== false) {
        console.log('✅ Transfer successful, updating UI...');
        this.showNotification('Conversation transferred successfully', 'success');
        
        // Clear form
        if (reasonInput) reasonInput.value = '';
        
        // Remove the conversation from the current view immediately
        this.removeConversationFromView(conversationId);
        
        // Close conversation modal/view
        this.closeConversation();
        
        // Clear selected conversation
        this.state.selectedConversationId = null;
        
        // Force reload conversations to reflect the transfer
        console.log('🔄 Reloading conversations after transfer...');
        await this.loadConversations();
        
        // Second reload after delay to ensure backend has processed
        setTimeout(async () => {
          console.log('🔄 Second reload after transfer...');
          await this.loadConversations();
        }, 2000);
        
        // Hide transfer panel
        const panel = document.getElementById('conversationTransferPanel');
        if (panel) panel.classList.add('hidden');
        
        // Emit socket event for real-time updates
        if (this.state.socket && this.state.connected) {
          this.state.socket.emit('conversation-transferred', {
            conversationId,
            fromUserId: this.state.userId,
            targetStore: this.state.transferTargetType === 'store' ? selectedOption.name : null,
            targetDepartment: this.state.transferTargetType === 'department' ? selectedOption.name : null,
            tenantId: this.state.tenantId
          });
        }
      } else {
        throw new Error(data.message || `Transfer failed (${response.status})`);
      }
    } catch (error) {
      console.error('❌ Transfer error:', error);
      this.showNotification('Error transferring conversation: ' + error.message, 'error');
    } finally {
      if (transferBtn) {
        transferBtn.disabled = false;
        transferBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Transfer';
      }
    }
  },

  removeConversationFromView(conversationId) {
    const targetId = String(conversationId);
    // Remove from conversations array
    this.state.conversations = this.state.conversations.filter(conv => String(conv.id) !== targetId);
    this.state.filteredConversations = this.state.filteredConversations.filter(conv => String(conv.id) !== targetId);
    
    // Remove from pipeline cards
    this.state.pipeline.cards = this.state.pipeline.cards.filter(card => String(card.id) !== targetId);
    
    // Re-render pipeline and sidebar
    this.renderPipeline();
    this.updateSidebar();
    
    console.log('✅ Conversation removed from view:', conversationId);
  },

  async updateConversationStage(conversationId, stageId) {
    try {
      console.log('🔄 Updating conversation stage:', conversationId, 'to', stageId);
      
      const response = await fetch(
        `/api/user/whatsapp-cloud/conversations/${conversationId}/stage`,
        {
          method: 'PUT',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ stage: stageId })
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Stage update failed:', errorData);
        throw new Error('Failed to update stage');
      }
      
      console.log('✅ Stage updated successfully');
      
      // Update local state IMMEDIATELY
      const conversation = this.state.conversations.find(c => c.id == conversationId);
      if (conversation) {
        console.log('🔄 Updating local state:', conversation.contact_name, 'from', conversation.stage_id, 'to', stageId);
        conversation.stage_id = stageId;
      }
      
      // Update pipeline cards with new data
      this.updatePipelineCards();
      
      // Re-render pipeline immediately
      this.renderPipeline();
      
      console.log('✅ UI updated in real-time');
      
      return true;
    } catch (error) {
      console.error('❌ Error updating stage:', error);
      return false;
    }
  },

  async addInternalNote(conversationId, noteText) {
    try {
      const response = await fetch(
        `/api/user/whatsapp-cloud/conversations/${conversationId}/internal-note`,
        {
          method: 'POST',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ note_text: noteText })
        }
      );
      
      if (!response.ok) throw new Error('Failed to add note');
      
      return await response.json();
    } catch (error) {
      console.error('Error adding note:', error);
      return null;
    }
  },

  // ============================================
  // MAIN RENDER
  // ============================================

  render() {
    const page = document.getElementById('user-conversations-page');
    if (!page) return;

    // Find the content container, or use the page itself if not found
    const contentContainer = page.querySelector('.user-conversations-content') || page;
    
    // Only render inside the content container, preserving the header
    if (contentContainer === page) {
      // If no content container exists, render everything
      page.innerHTML = this.renderLayout();
    } else {
      // Render only the main content, preserving the header
      contentContainer.innerHTML = this.renderLayout();
    }
    
    if (typeof i18n !== 'undefined') {
      if (i18n.setLanguage) {
        const systemLang = localStorage.getItem('system_default_language');
        const currentLang = i18n.getCurrentLanguage ? i18n.getCurrentLanguage() : (i18n.getLanguage ? i18n.getLanguage() : null);
        const resolvedLang = systemLang || currentLang || localStorage.getItem('language');
        if (resolvedLang) {
          i18n.setLanguage(resolvedLang);
        }
      }
      if (i18n.translatePage) {
        i18n.translatePage();
      }
    }
    this.refreshCoreControls();
    this.syncThemeToggle();
  },

  refreshCoreControls() {
    const accountSelector = document.getElementById('ucAccountSelector');
    if (accountSelector) {
      accountSelector.onclick = (e) => {
        e.stopPropagation();
        if (e.target.closest('.uc-account-item')) return;
        this.toggleAccountDropdown();
      };
    }
    const accountDropdown = document.getElementById('ucAccountDropdown');
    if (accountDropdown) {
      accountDropdown.onclick = (e) => {
        e.stopPropagation(); // Prevent closing when clicking inside dropdown
        const item = e.target.closest('.uc-account-item');
        if (!item) return;
        const accountType = item.getAttribute('data-account-type');
        if (accountType === 'web') {
          this.setWhatsappWebActive();
        } else {
          const accountId = item.getAttribute('data-account-id');
          if (accountId) {
            this.setActiveAccount(accountId);
          }
        }
        this.closeAccountDropdown();
      };
    }
    if (!this._accountOutsideClickBound) {
      document.addEventListener('click', (e) => {
        const selector = document.getElementById('ucAccountSelector');
        const dropdown = document.getElementById('ucAccountDropdown');
        if (!dropdown || dropdown.classList.contains('hidden')) return;
        if (selector?.contains(e.target)) return;
        this.closeAccountDropdown();
      });
      this._accountOutsideClickBound = true;
    }
    const userMenuBtn = document.getElementById('userMenuBtn');
    if (userMenuBtn) {
      userMenuBtn.onclick = () => this.toggleMobileMenu();
    }
    const sidebarCloseBtn = document.getElementById('ucSidebarCloseBtn');
    if (sidebarCloseBtn) {
      sidebarCloseBtn.onclick = () => this.toggleMobileMenu();
    }
    const sidebarSearch = document.getElementById('ucSidebarSearch');
    if (sidebarSearch) {
      sidebarSearch.oninput = (e) => this.handleSearch(e.target.value);
    }
    const manageBtn = document.getElementById('ucPipelineManageBtn');
    if (manageBtn) {
      manageBtn.onclick = () => this.openStagesManager();
    }
    const filterBtn = document.getElementById('ucPipelineFilterBtn');
    if (filterBtn) {
      filterBtn.onclick = () => this.openFilterModal();
    }
    document.getElementById('ucPipelineNavLeft')?.addEventListener('click', () => {
      this.scrollPipelineBoard(-1);
    });
    document.getElementById('ucPipelineNavRight')?.addEventListener('click', () => {
      this.scrollPipelineBoard(1);
    });
    this.attachConversationListeners();
    this.attachPipelineListeners();
    this.attachMobileFilterListeners();
    document.getElementById('userLogoutBtn')?.addEventListener('click', () => {
      if (typeof openLogoutModal === 'function') {
        openLogoutModal();
      } else {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    });
  },

  renderLayout() {
    const cfg = window.UserConversationsConfig || {};
    return `
      <div class="uc-workspace" id="ucWorkspace">
        <!-- Internal Sidebar -->
        <div class="uc-internal-sidebar" id="ucInternalSidebar">
          ${this.renderInternalSidebar()}
        </div>
        
        <!-- Main Content Area -->
        <div class="uc-main-content">
          <!-- Horizontal Tabs -->
          <div class="uc-horizontal-tabs">
            <button class="uc-horizontal-tab active" data-tab="conversations">
              <i class="fas fa-comments"></i>
              <span data-i18n="conversations.title">Conversations</span>
            </button>
            <div class="uc-horizontal-tabs-actions">
              ${cfg.allowPipelineEdit ? `
              <button class="btn btn-secondary uc-pipeline-manage-btn" id="ucPipelineManageBtn">
                <i class="fas fa-cog"></i>
                <span data-i18n="pipeline.manage_stages">Manage Stages</span>
              </button>
              ` : ''}
              <button class="btn btn-secondary uc-pipeline-filter-btn" id="ucPipelineFilterBtn">
                <i class="fas fa-filter"></i>
                <span data-i18n="conversations.filter">Filter</span>
              </button>
            </div>
          </div>
          
          <!-- Tab Content -->
          <div class="uc-tab-content">
            <div class="uc-tab-panel active" data-panel="conversations">
              ${this.renderConversationsTab()}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // ============================================
  // INTERNAL SIDEBAR
  // ============================================

  renderInternalSidebar() {
    const accounts = this.state.accounts || [];
    const connectedAccounts = accounts.filter(account => this.isAccountConnected(account));
    const activeAccount = connectedAccounts.find(a => String(a.id) === String(this.state.activeAccountId));
    const isWebActive = this.state.whatsappWebActive;
    const activeName = isWebActive
      ? this.t('conversations.whatsapp_web', 'WhatsApp Web')
      : (activeAccount?.account_name || this.t('conversations.select_account', 'Select Account'));
    const activePhone = isWebActive
      ? this.t('conversations.whatsapp_web_subtitle', 'Web inbox')
      : (activeAccount?.phone_number || '');
    const activeStatusInfo = isWebActive
      ? this.getWebStatusInfo()
      : this.getAccountStatusInfo(activeAccount);

    return `
      <div class="uc-sidebar-header">
        <div class="uc-sidebar-logo">
          <i class="fab fa-whatsapp"></i>
        </div>
        <button class="uc-sidebar-close-btn" id="ucSidebarCloseBtn">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <!-- Account Selector -->
      <div class="uc-sidebar-account-selector" id="ucAccountSelector">
        <div class="uc-sidebar-account-current">
          ${(isWebActive || activeAccount) ? `
            <div class="uc-sidebar-account-avatar">
              <i class="fab fa-whatsapp"></i>
            </div>
            <div class="uc-sidebar-account-info">
              <span class="uc-sidebar-account-name">${activeName}</span>
              <span class="uc-sidebar-account-phone">${activePhone}</span>
            </div>
            <span class="uc-sidebar-account-status ${activeStatusInfo.status}">${activeStatusInfo.label}</span>
          ` : `
            <div class="uc-sidebar-account-empty">
              <i class="fas fa-plus-circle"></i>
              <span data-i18n="conversations.select_account">Select Account</span>
            </div>
          `}
          <i class="fas fa-chevron-down uc-sidebar-account-chevron"></i>
        </div>
        <div class="uc-sidebar-account-dropdown hidden" id="ucAccountDropdown">
          ${this.renderAccountDropdownItems()}
        </div>
      </div>
      
      <!-- Search Box -->
      <div class="uc-sidebar-search">
        <i class="fas fa-search"></i>
        <input type="text" id="ucSidebarSearch" data-i18n-placeholder="conversations.search_placeholder" value="${this.state.searchQuery || ''}">
      </div>
      
      <!-- Conversations List -->
      <div class="uc-sidebar-conversations" id="ucSidebarConversations">
        ${this.renderSidebarConversations()}
      </div>
    `;
  },

  renderSidebarConversations() {
    const conversations = this.state.filteredConversations;
    
    if (conversations.length === 0) {
      return `
        <div class="uc-sidebar-empty">
          <i class="fas fa-comments"></i>
          <h4 data-i18n="conversations.no_conversations">No conversations</h4>
          <p data-i18n="conversations.no_conversations_desc">New conversations will appear here</p>
        </div>
      `;
    }

    return conversations.map(conv => {
      const displayName = this.getConversationDisplayName(conv);
      const avatarLetter = (displayName || '—').charAt(0).toUpperCase();
      return `
        <div class="uc-sidebar-conversation-item ${conv.id === this.state.selectedConversationId ? 'active' : ''}" data-conversation-id="${conv.id}">
          <div class="uc-sidebar-conversation-avatar">
            ${conv.contact_profile_pic ? `<img src="${conv.contact_profile_pic}" alt="${displayName}">` : `<span>${avatarLetter}</span>`}
          </div>
          <div class="uc-sidebar-conversation-content">
            <div class="uc-sidebar-conversation-header">
              <span class="uc-sidebar-conversation-name">${displayName}</span>
              <span class="uc-sidebar-conversation-time">${this.formatTime(conv.last_message_time)}</span>
            </div>
            <div class="uc-sidebar-conversation-preview">
              <i class="fas fa-check-double" style="color: #53bdeb; font-size: 12px;"></i>
              <span>${this.truncate(conv.last_message_text || '', 40)}</span>
            </div>
            ${conv.tags && conv.tags.length > 0 ? `
              <div class="uc-sidebar-conversation-tags">
                ${conv.tags.map(tag => `<span class="uc-tag">${tag}</span>`).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  renderAccountDropdownItems() {
    const accounts = this.state.accounts || [];
    const connectedAccounts = accounts.filter(account => this.isAccountConnected(account));
    const isWebActive = this.state.whatsappWebActive;
    const webStatus = this.getWebStatusInfo();
    const webStatusLabel = webStatus.label;
    const webStatusClass = webStatus.status;
    const connectedCloudHtml = connectedAccounts.map(account => {
      const statusInfo = this.getAccountStatusInfo(account);
      return `
        <div class="uc-account-item ${(!isWebActive && String(account.id) === String(this.state.activeAccountId)) ? 'active' : ''}" data-account-id="${account.id}">
          <div class="uc-account-item-name">${account.account_name || ''}</div>
          <div class="uc-account-item-phone">${account.phone_number || ''}</div>
          <span class="uc-account-item-status ${statusInfo.status}">${statusInfo.label}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="uc-account-item ${isWebActive ? 'active' : ''}" data-account-type="web">
        <div class="uc-account-item-name" data-i18n="conversations.whatsapp_web">WhatsApp Web</div>
        <div class="uc-account-item-phone" data-i18n="conversations.whatsapp_web_subtitle">Web inbox</div>
        <span class="uc-account-item-status ${webStatusClass}">${webStatusLabel}</span>
      </div>
      ${connectedAccounts.length > 0 ? `
        <div class="uc-account-divider"></div>
        ${connectedCloudHtml}
      ` : `
        <div class="uc-account-divider"></div>
        <div class="uc-account-empty-item">${this.t('conversations.no_connected_cloud', 'No connected WhatsApp Cloud accounts')}</div>
      `}
    `;
  },

  // ============================================
  // CONVERSATIONS TAB
  // ============================================

  renderConversationsTab() {
    const stages = this.state.pipeline.stages;
    const cards = this.state.pipeline.cards;
    const cfg = window.UserConversationsConfig || {};

    return `
      <div class="uc-mobile-toolbar" id="ucMobileToolbar">
        ${this.renderMobileToolbar()}
      </div>
      <div class="uc-mobile-conversation-list" id="ucMobileConversationList">
        ${this.renderSidebarConversations()}
      </div>
      <div class="uc-pipeline-container">
        <div class="uc-pipeline-board" id="ucPipelineBoard">
          ${stages.map(stage => this.renderPipelineColumn(stage, cards.filter(c => c.stage_id === stage.stage_key))).join('')}
        </div>
        <div class="uc-pipeline-navigation">
          <button class="uc-pipeline-nav-btn" id="ucPipelineNavLeft">
            <i class="fas fa-chevron-left"></i>
          </button>
          <button class="uc-pipeline-nav-btn" id="ucPipelineNavRight">
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>
      <div class="uc-conversation-panel hidden" id="ucConversationPanel"></div>
    `;
  },

  renderMobileToolbar() {
    const activeCount = this.getActiveFilterCount();
    const activeCountBadge = activeCount > 0 ? `<span class="uc-mobile-filter-count">${activeCount}</span>` : '';
    
    // Account selector for mobile
    const accounts = this.state.accounts || [];
    const connectedAccounts = accounts.filter(account => this.isAccountConnected(account));
    const activeAccount = connectedAccounts.find(a => String(a.id) === String(this.state.activeAccountId));
    const isWebActive = this.state.whatsappWebActive;
    
    const activeName = isWebActive ? 'WhatsApp Web' : (activeAccount?.name || 'Select Account');
    const activeStatus = isWebActive ? 'connected' : (activeAccount ? 'connected' : 'disconnected');
    
    return `
      <div class="uc-mobile-account-selector" id="ucMobileAccountSelector">
        <div class="uc-mobile-account-current">
          <i class="fab fa-whatsapp"></i>
          <span class="uc-mobile-account-name">${activeName}</span>
          <i class="fas fa-chevron-down"></i>
        </div>
        <div class="uc-mobile-account-dropdown hidden" id="ucMobileAccountDropdown">
          ${this.renderAccountDropdownItems()}
        </div>
      </div>
      <div class="uc-mobile-search">
        <i class="fas fa-search"></i>
        <input type="text" id="ucMobileSearchInput" data-i18n-placeholder="conversations.search_placeholder" value="${this.state.searchQuery || ''}">
      </div>
      <div class="uc-mobile-filter-chips">
        <button class="uc-mobile-filter-chip ${this.state.mobileQuickFilter === 'all' ? 'active' : ''}" data-filter="all" data-i18n="conversations.filter_all">All</button>
        <button class="uc-mobile-filter-chip ${this.state.mobileQuickFilter === 'unread' ? 'active' : ''}" data-filter="unread" data-i18n="conversations.filter_unread">Unread</button>
        <button class="uc-mobile-filter-chip ${this.state.filterPanelOpen ? 'active' : ''}" id="ucMobileFilterToggle">
          <i class="fas fa-filter"></i>
          <span data-i18n="conversations.filters">Filters</span>
          ${activeCountBadge}
        </button>
      </div>
      <div class="uc-mobile-filter-panel ${this.state.filterPanelOpen ? '' : 'hidden'}" id="ucMobileFilterPanel">
        ${this.renderMobileFilterPanelContent()}
      </div>
    `;
  },

  renderMobileFilterPanelContent() {
    const query = (this.state.mobileFilterQuery || '').toLowerCase();
    const stages = this.filterOptionsByQuery(this.state.pipeline.stages || [], query, stage => stage.stage_name || '');
    const departments = this.filterOptionsByQuery(this.state.transferOptions.departments || [], query, option => option.name);
    const stores = this.filterOptionsByQuery(this.state.transferOptions.stores || [], query, option => option.name);
    const tags = this.filterOptionsByQuery(this.getAvailableTags(), query, tag => tag);
    return `
      <div class="uc-mobile-filter-header">
        <span data-i18n="conversations.filters">Filters</span>
        <button class="uc-mobile-filter-clear" id="ucMobileFilterClear" data-i18n="conversations.filter_clear">Clear</button>
      </div>
      <div class="uc-mobile-filter-search">
        <i class="fas fa-search"></i>
        <input type="text" id="ucMobileFilterSearch" data-i18n-placeholder="conversations.filter_by" value="${this.state.mobileFilterQuery || ''}">
      </div>
      <div class="uc-mobile-filter-section">
        <div class="uc-mobile-filter-title" data-i18n="conversations.filter_pipeline_columns">Pipeline columns</div>
        ${this.renderMobileFilterOptions('stages', stages.map(stage => ({ id: String(stage.stage_key), label: stage.stage_name || stage.stage_key })))}
      </div>
      <div class="uc-mobile-filter-section">
        <div class="uc-mobile-filter-title" data-i18n="conversations.filter_departments">Departments</div>
        ${this.renderMobileFilterOptions('departments', departments.map(option => ({ id: option.name, label: option.name })))}
      </div>
      <div class="uc-mobile-filter-section">
        <div class="uc-mobile-filter-title" data-i18n="conversations.filter_stores">Stores</div>
        ${this.renderMobileFilterOptions('stores', stores.map(option => ({ id: option.name, label: option.name })))}
      </div>
      <div class="uc-mobile-filter-section">
        <div class="uc-mobile-filter-title" data-i18n="conversations.filter_tags">Tags</div>
        ${this.renderMobileFilterOptions('tags', tags.map(tag => ({ id: String(tag), label: tag })))}
      </div>
    `;
  },

  renderMobileFilterOptions(type, options) {
    if (!options.length) {
      return `<div class="uc-mobile-filter-empty" data-i18n="conversations.no_options">No options available</div>`;
    }
    return options.map(option => {
      const isChecked = (this.state.filters[type] || []).includes(option.id);
      return `
        <label class="uc-mobile-filter-option">
          <input type="checkbox" class="uc-mobile-filter-checkbox" data-filter-type="${type}" value="${option.id}" ${isChecked ? 'checked' : ''}>
          <span>${option.label}</span>
        </label>
      `;
    }).join('');
  },

  filterOptionsByQuery(options, query, getLabel) {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(option => (getLabel(option) || '').toLowerCase().includes(q));
  },

  getAvailableTags() {
    const tagSet = new Set();
    this.state.conversations.forEach(conv => {
      if (Array.isArray(conv.tags)) {
        conv.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet);
  },

  getActiveFilterCount() {
    const filters = this.state.filters || {};
    return (filters.stages?.length || 0)
      + (filters.departments?.length || 0)
      + (filters.stores?.length || 0)
      + (filters.tags?.length || 0);
  },

  renderPipeline() {
    console.log('🎨 Rendering pipeline...', this.state.pipeline.stages.length, 'stages,', this.state.pipeline.cards.length, 'cards');
    
    const pipelineBoard = document.getElementById('ucPipelineBoard');
    if (!pipelineBoard) {
      console.warn('❌ Pipeline board element not found!');
      return;
    }
    
    const stages = this.state.pipeline.stages;
    const cards = this.state.pipeline.cards;
    
    console.log('🎨 Stages:', stages);
    console.log('🎨 Cards:', cards);
    
    pipelineBoard.innerHTML = stages.map(stage => 
      this.renderPipelineColumn(stage, cards.filter(c => c.stage_id === stage.stage_key))
    ).join('');
    
    console.log('✅ Pipeline rendered successfully');
    
    // Re-attach event listeners for new elements
    this.attachPipelineListeners();
  },

  updateSidebar() {
    const sidebarConversations = document.getElementById('ucSidebarConversations');
    if (sidebarConversations) {
      sidebarConversations.innerHTML = this.renderSidebarConversations();
      this.attachConversationListeners();
    }
    const mobileList = document.getElementById('ucMobileConversationList');
    if (mobileList) {
      mobileList.innerHTML = this.renderSidebarConversations();
      this.attachConversationListeners();
    }
  },

  renderPipelineColumn(stage, cards) {
    return `
      <div class="uc-pipeline-column" data-stage-id="${stage.stage_key}">
        <div class="uc-pipeline-column-header">
          <div class="uc-pipeline-column-title">
            <span class="uc-pipeline-column-icon" style="color: ${stage.stage_color}">
              <i class="${stage.stage_icon}"></i>
            </span>
            <span class="uc-pipeline-column-name" data-i18n="pipeline.${stage.stage_key}">${stage.stage_name}</span>
            <span class="uc-pipeline-column-count">${cards.length}</span>
          </div>
        </div>
        <div class="uc-pipeline-column-body" data-stage-id="${stage.stage_key}">
          ${cards.map(card => this.renderPipelineCard(card)).join('')}
        </div>
      </div>
    `;
  },

  renderPipelineCard(card) {
    const attendant = this.getAttendantLabel(card);
    const cfg = window.UserConversationsConfig || {};
    const allowDrag = !cfg.readOnly;
    const displayName = this.getConversationDisplayName(card);
    const avatarLetter = (displayName || '—').charAt(0).toUpperCase();
    return `
      <div class="uc-pipeline-card" draggable="${allowDrag ? 'true' : 'false'}" data-card-id="${card.id}">
        <div class="uc-pipeline-card-top">
          <span class="uc-pipeline-card-attendant">${attendant}</span>
        </div>
        <div class="uc-pipeline-card-header">
          <div class="uc-pipeline-card-avatar">
            ${card.contact_avatar ? `<img src="${card.contact_avatar}" alt="${displayName}">` : `<span>${avatarLetter}</span>`}
          </div>
          <div class="uc-pipeline-card-info">
            <span class="uc-pipeline-card-name">${displayName}</span>
            <span class="uc-pipeline-card-phone">${card.contact_phone || ''}</span>
          </div>
        </div>
        <div class="uc-pipeline-card-message">
          ${this.truncate(card.last_message || '', 80)}
        </div>
        <div class="uc-pipeline-card-footer">
          ${card.tags && card.tags.length > 0 ? `
            <div class="uc-pipeline-card-tags">
              ${card.tags.slice(0, 2).map(tag => `<span class="uc-tag-small">${tag}</span>`).join('')}
            </div>
          ` : ''}
          <span class="uc-pipeline-card-time">
            <i class="far fa-clock"></i>
            ${this.formatTime(card.last_message_time)}
          </span>
        </div>
      </div>
    `;
  },

  // ============================================
  // CONVERSATION MODAL
  // ============================================

  renderConversationModal(conversation) {
    const stages = this.state.pipeline.stages || [];
    const transferType = this.state.transferTargetType || 'department';
    
    // Fix the key mapping - the state uses plural but UI uses singular
    let optionsKey = transferType;
    if (optionsKey === 'store') optionsKey = 'stores';
    if (optionsKey === 'department') optionsKey = 'departments';
    
    const transferOptions = this.state.transferOptions[optionsKey] || [];
    const transferOptionsHtml = transferOptions.length > 0
      ? transferOptions.map(option => `<option value="${option.id || option.name}">${this.getTransferOptionLabel(option)}</option>`).join('')
      : `<option value="">${this.t('conversation.no_options', 'No options available')}</option>`;
    const cfg = window.UserConversationsConfig || {};
    const isReadOnly = !!cfg.readOnly;
    const isAdmin = !!cfg.adminMode;
    const isMobileView = this.isMobileView();

    const canEndChat = !isReadOnly && !isAdmin && (this.state.whatsappWebActive || conversation.source === 'whatsapp_web');
    return `
      <div class="conversation-header">
        <div class="conversation-header-left">
          <button class="conversation-back-btn" id="conversationBackBtn">
            <i class="fas fa-arrow-left"></i>
            <span class="conversation-back-text" data-i18n="conversation.back">Back</span>
          </button>
          <div class="conversation-avatar">
            ${conversation.contact_avatar ? `<img src="${conversation.contact_avatar}" alt="${this.getConversationDisplayName(conversation)}">` : `<span>${(this.getConversationDisplayName(conversation) || '—').charAt(0).toUpperCase()}</span>`}
          </div>
          <div class="conversation-info">
            <span class="conversation-name">${this.getConversationDisplayName(conversation)}</span>
            <span class="conversation-phone">${conversation.contact_phone || ''}</span>
          </div>
        </div>
        <div class="conversation-header-right">
          ${canEndChat && !isMobileView ? `
            <button class="conversation-end-btn" id="conversationEndChatBtn" data-i18n="conversation.end_chat">End chat</button>
          ` : ''}
          ${isMobileView ? `
            <button class="conversation-menu-btn" id="conversationMenuBtn">
              <i class="fas fa-bars"></i>
            </button>
          ` : ''}
        </div>
      </div>
      
      <div class="conversation-body">
        <div class="conversation-messages-area">
          <div class="conversation-messages" id="conversationMessages">
            ${this.renderMessages()}
          </div>
          
          ${isAdmin ? `
            <div class="conversation-readonly-banner" style="display:flex;align-items:center;gap:10px; padding:12px 16px; border-top:1px solid #e5e7eb; background:#f9fafb;">
              <i class="fas fa-lock" style="color:#6b7280;"></i>
              <span data-i18n="conversation.read_only_notice">Only users can reply</span>
            </div>
          ` : `
            <div class="conversation-input-area ${isReadOnly ? 'read-only' : ''}">
              <div class="conversation-input-wrapper">
                <div class="conversation-input-actions">
                  <button class="conversation-input-btn" id="conversationAttachBtn" data-i18n-title="media.attach_file">
                    <i class="fas fa-paperclip"></i>
                  </button>
                  <button class="conversation-input-btn" id="conversationEmojiBtn" data-i18n-title="conversation.emoji">
                    <i class="fas fa-smile"></i>
                  </button>
                </div>
                <input type="text" class="conversation-input-field" id="conversationInputField" data-i18n-placeholder="conversation.type_message" ${isReadOnly ? 'disabled' : ''}>
                <button class="conversation-send-btn" id="conversationSendBtn" ${isReadOnly ? 'disabled' : ''}>
                  <i class="fas fa-paper-plane"></i>
                </button>
                <input type="file" id="conversationFileInput" class="hidden" accept="image/*,video/*,audio/*,application/*">
              </div>
            <div class="conversation-attach-menu hidden" id="conversationAttachMenu" style="position:absolute; z-index:1000; background:#fff; border:1px solid #e5e7eb; border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.12); padding:8px; transform-origin:bottom left; opacity:0; transform:scale(0.95); transition:opacity .15s ease, transform .15s ease;">
              <button class="attach-item" data-type="image" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:none; background:none; width:100%; border-radius:6px;"><i class="fas fa-image" style="color:#26a69a"></i><span data-i18n="media.attach_image">Image</span></button>
              <button class="attach-item" data-type="video" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:none; background:none; width:100%; border-radius:6px;"><i class="fas fa-video" style="color:#3b82f6"></i><span data-i18n="media.attach_video">Video</span></button>
              <button class="attach-item" data-type="audio" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:none; background:none; width:100%; border-radius:6px;"><i class="fas fa-microphone" style="color:#f59e0b"></i><span data-i18n="media.attach_audio">Audio</span></button>
              <button class="attach-item" data-type="document" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:none; background:none; width:100%; border-radius:6px;"><i class="fas fa-file" style="color:#6b7280"></i><span data-i18n="media.attach_document">Document</span></button>
              <button class="attach-item" data-type="product" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:none; background:none; width:100%; border-radius:6px;"><i class="fas fa-box-open" style="color:#10b981"></i><span data-i18n="media.send_product">Product</span></button>
              <button class="attach-item" data-type="payment" style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:none; background:none; width:100%; border-radius:6px;"><i class="fas fa-credit-card" style="color:#ef4444"></i><span data-i18n="media.send_payment_link">Payment</span></button>
            </div>
            <div class="conversation-attach-modal hidden" id="conversationAttachModal">
              <div class="conversation-attach-sheet">
                <div class="conversation-attach-sheet-header">
                  <span data-i18n="media.attach_file">Attach</span>
                  <button id="conversationAttachModalClose">
                    <i class="fas fa-times"></i>
                  </button>
                </div>
                <div class="conversation-attach-sheet-grid">
                  <button class="attach-sheet-item" data-type="image">
                    <div class="attach-sheet-icon" style="color:#26a69a;"><i class="fas fa-image"></i></div>
                    <span data-i18n="media.attach_image">Image</span>
                  </button>
                  <button class="attach-sheet-item" data-type="video">
                    <div class="attach-sheet-icon" style="color:#3b82f6;"><i class="fas fa-video"></i></div>
                    <span data-i18n="media.attach_video">Video</span>
                  </button>
                  <button class="attach-sheet-item" data-type="audio">
                    <div class="attach-sheet-icon" style="color:#f59e0b;"><i class="fas fa-microphone"></i></div>
                    <span data-i18n="media.attach_audio">Audio</span>
                  </button>
                  <button class="attach-sheet-item" data-type="document">
                    <div class="attach-sheet-icon" style="color:#6b7280;"><i class="fas fa-file"></i></div>
                    <span data-i18n="media.attach_document">Document</span>
                  </button>
                  <button class="attach-sheet-item" data-type="payment">
                    <div class="attach-sheet-icon" style="color:#ef4444;"><i class="fas fa-credit-card"></i></div>
                    <span data-i18n="media.send_payment_link">Payment</span>
                  </button>
                  <button class="attach-sheet-item" data-type="product">
                    <div class="attach-sheet-icon" style="color:#10b981;"><i class="fas fa-box-open"></i></div>
                    <span data-i18n="media.send_product">Product</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="conversation-emoji-menu hidden" id="conversationEmojiMenu" style="position:absolute; z-index:1000; background:#fff; border:1px solid #e5e7eb; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.12); padding:8px; transform-origin:bottom left; opacity:0; transform:scale(0.95); transition:opacity .15s ease, transform .15s ease; display:grid; grid-template-columns:repeat(6, 1fr); gap:6px; width:320px; max-width:calc(100vw - 24px);">
              <button class="emoji-item" style="font-size:20px; padding:6px 8px; border:none; background:none; border-radius:8px;">🙂</button>
              <button class="emoji-item" style="font-size:20px; padding:6px 8px; border:none; background:none; border-radius:8px;">�</button>
              <button class="emoji-item" style="font-size:20px; padding:6px 8px; border:none; background:none; border-radius:8px;">👍</button>
              <button class="emoji-item" style="font-size:20px; padding:6px 8px; border:none; background:none; border-radius:8px;">❤️</button>
              <button class="emoji-item" style="font-size:20px; padding:6px 8px; border:none; background:none; border-radius:8px;">🎉</button>
              <button class="emoji-item" style="font-size:20px; padding:6px 8px; border:none; background:none; border-radius:8px;">🙏</button>
              <button class="emoji-item" style="font-size:20px; padding:6px 8px; border:none; background:none; border-radius:8px;">�</button>
              <button class="emoji-item" style="font-size:20px; padding:6px 8px; border:none; background:none; border-radius:8px;">✨</button>
              <button class="emoji-item" style="font-size:20px; padding:6px 8px; border:none; background:none; border-radius:8px;">😉</button>
              <button class="emoji-item" style="font-size:20px; padding:6px 8px; border:none; background:none; border-radius:8px;">😎</button>
              <button class="emoji-item" style="font-size:20px; padding:6px 8px; border:none; background:none; border-radius:8px;">👏</button>
              <button class="emoji-item" style="font-size:20px; padding:6px 8px; border:none; background:none; border-radius:8px;">💪</button>
            </div>
            </div>
          `}
        </div>
        
        <div class="conversation-sidebar">
          <div class="conversation-sidebar-header">
            <div class="conversation-sidebar-title" data-i18n="conversation.contact_info">Contact Info</div>
            <div class="conversation-sidebar-tabs">
              <button class="conversation-sidebar-tab active" data-tab="info" data-i18n="conversation.info">Info</button>
              <button class="conversation-sidebar-tab" data-tab="notes" data-i18n="conversation.notes">Notes</button>
            </div>
          </div>
          <div class="conversation-sidebar-content" id="conversationSidebarContent">
            ${this.renderConversationSidebar(conversation)}
          </div>
        </div>
      </div>
      
      ${!isReadOnly && isMobileView ? `
        <div class="conversation-menu hidden" id="conversationMenu">
          ${canEndChat ? `
            <div class="conversation-menu-item" id="conversationEndChatMenuBtn">
              <i class="fas fa-stop-circle"></i>
              <span data-i18n="conversation.end_chat">End chat</span>
            </div>
          ` : ''}
          <div class="conversation-menu-item" id="conversationTransferBtn">
            <i class="fas fa-arrow-right"></i>
            <span data-i18n="conversation.transfer">Transfer Conversation</span>
          </div>
          <div class="conversation-menu-item" id="conversationChangeStageBtn">
            <i class="fas fa-arrows-alt"></i>
            <span data-i18n="conversation.change_stage">Change Stage</span>
          </div>
          <div class="conversation-menu-item" id="conversationCloseBtn">
            <i class="fas fa-times"></i>
            <span data-i18n="conversation.close">Close</span>
          </div>
        </div>

        <div class="conversation-stage-menu hidden" id="conversationStageMenu">
          <div class="conversation-panel-header">
            <span data-i18n="conversation.stage_title">Move to stage</span>
            <button class="conversation-panel-close" id="conversationStageCloseBtn">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="conversation-stage-list">
            ${stages.map(stage => `
              <button class="conversation-stage-item" data-stage-id="${stage.stage_key}">
                <span class="conversation-stage-dot" style="background:${stage.stage_color}"></span>
                <span>${stage.stage_name}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="conversation-transfer-panel hidden" id="conversationTransferPanel">
          <div class="conversation-panel-header">
            <span data-i18n="conversation.transfer_title">Transfer Conversation</span>
            <button class="conversation-panel-close" id="conversationTransferCloseBtn">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="conversation-panel-body">
            <div class="conversation-transfer-types">
              <button class="conversation-transfer-type ${transferType === 'department' ? 'active' : ''}" data-transfer-type="department" data-i18n="conversation.transfer_department">Department</button>
              <button class="conversation-transfer-type ${transferType === 'store' ? 'active' : ''}" data-transfer-type="store" data-i18n="conversation.transfer_store">Store</button>
            </div>
            <div class="conversation-transfer-select">
              <select id="conversationTransferSelect">
                ${transferOptionsHtml}
              </select>
            </div>
            <input type="text" id="conversationTransferReason" data-i18n-placeholder="conversation.transfer_reason">
            <button class="conversation-transfer-confirm" id="conversationTransferConfirm" data-i18n="conversation.transfer_confirm">Transfer</button>
          </div>
        </div>
      ` : ''}
    `;
  },

  renderMessages() {
    // Ensure messages are sorted by timestamp (oldest first)
    const sortedMessages = [...this.state.messages].sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return timeA - timeB; // Ascending order (oldest first)
    });
    
    return sortedMessages.map(msg => {
      let messageContent = '';
      
      // Debug log para verificar os dados da mensagem
      if (msg.message_type !== 'text') {
        console.log('Rendering media message:', {
          id: msg.id,
          message_type: msg.message_type,
          media_url: msg.media_url,
          content: msg.content,
          caption: msg.caption,
          text_body: msg.text_body,
          media_filename: msg.media_filename
        });
      }
      
      if (msg.message_type === 'text') {
        messageContent = msg.content || msg.text_content || msg.text_body || '';
      } else if (msg.message_type === 'image') {
        const imageUrl = msg.media_url || msg.content;
        const caption = msg.caption || msg.text_body || '';
        
        console.log('Image message details:', { 
          id: msg.id,
          imageUrl, 
          caption, 
          media_url: msg.media_url,
          content: msg.content,
          text_body: msg.text_body,
          allFields: Object.keys(msg)
        });
        
        // Check if we have a valid image URL
        if (imageUrl && 
            imageUrl !== '[Media]' && 
            imageUrl !== '[IMAGE]' && 
            imageUrl !== 'Morango' && 
            imageUrl !== caption &&
            (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('http'))) {
          
          console.log('✅ Valid image URL found:', imageUrl);
          
          messageContent = `
            <div class="media-message image-message">
              <img src="${imageUrl}" alt="Image" style="max-width: 250px; max-height: 200px; border-radius: 8px; cursor: pointer;" onclick="window.open('${imageUrl}', '_blank')" onerror="console.error('❌ Failed to load image:', '${imageUrl}'); this.style.display='none'; this.nextElementSibling.style.display='block';">
              <div style="display: none; padding: 12px; background: #f3f4f6; border-radius: 8px; text-align: center;">
                <i class="fas fa-image" style="font-size: 24px; color: #6b7280; margin-bottom: 8px;"></i><br>
                <span style="color: #6b7280;">Image (failed to load)</span>
              </div>
              ${caption && caption !== '[Media]' && caption !== '[IMAGE]' && caption !== imageUrl ? `<div class="media-caption">${caption}</div>` : ''}
            </div>
          `;
        } else {
          console.log('❌ Invalid or missing image URL:', { imageUrl, reasons: {
            isEmpty: !imageUrl,
            isMedia: imageUrl === '[Media]',
            isImagePlaceholder: imageUrl === '[IMAGE]',
            isMorango: imageUrl === 'Morango',
            isCaption: imageUrl === caption,
            hasValidPrefix: imageUrl && (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('http'))
          }});
          
          messageContent = `
            <div class="media-message image-message">
              <div style="padding: 12px; background: #f3f4f6; border-radius: 8px; text-align: center;">
                <i class="fas fa-image" style="font-size: 24px; color: #6b7280; margin-bottom: 8px;"></i><br>
                <span style="color: #6b7280;">Image</span>
                ${caption && caption !== '[Media]' && caption !== '[IMAGE]' ? `<div class="media-caption">${caption}</div>` : ''}
              </div>
            </div>
          `;
        }
      } else if (msg.message_type === 'video') {
        const videoUrl = msg.media_url || msg.content;
        const caption = msg.caption || msg.text_body || '';
        
        if (videoUrl && videoUrl !== '[Media]' && videoUrl !== '[VIDEO]') {
          messageContent = `
            <div class="media-message video-message">
              <video controls style="max-width: 250px; max-height: 200px; border-radius: 8px;">
                <source src="${videoUrl}" type="video/mp4">
                Your browser does not support video playback.
              </video>
              ${caption && caption !== '[Media]' && caption !== '[VIDEO]' ? `<div class="media-caption">${caption}</div>` : ''}
            </div>
          `;
        } else {
          messageContent = `
            <div class="media-message video-message">
              <div style="padding: 12px; background: #f3f4f6; border-radius: 8px; text-align: center;">
                <i class="fas fa-video" style="font-size: 24px; color: #6b7280; margin-bottom: 8px;"></i><br>
                <span style="color: #6b7280;">Video</span>
                ${caption && caption !== '[Media]' && caption !== '[VIDEO]' ? `<div class="media-caption">${caption}</div>` : ''}
              </div>
            </div>
          `;
        }
      } else if (msg.message_type === 'audio') {
        const audioUrl = msg.media_url || msg.content;
        const caption = msg.caption || msg.text_body || '';
        messageContent = `
          <div class="media-message audio-message">
            <div class="audio-player">
              <i class="fas fa-music" style="margin-right: 8px; color: #3b82f6;"></i>
              <audio controls style="width: 200px;">
                <source src="${audioUrl}" type="audio/mpeg">
                Your browser does not support audio playback.
              </audio>
            </div>
            ${caption && caption !== '[Media]' && caption !== '[AUDIO]' ? `<div class="media-caption">${caption}</div>` : ''}
          </div>
        `;
      } else if (msg.message_type === 'document') {
        const documentUrl = msg.media_url || msg.content;
        const fileName = msg.media_filename || msg.file_name || 'Document';
        const caption = msg.caption || msg.text_body || '';
        messageContent = `
          <div class="media-message document-message">
            <div class="document-preview" onclick="window.open('${documentUrl}', '_blank')" style="cursor: pointer;">
              <i class="fas fa-file-alt" style="font-size: 24px; margin-right: 8px; color: #6b7280;"></i>
              <span>${fileName}</span>
              <i class="fas fa-download" style="margin-left: 8px; color: #3b82f6;"></i>
            </div>
            ${caption && caption !== '[Media]' && caption !== '[DOCUMENT]' ? `<div class="media-caption">${caption}</div>` : ''}
          </div>
        `;
      } else {
        // Fallback for unknown message types
        messageContent = msg.content || msg.text_body || `[${msg.message_type?.toUpperCase() || 'MESSAGE'}]`;
      }
      
      const isOutgoing = msg.direction === 'outbound' || msg.sent_by_user_id || msg.sender_type === 'user' || msg.sender_type === 'agent';
      const senderName = msg.sent_by_name || msg.sender_name || this.state.userName || '';
      const senderDepartment = this.resolveDepartmentName(msg.sent_by_department) || this.getDepartmentNameById(this.state.departmentId) || '';
      const senderStore = this.resolveStoreName(msg.sent_by_store) || this.getStoreNameById(this.state.storeId) || '';
      const senderLocation = [senderStore, senderDepartment].filter(Boolean).join(' / ');
      const senderLabel = senderName && senderLocation ? `${senderName} - ${senderLocation}` : senderName;
      const senderHeader = isOutgoing && senderLabel ? `<div class="conversation-message-sender">${senderLabel}</div>` : '';

      return `
        <div class="conversation-message ${isOutgoing ? 'sent' : 'received'}">
          <div class="conversation-message-content">
            ${senderHeader}
            ${messageContent}
          </div>
          <div class="conversation-message-time">
            ${this.formatTime(msg.created_at)}
          </div>
        </div>
      `;
    }).join('');
  },

  renderConversationSidebar(conversation) {
    const cfg = window.UserConversationsConfig || {};
    const isAdmin = !!cfg.adminMode;
    
    // Return content based on active tab
    const activeTab = this.state.activeSidebarTab || 'info';
    
    if (activeTab === 'notes') {
      return this.renderNotesTab(conversation);
    }
    
    // Default Info tab
    return this.renderInfoTab(conversation, isAdmin);
  },

  renderInfoTab(conversation, isAdmin) {
    const departmentName = this.getDepartmentNameById(conversation.department_id || conversation.departmentId);
    const storeName = this.getStoreNameById(conversation.store_id || conversation.storeId);
    const attendantName = conversation.claimed_by_name || conversation.attendant_name || '';
    const cfg = window.UserConversationsConfig || {};
    const isLegacyWeb = this.state.whatsappWebActive && cfg.webSource === 'legacy';
    const canEditTags = !!isAdmin && !isLegacyWeb;
    
    return `
      <div class="contact-info-section">
        <div class="contact-info-label" data-i18n="conversation.phone">Phone</div>
        <div class="contact-info-value">${this.resolveContactPhone(conversation) || 'N/A'}</div>
      </div>
      
      <div class="tags-section">
        <div class="contact-info-label" data-i18n="conversation.tags">Tags</div>
        <div class="tags-list" id="tagsList">
          ${conversation.tags && conversation.tags.length > 0 ? 
            conversation.tags.map(tag => `
              <div class="tag-badge">
                ${tag}
                ${canEditTags ? `<span class="tag-badge-remove" data-tag-remove="${this.escapeHtml(tag)}"><i class="fas fa-times"></i></span>` : ''}
              </div>
            `).join('') : 
            `<span class="tag-empty" data-i18n="conversation.no_tags">No tags</span>`
          }
        </div>
        ${canEditTags ? `
          <div class="add-tag-row" style="display:flex;gap:8px;">
            <input type="text" class="add-tag-input" id="conversationTagInput" data-i18n-placeholder="conversation.add_tag_placeholder" placeholder="${this.t('conversation.add_tag_placeholder', 'Add a tag')}">
            <button class="btn btn-secondary btn-sm" id="conversationTagAddBtn" data-i18n="conversation.add_tag">Add</button>
          </div>
          <div class="tag-limit-hint" data-i18n="conversation.tags_limit">${this.t('conversation.tags_limit', 'Up to 3 tags per conversation')}</div>
        ` : ''}
      </div>
      
      ${isAdmin ? `
        <div class="contact-info-section">
          <div class="contact-info-label" data-i18n="conversation.assignment_title">Assignment</div>
          <div class="contact-info-value">
            <div><strong data-i18n="conversation.assignment_store">Store:</strong> ${storeName || '—'}</div>
            <div><strong data-i18n="conversation.assignment_department">Department:</strong> ${departmentName || '—'}</div>
            <div><strong data-i18n="conversation.assignment_user">User:</strong> ${attendantName || '—'}</div>
          </div>
        </div>
      ` : `
        ${this.isMobileView() ? '' : `
          <div class="contact-info-section">
            <div class="contact-info-label" data-i18n="conversation.transfer_title">Transfer Conversation</div>
            <div class="conversation-transfer-types">
              <button class="conversation-transfer-type ${this.state.transferTargetType === 'department' ? 'active' : ''}" data-transfer-type="department" data-i18n="conversation.transfer_department">Department</button>
              <button class="conversation-transfer-type ${this.state.transferTargetType === 'store' ? 'active' : ''}" data-transfer-type="store" data-i18n="conversation.transfer_store">Store</button>
            </div>
            <div class="conversation-transfer-select">
              <select id="conversationTransferSelect">
                ${(() => {
                  // Fix the key mapping - the state uses plural but UI uses singular
                  let optionsKey = this.state.transferTargetType;
                  if (optionsKey === 'store') optionsKey = 'stores';
                  if (optionsKey === 'department') optionsKey = 'departments';
                  
                  const options = this.state.transferOptions[optionsKey] || [];
                  return options.length > 0
                    ? options.map(option => `<option value="${option.id || option.name}">${option.name || option.id}</option>`).join('')
                    : `<option value="">${this.t('conversation.no_options', 'No options available')}</option>`;
                })()}
              </select>
            </div>
            <input type="text" id="conversationTransferReason" data-i18n-placeholder="conversation.add_transfer_note" placeholder="Add note for next agent (optional)">
            <button class="conversation-transfer-confirm" id="conversationTransferConfirm" data-i18n="conversation.transfer_confirm">Transfer</button>
          </div>
        `}
      `}
    `;
  },

  renderNotesTab(conversation) {
    const notes = this.state.conversationNotes || [];
    
    return `
      <div class="notes-section">
        <div class="notes-header">
          <div class="contact-info-label" data-i18n="conversation.conversation_notes">Conversation Notes</div>
          <div class="notes-subtitle" data-i18n="conversation.notes_subtitle">History for ${conversation.contact_phone || 'this contact'}</div>
        </div>
        
        <div class="notes-list" id="notesList">
          ${notes.length > 0 ? notes.map(note => `
            <div class="note-item ${note.noteType}" data-note-id="${note.id}">
              <div class="note-header">
                <div class="note-author">
                  <i class="fas ${this.getNoteIcon(note.noteType)}"></i>
                  <span>${note.createdBy}</span>
                </div>
                <div class="note-time">${this.formatTime(note.createdAt)}</div>
              </div>
              <div class="note-content">${this.escapeHtml(note.noteText)}</div>
              ${note.noteType === 'transfer' && (note.transferFrom || note.transferTo) ? `
                <div class="note-transfer-info">
                  <i class="fas fa-arrow-right"></i>
                  <span data-i18n="conversation.transferred_from_to">
                    ${note.transferFrom ? `From: ${note.transferFrom}` : ''} 
                    ${note.transferTo ? `To: ${note.transferTo}` : ''}
                  </span>
                </div>
              ` : ''}
            </div>
          `).join('') : `
            <div class="notes-empty">
              <i class="fas fa-sticky-note"></i>
              <div class="notes-empty-title" data-i18n="conversation.no_notes">No notes yet</div>
              <div class="notes-empty-subtitle" data-i18n="conversation.no_notes_subtitle">Notes will appear here when added during transfers</div>
            </div>
          `}
        </div>
      </div>
    `;
  },

  getNoteIcon(noteType) {
    switch (noteType) {
      case 'transfer': return 'fa-arrow-right';
      case 'system': return 'fa-cog';
      default: return 'fa-sticky-note';
    }
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // ============================================
  // EVENT LISTENERS
  // ============================================

  initEventListeners() {
    // Mobile menu
    document.getElementById('userMenuBtn')?.addEventListener('click', () => {
      this.toggleMobileMenu();
    });
    
    document.getElementById('ucSidebarCloseBtn')?.addEventListener('click', () => {
      this.toggleMobileMenu();
    });

    if (!this._mobileOutsideClickBound) {
      document.addEventListener('click', (e) => {
        const sidebar = document.getElementById('ucInternalSidebar');
        const menuBtn = document.getElementById('userMenuBtn');
        if (!sidebar || !sidebar.classList.contains('mobile-open')) return;
        if (sidebar.contains(e.target) || menuBtn?.contains(e.target)) return;
        this.closeMobileMenu();
      });
      this._mobileOutsideClickBound = true;
    }
    
    // Search
    document.getElementById('ucSidebarSearch')?.addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });
    
    // Conversation items
    this.attachConversationListeners();
    
    // Pipeline listeners
    this.attachPipelineListeners();

    this.attachMobileFilterListeners();
    
    // Pipeline stages manager (admin/tenant)
    const cfg = window.UserConversationsConfig || {};
    if (cfg.allowPipelineEdit) {
      document.getElementById('ucPipelineManageBtn')?.addEventListener('click', () => {
        this.openStagesManager();
      });
    }
    document.getElementById('ucPipelineFilterBtn')?.addEventListener('click', () => {
      this.openFilterModal();
    });

    document.addEventListener('click', (e) => {
      const transferConfirm = e.target.closest('#conversationTransferConfirm');
      if (transferConfirm) {
        this.handleEnhancedTransferConversation();
      }
    });
  },

  attachConversationListeners() {
    document.querySelectorAll('.uc-sidebar-conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        const conversationId = item.getAttribute('data-conversation-id');
        this.openConversation(conversationId);
      });
    });
  },

  attachPipelineListeners() {
    console.log('🎯 Attaching pipeline listeners...');
    const cfg = window.UserConversationsConfig || {};
    const readOnly = !!cfg.readOnly;
    
    // Pipeline cards
    const cards = document.querySelectorAll('.uc-pipeline-card');
    console.log('🎯 Found', cards.length, 'pipeline cards');
    
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const cardId = card.getAttribute('data-card-id');
        console.log('🎯 Card clicked:', cardId);
        this.openConversation(cardId);
      });
      
      if (!readOnly) {
        card.addEventListener('dragstart', (e) => {
          console.log('🎯 Drag start:', card.getAttribute('data-card-id'));
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', card.getAttribute('data-card-id'));
          card.classList.add('dragging');
        });
        
        card.addEventListener('dragend', () => {
          console.log('🎯 Drag end');
          card.classList.remove('dragging');
        });
      }
    });
    
    // Pipeline columns (drop zones)
    const columns = document.querySelectorAll('.uc-pipeline-column-body');
    console.log('🎯 Found', columns.length, 'drop zones');
    
    if (!readOnly) {
      columns.forEach(column => {
        column.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          column.style.backgroundColor = 'rgba(37, 211, 102, 0.05)';
        });
        
        column.addEventListener('dragleave', () => {
          column.style.backgroundColor = '';
        });
        
        column.addEventListener('drop', (e) => {
          e.preventDefault();
          column.style.backgroundColor = '';
          const stageId = column.getAttribute('data-stage-id');
          const cardId = e.dataTransfer.getData('text/plain');
          console.log('🎯 Drop:', cardId, 'to stage:', stageId);
          if (cardId && stageId) {
            // Add loading state
            const card = document.querySelector(`[data-card-id="${cardId}"]`);
            if (card) {
              card.style.opacity = '0.5';
              card.style.pointerEvents = 'none';
            }
            
            this.updateConversationStage(cardId, stageId).then(success => {
              if (card) {
                card.style.opacity = '1';
                card.style.pointerEvents = 'auto';
              }
              if (!success) {
                // If failed, reload conversations to reset state
                this.loadConversations();
              }
            });
          }
        });
      });
    }
    
    console.log('✅ Pipeline listeners attached');
  },
  
  // ============================================
  // STAGES MANAGER (ADMIN/TENANT)
  // ============================================
  openStagesManager() {
    const existing = document.getElementById('ucStagesModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'ucStagesModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
    const stages = this.state.pipeline.stages || [];
    modal.innerHTML = `
      <div style="background:#fff;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.15);width:90%;max-width:700px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #e5e7eb;">
          <h3 style="margin:0;font-size:18px;" data-i18n="pipeline.manage_stages">Manage Stages</h3>
          <button id="ucStagesCloseBtn" style="border:none;background:none;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div style="padding:16px;max-height:60vh;overflow:auto;">
          <div style="margin-bottom:12px;">
            <button id="ucStageAddBtn" class="btn btn-primary"><i class="fas fa-plus"></i> <span data-i18n="pipeline.add_stage">Add Stage</span></button>
          </div>
          <div id="ucStagesList">
            ${stages.map(s => `
              <div class="uc-stage-item" data-stage-id="${s.id || s.stage_key}" style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
                <span style="color:${s.stage_color}"><i class="${s.stage_icon}"></i></span>
                <input type="text" class="uc-stage-name" value="${s.stage_name}" style="flex:1;padding:8px;border:1px solid #e5e7eb;border-radius:6px;">
                <div style="display:flex;gap:8px;align-items:center;">
                  <input type="text" class="uc-stage-icon" value="${s.stage_icon}" style="width:180px;padding:8px;border:1px solid #e5e7eb;border-radius:6px;">
                  <button class="btn btn-secondary uc-stage-icon-picker"><i class="fas fa-icons"></i></button>
                </div>
                <input type="color" class="uc-stage-color" value="${s.stage_color}" style="width:44px;height:36px;padding:0;border:none;">
                <button class="btn btn-secondary uc-stage-save" data-i18n="btn.save">Save</button>
                <button class="btn btn-danger uc-stage-delete" data-i18n="btn.delete">Delete</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (typeof i18n !== 'undefined' && i18n.translatePage) i18n.translatePage();
    document.getElementById('ucStagesCloseBtn')?.addEventListener('click', () => modal.remove());
    document.getElementById('ucStageAddBtn')?.addEventListener('click', () => this.createStagePrompt());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    // Save/delete handlers
    modal.querySelectorAll('.uc-stage-save').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const item = e.target.closest('.uc-stage-item');
        if (!item) return;
        const stageId = item.getAttribute('data-stage-id');
        const name = item.querySelector('.uc-stage-name').value.trim();
        const icon = item.querySelector('.uc-stage-icon').value.trim();
        const color = item.querySelector('.uc-stage-color').value.trim();
        await this.updateStage(stageId, { stage_name: name, stage_icon: icon, stage_color: color });
        await this.loadPipelineStages();
        this.renderPipeline();
        this.openStagesManager(); // reopen to reflect changes
      });
    });
    modal.querySelectorAll('.uc-stage-icon-picker').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.uc-stage-item');
        const input = item?.querySelector('.uc-stage-icon');
        if (!input) return;
        this.openIconPicker(null, (cls) => {
          input.value = cls;
        });
      });
    });
    modal.querySelectorAll('.uc-stage-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const item = e.target.closest('.uc-stage-item');
        if (!item) return;
        const stageId = item.getAttribute('data-stage-id');
      if (typeof Modal !== 'undefined' && Modal.confirm) {
        Modal.confirm('pipeline.delete_title', 'pipeline.delete_move_unassigned', async () => {
          await this.deleteStage(stageId);
          await this.loadPipelineStages();
          this.renderPipeline();
          this.openStagesManager();
        });
      }
      });
    });
  },
  
  async createStagePrompt() {
    const overlayId = 'ucCreateStageModal';
    const existing = document.getElementById(overlayId);
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = overlayId;
    modal.style.cssText = 'position:fixed;inset:0;z-index:2100;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.15);width:90%;max-width:520px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #e5e7eb;">
          <h3 style="margin:0;font-size:18px;" data-i18n="pipeline.add_stage">Add Stage</h3>
          <button id="ucCreateStageClose" style="border:none;background:none;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div style="padding:16px;">
          <div class="form-group" style="margin-bottom:12px;">
            <label data-i18n="pipeline.stage_name">Stage Name</label>
            <input type="text" class="form-control" id="ucCreateStageName" placeholder="e.g., Negotiation">
          </div>
          <div class="form-group" style="margin-bottom:12px;display:flex;gap:8px;align-items:center;">
            <div style="flex:1">
              <label data-i18n="pipeline.stage_icon">Stage Icon</label>
              <input type="text" class="form-control" id="ucCreateStageIcon" placeholder="e.g., fas fa-handshake">
            </div>
            <button class="btn btn-secondary" id="ucCreateStageIconPicker">
              <i class="fas fa-icons"></i>
              <span data-i18n="pipeline.choose_icon">Choose Icon</span>
            </button>
            <span id="ucCreateStageIconPreview" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid #e5e7eb;border-radius:6px;">
              <i class="fas fa-circle"></i>
            </span>
          </div>
          <div class="form-group" style="margin-bottom:12px;">
            <label data-i18n="pipeline.stage_color">Stage Color</label>
            <input type="color" class="form-control" id="ucCreateStageColor" value="#6b7280">
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #e5e7eb;">
          <button class="btn btn-secondary" id="ucCreateStageCancel" data-i18n="btn.cancel">Cancel</button>
          <button class="btn btn-primary" id="ucCreateStageSave" data-i18n="btn.save">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (typeof i18n !== 'undefined' && i18n.translatePage) i18n.translatePage();
    const close = () => modal.remove();
    document.getElementById('ucCreateStageClose')?.addEventListener('click', close);
    document.getElementById('ucCreateStageCancel')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    const syncPreview = () => {
      const value = (document.getElementById('ucCreateStageIcon')?.value || '').trim() || 'fas fa-circle';
      const p = document.getElementById('ucCreateStageIconPreview');
      if (p) p.innerHTML = `<i class="${value}"></i>`;
    };
    document.getElementById('ucCreateStageIcon')?.addEventListener('input', syncPreview);
    document.getElementById('ucCreateStageIconPicker')?.addEventListener('click', () => {
      this.openIconPicker('ucCreateStageIcon', syncPreview);
    });
    document.getElementById('ucCreateStageSave')?.addEventListener('click', async () => {
      const name = (document.getElementById('ucCreateStageName')?.value || '').trim();
      const icon = (document.getElementById('ucCreateStageIcon')?.value || '').trim() || 'fas fa-circle';
      const color = (document.getElementById('ucCreateStageColor')?.value || '#6b7280').trim();
      if (!name) return;
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
      await this.createStage({ stage_key: key, stage_name: name, stage_icon: icon, stage_color: color });
      await this.loadPipelineStages();
      this.renderPipeline();
      close();
      this.openStagesManager();
    });
  },

  openIconPicker(targetInputId, onSelect) {
    const overlayId = 'ucIconPickerModal';
    const existing = document.getElementById(overlayId);
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = overlayId;
    modal.style.cssText = 'position:fixed;inset:0;z-index:2200;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
    const icons = this.getFontAwesomeIcons();
    const content = `
      <div style="background:#fff;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.15);width:92%;max-width:820px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #e5e7eb;">
          <h3 style="margin:0;font-size:18px;" data-i18n="pipeline.icon_picker_title">Choose Icon</h3>
          <button id="ucIconPickerClose" style="border:none;background:none;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div style="padding:12px;border-bottom:1px solid #e5e7eb;display:flex;gap:8px;align-items:center;">
          <i class="fas fa-search"></i>
          <input type="text" id="ucIconPickerSearch" class="form-control" placeholder="Search icons...">
        </div>
        <div id="ucIconPickerGrid" style="padding:16px;max-height:60vh;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill, minmax(90px,1fr));gap:10px;">
          ${icons.map(cls => `
            <button class="btn btn-light" data-icon-class="${cls}" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;">
              <span style="font-size:22px;"><i class="${cls}"></i></span>
              <span style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${cls.replace('fas ','').replace('far ','').replace('fab ','')}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
    modal.innerHTML = content;
    document.body.appendChild(modal);
    if (typeof i18n !== 'undefined' && i18n.translatePage) i18n.translatePage();
    const close = () => modal.remove();
    document.getElementById('ucIconPickerClose')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.getElementById('ucIconPickerGrid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-icon-class]');
      if (!btn) return;
      const cls = btn.getAttribute('data-icon-class');
      const input = document.getElementById(targetInputId);
      if (input) {
        input.value = cls;
        if (typeof onSelect === 'function') onSelect(cls);
      }
      close();
    });
    document.getElementById('ucIconPickerSearch')?.addEventListener('input', (e) => {
      const q = (e.target.value || '').toLowerCase();
      const filtered = icons.filter(c => c.toLowerCase().includes(q));
      const grid = document.getElementById('ucIconPickerGrid');
      if (grid) {
        grid.innerHTML = filtered.map(cls => `
          <button class="btn btn-light" data-icon-class="${cls}" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;">
            <span style="font-size:22px;"><i class="${cls}"></i></span>
            <span style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${cls.replace('fas ','').replace('far ','').replace('fab ','')}</span>
          </button>
        `).join('');
      }
    });
  },

  getFontAwesomeIcons() {
    return [
      'fas fa-inbox','fas fa-star','fas fa-handshake','fas fa-trophy','fas fa-times-circle',
      'fas fa-user','fas fa-users','fas fa-user-tie','fas fa-comments','fas fa-comment',
      'fas fa-phone','fas fa-mobile-alt','fas fa-bullhorn','fas fa-envelope','fas fa-tag',
      'fas fa-tags','fas fa-cogs','fas fa-cog','fas fa-check-circle','fas fa-check',
      'fas fa-exclamation-triangle','fas fa-exclamation-circle','fas fa-clock','fas fa-calendar',
      'fas fa-shopping-cart','fas fa-credit-card','fas fa-chart-line','fas fa-chart-bar',
      'fas fa-map-marker-alt','fas fa-file-alt','fas fa-folder','fas fa-globe','fas fa-robot',
      'fas fa-filter','fas fa-search','fas fa-plus','fas fa-minus','fas fa-sync','fas fa-edit',
      'fas fa-trash','fas fa-paper-plane','fas fa-eye','fas fa-link','fas fa-list','fas fa-bars',
      'fas fa-external-link-alt','fas fa-save','fas fa-copy','fas fa-vial','fas fa-icons'
    ];
  },
  
  async createStage(payload) {
    const headers = this.getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/admin/pipeline-stages', { method: 'POST', headers, body: JSON.stringify(payload) });
    return res.ok;
  },
  async updateStage(id, payload) {
    const headers = this.getAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(`/api/admin/pipeline-stages/${id}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
    return res.ok;
  },
  async deleteStage(id) {
    const headers = this.getAuthHeaders();
    const res = await fetch(`/api/admin/pipeline-stages/${id}`, { method: 'DELETE', headers });
    return res.ok;
  },

  toggleMobileMenu() {
    const sidebar = document.getElementById('ucInternalSidebar');
    if (sidebar) {
      sidebar.classList.toggle('mobile-open');
    }
  },

  toggleAccountDropdown() {
    const dropdown = document.getElementById('ucAccountDropdown');
    if (dropdown) {
      dropdown.classList.toggle('hidden');
    }
  },

  closeAccountDropdown() {
    const dropdown = document.getElementById('ucAccountDropdown');
    if (dropdown) {
      dropdown.classList.add('hidden');
    }
  },

  scrollPipelineBoard(direction) {
    const board = document.getElementById('ucPipelineBoard');
    if (!board) return;
    const amount = Math.max(240, Math.floor(board.clientWidth * 0.7));
    board.scrollBy({ left: direction * amount, behavior: 'smooth' });
  },

  closeMobileMenu() {
    const sidebar = document.getElementById('ucInternalSidebar');
    if (sidebar) {
      sidebar.classList.remove('mobile-open');
    }
  },

  setActiveAccount(accountId) {
    this.resetConversationSelection();
    this.state.activeAccountId = accountId;
    this.state.whatsappWebActive = false;
    this.state.loading = true;
    this.saveState();
    this.render();
    this.initEventListeners();
    setTimeout(() => {
      this.state.loading = false;
      this.loadConversations();
    }, 300);
  },

  setWhatsappWebActive() {
    this.resetConversationSelection();
    this.state.whatsappWebActive = true;
    this.state.loading = true;
    this.saveState();
    this.render();
    this.initEventListeners();
    setTimeout(() => {
      this.state.loading = false;
      this.loadConversations();
    }, 300);
  },

  resetConversationSelection() {
    this.closeConversation();
    this.state.messages = [];
    this.state.selectedConversation = null;
    this.state.selectedConversationId = null;
    this.state.conversations = [];
    this.state.filteredConversations = [];
    this.state.claimDeniedConversations = {};
  },

  attachMobileFilterListeners() {
    // Mobile account selector - remove old listeners first
    const mobileAccountSelector = document.getElementById('ucMobileAccountSelector');
    if (mobileAccountSelector && !mobileAccountSelector._listenerAttached) {
      mobileAccountSelector.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.closest('.uc-account-item')) return;
        this.toggleMobileAccountDropdown();
      });
      mobileAccountSelector._listenerAttached = true;
    }
    
    const mobileAccountDropdown = document.getElementById('ucMobileAccountDropdown');
    if (mobileAccountDropdown && !mobileAccountDropdown._listenerAttached) {
      mobileAccountDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.uc-account-item');
        if (!item) return;
        const accountType = item.getAttribute('data-account-type');
        if (accountType === 'web') {
          this.setWhatsappWebActive();
        } else {
          const accountId = item.getAttribute('data-account-id');
          if (accountId) {
            this.setActiveAccount(accountId);
          }
        }
        this.closeMobileAccountDropdown();
      });
      mobileAccountDropdown._listenerAttached = true;
    }
    
    // Close dropdown when clicking outside
    if (!this._mobileAccountOutsideClickBound) {
      document.addEventListener('click', (e) => {
        const selector = document.getElementById('ucMobileAccountSelector');
        const dropdown = document.getElementById('ucMobileAccountDropdown');
        if (!dropdown || dropdown.classList.contains('hidden')) return;
        if (selector?.contains(e.target)) return;
        this.closeMobileAccountDropdown();
      });
      this._mobileAccountOutsideClickBound = true;
    }
    
    document.getElementById('ucMobileSearchInput')?.addEventListener('input', (e) => {
      this.handleSearch(e.target.value);
    });
    document.querySelectorAll('.uc-mobile-filter-chip[data-filter]')?.forEach(chip => {
      chip.addEventListener('click', () => {
        const filterValue = chip.getAttribute('data-filter');
        if (filterValue) {
          this.setMobileQuickFilter(filterValue);
        }
      });
    });
    document.getElementById('ucMobileFilterToggle')?.addEventListener('click', () => {
      this.toggleMobileFilterPanel();
    });
    document.getElementById('ucMobileFilterClear')?.addEventListener('click', () => {
      this.clearFilters();
    });
    document.getElementById('ucMobileFilterSearch')?.addEventListener('input', (e) => {
      this.state.mobileFilterQuery = e.target.value || '';
      this.updateMobileFilterPanel();
    });
    document.getElementById('ucMobileFilterPanel')?.addEventListener('change', (e) => {
      const checkbox = e.target.closest('.uc-mobile-filter-checkbox');
      if (!checkbox) return;
      const type = checkbox.getAttribute('data-filter-type');
      const value = checkbox.value;
      if (type && value) {
        this.toggleFilterSelection(type, value, checkbox.checked);
      }
    });
  },

  toggleMobileAccountDropdown() {
    const dropdown = document.getElementById('ucMobileAccountDropdown');
    if (dropdown) {
      dropdown.classList.toggle('hidden');
    }
  },

  closeMobileAccountDropdown() {
    const dropdown = document.getElementById('ucMobileAccountDropdown');
    if (dropdown) {
      dropdown.classList.add('hidden');
    }
  },

  toggleMobileFilterPanel(forceOpen) {
    const panel = document.getElementById('ucMobileFilterPanel');
    if (!panel) return;
    if (typeof forceOpen === 'boolean') {
      this.state.filterPanelOpen = forceOpen;
    } else {
      this.state.filterPanelOpen = !this.state.filterPanelOpen;
    }
    panel.classList.toggle('hidden', !this.state.filterPanelOpen);
    this.updateMobileFilterChips();
  },

  openFilterModal() {
    const overlayId = 'ucFilterModal';
    const existing = document.getElementById(overlayId);
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = overlayId;
    modal.style.cssText = 'position:fixed;inset:0;z-index:2100;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.15);width:92%;max-width:720px;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #e5e7eb;">
          <h3 style="margin:0;font-size:18px;" data-i18n="conversations.filters">Filters</h3>
          <button id="ucFilterModalClose" style="border:none;background:none;font-size:18px;"><i class="fas fa-times"></i></button>
        </div>
        <div style="padding:16px;max-height:65vh;overflow:auto;" id="ucFilterModalBody">
          ${this.renderMobileFilterPanelContent()}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:1px solid #e5e7eb;">
          <button class="btn btn-secondary" id="ucFilterClearBtn" data-i18n="conversations.filter_clear">Clear</button>
          <button class="btn btn-primary" id="ucFilterApplyBtn" data-i18n="btn.apply">Apply</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (typeof i18n !== 'undefined' && i18n.translatePage) i18n.translatePage();
    const close = () => modal.remove();
    document.getElementById('ucFilterModalClose')?.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.getElementById('ucFilterClearBtn')?.addEventListener('click', () => {
      this.clearFilters();
      const body = document.getElementById('ucFilterModalBody');
      if (body) {
        body.innerHTML = this.renderMobileFilterPanelContent();
        if (typeof i18n !== 'undefined' && i18n.translatePage) i18n.translatePage();
      }
    });
    document.getElementById('ucFilterApplyBtn')?.addEventListener('click', () => {
      close();
    });
    document.getElementById('ucFilterModalBody')?.addEventListener('change', (e) => {
      const checkbox = e.target.closest('.uc-mobile-filter-checkbox');
      if (!checkbox) return;
      const type = checkbox.getAttribute('data-filter-type');
      const value = checkbox.value;
      if (type && value) {
        this.toggleFilterSelection(type, value, checkbox.checked);
      }
    });
  },

  updateMobileFilterPanel() {
    // Update account selector
    const accountSelector = document.getElementById('ucMobileAccountSelector');
    if (accountSelector) {
      const accounts = this.state.accounts || [];
      const connectedAccounts = accounts.filter(account => this.isAccountConnected(account));
      const activeAccount = connectedAccounts.find(a => String(a.id) === String(this.state.activeAccountId));
      const isWebActive = this.state.whatsappWebActive;
      
      const activeName = isWebActive ? 'WhatsApp Web' : (activeAccount?.name || 'Select Account');
      
      const currentBtn = accountSelector.querySelector('.uc-mobile-account-current');
      if (currentBtn) {
        const nameSpan = currentBtn.querySelector('.uc-mobile-account-name');
        if (nameSpan) {
          nameSpan.textContent = activeName;
        }
      }
      
      // Update dropdown content
      const dropdown = document.getElementById('ucMobileAccountDropdown');
      if (dropdown) {
        dropdown.innerHTML = this.renderAccountDropdownItems();
      }
    }
    
    const panel = document.getElementById('ucMobileFilterPanel');
    if (!panel) return;
    panel.innerHTML = this.renderMobileFilterPanelContent();
    document.getElementById('ucMobileFilterClear')?.addEventListener('click', () => {
      this.clearFilters();
    });
    document.getElementById('ucMobileFilterSearch')?.addEventListener('input', (e) => {
      this.state.mobileFilterQuery = e.target.value || '';
      this.updateMobileFilterPanel();
    });
    if (typeof i18n !== 'undefined' && i18n.translatePage) {
      i18n.translatePage();
    }
  },

  updateMobileFilterChips() {
    const chips = document.querySelectorAll('.uc-mobile-filter-chip');
    chips.forEach(chip => {
      const filterValue = chip.getAttribute('data-filter');
      if (filterValue) {
        chip.classList.toggle('active', filterValue === this.state.mobileQuickFilter);
      }
    });
    const toggle = document.getElementById('ucMobileFilterToggle');
    if (toggle) {
      toggle.classList.toggle('active', this.state.filterPanelOpen);
      const count = this.getActiveFilterCount();
      const badge = toggle.querySelector('.uc-mobile-filter-count');
      if (count > 0) {
        if (badge) {
          badge.textContent = count;
        } else {
          toggle.insertAdjacentHTML('beforeend', `<span class="uc-mobile-filter-count">${count}</span>`);
        }
      } else if (badge) {
        badge.remove();
      }
    }
  },

  setMobileQuickFilter(filterValue) {
    this.state.mobileQuickFilter = filterValue;
    this.saveState();
    this.applyFilters();
    this.updateSidebar();
    this.updateMobileFilterChips();
  },

  clearFilters() {
    this.state.filters = { stages: [], departments: [], stores: [], tags: [] };
    this.saveState();
    this.applyFilters();
    this.updateSidebar();
    this.updateMobileFilterPanel();
    this.updateMobileFilterChips();
  },

  toggleFilterSelection(type, value, checked) {
    const list = new Set(this.state.filters[type] || []);
    if (checked) {
      list.add(value);
    } else {
      list.delete(value);
    }
    this.state.filters[type] = Array.from(list);
    this.saveState();
    this.applyFilters();
    this.updateSidebar();
    this.updateMobileFilterChips();
  },

  applyFilters() {
    const searchQuery = (this.state.searchQuery || '').toLowerCase();
    let filtered = this.state.conversations.slice();
    if (searchQuery) {
      filtered = filtered.filter(conv => {
        const name = (conv.contact_name || '').toLowerCase();
        const phone = (conv.contact_phone || '').toLowerCase();
        return name.includes(searchQuery) || phone.includes(searchQuery);
      });
    }
    if (this.state.mobileQuickFilter === 'unread') {
      filtered = filtered.filter(conv => (conv.unread_count || 0) > 0);
    }
    const { stages, departments, stores, tags } = this.state.filters;
    if (stages?.length) {
      filtered = filtered.filter(conv => stages.includes(String(conv.stage_id || conv.pipeline_stage || '')));
    }
    if (departments?.length) {
      filtered = filtered.filter(conv => departments.includes(String(conv.department_id || conv.departmentId || '')));
    }
    if (stores?.length) {
      filtered = filtered.filter(conv => stores.includes(String(conv.store_id || conv.storeId || '')));
    }
    if (tags?.length) {
      filtered = filtered.filter(conv => (conv.tags || []).some(tag => tags.includes(String(tag))));
    }
    this.state.filteredConversations = filtered;
  },

  handleSearch(query) {
    this.state.searchQuery = query;
    this.saveState();
    this.applyFilters();
    this.updateSidebar();
  },

  async openConversation(conversationId) {
    const targetId = String(conversationId);
    const conversation = this.state.conversations.find(c => String(c.id) === targetId);
    if (!conversation) return;
    if (this.state.whatsappWebActive && conversation.source !== 'whatsapp_web') return;
    if (!this.state.whatsappWebActive && conversation.source === 'whatsapp_web') return;
    
    this.state.selectedConversationId = conversation.id;
    this.state.selectedConversation = conversation;
    this.state.activeSidebarTab = 'info'; // Reset to info tab
    await this.ensureAttendantNames();

    if (this.state.whatsappWebActive) {
      const success = await this.loadMessages(conversation.id);
      if (!success) {
        this.state.messages = conversation.last_message_text ? [{
          sender_type: 'contact',
          content: conversation.last_message_text,
          message_type: 'text',
          created_at: conversation.last_message_time
        }] : [];
      }
      if (this.isMobileView()) {
        this.showConversationModal();
      } else {
        this.showConversationPanel();
      }
      this.closeMobileMenu();
      return;
    }
    
    // Load messages (admin opens all without claiming)
    const cfg = window.UserConversationsConfig || {};
    const success = await this.loadMessages(conversation.id);
    if (!success) {
      if (typeof Modal !== 'undefined' && Modal.alert) {
        Modal.alert('conversation.error_title', 'conversation.claimed_error', 'warning');
      }
      return;
    }
    
    await this.loadEnhancedTransferOptions();
    this.loadConversationNotes(conversation.id);
    
    if (this.isMobileView()) {
      this.showConversationModal();
    } else {
      this.showConversationPanel();
    }
    
    // Close mobile menu
    this.closeMobileMenu();
  },

  showConversationPanel() {
    const panel = document.getElementById('ucConversationPanel');
    const pipeline = document.querySelector('.uc-pipeline-container');
    const modal = document.getElementById('conversation-modal');
    const overlay = document.getElementById('conversation-overlay');
    
    if (!panel || !this.state.selectedConversation) return;
    
    panel.innerHTML = this.renderConversationModal(this.state.selectedConversation);
    panel.classList.remove('hidden');
    pipeline?.classList.add('hidden');
    modal?.classList.add('hidden');
    if (modal) {
      modal.innerHTML = '';
    }
    overlay?.classList.add('hidden');
    overlay?.classList.remove('visible');
    
    this.state.conversationModalOpen = true;
    if (typeof i18n !== 'undefined' && i18n.translatePage) {
      i18n.translatePage();
    }
    
    this.attachConversationModalListeners();
    this.attachSidebarListeners(); // Initialize sidebar listeners
    
    setTimeout(() => {
      const messagesArea = document.getElementById('conversationMessages');
      if (messagesArea) {
        messagesArea.scrollTop = messagesArea.scrollHeight;
      }
    }, 100);
  },

  closeConversation() {
    // Close conversation panel or modal
    if (this.isMobileView()) {
      this.closeConversationModal();
    } else {
      this.closeConversationPanel();
    }
  },

  closeConversationPanel() {
    const panel = document.getElementById('ucConversationPanel');
    const pipeline = document.querySelector('.uc-pipeline-container');
    
    if (this.state.selectedConversationId) {
      const cfg = window.UserConversationsConfig || {};
      if (!this.state.whatsappWebActive && !cfg.adminMode) {
        this.releaseConversation(this.state.selectedConversationId);
      }
    }
    
    if (panel) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
    }
    pipeline?.classList.remove('hidden');
    
    this.state.selectedConversationId = null;
    this.state.selectedConversation = null;
    this.state.conversationModalOpen = false;
  },

  showConversationModal() {
    const modal = document.getElementById('conversation-modal');
    const overlay = document.getElementById('conversation-overlay');
    
    if (!modal || !this.state.selectedConversation) return;
    
    modal.innerHTML = this.renderConversationModal(this.state.selectedConversation);
    modal.classList.remove('hidden');
    overlay.classList.remove('hidden');
    overlay.classList.add('visible');
    
    this.state.conversationModalOpen = true;
    if (typeof i18n !== 'undefined' && i18n.translatePage) {
      i18n.translatePage();
    }
    
    // Attach event listeners for modal
    this.attachConversationModalListeners();
    this.attachSidebarListeners(); // Initialize sidebar listeners
    
    // Scroll messages to bottom
    setTimeout(() => {
      const messagesArea = document.getElementById('conversationMessages');
      if (messagesArea) {
        messagesArea.scrollTop = messagesArea.scrollHeight;
      }
    }, 100);
  },

  closeConversationModal() {
    const modal = document.getElementById('conversation-modal');
    const overlay = document.getElementById('conversation-overlay');
    
    if (this.state.selectedConversationId) {
      const cfg = window.UserConversationsConfig || {};
      if (!this.state.whatsappWebActive && !cfg.adminMode) {
        this.releaseConversation(this.state.selectedConversationId);
      }
    }
    
    modal.classList.add('hidden');
    overlay.classList.add('hidden');
    overlay.classList.remove('visible');
    
    this.state.selectedConversationId = null;
    this.state.selectedConversation = null;
    this.state.conversationModalOpen = false;
  },

  attachConversationModalListeners() {
    const cfg = window.UserConversationsConfig || {};
    const readOnly = !!cfg.readOnly;
    // Back button
    document.getElementById('conversationBackBtn')?.addEventListener('click', () => {
      if (this.isMobileView()) {
        this.closeConversationModal();
      } else {
        this.closeConversationPanel();
      }
    });
    
    // Send/attach actions (disabled in read-only mode)
    if (!readOnly) {
      document.getElementById('conversationSendBtn')?.addEventListener('click', () => {
        this.handleSendMessage();
      });
      
      document.getElementById('conversationInputField')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSendMessage();
        }
      });
      
      document.getElementById('conversationAttachBtn')?.addEventListener('click', () => {
        if (this.isMobileView()) {
          this.openAttachModal();
          return;
        }
        const menu = document.getElementById('conversationAttachMenu');
        if (menu) {
          menu.classList.toggle('hidden');
          if (!menu.classList.contains('hidden')) {
            this.positionFloatingMenu('conversationAttachMenu', 'conversationAttachBtn');
            menu.style.opacity = '1';
            menu.style.transform = 'scale(1)';
          }
        }
      });
      document.getElementById('conversationEmojiBtn')?.addEventListener('click', () => {
        const menu = document.getElementById('conversationEmojiMenu');
        if (menu) {
          menu.classList.toggle('hidden');
          if (!menu.classList.contains('hidden')) {
            this.initAdvancedEmojiPicker();
            this.positionFloatingMenu('conversationEmojiMenu', 'conversationEmojiBtn');
            menu.style.opacity = '1';
            menu.style.transform = 'scale(1)';
          }
        }
      });
      document.getElementById('conversationAttachMenu')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.attach-item');
        if (!btn) return;
        const type = btn.getAttribute('data-type');
        this.handleAttachOption(type);
      });
      document.getElementById('conversationAttachModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'conversationAttachModal') {
          this.closeAttachModal();
          return;
        }
        const btn = e.target.closest('.attach-sheet-item');
        if (!btn) return;
        const type = btn.getAttribute('data-type');
        this.handleAttachOption(type);
      });
      document.getElementById('conversationAttachModalClose')?.addEventListener('click', () => {
        this.closeAttachModal();
      });
      document.getElementById('conversationEmojiMenu')?.addEventListener('click', (e) => {
        const emojiBtn = e.target.closest('.emoji-item');
        if (!emojiBtn) return;
        const input = document.getElementById('conversationInputField');
        if (!input) return;
        input.value = (input.value || '') + emojiBtn.textContent;
        input.focus();
      });
      document.getElementById('conversationFileInput')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        // Get the media type from the input attribute
        const mediaType = e.target.getAttribute('data-media-type') || 'document';
        
        // Open media preview modal
        this.openMediaPreviewModal(file, mediaType);
        
        // Clear the input
        e.target.value = '';
      });
    }
    
    // Menu button
    document.getElementById('conversationMenuBtn')?.addEventListener('click', () => {
      this.toggleConversationMenu();
    });

    document.getElementById('conversationCloseBtn')?.addEventListener('click', () => {
      if (this.isMobileView()) {
        this.closeConversationModal();
      } else {
        this.closeConversationPanel();
      }
    });

    document.getElementById('conversationEndChatBtn')?.addEventListener('click', () => {
      this.endChatConversation();
    });

    document.getElementById('conversationEndChatMenuBtn')?.addEventListener('click', () => {
      this.endChatConversation();
      this.toggleConversationMenu(false);
    });

    document.getElementById('conversationChangeStageBtn')?.addEventListener('click', () => {
      this.openStageMenu();
    });

    document.getElementById('conversationTransferBtn')?.addEventListener('click', () => {
      this.openTransferPanel();
    });

    document.getElementById('conversationStageCloseBtn')?.addEventListener('click', () => {
      this.closeStageMenu();
    });

    document.getElementById('conversationTransferCloseBtn')?.addEventListener('click', () => {
      this.closeTransferPanel();
    });

    document.querySelectorAll('.conversation-stage-item').forEach(item => {
      item.addEventListener('click', () => {
        const stageId = item.getAttribute('data-stage-id');
        if (stageId && this.state.selectedConversationId) {
          this.updateConversationStage(this.state.selectedConversationId, stageId).then(() => {
            this.closeStageMenu();
            this.toggleConversationMenu(false);
          });
        }
      });
    });

    document.querySelectorAll('.conversation-transfer-type').forEach(item => {
      item.addEventListener('click', () => {
        const transferType = item.getAttribute('data-transfer-type');
        if (transferType) {
          this.state.transferTargetType = transferType;
          this.saveState();
          this.updateTransferOptions();
          document.querySelectorAll('.conversation-transfer-type').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-transfer-type') === transferType);
          });
        }
      });
    });

  },

  async handleSendMessage() {
    const inputField = document.getElementById('conversationInputField');
    if (!inputField || !inputField.value.trim()) return;
    const content = inputField.value.trim();
    inputField.value = '';

    // Optimistic render
    const optimistic = {
      sender_type: 'user',
      message_type: 'text',
      content,
      created_at: new Date().toISOString()
    };

    if (this.state.whatsappWebActive) {
      this.addMessageToView(optimistic);
      const result = await this.sendMessage(this.state.selectedConversationId, content);
      if (!result?.success) {
        await this.loadMessages(this.state.selectedConversationId);
        this.refreshMessagesView();
        const field = document.getElementById('conversationInputField');
        if (field) field.value = content;
        return;
      }
      setTimeout(async () => {
        const ok = await this.loadMessages(this.state.selectedConversationId);
        if (ok !== false) this.refreshMessagesView();
      }, 400);
      return;
    }

    // Ensure claimed before sending
    if (!this.state.whatsappWebActive) {
      await this.claimConversation(this.state.selectedConversationId);
      await this.ensureConversationVisibility(this.state.selectedConversationId);
    }
    // Add optimistic immediately
    this.addMessageToView(optimistic);
    // Send
    const result = await this.sendMessage(this.state.selectedConversationId, content);
    if (!result?.success) {
      if (typeof Modal !== 'undefined' && Modal.alert) {
        Modal.alert('Error', result?.message || 'Error sending message', 'warning');
      }
      await this.loadMessages(this.state.selectedConversationId);
      this.refreshMessagesView();
      const field = document.getElementById('conversationInputField');
      if (field) field.value = content;
      return;
    }
    setTimeout(async () => {
      const ok = await this.loadMessages(this.state.selectedConversationId);
      if (ok !== false) this.refreshMessagesView();
    }, 400);
  },

  addMessageToView(message) {
    const messagesArea = document.getElementById('conversationMessages');
    if (!messagesArea) return;
    
    // Ensure messages array exists
    if (!Array.isArray(this.state.messages)) {
      this.state.messages = [];
    }
    
    // Add the new message
    this.state.messages.push(message);
    
    // Sort messages by timestamp to ensure correct order
    this.state.messages.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return timeA - timeB; // Ascending order (oldest first)
    });
    
    // Re-render all messages
    messagesArea.innerHTML = this.renderMessages();
    messagesArea.scrollTop = messagesArea.scrollHeight;
  },

  refreshMessagesView() {
    const messagesArea = document.getElementById('conversationMessages');
    if (!messagesArea) return;
    messagesArea.innerHTML = this.renderMessages();
    messagesArea.scrollTop = messagesArea.scrollHeight;
  },

  renderActiveConversation() {
    if (!this.state.selectedConversation) return;
    const messagesArea = document.getElementById('conversationMessages');
    if (!messagesArea) return;
    messagesArea.innerHTML = this.renderMessages();
    messagesArea.scrollTop = messagesArea.scrollHeight;
  },

  toggleConversationMenu(forceVisible) {
    const menu = document.getElementById('conversationMenu');
    if (menu) {
      if (typeof forceVisible === 'boolean') {
        menu.classList.toggle('hidden', !forceVisible);
      } else {
        menu.classList.toggle('hidden');
      }
    }
  },
  
  positionFloatingMenu(menuId, anchorId) {
    const menu = document.getElementById(menuId);
    const anchor = document.getElementById(anchorId);
    if (!menu || !anchor) return;
    
    const rect = anchor.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    
    // Menu dimensions
    const menuW = menuId === 'conversationEmojiMenu' ? 320 : 200;
    const menuH = menuId === 'conversationEmojiMenu' ? 420 : (menuId === 'conversationAttachMenu' ? 240 : 180);
    
    // Calculate position
    let top = rect.bottom + 8; // Default: below the button
    let left = rect.left;
    
    // Check if menu would go off-screen vertically
    if (top + menuH > viewportH) {
      // Position above the button instead
      top = rect.top - menuH - 8;
      menu.style.transformOrigin = 'bottom left';
    } else {
      menu.style.transformOrigin = 'top left';
    }
    
    // Check if menu would go off-screen horizontally
    if (left + menuW > viewportW) {
      left = viewportW - menuW - 16;
    }
    
    // Ensure menu doesn't go off the left edge
    if (left < 16) {
      left = 16;
    }
    
    // Ensure menu doesn't go off the top edge
    if (top < 16) {
      top = 16;
    }
    
    menu.style.position = 'fixed';
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.minWidth = `${menuW}px`;
    if (menuId === 'conversationEmojiMenu') {
      menu.style.width = `${menuW}px`;
    }
    
    // Close handler
    const closeHandler = (e) => {
      if (!menu.contains(e.target) && !anchor.contains(e.target)) {
        menu.style.opacity = '0';
        menu.style.transform = 'scale(0.95)';
        setTimeout(() => menu.classList.add('hidden'), 120);
        document.removeEventListener('click', closeHandler, true);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler, true), 0);
  },
  
  handleAttachOption(type) {
    if (type === 'product') {
      this.closeAttachModal();
      this.openProductModal();
      return;
    }
    if (type === 'payment') {
      this.closeAttachModal();
      this.openPaymentModal();
      return;
    }
    this.closeAttachModal();
    
    // Close attach menu
    const attachMenu = document.getElementById('conversationAttachMenu');
    if (attachMenu) {
      attachMenu.style.opacity = '0';
      attachMenu.style.transform = 'scale(0.95)';
      setTimeout(() => attachMenu.classList.add('hidden'), 120);
    }
    
    const fileInput = document.getElementById('conversationFileInput');
    if (!fileInput) return;
    
    // Set file type filter
    if (type === 'image') fileInput.accept = 'image/*';
    else if (type === 'video') fileInput.accept = 'video/*';
    else if (type === 'audio') fileInput.accept = 'audio/*';
    else fileInput.accept = 'application/*';
    
    // Store the media type for later use
    fileInput.setAttribute('data-media-type', type);
    fileInput.click();
  },

  openAttachModal() {
    const modal = document.getElementById('conversationAttachModal');
    if (!modal) return;
    modal.classList.remove('hidden');
  },

  closeAttachModal() {
    const modal = document.getElementById('conversationAttachModal');
    if (!modal) return;
    modal.classList.add('hidden');
  },


  openStageMenu() {
    this.toggleConversationMenu(false);
    const menu = document.getElementById('conversationStageMenu');
    if (menu) {
      menu.classList.remove('hidden');
    }
  },

  closeStageMenu() {
    const menu = document.getElementById('conversationStageMenu');
    if (menu) {
      menu.classList.add('hidden');
    }
  },

  openTransferPanel() {
    this.toggleConversationMenu(false);
    const panel = document.getElementById('conversationTransferPanel');
    if (panel) {
      panel.classList.remove('hidden');
      this.loadTransferOptions();
      this.updateTransferOptions();
    }
  },

  closeTransferPanel() {
    const panel = document.getElementById('conversationTransferPanel');
    if (panel) {
      panel.classList.add('hidden');
    }
  },

  updateTransferOptions() {
    console.log('🔄 Updating transfer options UI...');
    console.log('🔍 Current transfer target type:', this.state.transferTargetType);
    console.log('🔍 Available transfer options:', this.state.transferOptions);
    
    const select = document.getElementById('conversationTransferSelect');
    if (!select) {
      // Element doesn't exist yet - this is normal if no conversation is open
      console.log('ℹ️ Transfer select element not found (no conversation open)');
      return;
    }
    
    // Fix the key mapping - the state uses plural but UI uses singular
    let optionsKey = this.state.transferTargetType;
    if (optionsKey === 'store') optionsKey = 'stores';
    if (optionsKey === 'department') optionsKey = 'departments';
    
    const options = this.state.transferOptions[optionsKey] || [];
    console.log('📊 Transfer options for', this.state.transferTargetType, '(key:', optionsKey, '):', options);
    
    if (options.length === 0) {
      console.warn('⚠️ No transfer options available');
      select.innerHTML = `<option value="">${this.t('conversation.no_options', 'No options available')}</option>`;
      return;
    }
    
    // Use the same approach as the old system - use option.name for both value and display
    const optionsHtml = options.map(option => {
      const name = this.getTransferOptionLabel(option);
      const value = option.id || option.name || name;
      return `<option value="${value}">${name}</option>`;
    }).join('');
    
    console.log('📊 Generated options HTML:', optionsHtml);
    select.innerHTML = optionsHtml;
    console.log('✅ Transfer options updated successfully');
  },

  async handleTransferConversation() {
    const select = document.getElementById('conversationTransferSelect');
    const reasonInput = document.getElementById('conversationTransferReason');
    if (!select || !select.value || !this.state.selectedConversationId) {
      return;
    }
    const payload = {
      newUserId: null,
      newStoreId: null,
      newDepartmentId: null,
      reason: reasonInput?.value?.trim() || ''
    };
    if (this.state.transferTargetType === 'store') {
      payload.newStoreId = select.value;
    } else {
      payload.newDepartmentId = select.value;
    }
    try {
      const response = await fetch(`/api/user/whatsapp-cloud/conversations/${this.state.selectedConversationId}/transfer`, {
        method: 'PUT',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        this.closeTransferPanel();
        this.toggleConversationMenu(false);
        this.loadConversations();
      }
    } catch (error) {
      console.error('Error transferring conversation:', error);
    }
  },

  attachConversationListeners() {
    document.querySelectorAll('.uc-sidebar-conversation-item').forEach(item => {
      item.addEventListener('click', () => {
        const conversationId = item.getAttribute('data-conversation-id');
        this.openConversation(conversationId);
      });
    });
  },

  // ============================================
  // SOCKET.IO HANDLERS
  // ============================================

  updateConversationPreview(conversationId, message) {
    const conversation = this.state.conversations.find(c => c.id === conversationId);
    if (conversation) {
      conversation.last_message = message.content;
      conversation.last_message_text = message.content;
      conversation.last_message_time = message.created_at;
    }
    this.updateSidebar();
  },

  updateConversationClaim(conversationId, userId, userName) {
    if (userId !== this.state.userId) {
      this.loadConversations();
      return;
    }
    const conversation = this.state.conversations.find(c => c.id === conversationId);
    if (conversation) {
      conversation.claimed_by_user_id = userId;
      conversation.claimed_by_name = userName;
    }
  },

  updateConversationRelease(conversationId) {
    this.loadConversations();
  },

  updatePipelineCards() {
    this.state.pipeline.cards = this.state.conversations.map(conv => ({
      id: conv.id,
      contact_name: conv.contact_name,
      contact_phone: conv.contact_phone,
      contact_avatar: conv.contact_profile_pic,
      last_message: conv.last_message_text,
      last_message_time: conv.last_message_time,
      stage_id: conv.stage_id || 'unassigned',
      tags: Array.isArray(conv.tags) ? conv.tags : (conv.tags ? JSON.parse(conv.tags) : []),
      claimed_by_user_id: conv.claimed_by_user_id,
      claimed_by_name: conv.claimed_by_name,
      claimed_by_store: conv.claimed_by_store,
      claimed_by_department: conv.claimed_by_department
    }));
  },

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  isMobileView() {
    return window.matchMedia('(max-width: 768px)').matches;
  },

  formatTime(timestamp) {
    if (!timestamp) return '';
    let ms = timestamp;
    if (typeof ms === 'number') {
      ms = ms < 1e12 ? ms * 1000 : ms;
    } else if (typeof ms === 'string' && /^\d+$/.test(ms)) {
      const n = Number(ms);
      ms = n < 1e12 ? n * 1000 : n;
    }
    const date = new Date(ms);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return this.t('conversations.just_now', 'now');
    if (diffMins < 60) {
      const label = this.t('conversations.min_ago', 'm ago', { count: diffMins });
      if (label.includes('{{count}}')) return label.replace('{{count}}', diffMins);
      return /\d/.test(label) ? label : `${diffMins}${label}`;
    }
    if (diffHours < 24) {
      const label = this.t('conversations.hours_ago', 'h ago', { count: diffHours });
      if (label.includes('{{count}}')) return label.replace('{{count}}', diffHours);
      return /\d/.test(label) ? label : `${diffHours}${label}`;
    }
    if (diffDays < 7) {
      const label = this.t('conversations.days_ago', 'd ago', { count: diffDays });
      if (label.includes('{{count}}')) return label.replace('{{count}}', diffDays);
      return /\d/.test(label) ? label : `${diffDays}${label}`;
    }
    
    return date.toLocaleDateString();
  },

  truncate(text, length) {
    if (!text) return '';
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
  },
  
  getAttendantLabel(card) {
    if (!card?.claimed_by_user_id) {
      return this.t('pipeline.unassigned', 'Unassigned');
    }
    const userName = card.claimed_by_name || '';
    const storeName = card.claimed_by_store || this.getStoreNameById(this.state.storeId) || '';
    const deptName = card.claimed_by_department || this.getDepartmentNameById(this.state.departmentId) || '';
    const location = [storeName, deptName].filter(Boolean).join(' / ');
    if (userName && location) {
      return `${userName} - ${location}`;
    }
    return userName || this.t('pipeline.assigned', 'Assigned');
  },

  getUserHeaderTitle() {
    const userName = this.state.userName || '';
    const storeName = this.getStoreNameById(this.state.storeId) || '';
    const deptName = this.getDepartmentNameById(this.state.departmentId) || '';
    const location = deptName || storeName || '';
    return location ? `${userName} - ${location}` : userName;
  },

  getAccountStatusInfo(account) {
    const rawStatus = (account?.connection_status || account?.status || 'disconnected')
      .toString()
      .toLowerCase();
    const status = rawStatus === 'connected' ? 'connected' : (rawStatus === 'pending' ? 'pending' : 'disconnected');
    const label = status === 'connected'
      ? this.t('conversations.connected', 'Connected')
      : this.t('conversations.disconnected', 'Disconnected');
    return { status, label };
  },

  isAccountConnected(account) {
    return (account?.connection_status || account?.status || '').toString().toLowerCase() === 'connected';
  },

  getWebStatusInfo() {
    const rawStatus = (this.state.webConnectionStatus?.status || '').toString().toLowerCase();
    const connected = this.state.webConnectionStatus?.connected === true || rawStatus === 'connected';
    const status = rawStatus === 'connecting' ? 'connecting' : (connected ? 'connected' : 'disconnected');
    const label = status === 'connecting'
      ? this.t('conversations.connecting', 'Connecting...')
      : (status === 'connected'
        ? this.t('conversations.connected', 'Connected')
        : this.t('conversations.disconnected', 'Disconnected'));
    return { status, label };
  },
  
  getStoreNameById(id) {
    if (!id) return null;
    const s = (this.state.transferOptions.stores || []).find(x => String(x.id) === String(id) || String(x.name) === String(id));
    return s?.name || s?.store_name || null;
  },
  
  getDepartmentNameById(id) {
    if (!id) return null;
    const d = (this.state.transferOptions.departments || []).find(x => String(x.id) === String(id) || String(x.name) === String(id));
    return d?.name || d?.department_name || null;
  },

  resolveStoreName(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
      return this.getStoreNameById(raw) || raw;
    }
    return raw;
  },

  resolveDepartmentName(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
      return this.getDepartmentNameById(raw) || raw;
    }
    return raw;
  },
  
  async ensureAttendantNames() {
    if (this.getStoreNameById(this.state.storeId) && this.getDepartmentNameById(this.state.departmentId)) return;
    try {
      if (this.state.storeId && !this.getStoreNameById(this.state.storeId)) {
        const r1 = await fetch(`/api/tenant/stores/${this.state.storeId}`, { headers: this.getAuthHeaders() });
        if (r1.ok) {
          const j1 = await r1.json();
          const s = j1?.data;
          if (s) {
            const ids = new Set(this.state.transferOptions.stores.map(x => String(x.id)));
            if (!ids.has(String(s.id))) this.state.transferOptions.stores.push(s);
          }
        }
      }
      if (this.state.departmentId && !this.getDepartmentNameById(this.state.departmentId)) {
        const r2 = await fetch(`/api/tenant/departments/${this.state.departmentId}`, { headers: this.getAuthHeaders() });
        if (r2.ok) {
          const j2 = await r2.json();
          const d = j2?.data;
          if (d) {
            const ids = new Set(this.state.transferOptions.departments.map(x => String(x.id)));
            if (!ids.has(String(d.id))) this.state.transferOptions.departments.push(d);
          }
        }
      }
      this.updatePipelineCards();
      this.renderPipeline();
    } catch (e) {}
  },
  
  async sendWebMessage(conversationId, content, options = {}) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 60000);
      const response = await fetch(`/api/tenant/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          message: content,
          media_url: options.mediaUrl || undefined,
          media_type: options.mediaType || undefined
        }),
        signal: controller.signal
      });
      clearTimeout(tid);
      const js = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = js?.message || this.t('conversation.message_failed', 'Failed to send message');
        if (typeof Modal !== 'undefined' && Modal.alert) {
          Modal.alert(this.t('common.error', 'Error'), msg, 'warning');
        }
        return false;
      }
      return js?.success === true;
    } catch (e) {
      if (e && e.name === 'AbortError') {
        if (typeof Modal !== 'undefined' && Modal.alert) {
          Modal.alert(
            this.t('common.warning', 'Warning'),
            this.t('conversation.send_delayed', 'Sending is taking longer than expected. The message may still be delivered.'),
            'warning'
          );
        }
      }
      return false;
    }
  },
  
  // ============================================
  // MEDIA PREVIEW SYSTEM
  // ============================================
  
  openMediaPreviewModal(file, mediaType) {
    console.log('openMediaPreviewModal called with:', { 
      fileName: file.name, 
      fileType: file.type, 
      fileSize: file.size, 
      mediaType 
    });
    
    // File size validation
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      const maxSizeText = this.t('media.file_too_large', 'File too large. Maximum size: {{size}}MB').replace('{{size}}', 50);
      this.showNotification(maxSizeText, 'error');
      return;
    }
    
    // Create modal container
    const modalId = 'ucMediaPreviewModal';
    let modal = document.getElementById(modalId);
    
    if (modal) {
      console.log('Removing existing modal');
      modal.remove();
    }
    
    modal = document.createElement('div');
    modal.id = modalId;
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    console.log('Creating file preview...');
    
    // Create preview content based on file type using FileReader for CSP compliance
    this.createFilePreview(file, (previewContent) => {
      console.log('Preview content created, building modal...');
      
      modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 12px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="margin: 0; color: #1f2937;" data-i18n="media.send_media">${this.t('media.send_media', 'Send Media')}</h3>
            <button id="ucMediaPreviewClose" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; padding: 4px;">&times;</button>
          </div>
          
          <div style="margin-bottom: 20px; text-align: center; padding: 20px; border: 2px dashed #ddd; border-radius: 8px; background: #f9fafb;">
            ${previewContent}
          </div>
          
          <div style="margin-bottom: 20px;">
            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #374151;" data-i18n="media.caption">${this.t('media.caption', 'Caption')}</label>
            <textarea 
              id="ucMediaCaption" 
              data-i18n-placeholder="media.caption_optional"
              placeholder="${this.t('media.caption_optional', 'Add a caption (optional)')}" 
              rows="3" 
              style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; resize: vertical; box-sizing: border-box; font-family: inherit;"
            ></textarea>
          </div>
          
          <div style="display: flex; gap: 12px;">
            <button 
              id="ucMediaCancel" 
              style="flex: 1; background: #6b7280; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 500;"
            >
              <span data-i18n="common.cancel">${this.t('common.cancel', 'Cancel')}</span>
            </button>
            <button 
              id="ucMediaSend" 
              style="flex: 2; background: #10b981; color: white; border: none; padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 500;"
            >
              <span data-i18n="media.send_media">${this.t('media.send_media', 'Send Media')}</span>
            </button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      if (typeof i18n !== 'undefined' && i18n.translatePage) {
        i18n.translatePage();
      }
      console.log('Modal added to body successfully');
      
      // Event listeners with error handling
      const closeBtn = document.getElementById('ucMediaPreviewClose');
      const cancelBtn = document.getElementById('ucMediaCancel');
      const sendBtn = document.getElementById('ucMediaSend');
      
      if (closeBtn) {
        closeBtn.onclick = () => {
          console.log('Close clicked');
          modal.remove();
        };
      }
      
      if (cancelBtn) {
        cancelBtn.onclick = () => {
          console.log('Cancel clicked');
          modal.remove();
        };
      }
      
      if (sendBtn) {
        sendBtn.onclick = async () => {
          console.log('Send clicked');
          const captionInput = document.getElementById('ucMediaCaption');
          const caption = captionInput ? captionInput.value.trim() : '';
          
          try {
            sendBtn.disabled = true;
            sendBtn.textContent = this.t('media.uploading', 'Uploading...');
            sendBtn.style.background = '#f59e0b';
            
            // Show progress feedback
            setTimeout(() => {
              if (sendBtn.textContent === this.t('media.uploading', 'Uploading...')) {
                sendBtn.textContent = this.t('media.processing', 'Processing...');
                sendBtn.style.background = '#3b82f6';
              }
            }, 3000);
            
            setTimeout(() => {
              if (sendBtn.textContent === this.t('media.processing', 'Processing...')) {
                sendBtn.textContent = this.t('media.sending', 'Sending...');
                sendBtn.style.background = '#10b981';
              }
            }, 8000);
            
            await this.uploadAndSendMedia(file, mediaType, caption);
            
            modal.remove();
          } catch (error) {
            console.error('Error sending media:', error);
            this.showNotification(this.t('media.media_failed', 'Failed to send media') + ': ' + error.message, 'error');
            sendBtn.disabled = false;
            sendBtn.textContent = this.t('media.send_media', 'Send Media');
            sendBtn.style.background = '#10b981';
          }
        };
      }
      
      // Focus on caption input
      setTimeout(() => {
        const captionInput = document.getElementById('ucMediaCaption');
        if (captionInput) {
          captionInput.focus();
        }
      }, 100);
      
      // Close modal when clicking outside
      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      };
    });
  },
  
  createFilePreview(file, callback) {
    console.log('Creating file preview for:', file.name, file.type, file.size);
    
    if (file.type.startsWith('image/')) {
      console.log('Creating image preview with FileReader');
      const reader = new FileReader();
      
      reader.onload = (e) => {
        console.log('Image FileReader loaded successfully');
        const previewContent = `<img src="${e.target.result}" style="max-width: 400px; max-height: 300px; border-radius: 8px; object-fit: contain;" alt="Image preview">`;
        callback(previewContent);
      };
      
      reader.onerror = (e) => {
        console.error('Error reading image file:', e);
        const previewContent = `
          <div style="text-align: center; color: #ef4444;">
            <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 20px;"></i><br>
            <div>Error loading image preview</div>
            <div style="font-size: 14px; margin-top: 8px;">${file.name}</div>
          </div>
        `;
        callback(previewContent);
      };
      
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('video/')) {
      console.log('Creating video preview with FileReader');
      const reader = new FileReader();
      
      reader.onload = (e) => {
        console.log('Video FileReader loaded successfully');
        const previewContent = `<video controls style="max-width: 400px; max-height: 300px; border-radius: 8px;"><source src="${e.target.result}" type="${file.type}">Your browser does not support video playback.</video>`;
        callback(previewContent);
      };
      
      reader.onerror = (e) => {
        console.error('Error reading video file:', e);
        const previewContent = `
          <div style="text-align: center; color: #ef4444;">
            <i class="fas fa-video" style="font-size: 48px; margin-bottom: 20px;"></i><br>
            <div>Error loading video preview</div>
            <div style="font-size: 14px; margin-top: 8px;">${file.name}</div>
          </div>
        `;
        callback(previewContent);
      };
      
      reader.readAsDataURL(file);
    } else if (file.type.startsWith('audio/')) {
      console.log('Creating audio preview with FileReader');
      const reader = new FileReader();
      
      reader.onload = (e) => {
        console.log('Audio FileReader loaded successfully');
        const previewContent = `
          <div style="text-align: center;">
            <i class="fas fa-music" style="font-size: 48px; color: #3b82f6; margin-bottom: 20px;"></i><br>
            <audio controls style="width: 100%; max-width: 400px;"><source src="${e.target.result}" type="${file.type}">Your browser does not support audio playback.</audio>
          </div>
        `;
        callback(previewContent);
      };
      
      reader.onerror = (e) => {
        console.error('Error reading audio file:', e);
        const previewContent = `
          <div style="text-align: center; color: #ef4444;">
            <i class="fas fa-music" style="font-size: 48px; margin-bottom: 20px;"></i><br>
            <div>Error loading audio preview</div>
            <div style="font-size: 14px; margin-top: 8px;">${file.name}</div>
          </div>
        `;
        callback(previewContent);
      };
      
      reader.readAsDataURL(file);
    } else {
      console.log('Creating document preview');
      // For documents, we don't need FileReader, just show file info
      const fileIcon = this.getFileIcon(file.name);
      const previewContent = `
        <div style="text-align: center;">
          <i class="${fileIcon}" style="font-size: 48px; color: #6b7280; margin-bottom: 20px;"></i><br>
          <div style="font-weight: bold; margin-bottom: 8px;">${file.name}</div>
          <div style="color: #666; font-size: 14px;">${this.formatFileSize(file.size)}</div>
        </div>
      `;
      callback(previewContent);
    }
  },
  
  getFileIcon(filename) {
    const extension = filename.split('.').pop()?.toLowerCase();
    const iconMap = {
      pdf: 'fas fa-file-pdf',
      doc: 'fas fa-file-word',
      docx: 'fas fa-file-word',
      xls: 'fas fa-file-excel',
      xlsx: 'fas fa-file-excel',
      ppt: 'fas fa-file-powerpoint',
      pptx: 'fas fa-file-powerpoint',
      txt: 'fas fa-file-alt',
      zip: 'fas fa-file-archive',
      rar: 'fas fa-file-archive',
      '7z': 'fas fa-file-archive'
    };
    return iconMap[extension] || 'fas fa-file';
  },
  
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  
  async uploadAndSendMedia(fileOrBlob, type, caption = '') {
    try {
      console.log('uploadAndSendMedia called with:', {
        fileName: fileOrBlob.name || 'blob',
        fileSize: fileOrBlob.size,
        fileType: fileOrBlob.type,
        mediaType: type,
        caption: caption || 'no caption'
      });
      
      const formData = new FormData();
      const isBlob = !(fileOrBlob && 'name' in fileOrBlob);
      let extension = 'bin';
      let mime = 'application/octet-stream';
      const t = (fileOrBlob.type || '').toLowerCase();
      
      if (type === 'image' || t.startsWith('image/')) { 
        extension = 'jpg'; 
        mime = t || 'image/jpeg'; 
      } else if (type === 'video' || t.startsWith('video/')) { 
        extension = 'mp4'; 
        mime = t || 'video/mp4'; 
      } else if (type === 'audio' || t.startsWith('audio/')) { 
        extension = 'ogg'; 
        mime = 'audio/ogg'; 
      } else if (type === 'document') { 
        mime = t || 'application/pdf'; 
        extension = (fileOrBlob.name || '').split('.').pop() || 'pdf'; 
      }
      
      const filename = isBlob ? `${type}_${Date.now()}.${extension}` : (fileOrBlob.name || `file_${Date.now()}.${extension}`);
      const finalBlob = isBlob ? new Blob([fileOrBlob], { type: mime }) : fileOrBlob;
      
      formData.append('media', finalBlob, filename);
      formData.append('caption', caption || '');
      
      console.log('FormData prepared:', {
        mediaFile: filename,
        mediaSize: finalBlob.size,
        mediaType: finalBlob.type,
        caption: caption || 'no caption'
      });
      
      this.showNotification(this.t('media.uploading', 'Uploading...'), 'info');
      
      const startTime = Date.now();
      if (this.state.whatsappWebActive) {
        const webFormData = new FormData();
        webFormData.append('file', finalBlob, filename);
        webFormData.append('conversationId', this.state.selectedConversationId);
        const uploadResponse = await fetch('/api/tenant/upload', {
          method: 'POST',
          headers: this.getAuthHeaders(),
          body: webFormData
        });
        const uploadResult = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok || uploadResult.success === false) {
          throw new Error(uploadResult.message || 'Upload failed');
        }
        const sent = await this.sendWebMessage(this.state.selectedConversationId, caption || '', {
          mediaUrl: uploadResult.url,
          mediaType: type
        });
        if (!sent) {
          throw new Error(this.t('media.media_failed', 'Failed to send media'));
        }
        this.showNotification(this.t('media.media_sent', 'Media sent successfully'), 'success');
        await this.loadMessages(this.state.selectedConversationId);
        this.refreshMessagesView();
      } else {
        const endpoint = `/api/user/whatsapp-cloud/conversations/${this.state.selectedConversationId}/send-media`;
        console.log('Sending media to:', endpoint);
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'ngrok-skip-browser-warning': 'true'
          },
          body: formData
        });
        
        const uploadTime = Date.now() - startTime;
        console.log('Upload completed in:', uploadTime + 'ms');
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        const result = await response.json();
        console.log('Response data:', result);
        
        if (result.success) {
          this.showNotification(`${this.t('media.media_sent', 'Media sent successfully')} (${Math.round(uploadTime / 1000)}s)`, 'success');
          await this.loadMessages(this.state.selectedConversationId);
          this.refreshMessagesView();
        } else {
          console.error('Media send failed:', result);
          this.showNotification(result.message || this.t('media.media_failed', 'Failed to send media'), 'error');
        }
      }
    } catch (error) {
      console.error('Error uploading media:', error);
      this.showNotification(this.t('media.media_failed', 'Failed to send media') + ': ' + error.message, 'error');
    }
  },
  
  async openProductModal() {
    const modalId = 'ucProductModal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'uc-modal';
      modal.innerHTML = `
        <div class="uc-modal-content">
          <div class="uc-modal-header">
            <span data-i18n="products.title">Products</span>
            <button class="uc-modal-close" id="ucProductClose">&times;</button>
          </div>
          <div class="uc-modal-body">
            <input type="text" id="ucProductSearch" data-i18n-placeholder="products.search_products" placeholder="Search products...">
            <div id="ucProductsGrid"></div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      if (typeof i18n !== 'undefined' && i18n.translatePage) {
        i18n.translatePage();
      }
    }
    modal.classList.add('show');
    document.getElementById('ucProductClose').onclick = () => modal.classList.remove('show');
    document.getElementById('ucProductSearch').oninput = () => {
      const q = document.getElementById('ucProductSearch').value.toLowerCase();
      const items = modal.querySelectorAll('.product-card');
      items.forEach(it => {
        const name = (it.getAttribute('data-name') || '').toLowerCase();
        it.style.display = name.includes(q) ? '' : 'none';
      });
    };
    const grid = document.getElementById('ucProductsGrid');
      grid.innerHTML = `<div data-i18n="products.loading_products">${this.t('products.loading_products', 'Loading products...')}</div>`;
    try {
      const response = await fetch('/api/tenant/woocommerce/products', {
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error(this.t('products.no_products', 'Failed to load products'));
      }

      const data = await response.json();
      const list = data.data || data || [];
      grid.innerHTML = list.map(p => `
        <div class="product-card" data-name="${p.name}" style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <img src="${p.images?.[0]?.src || '/images/no-image.svg'}" alt="${p.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; float: left; margin-right: 12px;">
          <div class="product-info" style="overflow: hidden;">
            <div class="product-name" style="font-weight: 600; margin-bottom: 4px;">${p.name}</div>
            <div class="product-price" style="color: #10b981; font-weight: 500;">${this.formatWooPrice(p.sale_price || p.price)}</div>
            <div class="product-stock" style="font-size: 12px; color: ${p.stock_status === 'instock' ? '#10b981' : '#ef4444'};">
              ${p.stock_status === 'instock' ? `✅ ${this.t('products.in_stock', 'In Stock')}` : `❌ ${this.t('products.out_of_stock', 'Out of Stock')}`}
            </div>
          </div>
          <button class="product-send" data-id="${p.id}" style="background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; float: right;" data-i18n="products.share_product">${this.t('products.share_product', 'Share')}</button>
          <div style="clear: both;"></div>
        </div>
      `).join('');
      
      grid.querySelectorAll('.product-send').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute('data-id');
          const product = list.find(x => String(x.id) === String(id));
          if (!product) return;
          
          try {
            btn.disabled = true;
            btn.textContent = this.t('media.sending', 'Sending...');

            if (this.state.whatsappWebActive) {
              const priceLabel = this.t('products.price', 'Price');
              const priceValue = this.formatWooPrice(product.sale_price || product.price || '');
              const link = product.permalink || product.link || product.url || '';
              const message = [product.name, priceValue ? `${priceLabel}: ${priceValue}` : null, link].filter(Boolean).join('\n');
              const sent = await this.sendWebMessage(this.state.selectedConversationId, message);
              if (!sent) {
                throw new Error(this.t('products.product_share_failed', 'Failed to share product'));
              }
            } else {
              const response = await fetch(`/api/user/whatsapp-cloud/conversations/${this.state.selectedConversationId}/send-product`, {
                method: 'POST',
                headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                  productId: product.id,
                  customMessage: ''
                })
              });
              
              const result = await response.json();
              if (!result.success) {
                throw new Error(result.message || this.t('products.product_share_failed', 'Failed to share product'));
              }
            }
              modal.classList.remove('show');
              this.showNotification(this.t('products.product_shared', 'Product shared successfully'), 'success');
              await this.loadMessages(this.state.selectedConversationId);
              this.refreshMessagesView();
          } catch (error) {
            console.error('Error sharing product:', error);
            this.showNotification(error.message || this.t('products.product_share_failed', 'Failed to share product'), 'error');
          } finally {
            btn.disabled = false;
            btn.textContent = this.t('products.share_product', 'Share');
          }
        };
      });
    } catch (e) {
      console.error('Error loading products:', e);
      grid.innerHTML = `<div data-i18n="products.no_products">${this.t('products.no_products', 'No products found')}</div>`;
    }
  },
  
  async openPaymentModal() {
    const modalId = 'ucPaymentModal';
    let modal = document.getElementById(modalId);
    const defaultCurrency = await this.loadSystemCurrency();
    const currencyOptions = this.buildPaymentCurrencyOptions(defaultCurrency);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'uc-modal';
      modal.innerHTML = `
        <div class="uc-modal-content">
          <div class="uc-modal-header">
            <span data-i18n="billing.payment_link">Payment Link</span>
            <button class="uc-modal-close" id="ucPaymentClose">&times;</button>
          </div>
          <div class="uc-modal-body" style="padding: 20px;">
            <div style="margin-bottom: 16px;">
              <label style="display: block; margin-bottom: 6px; font-weight: 500;" data-i18n="billing.payment_methods">${this.t('billing.payment_methods', 'Payment Method')}</label>
              <select id="ucPaymentMethod" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;">
                <option value="stripe">${this.t('billing.stripe', 'Stripe')}</option>
                <option value="paypal">${this.t('billing.paypal', 'PayPal')}</option>
              </select>
            </div>
            <div style="margin-bottom: 16px;">
              <label style="display: block; margin-bottom: 6px; font-weight: 500;" data-i18n="billing.amount">Amount:</label>
              <div style="display: flex; gap: 8px;">
                <select id="ucPaymentCurrency" style="width: 80px; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;">
                  ${currencyOptions}
                </select>
                <input type="number" id="ucPaymentAmount" data-i18n-placeholder="billing.amount" placeholder="0.00" step="0.01" min="0" style="flex: 1; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px;">
              </div>
            </div>
            <div style="margin-bottom: 16px;">
              <label style="display: block; margin-bottom: 6px; font-weight: 500;" data-i18n="billing.description">Description:</label>
              <textarea id="ucPaymentDesc" data-i18n-placeholder="billing.description_required" placeholder="${this.t('billing.description_required', 'Enter payment description...')}" rows="3" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; resize: vertical;"></textarea>
            </div>
            <button id="ucPaymentCreate" style="width: 100%; background: #3b82f6; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: 500; cursor: pointer;" data-i18n="billing.create_payment_link">${this.t('billing.create_payment_link', 'Create Payment Link')}</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      if (typeof i18n !== 'undefined' && i18n.translatePage) {
        i18n.translatePage();
      }
    }
    modal.classList.add('show');

    const currencySelect = document.getElementById('ucPaymentCurrency');
    if (currencySelect) {
      currencySelect.innerHTML = currencyOptions;
      currencySelect.value = defaultCurrency;
    }
    
    document.getElementById('ucPaymentClose').onclick = () => modal.classList.remove('show');
    
    document.getElementById('ucPaymentCreate').onclick = async () => {
      const paymentMethod = document.getElementById('ucPaymentMethod').value;
      const currency = document.getElementById('ucPaymentCurrency').value;
      const amount = parseFloat(document.getElementById('ucPaymentAmount').value || '0');
      const description = document.getElementById('ucPaymentDesc').value.trim();
      
      if (amount <= 0) {
        this.showNotification(this.t('billing.invalid_amount', 'Please enter a valid amount'), 'error');
        return;
      }
      
      if (!description) {
        this.showNotification(this.t('billing.description_required', 'Please enter a description'), 'error');
        return;
      }
      
      try {
        const createBtn = document.getElementById('ucPaymentCreate');
        createBtn.disabled = true;
        createBtn.textContent = this.t('billing.creating_link', 'Creating...');
        
        if (this.state.whatsappWebActive) {
          const response = await fetch('/api/tenant/payment-links', {
            method: 'POST',
            headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              title: this.t('billing.payment_link', 'Payment Link'),
              description,
              amount,
              currency
            })
          });
          const result = await response.json();
          if (!result.success) {
            throw new Error(result.message || this.t('billing.payment_link_failed', 'Failed to create payment link'));
          }
          const link = result.data?.url || result.data?.link || '';
          const message = [description, link].filter(Boolean).join('\n');
          const sent = await this.sendWebMessage(this.state.selectedConversationId, message);
          if (!sent) {
            throw new Error(this.t('billing.payment_link_failed', 'Failed to send payment link'));
          }
        } else {
          const response = await fetch(`/api/user/whatsapp-cloud/conversations/${this.state.selectedConversationId}/send-invoice`, {
            method: 'POST',
            headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              amount,
              currency,
              description,
              paymentMethod
            })
          });
          
          const result = await response.json();
          if (!result.success) {
            throw new Error(result.message || this.t('billing.payment_link_failed', 'Failed to create payment link'));
          }
        }
          modal.classList.remove('show');
          this.showNotification(this.t('billing.payment_link_sent', 'Payment link sent successfully'), 'success');
          await this.loadMessages(this.state.selectedConversationId);
          this.refreshMessagesView();
      } catch (error) {
        console.error('Error creating payment link:', error);
        this.showNotification(error.message || this.t('billing.payment_link_failed', 'Failed to create payment link'), 'error');
      } finally {
        const createBtn = document.getElementById('ucPaymentCreate');
        createBtn.disabled = false;
        createBtn.textContent = this.t('billing.create_payment_link', 'Create Payment Link');
      }
    };
  },

  // ============================================
  // NOTIFICATION SYSTEM
  // ============================================
  
  showNotification(message, type = 'info') {
    // Create notification container if it doesn't exist
    let container = document.getElementById('uc-notifications');
    if (!container) {
      container = document.createElement('div');
      container.id = 'uc-notifications';
      document.body.appendChild(container);
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = type;
    notification.textContent = message;

    container.appendChild(notification);

    // Animate in
    setTimeout(() => {
      notification.style.transform = 'translateX(0)';
    }, 10);

    // Auto remove after 4 seconds
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);
  },

  // ============================================
  // ADVANCED EMOJI PICKER
  // ============================================

  initAdvancedEmojiPicker() {
    const menu = document.getElementById('conversationEmojiMenu');
    if (!menu) return;

    // Replace the simple emoji menu with advanced picker
    menu.innerHTML = this.renderAdvancedEmojiPicker();
    
    // Attach event listeners for the advanced picker
    this.attachEmojiPickerListeners();
  },

  renderAdvancedEmojiPicker() {
    const categories = this.getEmojiCategories();
    
    return `
      <div class="emoji-picker-container" style="width: 320px; max-height: 400px; display: flex; flex-direction: column;">
        <!-- Search Bar -->
        <div class="emoji-search-container" style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          <div style="position: relative;">
            <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 14px;"></i>
            <input 
              type="text" 
              id="emojiSearchInput" 
              placeholder="${this.t('emoji.search_placeholder', 'Search emojis...')}"
              style="width: 100%; padding: 8px 12px 8px 36px; border: 1px solid #e5e7eb; border-radius: 20px; font-size: 14px; outline: none;"
            />
          </div>
        </div>

        <!-- Category Tabs -->
        <div class="emoji-categories" style="display: flex; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; gap: 4px; overflow-x: auto;">
          ${categories.map((cat, index) => `
            <button 
              class="emoji-category-tab ${index === 0 ? 'active' : ''}" 
              data-category="${cat.key}"
              style="padding: 8px 12px; border: none; background: ${index === 0 ? '#25d366' : 'transparent'}; color: ${index === 0 ? 'white' : '#6b7280'}; border-radius: 16px; font-size: 16px; cursor: pointer; transition: all 0.2s; white-space: nowrap;"
              title="${cat.name}"
            >
              ${cat.icon}
            </button>
          `).join('')}
        </div>

        <!-- Emoji Grid -->
        <div class="emoji-grid-container" style="flex: 1; overflow-y: auto; padding: 12px;">
          <div id="emojiGrid" class="emoji-grid" style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px;">
            ${this.renderEmojiCategory(categories[0])}
          </div>
        </div>

        <!-- Recently Used (if any) -->
        <div id="recentEmojis" class="recent-emojis" style="display: none; padding: 8px 12px; border-top: 1px solid #e5e7eb;">
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px; font-weight: 600;">${this.t('emoji.recently_used', 'Recently Used')}</div>
          <div class="recent-emoji-grid" style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px;">
            <!-- Recent emojis will be populated here -->
          </div>
        </div>
      </div>
    `;
  },

  getEmojiCategories() {
    return [
      {
        key: 'smileys',
        name: this.t('emoji.smileys', 'Smileys & People'),
        icon: '😀',
        emojis: [
          '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩',
          '😘', '😗', '☺️', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
          '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😔', '😪', '🤤', '😴', '😷', '🤒',
          '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕',
          '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱',
          '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩',
          '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'
        ]
      },
      {
        key: 'people',
        name: this.t('emoji.people', 'People & Body'),
        icon: '👋',
        emojis: [
          '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆',
          '🖕', '👇', '☝️', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️',
          '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀',
          '👁️', '👅', '👄', '💋', '🩸', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👴',
          '👵', '🙍', '🙎', '🙅', '🙆', '💁', '🙋', '🧏', '🙇', '🤦', '🤷', '👮', '🕵️', '💂', '🥷', '👷',
          '🤴', '👸', '👳', '👲', '🧕', '🤵', '👰', '🤰', '🤱', '👼', '🎅', '🤶', '🦸', '🦹', '🧙', '🧚',
          '🧛', '🧜', '🧝', '🧞', '🧟', '💆', '💇', '🚶', '🧍', '🧎', '🏃', '💃', '🕺', '🕴️', '👯', '🧖',
          '🧗', '🤺', '🏇', '⛷️', '🏂', '🏌️', '🏄', '🚣', '🏊', '⛹️', '🏋️', '🚴', '🚵', '🤸', '🤼', '🤽'
        ]
      },
      {
        key: 'animals',
        name: this.t('emoji.animals', 'Animals & Nature'),
        icon: '🐶',
        emojis: [
          '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵',
          '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗',
          '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🕸️', '🦂', '🐢', '🐍', '🦎',
          '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅',
          '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖',
          '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🐓', '🦃', '🦚', '🦜', '🦢',
          '🦩', '🕊️', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔', '🌲', '🌳', '🌴', '🌵'
        ]
      },
      {
        key: 'food',
        name: this.t('emoji.food', 'Food & Drink'),
        icon: '🍎',
        emojis: [
          '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝',
          '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐',
          '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭',
          '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🥫', '🍝', '🍜',
          '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧',
          '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯',
          '🥛', '🍼', '☕', '🫖', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹'
        ]
      },
      {
        key: 'activities',
        name: this.t('emoji.activities', 'Activities'),
        icon: '⚽',
        emojis: [
          '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍',
          '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸️', '🥌', '🎿',
          '⛷️', '🏂', '🪂', '🏋️‍♀️', '🏋️', '🏋️‍♂️', '🤼‍♀️', '🤼', '🤼‍♂️', '🤸‍♀️', '🤸', '🤸‍♂️', '⛹️‍♀️', '⛹️', '⛹️‍♂️', '🤺',
          '🤾‍♀️', '🤾', '🤾‍♂️', '🏌️‍♀️', '🏌️', '🏌️‍♂️', '🏇', '🧘‍♀️', '🧘', '🧘‍♂️', '🏄‍♀️', '🏄', '🏄‍♂️', '🏊‍♀️', '🏊', '🏊‍♂️',
          '🤽‍♀️', '🤽', '🤽‍♂️', '🚣‍♀️', '🚣', '🚣‍♂️', '🧗‍♀️', '🧗', '🧗‍♂️', '🚵‍♀️', '🚵', '🚵‍♂️', '🚴‍♀️', '🚴', '🚴‍♂️', '🏆',
          '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️', '🎪', '🤹', '🤹‍♀️', '🤹‍♂️', '🎭', '🩰', '🎨',
          '🎬', '🎤', '🎧', '🎼', '🎵', '🎶', '🥁', '🪘', '🎹', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🎲'
        ]
      },
      {
        key: 'travel',
        name: this.t('emoji.travel', 'Travel & Places'),
        icon: '🚗',
        emojis: [
          '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵',
          '🚲', '🛴', '🛹', '🛼', '🚁', '🛸', '✈️', '🛩️', '🛫', '🛬', '🪂', '💺', '🚀', '🛰️', '🚊', '🚝',
          '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚉', '🚞', '🚋', '🚃', '🚟', '🚠', '🚡', '⛴️', '🛥️', '🚤',
          '⛵', '🛶', '🚢', '⚓', '⛽', '🚧', '🚨', '🚥', '🚦', '🛑', '🚏', '🗺️', '🗿', '🗽', '🗼', '🏰',
          '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺',
          '🛖', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫',
          '🏩', '💒', '🏛️', '⛪', '🕌', '🛕', '🕍', '🕋', '⛩️', '🛤️', '🛣️', '🗾', '🎑', '🏞️', '🌅', '🌄'
        ]
      },
      {
        key: 'objects',
        name: this.t('emoji.objects', 'Objects'),
        icon: '💎',
        emojis: [
          '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼',
          '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭',
          '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸',
          '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🔧', '🔨', '⚒️', '🛠️', '⛏️',
          '🪓', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️',
          '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊',
          '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🪠', '🧽', '🧴', '🛎️', '🔑', '🗝️', '🚪', '🪑'
        ]
      },
      {
        key: 'symbols',
        name: this.t('emoji.symbols', 'Symbols'),
        icon: '❤️',
        emojis: [
          '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖',
          '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈',
          '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳',
          '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️',
          '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯',
          '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸',
          '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧'
        ]
      },
      {
        key: 'flags',
        name: this.t('emoji.flags', 'Flags'),
        icon: '🏁',
        emojis: [
          '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇦🇫', '🇦🇽', '🇦🇱', '🇩🇿', '🇦🇸', '🇦🇩', '🇦🇴', '🇦🇮',
          '🇦🇶', '🇦🇬', '🇦🇷', '🇦🇲', '🇦🇼', '🇦🇺', '🇦🇹', '🇦🇿', '🇧🇸', '🇧🇭', '🇧🇩', '🇧🇧', '🇧🇾', '🇧🇪', '🇧🇿', '🇧🇯',
          '🇧🇲', '🇧🇹', '🇧🇴', '🇧🇦', '🇧🇼', '🇧🇷', '🇮🇴', '🇻🇬', '🇧🇳', '🇧🇬', '🇧🇫', '🇧🇮', '🇰🇭', '🇨🇲', '🇨🇦', '🇮🇨',
          '🇨🇻', '🇧🇶', '🇰🇾', '🇨🇫', '🇹🇩', '🇨🇱', '🇨🇳', '🇨🇽', '🇨🇨', '🇨🇴', '🇰🇲', '🇨🇬', '🇨🇩', '🇨🇰', '🇨🇷', '🇨🇮',
          '🇭🇷', '🇨🇺', '🇨🇼', '🇨🇾', '🇨🇿', '🇩🇰', '🇩🇯', '🇩🇲', '🇩🇴', '🇪🇨', '🇪🇬', '🇸🇻', '🇬🇶', '🇪🇷', '🇪🇪', '🇪🇹'
        ]
      }
    ];
  },

  renderEmojiCategory(category) {
    return category.emojis.map(emoji => `
      <button 
        class="emoji-item" 
        data-emoji="${emoji}"
        style="font-size: 20px; padding: 8px; border: none; background: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; aspect-ratio: 1;"
        onmouseover="this.style.background='#f3f4f6'"
        onmouseout="this.style.background='none'"
      >
        ${emoji}
      </button>
    `).join('');
  },

  attachEmojiPickerListeners() {
    const menu = document.getElementById('conversationEmojiMenu');
    if (!menu) return;

    // Search functionality
    const searchInput = menu.querySelector('#emojiSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleEmojiSearch(e.target.value);
      });
    }

    // Category tabs
    menu.querySelectorAll('.emoji-category-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const category = e.target.getAttribute('data-category');
        this.switchEmojiCategory(category);
      });
    });

    // Emoji selection
    menu.addEventListener('click', (e) => {
      const emojiBtn = e.target.closest('.emoji-item');
      if (!emojiBtn) return;

      const emoji = emojiBtn.getAttribute('data-emoji') || emojiBtn.textContent.trim();
      this.insertEmoji(emoji);
    });

    // Load recent emojis
    this.loadRecentEmojis();
  },

  handleEmojiSearch(query) {
    const grid = document.getElementById('emojiGrid');
    if (!grid) return;

    if (!query.trim()) {
      // Show first category when search is empty
      const categories = this.getEmojiCategories();
      grid.innerHTML = this.renderEmojiCategory(categories[0]);
      return;
    }

    // Search through all emojis
    const allEmojis = this.getAllEmojis();
    const searchResults = allEmojis.filter(emoji => {
      // You could implement more sophisticated search here
      // For now, we'll just show all emojis when searching
      return true;
    });

    grid.innerHTML = searchResults.slice(0, 64).map(emoji => `
      <button 
        class="emoji-item" 
        data-emoji="${emoji}"
        style="font-size: 20px; padding: 8px; border: none; background: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; aspect-ratio: 1;"
        onmouseover="this.style.background='#f3f4f6'"
        onmouseout="this.style.background='none'"
      >
        ${emoji}
      </button>
    `).join('');
  },

  switchEmojiCategory(categoryKey) {
    const categories = this.getEmojiCategories();
    const category = categories.find(cat => cat.key === categoryKey);
    if (!category) return;

    // Update active tab
    document.querySelectorAll('.emoji-category-tab').forEach(tab => {
      const isActive = tab.getAttribute('data-category') === categoryKey;
      tab.style.background = isActive ? '#25d366' : 'transparent';
      tab.style.color = isActive ? 'white' : '#6b7280';
      if (isActive) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Update emoji grid
    const grid = document.getElementById('emojiGrid');
    if (grid) {
      grid.innerHTML = this.renderEmojiCategory(category);
    }

    // Clear search
    const searchInput = document.getElementById('emojiSearchInput');
    if (searchInput) {
      searchInput.value = '';
    }
  },

  getAllEmojis() {
    const categories = this.getEmojiCategories();
    return categories.reduce((all, category) => [...all, ...category.emojis], []);
  },

  insertEmoji(emoji) {
    const input = document.getElementById('conversationInputField');
    if (!input) return;

    // Insert emoji at cursor position
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    
    input.value = text.substring(0, start) + emoji + text.substring(end);
    
    // Move cursor after emoji
    const newPosition = start + emoji.length;
    input.setSelectionRange(newPosition, newPosition);
    input.focus();

    // Save to recent emojis
    this.saveRecentEmoji(emoji);

    // Close emoji menu
    const menu = document.getElementById('conversationEmojiMenu');
    if (menu) {
      menu.classList.add('hidden');
    }
  },

  saveRecentEmoji(emoji) {
    let recent = JSON.parse(localStorage.getItem('recentEmojis') || '[]');
    
    // Remove if already exists
    recent = recent.filter(e => e !== emoji);
    
    // Add to beginning
    recent.unshift(emoji);
    
    // Keep only last 16
    recent = recent.slice(0, 16);
    
    localStorage.setItem('recentEmojis', JSON.stringify(recent));
    
    // Update UI
    this.loadRecentEmojis();
  },

  loadRecentEmojis() {
    const recent = JSON.parse(localStorage.getItem('recentEmojis') || '[]');
    const container = document.getElementById('recentEmojis');
    
    if (!container || recent.length === 0) {
      if (container) container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    const grid = container.querySelector('.recent-emoji-grid');
    if (grid) {
      grid.innerHTML = recent.map(emoji => `
        <button 
          class="emoji-item" 
          data-emoji="${emoji}"
          style="font-size: 20px; padding: 8px; border: none; background: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; aspect-ratio: 1;"
          onmouseover="this.style.background='#f3f4f6'"
          onmouseout="this.style.background='none'"
        >
          ${emoji}
        </button>
      `).join('');
    }
  }
};

// ============================================
// GLOBAL HELPERS
// ============================================
UserConversations.getAuthHeaders = function(extra = {}) {
  const token = localStorage.getItem('token');
  
  // Check if token exists
  if (!token) {
    console.warn('🔐 No token found');
    return {};
  }
  
  // Basic token format validation
  if (!token.includes('.') || token.split('.').length !== 3) {
    console.warn('🔐 Invalid token format, clearing and redirecting');
    localStorage.removeItem('token');
    window.location.href = '/login';
    return {};
  }
  
  console.log('🔑 Token check:', {
    hasToken: !!token,
    tokenLength: token ? token.length : 0,
    tokenStart: token ? token.substring(0, 20) + '...' : 'null'
  });
  
  const base = {
    'Authorization': `Bearer ${token}`,
    'ngrok-skip-browser-warning': 'true'
  };
  return { ...base, ...extra };
};

UserConversations.ensureConversationVisibility = async function(conversationId) {
  try {
    const conv = this.state.conversations.find(c => String(c.id) === String(conversationId));
    const hasStore = !!(conv?.store_id || conv?.storeId);
    const hasDept = !!(conv?.department_id || conv?.departmentId);
    if (hasStore || hasDept) return;
    const payload = {
      newStoreId: this.state.storeId || null,
      newDepartmentId: this.state.departmentId || null,
      reason: 'auto-assign visibility on first open'
    };
    if (!payload.newStoreId && !payload.newDepartmentId) return;
    const res = await fetch(`/api/user/whatsapp-cloud/conversations/${conversationId}/transfer`, {
      method: 'PUT',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      this.loadConversations();
    }
  } catch (e) {
  }
};

// ============================================
// INITIALIZATION
// ============================================

window.UserConversations = UserConversations;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  if (typeof UserConversations !== 'undefined') {
    UserConversations.init();
  }
});

// Also initialize if DOM is already loaded
if (document.readyState === 'loading') {
  // DOM is still loading, wait for DOMContentLoaded
} else {
  // DOM is already loaded
  if (typeof UserConversations !== 'undefined') {
    UserConversations.init();
  }
}
