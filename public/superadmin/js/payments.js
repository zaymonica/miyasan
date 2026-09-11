/**
 * Payments Management Module
 * Handles payment history and billing operations
 */

window.paymentsModule = {
  currentPage: 1,
  limit: 20,
  filters: {
    status: '',
    tenant_id: ''
  },

  /**
   * Initialize payments page
   */
  async init() {
    const content = document.getElementById('content');
    if (typeof loadDefaultCurrency === 'function') {
      await loadDefaultCurrency();
    }
    content.innerHTML = `
      <div class="page-header">
        <h1><i class="fas fa-credit-card"></i> <span data-i18n="superadmin.payments.title">Payments & Billing</span></h1>
      </div>

      <!-- Revenue Stats -->
      <div class="stats-grid" id="revenueStats">
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #00a149 0%, #319131 100%);">
            <i class="fas fa-dollar-sign"></i>
          </div>
          <div class="stat-info">
            <h3 id="totalRevenue">$0</h3>
            <p data-i18n="superadmin.payments.total_revenue">Total Revenue</p>
            <small id="totalRevenueBreakdown" style="color: #666; font-size: 11px;"></small>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
            <i class="fas fa-calendar-day"></i>
          </div>
          <div class="stat-info">
            <h3 id="todayRevenue">$0</h3>
            <p data-i18n="superadmin.payments.today_revenue">Today's Revenue</p>
            <small id="todayRevenueBreakdown" style="color: #666; font-size: 11px;"></small>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
            <i class="fas fa-calendar-alt"></i>
          </div>
          <div class="stat-info">
            <h3 id="monthRevenue">$0</h3>
            <p data-i18n="superadmin.payments.this_month">This Month</p>
            <small id="monthRevenueBreakdown" style="color: #666; font-size: 11px;"></small>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <div class="stat-info">
            <h3 id="failedCount">0</h3>
            <p data-i18n="superadmin.payments.failed_payments">Failed Payments</p>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <select id="statusFilter" class="filter-select">
          <option value="" data-i18n="superadmin.payments.all_status">All Status</option>
          <option value="succeeded" data-i18n="superadmin.payments.status_succeeded">Succeeded</option>
          <option value="completed" data-i18n="superadmin.payments.status_completed">Completed</option>
          <option value="failed" data-i18n="superadmin.payments.status_failed">Failed</option>
          <option value="pending" data-i18n="superadmin.payments.status_pending">Pending</option>
          <option value="refunded" data-i18n="superadmin.payments.status_refunded">Refunded</option>
        </select>
        <input type="number" id="tenantFilter" class="filter-input" data-i18n-placeholder="superadmin.payments.filter_tenant_id" placeholder="Filter by Tenant ID">
        <button onclick="paymentsModule.applyFilters()" class="btn btn-primary">
          <i class="fas fa-filter"></i> <span data-i18n="superadmin.payments.apply_filters">Apply Filters</span>
        </button>
        <button onclick="paymentsModule.clearFilters()" class="btn btn-secondary">
          <i class="fas fa-times"></i> <span data-i18n="superadmin.payments.clear">Clear</span>
        </button>
      </div>

      <!-- Payments Table -->
      <div class="card">
        <div class="card-header">
          <h2 data-i18n="superadmin.payments.payment_history">Payment History</h2>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th data-i18n="superadmin.payments.id">ID</th>
                <th data-i18n="superadmin.payments.date">Date</th>
                <th data-i18n="superadmin.payments.tenant">Tenant</th>
                <th data-i18n="superadmin.payments.plan">Plan</th>
                <th data-i18n="superadmin.payments.amount">Amount</th>
                <th data-i18n="superadmin.payments.currency">Currency</th>
                <th data-i18n="superadmin.payments.status">Status</th>
                <th data-i18n="superadmin.payments.method">Method</th>
                <th data-i18n="superadmin.payments.actions">Actions</th>
              </tr>
            </thead>
            <tbody id="paymentsTableBody">
              <tr>
                <td colspan="9" class="text-center">
                  <i class="fas fa-spinner fa-spin"></i> <span data-i18n="superadmin.payments.loading">Loading...</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination" id="pagination"></div>
      </div>
    `;

    await this.loadPayments();
    if (typeof i18n !== 'undefined' && i18n.translatePage) {
      i18n.translatePage();
    }
  },

  /**
   * Load payments from API
   */
  async loadPayments() {
    try {
      const params = new URLSearchParams({
        page: this.currentPage,
        limit: this.limit,
        ...this.filters
      });

      const response = await apiRequest(`/superadmin/payments?${params}`);
      
      if (response.success) {
        this.renderStats(response.data.stats);
        this.renderPayments(response.data.payments);
        this.renderPagination(response.data.pagination);
      }
    } catch (error) {
      showAlert('Error loading payments: ' + error.message, 'error');
    }
  },

  /**
   * Render revenue stats
   */
  renderStats(stats) {
    document.getElementById('totalRevenue').textContent = formatCurrency(stats.total_revenue || 0);
    document.getElementById('todayRevenue').textContent = formatCurrency(stats.today_revenue || 0);
    document.getElementById('monthRevenue').textContent = formatCurrency(stats.month_revenue || 0);
    document.getElementById('failedCount').textContent = stats.failed_count || 0;

    // Show breakdown (plans + addons)
    const totalPlan = stats.total_plan_revenue || 0;
    const totalAddon = stats.total_addon_revenue || 0;
    const todayPlan = stats.today_plan_revenue || 0;
    const todayAddon = stats.today_addon_revenue || 0;
    const monthPlan = stats.month_plan_revenue || 0;
    const monthAddon = stats.month_addon_revenue || 0;

    document.getElementById('totalRevenueBreakdown').textContent = 
      `Plans: ${formatCurrency(totalPlan)} | Addons: ${formatCurrency(totalAddon)}`;
    document.getElementById('todayRevenueBreakdown').textContent = 
      `Plans: ${formatCurrency(todayPlan)} | Addons: ${formatCurrency(todayAddon)}`;
    document.getElementById('monthRevenueBreakdown').textContent = 
      `Plans: ${formatCurrency(monthPlan)} | Addons: ${formatCurrency(monthAddon)}`;
  },

  /**
   * Render payments table
   */
  renderPayments(payments) {
    const tbody = document.getElementById('paymentsTableBody');
    
    if (!payments || payments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center">${typeof i18n !== 'undefined' ? i18n.t('superadmin.payments.no_payments') : 'No payments found'}</td></tr>`;
      return;
    }

    tbody.innerHTML = payments.map(payment => `
      <tr>
        <td>#${payment.id}</td>
        <td>${formatDate(payment.created_at)}</td>
        <td>
          <strong>${payment.company_name || 'N/A'}</strong><br>
          <small>${payment.subdomain || ''}</small>
        </td>
        <td>${payment.plan_name || 'N/A'}</td>
        <td><strong>${formatCurrency(payment.amount)}</strong></td>
        <td>${(payment.currency || 'USD').toUpperCase()}</td>
        <td>${this.getStatusBadge(payment.status)}</td>
        <td>
          <span class="badge badge-info">
            <i class="fas fa-${this.getPaymentMethodIcon(payment.payment_method)}"></i>
            ${payment.payment_method || 'N/A'}
          </span>
        </td>
        <td>
          <button onclick="paymentsModule.viewDetails(${payment.id})" class="btn btn-sm btn-primary" title="${typeof i18n !== 'undefined' ? i18n.t('superadmin.payments.view_details') : 'View Details'}">
            <i class="fas fa-eye"></i>
          </button>
          ${payment.status === 'pending' && payment.payment_method === 'cash' ? `
            <button onclick="paymentsModule.approvePayment(${payment.id})" class="btn btn-sm btn-success" title="${typeof i18n !== 'undefined' ? i18n.t('superadmin.payments.approve_payment') : 'Approve Payment'}">
              <i class="fas fa-check"></i>
            </button>
          ` : ''}
        </td>
      </tr>
    `).join('');
  },

  /**
   * Get payment method icon
   */
  getPaymentMethodIcon(method) {
    const icons = {
      stripe: 'credit-card',
      paypal: 'paypal',
      cash: 'money-bill-wave'
    };
    return icons[method] || 'credit-card';
  },

  /**
   * Get status badge HTML
   */
  getStatusBadge(status) {
    const badges = {
      succeeded: `<span class="badge badge-success"><i class="fas fa-check"></i> ${typeof i18n !== 'undefined' ? i18n.t('superadmin.payments.status_succeeded') : 'Succeeded'}</span>`,
      completed: `<span class="badge badge-success"><i class="fas fa-check"></i> ${typeof i18n !== 'undefined' ? i18n.t('superadmin.payments.status_completed') : 'Completed'}</span>`,
      failed: `<span class="badge badge-danger"><i class="fas fa-times"></i> ${typeof i18n !== 'undefined' ? i18n.t('superadmin.payments.status_failed') : 'Failed'}</span>`,
      pending: `<span class="badge badge-warning"><i class="fas fa-clock"></i> ${typeof i18n !== 'undefined' ? i18n.t('superadmin.payments.status_pending') : 'Pending'}</span>`,
      refunded: `<span class="badge badge-secondary"><i class="fas fa-undo"></i> ${typeof i18n !== 'undefined' ? i18n.t('superadmin.payments.status_refunded') : 'Refunded'}</span>`
    };
    return badges[status] || `<span class="badge badge-secondary">${status}</span>`;
  },

  /**
   * Render pagination
   */
  renderPagination(pagination) {
    const container = document.getElementById('pagination');
    
    if (pagination.pages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '<div class="pagination-info">';
    html += `Showing page ${pagination.page} of ${pagination.pages} (${pagination.total} total)`;
    html += '</div><div class="pagination-buttons">';

    // Previous button
    if (pagination.page > 1) {
      html += `<button onclick="paymentsModule.goToPage(${pagination.page - 1})" class="btn btn-sm btn-secondary">
        <i class="fas fa-chevron-left"></i> Previous
      </button>`;
    }

    // Page numbers
    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.pages, pagination.page + 2);

    for (let i = startPage; i <= endPage; i++) {
      const active = i === pagination.page ? 'btn-primary' : 'btn-secondary';
      html += `<button onclick="paymentsModule.goToPage(${i})" class="btn btn-sm ${active}">${i}</button>`;
    }

    // Next button
    if (pagination.page < pagination.pages) {
      html += `<button onclick="paymentsModule.goToPage(${pagination.page + 1})" class="btn btn-sm btn-secondary">
        Next <i class="fas fa-chevron-right"></i>
      </button>`;
    }

    html += '</div>';
    container.innerHTML = html;
  },

  /**
   * Go to specific page
   */
  async goToPage(page) {
    this.currentPage = page;
    await this.loadPayments();
  },

  /**
   * Apply filters
   */
  async applyFilters() {
    this.filters.status = document.getElementById('statusFilter').value;
    this.filters.tenant_id = document.getElementById('tenantFilter').value;
    this.currentPage = 1;
    await this.loadPayments();
  },

  /**
   * Clear filters
   */
  async clearFilters() {
    this.filters = { status: '', tenant_id: '' };
    document.getElementById('statusFilter').value = '';
    document.getElementById('tenantFilter').value = '';
    this.currentPage = 1;
    await this.loadPayments();
  },

  /**
   * View payment details
   */
  async viewDetails(id) {
    try {
      const response = await apiRequest(`/superadmin/payments/${id}`);
      
      if (response.success) {
        const payment = response.data;
        
        showModal('Payment Details', `
          <div class="payment-details">
            <div class="detail-row">
              <strong>Payment ID:</strong>
              <span>#${payment.id}</span>
            </div>
            <div class="detail-row">
              <strong>Date:</strong>
              <span>${formatDate(payment.created_at)}</span>
            </div>
            <div class="detail-row">
              <strong>Tenant:</strong>
              <span>${payment.company_name} (${payment.subdomain})</span>
            </div>
            <div class="detail-row">
              <strong>Email:</strong>
              <span>${payment.email}</span>
            </div>
            <div class="detail-row">
              <strong>Plan:</strong>
              <span>${payment.plan_name || 'N/A'}</span>
            </div>
            <div class="detail-row">
              <strong>Amount:</strong>
              <span class="text-success"><strong>${formatCurrency(payment.amount)} ${payment.currency.toUpperCase()}</strong></span>
            </div>
            <div class="detail-row">
              <strong>Status:</strong>
              <span>${this.getStatusBadge(payment.status)}</span>
            </div>
            <div class="detail-row">
              <strong>Payment Method:</strong>
              <span>${payment.payment_method}</span>
            </div>
            ${payment.stripe_invoice_id ? `
              <div class="detail-row">
                <strong>Stripe Invoice ID:</strong>
                <span><code>${payment.stripe_invoice_id}</code></span>
              </div>
            ` : ''}
          </div>
          ${payment.status === 'pending' && payment.payment_method === 'cash' ? `
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
              <button onclick="paymentsModule.approvePayment(${payment.id}); closeCustomModal();" class="btn btn-success btn-block">
                <i class="fas fa-check"></i> Approve Payment
              </button>
            </div>
          ` : ''}
        `);
      }
    } catch (error) {
      showAlert('Error loading payment details: ' + error.message, 'error');
    }
  },

  /**
   * Approve pending cash payment
   */
  async approvePayment(id) {
    showConfirm('Are you sure you want to approve this payment? This will activate the tenant subscription.', async () => {
      try {
        const response = await apiRequest(`/superadmin/payments/${id}/approve`, {
          method: 'POST'
        });
        
        if (response.success) {
          showNotification('Payment approved successfully!', 'success');
          await this.loadPayments();
        }
      } catch (error) {
        showAlert('Error approving payment: ' + error.message, 'error');
      }
    });
  }
};

// Add to page handlers
window.pageHandlers = window.pageHandlers || {};
window.pageHandlers.payments = () => window.paymentsModule.init();
