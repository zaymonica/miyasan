/**
 * WhatsApp Cloud Integration - Simple User Module
 * Integrates WhatsApp Cloud conversations into existing user panel
 * Shows Cloud + Web accounts in dropdown, filters conversations by selected account
 */

const WhatsAppCloudSimple = {
  state: {
    accounts: [], // All accounts (Cloud + Web)
    selectedAccountId: null,
    selectedAccountType: null, // 'cloud' or 'web'
    conversations: [],
    initialized: false
  },

  async init() {
    if (this.state.initialized) return;
    
    console.log('🚀 Initializing WhatsApp Cloud Simple...');
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      console.log('⏳ Waiting for DOM...');
      return;
    }
    
    // Load accounts (Cloud + Web)
    await this.loadAccounts();
    
    // Add account selector to UI
    this.addAccountSelector();
    
    // Initialize WebSocket for notifications
    this.initWebSocket();
    
    this.state.initialized = true;
    console.log('✅ WhatsApp Cloud Simple initialized');
  },

  async loadAccounts() {
    try {
      const token = localStorage.getItem('token');
      
      console.log('🔍 Loading accounts...', { hasToken: !!token });
      
      // Always add WhatsApp Web account first (existing system)
      const webAccount = {
        id: 'web_default',
        name: 'WhatsApp Web',
        type: 'web',
        icon: 'fab fa-whatsapp',
        color: '#128c7e'
      };
      
      this.state.accounts = [webAccount];
      
      // Try to load WhatsApp Cloud accounts
      try {
        const cloudResponse = await fetch('/api/user/whatsapp-cloud/conversations', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log('📡 Cloud response status:', cloudResponse.status);
        
        if (cloudResponse.ok) {
          const cloudData = await cloudResponse.json();
          console.log('📦 Cloud data:', cloudData);
          
          // Get unique accounts from conversations
          if (cloudData.success && cloudData.data && cloudData.data.length > 0) {
            const accountMap = new Map();
            cloudData.data.forEach(conv => {
              if (!accountMap.has(conv.account_id)) {
                accountMap.set(conv.account_id, {
                  id: `cloud_${conv.account_id}`,
                  name: conv.account_name || 'WhatsApp Cloud',
                  type: 'cloud',
                  realId: conv.account_id,
                  icon: 'fab fa-whatsapp',
                  color: '#25d366'
                });
              }
            });
            
            // Add Cloud accounts after Web
            this.state.accounts.push(...accountMap.values());
          }
        } else {
          console.warn('⚠️ Failed to load Cloud accounts:', cloudResponse.status, cloudResponse.statusText);
        }
      } catch (cloudError) {
        console.warn('⚠️ Error loading Cloud accounts (non-fatal):', cloudError.message);
      }
      
      console.log('✅ Accounts loaded:', this.state.accounts);
      
      // Select Web by default (since it always exists)
      if (this.state.accounts.length > 0) {
        this.selectAccount(this.state.accounts[0].id);
      }
    } catch (error) {
      console.error('❌ Error in loadAccounts:', error);
      
      // Fallback: at least show Web account
      this.state.accounts = [{
        id: 'web_default',
        name: 'WhatsApp Web',
        type: 'web',
        icon: 'fab fa-whatsapp',
        color: '#128c7e'
      }];
      
      this.selectAccount(this.state.accounts[0].id);
    }
  },

  addAccountSelector() {
    // Find the header where we'll add the selector
    const header = document.querySelector('.whatsapp-header .header-right');
    if (!header) {
      console.warn('⚠️ Header not found, cannot add account selector');
      return;
    }
    
    console.log('✅ Adding account selector to header');
    
    // Create account selector dropdown
    const selector = document.createElement('div');
    selector.className = 'account-selector';
    selector.innerHTML = `
      <button class="account-selector-btn" id="accountSelectorBtn">
        <i class="fas fa-plus-circle"></i>
        <span>Select Account</span>
        <i class="fas fa-chevron-down"></i>
      </button>
      <div class="account-selector-dropdown" id="accountSelectorDropdown" style="display: none;">
        ${this.renderAccountOptions()}
      </div>
    `;
    
    // Insert at the beginning of header-right (before other buttons)
    header.insertBefore(selector, header.firstChild);
    
    console.log('✅ Account selector added');
    
    // Add event listeners
    const btn = document.getElementById('accountSelectorBtn');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleAccountDropdown();
      });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.account-selector')) {
        this.closeAccountDropdown();
      }
    });
  },

  renderAccountOptions() {
    return this.state.accounts.map(account => `
      <button class="account-option ${this.state.selectedAccountId === account.id ? 'active' : ''}" 
              data-account-id="${account.id}"
              onclick="WhatsAppCloudSimple.selectAccount('${account.id}')">
        <i class="${account.icon}" style="color: ${account.color}"></i>
        <span>${account.name}</span>
        ${account.type === 'cloud' ? '<span class="account-badge">Cloud</span>' : '<span class="account-badge web">Web</span>'}
      </button>
    `).join('');
  },

  toggleAccountDropdown() {
    const dropdown = document.getElementById('accountSelectorDropdown');
    if (dropdown) {
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    }
  },

  closeAccountDropdown() {
    const dropdown = document.getElementById('accountSelectorDropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
    }
  },

  selectAccount(accountId) {
    const account = this.state.accounts.find(a => a.id === accountId);
    if (!account) return;
    
    this.state.selectedAccountId = accountId;
    this.state.selectedAccountType = account.type;
    
    // Update button text
    const btn = document.getElementById('accountSelectorBtn');
    if (btn) {
      btn.innerHTML = `
        <i class="${account.icon}" style="color: ${account.color}"></i>
        <span>${account.name}</span>
        <i class="fas fa-chevron-down"></i>
      `;
    }
    
    // Update dropdown active state
    const dropdown = document.getElementById('accountSelectorDropdown');
    if (dropdown) {
      dropdown.innerHTML = this.renderAccountOptions();
    }
    
    // Close dropdown
    this.closeAccountDropdown();
    
    // Load conversations for selected account
    this.loadConversationsForAccount();
    
    console.log('Account selected:', account);
  },

  async loadConversationsForAccount() {
    if (this.state.selectedAccountType === 'web') {
      // Load existing WhatsApp Web conversations
      this.showWebConversations();
      if (typeof loadConversations === 'function') {
        await loadConversations();
      }
    } else if (this.state.selectedAccountType === 'cloud') {
      // Load WhatsApp Cloud conversations in pipeline format
      this.showCloudPipeline();
    }
  },

  showWebConversations() {
    // Hide pipeline, show default conversation list
    if (typeof WhatsAppCloudPipeline !== 'undefined') {
      WhatsAppCloudPipeline.hide();
    }
    
    const conversationsList = document.getElementById('conversationsList');
    if (conversationsList) {
      conversationsList.style.display = 'block';
    }
  },

  showCloudPipeline() {
    // Show pipeline for Cloud conversations
    if (typeof WhatsAppCloudPipeline !== 'undefined') {
      WhatsAppCloudPipeline.show();
    }
  },

  initWebSocket() {
    if (typeof socket === 'undefined') return;
    
    // Listen for Cloud messages when on Web
    socket.on('whatsapp-cloud:new-message', (data) => {
      if (this.state.selectedAccountType === 'web') {
        this.showCrossNotification('cloud', data);
      }
    });
    
    // Listen for Web messages when on Cloud
    socket.on('new-message', (data) => {
      if (this.state.selectedAccountType === 'cloud') {
        this.showCrossNotification('web', data);
      }
    });
  },

  showCrossNotification(sourceType, data) {
    // Show notification with red pulsing badge
    const notification = document.createElement('div');
    notification.className = 'cross-notification';
    notification.innerHTML = `
      <div class="cross-notification-content">
        <span class="pulse-badge"></span>
        <i class="fab fa-whatsapp"></i>
        <div>
          <strong>New message in WhatsApp ${sourceType === 'cloud' ? 'Cloud' : 'Web'}</strong>
          <p>${data.contactName || data.contactPhone}</p>
        </div>
        <button onclick="WhatsAppCloudSimple.switchToAccount('${sourceType}')">
          View
        </button>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  },

  switchToAccount(type) {
    const account = this.state.accounts.find(a => a.type === type);
    if (account) {
      this.selectAccount(account.id);
    }
  }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM loaded, initializing WhatsApp Cloud Simple...');
    setTimeout(() => WhatsAppCloudSimple.init(), 1000); // Wait 1s for other scripts
  });
} else {
  console.log('📄 DOM already loaded, initializing WhatsApp Cloud Simple...');
  setTimeout(() => WhatsAppCloudSimple.init(), 1000); // Wait 1s for other scripts
}

// Export for global access
window.WhatsAppCloudSimple = WhatsAppCloudSimple;
