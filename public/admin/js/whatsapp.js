/**
 * WhatsApp Page JavaScript
 * Handles WhatsApp connection, QR code, and messaging
 */

// Socket.IO connection
let socket = null;
let lastKnownStatus = null;
let autoReconnectAttempts = 0;
const MAX_AUTO_RECONNECT_ATTEMPTS = 3;

/**
 * Initialize WhatsApp page
 */
function initWhatsAppPage() {
  console.log('Initializing WhatsApp page');
  
  // Initialize Socket.IO FIRST (to receive QR immediately)
  initSocket();
  
  // Load initial status
  loadWhatsAppStatus();
  
  // Load bot settings
  loadBotSettings();
  
  // Check connection status periodically (30 seconds to avoid rate limiting)
  setInterval(loadWhatsAppStatus, 30000); // Every 30 seconds
  
  // Try auto-reconnect after a short delay (give server time to restore sessions)
  setTimeout(() => {
    tryAutoReconnect();
  }, 3000); // Wait 3 seconds before trying auto-reconnect
}

/**
 * Initialize Socket.IO connection
 */
function initSocket() {
  if (socket) return;
  
  // Get tenant ID first
  const tenantId = getTenantId();
  
  if (!tenantId) {
    console.error('No tenant ID found');
    return;
  }

  // Connect to tenant-specific namespace
  socket = io(`/tenant/${tenantId}`, {
    transports: ['websocket', 'polling']
  });

  console.log(`Connecting to Socket.IO namespace: /tenant/${tenantId}`);

  // Listen for QR code (receives QR code string directly, like 2.0)
  socket.on('qr-code', (qrCode) => {
    console.log('QR code received:', qrCode ? 'Yes' : 'No');
    console.log('QR code length:', qrCode ? qrCode.length : 0);
    if (qrCode) {
      console.log('QR code starts with:', qrCode.substring(0, 30) + '...');
    }
    displayQRCode(qrCode);
  });

  // Listen for connection status
  socket.on('connection-status', (data) => {
    console.log('Connection status received', data);
    updateConnectionStatus(data.status, data.phoneNumber);
  });

  // Listen for new messages
  socket.on('new-message', (data) => {
    console.log('New message received', data);
    // Messages are now handled in the dedicated conversations page
    // Emit a custom event for any page that wants to listen
    if (typeof window.onNewWhatsAppMessage === 'function') {
      window.onNewWhatsAppMessage(data);
    }
  });

  // Listen for QR status
  socket.on('qr-status', (data) => {
    console.log('QR status', data);
    if (data.status === 'max_attempts_reached') {
      Notification.error('Maximum QR generation attempts reached. Please try again.');
      hideQRCode();
    }
  });

  socket.on('connect', () => {
    console.log('Socket.IO connected');
  });

  socket.on('disconnect', () => {
    console.log('Socket.IO disconnected');
  });
}

/**
 * Get tenant ID from JWT token
 */
function getTenantId() {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No token found in localStorage');
      return null;
    }

    // Decode JWT token (without verification - just to read payload)
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const decoded = JSON.parse(jsonPayload);
    console.log('Decoded token:', decoded);
    
    return decoded.tenantId || null;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
}

/**
 * Load WhatsApp connection status
 */
async function loadWhatsAppStatus() {
  try {
    const response = await fetch('/api/tenant/whatsapp/status', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('WhatsApp status loaded:', data);
      
      const currentStatus = data.data?.status || data.status;
      const phoneNumber = data.data?.phoneNumber || data.phoneNumber;
      
      // Detect disconnection and try auto-reconnect
      if (lastKnownStatus === 'connected' && currentStatus === 'disconnected') {
        console.log('Detected disconnection, attempting auto-reconnect...');
        tryAutoReconnect();
      }
      
      lastKnownStatus = currentStatus;
      updateConnectionStatus(currentStatus, phoneNumber);
      
      // Check for QR code in response
      if (data.data?.qr || data.qr) {
        const qrCode = data.data?.qr || data.qr;
        console.log('QR code found in status response, displaying...');
        displayQRCode(qrCode);
      }
    }
  } catch (error) {
    console.error('Error loading WhatsApp status:', error);
  }
}

/**
 * Try to auto-reconnect WhatsApp if session exists
 */
