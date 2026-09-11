/**
 * Stores Management
 * Multi-tenant store management with complete CRUD operations
 */

let storesData = [];
let storesUsersData = [];

/**
 * Load all stores for current tenant
 */
async function loadStores() {
  try {
    console.log('Loading stores...');
    const [storesResponse, usersResponse] = await Promise.all([
      api.getStores(),
      api.getUsers()
    ]);
    
    storesData = storesResponse.data || [];
    storesUsersData = usersResponse.data || [];
    
    console.log('Stores loaded:', storesData.length);
    renderStoresTable();
  } catch (error) {
    console.error('Error loading stores:', error);
    Notification.error('errors.loading_stores');
  }
}

/**
 * Render stores table
 */
function renderStoresTable() {
  const tbody = document.getElementById('storesTableBody');
  if (!tbody) return;

  if (storesData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align:center">
          <p data-i18n="stores.no_stores">${i18n.t('stores.no_stores')}</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = storesData.map(store => {
    // Count users in this store
    const userCount = storesUsersData.filter(u => u.store === store.name).length;
    
    return `
      <tr data-store-id="${store.id}">
        <td>${escapeHtml(store.name)}</td>
        <td>${userCount}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editStore(${store.id})" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteStore(${store.id})" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Show modal to add new store
 */
function showAddStoreModal() {
  const modalHtml = `
    <div class="modal-overlay active">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>Add Store</h3>
          <button class="modal-close" onclick="closeStoreModal()">×</button>
        </div>
        <form id="storeForm" class="modal-body">
          <div class="form-group">
            <label>Store Name *:</label>
            <input type="text" id="storeName" required placeholder="Enter store name">
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea id="storeDescription" rows="4" placeholder="Enter store description (optional)"></textarea>
          </div>
        </form>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeStoreModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" onclick="saveStore(event)">Save</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeStoreModal() {
  const modal = document.querySelector('.modal-overlay');
  if (modal) modal.remove();
}

async function saveStore(event) {
  if (event) event.preventDefault();
  
  const name = document.getElementById('storeName').value.trim();
  const description = document.getElementById('storeDescription').value.trim();

  if (!name) {
    Notification.error('Store name is required');
    return;
  }

  try {
    await api.createStore({ 
      name, 
      description: description || null,
      address: null,
      hours: null,
      promotions: null
    });
    Notification.success('stores.create_success');
    closeStoreModal();
    await loadStores();
  } catch (error) {
    console.error('Error creating store:', error);
    Notification.error(error.message || 'errors.creating_store');
  }
}

/**
 * Edit existing store
 */
async function editStore(id) {
  try {
    const response = await api.getStore(id);
    const store = response.data;

    const modalHtml = `
      <div class="modal-overlay active">
        <div class="modal-dialog">
          <div class="modal-header">
            <h3>Edit Store</h3>
            <button class="modal-close" onclick="closeStoreModal()">×</button>
          </div>
          <form id="storeForm" class="modal-body">
            <div class="form-group">
              <label>Store Name *:</label>
              <input type="text" id="storeName" value="${escapeHtml(store.name)}" required placeholder="Enter store name">
            </div>
            <div class="form-group">
              <label>Description:</label>
              <textarea id="storeDescription" rows="4" placeholder="Enter store description (optional)">${escapeHtml(store.description || '')}</textarea>
            </div>
          </form>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="closeStoreModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" onclick="updateStore(${id}, event)">Save</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  } catch (error) {
    console.error('Error loading store:', error);
    Notification.error('errors.loading_store');
  }
}

async function updateStore(id, event) {
  if (event) event.preventDefault();
  
  const name = document.getElementById('storeName').value.trim();
  const description = document.getElementById('storeDescription').value.trim();

  if (!name) {
    Notification.error('Store name is required');
    return;
  }

  try {
    await api.updateStore(id, { 
      name, 
      description: description || null,
      address: null,
      hours: null,
      promotions: null
    });
    Notification.success('stores.update_success');
    closeStoreModal();
    await loadStores();
  } catch (error) {
    console.error('Error updating store:', error);
    Notification.error(error.message || 'errors.updating_store');
  }
}

/**
 * Delete store
 */
function deleteStore(id) {
  const store = storesData.find(s => s.id === id);
  
  // Check if store has users
  const userCount = storesUsersData.filter(u => u.store === store?.name).length;
  if (userCount > 0) {
    Modal.alert('stores.delete', 'stores.delete_with_users', 'warning');
    return;
  }

  Modal.confirm('stores.delete', 'stores.delete_confirm', async () => {
    try {
      await api.deleteStore(id);
      Notification.success('stores.delete_success');
      await loadStores();
    } catch (error) {
      console.error('Error deleting store:', error);
      Notification.error(error.message || 'errors.deleting_store');
    }
  });
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  // Check if date is valid
  if (isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleDateString();
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
