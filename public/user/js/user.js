/**
 * User Panel - Multitenant WhatsApp System
 * PWA-enabled with real-time messaging, audio recording, camera, and media support
 */

// Global variables
let socket;
let currentConversationId = null;
let currentConversation = null;
let conversations = [];
let currentMessages = new Map();
let isSendingMessage = false;
let products = [];

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing user panel...');
    
    if (!requireAuth()) return;
    
    const user = getCurrentUser();
    if (!user) {
        console.error('User not found');
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
    }
    
    // SECURITY: Only 'user' role can access this panel
    // Redirect admin to admin panel
    if (user.role === 'admin') {
        console.warn('Access denied: Admin should use admin panel');
        window.location.href = '/admin';
        return;
    }
    
    // Redirect superadmin to superadmin panel
    if (user.role === 'superadmin') {
        console.warn('Access denied: SuperAdmin should use superadmin panel');
        window.location.href = '/superadmin';
        return;
    }
    
    // Block any other role that is not 'user'
    if (user.role !== 'user') {
        console.warn('Access denied: Invalid role for user panel');
        localStorage.removeItem('token');
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
        // Initialize Socket.IO
        initializeSocket();
        
        // Load conversations
        await loadConversations();
        
        // Setup event listeners
        setupEventListeners();
        
        // Load stores and departments for transfer
        await loadStoresAndDepartments();
        
        // Hide preloader
        if (window.PWA && window.PWA.hidePreloader) {
            window.PWA.hidePreloader();
        }
        
        console.log('User panel initialized successfully!');
    } catch (error) {
        console.error('Error initializing:', error);
        showNotification('Error initializing application', 'error');
    }
}

// Socket.IO
function initializeSocket() {
    const user = getCurrentUser();
    const namespace = `/tenant/${user.tenantId}`;
    
    console.log('Connecting to socket namespace:', namespace);
    
    socket = io(namespace, {
        timeout: 20000,
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling'],
        auth: {
            token: localStorage.getItem('token')
        }
    });
    
    socket.on('connect', () => {
        console.log('Socket connected');
        
        // Join user's store or department room
        if (user.store) {
            socket.emit('join-store', user.store);
            console.log('Joined store room:', user.store);
        }
        if (user.department) {
            socket.emit('join-department', user.department);
            console.log('Joined department room:', user.department);
        }
    });
    
    socket.on('new-message', (data) => {
        console.log('📨 New message received via socket:', data);
        loadConversations();
        
        // Use String() for type coercion (conversationId may come as string or number)
        if (currentConversationId && String(data.conversationId) === String(currentConversationId)) {
            console.log('✅ Reloading messages for current conversation');
            loadMessages(currentConversationId);
        }
    });
    
    socket.on('message-sent', (data) => {
        console.log('✅ Message sent confirmation via socket:', data);
        loadConversations();
        
        // Use == for type coercion (conversationId may come as string or number)
        if (currentConversationId && String(data.conversationId) === String(currentConversationId)) {
            console.log('✅ Reloading messages after sent confirmation');
            loadMessages(currentConversationId);
        }
    });
    
    socket.on('conversation-updated', (data) => {
        console.log('Conversation updated:', data);
        loadConversations();
    });
    
    socket.on('conversation-transferred', (data) => {
        console.log('Conversation transferred:', data);
        handleConversationTransferred(data);
    });
    
    // New alert events
    socket.on('conversation-attended-alert', (data) => {
        console.log('🔔 Conversation attended alert:', data);
        showNotification(data.message, 'info', 5000);
        loadConversations(); // Refresh to update visibility
    });
    
    socket.on('conversation-transfer-alert', (data) => {
        console.log('🔔 Conversation transfer alert:', data);
        const user = getCurrentUser();
        // Only show alert to users in the target store/department
        if ((data.targetStore && user.store === data.targetStore) || 
            (data.targetDepartment && user.department === data.targetDepartment)) {
            showNotification(data.message, 'info', 5000);
            loadConversations(); // Refresh to show new conversation
        }
    });
    
    socket.on('new-message-alert', (data) => {
        console.log('🔔 New message alert:', data);
        const user = getCurrentUser();
        // Show alert to all store users for new messages (departments don't see first messages)
        if (user.store && !user.department) {
            showNotification(`${data.message}`, 'info', 3000);
        }
    });
    
    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        showNotification('Connection lost. Reconnecting...', 'warning');
    });
    
    socket.on('reconnect', (attemptNumber) => {
        console.log('Socket reconnected after', attemptNumber, 'attempts');
        showNotification('Connection restored!', 'success');
        // Reload conversations after reconnection
        loadConversations();
    });
    
    socket.on('reconnect_error', (error) => {
        console.error('Socket reconnection error:', error);
    });
    
    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
    });
    
    // Setup message edit/delete listeners
    setupMessageSocketListeners();
}

