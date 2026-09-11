let currentMassSendTab = 'history';
let selectedContacts = [];
let currentSendId = null;
let sendingInProgress = false;
let systemTimezone = 'UTC';
let systemDateFormat = 'YYYY-MM-DD';
let systemTimeFormat = '24h';

// Load system timezone settings
async function loadSystemTimezoneSettings() {
  try {
    const response = await fetch('/api/superadmin/settings/timezone');
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        systemTimezone = data.data.timezone || 'UTC';
        systemDateFormat = data.data.date_format || 'YYYY-MM-DD';
        systemTimeFormat = data.data.time_format || '24h';
      }
    }
  } catch (error) {
    console.warn('Could not load system timezone settings, using defaults:', error);
  }
}

// Format date with system timezone
function formatDateWithTimezone(dateString, includeTime = true) {
  if (!dateString) return '-';
  
  try {
    const date = new Date(dateString);
    const options = {
      timeZone: systemTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    };
    
    if (includeTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
      options.hour12 = systemTimeFormat === '12h';
    }
    
    return date.toLocaleString(undefined, options);
  } catch (error) {
    console.warn('Error formatting date:', error);
    return dateString;
  }
}

async function loadMassSend() {
  // Ensure i18n is loaded before rendering
  if (!i18n.isLoaded) {
    const savedLanguage = localStorage.getItem('language') || 'en';
    await i18n.init(savedLanguage);
  }
  
  await loadSystemTimezoneSettings();
  setupMassSendTabs();
  await loadMassHistory();
}

function setupMassSendTabs() {
  const tabButtons = document.querySelectorAll('#mass-send-page .tab-btn');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const tabName = button.getAttribute('data-tab');
      
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      document.querySelectorAll('#mass-send-page .tab-content').forEach(content => {
        content.style.display = 'none';
      });
      
      const tabContent = document.getElementById(tabName);
      if (tabContent) {
        tabContent.style.display = 'block';
      }
      
      currentMassSendTab = tabName.replace('-tab', '');
      
      switch(currentMassSendTab) {
        case 'history':
          await loadMassHistory();
          break;
        case 'schedules':
          await loadMassSchedules();
          break;
        case 'reminders':
          await loadMassReminders();
          break;
      }
    });
  });
}

async function loadMassHistory(archived = false) {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/tenant/mass-send/history?archived=${archived}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error('Failed to load history');

    const data = await response.json();
    renderMassHistory(data.data, archived);
  } catch (error) {
    console.error('Error loading mass history:', error);
    showNotification(i18n.t('mass_send.error_load'), 'error');
  }
}

