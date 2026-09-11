/**
 * WhatsApp Cloud Chat View
 * Full conversation view with message thread and contact info sidebar
 */

const WhatsAppCloudChat = {
  state: {
    currentConversation: null,
    messages: [],
    activeTab: 'message', // 'message' or 'internal_note'
    isOpen: false
  },

  async open(conversationId) {
    try {
      // Load conversation details
      await this.loadConversation(conversationId);
      
      // Load messages
      await this.loadMessages(conversationId);
      
      // Show chat view
      this.show();
      
      this.state.isOpen = true;
    } catch (error) {
      console.error('Error opening chat:', error);
    }
  },

  async loadConversation(conversationId) {
    const conv = WhatsAppCloudPipeline.state.conversations.find(c => c.id === parseInt(conversationId));
    if (conv) {
      this.state.currentConversation = conv;
    }
  },

  async loadMessages(conversationId) {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/user/whatsapp-cloud/conversations/${conversationId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const result = await response.json();
      
      if (result.success && result.data) {
        this.state.messages = result.data;
        this.renderMessages();
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  },

  show() {
    const conversationsList = document.getElementById('conversationsList');
    if (!conversationsList) return;
    
    // Replace pipeline with chat view
    conversationsList.innerHTML = this.render();
    
    // Attach event listeners
    this.attachEventListeners();
    
    // Scroll to bottom
    this.scrollToBottom();
  },

  render() {
    const conv = this.state.currentConversation;
    if (!conv) return '';

    return `
      <div class="wc-chat-layout">
        <!-- Left: Conversation List (keep visible) -->
        <div class="wc-conversations-sidebar">
          ${this.renderSidebar()}
        </div>
        
        <!-- Center: Chat Thread -->
        <div class="wc-chat-main">
          <!-- Header -->
          <div class="wc-chat-header">
            <div class="wc-chat-header-left">
              <button class="wc-back-btn" onclick="WhatsAppCloudChat.close()">
                <i class="fas fa-arrow-left"></i>
              </button>
              <div class="wc-chat-avatar">
                ${conv.avatar ? `<img src="${conv.avatar}" alt="${conv.name}">` : `<span>${conv.name.charAt(0).toUpperCase()}</span>`}
              </div>
              <div class="wc-chat-contact-info">
                <h3>${conv.name}</h3>
                <p>${conv.phone}</p>
              </div>
            </div>
            <div class="wc-chat-header-right">
              <button class="wc-header-btn" title="Search">
                <i class="fas fa-search"></i>
              </button>
              <button class="wc-header-btn" title="More">
                <i class="fas fa-ellipsis-v"></i>
              </button>
            </div>
          </div>
          
          <!-- Messages -->
          <div class="wc-chat-messages" id="wcChatMessages">
            ${this.renderMessagesContent()}
          </div>
          
          <!-- Input Area -->
          <div class="wc-chat-input-area">
            <!-- Tabs -->
            <div class="wc-chat-tabs">
              <button class="wc-chat-tab ${this.state.activeTab === 'message' ? 'active' : ''}" 
                      onclick="WhatsAppCloudChat.switchTab('message')">
                Message
              </button>
              <button class="wc-chat-tab ${this.state.activeTab === 'internal_note' ? 'active' : ''}"
                      onclick="WhatsAppCloudChat.switchTab('internal_note')">
                Internal Note
              </button>
            </div>
            
            <!-- Input -->
            <div class="wc-chat-input">
              <button class="wc-input-btn" title="Quick replies">
                <i class="fas fa-bolt"></i>
              </button>
              <button class="wc-input-btn" title="Attach">
                <i class="fas fa-paperclip"></i>
              </button>
              <button class="wc-input-btn" title="Emoji">
                <i class="far fa-smile"></i>
              </button>
              <input type="text" 
                     id="wcMessageInput" 
                     placeholder="${this.state.activeTab === 'message' ? 'Type a message or / for shortcuts' : 'Add an internal note...'}"
                     onkeypress="if(event.key==='Enter') WhatsAppCloudChat.sendMessage()">
              <button class="wc-input-btn" title="Voice">
                <i class="fas fa-microphone"></i>
              </button>
            </div>
          </div>
        </div>
        
        <!-- Right: Contact Info Sidebar -->
        <div class="wc-chat-sidebar">
          ${this.renderContactSidebar()}
        </div>
      </div>
    `;
  },

  renderSidebar() {
    // Reuse the conversation list from pipeline
    return WhatsAppCloudPipeline.renderConversationList();
  },

  renderMessagesContent() {
    if (this.state.messages.length === 0) {
      return `
        <div class="wc-messages-empty">
          <i class="fas fa-comments"></i>
          <p>No messages yet</p>
        </div>
      `;
    }

    let html = '';
    let lastDate = null;

    this.state.messages.forEach(msg => {
      const msgDate = new Date(msg.timestamp).toLocaleDateString();
      
      // Add date separator
      if (msgDate !== lastDate) {
        html += `<div class="wc-date-separator">${this.formatDate(msg.timestamp)}</div>`;
        lastDate = msgDate;
      }

      // Add message
      html += this.renderMessage(msg);
    });

    return html;
  },

  renderMessage(msg) {
    const isOutbound = msg.direction === 'outbound';
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isAutomation = msg.is_automation || false; // Check if it's from automation
    const senderName = msg.sent_by_name || msg.sender_name || '';
    const senderDepartment = msg.sent_by_department || '';
    const senderStore = msg.sent_by_store || '';
    const senderLocation = [senderStore, senderDepartment].filter(Boolean).join(' / ');
    const senderLabel = senderName && senderLocation ? `${senderName} - ${senderLocation}` : senderName;
    const senderHeader = isOutbound && senderLabel ? `<div class="wc-message-sender">${senderLabel}</div>` : '';

    return `
      <div class="wc-message ${isOutbound ? 'outbound' : 'inbound'}">
        ${isAutomation ? `
          <div class="wc-automation-badge">
            <i class="fas fa-robot"></i>
            Automation
          </div>
        ` : ''}
        <div class="wc-message-bubble">
          ${senderHeader}
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
        ${!isOutbound && msg.sent_by_name ? `
          <div class="wc-message-sender">${msg.sent_by_name}</div>
        ` : ''}
      </div>
    `;
  },

  renderMessageContent(msg) {
    if (msg.message_type === 'text') {
      return `<p class="wc-message-text">${this.escapeHtml(msg.text_content)}</p>`;
    }
    // Add other message types as needed
    return `<p class="wc-message-text">${msg.text_content || '[Media]'}</p>`;
  },

  renderContactSidebar() {
    const conv = this.state.currentConversation;
    if (!conv) return '';

    return `
      <div class="wc-sidebar-section">
        <div class="wc-sidebar-avatar-large">
          ${conv.avatar ? `<img src="${conv.avatar}" alt="${conv.name}">` : `<span>${conv.name.charAt(0).toUpperCase()}</span>`}
        </div>
        <h3 class="wc-sidebar-name">${conv.name}</h3>
        <div class="wc-sidebar-contact-item">
          <i class="fas fa-user"></i>
          <span>${conv.name}</span>
        </div>
        <div class="wc-sidebar-contact-item">
          <i class="fas fa-phone"></i>
          <span>${conv.phone}</span>
        </div>
      </div>

      <div class="wc-sidebar-section">
        <div class="wc-sidebar-section-header">
          <i class="fas fa-tags"></i>
          <span>Tags</span>
          <button class="wc-sidebar-add-btn">
            <i class="fas fa-plus"></i>
            Add tag
          </button>
        </div>
        <div class="wc-sidebar-tags">
          ${conv.tags && conv.tags.length > 0 ? 
            conv.tags.map(tag => `<span class="wc-sidebar-tag">${tag} <i class="fas fa-times"></i></span>`).join('') :
            '<p class="wc-sidebar-empty-text">No tags added</p>'
          }
        </div>
      </div>

      <div class="wc-sidebar-section">
        <div class="wc-sidebar-section-header">
          <i class="fas fa-user-tie"></i>
          <span>Assign Agent</span>
        </div>
        <select class="wc-sidebar-select">
          <option value="">Select agent...</option>
        </select>
      </div>

      <div class="wc-sidebar-section">
        <div class="wc-sidebar-section-header">
          <i class="fas fa-chart-line"></i>
          <span>Pipeline Stage</span>
        </div>
        <select class="wc-sidebar-select">
          <option value="new" ${conv.stage === 'new' ? 'selected' : ''}>New</option>
          <option value="contacted" ${conv.stage === 'contacted' ? 'selected' : ''}>Contacted</option>
          <option value="qualified" ${conv.stage === 'qualified' ? 'selected' : ''}>Qualified</option>
          <option value="proposal" ${conv.stage === 'proposal' ? 'selected' : ''}>Proposal</option>
          <option value="negotiation" ${conv.stage === 'negotiation' ? 'selected' : ''}>Negotiation</option>
          <option value="won" ${conv.stage === 'won' ? 'selected' : ''}>Won</option>
          <option value="lost" ${conv.stage === 'lost' ? 'selected' : ''}>Lost</option>
        </select>
      </div>

      <div class="wc-sidebar-section">
        <div class="wc-sidebar-section-header">
          <i class="fas fa-sticky-note"></i>
          <span>Notes</span>
        </div>
        <textarea class="wc-sidebar-textarea" placeholder="Add notes here..."></textarea>
      </div>

      <div class="wc-sidebar-section">
        <div class="wc-sidebar-section-header">
          <i class="fas fa-folder"></i>
          <span>Media Files</span>
        </div>
        <div class="wc-sidebar-media">
          <p class="wc-sidebar-empty-text">No files shared</p>
        </div>
      </div>
    `;
  },

  formatDate(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  attachEventListeners() {
    // Already attached via onclick in HTML
  },

  switchTab(tab) {
    this.state.activeTab = tab;
    this.show(); // Re-render
  },

  async sendMessage() {
    const input = document.getElementById('wcMessageInput');
    const text = input.value.trim();
    
    if (!text) return;

    try {
      const token = localStorage.getItem('token');
      const endpoint = this.state.activeTab === 'message' 
        ? `/api/user/whatsapp-cloud/conversations/${this.state.currentConversation.id}/send-message`
        : `/api/user/whatsapp-cloud/conversations/${this.state.currentConversation.id}/internal-note`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(this.state.activeTab === 'message' ? { message: text } : { note: text })
      });

      const result = await response.json();
      
      if (result.success) {
        input.value = '';
        await this.loadMessages(this.state.currentConversation.id);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  },

  scrollToBottom() {
    setTimeout(() => {
      const messages = document.getElementById('wcChatMessages');
      if (messages) {
        messages.scrollTop = messages.scrollHeight;
      }
    }, 100);
  },

  close() {
    this.state.isOpen = false;
    this.state.currentConversation = null;
    this.state.messages = [];
    
    // Show pipeline again
    WhatsAppCloudPipeline.show();
  }
};

// Export for global access
window.WhatsAppCloudChat = WhatsAppCloudChat;
