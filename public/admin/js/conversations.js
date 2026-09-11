/**
 * Conversations Page JavaScript
 * Modern WhatsApp-style conversation management for Tenant Admin
 * 
 * Features:
 * - View-only mode for tenant admin (cannot send messages)
 * - See sender info (user name + store/department or bot persona)
 * - Real-time updates via Socket.IO
 * - Full i18n support
 * - RTL compatible
 * 
 * @module public/admin/js/conversations
 */

let currentConversationId = null;
let currentConversation = null;
let conversations = [];
let refreshInterval = null;
let conversationSocket = null;
let directories = { stores: [], departments: [] };
let pipelineStages = [];

/**
 * Get tenant ID from JWT token
 */
function getConversationTenantId() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.tenantId;
  } catch (e) {
    console.error('Error parsing token:', e);
    return null;
  }
}

/**
 * Initialize Socket.IO for conversations page
 */
function initConversationSocket() {
  // Use global socket if available (from whatsapp.js)
  if (typeof socket !== 'undefined' && socket && socket.connected) {
    conversationSocket = socket;
    console.log('Using existing global socket');
    return;
  }
  
  const tenantId = getConversationTenantId();
  if (!tenantId) {
    console.error('No tenant ID found for socket connection');
    return;
  }
  
  console.log(`Initializing conversation socket for tenant ${tenantId}`);
  
  conversationSocket = io(`/tenant/${tenantId}`, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 5
  });
  
  conversationSocket.on('connect', () => {
    console.log('Conversation socket connected');
  });
  
  conversationSocket.on('disconnect', (reason) => {
    console.log('Conversation socket disconnected:', reason);
  });
  
  conversationSocket.on('reconnect', () => {
    console.log('Conversation socket reconnected');
    loadConversations();
    if (currentConversationId) {
      loadConversationMessages(currentConversationId);
    }
  });
}

/**
 * Initialize conversations page
 */
async function initConversationsPage() {
  console.log('Initializing conversations page (tenant)');
  // Prefer adapter to mount identical UI with admin constraints
  if (typeof window.initTenantConversationsUI === 'function') {
    window.initTenantConversationsUI();
    return;
  }
  // Fallback to legacy tenant conversations if Cloud UI not available
  if (typeof WhatsAppCloud !== 'undefined' && WhatsAppCloud.mountConversationsPage) {
    WhatsAppCloud.mountConversationsPage();
    return;
  }
  try {
    initConversationSocket();
    await Promise.all([loadStats(), loadDirectories(), loadConversations(), loadPipelineStages()]);
    renderPipelineBoard();
    setupConversationEventListeners();
    setupConversationSocketListeners();
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
      loadConversations();
      if (currentConversationId) loadConversationMessages(currentConversationId);
    }, 30000);
    console.log('Conversations page initialized successfully');
  } catch (error) {
    console.error('Error initializing conversations page:', error);
    showNotification('error', i18n.t('conversations.error_loading'));
  }
}

/**
 * Setup event listeners
 */
function setupConversationEventListeners() {
  // Search input
  const searchInput = document.getElementById('convSearchInput');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        loadConversations();
      }, 400);
    });
  }

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      loadConversations();
    });
  });
  
  const attendantInput = document.getElementById('attendantFilterInput');
  if (attendantInput) {
    let attendantTimeout;
    attendantInput.addEventListener('input', () => {
      clearTimeout(attendantTimeout);
      attendantTimeout = setTimeout(() => loadConversations(), 300);
    });
  }
}

/**
 * Setup Socket.IO listeners for real-time updates
 */