function renderMassHistory(history, showArchived) {
  const container = document.getElementById('massHistoryContainer');
  
  if (!history || history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p data-i18n="mass_send.no_data">${i18n.t('mass_send.no_data')}</p>
        <button onclick="showMassSendModal('send-now')" class="btn btn-primary">
          <span data-i18n="mass_send.send_now">${i18n.t('mass_send.send_now')}</span>
        </button>
      </div>
    `;
    // Apply translations to dynamically created content
    if (i18n && i18n.translatePage) i18n.translatePage();
    return;
  }

  let html = `
    <div class="mass-send-controls">
      <button onclick="showMassSendModal('send-now')" class="btn btn-primary">
        <span data-i18n="mass_send.send_now">${i18n.t('mass_send.send_now')}</span>
      </button>
      <button onclick="loadMassHistory(${!showArchived})" class="btn btn-secondary">
        <span data-i18n="${showArchived ? 'mass_send.show_active' : 'mass_send.show_archived'}">${showArchived ? i18n.t('mass_send.show_active') : i18n.t('mass_send.show_archived')}</span>
      </button>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th data-i18n="mass_send.name">${i18n.t('mass_send.name')}</th>
            <th data-i18n="mass_send.recipients">${i18n.t('mass_send.recipients')}</th>
            <th data-i18n="mass_send.sent">${i18n.t('mass_send.sent')}</th>
            <th data-i18n="mass_send.failed">${i18n.t('mass_send.failed')}</th>
            <th data-i18n="mass_send.status">${i18n.t('mass_send.status')}</th>
            <th data-i18n="mass_send.actions">${i18n.t('mass_send.actions')}</th>
          </tr>
        </thead>
        <tbody>
  `;

  history.forEach(item => {
    const statusClass = getStatusClass(item.status);
    const statusText = i18n.t(`mass_send.status_${item.status}`);
    
    html += `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${item.total_recipients}</td>
        <td>${item.sent_count}</td>
        <td>${item.failed_count}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          <div class="action-buttons">
            ${item.status === 'pending' ? `
              <button onclick="startMassSend(${item.id})" class="btn btn-sm btn-success" title="${i18n.t('mass_send.start')}">
                ▶️
              </button>
            ` : ''}
            ${item.status === 'sending' ? `
              <button onclick="pauseMassSend(${item.id})" class="btn btn-sm btn-warning" title="${i18n.t('mass_send.pause')}">
                ⏸️
              </button>
            ` : ''}
            ${item.status === 'paused' ? `
              <button onclick="resumeMassSend(${item.id})" class="btn btn-sm btn-success" title="${i18n.t('mass_send.resume')}">
                ▶️
              </button>
              <button onclick="showEditMessageModal(${item.id})" class="btn btn-sm btn-info" title="${i18n.t('mass_send.edit_next')}">
                ✏️
              </button>
              <button onclick="cancelMassSend(${item.id})" class="btn btn-sm btn-danger" title="${i18n.t('mass_send.cancel')}">
                ❌
              </button>
            ` : ''}
            ${item.status === 'completed' || item.status === 'cancelled' ? `
              <button onclick="reuseMassSend(${item.id})" class="btn btn-sm btn-primary" title="${i18n.t('mass_send.reuse')}">
                🔄
              </button>
              <button onclick="archiveMassSend(${item.id})" class="btn btn-sm btn-secondary" title="${i18n.t('mass_send.archive')}">
                📦
              </button>
            ` : ''}
            <button onclick="viewMassSendLogs(${item.id}, 'history')" class="btn btn-sm btn-info" title="${i18n.t('mass_send.view_logs')}">
              📋
            </button>
            ${!item.archived && item.status !== 'sending' ? `
              <button onclick="deleteMassSend(${item.id})" class="btn btn-sm btn-danger" title="${i18n.t('common.delete')}">
                🗑️
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
  
  // Apply translations to dynamically created content
  if (i18n && i18n.translatePage) i18n.translatePage();
}

async function loadMassSchedules() {
  try {
    const response = await fetch('/api/tenant/mass-send/schedules', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) throw new Error('Failed to load schedules');

    const data = await response.json();
    renderMassSchedules(data.data);
  } catch (error) {
    console.error('Error loading schedules:', error);
    showNotification(i18n.t('mass_send.error_load'), 'error');
  }
}

function renderMassSchedules(schedules) {
  const container = document.getElementById('massSchedulesContainer');
  
  if (!schedules || schedules.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p data-i18n="mass_send.no_data">${i18n.t('mass_send.no_data')}</p>
        <button onclick="showMassSendModal('schedule')" class="btn btn-primary">
          <span data-i18n="mass_send.schedule">${i18n.t('mass_send.schedule')}</span>
        </button>
      </div>
    `;
    // Apply translations to dynamically created content
    if (i18n && i18n.translatePage) i18n.translatePage();
    return;
  }

  let html = `
    <div class="mass-send-controls">
      <button onclick="showMassSendModal('schedule')" class="btn btn-primary">
        <span data-i18n="mass_send.schedule">${i18n.t('mass_send.schedule')}</span>
      </button>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th data-i18n="mass_send.name">${i18n.t('mass_send.name')}</th>
            <th data-i18n="mass_send.scheduled_date">${i18n.t('mass_send.scheduled_date')}</th>
            <th data-i18n="mass_send.recipients">${i18n.t('mass_send.recipients')}</th>
            <th data-i18n="mass_send.status">${i18n.t('mass_send.status')}</th>
            <th data-i18n="mass_send.actions">${i18n.t('mass_send.actions')}</th>
          </tr>
        </thead>
        <tbody>
  `;

  schedules.forEach(item => {
    const statusClass = getStatusClass(item.status);
    const statusText = i18n.t(`mass_send.status_${item.status}`);
    // Use system timezone for dates
    const scheduledDate = formatDateWithTimezone(item.scheduled_date, true);
    
    html += `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${scheduledDate}</td>
        <td>${item.total_recipients}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          <div class="action-buttons">
            ${item.status === 'scheduled' ? `
              <button onclick="editSchedule(${item.id})" class="btn btn-sm btn-info" title="${i18n.t('mass_send.edit')}">
                ✏️
              </button>
              <button onclick="cancelSchedule(${item.id})" class="btn btn-sm btn-danger" title="${i18n.t('mass_send.cancel')}">
                ❌
              </button>
            ` : ''}
            <button onclick="viewMassSendLogs(${item.id}, 'schedule')" class="btn btn-sm btn-info" title="${i18n.t('mass_send.view_logs')}">
              📋
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
  
  // Apply translations to dynamically created content
  if (i18n && i18n.translatePage) i18n.translatePage();
}

async function loadMassReminders() {
  try {
    const response = await fetch('/api/tenant/mass-send/reminders', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!response.ok) throw new Error('Failed to load reminders');

    const data = await response.json();
    renderMassReminders(data.data);
  } catch (error) {
    console.error('Error loading reminders:', error);
    showNotification(i18n.t('mass_send.error_load'), 'error');
  }
}

function renderMassReminders(reminders) {
  const container = document.getElementById('massRemindersContainer');
  
  if (!reminders || reminders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p data-i18n="mass_send.no_data">${i18n.t('mass_send.no_data')}</p>
        <button onclick="showMassSendModal('reminder')" class="btn btn-primary">
          <span data-i18n="mass_send.create_reminder">${i18n.t('mass_send.create_reminder')}</span>
        </button>
      </div>
    `;
    // Apply translations to dynamically created content
    if (i18n && i18n.translatePage) i18n.translatePage();
    return;
  }

  let html = `
    <div class="mass-send-controls">
      <button onclick="showMassSendModal('reminder')" class="btn btn-primary">
        <span data-i18n="mass_send.create_reminder">${i18n.t('mass_send.create_reminder')}</span>
      </button>
    </div>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th data-i18n="mass_send.name">${i18n.t('mass_send.name')}</th>
            <th data-i18n="mass_send.final_date">${i18n.t('mass_send.final_date')}</th>
            <th data-i18n="mass_send.next_send">${i18n.t('mass_send.next_send')}</th>
            <th data-i18n="mass_send.total_sent">${i18n.t('mass_send.total_sent')}</th>
            <th data-i18n="mass_send.status">${i18n.t('mass_send.status')}</th>
            <th data-i18n="mass_send.actions">${i18n.t('mass_send.actions')}</th>
          </tr>
        </thead>
        <tbody>
  `;

  reminders.forEach(item => {
    const statusClass = getStatusClass(item.status);
    const statusText = i18n.t(`mass_send.status_${item.status}`);
    // Use system timezone for dates
    const finalDate = formatDateWithTimezone(item.final_date, false);
    const nextSend = item.next_send_at ? formatDateWithTimezone(item.next_send_at, true) : '-';
    
    html += `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${finalDate}</td>
        <td>${nextSend}</td>
        <td>${item.total_sent}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
          <div class="action-buttons">
            ${item.status === 'active' ? `
              <button onclick="cancelReminder(${item.id})" class="btn btn-sm btn-danger" title="${i18n.t('mass_send.cancel')}">
                ❌
              </button>
            ` : ''}
            <button onclick="viewMassSendLogs(${item.id}, 'reminder')" class="btn btn-sm btn-info" title="${i18n.t('mass_send.view_logs')}">
              📋
            </button>
            <button onclick="deleteReminder(${item.id})" class="btn btn-sm btn-danger" title="${i18n.t('common.delete')}">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
  
  // Apply translations to dynamically created content
  if (i18n && i18n.translatePage) i18n.translatePage();
}

function showMassSendModal(type) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'massSendModal';
  
  const title = type === 'send-now' ? i18n.t('mass_send.send_now') :
                type === 'schedule' ? i18n.t('mass_send.schedule') :
                i18n.t('mass_send.create_reminder');
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 1200px;">
      <div class="modal-header">
        <h3>${title}</h3>
        <button onclick="closeMassSendModal()" class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="mass-send-composer">
          <div class="composer-left">
            <div class="form-group">
              <label>${i18n.t('mass_send.name')}:</label>
              <input type="text" id="massSendName" class="form-control" required>
            </div>
            
            <div class="form-group">
              <label>${i18n.t('mass_send.compose_message')}:</label>
              <textarea id="massSendMessage" class="form-control" rows="10" 
                placeholder="${i18n.t('mass_send.message_placeholder')}"
                oninput="updateMassSendPreview()"></textarea>
              <div class="placeholder-hints">
                <small>
                  <strong>${i18n.t('mass_send.placeholders') || 'Placeholders'}:</strong> 
                  <span class="placeholder-tag" onclick="insertPlaceholder('{{customer_name}}')" style="cursor:pointer;color:#007bff;text-decoration:underline;">{{customer_name}}</span>, 
                  <span class="placeholder-tag" onclick="insertPlaceholder('{phone}')" style="cursor:pointer;color:#007bff;text-decoration:underline;">{phone}</span>, 
                  <span class="placeholder-tag" onclick="insertPlaceholder('{email}')" style="cursor:pointer;color:#007bff;text-decoration:underline;">{email}</span>
                  ${type === 'reminder' ? ', <span class="placeholder-tag" onclick="insertPlaceholder(\'{remaining-days}\')" style="cursor:pointer;color:#007bff;text-decoration:underline;">{remaining-days}</span>' : ''}
                </small>
              </div>
            </div>
            
            <div class="form-group">
              <label>${i18n.t('mass_send.select_recipients')}:</label>
              <button onclick="selectMassSendContacts()" class="btn btn-secondary">
                📞 ${i18n.t('contacts.select_contact_group')}
              </button>
              <div id="selectedContactsCount" class="mt-2"></div>
            </div>
            
            <div class="form-group">
              <label>${i18n.t('mass_send.send_interval')}:</label>
              <input type="number" id="massSendInterval" class="form-control" 
                value="70" min="70" max="300">
              <small>${i18n.t('mass_send.min_interval')}</small>
            </div>
            
            ${type === 'schedule' ? `
              <div class="form-group">
                <label>${i18n.t('mass_send.scheduled_date')}:</label>
                <input type="datetime-local" id="scheduledDate" class="form-control" required>
                <small>${i18n.t('mass_send.max_30_days')}</small>
              </div>
            ` : ''}
            
            ${type === 'reminder' ? `
              <div class="form-group">
                <label>${i18n.t('mass_send.final_date')}:</label>
                <input type="date" id="finalDate" class="form-control" required>
              </div>
              
              <div class="form-group">
                <label>${i18n.t('mass_send.reminder_dates')}:</label>
                <div id="reminderDatesContainer">
                  <div class="reminder-date-item">
                    <input type="number" class="form-control reminder-days" placeholder="${i18n.t('mass_send.days_before')}" 
                      min="1" max="30" value="3" style="width: 100px;">
                    <span>${i18n.t('mass_send.days_before')}</span>
                    <input type="time" class="form-control reminder-time" value="09:00" style="width: 120px; margin-left: 10px;">
                  </div>
                </div>
                <button onclick="addReminderDate()" class="btn btn-sm btn-secondary mt-2">
                  + ${i18n.t('mass_send.add_reminder_date')}
                </button>
                <small>${i18n.t('mass_send.max_7_reminders')}</small>
              </div>
            ` : ''}
          </div>
          
          <div class="composer-right">
            <div class="whatsapp-preview">
              <div class="preview-header">
                <span>${i18n.t('mass_send.whatsapp_preview')}</span>
              </div>
              <div class="preview-body">
                <div class="whatsapp-message">
                  <div id="previewMessage" class="message-bubble">
                    ${i18n.t('mass_send.message_placeholder')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="closeMassSendModal()" class="btn btn-secondary">
          ${i18n.t('common.cancel')}
        </button>
        <button onclick="submitMassSend('${type}')" class="btn btn-primary">
          ${title}
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'block';
  
  if (type === 'schedule') {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    document.getElementById('scheduledDate').min = now.toISOString().slice(0, 16);
    
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    document.getElementById('scheduledDate').max = maxDate.toISOString().slice(0, 16);
  }
  
  if (type === 'reminder') {
    const today = new Date().toISOString().split('T')[0];
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    
    document.getElementById('finalDate').min = today;
    document.getElementById('finalDate').max = maxDate.toISOString().split('T')[0];
  }
}

function closeMassSendModal() {
  const modal = document.getElementById('massSendModal');
  if (modal) {
    modal.remove();
  }
  selectedContacts = [];
}

function insertPlaceholder(placeholder) {
  const textarea = document.getElementById('massSendMessage');
  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + placeholder + text.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + placeholder.length;
    textarea.focus();
    updateMassSendPreview();
  }
}

function updateMassSendPreview() {
  const message = document.getElementById('massSendMessage').value;
  const preview = document.getElementById('previewMessage');
  
  if (message.trim()) {
    let previewText = message;
    previewText = previewText.replace(/\{\{customer_name\}\}/g, 'João Silva');
    previewText = previewText.replace(/{phone}/g, '+5511999999999');
    previewText = previewText.replace(/{email}/g, 'joao@example.com');
    previewText = previewText.replace(/{remaining-days}/g, '5');
    
    preview.textContent = previewText;
  } else {
    preview.textContent = i18n.t('mass_send.message_placeholder');
  }
}

async function selectMassSendContacts() {
  try {
    // Load contacts
    const contactsResponse = await fetch('/api/tenant/contacts', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (!contactsResponse.ok) {
      console.error('Contacts response not OK:', contactsResponse.status);
      throw new Error('Failed to load contacts');
    }

    const contactsData = await contactsResponse.json();
    console.log('Contacts data received:', contactsData);
    
    // Try different possible response formats
    let contacts = [];
    if (Array.isArray(contactsData)) {
      contacts = contactsData;
    } else if (contactsData.contacts && Array.isArray(contactsData.contacts)) {
      contacts = contactsData.contacts;
    } else if (contactsData.data && Array.isArray(contactsData.data)) {
      contacts = contactsData.data;
    }
    
    console.log('Parsed contacts:', contacts.length, contacts);

    // Load groups
    let groups = [];
    try {
      const groupsResponse = await fetch('/api/tenant/contact-groups', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (groupsResponse.ok) {
        const groupsData = await groupsResponse.json();
        console.log('Groups data received:', groupsData);
        
        if (Array.isArray(groupsData)) {
          groups = groupsData;
        } else if (groupsData.groups && Array.isArray(groupsData.groups)) {
          groups = groupsData.groups;
        } else if (groupsData.data && Array.isArray(groupsData.data)) {
          groups = groupsData.data;
        }
      }
    } catch (groupError) {
      console.warn('Could not load groups:', groupError);
    }
    
    console.log('Parsed groups:', groups.length, groups);
    showContactSelectionModal(contacts, groups);
  } catch (error) {
    console.error('Error loading contacts:', error);
    showNotification(i18n.t('error.error_loading_contacts'), 'error');
  }
}

function showContactSelectionModal(contacts, groups) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'contactSelectionModal';
  
  modal.innerHTML = `
    <div class="modal-content modal-lg">
      <div class="modal-header">
        <h3>${i18n.t('mass_send.select_recipients')}</h3>
        <button onclick="closeContactSelectionModal()" class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <!-- Selection Method Tabs -->
        <div class="tabs">
          <button class="tab-btn active" data-tab="individual-tab" onclick="switchContactTab('individual')">
            ${i18n.t('mass_send.individual_contacts')}
          </button>
          <button class="tab-btn" data-tab="groups-tab" onclick="switchContactTab('groups')">
            ${i18n.t('mass_send.contact_groups')}
          </button>
          <button class="tab-btn" data-tab="manual-tab" onclick="switchContactTab('manual')">
            ${i18n.t('mass_send.manual_list')}
          </button>
        </div>

        <!-- Individual Contacts Tab -->
        <div id="individual-tab" class="tab-content active" style="display: block;">
          <div class="form-group">
            <input type="text" id="contactSearchInput" class="form-control" 
              placeholder="${i18n.t('contacts.search')}" 
              oninput="filterContactSelection()">
          </div>
          <div class="contact-list" id="contactSelectionList">
            ${contacts.length > 0 ? contacts.map(contact => `
              <label class="contact-item">
                <input type="checkbox" class="contact-checkbox" value="${contact.phone}" 
                  data-name="${escapeHtml(contact.name)}"
                  data-email="${contact.email || ''}"
                  ${selectedContacts.some(c => c.phone === contact.phone) ? 'checked' : ''}>
                <span>${escapeHtml(contact.name)} (${contact.phone})</span>
              </label>
            `).join('') : `<p>${i18n.t('contacts.no_contacts') || 'No contacts available'}</p>`}
          </div>
        </div>

        <!-- Groups Tab -->
        <div id="groups-tab" class="tab-content" style="display: none;">
          <div class="contact-list" id="groupSelectionList">
            ${groups && groups.length > 0 ? groups.map(group => `
              <label class="contact-item">
                <input type="checkbox" class="group-checkbox" value="${group.id}" 
                  data-group-name="${escapeHtml(group.name)}">
                <span>${escapeHtml(group.name)} (${group.contact_count || 0} ${i18n.t('mass_send.recipients')})</span>
              </label>
            `).join('') : `<p>${i18n.t('contacts.no_groups') || 'No groups available'}</p>`}
          </div>
        </div>

        <!-- Manual List Tab -->
        <div id="manual-tab" class="tab-content" style="display: none;">
          <div class="form-group">
            <label for="manualPhoneList">
              ${i18n.t('mass_send.enter_phones')}
            </label>
            <textarea id="manualPhoneList" class="form-control" rows="10"></textarea>
            <small class="text-muted">
              ${i18n.t('mass_send.phone_format_hint')}
            </small>
          </div>
        </div>

        <div class="selected-count" id="selectedCountDisplay" style="margin-top: 15px; font-weight: bold;">
          ${selectedContacts.length} ${i18n.t('mass_send.selected_contacts')}
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="closeContactSelectionModal()" class="btn btn-secondary">
          ${i18n.t('common.cancel')}
        </button>
        <button onclick="confirmContactSelection()" class="btn btn-primary">
          ${i18n.t('common.confirm')}
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'block';
  
  // Store contacts and groups for later use
  window.massContactsData = contacts;
  window.massGroupsData = groups;
}

function closeContactSelectionModal() {
  const modal = document.getElementById('contactSelectionModal');
  if (modal) {
    modal.remove();
  }
}

function filterContactSelection() {
  const searchTerm = document.getElementById('contactSearchInput').value.toLowerCase();
  const items = document.querySelectorAll('.contact-item');
  
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(searchTerm) ? 'block' : 'none';
  });
}

function switchContactTab(tabName) {
  // Update tab buttons
  const tabButtons = document.querySelectorAll('#contactSelectionModal .tab-btn');
  tabButtons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tab') === `${tabName}-tab`) {
      btn.classList.add('active');
    }
  });

  // Update tab content
  const tabContents = document.querySelectorAll('#contactSelectionModal .tab-content');
  tabContents.forEach(content => {
    content.style.display = 'none';
    content.classList.remove('active');
  });

  const activeTab = document.getElementById(`${tabName}-tab`);
  if (activeTab) {
    activeTab.style.display = 'block';
    activeTab.classList.add('active');
  }
}