// Event Listeners
function setupEventListeners() {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Toggle mic/send button based on input
        messageInput.addEventListener('input', updateMicSendButton);
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterConversations(e.target.value);
        });
    }
    
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', closeConversation);
    }
    
    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.icon-btn') && !e.target.closest('.menu-dropdown')) {
            document.getElementById('menuDropdown').style.display = 'none';
            document.getElementById('chatMenuDropdown').style.display = 'none';
        }
    });
}

// Update mic/send button based on input
function updateMicSendButton() {
    const messageInput = document.getElementById('messageInput');
    const micSendBtn = document.getElementById('micSendBtn');
    const micSendIcon = document.getElementById('micSendIcon');
    
    if (!messageInput || !micSendBtn || !micSendIcon) return;
    
    const hasText = messageInput.value.trim().length > 0;
    
    if (hasText) {
        micSendBtn.classList.add('send-mode');
        micSendIcon.className = 'fas fa-paper-plane';
    } else {
        micSendBtn.classList.remove('send-mode');
        micSendIcon.className = 'fas fa-microphone';
    }
}

// Handle mic/send button click
window.handleMicSendClick = async function() {
    const messageInput = document.getElementById('messageInput');
    const hasText = messageInput && messageInput.value.trim().length > 0;
    
    if (hasText) {
        sendMessage();
    } else {
        // Start audio recording
        if (window.AudioRecorder) {
            const started = await window.AudioRecorder.start();
            if (started) {
                console.log('Audio recording started');
            }
        }
    }
}

// Cancel audio recording
window.cancelRecording = function() {
    if (window.AudioRecorder) {
        window.AudioRecorder.cancel();
    }
}

// Send audio recording
window.sendRecording = async function() {
    if (!window.AudioRecorder) return;
    
    const audioBlob = await window.AudioRecorder.stop();
    if (audioBlob) {
        window.AudioRecorder.hideInterface();
        await uploadAndSendMedia(audioBlob, 'audio');
    }
}

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
            conversations = data.data || [];
            renderConversations(conversations);
        } else {
            console.error('Error loading conversations:', data.message);
            conversations = [];
            renderConversations(conversations);
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
        showNotification('Error loading conversations', 'error');
        conversations = [];
        renderConversations(conversations);
    }
}

