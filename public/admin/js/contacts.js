/**
 * Contacts Management
 * Handles contact and group operations
 */

let currentContacts = [];
let currentGroups = [];
let selectedGroupId = null;

/**
 * Load contacts page
 */
async function loadContactsPage() {
  try {
    await Promise.all([loadGroups(), loadContacts()]);
  } catch (error) {
    console.error('Error loading contacts page:', error);
    showNotification('Error loading contacts', 'error');
  }
}

/**
 * Load contact groups
 */
async function loadGroups() {
  try {
    const response = await api.getContactGroups();
    currentGroups = response.data || [];
    renderGroups();
  } catch (error) {
    console.error('Error loading groups:', error);
    document.getElementById('groupsList').innerHTML = `
      <p style="color: #ef4444; font-size: 14px;" data-i18n="errors.error_loading_groups">Error loading groups</p>
    `;
  }
}

/**
 * Render groups list
 */
function renderGroups() {
  const container = document.getElementById('groupsList');
  
  if (currentGroups.length === 0) {
    container.innerHTML = `
      <p style="color: #9ca3af; font-size: 14px; text-align: center;" data-i18n="contacts.no_groups">No groups yet</p>
    `;
    return;
  }

  container.innerHTML = `
    <div class="group-item ${selectedGroupId === null ? 'active' : ''}" onclick="selectGroup(null)">
      <span class="group-name" data-i18n="contacts.all_contacts">All Contacts</span>
      <span class="group-count">${currentContacts.length}</span>
    </div>
    ${currentGroups.map(group => `
      <div class="group-item ${selectedGroupId === group.id ? 'active' : ''}" onclick="selectGroup(${group.id})">
        <span class="group-name">${escapeHtml(group.group_name)}</span>
        <span class="group-count">${group.contact_count || 0}</span>
        ${group.group_name !== 'Default' ? `
          <div class="group-actions">
            <button onclick="event.stopPropagation(); editGroup(${group.id})" title="Edit">
              <i class="fas fa-edit"></i>
            </button>
            <button onclick="event.stopPropagation(); deleteGroup(${group.id})" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        ` : ''}
      </div>
    `).join('')}
  `;
}

/**
 * Select group filter
 */
function selectGroup(groupId) {
  selectedGroupId = groupId;
  renderGroups();
  loadContacts();
}

/**
 * Load contacts
 */
async function loadContacts() {
  try {
    const params = {};
    if (selectedGroupId) params.group_id = selectedGroupId;
    
    const search = document.getElementById('contactSearch')?.value;
    if (search) params.search = search;

    const response = await api.getContacts(params);
    currentContacts = response.data || [];
    renderContacts();
    updateContactsCount();
  } catch (error) {
    console.error('Error loading contacts:', error);
    document.getElementById('contactsTableBody').innerHTML = `
      <tr><td colspan="5" style="text-align: center; color: #ef4444;" data-i18n="errors.error_loading_contacts">Error loading contacts</td></tr>
    `;
  }
}

/**
 * Render contacts table
 */