async function confirmContactSelection() {
  selectedContacts = [];
  
  // Get individual contacts
  const contactCheckboxes = document.querySelectorAll('.contact-checkbox:checked');
  contactCheckboxes.forEach(cb => {
    selectedContacts.push({
      phone: cb.value,
      name: cb.getAttribute('data-name'),
      email: cb.getAttribute('data-email')
    });
  });
  
  // Get contacts from groups
  const groupCheckboxes = document.querySelectorAll('.group-checkbox:checked');
  if (groupCheckboxes.length > 0) {
    for (const cb of groupCheckboxes) {
      const groupId = cb.value;
      try {
        let response = await fetch(`/api/tenant/contact-groups/${groupId}/contacts`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (!response.ok) {
          response = await fetch(`/api/tenant/contacts?group_id=${groupId}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
        }
        
        if (response.ok) {
          const data = await response.json();
          console.log('Group contacts data:', data);
          
          let groupContacts = [];
          if (Array.isArray(data)) {
            groupContacts = data;
          } else if (data.contacts && Array.isArray(data.contacts)) {
            groupContacts = data.contacts;
          } else if (data.data && Array.isArray(data.data)) {
            groupContacts = data.data;
          }
          
          groupContacts.forEach(contact => {
            // Avoid duplicates
            if (!selectedContacts.some(c => c.phone === contact.phone)) {
              selectedContacts.push({
                phone: contact.phone,
                name: contact.name,
                email: contact.email || ''
              });
            }
          });
        }
      } catch (error) {
        console.error('Error loading group contacts:', error);
      }
    }
  }
  
  // Get manual phone list
  const manualList = document.getElementById('manualPhoneList');
  if (manualList && manualList.value.trim()) {
    const phones = manualList.value.split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    phones.forEach(phone => {
      // Remove non-numeric characters
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        // Avoid duplicates
        if (!selectedContacts.some(c => c.phone === cleanPhone)) {
          selectedContacts.push({
            phone: cleanPhone,
            name: cleanPhone,
            email: ''
          });
        }
      }
    });
  }
  
  const countDiv = document.getElementById('selectedContactsCount');
  if (countDiv) {
    countDiv.innerHTML = `<strong>${selectedContacts.length}</strong> ${i18n.t('mass_send.selected_contacts')}`;
  }
  
  closeContactSelectionModal();
}

function addReminderDate() {
  const container = document.getElementById('reminderDatesContainer');
  const items = container.querySelectorAll('.reminder-date-item');
  
  if (items.length >= 7) {
    showNotification(i18n.t('mass_send.max_7_reminders'), 'warning');
    return;
  }
  
  const newItem = document.createElement('div');
  newItem.className = 'reminder-date-item';
  newItem.innerHTML = `
    <input type="number" class="form-control reminder-days" placeholder="${i18n.t('mass_send.days_before')}" 
      min="1" max="30" style="width: 100px;">
    <span>${i18n.t('mass_send.days_before')}</span>
    <input type="time" class="form-control reminder-time" value="09:00" style="width: 120px; margin-left: 10px;">
    <button onclick="this.parentElement.remove()" class="btn btn-sm btn-danger" style="margin-left: 10px;">×</button>
  `;
  
  container.appendChild(newItem);
}

async function submitMassSend(type) {
  const name = document.getElementById('massSendName').value.trim();
  const message = document.getElementById('massSendMessage').value.trim();
  const interval = parseInt(document.getElementById('massSendInterval').value);
  
  if (!name || !message) {
    showNotification(i18n.t('mass_send.no_message'), 'error');
    return;
  }
  
  if (selectedContacts.length === 0) {
    showNotification(i18n.t('mass_send.no_recipients'), 'error');
    return;
  }
  
  if (interval < 70) {
    showNotification(i18n.t('mass_send.invalid_interval'), 'error');
    return;
  }
  
  const payload = {
    name,
    message,
    recipients: selectedContacts,
    sendInterval: interval
  };
  
  let endpoint = '/api/tenant/mass-send/history';
  
  if (type === 'schedule') {
    const scheduledDate = document.getElementById('scheduledDate').value;
    if (!scheduledDate) {
      showNotification(i18n.t('mass_send.invalid_date'), 'error');
      return;
    }
    payload.scheduledDate = scheduledDate;
    endpoint = '/api/tenant/mass-send/schedule';
  } else if (type === 'reminder') {
    const finalDateInput = document.getElementById('finalDate');
    console.log('Final date input element:', finalDateInput);
    
    const finalDate = finalDateInput?.value;
    console.log('Final date value:', finalDate);
    
    if (!finalDate) {
      showNotification(i18n.t('mass_send.invalid_date'), 'error');
      return;
    }
    
    const reminderItems = document.querySelectorAll('#reminderDatesContainer .reminder-date-item');
    console.log('Reminder items found:', reminderItems.length);
    
    const daysBefore = Array.from(reminderItems).map(item => {
      const daysInput = item.querySelector('.reminder-days');
      const timeInput = item.querySelector('.reminder-time');
      const days = parseInt(daysInput?.value);
      const time = timeInput?.value || '09:00';
      console.log('Processing reminder item:', { days, time, daysInput, timeInput });
      return { days, time };
    }).filter(item => !isNaN(item.days) && item.days > 0);
    
    console.log('Days before after filter:', daysBefore);
    
    if (daysBefore.length === 0) {
      showNotification(i18n.t('mass_send.no_reminder_dates'), 'error');
      return;
    }
    
    payload.finalDate = finalDate;
    payload.daysBefore = daysBefore;
    endpoint = '/api/tenant/mass-send/reminder';
    
    console.log('Sending reminder payload:', payload);
  }
  
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) throw new Error('Failed to create mass send');
    
    const data = await response.json();
    
    const successMsg = type === 'send-now' ? 'mass_send.success_created' :
                       type === 'schedule' ? 'mass_send.success_scheduled' :
                       'mass_send.success_reminder';
    
    showNotification(i18n.t(successMsg), 'success');
    closeMassSendModal();
    
    if (type === 'send-now') {
      await loadMassHistory();
      if (data.data && data.data.id) {
        startMassSend(data.data.id);
      }
    } else if (type === 'schedule') {
      await loadMassSchedules();
    } else {
      await loadMassReminders();
    }
  } catch (error) {
    console.error('Error creating mass send:', error);
    showNotification(i18n.t('mass_send.error_create'), 'error');
  }
}

async function startMassSend(id) {
  currentSendId = id;
  sendingInProgress = true;
  
  if (typeof io !== 'undefined') {
    // Get tenant ID from token
    const token = localStorage.getItem('token');
    let tenantId = null;
    
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        tenantId = payload.tenantId;
      } catch (e) {
        console.error('Error decoding token:', e);
      }
    }
    
    if (!tenantId) {
      showNotification('Tenant ID not found', 'error');
      sendingInProgress = false;
      return;
    }
    
    // Connect to tenant namespace
    const socket = io(`/tenant/${tenantId}`);
    
    socket.on('connect', () => {
      console.log('Connected to tenant namespace for mass send');
      socket.emit('start-mass-send', { sendId: id });
    });
    
    socket.on('mass-send-progress', (data) => {
      if (data.sendId === id) {
        updateSendProgress(data);
      }
    });
    
    socket.on('mass-send-complete', (data) => {
      if (data.sendId === id) {
        sendingInProgress = false;
        loadMassHistory();
        showNotification(i18n.t('mass_send.status_completed'), 'success');
        socket.disconnect();
      }
    });

    socket.on('mass-send-error', (data) => {
      showNotification(data.error, 'error');
      sendingInProgress = false;
      loadMassHistory();
      socket.disconnect();
    });
    
    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      showNotification('Connection error: ' + error.message, 'error');
      sendingInProgress = false;
    });
  }
}

function updateSendProgress(data) {
  console.log('Send progress:', data);
}

async function pauseMassSend(id) {
  try {
    const response = await fetch(`/api/tenant/mass-send/history/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ status: 'paused' })
    });
    
    if (!response.ok) throw new Error('Failed to pause');
    
    showNotification(i18n.t('mass_send.status_paused'), 'success');
    await loadMassHistory();
  } catch (error) {
    console.error('Error pausing send:', error);
    showNotification(i18n.t('mass_send.error_update'), 'error');
  }
}

async function resumeMassSend(id) {
  try {
    const response = await fetch(`/api/tenant/mass-send/history/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ status: 'sending' })
    });
    
    if (!response.ok) throw new Error('Failed to resume');
    
    showNotification(i18n.t('mass_send.status_sending'), 'success');
    await loadMassHistory();
    startMassSend(id);
  } catch (error) {
    console.error('Error resuming send:', error);
    showNotification(i18n.t('mass_send.error_update'), 'error');
  }
}

async function cancelMassSend(id) {
  if (!window.showCustomConfirm) {
    if (!confirm(i18n.t('mass_send.confirm_cancel'))) return;
  } else {
    const confirmed = await window.showCustomConfirm(i18n.t('mass_send.confirm_cancel'));
    if (!confirmed) return;
  }
  
  try {
    const response = await fetch(`/api/tenant/mass-send/history/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ status: 'cancelled' })
    });
    
    if (!response.ok) throw new Error('Failed to cancel');
    
    showNotification(i18n.t('mass_send.success_cancelled'), 'success');
    await loadMassHistory();
  } catch (error) {
    console.error('Error cancelling send:', error);
    showNotification(i18n.t('mass_send.error_update'), 'error');
  }
}