function setupConversationSocketListeners() {
  const sock = conversationSocket || (typeof socket !== 'undefined' ? socket : null);
  
  if (!sock) {
    console.warn('No socket available for conversation listeners');
    return;
  }
  
  sock.on('new-message', (data) => {
    console.log('New message received:', data);
    if (String(data.conversationId) === String(currentConversationId)) {
      loadConversationMessages(currentConversationId);
    }
    loadConversations();
    loadStats();
  });

  sock.on('message-sent', (data) => {
    console.log('Message sent:', data);
    if (String(data.conversationId) === String(currentConversationId)) {
      loadConversationMessages(currentConversationId);
    }
    loadConversations();
  });

  sock.on('conversation-claimed', (data) => {
    console.log('Conversation claimed:', data);
    loadConversations();
    if (String(data.conversationId) === String(currentConversationId)) {
      loadConversationMessages(currentConversationId);
    }
  });

  sock.on('conversation-released', (data) => {
    console.log('Conversation released:', data);
    loadConversations();
  });

  sock.on('conversation-transferred', (data) => {
    console.log('Conversation transferred:', data);
    loadConversations();
  });
  
  // New alert events for admin
  sock.on('conversation-attended-alert', (data) => {
    console.log('🔔 Conversation attended alert (admin view):', data);
    showNotification('info', data.message);
    loadConversations(); // Refresh to update visibility
  });
  
  sock.on('new-message-alert', (data) => {
    console.log('🔔 New message alert (admin view):', data);
    showNotification('info', `${data.message}`);
    loadConversations(); // Refresh conversations list
  });
  
  sock.on('message-edited', (data) => {
    console.log('Message edited:', data);
    if (String(data.conversationId) === String(currentConversationId)) {
      loadConversationMessages(currentConversationId);
    }
  });
  
  sock.on('message-deleted', (data) => {
    console.log('Message deleted:', data);
    if (String(data.conversationId) === String(currentConversationId)) {
      loadConversationMessages(currentConversationId);
    }
  });
}

/**
 * Load conversation statistics
 */