function renderConversations(convs) {
    const container = document.getElementById('conversationsList');
    
    if (!convs || convs.length === 0) {
        container.innerHTML = `
            <div class="no-conversations">
                <i class="fas fa-comments" style="font-size: 48px; color: #ccc;"></i>
                <p data-i18n="conversations.no_conversations">No conversations yet</p>
            </div>
        `;
        return;
    }
    
    // Remove duplicates
    const uniqueConvs = [];
    const seenPhones = new Set();
    const seenJids = new Set();
    
    convs.forEach(conv => {
        const phone = conv.phone_number;
        const jid = conv.remote_jid;
        
        if (seenPhones.has(phone) || (jid && seenJids.has(jid))) {
            return;
        }
        
        seenPhones.add(phone);
        if (jid) seenJids.add(jid);
        uniqueConvs.push(conv);
    });
    
    container.innerHTML = uniqueConvs.map(conv => {
        const displayName = (conv.contact_name && conv.contact_name !== 'Unknown') 
            ? conv.contact_name 
            : formatPhoneForDisplay(conv.phone_number);
        const initials = displayName.substring(0, 2).toUpperCase();
        const lastMessage = conv.last_message || 'No messages';
        const time = formatTime(conv.last_message_time || conv.created_at);
        
        return `
            <div class="conversation-item" onclick="openConversation(${conv.id})">
                <div class="conversation-avatar">${initials}</div>
                <div class="conversation-info">
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

// Open Conversation
window.openConversation = async function(conversationId) {
    try {
        currentConversationId = conversationId;
        
        const response = await fetch(`/api/tenant/conversations/${conversationId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentConversation = data.data.conversation || data.data;
            
            document.getElementById('headerTitle').textContent = currentConversation.contact_name || formatPhoneForDisplay(currentConversation.phone_number);
            document.getElementById('headerSubtitle').textContent = formatPhoneForDisplay(currentConversation.phone_number);
            
            document.getElementById('backBtn').style.display = 'flex';
            document.getElementById('chatMenuBtn').style.display = 'flex';
            document.getElementById('mainMenuBtn').style.display = 'none';
            document.querySelector('.floating-contacts-btn').style.display = 'none';
            
            document.getElementById('conversationsView').style.display = 'none';
            document.getElementById('chatView').style.display = 'flex';
            
            currentMessages.clear();
            await loadMessages(conversationId);
            
            document.getElementById('messageInput').focus();
        }
    } catch (error) {
        console.error('Error opening conversation:', error);
        showNotification('Error opening conversation', 'error');
    }
}

function closeConversation() {
    currentConversationId = null;
    currentConversation = null;
    currentMessages.clear();
    
    document.getElementById('headerTitle').textContent = 'Conversations';
    document.getElementById('headerSubtitle').textContent = '';
    document.getElementById('backBtn').style.display = 'none';
    
    document.getElementById('chatMenuBtn').style.display = 'none';
    document.getElementById('mainMenuBtn').style.display = 'flex';
    document.querySelector('.floating-contacts-btn').style.display = 'block';
    
    document.getElementById('conversationsView').style.display = 'block';
    document.getElementById('chatView').style.display = 'none';
    
    loadConversations();
}

// Load Messages
async function loadMessages(conversationId) {
    try {
        console.log('📨 Loading messages for conversation:', conversationId);
        const response = await fetch(`/api/tenant/conversations/${conversationId}/messages`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        console.log('📨 Messages response:', data);
        
        if (data.success) {
            console.log('📨 Rendering', data.data?.length || 0, 'messages');
            renderMessages(data.data || []);
        } else {
            console.error('Error loading messages:', data.message);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        showNotification('Error loading messages', 'error');
    }
}

function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
    console.log('🎨 renderMessages called with', messages?.length || 0, 'messages');
    
    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div class="no-messages">
                <p data-i18n="conversations.no_messages">No messages in this conversation</p>
            </div>
        `;
        currentMessages.clear();
        return;
    }
    
    currentMessages.clear();
    
    messages.forEach(msg => {
        if (!msg.id || msg.id.toString().startsWith('temp-')) {
            return;
        }
        currentMessages.set(msg.id, msg);
    });
    
    const uniqueMessages = Array.from(currentMessages.values())
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    console.log('🎨 Rendering', uniqueMessages.length, 'unique messages');
    
    container.innerHTML = uniqueMessages.map(msg => {
        const isSent = msg.is_from_me || msg.sender_id || msg.direction === 'outgoing';
        const time = formatTime(msg.created_at);
        const content = msg.message_text || msg.body || msg.content || '';
        const mediaUrl = msg.media_url;
        const mediaType = msg.message_type || msg.media_type || 'text';
        const isDeleted = msg.is_deleted || content === '[Message deleted]';
        const isEdited = msg.is_edited;
        
        let mediaHtml = '';
        if (mediaUrl && !isDeleted) {
            mediaHtml = renderMediaContent(mediaUrl, mediaType, content);
        }
        
        const editedLabel = isEdited ? '<span class="edited-label" data-i18n="chat.edited">Edited</span>' : '';
        const deletedClass = isDeleted ? 'deleted-message' : '';
        const displayContent = isDeleted ? '🚫 This message was deleted' : content;
        
        return `
            <div class="message ${isSent ? 'sent' : 'received'} ${deletedClass}" 
                 data-message-id="${msg.id}" 
                 data-is-sent="${isSent}"
                 data-is-deleted="${isDeleted}"
                 ${!isDeleted ? 'oncontextmenu="showMessageContextMenu(event, ' + msg.id + ', ' + isSent + ')" ontouchstart="handleMessageTouchStart(event, ' + msg.id + ', ' + isSent + ')" ontouchend="handleMessageTouchEnd(event)"' : ''}>
                <div class="message-bubble">
                    ${mediaHtml}
                    ${!mediaUrl || mediaType === 'text' ? `<div class="message-text">${escapeHtml(displayContent)}</div>` : (content && !mediaHtml.includes('message-text') ? `<div class="message-text">${escapeHtml(content)}</div>` : '')}
                    <div class="message-time">${editedLabel}${time}</div>
                </div>
            </div>
        `;
    }).join('');
    
    console.log('🎨 Messages rendered, scrolling to bottom');
    
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 100);
}

function renderMediaContent(url, type, caption) {
    switch (type) {
        case 'image':
            return `
                <div class="message-media">
                    <img src="${url}" alt="Image" onclick="openMediaViewer('${url}', 'image')">
                </div>
                ${caption ? `<div class="message-text">${escapeHtml(caption)}</div>` : ''}
            `;
        case 'video':
            return `
                <div class="message-media">
                    <video src="${url}" controls></video>
                </div>
                ${caption ? `<div class="message-text">${escapeHtml(caption)}</div>` : ''}
            `;
        case 'audio':
            return `
                <div class="audio-message">
                    <audio src="${url}" controls></audio>
                </div>
            `;
        case 'document':
            const fileName = url.split('/').pop() || 'Document';
            return `
                <div class="message-document" onclick="window.open('${url}', '_blank')">
                    <div class="document-icon"><i class="fas fa-file-pdf"></i></div>
                    <div class="document-info">
                        <div class="document-name">${escapeHtml(fileName)}</div>
                    </div>
                </div>
                ${caption ? `<div class="message-text">${escapeHtml(caption)}</div>` : ''}
            `;
        default:
            return '';
    }
}

// Send Message
window.sendMessage = async function() {
    const input = document.getElementById('messageInput');
    const micSendBtn = document.getElementById('micSendBtn');
    const message = input.value.trim();
    
    if (!currentConversationId) {
        showNotification('Please select a conversation first', 'error');
        return;
    }
    
    if (!message || isSendingMessage) {
        return;
    }
    
    isSendingMessage = true;
    const originalMessage = message;
    const conversationIdToUse = currentConversationId;
    
    // Clear input immediately
    input.value = '';
    updateMicSendButton();
    
    // Show sending indicator on button
    if (micSendBtn) {
        micSendBtn.classList.add('sending');
        micSendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    
    // Optimistic UI update
    const tempId = 'temp-' + Date.now();
    const tempMessage = {
        id: tempId,
        message_text: message,
        is_from_me: true,
        direction: 'outgoing',
        created_at: new Date().toISOString(),
        status: 'sending'
    };
    
    currentMessages.set(tempId, tempMessage);
    renderMessages(Array.from(currentMessages.values()));
    
    try {
        // Add timeout to prevent infinite waiting
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
        
        const response = await fetch(`/api/tenant/conversations/${conversationIdToUse}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: message }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorData = await response.json();
            currentMessages.delete(tempId);
            renderMessages(Array.from(currentMessages.values()));
            input.value = originalMessage;
            throw new Error(errorData.message || 'Error sending message');
        }
        
        currentMessages.delete(tempId);
        await loadMessages(conversationIdToUse);
        
    } catch (error) {
        console.error('Error sending message:', error);
        if (error.name === 'AbortError') {
            showNotification('Message is taking too long. It may still be sent.', 'warning');
        } else {
            showNotification(error.message || 'Error sending message', 'error');
            input.value = originalMessage;
        }
        currentMessages.delete(tempId);
        renderMessages(Array.from(currentMessages.values()));
    } finally {
        isSendingMessage = false;
        // Restore button
        if (micSendBtn) {
            micSendBtn.classList.remove('sending');
            micSendBtn.innerHTML = '<i class="fas fa-microphone" id="micSendIcon"></i>';
        }
        updateMicSendButton();
    }
}