async function archiveMassSend(id) {
  if (!window.showCustomConfirm) {
    if (!confirm(i18n.t('mass_send.confirm_archive'))) return;
  } else {
    const confirmed = await window.showCustomConfirm(i18n.t('mass_send.confirm_archive'));
    if (!confirmed) return;
  }
  
  try {
    const response = await fetch(`/api/tenant/mass-send/history/${id}/archive`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to archive');
    
    showNotification(i18n.t('mass_send.success_archived'), 'success');
    await loadMassHistory();
  } catch (error) {
    console.error('Error archiving:', error);
    showNotification(i18n.t('mass_send.error_update'), 'error');
  }
}

async function deleteMassSend(id) {
  if (!window.showCustomConfirm) {
    if (!confirm(i18n.t('mass_send.confirm_delete'))) return;
  } else {
    const confirmed = await window.showCustomConfirm(i18n.t('mass_send.confirm_delete'));
    if (!confirmed) return;
  }
  
  try {
    const response = await fetch(`/api/tenant/mass-send/history/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to delete');
    
    showNotification(i18n.t('mass_send.success_deleted'), 'success');
    await loadMassHistory();
  } catch (error) {
    console.error('Error deleting:', error);
    showNotification(i18n.t('mass_send.error_delete'), 'error');
  }
}

async function reuseMassSend(id) {
  try {
    const response = await fetch(`/api/tenant/mass-send/history?id=${id}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to load');
    
    const data = await response.json();
    const item = data.data.find(i => i.id === id);
    
    if (item) {
      selectedContacts = item.recipients ? JSON.parse(item.recipients) : [];
      showMassSendModal('send-now');
      
      setTimeout(() => {
        document.getElementById('massSendName').value = item.name + ' (Copy)';
        document.getElementById('massSendMessage').value = item.message;
        document.getElementById('massSendInterval').value = item.send_interval;
        document.getElementById('selectedContactsCount').innerHTML = 
          `<strong>${selectedContacts.length}</strong> ${i18n.t('mass_send.selected_contacts')}`;
        updateMassSendPreview();
      }, 100);
    }
  } catch (error) {
    console.error('Error reusing send:', error);
    showNotification(i18n.t('mass_send.error_load'), 'error');
  }
}

function showEditMessageModal(id) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'editMessageModal';
  
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>${i18n.t('mass_send.edit_next')}</h3>
        <button onclick="closeEditMessageModal()" class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>${i18n.t('mass_send.message')}:</label>
          <textarea id="editedMessage" class="form-control" rows="10"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="closeEditMessageModal()" class="btn btn-secondary">
          ${i18n.t('common.cancel')}
        </button>
        <button onclick="saveEditedMessage(${id})" class="btn btn-primary">
          ${i18n.t('common.save')}
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'block';
}

function closeEditMessageModal() {
  const modal = document.getElementById('editMessageModal');
  if (modal) {
    modal.remove();
  }
}

async function saveEditedMessage(id) {
  const message = document.getElementById('editedMessage').value.trim();
  
  if (!message) {
    showNotification(i18n.t('mass_send.no_message'), 'error');
    return;
  }
  
  try {
    const response = await fetch(`/api/tenant/mass-send/history/${id}/message`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ message })
    });
    
    if (!response.ok) throw new Error('Failed to update message');
    
    showNotification(i18n.t('mass_send.success_updated'), 'success');
    closeEditMessageModal();
    await loadMassHistory();
  } catch (error) {
    console.error('Error updating message:', error);
    showNotification(i18n.t('mass_send.error_update'), 'error');
  }
}