function renderContacts() {
  const tbody = document.getElementById('contactsTableBody');
  
  if (currentContacts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="contacts-empty-state">
            <i class="fas fa-address-book"></i>
            <h3 data-i18n="contacts.no_contacts">No contacts found</h3>
            <p data-i18n="contacts.add_first">Add your first contact to get started</p>
          </div>
        </td>
      </tr>
    `;
    i18n.translatePage();
    return;
  }

  tbody.innerHTML = currentContacts.map(contact => `
    <tr class="contact-row">
      <td>${escapeHtml(contact.name)}</td>
      <td>${escapeHtml(contact.phone)}</td>
      <td>${contact.email ? escapeHtml(contact.email) : '-'}</td>
      <td>${contact.group_name ? escapeHtml(contact.group_name) : '-'}</td>
      <td>
        <div class="contact-actions">
          <button class="btn-edit" onclick="editContact(${contact.id})">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="btn-delete" onclick="deleteContact(${contact.id})">
            <i class="fas fa-trash"></i> Delete
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

/**
 * Update contacts count
 */
function updateContactsCount() {
  const countEl = document.getElementById('contactsCount');
  if (countEl) {
    const count = currentContacts.length;
    countEl.textContent = `${count} ${count === 1 ? 'contact' : 'contacts'}`;
  }
}

/**
 * Filter contacts
 */
function filterContacts() {
  loadContacts();
}

/**
 * Show add contact modal
 */
function showAddContactModal() {
  const groupOptions = currentGroups.map(g => 
    `<option value="${g.id}">${escapeHtml(g.group_name)}</option>`
  ).join('');

  showModal({
    title: i18n.t('contacts.add'),
    content: `
      <form id="addContactForm" onsubmit="handleAddContact(event)">
        <div class="form-group">
          <label data-i18n="contacts.name">Name</label>
          <input type="text" name="name" class="form-control" required data-i18n-placeholder="contacts.name_placeholder">
        </div>
        <div class="form-group">
          <label data-i18n="contacts.phone">Phone</label>
          <input type="text" name="phone" class="form-control" required data-i18n-placeholder="contacts.phone_placeholder">
          <small data-i18n="contacts.phone_format">Format: Country code + number (e.g., 5511999999999)</small>
        </div>
        <div class="form-group">
          <label data-i18n="contacts.email">Email</label>
          <input type="email" name="email" class="form-control" data-i18n-placeholder="contacts.email_placeholder">
        </div>
        <div class="form-group">
          <label data-i18n="contacts.group">Group</label>
          <select name="group_id" class="form-control">
            <option value="" data-i18n="contacts.no_group">No Group</option>
            ${groupOptions}
          </select>
        </div>
        <div class="form-group">
          <label data-i18n="contacts.notes">Notes</label>
          <textarea name="notes" class="form-control" rows="3" data-i18n-placeholder="contacts.notes_placeholder"></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeContactModal()" data-i18n="common.cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" data-i18n="common.save">Save</button>
        </div>
      </form>
    `,
    size: 'medium'
  });
}

/**
 * Handle add contact
 */
async function handleAddContact(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  
  const data = {
    name: formData.get('name'),
    phone: formData.get('phone'),
    email: formData.get('email') || null,
    group_id: formData.get('group_id') || null,
    notes: formData.get('notes') || null
  };

  try {
    await api.createContact(data);
    showNotification('Contact created successfully', 'success');
    
    // Close modal immediately
    closeContactModal(true);
    
    // Reload data in background
    Promise.all([loadGroups(), loadContacts()]).catch(err => 
      console.error('Error reloading data:', err)
    );
  } catch (error) {
    console.error('Error creating contact:', error);
    showNotification(error.message || 'Error creating contact', 'error');
    // Don't close modal on error so user can fix the issue
  }
}

/**
 * Edit contact
 */
async function editContact(id) {
  try {
    const response = await api.getContact(id);
    const contact = response.data;
    
    const groupOptions = currentGroups.map(g => 
      `<option value="${g.id}" ${contact.group_id === g.id ? 'selected' : ''}>${escapeHtml(g.group_name)}</option>`
    ).join('');

    showModal({
      title: i18n.t('contacts.edit'),
      content: `
        <form id="editContactForm" onsubmit="handleEditContact(event, ${id})">
          <div class="form-group">
            <label data-i18n="contacts.name">Name</label>
            <input type="text" name="name" class="form-control" value="${escapeHtml(contact.name)}" required>
          </div>
          <div class="form-group">
            <label data-i18n="contacts.phone">Phone</label>
            <input type="text" name="phone" class="form-control" value="${escapeHtml(contact.phone)}" required>
          </div>
          <div class="form-group">
            <label data-i18n="contacts.email">Email</label>
            <input type="email" name="email" class="form-control" value="${contact.email || ''}">
          </div>
          <div class="form-group">
            <label data-i18n="contacts.group">Group</label>
            <select name="group_id" class="form-control">
              <option value="" data-i18n="contacts.no_group">No Group</option>
              ${groupOptions}
            </select>
          </div>
          <div class="form-group">
            <label data-i18n="contacts.notes">Notes</label>
            <textarea name="notes" class="form-control" rows="3">${contact.notes || ''}</textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" onclick="closeContactModal()" data-i18n="common.cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" data-i18n="common.save">Save</button>
          </div>
        </form>
      `,
      size: 'medium'
    });
  } catch (error) {
    console.error('Error loading contact:', error);
    showNotification('Error loading contact', 'error');
  }
}

/**
 * Handle edit contact
 */
async function handleEditContact(event, id) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  
  const data = {
    name: formData.get('name'),
    phone: formData.get('phone'),
    email: formData.get('email') || null,
    group_id: formData.get('group_id') || null,
    notes: formData.get('notes') || null
  };

  try {
    await api.updateContact(id, data);
    showNotification('Contact updated successfully', 'success');
    closeContactModal(true);
    await Promise.all([loadGroups(), loadContacts()]);
  } catch (error) {
    console.error('Error updating contact:', error);
    showNotification(error.message || 'Error updating contact', 'error');
  }
}

/**
 * Delete contact
 */
async function deleteContact(id) {
  showModal({
    title: i18n.t('contacts.delete_confirm_title'),
    content: `
      <p data-i18n="contacts.delete_confirm">Are you sure you want to delete this contact?</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeContactModal()" data-i18n="common.cancel">Cancel</button>
        <button class="btn btn-danger" onclick="confirmDeleteContact(${id})" data-i18n="common.delete">Delete</button>
      </div>
    `,
    size: 'small'
  });
}

/**
 * Confirm delete contact
 */
async function confirmDeleteContact(id) {
  try {
    await api.deleteContact(id);
    showNotification('Contact deleted successfully', 'success');
    closeContactModal(true);
    await Promise.all([loadGroups(), loadContacts()]);
  } catch (error) {
    console.error('Error deleting contact:', error);
    showNotification('Error deleting contact', 'error');
  }
}

/**
 * Show import contacts modal
 */
function showImportContactsModal() {
  const groupOptions = currentGroups.map(g => 
    `<option value="${g.id}">${escapeHtml(g.group_name)}</option>`
  ).join('');

  showModal({
    title: i18n.t('contacts.import'),
    content: `
      <form id="importContactsForm" onsubmit="handleImportContacts(event)">
        <div class="import-instructions">
          <h4 data-i18n="contacts.import_instructions_title">Import Instructions</h4>
          <ul>
            <li data-i18n="contacts.import_format">Format: Name, Phone, Email (one per line)</li>
            <li data-i18n="contacts.import_example">Example: John Doe, 5511999999999, john@example.com</li>
            <li data-i18n="contacts.import_email_optional">Email is optional</li>
          </ul>
          <div class="import-format-example">
            John Doe, 5511999999999, john@example.com<br>
            Jane Smith, 5511888888888<br>
            Bob Johnson, 5511777777777, bob@example.com
          </div>
        </div>
        <div class="form-group">
          <label data-i18n="contacts.default_group">Default Group (optional)</label>
          <select name="group_id" class="form-control">
            <option value="" data-i18n="contacts.no_group">No Group</option>
            ${groupOptions}
          </select>
        </div>
        <div class="form-group">
          <label data-i18n="contacts.contacts_data">Contacts Data</label>
          <textarea name="contacts_data" class="import-textarea" required data-i18n-placeholder="contacts.paste_data"></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeContactModal()" data-i18n="common.cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" data-i18n="contacts.import_button">Import</button>
        </div>
      </form>
    `,
    size: 'large'
  });
}

/**
 * Handle import contacts
 */
async function handleImportContacts(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  
  const groupId = formData.get('group_id') || null;
  const contactsData = formData.get('contacts_data');
  
  // Parse contacts data
  const lines = contactsData.split('\n').filter(line => line.trim());
  const contacts = [];
  
  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      contacts.push({
        name: parts[0],
        phone: parts[1],
        email: parts[2] || null,
        group_id: groupId
      });
    }
  }
  
  if (contacts.length === 0) {
    showNotification('No valid contact data found', 'error');
    return;
  }

  try {
    const response = await api.importContacts({ contacts });
    showNotification(
      `Import completed: ${response.data.imported} imported, ${response.data.failed} failed`,
      response.data.failed > 0 ? 'warning' : 'success'
    );
    closeContactModal(true);
    await Promise.all([loadGroups(), loadContacts()]);
  } catch (error) {
    console.error('Error importing contacts:', error);
    showNotification(error.message || 'Error importing contacts', 'error');
  }
}