// Upload and send media
window.uploadAndSendMedia = async function(blob, type) {
    if (!currentConversationId) {
        showNotification('Please select a conversation first', 'error');
        return;
    }
    
    showUploadProgress(true);
    
    try {
        const formData = new FormData();
        
        // CRITICAL FIX: Use proper extension and mimetype based on type
        let extension, mimeType;
        
        if (type === 'image') {
            extension = 'jpg';
            mimeType = blob.type || 'image/jpeg';
        } else if (type === 'video') {
            extension = 'mp4';
            mimeType = blob.type || 'video/mp4';
        } else if (type === 'audio') {
            // Audio from recorder is webm/opus
            extension = 'ogg';
            mimeType = 'audio/ogg';
        } else if (type === 'document') {
            // Try to get extension from blob type
            const mimeToExt = {
                'application/pdf': 'pdf',
                'application/msword': 'doc',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                'application/vnd.ms-excel': 'xls',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
            };
            extension = mimeToExt[blob.type] || 'pdf';
            mimeType = blob.type || 'application/pdf';
        } else {
            extension = 'bin';
            mimeType = blob.type || 'application/octet-stream';
        }
        
        const filename = `${type}_${Date.now()}.${extension}`;
        
        // Create a new blob with the correct mimetype if needed
        const finalBlob = new Blob([blob], { type: mimeType });
        
        formData.append('file', finalBlob, filename);
        formData.append('conversationId', currentConversationId);
        
        console.log(`[Upload] Sending ${type} as ${filename} with mimetype ${mimeType}`);
        
        const response = await fetch('/api/tenant/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('[Upload] Success:', data);
            await sendMediaMessage(data.url, type);
            showNotification('Media sent successfully', 'success');
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Upload failed');
        }
    } catch (error) {
        console.error('Error uploading media:', error);
        showNotification('Error uploading media: ' + error.message, 'error');
    } finally {
        showUploadProgress(false);
    }
}

