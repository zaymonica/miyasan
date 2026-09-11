/**
 * WhatsApp Cloud Pipeline - User View
 * COPIED FROM ADMIN MODEL - Exact same drag-and-drop functionality
 */

const WhatsAppCloudPipeline = {
  state: {
    conversations: [],
    stages: [
      { id: 'new', name: 'New', icon: 'fas fa-star', color: '#3b82f6' },
      { id: 'contacted', name: 'Contacted', icon: 'fas fa-phone', color: '#8b5cf6' },
      { id: 'qualified', name: 'Qualified', icon: 'fas fa-check-circle', color: '#10b981' },
      { id: 'proposal', name: 'Proposal', icon: 'fas fa-file-invoice', color: '#f59e0b' },
      { id: 'won', name: 'Won', icon: 'fas fa-trophy', color: '#22c55e' }
    ],
    draggedCard: null,
    draggedColumn: null,
    currentConversation: null,
    initialized: false,
    userName: '',
    storeId: null,
    departmentId: null,
    storeName: '',
    departmentName: ''
  },

  init() {
    if (this.state.initialized) {
      console.log('Pipeline already initialized, just rendering...');
      this.render();
      return;
    }
    
    console.log('🚀 Initializing WhatsApp Cloud Pipeline...');
    
    this.loadUserContext();
    
    // Load conversations
    this.loadConversations();
    
    // Initialize drag and drop
    this.initDragAndDrop();
    
    this.state.initialized = true;
    console.log('✅ WhatsApp Cloud Pipeline initialized');
  },

  async loadConversations() {
    try {
      console.log('📥 Loading Cloud conversations...');
      const token = localStorage.getItem('token');
      const response = await fetch('/api/user/whatsapp-cloud/conversations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      console.log('📡 Response status:', response.status);
      
      const result = await response.json();
      console.log('📦 Result:', result);
      
      if (result.success && result.data) {
        this.state.conversations = result.data.map(conv => ({
          id: conv.id,
          name: conv.contact_name || conv.contact_phone,
          phone: conv.contact_phone,
          avatar: conv.contact_profile_pic,
          lastMessage: conv.last_message_text,
          timestamp: new Date(conv.last_message_time).getTime(),
          stageId: conv.pipeline_stage || 'new',
          unreadCount: conv.unread_count,
          isClaimed: conv.claimed_by_user_id !== null,
          claimedByMe: conv.claimed_by_user_id === this.getCurrentUserId(),
          claimedByName: conv.claimed_by_name,
          tags: conv.tags ? JSON.parse(conv.tags) : [],
          priority: conv.priority
        }));
        
        console.log('✅ Loaded', this.state.conversations.length, 'conversations');
        this.render();
      } else {
        console.warn('⚠️ No conversations or API error:', result);
        this.state.conversations = [];
        this.render();
      }
    } catch (error) {
      console.error('❌ Error loading conversations:', error);
      this.state.conversations = [];
      this.render();
    }
  },

  getCurrentUserId() {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.id;
    } catch (e) {
      return null;
    }
  },

  render() {
    const conversationsList = document.getElementById('conversationsList');
    if (!conversationsList) {
      console.error('❌ conversationsList element not found!');
      return;
    }
    
    console.log('🎨 Rendering pipeline with', this.state.conversations.length, 'conversations');
    
    // Replace conversation list with pipeline
    conversationsList.innerHTML = this.renderPipeline();
  },

  renderPipeline() {
    const stages = this.state.stages;
    const cards = this.state.conversations;

    return `
      <div class="wc-pipeline-container">
        <div class="wc-pipeline-header">
          <div class="wc-pipeline-title-section">
            <h2 class="wc-pipeline-title">${this.getUserHeaderTitle()}</h2>
            <p class="wc-pipeline-subtitle">Drag and drop cards to move conversations between stages</p>
          </div>
        </div>
        
        <div class="wc-pipeline-board" id="wcPipelineBoard">
          ${stages.map(stage => this.renderPipelineColumn(stage, cards.filter(c => c.stageId === stage.id))).join('')}
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
        </div>
        <div class="wc-pipeline-column-body" data-stage-id="${stage.id}">
          ${cards.map(card => this.renderPipelineCard(card)).join('')}
        </div>
      </div>
    `;
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

  renderPipelineCard(card) {
    return `
      <div class="wc-pipeline-card ${card.isClaimed && !card.claimedByMe ? 'claimed-by-other' : ''} ${card.claimedByMe ? 'claimed-by-me' : ''}" 
           draggable="true" 
           data-card-id="${card.id}">
        ${card.isClaimed && !card.claimedByMe ? `
          <div class="wc-card-claimed-indicator">
            <i class="fas fa-lock"></i>
            <span>${card.claimedByName}</span>
          </div>
        ` : ''}
        ${card.claimedByMe ? `
          <div class="wc-card-viewing-indicator">
            <i class="fas fa-eye"></i>
            <span>You're viewing</span>
          </div>
        ` : ''}
        <div class="wc-pipeline-card-header">
          <div class="wc-pipeline-card-avatar">
            ${card.avatar ? `<img src="${card.avatar}" alt="${card.name}">` : `<span>${card.name.charAt(0).toUpperCase()}</span>`}
            ${card.unreadCount > 0 ? `<span class="wc-unread-badge">${card.unreadCount}</span>` : ''}
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

  truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
  },

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

  // ============================================
  // DRAG AND DROP - COPIED FROM ADMIN
  // ============================================

  initDragAndDrop() {
    const page = document.getElementById('conversationsList');
    if (!page) return;

    console.log('🎯 Initializing drag and drop...');

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
    });

    console.log('✅ Drag and drop initialized');
  },

  // ============================================
  // PIPELINE METHODS - COPIED FROM ADMIN
  // ============================================

  moveCard(cardId, newStageId) {
    const card = this.state.conversations.find(c => c.id === cardId);
    if (card && card.stageId !== newStageId) {
      const oldStage = this.state.stages.find(s => s.id === card.stageId);
      const newStage = this.state.stages.find(s => s.id === newStageId);
      
      card.stageId = newStageId;
      
      // Update in backend
      this.updateConversationStage(cardId, newStageId);
      
      this.render();
      this.notify('success', 'Conversation moved successfully');
    }
  },

  async updateConversationStage(conversationId, newStage) {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/user/whatsapp-cloud/conversations/${conversationId}/stage`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ stage: newStage })
      });
      
      const result = await response.json();
      if (result.success) {
        console.log('✅ Stage updated in backend');
      }
    } catch (error) {
      console.error('❌ Error updating stage:', error);
    }
  },

  reorderColumn(draggedStageId, targetStageId) {
    if (draggedStageId === targetStageId) return;

    const stages = this.state.stages;
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

  saveState() {
    try {
      localStorage.setItem('wc_pipeline_column_order', JSON.stringify(this.state.stages.map(s => s.id)));
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
  },

  notify(type, message) {
    console.log(`[${type}] ${message}`);
    // TODO: Integrate with existing notification system
  },

  // Called when account is switched
  show() {
    console.log('👁️ Showing Cloud pipeline...');
    this.init();
    this.loadConversations(); // Force reload
    const conversationsList = document.getElementById('conversationsList');
    if (conversationsList) {
      conversationsList.style.display = 'block';
    }
  },

  // Called when switching away from Cloud
  hide() {
    const conversationsList = document.getElementById('conversationsList');
    if (conversationsList) {
      conversationsList.innerHTML = ''; // Clear pipeline
    }
  }
};

// Export for global access
window.WhatsAppCloudPipeline = WhatsAppCloudPipeline;