/**
 * Show add group modal
 */
function showAddGroupModal() {
  showModal({
    title: i18n.t('contacts.add_group'),
    content: `
      <form id="addGroupForm" onsubmit="handleAddGroup(event)">
        <div class="form-group">
          <label data-i18n="contacts.group_name">Group Name</label>
          <input type="text" name="group_name" class="form-control" required data-i18n-placeholder="contacts.group_name_placeholder">
        </div>
        <div class="form-group">
          <label data-i18n="contacts.description">Description</label>
          <textarea name="description" class="form-control" rows="3" data-i18n-placeholder="contacts.description_placeholder"></textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeContactModal()" data-i18n="common.cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" data-i18n="common.save">Save</button>
        </div>
      </form>
    `,
    size: 'medium'
  });
}

/**
 * Handle add group
 */
async function handleAddGroup(event) {
  event.preventDefault();
  
  const form = event.target;
  const formData = new FormData(form);
  
  const data = {
    group_name: formData.get('group_name'),
    description: formData.get('description') || null
  };

  try {
    await api.createContactGroup(data);
    
    // Show success notification
    showNotification('Group created successfully', 'success');
    
    // Close modal immediately
    closeContactModal(true);
    
    // Reload groups in background
    loadGroups().catch(err => console.error('Error reloading groups:', err));
    
  } catch (error) {
    console.error('Error creating group:', error);
    showNotification(error.message || 'Error creating group', 'error');
    // Don't close modal on error so user can fix the issue
  }
}