async function tryAutoReconnect() {
  // Check if we've exceeded max attempts
  if (autoReconnectAttempts >= MAX_AUTO_RECONNECT_ATTEMPTS) {
    console.log('Max auto-reconnect attempts reached');
    return;
  }
  
  try {
    console.log(`Auto-reconnect attempt ${autoReconnectAttempts + 1}/${MAX_AUTO_RECONNECT_ATTEMPTS}`);
    
    // Check if there's a saved session
    const statusResponse = await fetch('/api/tenant/whatsapp/status', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!statusResponse.ok) {
      console.log('Failed to check status for auto-reconnect');
      return;
    }
    
    const statusData = await statusResponse.json();
    const currentStatus = statusData.data?.status || statusData.status;
    
    // If already connected or connecting, no need to reconnect
    if (currentStatus === 'connected') {
      console.log('Already connected, no need to auto-reconnect');
      autoReconnectAttempts = 0;
      return;
    }
    
    if (currentStatus === 'connecting') {
      console.log('Already connecting, skipping auto-reconnect');
      return;
    }
    
    // Only auto-reconnect if disconnected
    if (currentStatus !== 'disconnected') {
      console.log('Not disconnected, skipping auto-reconnect');
      return;
    }
    
    autoReconnectAttempts++;
    
    // Show reconnecting message (subtle, not intrusive)
    const info = document.getElementById('whatsapp-connection-info');
    if (info) {
      info.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Checking for saved session...</p>';
    }
    
    // Attempt to reconnect
    const response = await fetch('/api/tenant/whatsapp/connect', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('Auto-reconnect response:', data);

    if (response.ok) {
      console.log('Auto-reconnect successful');
      
      // Wait a moment for connection to establish
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check status again
      const finalStatusResponse = await fetch('/api/tenant/whatsapp/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (finalStatusResponse.ok) {
        const finalData = await finalStatusResponse.json();
        const finalStatus = finalData.data?.status || finalData.status;
        const phoneNumber = finalData.data?.phoneNumber || finalData.phoneNumber;
        
        if (finalStatus === 'connected') {
          console.log('Session restored successfully!');
          autoReconnectAttempts = 0; // Reset counter on success
          updateConnectionStatus('connected', phoneNumber);
          
          // Show subtle success notification
          if (typeof Notification !== 'undefined') {
            Notification.success('WhatsApp reconnected automatically');
          }
        } else {
          console.log('Reconnection initiated but not connected yet');
          updateConnectionStatus(finalStatus, phoneNumber);
        }
      }
    } else {
      console.log('Auto-reconnect failed:', data.error);
      // Silently fail - don't bother user with auto-reconnect failures
      updateConnectionStatus('disconnected');
    }
  } catch (error) {
    console.error('Error during auto-reconnect:', error);
    updateConnectionStatus('disconnected');
  }
}

/**
 * Connect WhatsApp
 */
async function connectWhatsApp() {
  try {
    const btn = document.getElementById('btn-connect-whatsapp');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span data-i18n="whatsapp.connecting">Connecting...</span>';

    const response = await fetch('/api/tenant/whatsapp/connect', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    console.log('Connect response:', data);

    if (response.ok) {
      Notification.success(data.message || 'Connection initiated. Please scan the QR code.');
      updateConnectionStatus('connecting');
      
      // Check if QR code is in the response
      if (data.data?.qr) {
        console.log('QR code found in connect response, displaying...');
        displayQRCode(data.data.qr);
      } else {
        console.log('No QR code in connect response, polling for QR...');
        // Poll for QR code every 2 seconds for up to 30 seconds
        pollForQRCode();
      }
    } else {
      Notification.error(data.error || 'Failed to connect WhatsApp');
      btn.disabled = false;
      btn.innerHTML = '<i class="fab fa-whatsapp"></i> <span data-i18n="whatsapp.connect">Connect WhatsApp</span>';
    }
  } catch (error) {
    console.error('Error connecting WhatsApp:', error);
    Notification.error('Error connecting WhatsApp');
    const btn = document.getElementById('btn-connect-whatsapp');
    btn.disabled = false;
    btn.innerHTML = '<i class="fab fa-whatsapp"></i> <span data-i18n="whatsapp.connect">Connect WhatsApp</span>';
  }
}

/**
 * Poll for QR code after connection initiated
 */
let qrPollInterval = null;
let qrPollAttempts = 0;
const MAX_QR_POLL_ATTEMPTS = 15; // 15 attempts x 2 seconds = 30 seconds max

async function pollForQRCode() {
  // Clear any existing poll
  if (qrPollInterval) {
    clearInterval(qrPollInterval);
  }
  
  qrPollAttempts = 0;
  
  qrPollInterval = setInterval(async () => {
    qrPollAttempts++;
    console.log(`Polling for QR code... attempt ${qrPollAttempts}/${MAX_QR_POLL_ATTEMPTS}`);
    
    try {
      const response = await fetch('/api/tenant/whatsapp/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const qrCode = data.data?.qr || data.qr;
        
        if (qrCode) {
          console.log('QR code found via polling!');
          displayQRCode(qrCode);
          clearInterval(qrPollInterval);
          qrPollInterval = null;
          return;
        }
        
        // Check if already connected
        const status = data.data?.status || data.status;
        if (status === 'connected') {
          console.log('Already connected, stopping QR poll');
          clearInterval(qrPollInterval);
          qrPollInterval = null;
          return;
        }
      }
    } catch (error) {
      console.error('Error polling for QR:', error);
    }
    
    // Stop after max attempts
    if (qrPollAttempts >= MAX_QR_POLL_ATTEMPTS) {
      console.log('Max QR poll attempts reached');
      clearInterval(qrPollInterval);
      qrPollInterval = null;
    }
  }, 2000); // Poll every 2 seconds
}

/**
 * Disconnect WhatsApp
 */
async function disconnectWhatsApp() {
  const proceed = async () => {
    try {
      const response = await fetch('/api/tenant/whatsapp/disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (response.ok) {
        Notification.success('WhatsApp disconnected successfully');
        updateConnectionStatus('disconnected');
      } else {
        Notification.error(data.error || 'Failed to disconnect WhatsApp');
      }
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error);
      Notification.error('Error disconnecting WhatsApp');
    }
  };

  if (typeof Modal !== 'undefined' && Modal.confirm) {
    Modal.confirm('common.confirm', 'Are you sure you want to disconnect WhatsApp?', proceed);
    return;
  }
  if (!confirm('Are you sure you want to disconnect WhatsApp?')) {
    return;
  }
  await proceed();
}

/**
 * Clear WhatsApp session
 */
async function clearWhatsAppSession() {
  const proceed = async () => {
    try {
      const response = await fetch('/api/tenant/whatsapp/session', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        Notification.success('Session cleared successfully');
        updateConnectionStatus('disconnected');
        hideQRCode();
      } else {
        Notification.error(data.error || 'Failed to clear session');
      }
    } catch (error) {
      console.error('Error clearing session:', error);
      Notification.error('Error clearing session');
    }
  };

  if (typeof Modal !== 'undefined' && Modal.confirm) {
    Modal.confirm('common.confirm', 'This will clear your WhatsApp session. You will need to scan the QR code again. Continue?', proceed);
    return;
  }
  if (!confirm('This will clear your WhatsApp session. You will need to scan the QR code again. Continue?')) {
    return;
  }
  await proceed();
}

/**
 * Send WhatsApp message
 */
async function sendWhatsAppMessage(event) {
  event.preventDefault();

  const phone = document.getElementById('message-phone').value;
  const message = document.getElementById('message-text').value;

  if (!phone || !message) {
    Notification.error('Please fill in all fields');
    return;
  }

  try {
    const response = await fetch('/api/tenant/whatsapp/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phoneNumber: phone, message })
    });

    const data = await response.json();
    console.log('Send message response:', data);

    // Check both response.ok and data.success
    if (response.ok && data.success !== false) {
      Notification.success('Message sent successfully');
      document.getElementById('send-message-form').reset();
      // Note: Recent messages are now handled in the dedicated conversations page
    } else {
      const errorMsg = data.error || data.message || 'Failed to send message';
      console.error('Failed to send message:', errorMsg);
      Notification.error(errorMsg);
    }
  } catch (error) {
    console.error('Error sending message:', error);
    Notification.error('Connection error: ' + error.message);
  }
}

