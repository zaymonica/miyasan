/**
 * Departments Management
 * Multi-tenant department management with complete CRUD operations
 */

let departmentsData = [];
let departmentsUsersData = [];

/**
 * Load all departments for current tenant
 */
async function loadDepartments() {
  try {
    console.log('Loading departments...');
    const [deptsResponse, usersResponse] = await Promise.all([
      api.getDepartments(),
      api.getUsers()
    ]);
    
    departmentsData = deptsResponse.data || [];
    departmentsUsersData = usersResponse.data || [];
    
    console.log('Departments loaded:', departmentsData.length);
    renderDepartmentsTable();
  } catch (error) {
    console.error('Error loading departments:', error);
    Notification.error('errors.loading_departments');
  }
}

/**
 * Render departments table
 */
function renderDepartmentsTable() {
  const tbody = document.getElementById('departmentsTableBody');
  if (!tbody) return;

  if (departmentsData.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center">
          <p data-i18n="departments.no_departments">${i18n.t('departments.no_departments')}</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = departmentsData.map(dept => {
    // Count users in this department
    const userCount = departmentsUsersData.filter(u => u.department === dept.name).length;
    
    return `
      <tr data-department-id="${dept.id}">
        <td>${escapeHtml(dept.name)}</td>
        <td>${escapeHtml(dept.description || '-')}</td>
        <td>${userCount}</td>
        <td>${formatDate(dept.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editDepartment(${dept.id})" title="${i18n.t('departments.edit')}">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteDepartment(${dept.id})" title="${i18n.t('departments.delete')}">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Show modal to add new department
 */
function showAddDepartmentModal() {
  Modal.form({
    title: 'departments.add',
    fields: [
      { 
        name: 'name', 
        label: 'departments.name', 
        required: true, 
        placeholder: 'departments.name_placeholder'
      },
      { 
        name: 'description', 
        label: 'departments.description', 
        type: 'textarea', 
        placeholder: 'departments.description_placeholder'
      }
    ],
    submitText: 'common.save',
    cancelText: 'common.cancel',
    onSubmit: async (data) => {
      try {
        await api.createDepartment(data);
        Notification.success('departments.create_success');
        await loadDepartments();
      } catch (error) {
        console.error('Error creating department:', error);
        Notification.error(error.message || 'errors.creating_department');
      }
    }
  });
}

/**
 * Edit existing department
 */
async function editDepartment(id) {
  try {
    const response = await api.getDepartment(id);
    const dept = response.data;

    Modal.form({
      title: 'departments.edit',
      fields: [
        { 
          name: 'name', 
          label: 'departments.name', 
          required: true, 
          value: dept.name 
        },
        { 
          name: 'description', 
          label: 'departments.description', 
          type: 'textarea', 
          value: dept.description || ''
        }
      ],
      submitText: 'common.save',
      cancelText: 'common.cancel',
      onSubmit: async (data) => {
        try {
          await api.updateDepartment(id, data);
          Notification.success('departments.update_success');
          await loadDepartments();
        } catch (error) {
          console.error('Error updating department:', error);
          Notification.error(error.message || 'errors.updating_department');
        }
      }
    });
  } catch (error) {
    console.error('Error loading department:', error);
    Notification.error('errors.loading_department');
  }
}

/**
 * Delete department
 */
function deleteDepartment(id) {
  const dept = departmentsData.find(d => d.id === id);
  
  // Check if department has users
  const userCount = departmentsUsersData.filter(u => u.department === dept?.name).length;
  if (userCount > 0) {
    Modal.alert('departments.delete', 'departments.delete_with_users', 'warning');
    return;
  }

  Modal.confirm('departments.delete', 'departments.delete_confirm', async () => {
    try {
      await api.deleteDepartment(id);
      Notification.success('departments.delete_success');
      await loadDepartments();
    } catch (error) {
      console.error('Error deleting department:', error);
      Notification.error(error.message || 'errors.deleting_department');
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