async function sendMediaMessage(mediaUrl, mediaType) {
    try {
        const response = await fetch(`/api/tenant/conversations/${currentConversationId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: '',
                media_url: mediaUrl,
                media_type: mediaType
            })
        });
        
        if (response.ok) {
            await loadMessages(currentConversationId);
        }
    } catch (error) {
        console.error('Error sending media message:', error);
    }
}

function showUploadProgress(show) {
    let progress = document.getElementById('uploadProgress');
    if (!progress && show) {
        progress = document.createElement('div');
        progress.id = 'uploadProgress';
        progress.className = 'upload-progress';
        progress.innerHTML = `
            <div class="upload-progress-header">
                <div class="upload-progress-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                <div class="upload-progress-text">
                    <h4 data-i18n="chat.uploading">Uploading...</h4>
                    <p data-i18n="chat.please_wait">Please wait</p>
                </div>
            </div>
            <div class="upload-progress-bar">
                <div class="upload-progress-fill" style="width: 50%"></div>
            </div>
        `;
        document.body.appendChild(progress);
    }
    
    if (progress) {
        progress.classList.toggle('show', show);
    }
}

// Attachment handling
window.toggleAttachMenu = function() {
    const menu = document.getElementById('attachMenu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

window.selectAttachment = function(type) {
    toggleAttachMenu();
    
    switch(type) {
        case 'gallery':
            document.getElementById('imageInput').click();
            break;
        case 'document':
            document.getElementById('documentInput').click();
            break;
        case 'payment':
            document.getElementById('paymentModal').style.display = 'flex';
            break;
        case 'product':
            openProductModal();
            break;
    }
}

window.handleFileSelect = async function(e) {
    const file = e.target.files[0];
    if (!file || !currentConversationId) return;
    
    let mediaType = 'document';
    if (file.type.startsWith('image/')) mediaType = 'image';
    else if (file.type.startsWith('video/')) mediaType = 'video';
    else if (file.type.startsWith('audio/')) mediaType = 'audio';
    
    console.log(`[FileSelect] Selected file: ${file.name}, type: ${file.type}, mediaType: ${mediaType}`);
    
    // For documents, preserve the original file with its name and type
    if (mediaType === 'document') {
        showUploadProgress(true);
        try {
            const formData = new FormData();
            formData.append('file', file, file.name); // Use original filename
            formData.append('conversationId', currentConversationId);
            
            const response = await fetch('/api/tenant/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                await sendMediaMessage(data.url, mediaType);
                showNotification('Document sent successfully', 'success');
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            console.error('Error uploading document:', error);
            showNotification('Error uploading document', 'error');
        } finally {
            showUploadProgress(false);
        }
    } else {
        await uploadAndSendMedia(file, mediaType);
    }
    
    e.target.value = '';
}

// Product Modal
async function openProductModal() {
    document.getElementById('productModal').style.display = 'flex';
    await loadProducts();
}

window.closeProductModal = function() {
    document.getElementById('productModal').style.display = 'none';
}

async function loadProducts() {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '<div class="loading" data-i18n="common.loading">Loading products...</div>';
    
    try {
        const response = await fetch('/api/tenant/woocommerce/products', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.data) {
            products = data.data;
            renderProducts(products);
        } else {
            grid.innerHTML = '<div class="no-products" data-i18n="chat.no_products">No products available</div>';
        }
    } catch (error) {
        console.error('Error loading products:', error);
        grid.innerHTML = '<div class="no-products" data-i18n="common.error">Error loading products</div>';
    }
}

function renderProducts(prods) {
    const grid = document.getElementById('productsGrid');
    
    if (!prods || prods.length === 0) {
        grid.innerHTML = '<div class="no-products" data-i18n="chat.no_products">No products available</div>';
        return;
    }
    
    grid.innerHTML = prods.map(product => `
        <div class="product-card" onclick="selectProduct(${product.id})">
            <img class="product-image" src="${product.images?.[0]?.src || '/images/no-image.svg'}" alt="${escapeHtml(product.name)}">
            <div class="product-info">
                <div class="product-name">${escapeHtml(product.name)}</div>
                <div class="product-price">${product.price || '0.00'}</div>
            </div>
        </div>
    `).join('');
}

window.filterProducts = function() {
    const query = document.getElementById('productSearchInput').value.toLowerCase();
    const filtered = products.filter(p => p.name.toLowerCase().includes(query));
    renderProducts(filtered);
}

window.selectProduct = async function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    closeProductModal();
    
    // Send product as message with link
    // Format price properly
    const formattedPrice = typeof product.price === 'number' 
        ? product.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : product.price || 'Consulte';
    
    // Build product message with link
    let productMessage = `🛍️ *${product.name}*\n💰 ${formattedPrice}`;
    
    // Add product link if available
    if (product.permalink) {
        productMessage += `\n\n🔗 Ver produto: ${product.permalink}`;
    }
    
    try {
        await fetch(`/api/tenant/conversations/${currentConversationId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: productMessage })
        });
        
        await loadMessages(currentConversationId);
        showNotification('Product sent', 'success');
    } catch (error) {
        console.error('Error sending product:', error);
        showNotification('Error sending product', 'error');
    }
}

// Payment Modal
window.closePaymentModal = function() {
    document.getElementById('paymentModal').style.display = 'none';
}

window.createPaymentLink = async function() {
    const method = document.getElementById('paymentMethod').value;
    const amount = document.getElementById('paymentAmount').value;
    const description = document.getElementById('paymentDescription').value;
    
    if (!method || !amount) {
        showNotification('Please fill all fields', 'error');
        return;
    }
    
    if (!currentConversation || !currentConversation.phone_number) {
        showNotification('No conversation selected', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/tenant/payments/create-link', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                payment_method: method,
                amount: parseFloat(amount),
                description,
                customer_phone: currentConversation.phone_number,
                customer_name: currentConversation.contact_name || null
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            const paymentLink = data.payment_link.payment_url;
            await sendPaymentMessage(paymentLink, amount, description);
            showNotification('Payment link created and sent', 'success');
            closePaymentModal();
        } else {
            throw new Error(data.error || data.message || 'Error creating payment link');
        }
    } catch (error) {
        console.error('Error creating payment link:', error);
        showNotification(error.message || 'Error creating payment link', 'error');
    }
}