/**
 * Edit group
 */
async function editGroup(id) {
  const group = currentGroups.find(g => g.id === id);
  if (!group) return;

  showModal({
    title: i18n.t('contacts.edit_group'),
    content: `
      <form id="editGroupForm" onsubmit="handleEditGroup(event, ${id})">
        <div class="form-group">
          <label data-i18n="contacts.group_name">Group Name</label>
          <input type="text" name="group_name" class="form-control" value="${escapeHtml(group.group_name)}" required>
        </div>
        <div class="form-group">
          <label data-i18n="contacts.description">Description</label>
          <textarea name="description" class="form-control" rows="3">${group.description || ''}</textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" onclick="closeContactModal()" data-i18n="common.cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" data-i18n="common.save">Save</button>
        </div>
      </form>
    `,
    size: 'medium'
  });
}

/**
 * Handle edit group
 */
async function handleEditGroup(event, id) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  
  const data = {
    group_name: formData.get('group_name'),
    description: formData.get('description') || null
  };

  try {
    await api.updateContactGroup(id, data);
    showNotification('Group updated successfully', 'success');
    closeContactModal(true);
    await loadGroups();
  } catch (error) {
    console.error('Error updating group:', error);
    showNotification(error.message || 'Error updating group', 'error');
  }
}

/**
 * Delete group
 */
async function deleteGroup(id) {
  showModal({
    title: i18n.t('contacts.delete_group_confirm_title'),
    content: `
      <p data-i18n="contacts.delete_group_confirm">Are you sure you want to delete this group? Contacts will not be deleted.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeContactModal()" data-i18n="common.cancel">Cancel</button>
        <button class="btn btn-danger" onclick="confirmDeleteGroup(${id})" data-i18n="common.delete">Delete</button>
      </div>
    `,
    size: 'small'
  });
}