async function loadStats() {
  try {
    const response = await api.getConversationStats();
    
    if (response.success) {
      const { conversations: convStats } = response.data;
      
      const total = convStats.total || 0;
      const waiting = convStats.waiting || 0;
      const active = (convStats.active || 0) + (convStats.attended || 0);
      const closed = convStats.closed || 0;
      
      updateElement('stat-total', total);
      updateElement('stat-waiting', waiting);
      updateElement('stat-active', active);
      updateElement('stat-closed', closed);
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

/**
 * Helper to update element text
 */
function updateElement(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/**
 * Load conversations list
 */
async function loadConversations() {
  try {
    const search = document.getElementById('convSearchInput')?.value || '';
    const activeTab = document.querySelector('.filter-tab.active');
    const status = activeTab?.dataset.status || '';
    const attendantQuery = (document.getElementById('attendantFilterInput')?.value || '').toLowerCase();

    const params = { limit: 50, offset: 0 };
    if (search) params.search = search;
    if (status) params.status = status;

    const response = await api.getConversations(params);
    
    if (response.success) {
      conversations = (response.data || []).map(resolveAttendantInfo);
      if (status === 'unassigned') {
        conversations = conversations.filter(c => !c.claimed_by_user_id);
      }
      if (attendantQuery) {
        conversations = conversations.filter(c => (c.claimed_by_name || '').toLowerCase().includes(attendantQuery));
      }
      renderConversations();
      renderPipelineBoard();
      
      // Update count
      const countEl = document.getElementById('conversationsCount');
      if (countEl) countEl.textContent = conversations.length;
    }
  } catch (error) {
    console.error('Error loading conversations:', error);
    showNotification('error', i18n.t('conversations.error_loading'));
  }
}

/**
 * Render conversations list (WhatsApp style)
 */
function renderConversations() {
  const container = document.getElementById('conversationsList');
  if (!container) return;

  if (conversations.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-comments"></i>
        <h3 data-i18n="conversations.no_conversations">${i18n.t('conversations.no_conversations')}</h3>
        <p data-i18n="conversations.no_conversations_desc">${i18n.t('conversations.no_conversations_desc') || 'New conversations will appear here'}</p>
      </div>
    `;
    if (window.i18n) i18n.translatePage();
    return;
  }

  container.innerHTML = conversations.map(conv => {
    const isActive = conv.id === currentConversationId;
    const isClaimed = conv.is_claimed && conv.claimed_by_user_id;
    const isTransferred = conv.transferred_to_store || conv.transferred_to_department;
    const unreadCount = conv.unread_count || 0;
    const initial = getInitial(conv.contact_name || conv.phone_number);
    
    // Build badges
    let badges = '';
    if (isClaimed && conv.claimed_by_name) {
      const claimedInfo = conv.claimed_by_store || conv.claimed_by_department || '';
      badges += `<span class="claimed-badge">👤 ${escapeHtml(conv.claimed_by_name)}${claimedInfo ? ' - ' + escapeHtml(claimedInfo) : ''}</span>`;
    }
    if (isTransferred) {
      const transferTarget = conv.transferred_to_store || conv.transferred_to_department;
      badges += `<span class="transferred-badge">↗ ${escapeHtml(transferTarget)}</span>`;
    }

    // Item classes
    let itemClasses = 'conversation-item';
    if (isActive) itemClasses += ' active';
    if (isClaimed) itemClasses += ' claimed';
    if (isTransferred) itemClasses += ' transferred';

    return `
      <div class="${itemClasses}" onclick="selectConversation(${conv.id})">
        <div class="conversation-avatar">
          ${initial}
          <span class="status-indicator ${conv.status || 'waiting'}"></span>
        </div>
        <div class="conversation-content">
          <div class="conversation-header">
            <span class="conversation-name">${escapeHtml(conv.contact_name || conv.phone_number)}</span>
            <span class="conversation-time">${formatRelativeTime(conv.last_message_time)}</span>
          </div>
          <div class="conversation-preview">
            <span class="conversation-preview-text">${escapeHtml(conv.last_message || i18n.t('conversations.no_messages'))}</span>
            <div class="conversation-meta">
              ${badges}
              ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.i18n) i18n.translatePage();
}

/**
 * Select conversation and load messages
 */
async function selectConversation(conversationId) {
  currentConversationId = conversationId;
  renderConversations();
  
  // Show messages panel on mobile
  const messagesPanel = document.getElementById('messagesPanel');
  if (messagesPanel) {
    messagesPanel.classList.add('active');
  }
  
  await loadConversationMessages(conversationId);
}

/**
 * Load conversation messages
 */
async function loadConversationMessages(conversationId) {
  try {
    const response = await api.getConversation(conversationId);
    
    if (response.success) {
      const { conversation, messages } = response.data;
      currentConversation = conversation;
      renderMessagesHeader(conversation);
      renderMessages(messages);
    }
  } catch (error) {
    console.error('Error loading messages:', error);
    showNotification('error', i18n.t('conversations.error_loading_messages'));
  }
}

/**
 * Render messages header
 */
function renderMessagesHeader(conversation) {
  const header = document.getElementById('messagesHeader');
  if (!header) return;

  const initial = getInitial(conversation.contact_name || conversation.phone_number);
  const isClaimed = conversation.is_claimed && conversation.claimed_by_user_id;
  const isTransferred = conversation.transferred_to_store || conversation.transferred_to_department;

  // Build status text
  let statusText = i18n.t('chat.unclaimed') || 'Unclaimed';
  if (isClaimed && conversation.claimed_by_name) {
    statusText = `${i18n.t('chat.claimed_by') || 'Claimed by'} ${conversation.claimed_by_name}`;
    if (conversation.claimed_by_store) statusText += ` - ${conversation.claimed_by_store}`;
    if (conversation.claimed_by_department) statusText += ` - ${conversation.claimed_by_department}`;
  }
  if (isTransferred) {
    const target = conversation.transferred_to_store || conversation.transferred_to_department;
    statusText = `${i18n.t('chat.transferred_to') || 'Transferred to'} ${target}`;
  }

  header.innerHTML = `
    <button class="back-btn" onclick="closeMessagesPanel()">
      <i class="fas fa-arrow-left"></i>
    </button>
    <div class="messages-header-avatar">${initial}</div>
    <div class="messages-header-info">
      <div class="messages-header-name">${escapeHtml(conversation.contact_name || conversation.phone_number)}</div>
      <div class="messages-header-status">
        <span class="status-badge ${isClaimed ? 'attended' : (conversation.status || 'waiting')}">${isClaimed ? (i18n.t('conversations.status_attended') || 'ATTENDED') : (conversation.status?.toUpperCase() || 'WAITING')}</span>
        <span>${escapeHtml(statusText)}</span>
      </div>
      ${isClaimed ? `
        <div class="messages-header-agent">
          <i class="fas fa-user-tie"></i>
          <span>${escapeHtml(conversation.claimed_by_name)}${conversation.claimed_by_store ? ' - ' + escapeHtml(conversation.claimed_by_store) : ''}${conversation.claimed_by_department ? ' / ' + escapeHtml(conversation.claimed_by_department) : ''}</span>
        </div>
      ` : ''}
    </div>
  `;

  if (window.i18n) i18n.translatePage();
}

/**
 * Render messages (WhatsApp style)
 */
function renderMessages(messages) {
  const container = document.getElementById('messagesContent');
  if (!container) return;

  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-comment-dots"></i>
        <h3 data-i18n="conversations.no_messages">${i18n.t('conversations.no_messages')}</h3>
      </div>
    `;
    return;
  }

  let lastDate = null;
  let html = '';

  messages.forEach(msg => {
    // Date divider
    const msgDate = new Date(msg.created_at || msg.timestamp).toLocaleDateString();
    if (msgDate !== lastDate) {
      html += `<div class="message-date-divider"><span>${msgDate}</span></div>`;
      lastDate = msgDate;
    }

    const isOutgoing = msg.direction === 'outgoing' || msg.is_from_me;
    const isBot = msg.is_bot_message || msg.is_from_bot;
    const direction = isOutgoing ? 'outgoing' : 'incoming';
    const bubbleClass = isBot ? 'bot outgoing' : direction;
    
    // Sender label for outgoing messages
    let senderLabel = '';
    if (isOutgoing) {
      if (isBot) {
        senderLabel = `🤖 ${msg.bot_persona_name || i18n.t('chat.bot_response') || 'Bot'}`;
      } else if (msg.sender_name) {
        const location = msg.sender_store || msg.sender_department || '';
        senderLabel = `${msg.sender_name}${location ? ' - ' + location : ''}`;
      }
    }

    // Message status icon for outgoing
    let statusIcon = '';
    if (isOutgoing && !isBot) {
      if (msg.status === 'read') {
        statusIcon = '<i class="fas fa-check-double message-status" style="color: #53bdeb;"></i>';
      } else if (msg.status === 'delivered') {
        statusIcon = '<i class="fas fa-check-double"></i>';
      } else if (msg.status === 'sent') {
        statusIcon = '<i class="fas fa-check"></i>';
      }
    }

    // Get message text
    const messageText = msg.message_text || msg.body || msg.content || '';

    html += `
      <div class="message-bubble ${bubbleClass}">
        ${senderLabel ? `<div class="message-sender-label">${escapeHtml(senderLabel)}</div>` : ''}
        <div class="message-content">
          <div class="message-text">${formatMessageText(messageText)}</div>
          <div class="message-footer">
            <span class="message-time">${formatMessageTime(msg.created_at || msg.timestamp)}</span>
            ${statusIcon}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

/**
 * Close messages panel (mobile)
 */
function closeMessagesPanel() {
  const messagesPanel = document.getElementById('messagesPanel');
  if (messagesPanel) {
    messagesPanel.classList.remove('active');
  }
  currentConversationId = null;
  currentConversation = null;
}

/**
 * Refresh conversations
 */
async function refreshConversations() {
  const refreshBtn = document.querySelector('.sidebar-header .icon-btn i');
  if (refreshBtn) {
    refreshBtn.classList.add('fa-spin');
  }
  
  await Promise.all([loadStats(), loadConversations()]);
  
  if (currentConversationId) {
    await loadConversationMessages(currentConversationId);
  }
  renderPipelineBoard();
  
  if (refreshBtn) {
    setTimeout(() => refreshBtn.classList.remove('fa-spin'), 500);
  }
  
  showNotification('success', i18n.t('conversations.refreshed') || 'Conversations refreshed');
}

/* ============================================
   UTILITY FUNCTIONS
   ============================================ */

/**
 * Get initial from name or phone
 */
function getInitial(text) {
  if (!text) return '?';
  return text.charAt(0).toUpperCase();
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return i18n.t('conversations.just_now') || 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  
  return date.toLocaleDateString();
}

/**
 * Format message time
 */
function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format message text (handle bold markers and line breaks)
 */
function formatMessageText(text) {
  if (!text) return '';
  // Escape HTML first
  let formatted = escapeHtml(text);
  // Convert *text* to bold
  formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
  // Convert line breaks
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Load pipeline stages
 */
async function loadPipelineStages() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/admin/pipeline-stages', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data?.success && Array.isArray(data.data)) {
      pipelineStages = data.data.map(stage => ({
        id: stage.stage_key,
        name: stage.stage_name,
        icon: stage.icon || 'fas fa-circle',
        color: stage.color || '#6b7280'
      }));
    }
  } catch (e) {
    pipelineStages = [
      { id: 'unassigned', name: 'Unassigned', icon: 'fas fa-inbox', color: '#6b7280' },
      { id: 'new', name: 'New', icon: 'fas fa-star', color: '#3b82f6' },
      { id: 'negotiation', name: 'Negotiation', icon: 'fas fa-handshake', color: '#f59e0b' },
      { id: 'won', name: 'Won', icon: 'fas fa-trophy', color: '#10b981' },
      { id: 'lost', name: 'Lost', icon: 'fas fa-times-circle', color: '#ef4444' }
    ];
  }
}

/**
 * Render pipeline board (similar to WhatsApp Cloud)
 */
function renderPipelineBoard() {
  const board = document.getElementById('convPipelineBoard');
  if (!board) return;
  const byStage = {};
  pipelineStages.forEach(s => { byStage[s.id] = []; });
  (conversations || []).forEach(conv => {
    const stage = conv.stage_id || conv.pipeline_stage || 'unassigned';
    if (!byStage[stage]) byStage[stage] = [];
    byStage[stage].push(conv);
  });
  board.innerHTML = pipelineStages.map(stage => `
    <div class="wc-pipeline-column" draggable="false" data-stage-id="${stage.id}">
      <div class="wc-pipeline-column-header">
        <div class="wc-pipeline-column-title">
          <span class="wc-pipeline-column-icon" style="color: ${stage.color}">
            <i class="${stage.icon}"></i>
          </span>
          <span class="wc-pipeline-column-name">${stage.name}</span>
          <span class="wc-pipeline-column-count">${(byStage[stage.id] || []).length}</span>
        </div>
      </div>
      <div class="wc-pipeline-column-body" data-stage-id="${stage.id}">
        ${(byStage[stage.id] || []).map(renderPipelineCard).join('')}
      </div>
    </div>
  `).join('');
}

function renderPipelineCard(conv) {
  const name = conv.contact_name || conv.phone_number || 'Unknown';
  const time = formatRelativeTime(conv.last_message_time);
  const preview = conv.last_message || '';
  return `
    <div class="wc-pipeline-card" draggable="false" data-card-id="${conv.id}" onclick="selectConversation(${conv.id})">
      <div class="wc-pipeline-card-top">
        ${conv.claimed_by_name ? `<span class="wc-pipeline-card-attendant">Atendido por ${escapeHtml(conv.claimed_by_name)}</span>` : `<span class="wc-pipeline-card-attendant">Não atribuído</span>`}
      </div>
      <div class="wc-pipeline-card-header">
        <div class="wc-pipeline-card-avatar">
          <span>${getInitial(name)}</span>
        </div>
        <div class="wc-pipeline-card-info">
          <span class="wc-pipeline-card-name">${escapeHtml(name)}</span>
          <span class="wc-pipeline-card-phone">${escapeHtml(conv.phone_number || '')}</span>
        </div>
      </div>
      <div class="wc-pipeline-card-message">
        ${escapeHtml(preview)}
      </div>
      <div class="wc-pipeline-card-footer">
        <span class="wc-pipeline-card-time">
          <i class="far fa-clock"></i>
          ${time}
        </span>
      </div>
    </div>
  `;
}

/**
 * Show notification
 */
function showNotification(type, message) {
  if (typeof Notification !== 'undefined' && Notification[type]) {
    Notification[type](message);
  } else if (typeof showToast === 'function') {
    showToast(message, type);
  } else {
    console.log(`[${type}] ${message}`);
  }
}

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});

// Initialize when page is shown
document.addEventListener('pageShown', (e) => {
  if (e.detail === 'conversations') {
    if (typeof WhatsAppCloud !== 'undefined' && WhatsAppCloud.mountConversationsPage) {
      WhatsAppCloud.mountConversationsPage();
    } else {
      initConversationsPage();
    }
  }
});

// Also initialize if already on conversations page
if (document.getElementById('conversations-page')?.classList.contains('active')) {
  if (typeof WhatsAppCloud !== 'undefined' && WhatsAppCloud.mountConversationsPage) {
    WhatsAppCloud.mountConversationsPage();
  } else {
    initConversationsPage();
  }
}

/**
 * Load directories (stores, departments) for name resolution
 */
async function loadDirectories() {
  try {
    const [storesRes, deptsRes] = await Promise.all([
      api.getStores(),
      api.getDepartments()
    ]);
    directories.stores = storesRes?.data || [];
    directories.departments = deptsRes?.data || [];
  } catch (e) {
    console.warn('Could not load directories:', e?.message || e);
    directories.stores = directories.stores || [];
    directories.departments = directories.departments || [];
  }
}

/**
 * Resolve attendant info (store/department names) when only IDs are present
 */
function resolveAttendantInfo(conv) {
  const out = { ...conv };
  try {
    if (!out.claimed_by_store) {
      const sid = out.claimed_by_store_id || out.store_id || out.storeId;
      if (sid) {
        const s = directories.stores.find(x => String(x.id) === String(sid) || String(x.name) === String(sid));
        if (s) out.claimed_by_store = s.name || s.store_name;
      }
    }
    if (!out.claimed_by_department) {
      const did = out.claimed_by_department_id || out.department_id || out.departmentId;
      if (did) {
        const d = directories.departments.find(x => String(x.id) === String(did) || String(d.id) === String(did));
        if (d) out.claimed_by_department = d.name || d.department_name;
      }
    }
  } catch (e) {}
  return out;
}