async function sendPaymentMessage(link, amount, description) {
    try {
        const message = `💳 *Payment Link*\n💰 Amount: $${amount}\n📝 ${description || 'Payment'}\n\n🔗 ${link}`;
        
        await fetch(`/api/tenant/conversations/${currentConversationId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });
        
        await loadMessages(currentConversationId);
    } catch (error) {
        console.error('Error sending payment message:', error);
    }
}

// Transfer Modals
window.openTransferToStoreModal = function() {
    document.getElementById('chatMenuDropdown').style.display = 'none';
    document.getElementById('transferToStoreModal').style.display = 'flex';
}

window.closeTransferToStoreModal = function() {
    document.getElementById('transferToStoreModal').style.display = 'none';
}

window.openTransferToDepartmentModal = function() {
    document.getElementById('chatMenuDropdown').style.display = 'none';
    document.getElementById('transferToDepartmentModal').style.display = 'flex';
}

window.closeTransferToDepartmentModal = function() {
    document.getElementById('transferToDepartmentModal').style.display = 'none';
}

window.confirmTransferToStore = async function() {
    const store = document.getElementById('transferStore').value;
    if (!store) {
        showNotification('Please select a store', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/tenant/conversations/${currentConversationId}/transfer`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ targetStore: store })
        });
        
        if (response.ok) {
            showNotification('Conversation transferred successfully', 'success');
            closeTransferToStoreModal();
            closeConversation();
        } else {
            throw new Error('Transfer failed');
        }
    } catch (error) {
        console.error('Error transferring:', error);
        showNotification('Error transferring conversation', 'error');
    }
}

