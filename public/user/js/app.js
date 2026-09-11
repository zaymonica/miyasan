/**
 * User Chat Interface
 */

const API_URL = '/api';
let socket = null;
let currentConversation = null;
let conversations = [];

const state = {
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user') || 'null')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (!state.token) {
        window.location.href = '/login';
        return;
    }

    verifyToken();
    loadConversations();
    setupEventListeners();
    connectSocket();
});

// Verify token
async function verifyToken() {
    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (!response.ok) throw new Error('Invalid token');

        const data = await response.json();
        state.user = data.data.user;
        
        console.log('✅ Token verified, user:', state.user);
        console.log('✅ Tenant ID:', state.user.tenantId);
        
        // Save to localStorage
        localStorage.setItem('user', JSON.stringify(state.user));
        
        document.getElementById('userName').textContent = state.user.name || state.user.username;
    } catch (error) {
        console.error('Token verification failed:', error);
        logout();
    }
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('searchConversations').addEventListener('input', (e) => {
        filterConversations(e.target.value);
    });

    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    document.getElementById('attachmentBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
}

// Load conversations
async function loadConversations() {
    try {
        const response = await fetch(`${API_URL}/tenant/conversations`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            conversations = data.data;
            renderConversations(conversations);
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

// Render conversations
function renderConversations(convs) {
    const container = document.getElementById('conversationsList');
    
    if (convs.length === 0) {
        container.innerHTML = '<div class="loading">No conversations yet</div>';
        return;
    }

    container.innerHTML = convs.map(conv => `
        <div class="conversation-item ${currentConversation?.id === conv.id ? 'active' : ''}" 
             onclick="selectConversation(${conv.id})">
            <div class="conversation-avatar">
                ${conv.contact_name ? conv.contact_name.charAt(0).toUpperCase() : '?'}
            </div>
            <div class="conversation-details">
                <div class="conversation-header">
                    <span class="conversation-name">${conv.contact_name || conv.phone_number}</span>
                    <span class="conversation-time">${formatTime(conv.last_message_time)}</span>
                </div>
                <div class="conversation-last-message">
                    ${conv.last_message || 'No messages yet'}
                </div>
            </div>
        </div>
    `).join('');
}

// Filter conversations
function filterConversations(query) {
    const filtered = conversations.filter(conv => 
        (conv.contact_name && conv.contact_name.toLowerCase().includes(query.toLowerCase())) ||
        conv.phone_number.includes(query)
    );
    renderConversations(filtered);
}

// Select conversation
async function selectConversation(id) {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;

    currentConversation = conv;
    
    // Update UI
    document.getElementById('contactName').textContent = conv.contact_name || 'Unknown';
    document.getElementById('contactPhone').textContent = conv.phone_number;
    document.getElementById('chatInput').style.display = 'flex';
    
    // Update active state
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget?.classList.add('active');

    // Load messages
    await loadMessages(id);
}

// Load messages
async function loadMessages(conversationId) {
    try {
        const response = await fetch(`${API_URL}/tenant/conversations/${conversationId}/messages`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        const data = await response.json();
        
        if (data.success) {
            renderMessages(data.data);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Render messages
function renderMessages(messages) {
    const container = document.getElementById('chatMessages');
    
    if (messages.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No messages yet. Start the conversation!</p></div>';
        return;
    }

    container.innerHTML = messages.map(msg => `
        <div class="message ${msg.is_from_me || msg.direction === 'outgoing' ? 'sent' : 'received'}">
            <div class="message-bubble">
                ${msg.media_url ? renderMedia(msg.media_url, msg.message_type) : ''}
                ${msg.message_text ? `<div class="message-text">${escapeHtml(msg.message_text)}</div>` : ''}
                <div class="message-time">${formatTime(msg.created_at || msg.timestamp)}</div>
            </div>
        </div>
    `).join('');

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

// Render media
function renderMedia(url, type) {
    switch (type) {
        case 'image':
            return `<div class="message-media"><img src="${url}" alt="Image"></div>`;
        case 'video':
            return `<div class="message-media"><video src="${url}" controls></video></div>`;
        case 'audio':
            return `<div class="message-media"><audio src="${url}" controls></audio></div>`;
        default:
            return `<div class="message-media"><a href="${url}" target="_blank"><i class="fas fa-file"></i> Download</a></div>`;
    }
}

// Send message
async function sendMessage() {
    if (!currentConversation) {
        console.warn('No conversation selected');
        return;
    }

    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message) {
        console.warn('Empty message');
        return;
    }

    console.log('📤 Sending message:', { 
        conversationId: currentConversation.id, 
        messageLength: message.length,
        phoneNumber: currentConversation.phone_number
    });

    // Clear input immediately for better UX
    input.value = '';

    // Add message optimistically to UI
    const tempMessage = {
        id: 'temp-' + Date.now(),
        message_text: message,
        body: message,
        is_from_me: true,
        direction: 'outgoing',
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        status: 'sending'
    };
    
    // Add to messages array if it exists
    if (window.currentMessages) {
        window.currentMessages.push(tempMessage);
        renderMessages(window.currentMessages);
    }

    try {
        console.log('🌐 Sending HTTP request...');
        const response = await fetch(`${API_URL}/tenant/conversations/${currentConversation.id}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });

        console.log('📡 Response status:', response.status);
        const data = await response.json();
        console.log('📦 Response data:', data);

        if (data.success) {
            console.log('✅ Message sent successfully, reloading messages...');
            // Reload messages to get the actual saved message
            await loadMessages(currentConversation.id);
            console.log('✅ Messages reloaded');
        } else {
            console.error('❌ Failed to send message:', data.message);
            // Restore input on error
            input.value = message;
            alert('Failed to send message: ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        console.error('❌ Error sending message:', error);
        // Restore input on error
        input.value = message;
        alert('Failed to send message: ' + error.message);
    }
}

// Handle file upload
async function handleFileUpload(e) {
    if (!currentConversation) return;

    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_URL}/tenant/conversations/${currentConversation.id}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.token}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            await loadMessages(currentConversation.id);
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        alert('Failed to upload file');
    }

    e.target.value = '';
}

// Connect Socket.IO
function connectSocket() {
    console.log('🔌 Connecting Socket.IO...', { 
        hasTenantId: !!state.user?.tenantId, 
        tenantId: state.user?.tenantId,
        user: state.user 
    });
    
    if (!state.user?.tenantId) {
        console.error('❌ Cannot connect socket: tenantId not found');
        return;
    }

    const namespace = `/tenant/${state.user.tenantId}`;
    console.log('🔌 Connecting to namespace:', namespace);
    
    socket = io(namespace, {
        auth: { token: state.token }
    });

    socket.on('connect', () => {
        console.log('✅ Socket connected to', namespace);
    });

    socket.on('new_message', (message) => {
        console.log('📨 New message received via socket:', message);
        if (currentConversation && message.conversation_id === currentConversation.id) {
            loadMessages(currentConversation.id);
        }
        loadConversations();
    });

    socket.on('message-sent', (data) => {
        console.log('✅ Message sent confirmation via socket:', data);
        if (currentConversation && data.conversationId === currentConversation.id) {
            loadMessages(currentConversation.id);
        }
        loadConversations();
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
    });
}

// Utility functions
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 86400000) { // Less than 24 hours
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 604800000) { // Less than 7 days
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}
