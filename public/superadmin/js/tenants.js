/**
 * Tenants Management Module
 * Enhanced with resource management, usage statistics, and feature toggling
 */

let tenantsData = {
    currentPage: 1,
    limit: 10,
    total: 0,
    search: '',
    status: '',
    planFilter: ''
};

let allPlans = [];

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function loadTenants() {
    const content = document.getElementById('content');
    showLoading(content);

    try {
        // Load plans if not loaded
        if (allPlans.length === 0) {
            const plansResponse = await apiRequest('/superadmin/plans');
            allPlans = plansResponse.data || [];
        }

        const params = new URLSearchParams({
            page: tenantsData.currentPage,
            limit: tenantsData.limit,
            ...(tenantsData.search && { search: tenantsData.search }),
            ...(tenantsData.status && { status: tenantsData.status }),
            ...(tenantsData.planFilter && { plan_id: tenantsData.planFilter })
        });

        const response = await apiRequest(`/superadmin/tenants?${params}`);
        const { tenants, pagination } = response.data;
        tenantsData.total = pagination.total;

        // Calculate statistics
        const stats = {
            total: tenants.length,
            active: tenants.filter(t => t.status === 'active').length,
            pending: tenants.filter(t => t.status === 'pending').length,
            suspended: tenants.filter(t => t.status === 'suspended').length
        };

        content.innerHTML = `
            <!-- Statistics Cards -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 0.2rem; margin-bottom: 1.5rem;">
                <div class="card" style="background: linear-gradient(135deg, #00a149 0%, #319131 100%); color: white;">
                    <div style="padding: 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="width: 50px; height: 50px; background: rgba(255,255,255,0.2); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                                <i class="fas fa-building"></i>
                            </div>
                            <div>
                                <div style="font-size: 14px; opacity: 0.9;">Total Tenants</div>
                                <div style="font-size: 32px; font-weight: bold;">${pagination.total}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card" style="background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: white;">
                    <div style="padding: 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="width: 50px; height: 50px; background: rgba(255,255,255,0.2); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                                <i class="fas fa-check-circle"></i>
                            </div>
                            <div>
                                <div style="font-size: 14px; opacity: 0.9;">Active</div>
                                <div style="font-size: 32px; font-weight: bold;">${stats.active}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card" style="background: linear-gradient(135deg, #ed8936 0%, #dd6b20 100%); color: white;">
                    <div style="padding: 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="width: 50px; height: 50px; background: rgba(255,255,255,0.2); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                                <i class="fas fa-clock"></i>
                            </div>
                            <div>
                                <div style="font-size: 14px; opacity: 0.9;">Pending</div>
                                <div style="font-size: 32px; font-weight: bold;">${stats.pending}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card" style="background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%); color: white;">
                    <div style="padding: 1.5rem;">
                        <div style="display: flex; align-items: center; gap: 1rem;">
                            <div style="width: 50px; height: 50px; background: rgba(255,255,255,0.2); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px;">
                                <i class="fas fa-ban"></i>
                            </div>
                            <div>
                                <div style="font-size: 14px; opacity: 0.9;">Suspended</div>
                                <div style="font-size: 32px; font-weight: bold;">${stats.suspended}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card-header" style="background: white; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                    <h1 style="margin: 0; color: var(--dark);">Tenants Management</h1>
                    <button class="btn btn-primary" onclick="showCreateTenantModal()">
                        <i class="fas fa-plus"></i> Create Tenant
                    </button>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap;">
                    <input type="text" class="form-control" placeholder="Search by name, email..." 
                           style="max-width: 300px;" id="searchInput" value="${tenantsData.search}">
                    <select class="form-control" style="max-width: 200px;" id="statusFilter">
                        <option value="">All Status</option>
                        <option value="active" ${tenantsData.status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="pending" ${tenantsData.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="suspended" ${tenantsData.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                        <option value="cancelled" ${tenantsData.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                        <option value="grace_period" ${tenantsData.status === 'grace_period' ? 'selected' : ''}>Grace Period</option>
                    </select>
                    <select class="form-control" style="max-width: 200px;" id="planFilter">
                        <option value="">All Plans</option>
                        ${allPlans.map(plan => `<option value="${plan.id}" ${tenantsData.planFilter == plan.id ? 'selected' : ''}>${plan.name}</option>`).join('')}
                    </select>
                    <button class="btn btn-primary" onclick="filterTenants()">
                        <i class="fas fa-search"></i> Search
                    </button>
                </div>
            </div>

            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Plan</th>
                                <th>Status</th>
                                <th>Created</th>
                                <th style="min-width: 200px;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tenants.map(tenant => `
                                <tr>
                                    <td>${tenant.id}</td>
                                    <td><strong>${tenant.name}</strong></td>
                                    <td><code>${tenant.subdomain}</code></td>
                                    <td>${tenant.email}</td>
                                    <td>${tenant.plan_name || 'N/A'}</td>
                                    <td><span class="badge badge-${getStatusColor(tenant.status)}">${tenant.status}</span></td>
                                    <td>${formatDate(tenant.created_at)}</td>
                                    <td>
                                        <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
                                            <button class="btn btn-secondary" data-tenant-action="view" data-tenant-id="${tenant.id}" data-tenant-name="${escapeHtml(tenant.name)}" style="padding: 0.375rem 0.75rem;" title="View Details">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button class="btn btn-primary" data-tenant-action="edit" data-tenant-id="${tenant.id}" data-tenant-name="${escapeHtml(tenant.name)}" style="padding: 0.375rem 0.75rem;" title="Edit">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button class="btn btn-warning" data-tenant-action="resources" data-tenant-id="${tenant.id}" data-tenant-name="${escapeHtml(tenant.name)}" style="padding: 0.375rem 0.75rem;" title="Manage Resources">
                                                <i class="fas fa-cog"></i>
                                            </button>
                                            ${tenant.status === 'active' ? 
                                                `<button class="btn btn-danger" data-tenant-action="suspend" data-tenant-id="${tenant.id}" data-tenant-name="${escapeHtml(tenant.name)}" style="padding: 0.375rem 0.75rem;" title="Suspend">
                                                    <i class="fas fa-ban"></i>
                                                </button>` :
                                                `<button class="btn btn-success" data-tenant-action="activate" data-tenant-id="${tenant.id}" data-tenant-name="${escapeHtml(tenant.name)}" style="padding: 0.375rem 0.75rem;" title="Activate">
                                                    <i class="fas fa-check"></i>
                                                </button>`
                                            }
                                            <button class="btn btn-danger" data-tenant-action="delete" data-tenant-id="${tenant.id}" data-tenant-name="${escapeHtml(tenant.name)}" style="padding: 0.375rem 0.75rem;" title="Delete">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                ${renderPagination(pagination)}
            </div>
        `;

        const table = content.querySelector('table');
        if (table) {
            table.addEventListener('click', onTenantTableClick);
        }

        // Setup event listeners
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') filterTenants();
        });
    } catch (error) {
        showError(content, error.message);
    }
}

function onTenantTableClick(event) {
    const button = event.target.closest('[data-tenant-action]');
    if (!button) return;
    const action = button.dataset.tenantAction;
    const id = parseInt(button.dataset.tenantId, 10);
    const name = button.dataset.tenantName || '';

    if (!id) return;

    switch (action) {
        case 'view':
            viewTenant(id);
            break;
        case 'edit':
            editTenant(id);
            break;
        case 'resources':
            manageResources(id);
            break;
        case 'activate':
            activateTenant(id, name, button);
            break;
        case 'suspend':
            suspendTenant(id, name, button);
            break;
        case 'delete':
            deleteTenant(id, name, button);
            break;
    }
}

function filterTenants() {
    tenantsData.search = document.getElementById('searchInput').value;
    tenantsData.status = document.getElementById('statusFilter').value;
    tenantsData.planFilter = document.getElementById('planFilter').value;
    tenantsData.currentPage = 1;
    loadTenants();
}

function renderPagination(pagination) {
    const pages = [];
    for (let i = 1; i <= pagination.totalPages; i++) {
        pages.push(i);
    }

    return `
        <div class="pagination">
            <button ${pagination.page === 1 ? 'disabled' : ''} onclick="changePage(${pagination.page - 1})">
                <i class="fas fa-chevron-left"></i>
            </button>
            ${pages.map(page => `
                <button class="${page === pagination.page ? 'active' : ''}" onclick="changePage(${page})">
                    ${page}
                </button>
            `).join('')}
            <button ${pagination.page === pagination.totalPages ? 'disabled' : ''} onclick="changePage(${pagination.page + 1})">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
}

function changePage(page) {
    tenantsData.currentPage = page;
    loadTenants();
}

async function showCreateTenantModal() {
    // Get plans for dropdown
    const plansResponse = await apiRequest('/superadmin/plans');
    const plans = plansResponse.data || [];

    const content = `
        <form id="createTenantForm">
            <div class="form-group">
                <label class="form-label">Tenant Name *</label>
                <input type="text" class="form-control" name="name" required>
            </div>
            <div class="form-group">
                <label class="form-label">Email *</label>
                <input type="email" class="form-control" name="email" required>
            </div>
            <div class="form-group">
                <label class="form-label">Phone</label>
                <input type="text" class="form-control" name="phone">
            </div>
            <div class="form-group">
                <label class="form-label">Company Name</label>
                <input type="text" class="form-control" name="company_name">
            </div>
            <div class="form-group">
                <label class="form-label">Plan *</label>
                <select class="form-control" name="plan_id" required>
                    <option value="">Select Plan</option>
                    ${plans.map(plan => `<option value="${plan.id}">${plan.name} - ${formatCurrency(plan.price)}</option>`).join('')}
                </select>
            </div>
            <hr>
            <h4>Admin Account</h4>
            <div class="form-group">
                <label class="form-label">Admin Username *</label>
                <input type="text" class="form-control" name="admin_username" required>
            </div>
            <div class="form-group">
                <label class="form-label">Admin Password *</label>
                <input type="password" class="form-control" name="admin_password" required minlength="8">
            </div>
            <div class="form-group">
                <label class="form-label">Admin Email</label>
                <input type="email" class="form-control" name="admin_email">
            </div>
        </form>
    `;

    const footer = `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitCreateTenant()">Create Tenant</button>
    `;

    createModal('Create New Tenant', content, footer);
}

async function submitCreateTenant() {
    const form = document.getElementById('createTenantForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
        await apiRequest('/superadmin/tenants', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        closeModal();
        showSuccess('Tenant created successfully!');
        loadTenants();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function viewTenant(id) {
    try {
        const response = await apiRequest(`/superadmin/tenants/${id}`);
        const { tenant, statistics } = response.data;

        const content = `
            <div style="display: grid; gap: 1.5rem;">
                <div>
                    <h4 style="color: var(--primary); margin-bottom: 1rem; border-bottom: 2px solid var(--light); padding-bottom: 0.5rem;">
                        <i class="fas fa-info-circle"></i> Basic Information
                    </h4>
                    <div style="display: grid; gap: 0.75rem;">
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--light); border-radius: 6px;">
                            <strong>ID:</strong> <span>${tenant.id}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--light); border-radius: 6px;">
                            <strong>Name:</strong> <span>${tenant.name}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--light); border-radius: 6px;">
                            <strong>Subdomain:</strong> <code>${tenant.subdomain}</code>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--light); border-radius: 6px;">
                            <strong>Email:</strong> <span>${tenant.email}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--light); border-radius: 6px;">
                            <strong>Phone:</strong> <span>${tenant.phone || 'N/A'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--light); border-radius: 6px;">
                            <strong>Company:</strong> <span>${tenant.company_name || 'N/A'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--light); border-radius: 6px;">
                            <strong>Status:</strong> <span class="badge badge-${getStatusColor(tenant.status)}">${tenant.status}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--light); border-radius: 6px;">
                            <strong>Created:</strong> <span>${formatDate(tenant.created_at)}</span>
                        </div>
                    </div>
                </div>

                <div>
                    <h4 style="color: var(--primary); margin-bottom: 1rem; border-bottom: 2px solid var(--light); padding-bottom: 0.5rem;">
                        <i class="fas fa-box"></i> Subscription
                    </h4>
                    <div style="display: grid; gap: 0.75rem;">
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--light); border-radius: 6px;">
                            <strong>Plan:</strong> <span>${tenant.plan_name}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 0.5rem; background: var(--light); border-radius: 6px;">
                            <strong>Price:</strong> <span>${formatCurrency(tenant.plan_price)}/${tenant.billing_period}</span>
                        </div>
                    </div>
                </div>

                <div>
                    <h4 style="color: var(--primary); margin-bottom: 1rem; border-bottom: 2px solid var(--light); padding-bottom: 0.5rem;">
                        <i class="fas fa-chart-line"></i> Current Usage
                    </h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                        <div style="text-align: center; padding: 1rem; background: linear-gradient(135deg, #00a149 0%, #319131 100%); color: white; border-radius: 10px;">
                            <div style="font-size: 32px; font-weight: bold;">${statistics.user_count}</div>
                            <div style="font-size: 14px; opacity: 0.9;">Users</div>
                        </div>
                        <div style="text-align: center; padding: 1rem; background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); color: white; border-radius: 10px;">
                            <div style="font-size: 32px; font-weight: bold;">${statistics.conversation_count}</div>
                            <div style="font-size: 14px; opacity: 0.9;">Conversations</div>
                        </div>
                        <div style="text-align: center; padding: 1rem; background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%); color: white; border-radius: 10px;">
                            <div style="font-size: 32px; font-weight: bold;">${statistics.message_count}</div>
                            <div style="font-size: 14px; opacity: 0.9;">Messages</div>
                        </div>
                    </div>
                </div>

                <div style="text-align: center; padding-top: 1rem; border-top: 2px solid var(--light);">
                    <button class="btn btn-primary" onclick="closeModal(); viewTenantUsage(${id})">
                        <i class="fas fa-chart-bar"></i> View Detailed Usage Statistics
                    </button>
                </div>
            </div>
        `;

        createModal('Tenant Details', content);
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function editTenant(id) {
    try {
        const response = await apiRequest(`/superadmin/tenants/${id}`);
        const tenant = response.data.tenant;

        const plansResponse = await apiRequest('/superadmin/plans');
        const plans = plansResponse.data || [];

        const content = `
            <form id="editTenantForm">
                <div class="form-group">
                    <label class="form-label">Name</label>
                    <input type="text" class="form-control" name="name" value="${tenant.name}">
                </div>
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" class="form-control" name="email" value="${tenant.email}">
                </div>
                <div class="form-group">
                    <label class="form-label">Phone</label>
                    <input type="text" class="form-control" name="phone" value="${tenant.phone || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Company Name</label>
                    <input type="text" class="form-control" name="company_name" value="${tenant.company_name || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Plan</label>
                    <select class="form-control" name="plan_id">
                        ${plans.map(plan => `<option value="${plan.id}" ${plan.id === tenant.plan_id ? 'selected' : ''}>${plan.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <select class="form-control" name="status">
                        <option value="active" ${tenant.status === 'active' ? 'selected' : ''}>Active</option>
                        <option value="pending" ${tenant.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="suspended" ${tenant.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                        <option value="cancelled" ${tenant.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="submitEditTenant(${id})">Update</button>
        `;

        createModal('Edit Tenant', content, footer);
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function submitEditTenant(id) {
    const form = document.getElementById('editTenantForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
        await apiRequest(`/superadmin/tenants/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        closeModal();
        showSuccess('Tenant updated successfully!');
        loadTenants();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function deleteTenant(id, name, button) {
    const confirmAction = () => {
        const originalHtml = button ? button.innerHTML : null;
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        apiRequest(`/superadmin/tenants/${id}`, {
            method: 'DELETE'
        }).then(() => {
            showSuccess('Tenant deleted successfully!');
            loadTenants();
        }).catch(error => {
            showAlert('Error: ' + error.message, 'error');
        }).finally(() => {
            if (button) {
                button.disabled = false;
                button.innerHTML = originalHtml;
            }
        });
    };

    if (window.showConfirm) {
        showConfirm(`Are you sure you want to delete tenant "${name}"? This action cannot be undone and will delete all tenant data.`, confirmAction);
    } else if (confirm(`Are you sure you want to delete tenant "${name}"? This action cannot be undone and will delete all tenant data.`)) {
        confirmAction();
    }
}

// ==================== NEW ADVANCED FUNCTIONS ====================

/**
 * Manage tenant resources and features
 */
async function manageResources(id) {
    try {
        const response = await apiRequest(`/superadmin/tenants/${id}`);
        const tenant = response.data.tenant;
        
        console.log('Tenant data loaded:', {
            id: tenant.id,
            max_users: tenant.max_users,
            max_stores: tenant.max_stores,
            max_departments: tenant.max_departments,
            max_contacts: tenant.max_contacts,
            max_devices: tenant.max_devices,
            max_conversations: tenant.max_conversations,
            max_messages_per_month: tenant.max_messages_per_month
        });

        // Get plan to show default features
        const plan = allPlans.find(p => p.id === tenant.plan_id) || {};

        // Get tenant-specific settings (overrides)
        const settings = tenant.settings ? (typeof tenant.settings === 'string' ? JSON.parse(tenant.settings) : tenant.settings) : {};
        
        // Determine actual feature status (tenant settings override plan defaults)
        const features = {
            whatsapp_enabled: settings.whatsapp_enabled !== undefined ? settings.whatsapp_enabled : plan.whatsapp_enabled,
            ai_enabled: settings.ai_enabled !== undefined ? settings.ai_enabled : plan.ai_enabled,
            analytics_enabled: settings.analytics_enabled !== undefined ? settings.analytics_enabled : plan.analytics_enabled,
            api_access_enabled: settings.api_access_enabled !== undefined ? settings.api_access_enabled : plan.api_access_enabled,
            custom_branding_enabled: settings.custom_branding_enabled !== undefined ? settings.custom_branding_enabled : plan.custom_branding_enabled
        };

        const content = `
            <form id="resourcesForm">
                <h4 style="margin-bottom: 1rem; color: var(--primary);">
                    <i class="fas fa-sliders-h"></i> Resource Limits
                </h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                    <div class="form-group">
                        <label class="form-label">Max Users</label>
                        <input type="number" class="form-control" name="max_users" value="${tenant.max_users}" min="1">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max Stores</label>
                        <input type="number" class="form-control" name="max_stores" value="${tenant.max_stores}" min="1">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max Departments</label>
                        <input type="number" class="form-control" name="max_departments" value="${tenant.max_departments}" min="1">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max Contacts</label>
                        <input type="number" class="form-control" name="max_contacts" value="${tenant.max_contacts}" min="1">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max Devices</label>
                        <input type="number" class="form-control" name="max_devices" value="${tenant.max_devices}" min="1">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max Conversations</label>
                        <input type="number" class="form-control" name="max_conversations" value="${tenant.max_conversations}" min="1">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max Messages/Month</label>
                        <input type="number" class="form-control" name="max_messages_per_month" value="${tenant.max_messages_per_month}" min="1">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max FAQs</label>
                        <input type="number" class="form-control" name="max_faqs" value="${tenant.max_faqs || 10}" min="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max Widgets</label>
                        <input type="number" class="form-control" name="max_widgets" value="${tenant.max_widgets || 0}" min="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max Invoices/Month</label>
                        <input type="number" class="form-control" name="max_invoices_per_month" value="${tenant.max_invoices_per_month || 0}" min="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max Quotes/Month</label>
                        <input type="number" class="form-control" name="max_quotes_per_month" value="${tenant.max_quotes_per_month || 0}" min="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Max Payment Links/Month</label>
                        <input type="number" class="form-control" name="max_payment_links_per_month" value="${tenant.max_payment_links_per_month || 0}" min="0">
                    </div>
                </div>

                <h4 style="margin-bottom: 1rem; color: var(--primary);">
                    <i class="fas fa-puzzle-piece"></i> Features Control
                </h4>
                <div style="display: grid; gap: 0.75rem; margin-bottom: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: var(--light); border-radius: 8px;">
                        <i class="fab fa-whatsapp" style="color: ${features.whatsapp_enabled ? 'var(--success)' : 'var(--secondary)'}; font-size: 20px;"></i>
                        <span style="flex: 1;">WhatsApp Integration</span>
                        <button type="button" class="btn btn-${features.whatsapp_enabled ? 'success' : 'secondary'}" 
                                onclick="toggleFeature(${id}, 'whatsapp_enabled', ${!features.whatsapp_enabled}, event)"
                                style="padding: 0.375rem 0.75rem; min-width: 90px;">
                            ${features.whatsapp_enabled ? '<i class="fas fa-check"></i> Enabled' : '<i class="fas fa-times"></i> Disabled'}
                        </button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: var(--light); border-radius: 8px;">
                        <i class="fas fa-robot" style="color: ${features.ai_enabled ? 'var(--success)' : 'var(--secondary)'}; font-size: 20px;"></i>
                        <span style="flex: 1;">AI Features</span>
                        <button type="button" class="btn btn-${features.ai_enabled ? 'success' : 'secondary'}" 
                                onclick="toggleFeature(${id}, 'ai_enabled', ${!features.ai_enabled}, event)"
                                style="padding: 0.375rem 0.75rem; min-width: 90px;">
                            ${features.ai_enabled ? '<i class="fas fa-check"></i> Enabled' : '<i class="fas fa-times"></i> Disabled'}
                        </button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: var(--light); border-radius: 8px;">
                        <i class="fas fa-chart-line" style="color: ${features.analytics_enabled ? 'var(--success)' : 'var(--secondary)'}; font-size: 20px;"></i>
                        <span style="flex: 1;">Analytics</span>
                        <button type="button" class="btn btn-${features.analytics_enabled ? 'success' : 'secondary'}" 
                                onclick="toggleFeature(${id}, 'analytics_enabled', ${!features.analytics_enabled}, event)"
                                style="padding: 0.375rem 0.75rem; min-width: 90px;">
                            ${features.analytics_enabled ? '<i class="fas fa-check"></i> Enabled' : '<i class="fas fa-times"></i> Disabled'}
                        </button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: var(--light); border-radius: 8px;">
                        <i class="fas fa-plug" style="color: ${features.api_access_enabled ? 'var(--success)' : 'var(--secondary)'}; font-size: 20px;"></i>
                        <span style="flex: 1;">API Access</span>
                        <button type="button" class="btn btn-${features.api_access_enabled ? 'success' : 'secondary'}" 
                                onclick="toggleFeature(${id}, 'api_access_enabled', ${!features.api_access_enabled}, event)"
                                style="padding: 0.375rem 0.75rem; min-width: 90px;">
                            ${features.api_access_enabled ? '<i class="fas fa-check"></i> Enabled' : '<i class="fas fa-times"></i> Disabled'}
                        </button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: var(--light); border-radius: 8px;">
                        <i class="fas fa-palette" style="color: ${features.custom_branding_enabled ? 'var(--success)' : 'var(--secondary)'}; font-size: 20px;"></i>
                        <span style="flex: 1;">Custom Branding</span>
                        <button type="button" class="btn btn-${features.custom_branding_enabled ? 'success' : 'secondary'}" 
                                onclick="toggleFeature(${id}, 'custom_branding_enabled', ${!features.custom_branding_enabled}, event)"
                                style="padding: 0.375rem 0.75rem; min-width: 90px;">
                            ${features.custom_branding_enabled ? '<i class="fas fa-check"></i> Enabled' : '<i class="fas fa-times"></i> Disabled'}
                        </button>
                    </div>
                </div>

                <div style="padding: 1rem; background: var(--info-light); border-left: 4px solid var(--info); border-radius: 8px; margin-top: 1rem;">
                    <i class="fas fa-info-circle"></i> <strong>Note:</strong> Click on the buttons above to enable or disable features for this tenant. Changes are applied immediately and override the plan defaults.
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="submitResourcesUpdate(${id})">Update Limits</button>
        `;

        createModal('Manage Resources & Features', content, footer);
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

/**
 * Submit resources update
 */
async function submitResourcesUpdate(id) {
    const form = document.getElementById('resourcesForm');
    if (!form) {
        showAlert('Form not found', 'error');
        return;
    }

    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    // Fields that can be 0
    const canBeZero = ['max_faqs', 'max_widgets', 'max_invoices_per_month', 'max_quotes_per_month', 'max_payment_links_per_month'];

    // Convert to integers and validate
    let hasError = false;
    Object.keys(data).forEach(key => {
        const value = parseInt(data[key]);
        const minValue = canBeZero.includes(key) ? 0 : 1;
        if (isNaN(value) || value < minValue) {
            showAlert(`Invalid value for ${key}. Must be ${minValue === 0 ? 'a non-negative' : 'a positive'} number.`, 'error');
            hasError = true;
        }
        data[key] = value;
    });

    if (hasError) {
        return;
    }

    try {
        console.log('Updating tenant resources:', id, data);
        
        const response = await apiRequest(`/superadmin/tenants/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        if (response.success) {
            // Close the modal properly
            const modal = document.getElementById('dynamicModal') || document.getElementById('customModal');
            if (modal) {
                modal.remove();
            }
            
            showSuccess('Resources updated successfully!');
            await loadTenants();
        } else {
            showAlert('Error: ' + (response.message || 'Failed to update resources'), 'error');
        }
    } catch (error) {
        console.error('Error updating resources:', error);
        showAlert('Error: ' + error.message, 'error');
    }
}

/**
 * Suspend tenant
 */
async function suspendTenant(id, name, button) {
    const confirmAction = async () => {
        const originalHtml = button ? button.innerHTML : null;
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        try {
            await apiRequest(`/superadmin/tenants/${id}/deactivate`, {
                method: 'POST'
            });
            showSuccess('Tenant suspended successfully!');
            loadTenants();
        } catch (error) {
            showAlert('Error: ' + error.message, 'error');
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = originalHtml;
            }
        }
    };

    if (window.showConfirm) {
        showConfirm(`Are you sure you want to suspend tenant "${name}"? They will lose access to the system.`, confirmAction);
    } else if (confirm(`Are you sure you want to suspend tenant "${name}"? They will lose access to the system.`)) {
        await confirmAction();
    }
}

/**
 * Activate tenant
 */
async function activateTenant(id, name, button) {
    const confirmAction = async () => {
        const originalHtml = button ? button.innerHTML : null;
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        try {
            await apiRequest(`/superadmin/tenants/${id}/activate`, {
                method: 'POST',
                body: JSON.stringify({ payment_confirmed: false })
            });
            showSuccess('Tenant activated successfully!');
            loadTenants();
        } catch (error) {
            showAlert('Error: ' + error.message, 'error');
        } finally {
            if (button) {
                button.disabled = false;
                button.innerHTML = originalHtml;
            }
        }
    };

    if (window.showConfirm) {
        showConfirm(`Are you sure you want to activate tenant "${name}"?`, confirmAction);
    } else if (confirm(`Are you sure you want to activate tenant "${name}"?`)) {
        await confirmAction();
    }
}

/**
 * View tenant usage statistics
 */
async function viewTenantUsage(id) {
    try {
        const response = await apiRequest(`/superadmin/tenants/${id}/usage`);
        const { limits, current, percentages } = response.data;

        const content = `
            <div style="display: grid; gap: 1rem;">
                <h4 style="color: var(--primary); margin-bottom: 0.5rem;">
                    <i class="fas fa-chart-bar"></i> Resource Usage
                </h4>
                
                ${renderUsageBar('Users', current.current_users, limits.max_users, percentages.users)}
                ${renderUsageBar('Stores', current.current_stores, limits.max_stores, percentages.stores)}
                ${renderUsageBar('Departments', current.current_departments, limits.max_departments, percentages.departments)}
                ${renderUsageBar('Contacts', current.current_contacts, limits.max_contacts, percentages.contacts)}
                ${renderUsageBar('Conversations', current.current_conversations, limits.max_conversations, percentages.conversations)}
                ${renderUsageBar('Messages (this month)', current.current_messages, limits.max_messages_per_month, percentages.messages)}
            </div>
        `;

        createModal('Tenant Usage Statistics', content);
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

/**
 * Render usage bar
 */
function renderUsageBar(label, current, max, percentage) {
    const percent = parseFloat(percentage);
    const color = percent >= 90 ? 'var(--danger)' : percent >= 70 ? 'var(--warning)' : 'var(--success)';
    
    return `
        <div style="margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>${label}</strong>
                <span>${current} / ${max} (${percent}%)</span>
            </div>
            <div style="width: 100%; height: 24px; background: var(--light); border-radius: 12px; overflow: hidden;">
                <div style="width: ${Math.min(percent, 100)}%; height: 100%; background: ${color}; transition: width 0.3s;"></div>
            </div>
        </div>
    `;
}

/**
 * Toggle tenant feature
 */
async function toggleFeature(tenantId, featureName, enabled, evt) {
    try {
        // Prevent default and stop propagation
        if (evt) {
            evt.preventDefault();
            evt.stopPropagation();
        }

        // Show loading state
        const button = evt ? evt.target.closest('button') : null;
        let originalContent = '';
        
        if (button) {
            originalContent = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        }

        console.log('Toggling feature:', { tenantId, featureName, enabled });

        const response = await apiRequest(`/superadmin/tenants/${tenantId}/features/${featureName}`, {
            method: 'PUT',
            body: JSON.stringify({ enabled })
        });

        if (response.success) {
            showSuccess(`Feature ${enabled ? 'enabled' : 'disabled'} successfully!`);
            
            // Update button state
            if (button) {
                button.disabled = false;
                button.className = `btn btn-${enabled ? 'success' : 'secondary'}`;
                button.innerHTML = enabled ? '<i class="fas fa-check"></i> Enabled' : '<i class="fas fa-times"></i> Disabled';
                
                // Update the onclick to toggle back
                button.setAttribute('onclick', `toggleFeature(${tenantId}, '${featureName}', ${!enabled}, event)`);
                
                // Update icon color
                const icon = button.parentElement.querySelector('i:first-child');
                if (icon) {
                    icon.style.color = enabled ? 'var(--success)' : 'var(--secondary)';
                }
            }
            
            // Reload tenants list in background (without reopening modal)
            loadTenants();
        } else {
            showAlert('Error: ' + (response.message || 'Failed to toggle feature'), 'error');
            
            // Restore button state on error
            if (button) {
                button.disabled = false;
                button.innerHTML = originalContent;
            }
        }
        
    } catch (error) {
        console.error('Error toggling feature:', error);
        
        // Restore button state on error
        if (button) {
            button.disabled = false;
            button.innerHTML = originalContent;
        }
        showAlert('Error: ' + error.message, 'error');
    }
}
