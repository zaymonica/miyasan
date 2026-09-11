/**
 * User Panel - 3 Column Layout
 * Multitenant WhatsApp System with Conversation Management
 */

// Global State
const state = {
    socket: null,
    currentUser: null,
    accounts: [],
    activeAccountId: null,
    conversations: [],
    currentConversationId: null,
    currentConversation: null,
    messages: [],
    departments: [],
    stores: [],
    users: []
};

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing 3-Column User Panel...');
    
    if (!requireAuth()) return;
    
    state.currentUser = getCurrentUser();
    if (!state.currentUser) {
        console.error('User not found');
        window.location.href = '/login';
        return;
    }
    
    // Security check
    if (state.currentUser.role !== 'user') {
        console.warn('Access denied: Invalid role');
        window.location.href = '/login';
        return;
    }
    
    initializeApp();
});

// Authentication
function requireAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return false;
    }
    return true;
}

function getCurrentUser() {
    const token = localStorage.getItem('token');
    if (!token) return null;
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload;
    } catch (e) {
        console.error('Error parsing token:', e);
        return null;
    }
}

// Initialize App
async function initializeApp() {
    try {
        // Show app container
        document.getElementById('appContainer').style.display = 'flex';
        
        // Initialize Socket.IO
        initializeSocket();
        
        // Load accounts
        await loadAccounts();
        
        // Load conversations
        await loadConversations();
        
        // Load metadata
        await loadMetadata();
        
        // Setup event listeners
        setupEventListeners();
        
        // Hide preloader
        if (window.PWA && window.PWA.hidePreloader) {
            window.PWA.hidePreloader();
        }
        
        console.log('✅ User panel initialized successfully!');
    } catch (error) {
        console.error('Error initializing:', error);
        showNotification('Error initializing application', 'error');
    }
}

// Socket.IO
function initializeSocket() {
    const namespace = `/tenant/${state.currentUser.tenantId}`;
    
    state.socket = io(namespace, {
        timeout: 20000,
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling'],
        auth: {
            token: localStorage.getItem('token')
        }
    });
    
    state.socket.on('connect', () => {
        console.log('✅ Socket connected');
    });
    
    state.socket.on('new-message', (data) => {
        console.log('📨 New message received:', data);
        if (state.currentConversationId && String(data.conversationId) === String(state.currentConversationId)) {
            loadMessages(state.currentConversationId);
        }
        loadConversations();
    });
    
    state.socket.on('conversation-updated', (data) => {
        console.log('Conversation updated:', data);
        loadConversations();
    });
    
    state.socket.on('disconnect', () => {
        console.log('Socket disconnected');
        showNotification('Connection lost. Reconnecting...', 'warning');
    });
}

// Load Accounts
async function loadAccounts() {
    try {
        const response = await fetch('/api/tenant/accounts', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.accounts = data.data || [];
            
            // Add WhatsApp Web as first account
            state.accounts.unshift({
                id: 'web_default',
                name: 'WhatsApp Web',
                phone_number: 'Web Connection',
                status: 'connected',
                type: 'web'
            });
            
            // Set first account as active
            if (!state.activeAccountId && state.accounts.length > 0) {
                state.activeAccountId = state.accounts[0].id;
            }
            
            renderAccountSelector();
        }
    } catch (error) {
        console.error('Error loading accounts:', error);
    }
}

// Render Account Selector
function renderAccountSelector() {
    const accountName = document.getElementById('accountName');
    const accountStatus = document.getElementById('accountStatus');
    const accountDropdownList = document.getElementById('accountDropdownList');
    
    const activeAccount = state.accounts.find(a => a.id === state.activeAccountId);
    
    if (activeAccount) {
        accountName.textContent = activeAccount.name;
        accountStatus.textContent = activeAccount.status === 'connected' ? 'Connected' : 'Disconnected';
    }
    
    accountDropdownList.innerHTML = state.accounts.map(account => `
        <div class="account-item ${account.id === state.activeAccountId ? 'active' : ''}" onclick="selectAccount('${account.id}')">
            <div class="account-item-name">${escapeHtml(account.name)}</div>
            <div class="account-item-phone">${escapeHtml(account.phone_number || 'Web Connection')}</div>
        </div>
    `).join('');
}