/**
 * Confirm delete group
 */
async function confirmDeleteGroup(id) {
  try {
    await api.deleteContactGroup(id);
    showNotification('Group deleted successfully', 'success');
    closeContactModal(true);
    if (selectedGroupId === id) {
      selectedGroupId = null;
    }
    await Promise.all([loadGroups(), loadContacts()]);
  } catch (error) {
    console.error('Error deleting group:', error);
    showNotification(error.message || 'Error deleting group', 'error');
  }
}


/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}



/**
 * Show modal for contacts page
 */
function showModal({ title, content, size = 'medium' }) {
  // Remove existing modals
  const existingModals = document.querySelectorAll('.custom-modal');
  existingModals.forEach(m => m.remove());

  const modal = document.createElement('div');
  modal.className = 'custom-modal';
  modal.id = 'contactsModal';
  modal.innerHTML = `
    <div class="custom-modal-overlay" data-close-modal="true"></div>
    <div class="custom-modal-content custom-modal-${size}">
      <div class="custom-modal-header">
        <h3>${title}</h3>
        <button type="button" class="custom-modal-close" data-close-modal="true">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="custom-modal-body">
        ${content}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add event listeners using event delegation
  modal.addEventListener('click', function(e) {
    if (e.target.hasAttribute('data-close-modal') || e.target.closest('[data-close-modal="true"]')) {
      e.preventDefault();
      e.stopPropagation();
      closeContactsModal();
    }
  });
  
  // Show modal with animation
  setTimeout(() => modal.classList.add('show'), 10);
  
  // Translate if i18n is available
  if (typeof i18n !== 'undefined' && i18n.translatePage) {
    i18n.translatePage();
  }
}

/**
 * Close contacts modal
 */
function closeContactsModal() {
  const modals = document.querySelectorAll('.custom-modal');
  modals.forEach(modal => {
    modal.classList.remove('show');
    setTimeout(() => {
      if (modal.parentNode) {
        modal.remove();
      }
    }, 300);
  });
}

/**
 * Close modal - wrapper function for onclick handlers in contacts page
 */
function closeContactModal(immediate) {
  // Handle different call scenarios
  // 1. Called from onclick="closeContactModal()" - immediate is undefined
  // 2. Called from onclick="closeContactModal(true)" - immediate is true
  // 3. Called from event listener - immediate is an Event object
  
  const isImmediate = immediate === true;
  
  const modals = document.querySelectorAll('.custom-modal');
  
  if (isImmediate) {
    // Remove immediately without animation
    modals.forEach(modal => {
      if (modal.parentNode) {
        modal.remove();
      }
    });
  } else {
    // Remove with animation
    modals.forEach(modal => {
      modal.classList.remove('show');
      setTimeout(() => {
        if (modal.parentNode) {
          modal.remove();
        }
      }, 300);
    });
  }
}

// Make functions globally available
window.showModal = showModal;
window.closeContactModal = closeContactModal;
window.closeContactsModal = closeContactsModal;
window.loadContactsPage = loadContactsPage;
window.showAddContactModal = showAddContactModal;
window.handleAddContact = handleAddContact;
window.editContact = editContact;
window.handleEditContact = handleEditContact;
window.deleteContact = deleteContact;
window.confirmDeleteContact = confirmDeleteContact;
window.showImportContactsModal = showImportContactsModal;
window.handleImportContacts = handleImportContacts;
window.showAddGroupModal = showAddGroupModal;
window.handleAddGroup = handleAddGroup;
window.editGroup = editGroup;
window.handleEditGroup = handleEditGroup;
window.deleteGroup = deleteGroup;
window.confirmDeleteGroup = confirmDeleteGroup;
window.selectGroup = selectGroup;
window.filterContacts = filterContacts;