async function cancelSchedule(id) {
  if (!window.showCustomConfirm) {
    if (!confirm(i18n.t('mass_send.confirm_cancel'))) return;
  } else {
    const confirmed = await window.showCustomConfirm(i18n.t('mass_send.confirm_cancel'));
    if (!confirmed) return;
  }
  
  try {
    const response = await fetch(`/api/tenant/mass-send/schedule/${id}/cancel`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to cancel schedule');
    
    showNotification(i18n.t('mass_send.success_cancelled'), 'success');
    await loadMassSchedules();
  } catch (error) {
    console.error('Error cancelling schedule:', error);
    showNotification(i18n.t('mass_send.error_update'), 'error');
  }
}

async function cancelReminder(id) {
  if (!window.showCustomConfirm) {
    if (!confirm(i18n.t('mass_send.confirm_cancel'))) return;
  } else {
    const confirmed = await window.showCustomConfirm(i18n.t('mass_send.confirm_cancel'));
    if (!confirmed) return;
  }
  
  try {
    const response = await fetch(`/api/tenant/mass-send/reminder/${id}/cancel`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to cancel reminder');
    
    showNotification(i18n.t('mass_send.success_cancelled'), 'success');
    await loadMassReminders();
  } catch (error) {
    console.error('Error cancelling reminder:', error);
    showNotification(i18n.t('mass_send.error_update'), 'error');
  }
}

async function deleteReminder(id) {
  if (!window.showCustomConfirm) {
    if (!confirm(i18n.t('mass_send.confirm_delete'))) return;
  } else {
    const confirmed = await window.showCustomConfirm(i18n.t('mass_send.confirm_delete'));
    if (!confirmed) return;
  }
  
  try {
    const response = await fetch(`/api/tenant/mass-send/reminder/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to delete reminder');
    
    showNotification(i18n.t('mass_send.success_deleted'), 'success');
    await loadMassReminders();
  } catch (error) {
    console.error('Error deleting reminder:', error);
    showNotification(i18n.t('mass_send.error_delete'), 'error');
  }
}

async function viewMassSendLogs(id, type) {
  try {
    const response = await fetch(`/api/tenant/mass-send/logs/${type}/${id}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to load logs');
    
    const data = await response.json();
    showLogsModal(data.data);
  } catch (error) {
    console.error('Error loading logs:', error);
    showNotification(i18n.t('mass_send.error_load'), 'error');
  }
}

function showLogsModal(logs) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'logsModal';
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 900px;">
      <div class="modal-header">
        <h3 data-i18n="mass_send.logs">${i18n.t('mass_send.logs')}</h3>
        <button onclick="closeLogsModal()" class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th data-i18n="mass_send.phone">${i18n.t('mass_send.phone')}</th>
                <th data-i18n="mass_send.status">${i18n.t('mass_send.status')}</th>
                <th data-i18n="mass_send.sent_at">${i18n.t('mass_send.sent_at')}</th>
                <th data-i18n="mass_send.error">${i18n.t('mass_send.error')}</th>
              </tr>
            </thead>
            <tbody>
              ${logs && logs.length > 0 ? logs.map(log => `
                <tr>
                  <td>${log.phone_number}</td>
                  <td><span class="status-badge ${getStatusClass(log.status)}">${i18n.t(`mass_send.status_${log.status}`)}</span></td>
                  <td>${log.sent_at ? formatDateWithTimezone(log.sent_at, true) : '-'}</td>
                  <td>${log.error_message || '-'}</td>
                </tr>
              `).join('') : `<tr><td colspan="4" style="text-align:center;" data-i18n="mass_send.no_data">${i18n.t('mass_send.no_data')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button onclick="closeLogsModal()" class="btn btn-secondary">
          <span data-i18n="common.close">${i18n.t('common.close')}</span>
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'block';
  
  // Apply translations to dynamically created content
  if (i18n && i18n.translatePage) i18n.translatePage();
}

function closeLogsModal() {
  const modal = document.getElementById('logsModal');
  if (modal) {
    modal.remove();
  }
}

function getStatusClass(status) {
  const statusClasses = {
    pending: 'status-warning',
    sending: 'status-info',
    paused: 'status-warning',
    completed: 'status-success',
    cancelled: 'status-danger',
    failed: 'status-danger',
    scheduled: 'status-info',
    active: 'status-success',
    success: 'status-success'
  };
  return statusClasses[status] || 'status-secondary';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function editSchedule(id) {
  showNotification('Edit schedule feature coming soon', 'info');
}


// Register page handler
if (typeof window.pageHandlers === 'undefined') {
  window.pageHandlers = {};
}

window.pageHandlers['mass-send'] = function() {
  console.log('Mass Send handler called');
  // Check if feature is enabled before loading
  if (typeof checkFeatureEnabled === 'function') {
    checkFeatureEnabled('mass_send').then(enabled => {
      if (enabled) {
        loadMassSend();
      }
    });
  } else {
    loadMassSend();
  }
};
