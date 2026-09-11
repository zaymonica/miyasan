/**
 * Superadmin Tenants Management
 * Handles tenant CRUD operations, resource management, and status changes
 */

let currentPage = 1;
let totalPages = 1;
let currentFilters = {};
let allPlans = [];
let translations = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeLanguage();
    loadPlans();
    loadTenants();
    setupEventListeners();
});

/**
 * Initialize language
 */
function initializeLanguage() {
    const savedLang = localStorage.getItem('superadmin_language') || 'en';
    document.getElementById('languageSelector').value = savedLang;
    loadTranslations(savedLang);
}

/**
 * Load translations
 */
async function loadTranslations(lang) {
    try {
        const response = await fetch(`/api/superadmin/translations/${lang}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            translations = data.translations || {};
            applyTranslations();
            updateDirection(lang);
        }
    } catch (error) {
        console.error('Error loading translations:', error);
    }
}

/**
 * Apply translations to page
 */
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[key]) {
            if (element.tagName === 'INPUT' && element.type !== 'button' && element.type !== 'submit') {
                element.placeholder = translations[key];
            } else {
                element.textContent = translations[key];
            }
        }
    });
}

/**
 * Update text direction for RTL languages
 */
function updateDirection(lang) {
    const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
    const direction = rtlLanguages.includes(lang) ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', direction);
    document.body.setAttribute('dir', direction);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Language selector
    document.getElementById('languageSelector').addEventListener('change', (e) => {
        const lang = e.target.value;
        localStorage.setItem('superadmin_language', lang);
        loadTranslations(lang);
    });

    // Search input with debounce
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentFilters.search = e.target.value;
            currentPage = 1;
            loadTenants();
        }, 500);
    });

    // Status filter
    document.getElementById('statusFilter').addEventListener('change', (e) => {
        currentFilters.status = e.target.value;
        currentPage = 1;
        loadTenants();
    });

    // Plan filter
    document.getElementById('planFilter').addEventListener('change', (e) => {
        currentFilters.plan_id = e.target.value;
        currentPage = 1;
        loadTenants();
    });
}

/**
 * Load subscription plans
 */
async function loadPlans() {
    try {
        const response = await fetch('/api/superadmin/plans', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            allPlans = data.plans || [];
            populatePlanSelectors();
        }
    } catch (error) {
        console.error('Error loading plans:', error);
    }
}

/**
 * Populate plan selectors
 */
function populatePlanSelectors() {
    const planId = document.getElementById('planId');
    const planFilter = document.getElementById('planFilter');

    allPlans.forEach(plan => {
        const option = document.createElement('option');
        option.value = plan.id;
        option.textContent = `${plan.name} - $${plan.price}/${plan.billing_period}`;
        planId.appendChild(option.cloneNode(true));
        
        if (plan.active) {
            planFilter.appendChild(option);
        }
    });
}

/**
 * Load tenants
 */
async function loadTenants() {
    showLoading(true);

    try {
        const params = new URLSearchParams({
            page: currentPage,
            limit: 10,
            ...currentFilters
        });

        const response = await fetch(`/api/superadmin/tenants?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayTenants(data.tenants || []);
            updatePagination(data.pagination);
            updateStats(data.tenants || []);
        } else {
            showAlert('Error loading tenants', 'error');
        }
    } catch (error) {
        console.error('Error loading tenants:', error);
        showAlert('Error loading tenants', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Display tenants in table
 */
function displayTenants(tenants) {
    const tbody = document.getElementById('tenantsTableBody');
    const table = document.getElementById('tenantsTable');
    const emptyState = document.getElementById('emptyState');

    if (tenants.length === 0) {
        table.style.display = 'none';
        emptyState.style.display = 'block';
        document.getElementById('pagination').style.display = 'none';
        return;
    }

    table.style.display = 'table';
    emptyState.style.display = 'none';
    document.getElementById('pagination').style.display = 'flex';

    tbody.innerHTML = tenants.map(tenant => `
        <tr>
            <td>${tenant.id}</td>
            <td><strong>${escapeHtml(tenant.name)}</strong></td>
            <td>${escapeHtml(tenant.email)}</td>
            <td>${tenant.plan_name || 'N/A'}</td>
            <td><span class="status-badge status-${tenant.status}">${tenant.status}</span></td>
            <td>${formatDate(tenant.created_at)}</td>
            <td>
                <div class="table-actions">
                    <button class="btn btn-sm btn-primary" onclick="viewTenant(${tenant.id})" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="openEditModal(${tenant.id})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="openResourcesModal(${tenant.id})" title="Manage Resources">
                        <i class="fas fa-cog"></i>
                    </button>
                    ${tenant.status === 'active' ? 
                        `<button class="btn btn-sm btn-danger" onclick="suspendTenant(${tenant.id})" title="Suspend">
                            <i class="fas fa-ban"></i>
                        </button>` :
                        `<button class="btn btn-sm btn-success" onclick="activateTenant(${tenant.id})" title="Activate">
                            <i class="fas fa-check"></i>
                        </button>`
                    }
                    <button class="btn btn-sm btn-danger" onclick="deleteTenant(${tenant.id})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

/**
 * Update statistics
 */
function updateStats(tenants) {
    const stats = {
        total: tenants.length,
        active: tenants.filter(t => t.status === 'active').length,
        trial: tenants.filter(t => t.status === 'trial').length,
        suspended: tenants.filter(t => t.status === 'suspended').length
    };

    document.getElementById('stat-total').textContent = stats.total;
    document.getElementById('stat-active').textContent = stats.active;
    document.getElementById('stat-trial').textContent = stats.trial;
    document.getElementById('stat-suspended').textContent = stats.suspended;
}

/**
 * Update pagination
 */
function updatePagination(pagination) {
    if (!pagination) return;

    totalPages = pagination.totalPages || 1;
    currentPage = pagination.page || 1;

    document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;
}

/**
 * Change page
 */
function changePage(direction) {
    const newPage = currentPage + direction;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        loadTenants();
    }
}

/**
 * Open create modal
 */
function openCreateModal() {
    document.getElementById('modalTitle').setAttribute('data-i18n', 'tenants.modal.create_title');
    document.getElementById('modalTitle').textContent = translations['tenants.modal.create_title'] || 'Create Tenant';
    document.getElementById('tenantForm').reset();
    document.getElementById('tenantId').value = '';
    document.getElementById('tenantModal').classList.add('active');
}

/**
 * Open edit modal
 */
async function openEditModal(id) {
    try {
        const response = await fetch(`/api/superadmin/tenants/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const tenant = data.tenant;

            document.getElementById('modalTitle').setAttribute('data-i18n', 'tenants.modal.edit_title');
            document.getElementById('modalTitle').textContent = translations['tenants.modal.edit_title'] || 'Edit Tenant';
            document.getElementById('tenantId').value = tenant.id;
            document.getElementById('companyName').value = tenant.company_name || '';
            document.getElementById('name').value = tenant.name;
            document.getElementById('email').value = tenant.email;
            document.getElementById('phone').value = tenant.phone || '';
            document.getElementById('planId').value = tenant.plan_id;
            document.getElementById('status').value = tenant.status;
            document.getElementById('maxUsers').value = tenant.max_users;
            document.getElementById('maxStores').value = tenant.max_stores;
            document.getElementById('maxDepartments').value = tenant.max_departments;
            document.getElementById('maxContacts').value = tenant.max_contacts;
            document.getElementById('maxDevices').value = tenant.max_devices;
            document.getElementById('maxConversations').value = tenant.max_conversations;
            document.getElementById('maxMessages').value = tenant.max_messages_per_month;

            // Hide admin fields for edit
            document.getElementById('adminUsername').required = false;
            document.getElementById('adminPassword').required = false;
            document.getElementById('adminUsername').closest('.form-row').style.display = 'none';
            document.getElementById('adminEmail').closest('.form-group').style.display = 'none';

            document.getElementById('tenantModal').classList.add('active');
        }
    } catch (error) {
        console.error('Error loading tenant:', error);
        showAlert('Error loading tenant details', 'error');
    }
}

/**
 * Save tenant
 */
async function saveTenant(event) {
    event.preventDefault();

    const tenantId = document.getElementById('tenantId').value;
    const isEdit = !!tenantId;

    const data = {
        name: document.getElementById('name').value,
        company_name: document.getElementById('companyName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        plan_id: parseInt(document.getElementById('planId').value),
        status: document.getElementById('status').value,
        max_users: parseInt(document.getElementById('maxUsers').value),
        max_stores: parseInt(document.getElementById('maxStores').value),
        max_departments: parseInt(document.getElementById('maxDepartments').value),
        max_contacts: parseInt(document.getElementById('maxContacts').value),
        max_devices: parseInt(document.getElementById('maxDevices').value),
        max_conversations: parseInt(document.getElementById('maxConversations').value),
        max_messages_per_month: parseInt(document.getElementById('maxMessages').value)
    };

    if (!isEdit) {
        data.admin_username = document.getElementById('adminUsername').value;
        data.admin_password = document.getElementById('adminPassword').value;
        data.admin_email = document.getElementById('adminEmail').value;
    }

    try {
        const url = isEdit ? `/api/superadmin/tenants/${tenantId}` : '/api/superadmin/tenants';
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            showAlert(isEdit ? 'Tenant updated successfully' : 'Tenant created successfully', 'success');
            closeModal('tenantModal');
            loadTenants();
        } else {
            const error = await response.json();
            showAlert(error.message || 'Error saving tenant', 'error');
        }
    } catch (error) {
        console.error('Error saving tenant:', error);
        showAlert('Error saving tenant', 'error');
    }
}

/**
 * View tenant details
 */
async function viewTenant(id) {
    try {
        const response = await fetch(`/api/superadmin/tenants/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const tenant = data.tenant;
            const stats = data.statistics;

            const detailsHtml = `
                <div class="detail-section">
                    <h3 data-i18n="tenants.details.basic">Basic Information</h3>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.table.id">ID</span>
                        <span class="detail-value">${tenant.id}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.form.company_name">Company Name</span>
                        <span class="detail-value">${escapeHtml(tenant.company_name || 'N/A')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.form.name">Contact Name</span>
                        <span class="detail-value">${escapeHtml(tenant.name)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.form.subdomain">Subdomain</span>
                        <span class="detail-value">${escapeHtml(tenant.subdomain)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.form.email">Email</span>
                        <span class="detail-value">${escapeHtml(tenant.email)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.form.phone">Phone</span>
                        <span class="detail-value">${escapeHtml(tenant.phone || 'N/A')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.table.status">Status</span>
                        <span class="detail-value"><span class="status-badge status-${tenant.status}">${tenant.status}</span></span>
                    </div>
                </div>

                <div class="detail-section">
                    <h3 data-i18n="tenants.details.subscription">Subscription</h3>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.table.plan">Plan</span>
                        <span class="detail-value">${tenant.plan_name || 'N/A'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.details.price">Price</span>
                        <span class="detail-value">$${tenant.plan_price || 0}/${tenant.billing_period || 'month'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.table.created">Created</span>
                        <span class="detail-value">${formatDate(tenant.created_at)}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <h3 data-i18n="tenants.details.limits">Resource Limits</h3>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.form.max_users">Max Users</span>
                        <span class="detail-value">${tenant.max_users}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.form.max_stores">Max Stores</span>
                        <span class="detail-value">${tenant.max_stores}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.form.max_departments">Max Departments</span>
                        <span class="detail-value">${tenant.max_departments}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.form.max_contacts">Max Contacts</span>
                        <span class="detail-value">${tenant.max_contacts}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.form.max_devices">Max Devices</span>
                        <span class="detail-value">${tenant.max_devices}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.form.max_conversations">Max Conversations</span>
                        <span class="detail-value">${tenant.max_conversations}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.form.max_messages">Max Messages/Month</span>
                        <span class="detail-value">${tenant.max_messages_per_month}</span>
                    </div>
                </div>

                <div class="detail-section">
                    <h3 data-i18n="tenants.details.usage">Current Usage</h3>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.usage.users">Users</span>
                        <span class="detail-value">${stats.user_count || 0}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.usage.conversations">Conversations</span>
                        <span class="detail-value">${stats.conversation_count || 0}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label" data-i18n="tenants.usage.messages">Messages</span>
                        <span class="detail-value">${stats.message_count || 0}</span>
                    </div>
                </div>
            `;

            document.getElementById('tenantDetails').innerHTML = detailsHtml;
            applyTranslations();
            document.getElementById('viewModal').classList.add('active');
        }
    } catch (error) {
        console.error('Error loading tenant details:', error);
        showAlert('Error loading tenant details', 'error');
    }
}

/**
 * Open resources modal
 */
async function openResourcesModal(id) {
    try {
        const response = await fetch(`/api/superadmin/tenants/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const tenant = data.tenant;

            document.getElementById('resourceTenantId').value = tenant.id;
            document.getElementById('resMaxUsers').value = tenant.max_users;
            document.getElementById('resMaxStores').value = tenant.max_stores;
            document.getElementById('resMaxDepartments').value = tenant.max_departments;
            document.getElementById('resMaxContacts').value = tenant.max_contacts;
            document.getElementById('resMaxDevices').value = tenant.max_devices;
            document.getElementById('resMaxConversations').value = tenant.max_conversations;
            document.getElementById('resMaxMessages').value = tenant.max_messages_per_month;

            // Get plan features
            const plan = allPlans.find(p => p.id === tenant.plan_id);
            if (plan) {
                document.getElementById('whatsappEnabled').checked = plan.whatsapp_enabled;
                document.getElementById('aiEnabled').checked = plan.ai_enabled;
                document.getElementById('analyticsEnabled').checked = plan.analytics_enabled;
                document.getElementById('apiAccessEnabled').checked = plan.api_access_enabled;
            }

            document.getElementById('resourcesModal').classList.add('active');
        }
    } catch (error) {
        console.error('Error loading tenant:', error);
        showAlert('Error loading tenant details', 'error');
    }
}

/**
 * Save resources
 */
async function saveResources(event) {
    event.preventDefault();

    const tenantId = document.getElementById('resourceTenantId').value;
    const data = {
        max_users: parseInt(document.getElementById('resMaxUsers').value),
        max_stores: parseInt(document.getElementById('resMaxStores').value),
        max_departments: parseInt(document.getElementById('resMaxDepartments').value),
        max_contacts: parseInt(document.getElementById('resMaxContacts').value),
        max_devices: parseInt(document.getElementById('resMaxDevices').value),
        max_conversations: parseInt(document.getElementById('resMaxConversations').value),
        max_messages_per_month: parseInt(document.getElementById('resMaxMessages').value)
    };

    try {
        const response = await fetch(`/api/superadmin/tenants/${tenantId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            showAlert('Resources updated successfully', 'success');
            closeModal('resourcesModal');
            loadTenants();
        } else {
            const error = await response.json();
            showAlert(error.message || 'Error updating resources', 'error');
        }
    } catch (error) {
        console.error('Error updating resources:', error);
        showAlert('Error updating resources', 'error');
    }
}

/**
 * Suspend tenant
 */
async function suspendTenant(id) {
    if (!confirm('Are you sure you want to suspend this tenant?')) return;

    try {
        const response = await fetch(`/api/superadmin/tenants/${id}/deactivate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            }
        });

        if (response.ok) {
            showAlert('Tenant suspended successfully', 'success');
            loadTenants();
        } else {
            showAlert('Error suspending tenant', 'error');
        }
    } catch (error) {
        console.error('Error suspending tenant:', error);
        showAlert('Error suspending tenant', 'error');
    }
}

/**
 * Activate tenant
 */
async function activateTenant(id) {
    if (!confirm('Are you sure you want to activate this tenant?')) return;

    try {
        const response = await fetch(`/api/superadmin/tenants/${id}/activate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            }
        });

        if (response.ok) {
            showAlert('Tenant activated successfully', 'success');
            loadTenants();
        } else {
            showAlert('Error activating tenant', 'error');
        }
    } catch (error) {
        console.error('Error activating tenant:', error);
        showAlert('Error activating tenant', 'error');
    }
}

/**
 * Delete tenant
 */
async function deleteTenant(id) {
    if (!confirm('Are you sure you want to delete this tenant? This action cannot be undone!')) return;

    try {
        const response = await fetch(`/api/superadmin/tenants/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('superadmin_token')}`
            }
        });

        if (response.ok) {
            showAlert('Tenant deleted successfully', 'success');
            loadTenants();
        } else {
            showAlert('Error deleting tenant', 'error');
        }
    } catch (error) {
        console.error('Error deleting tenant:', error);
        showAlert('Error deleting tenant', 'error');
    }
}

/**
 * Close modal
 */
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    if (modalId === 'tenantModal') {
        document.getElementById('subdomain').disabled = false;
        document.getElementById('adminUsername').required = true;
        document.getElementById('adminPassword').required = true;
        document.getElementById('adminUsername').closest('.form-row').style.display = '';
        document.getElementById('adminEmail').closest('.form-group').style.display = '';
    }
}

/**
 * Show loading state
 */
function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

/**
 * Show alert
 */
function showAlert(message, type = 'info') {
    const alert = document.getElementById('alert');
    alert.className = `alert alert-${type} active`;
    alert.textContent = message;

    setTimeout(() => {
        alert.classList.remove('active');
    }, 5000);
}

/**
 * Format date
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    // Check if date is valid
    if (isNaN(date.getTime())) {
        return 'N/A';
    }
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
