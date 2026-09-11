/**
 * Dashboard Module
 */

async function loadDashboard() {
    const content = document.getElementById('content');
    showLoading(content);

    try {
        // Ensure default currency is loaded before rendering
        if (typeof loadDefaultCurrency === 'function') {
            await loadDefaultCurrency();
        }
        const response = await apiRequest('/superadmin/dashboard');
        const data = response.data;

        content.innerHTML = `
            <h1 style="margin-bottom: 2rem; color: var(--dark);" data-i18n="superadmin.dashboard.title">Dashboard</h1>

            <!-- Stats Grid -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-header">
                        <div>
                            <div class="stat-value">${data.tenants.total || 0}</div>
                            <div class="stat-label" data-i18n="superadmin.dashboard.total_tenants">Total Tenants</div>
                        </div>
                        <div class="stat-icon primary">
                            <i class="fas fa-building"></i>
                        </div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-header">
                        <div>
                            <div class="stat-value">${data.tenants.active || 0}</div>
                            <div class="stat-label" data-i18n="superadmin.dashboard.active_tenants">Active Tenants</div>
                        </div>
                        <div class="stat-icon success">
                            <i class="fas fa-check-circle"></i>
                        </div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-header">
                        <div>
                            <div class="stat-value">${data.tenants.trial || 0}</div>
                            <div class="stat-label" data-i18n="superadmin.dashboard.trial_tenants">Trial Tenants</div>
                        </div>
                        <div class="stat-icon warning">
                            <i class="fas fa-clock"></i>
                        </div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-header">
                        <div>
                            <div class="stat-value">${formatCurrency(data.revenue.monthly_revenue || 0)}</div>
                            <div class="stat-label" data-i18n="superadmin.dashboard.monthly_revenue">Monthly Revenue</div>
                        </div>
                        <div class="stat-icon success">
                            <i class="fas fa-dollar-sign"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Recent Tenants -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title" data-i18n="superadmin.dashboard.recent_tenants">Recent Tenants</h3>
                    <button class="btn btn-primary" onclick="loadPage('tenants')">
                        <i class="fas fa-eye"></i> <span data-i18n="superadmin.dashboard.view_all">View All</span>
                    </button>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th data-i18n="superadmin.dashboard.name">Name</th>
                                <th data-i18n="superadmin.dashboard.email">Email</th>
                                <th data-i18n="superadmin.dashboard.status">Status</th>
                                <th data-i18n="superadmin.dashboard.created">Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.recentTenants.map(tenant => `
                                <tr>
                                    <td><strong>${tenant.name}</strong></td>
                                    <td>${tenant.email}</td>
                                    <td><span class="badge badge-${getStatusColor(tenant.status)}">${tenant.status}</span></td>
                                    <td>${formatDate(tenant.created_at)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Plan Distribution -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title" data-i18n="superadmin.dashboard.plan_distribution">Plan Distribution</h3>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th data-i18n="superadmin.dashboard.plan_name">Plan Name</th>
                                <th data-i18n="superadmin.dashboard.tenant_count">Tenant Count</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.planDistribution.map(plan => `
                                <tr>
                                    <td><strong>${plan.name}</strong></td>
                                    <td>${plan.tenant_count}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        if (typeof i18n !== 'undefined' && i18n.translatePage) {
            i18n.translatePage();
        }
    } catch (error) {
        showError(content, error.message);
    }
}

function getStatusColor(status) {
    const colors = {
        'active': 'success',
        'trial': 'warning',
        'suspended': 'danger',
        'cancelled': 'danger'
    };
    return colors[status] || 'info';
}