/**
 * Update connection status UI
 */
function updateConnectionStatus(status, phoneNumber = null) {
  const badge = document.getElementById('whatsapp-status-badge');
  const info = document.getElementById('whatsapp-connection-info');
  const btnConnect = document.getElementById('btn-connect-whatsapp');
  const btnDisconnect = document.getElementById('btn-disconnect-whatsapp');
  const sendCard = document.getElementById('send-message-card');

  // Update badge
  badge.className = 'status-badge status-' + status;
  
  let statusText = 'Disconnected';
  let statusIcon = 'fa-circle';
  
  switch(status) {
    case 'connected':
      statusText = 'Connected';
      statusIcon = 'fa-check-circle';
      break;
    case 'connecting':
      statusText = 'Connecting...';
      statusIcon = 'fa-spinner fa-spin';
      break;
    case 'disconnected':
      statusText = 'Disconnected';
      statusIcon = 'fa-circle';
      break;
  }
  
  badge.innerHTML = `<i class="fas ${statusIcon}"></i> <span>${statusText}</span>`;

  // Update info
  if (status === 'connected' && phoneNumber) {
    info.innerHTML = `<p><strong>Connected as:</strong> ${phoneNumber}</p>`;
    btnConnect.style.display = 'none';
    btnDisconnect.style.display = 'inline-block';
    sendCard.style.display = 'block';
    hideQRCode();
  } else if (status === 'connecting') {
    info.innerHTML = '<p>Connecting to WhatsApp... Please scan the QR code.</p>';
    btnConnect.style.display = 'none';
    btnDisconnect.style.display = 'none';
    sendCard.style.display = 'none';
  } else {
    info.innerHTML = '<p>WhatsApp is not connected. Click the button below to connect.</p>';
    btnConnect.style.display = 'inline-block';
    btnConnect.disabled = false;
    btnConnect.innerHTML = '<i class="fab fa-whatsapp"></i> <span>Connect WhatsApp</span>';
    btnDisconnect.style.display = 'none';
    sendCard.style.display = 'none';
    hideQRCode();
  }
}

