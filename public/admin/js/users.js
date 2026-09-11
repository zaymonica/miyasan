/**
 * Users Management
 * Multi-tenant user management with complete CRUD operations
 */

console.log('👤 Users.js loaded');
console.log('👤 API object available?', typeof api);
console.log('👤 API methods:', api ? Object.keys(api) : 'API not defined');

let usersData = [];
let usersStoresData = [];
let usersDepartmentsData = [];

/**
 * Load all users for current tenant
 */
async function loadUsers() {
  console.log('🚀 loadUsers() CALLED - START');
  
  // Add timeout to detect hanging requests
  const timeoutId = setTimeout(() => {
    console.error('⏰ loadUsers() is taking too long! Possible hanging request.');
  }, 5000);
  
  try {
    console.log('🔄 Loading users...');
    console.log('🔍 Checking api object:', typeof api, api);
    
    if (typeof api === 'undefined') {
      clearTimeout(timeoutId);
      throw new Error('API object is not defined. Make sure api.js is loaded before users.js');
    }
    
    // Show loading state
    const tbody = document.getElementById('usersTableBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    } else {
      console.error('❌ usersTableBody not found!');
      clearTimeout(timeoutId);
      return;
    }
    
    console.log('📞 Calling API methods...');
    console.log('📞 api.getUsers:', typeof api.getUsers);
    console.log('📞 api.getStores:', typeof api.getStores);
    console.log('📞 api.getDepartments:', typeof api.getDepartments);
    
    const [usersResult, storesResult, deptsResult] = await Promise.allSettled([
      api.getUsers(),
      api.getStores(),
      api.getDepartments()
    ]);

    if (usersResult.status !== 'fulfilled') {
      throw usersResult.reason;
    }
    const usersResponse = usersResult.value;
    const storesResponse = storesResult.status === 'fulfilled' ? storesResult.value : { data: [] };
    const deptsResponse = deptsResult.status === 'fulfilled' ? deptsResult.value : { data: [] };
    
    clearTimeout(timeoutId);
    
    console.log('📊 API Responses:', {
      users: usersResponse,
      stores: storesResponse,
      departments: deptsResponse
    });
    
    // Handle both formats: { data: [...] } and direct array
    usersData = Array.isArray(usersResponse) ? usersResponse : (usersResponse.data || []);
    usersStoresData = Array.isArray(storesResponse) ? storesResponse : (storesResponse.data || []);
    usersDepartmentsData = Array.isArray(deptsResponse) ? deptsResponse : (deptsResponse.data || []);
    
    console.log('✅ Data loaded:', {
      users: usersData.length,
      stores: usersStoresData.length,
      departments: usersDepartmentsData.length
    });
    
    renderUsersTable();
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('❌ Error loading users:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      message: error.message,
      name: error.name,
      response: error.response
    });
    
    const tbody = document.getElementById('usersTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:red;padding:20px">
        <strong>Error loading users</strong><br>
        ${escapeHtml(error.message)}<br>
        <small>Check console for details</small><br>
        <button class="btn btn-sm btn-primary" onclick="loadUsers()" style="margin-top: 10px;">
          <i class="fas fa-sync"></i> Retry
        </button>
      </td></tr>`;
    }
    
    if (typeof Notification !== 'undefined' && Notification.error) {
      Notification.error('Error loading users: ' + error.message);
    }
  }
  
  console.log('🏁 loadUsers() FINISHED');
}



/**
 * Render users table
 */
function renderUsersTable() {
  console.log('🎨 Rendering users table with', usersData.length, 'users');
  
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) {
    console.error('❌ usersTableBody not found');
    return;
  }

  // Apply filters (if filter elements exist)
  const searchInput = document.getElementById('userSearch');
  const roleFilterSelect = document.getElementById('roleFilter');
  
  const searchTerm = searchInput?.value.toLowerCase() || '';
  const roleFilter = roleFilterSelect?.value || '';

  let filteredUsers = usersData;

  if (searchTerm) {
    filteredUsers = filteredUsers.filter(u => 
      (u.name && u.name.toLowerCase().includes(searchTerm)) ||
      (u.email && u.email.toLowerCase().includes(searchTerm)) ||
      (u.username && u.username.toLowerCase().includes(searchTerm))
    );
  }

  if (roleFilter) {
    filteredUsers = filteredUsers.filter(u => u.role === roleFilter);
  }
  
  console.log('🎨 Filtered to', filteredUsers.length, 'users');

  if (filteredUsers.length === 0) {
    console.log('📊 No users to display');
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center;padding:20px;">
          <i class="fas fa-users" style="font-size: 48px; color: #ccc; margin-bottom: 10px;"></i>
          <p>No users found</p>
          <button class="btn btn-primary" onclick="showAddUserModal()">
            <i class="fas fa-plus"></i> Add First User
          </button>
        </td>
      </tr>
    `;
    return;
  }

  console.log('📊 Rendering', filteredUsers.length, 'users');
  
  tbody.innerHTML = filteredUsers.map(user => {
    const statusClass = user.active ? 'badge-success' : 'badge-danger';
    const statusText = user.active ? 'Active' : 'Inactive';
    const linkTo = user.store || user.department || '-';
    
    return `
      <tr data-user-id="${user.id}">
        <td>${escapeHtml(user.username || user.name || '-')}</td>
        <td>${escapeHtml(linkTo)}</td>
        <td>
          <span class="badge ${statusClass}">${statusText}</span>
        </td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  console.log('✅ Users table rendered successfully');
}

/**
 * Show modal to add new user
 */
function showAddUserModal() {
  console.log('🔵 Opening add user modal');
  console.log('📊 Available stores:', usersStoresData);
  console.log('📊 Available departments:', usersDepartmentsData);
  
  // Build store options
  let storeOptions = '<option value="">Select a store</option>';
  if (usersStoresData && usersStoresData.length > 0) {
    storeOptions += usersStoresData.map(s => {
      const storeName = s.name || s.store_name || 'Unnamed Store';
      return `<option value="${escapeHtml(storeName)}">${escapeHtml(storeName)}</option>`;
    }).join('');
  } else {
    storeOptions += '<option value="" disabled>No stores available</option>';
  }
  
  // Build department options
  let departmentOptions = '<option value="">Select a department</option>';
  if (usersDepartmentsData && usersDepartmentsData.length > 0) {
    departmentOptions += usersDepartmentsData.map(d => {
      const deptName = d.name || d.department_name || 'Unnamed Department';
      return `<option value="${escapeHtml(deptName)}">${escapeHtml(deptName)}</option>`;
    }).join('');
  } else {
    departmentOptions += '<option value="" disabled>No departments available</option>';
  }
  
  console.log('🔧 Store options HTML:', storeOptions);
  console.log('🔧 Department options HTML:', departmentOptions);
  
  const modalHtml = `
    <div class="modal-overlay active">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>Add User</h3>
          <button class="modal-close" onclick="closeUserModal()">×</button>
        </div>
        <form id="userForm" class="modal-body">
          <div class="form-group">
            <label>Username:</label>
            <input type="text" id="newUsername" required>
          </div>
          <div class="form-group">
            <label>Password:</label>
            <input type="password" id="newPassword" required>
          </div>
          <div class="form-group">
            <label>Link to:</label>
            <div style="margin-bottom: 10px;">
              <label style="margin-right: 20px;">
                <input type="radio" name="linkType" value="store" checked onchange="toggleUserLinkType()"> Store
              </label>
              <label>
                <input type="radio" name="linkType" value="department" onchange="toggleUserLinkType()"> Department
              </label>
            </div>
          </div>
          <div class="form-group" id="storeSelectGroup">
            <label>Store:</label>
            <select id="newUserStore">
              ${storeOptions}
            </select>
          </div>
          <div class="form-group" id="departmentSelectGroup" style="display: none;">
            <label>Department:</label>
            <select id="newUserDepartment">
              ${departmentOptions}
            </select>
          </div>
        </form>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeUserModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" onclick="saveUser(event)">Save</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  console.log('✅ Modal added to DOM');
}

function closeUserModal() {
  const modal = document.querySelector('.modal-overlay');
  if (modal) modal.remove();
}

function toggleUserLinkType() {
  const linkType = document.querySelector('input[name="linkType"]:checked').value;
  const storeGroup = document.getElementById('storeSelectGroup');
  const departmentGroup = document.getElementById('departmentSelectGroup');

  if (linkType === 'store') {
    storeGroup.style.display = 'block';
    departmentGroup.style.display = 'none';
    document.getElementById('newUserDepartment').value = '';
  } else {
    storeGroup.style.display = 'none';
    departmentGroup.style.display = 'block';
    document.getElementById('newUserStore').value = '';
  }
}

async function saveUser(event) {
  if (event) event.preventDefault();
  
  const username = document.getElementById('newUsername').value;
  const password = document.getElementById('newPassword').value;
  const linkType = document.querySelector('input[name="linkType"]:checked').value;

  let store = null;
  let department = null;

  if (linkType === 'store') {
    store = document.getElementById('newUserStore').value;
    if (!store) {
      Notification.error('Please select a store');
      return;
    }
  } else {
    department = document.getElementById('newUserDepartment').value;
    if (!department) {
      Notification.error('Please select a department');
      return;
    }
  }

  try {
    // Simple user creation like 2.0 - only username, password, store/department
    await api.createUser({ 
      username: username, 
      password, 
      store, 
      department 
    });
    Notification.success('User created successfully');
    closeUserModal();
    await loadUsers();
  } catch (error) {
    console.error('Error creating user:', error);
    Notification.error(error.message || 'Error creating user');
  }
}

/**
 * Delete user
 */
function deleteUser(id) {
  Modal.confirm('users.delete', 'users.delete_confirm', async () => {
    try {
      await api.deleteUser(id);
      Notification.success('users.delete_success');
      await loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      Notification.error(error.message || 'errors.deleting_user');
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

// Expose functions globally for inline event handlers
window.loadUsers = loadUsers;
window.showAddUserModal = showAddUserModal;
window.closeUserModal = closeUserModal;
window.toggleUserLinkType = toggleUserLinkType;
window.saveUser = saveUser;
window.deleteUser = deleteUser;

console.log('✅ All users functions exposed globally');

// Setup search listener
document.addEventListener('DOMContentLoaded', () => {
  console.log('👤 Users.js DOMContentLoaded');
  
  const searchInput = document.getElementById('userSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderUsersTable();
    });
  }
  
  const roleFilter = document.getElementById('roleFilter');
  if (roleFilter) {
    roleFilter.addEventListener('change', () => {
      renderUsersTable();
    });
  }
});