window.confirmTransferToDepartment = async function() {
    const department = document.getElementById('transferDepartment').value;
    if (!department) {
        showNotification('Please select a department', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/tenant/conversations/${currentConversationId}/transfer`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ targetDepartment: department })
        });
        
        if (response.ok) {
            showNotification('Conversation transferred successfully', 'success');
            closeTransferToDepartmentModal();
            closeConversation();
        } else {
            throw new Error('Transfer failed');
        }
    } catch (error) {
        console.error('Error transferring:', error);
        showNotification('Error transferring conversation', 'error');
    }
}

function handleConversationTransferred(data) {
    if (currentConversationId === data.conversationId) {
        closeConversation();
        showNotification('Conversation transferred', 'info');
    }
    loadConversations();
}

async function loadStoresAndDepartments() {
    try {
        const storesResponse = await fetch('/api/tenant/stores', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const storesData = await storesResponse.json();
        
        if (storesData.success) {
            const storeSelect = document.getElementById('transferStore');
            storeSelect.innerHTML = '<option value="" data-i18n="common.select">Select...</option>' +
                (storesData.data || []).map(s => `<option value="${s.name}">${escapeHtml(s.name)}</option>`).join('');
        }
        
        const deptsResponse = await fetch('/api/tenant/departments', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const deptsData = await deptsResponse.json();
        
        if (deptsData.success) {
            const deptSelect = document.getElementById('transferDepartment');
            deptSelect.innerHTML = '<option value="" data-i18n="common.select">Select...</option>' +
                (deptsData.data || []).map(d => `<option value="${d.name}">${escapeHtml(d.name)}</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading stores/departments:', error);
    }
}

// Search
window.toggleSearch = function() {
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    
    if (searchBar.style.display === 'none' || !searchBar.style.display) {
        searchBar.style.display = 'block';
        searchInput.focus();
    } else {
        searchBar.style.display = 'none';
        searchInput.value = '';
        filterConversations('');
    }
}

window.clearSearch = function() {
    const searchInput = document.getElementById('searchInput');
    searchInput.value = '';
    filterConversations('');
}

function filterConversations(query) {
    const items = document.querySelectorAll('.conversation-item');
    const lowerQuery = query.toLowerCase();
    
    items.forEach(item => {
        const name = item.querySelector('.conversation-name')?.textContent.toLowerCase() || '';
        const preview = item.querySelector('.conversation-preview')?.textContent.toLowerCase() || '';
        
        if (name.includes(lowerQuery) || preview.includes(lowerQuery)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Menus
window.showMenu = function() {
    const menu = document.getElementById('menuDropdown');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

window.showChatMenu = function() {
    const menu = document.getElementById('chatMenuDropdown');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// Logout
window.openLogoutModal = function() {
    document.getElementById('menuDropdown').style.display = 'none';
    document.getElementById('logoutModal').style.display = 'flex';
}

window.closeLogoutModal = function() {
    document.getElementById('logoutModal').style.display = 'none';
}

window.confirmLogout = function() {
    localStorage.removeItem('token');
    window.location.href = '/login';
}

// Contacts Panel
window.toggleContactsPanel = function() {
    const panel = document.getElementById('contactsPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    
    if (panel.style.display === 'block') {
        loadContacts();
    }
}

async function loadContacts() {
    const container = document.getElementById('contactsPanelList');
    container.innerHTML = '<div class="contacts-loading" data-i18n="common.loading">Loading contacts...</div>';
    
    try {
        const response = await fetch('/api/tenant/contacts', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderContacts(data.data || []);
        } else {
            container.innerHTML = '<div class="no-contacts" data-i18n="contacts.error_loading">Error loading contacts</div>';
        }
    } catch (error) {
        container.innerHTML = '<div class="no-contacts" data-i18n="contacts.error_loading">Error loading contacts</div>';
        console.error('Error loading contacts:', error);
    }
}

function renderContacts(contacts) {
    const container = document.getElementById('contactsPanelList');
    
    if (!contacts || contacts.length === 0) {
        container.innerHTML = '<div class="no-contacts" data-i18n="contacts.no_contacts">No contacts found</div>';
        return;
    }
    
    container.innerHTML = contacts.map(contact => `
        <div class="contact-item" onclick="startConversationWithContact('${contact.phone}')">
            <div class="contact-avatar">${(contact.name || contact.phone).substring(0, 2).toUpperCase()}</div>
            <div class="contact-info">
                <div class="contact-name">${escapeHtml(contact.name || contact.phone)}</div>
                <div class="contact-phone">${escapeHtml(contact.phone)}</div>
            </div>
        </div>
    `).join('');
}

window.filterContactsList = function() {
    const query = document.getElementById('contactsSearchInput').value.toLowerCase();
    const items = document.querySelectorAll('.contact-item');
    
    items.forEach(item => {
        const name = item.querySelector('.contact-name')?.textContent.toLowerCase() || '';
        const phone = item.querySelector('.contact-phone')?.textContent.toLowerCase() || '';
        
        if (name.includes(query) || phone.includes(query)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

window.startConversationWithContact = async function(phone) {
    showNotification('Feature coming soon', 'info');
}

// Utility Functions
function formatPhoneForDisplay(phone) {
    if (!phone) return '';
    
    let number = phone;
    if (number.includes('@')) {
        number = number.split('@')[0];
    }
    
    if (number.includes(':')) {
        number = number.split(':')[0];
    }
    
    if (number.length > 15) {
        return `ID: ${number.substring(0, 8)}...`;
    }
    
    if (!number.startsWith('+') && number.length >= 10 && /^\d+$/.test(number)) {
        return '+' + number;
    }
    
    return number;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
    
    return date.toLocaleDateString();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : type === 'warning' ? '#ff9800' : '#2196f3'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

// Media Viewer
window.openMediaViewer = function(url, type) {
    // Simple implementation - open in new tab
    window.open(url, '_blank');
}

// ===== MESSAGE CONTEXT MENU (WhatsApp Style) =====

let longPressTimer = null;
let selectedMessageId = null;
let selectedMessageIsSent = false;

// Handle touch start for long press
window.handleMessageTouchStart = function(event, messageId, isSent) {
    longPressTimer = setTimeout(() => {
        showMessageContextMenu(event, messageId, isSent);
    }, 500); // 500ms long press
}

// Handle touch end to cancel long press
window.handleMessageTouchEnd = function(event) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

// Show context menu for message
window.showMessageContextMenu = function(event, messageId, isSent) {
    event.preventDefault();
    event.stopPropagation();
    
    selectedMessageId = messageId;
    selectedMessageIsSent = isSent;
    
    // Remove any existing context menu
    const existingMenu = document.getElementById('messageContextMenu');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    // Create context menu
    const menu = document.createElement('div');
    menu.id = 'messageContextMenu';
    menu.className = 'message-context-menu';
    
    // Only show edit option for sent messages
    const editOption = isSent ? `
        <button class="context-menu-item" onclick="openEditMessageModal(${messageId})">
            <i class="fas fa-edit"></i>
            <span data-i18n="chat.edit">Edit</span>
        </button>
    ` : '';
    
    menu.innerHTML = `
        <div class="context-menu-overlay" onclick="closeMessageContextMenu()"></div>
        <div class="context-menu-content">
            ${editOption}
            <button class="context-menu-item" onclick="openDeleteMessageModal(${messageId}, ${isSent})">
                <i class="fas fa-trash"></i>
                <span data-i18n="chat.delete">Delete</span>
            </button>
        </div>
    `;
    
    document.body.appendChild(menu);
    
    // Position the menu
    const menuContent = menu.querySelector('.context-menu-content');
    const touch = event.touches ? event.touches[0] : event;
    const x = touch.clientX || touch.pageX;
    const y = touch.clientY || touch.pageY;
    
    menuContent.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    menuContent.style.top = `${Math.min(y, window.innerHeight - 150)}px`;
    
    // Add animation
    setTimeout(() => menu.classList.add('show'), 10);
}

// Close context menu
window.closeMessageContextMenu = function() {
    const menu = document.getElementById('messageContextMenu');
    if (menu) {
        menu.classList.remove('show');
        setTimeout(() => menu.remove(), 200);
    }
}

// Open edit message modal
window.openEditMessageModal = function(messageId) {
    closeMessageContextMenu();
    
    const message = currentMessages.get(messageId);
    if (!message) return;
    
    // Get the content and remove the sender label prefix (*UserName - Store/Department*\n)
    let content = message.message_text || message.body || message.content || '';
    
    // Remove sender label pattern: *Name - Location*\n at the beginning
    const senderLabelPattern = /^\*[^*]+\s*-\s*[^*]+\*\n?/;
    content = content.replace(senderLabelPattern, '').trim();
    
    // Create edit modal
    const modal = document.createElement('div');
    modal.id = 'editMessageModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 data-i18n="chat.edit_message">Edit Message</h2>
                <button class="close-btn" onclick="closeEditMessageModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label data-i18n="chat.message">Message</label>
                    <textarea id="editMessageInput" class="form-control" rows="4">${escapeHtml(content)}</textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeEditMessageModal()" data-i18n="common.cancel">Cancel</button>
                <button class="btn btn-primary" onclick="confirmEditMessage(${messageId})" data-i18n="common.save">Save</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.getElementById('editMessageInput').focus();
}

// Close edit message modal
window.closeEditMessageModal = function() {
    const modal = document.getElementById('editMessageModal');
    if (modal) {
        modal.remove();
    }
}

// Confirm edit message
window.confirmEditMessage = async function(messageId) {
    const input = document.getElementById('editMessageInput');
    const newMessage = input.value.trim();
    
    if (!newMessage) {
        showNotification('Message cannot be empty', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/tenant/conversations/${currentConversationId}/messages/${messageId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newMessage })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Message edited', 'success');
            closeEditMessageModal();
            await loadMessages(currentConversationId);
        } else {
            showNotification(data.message || 'Error editing message', 'error');
        }
    } catch (error) {
        console.error('Error editing message:', error);
        showNotification('Error editing message', 'error');
    }
}

// Open delete message modal
window.openDeleteMessageModal = function(messageId, isSent) {
    closeMessageContextMenu();
    
    // Create delete modal
    const modal = document.createElement('div');
    modal.id = 'deleteMessageModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    
    // Only show "Delete for everyone" option for sent messages
    const deleteForEveryoneOption = isSent ? `
        <button class="delete-option-btn delete-everyone" onclick="confirmDeleteMessage(${messageId}, 'everyone')">
            <i class="fas fa-users"></i>
            <span data-i18n="chat.delete_for_everyone">Delete for everyone</span>
        </button>
    ` : '';
    
    modal.innerHTML = `
        <div class="modal-content delete-modal-content">
            <div class="modal-header">
                <h2 data-i18n="chat.delete_message">Delete Message</h2>
                <button class="close-btn" onclick="closeDeleteMessageModal()">&times;</button>
            </div>
            <div class="modal-body delete-options">
                <button class="delete-option-btn delete-me" onclick="confirmDeleteMessage(${messageId}, 'me')">
                    <i class="fas fa-user"></i>
                    <span data-i18n="chat.delete_for_me">Delete for me</span>
                </button>
                ${deleteForEveryoneOption}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeDeleteMessageModal()" data-i18n="common.cancel">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Close delete message modal
window.closeDeleteMessageModal = function() {
    const modal = document.getElementById('deleteMessageModal');
    if (modal) {
        modal.remove();
    }
}

// Confirm delete message
window.confirmDeleteMessage = async function(messageId, deleteFor) {
    try {
        const response = await fetch(`/api/tenant/conversations/${currentConversationId}/messages/${messageId}?deleteFor=${deleteFor}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(deleteFor === 'everyone' ? 'Message deleted for everyone' : 'Message deleted', 'success');
            closeDeleteMessageModal();
            await loadMessages(currentConversationId);
        } else {
            showNotification(data.message || 'Error deleting message', 'error');
        }
    } catch (error) {
        console.error('Error deleting message:', error);
        showNotification('Error deleting message', 'error');
    }
}

// Socket listeners for real-time message updates
function setupMessageSocketListeners() {
    if (!socket) return;
    
    socket.on('message-edited', (data) => {
        console.log('📝 Message edited:', data);
        if (currentConversationId && data.conversationId === currentConversationId) {
            loadMessages(currentConversationId);
        }
    });
    
    socket.on('message-deleted', (data) => {
        console.log('🗑️ Message deleted for everyone:', data);
        if (currentConversationId && data.conversationId === currentConversationId) {
            loadMessages(currentConversationId);
        }
    });
    
    socket.on('message-deleted-for-me', (data) => {
        console.log('🗑️ Message deleted for me:', data);
        if (currentConversationId && data.conversationId === currentConversationId) {
            // Remove the message from UI
            const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
            if (messageEl) {
                messageEl.remove();
            }
        }
    });
}

// Close context menu when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.message-context-menu') && !e.target.closest('.message')) {
        closeMessageContextMenu();
    }
});