// Select Account
window.selectAccount = function(accountId) {
    state.activeAccountId = accountId;
    document.getElementById('accountDropdown').style.display = 'none';
    renderAccountSelector();
    loadConversations();
};

// Load Conversations
async function loadConversations() {
    try {
        const response = await fetch('/api/tenant/conversations', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.conversations = data.data || [];
            renderConversationsList();
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

// Render Conversations List
function renderConversationsList() {
    const container = document.getElementById('conversationsList');
    
    if (!state.conversations || state.conversations.length === 0) {
        container.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-comments"></i>
                <p>No conversations yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.conversations.map(conv => {
        const displayName = (conv.contact_name && conv.contact_name !== 'Unknown') 
            ? conv.contact_name 
            : formatPhoneForDisplay(conv.phone_number);
        const initials = displayName.substring(0, 2).toUpperCase();
        const lastMessage = conv.last_message || 'No messages';
        const time = formatTime(conv.last_message_time || conv.created_at);
        const isClaimed = conv.claimed_by_user_id && conv.claimed_by_user_id !== state.currentUser.id;
        
        return `
            <div class="conversation-item ${conv.id === state.currentConversationId ? 'active' : ''}" onclick="openConversation(${conv.id})">
                <div class="conversation-avatar">${initials}</div>
                <div class="conversation-content">
                    <div class="conversation-header">
                        <span class="conversation-name">${escapeHtml(displayName)}</span>
                        <span class="conversation-time">${time}</span>
                    </div>
                    <div class="conversation-preview">
                        ${isClaimed ? '<span class="conversation-claimed">Claimed</span>' : ''}
                        ${escapeHtml(lastMessage)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Open Conversation
window.openConversation = async function(conversationId) {
    try {
        state.currentConversationId = conversationId;
        
        const response = await fetch(`/api/tenant/conversations/${conversationId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.currentConversation = data.data;
            
            // Show columns 2 and 3 on mobile
            document.querySelector('.col-1').classList.remove('active');
            document.querySelector('.col-2').style.display = 'flex';
            document.querySelector('.col-2').classList.add('active');
            document.querySelector('.col-3').style.display = 'flex';
            document.querySelector('.col-3').classList.add('active');
            
            // Update chat header
            const displayName = state.currentConversation.contact_name || formatPhoneForDisplay(state.currentConversation.phone_number);
            document.getElementById('chatName').textContent = displayName;
            document.getElementById('chatStatus').textContent = state.currentConversation.claimed_by_user_id ? 'Claimed' : 'Available';
            
            // Update details panel
            updateDetailsPanel();
            
            // Load messages
            await loadMessages(conversationId);
            
            // Render conversations list
            renderConversationsList();
        }
    } catch (error) {
        console.error('Error opening conversation:', error);
    }
};

// Load Messages
async function loadMessages(conversationId) {
    try {
        const response = await fetch(`/api/tenant/conversations/${conversationId}/messages`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.messages = data.data || [];
            renderMessages();
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Render Messages
function renderMessages() {
    const container = document.getElementById('messagesContainer');
    
    if (!state.messages || state.messages.length === 0) {
        container.innerHTML = `
            <div class="no-messages-state">
                <i class="fas fa-comments"></i>
                <p>No messages yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.messages.map(msg => {
        const isOwn = msg.sent_by_user_id === state.currentUser.id;
        const time = formatTime(msg.timestamp);
        
        return `
            <div class="message ${isOwn ? 'sent' : 'received'}">
                <div class="message-bubble">${escapeHtml(msg.message_text)}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
    }).join('');
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

// Update Details Panel
function updateDetailsPanel() {
    const conv = state.currentConversation;
    
    document.getElementById('contactName').textContent = conv.contact_name || 'Unknown';
    document.getElementById('contactPhone').textContent = conv.phone_number || '-';
    document.getElementById('contactStatus').textContent = conv.status || 'Active';
    document.getElementById('claimedBy').textContent = conv.claimed_by_user_id ? (conv.claimed_by_name || 'Unknown') : 'Not claimed';
    document.getElementById('pipelineStage').textContent = conv.pipeline_stage || 'Unassigned';
    document.getElementById('createdAt').textContent = formatDate(conv.created_at);
}

// Load Metadata
async function loadMetadata() {
    try {
        const response = await fetch('/api/tenant/metadata', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            state.departments = data.departments || [];
            state.stores = data.stores || [];
            state.users = data.users || [];
        }
    } catch (error) {
        console.error('Error loading metadata:', error);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Account selector
    document.getElementById('accountSelectorBtn').addEventListener('click', () => {
        const dropdown = document.getElementById('accountDropdown');
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.account-selector-wrapper')) {
            document.getElementById('accountDropdown').style.display = 'none';
        }
    });
    
    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
        filterConversations(e.target.value);
    });
    
    document.getElementById('clearSearchBtn').addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        document.getElementById('clearSearchBtn').style.display = 'none';
        renderConversationsList();
    });
    
    // Back button
    document.getElementById('backBtn').addEventListener('click', () => {
        state.currentConversationId = null;
        state.currentConversation = null;
        document.querySelector('.col-1').classList.add('active');
        document.querySelector('.col-2').style.display = 'none';
        document.querySelector('.col-3').style.display = 'none';
        renderConversationsList();
    });
    
    // Message input
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    
    // Transfer button
    document.getElementById('transferBtn').addEventListener('click', openTransferModal);
    document.getElementById('changeStageBtn').addEventListener('click', openChangeStageModal);
    document.getElementById('releaseBtn').addEventListener('click', releaseConversation);
    
    // Modal buttons
    document.getElementById('closeTransferModal').addEventListener('click', closeTransferModal);
    document.getElementById('cancelTransferBtn').addEventListener('click', closeTransferModal);
    document.getElementById('confirmTransferBtn').addEventListener('click', confirmTransfer);
    
    document.getElementById('closeChangeStageModal').addEventListener('click', closeChangeStageModal);
    document.getElementById('cancelChangeStageBtn').addEventListener('click', closeChangeStageModal);
    document.getElementById('confirmChangeStageBtn').addEventListener('click', confirmChangeStage);
    
    // Transfer target selector
    document.getElementById('transferTarget').addEventListener('change', (e) => {
        updateTransferOptions(e.target.value);
    });
}

// Send Message
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();
    
    if (!message || !state.currentConversationId) return;
    
    try {
        const response = await fetch(`/api/tenant/conversations/${state.currentConversationId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message_text: message })
        });
        
        const data = await response.json();
        
        if (data.success) {
            input.value = '';
            await loadMessages(state.currentConversationId);
        }
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

// Filter Conversations
function filterConversations(query) {
    const filtered = state.conversations.filter(conv => {
        const displayName = (conv.contact_name && conv.contact_name !== 'Unknown') 
            ? conv.contact_name 
            : formatPhoneForDisplay(conv.phone_number);
        return displayName.toLowerCase().includes(query.toLowerCase()) || 
               conv.phone_number.includes(query);
    });
    
    document.getElementById('clearSearchBtn').style.display = query ? 'block' : 'none';
    
    const container = document.getElementById('conversationsList');
    if (filtered.length === 0) {
        container.innerHTML = '<div class="loading-state"><p>No conversations found</p></div>';
        return;
    }
    
    container.innerHTML = filtered.map(conv => {
        const displayName = (conv.contact_name && conv.contact_name !== 'Unknown') 
            ? conv.contact_name 
            : formatPhoneForDisplay(conv.phone_number);
        const initials = displayName.substring(0, 2).toUpperCase();
        const lastMessage = conv.last_message || 'No messages';
        const time = formatTime(conv.last_message_time || conv.created_at);
        
        return `
            <div class="conversation-item" onclick="openConversation(${conv.id})">
                <div class="conversation-avatar">${initials}</div>
                <div class="conversation-content">
                    <div class="conversation-header">
                        <span class="conversation-name">${escapeHtml(displayName)}</span>
                        <span class="conversation-time">${time}</span>
                    </div>
                    <div class="conversation-preview">${escapeHtml(lastMessage)}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Transfer Modal
function openTransferModal() {
    document.getElementById('transferModal').style.display = 'flex';
}

function closeTransferModal() {
    document.getElementById('transferModal').style.display = 'none';
}

function updateTransferOptions(type) {
    document.getElementById('transferUserGroup').style.display = type === 'user' ? 'block' : 'none';
    document.getElementById('transferDepartmentGroup').style.display = type === 'department' ? 'block' : 'none';
    document.getElementById('transferStoreGroup').style.display = type === 'store' ? 'block' : 'none';
    
    if (type === 'user') {
        document.getElementById('transferUser').innerHTML = state.users.map(u => 
            `<option value="${u.id}">${escapeHtml(u.name)}</option>`
        ).join('');
    } else if (type === 'department') {
        document.getElementById('transferDepartment').innerHTML = state.departments.map(d => 
            `<option value="${d.id}">${escapeHtml(d.name)}</option>`
        ).join('');
    } else if (type === 'store') {
        document.getElementById('transferStore').innerHTML = state.stores.map(s => 
            `<option value="${s.id}">${escapeHtml(s.name)}</option>`
        ).join('');
    }
}

async function confirmTransfer() {
    const type = document.getElementById('transferTarget').value;
    let targetId = null;
    
    if (type === 'user') {
        targetId = document.getElementById('transferUser').value;
    } else if (type === 'department') {
        targetId = document.getElementById('transferDepartment').value;
    } else if (type === 'store') {
        targetId = document.getElementById('transferStore').value;
    }
    
    if (!targetId) {
        showNotification('Please select a target', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`/api/tenant/conversations/${state.currentConversationId}/transfer`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type, targetId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Conversation transferred successfully', 'success');
            closeTransferModal();
            await loadConversations();
        }
    } catch (error) {
        console.error('Error transferring conversation:', error);
        showNotification('Error transferring conversation', 'error');
    }
}

// Change Stage Modal
function openChangeStageModal() {
    const stageSelect = document.getElementById('stageSelect');
    stageSelect.innerHTML = `
        <option value="unassigned">Unassigned</option>
        <option value="new">New</option>
        <option value="negotiation">Negotiation</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
    `;
    document.getElementById('changeStageModal').style.display = 'flex';
}

function closeChangeStageModal() {
    document.getElementById('changeStageModal').style.display = 'none';
}

async function confirmChangeStage() {
    const stage = document.getElementById('stageSelect').value;
    
    if (!stage) {
        showNotification('Please select a stage', 'warning');
        return;
    }
    
    try {
        const response = await fetch(`/api/tenant/conversations/${state.currentConversationId}/stage`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ pipeline_stage: stage })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Stage updated successfully', 'success');
            closeChangeStageModal();
            await loadConversations();
            updateDetailsPanel();
        }
    } catch (error) {
        console.error('Error updating stage:', error);
        showNotification('Error updating stage', 'error');
    }
}

// Release Conversation
async function releaseConversation() {
    if (!confirm('Are you sure you want to release this conversation?')) return;
    
    try {
        const response = await fetch(`/api/tenant/conversations/${state.currentConversationId}/release`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Conversation released successfully', 'success');
            state.currentConversationId = null;
            state.currentConversation = null;
            document.querySelector('.col-2').style.display = 'none';
            document.querySelector('.col-3').style.display = 'none';
            await loadConversations();
        }
    } catch (error) {
        console.error('Error releasing conversation:', error);
        showNotification('Error releasing conversation', 'error');
    }
}

// Utility Functions
function formatPhoneForDisplay(phone) {
    if (!phone) return 'Unknown';
    return phone.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3');
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(timestamp) {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info', duration = 3000) {
    console.log(`[${type.toUpperCase()}] ${message}`);
    // You can implement a toast notification here
}