/**
 * Display QR code (adapted from 2.0 version)
 */
function displayQRCode(qrCode) {
  console.log('displayQRCode called with:', qrCode ? 'QR CODE' : 'NULL');
  
  const container = document.getElementById('qr-code-container');
  console.log('Container found:', !!container);
  
  if (!container) {
    console.error('qr-code-container not found in DOM!');
    return;
  }

  if (qrCode) {
    console.log('Displaying QR Code image');
    const image = document.getElementById('qr-code-image');
    if (image) {
      image.src = qrCode;
      container.style.display = 'block';
      console.log('QR Code displayed successfully');
    } else {
      console.error('qr-code-image element not found!');
    }
  } else {
    console.log('Hiding QR Code (connected or null)');
    container.style.display = 'none';
  }
}

/**
 * Hide QR code
 */
function hideQRCode() {
  const container = document.getElementById('qr-code-container');
  if (container) {
    container.style.display = 'none';
  }
}

/* Removed - Messages and Contacts features moved to dedicated pages
 * These functions are kept commented for future reference
 * 
async function loadRecentMessages() { ... }
function displayMessages(messages) { ... }
function addMessageToList(message) { ... }
async function loadContacts() { ... }
function displayContacts(contacts) { ... }
*/

/**
 * Format date
 */
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  // Check if date is valid
  if (isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleString();
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Load bot settings
 */
async function loadBotSettings() {
  try {
    const response = await fetch('/api/tenant/bot-settings', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Bot settings loaded:', data);
      
      if (data.success && data.data) {
        const botToggle = document.getElementById('bot-enabled-toggle');
        const groupToggle = document.getElementById('group-enabled-toggle');
        
        if (botToggle) {
          botToggle.checked = data.data.bot_enabled;
        }
        if (groupToggle) {
          groupToggle.checked = data.data.group_enabled;
        }
      }
    }
  } catch (error) {
    console.error('Error loading bot settings:', error);
  }
}

/**
 * Toggle bot setting
 * @param {string} setting - Setting name (bot_enabled or group_enabled)
 * @param {boolean} value - New value
 */
async function toggleBotSetting(setting, value) {
  try {
    const response = await fetch('/api/tenant/bot-settings', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ [setting]: value })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      const settingName = setting === 'bot_enabled' ? 'Auto-Reply Bot' : 'Group Responses';
      const status = value ? 'enabled' : 'disabled';
      Notification.success(`${settingName} ${status}`);
    } else {
      Notification.error(data.error || 'Failed to update setting');
      // Revert toggle
      loadBotSettings();
    }
  } catch (error) {
    console.error('Error updating bot setting:', error);
    Notification.error('Error updating setting');
    // Revert toggle
    loadBotSettings();
  }
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('whatsapp-page')) {
      initWhatsAppPage();
    }
  });
} else {
  if (document.getElementById('whatsapp-page')) {
    initWhatsAppPage();
  }
}
