/**
 * Addon Purchases Management
 * Superadmin interface for managing addon purchases
 * 
 * NOTE: This module uses the global apiRequest function from app.js
 * All endpoints should NOT include '/api' prefix as app.js adds it automatically
 */

let currentPurchases = [];
let currentPage = 1;
const itemsPerPage = 20;

/**
 * Load addon purchases page
 */
async function loadAddonPurchases() {
  const content = document.querySelector('.content');
  
  content.innerHTML = `
    <div class="page-header">
      <h1><i class="fas fa-shopping-cart"></i> <span data-i18n="addon_purchases.title">Addon Purchases</span></h1>
      <p data-i18n="addon_purchases.subtitle">Manage and approve addon purchases from tenants</p>
    </div>

    <!-- Filters -->
    <div class="card" style="margin-bottom: 20px;">
      <div class="card-body">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
          <div class="form-group">
            <label data-i18n="addon_purchases.filter_status">Status</label>
            <select id="filterStatus" onchange="filterPurchases()">
              <option value="" data-i18n="addon_purchases.all_statuses">All Statuses</option>
              <option value="pending" data-i18n="addon_purchases.status_pending">Pending</option>
              <option value="completed" data-i18n="addon_purchases.status_completed">Completed</option>
              <option value="failed" data-i18n="addon_purchases.status_failed">Failed</option>
              <option value="cancelled" data-i18n="addon_purchases.status_cancelled">Cancelled</option>
            </select>
          </div>
          <div class="form-group">
            <label data-i18n="addon_purchases.filter_payment">Payment Method</label>
            <select id="filterGateway" onchange="filterPurchases()">
              <option value="" data-i18n="addon_purchases.all_methods">All Methods</option>
              <option value="stripe">Stripe</option>
              <option value="paypal">PayPal</option>
              <option value="cash" data-i18n="addon_purchases.cash_transfer">Cash/Transfer</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- Purchases Table -->
    <div class="card">
      <div class="card-body">
        <div id="purchasesTableContainer">
          <div class="loading">
            <div class="spinner"></div>
            <p data-i18n="common.loading">Loading purchases...</p>
          </div>
        </div>
      </div>
    </div>
  `;

  await loadPurchasesData();
}

/**
 * Load purchases data
 */
async function loadPurchasesData() {
  const container = document.getElementById('purchasesTableContainer');
  
  try {
    const status = document.getElementById('filterStatus')?.value || '';
    const gateway = document.getElementById('filterGateway')?.value || '';
    
    const params = new URLSearchParams({
      page: currentPage,
      limit: itemsPerPage
    });
    
    if (status) params.append('status', status);
    if (gateway) params.append('payment_method', gateway);

    console.log('📡 Fetching purchases:', `/superadmin/addon-purchases?${params}`);
    
    const result = await apiRequest(`/superadmin/addon-purchases?${params}`);

    console.log('✅ Purchases loaded:', result);

    if (result.success) {
      currentPurchases = result.data.purchases;
      renderPurchasesTable(result.data);
    } else {
      throw new Error(result.message || 'Failed to load purchases');
    }
  } catch (error) {
    console.error('❌ Error loading purchases:', error);
    
    if (container) {
      let errorMessage = error.message;
      let errorDetails = '';
      
      if (error.message.includes('Session expired')) {
        errorMessage = 'Your session has expired';
        errorDetails = 'You will be redirected to login...';
      } else if (error.message.includes('No authentication token')) {
        errorMessage = 'Not authenticated';
        errorDetails = 'Please login to continue';
        setTimeout(() => {
          window.location.href = '/superadmin/login';
        }, 2000);
      }
      
      container.innerHTML = `
        <div class="alert alert-error">
          <i class="fas fa-exclamation-circle"></i>
          <div>
            <strong>${errorMessage}</strong>
            ${errorDetails ? `<p style="margin-top: 10px; font-size: 14px;">${errorDetails}</p>` : ''}
            <p style="margin-top: 10px; font-size: 12px; opacity: 0.7;">Technical details: ${error.message}</p>
          </div>
        </div>
      `;
    }
  }
}

/**
 * Render purchases table
 */
function renderPurchasesTable(data) {
  const container = document.getElementById('purchasesTableContainer');
  
  if (!container) {
    console.error('purchasesTableContainer not found');
    return;
  }
  
  if (!data || !data.purchases || data.purchases.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-shopping-cart"></i>
        <p data-i18n="addon_purchases.no_purchases">No addon purchases found</p>
      </div>
    `;
    return;
  }

  let html = `
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Tenant</th>
            <th>Items</th>
            <th>Total</th>
            <th>Payment Method</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
  `;

  data.purchases.forEach(purchase => {
    const items = purchase.items || [];
    const itemsSummary = items.length > 0 
      ? items.map(item => `${item.quantity}x ${item.resource_name}`).join(', ')
      : 'No items';

    html += `
      <tr>
        <td>#${purchase.id}</td>
        <td>
          <strong>${purchase.tenant_name || 'N/A'}</strong><br>
          <small>${purchase.tenant_email || 'N/A'}</small>
        </td>
        <td>
          <div style="max-width: 300px;">
            ${itemsSummary}
          </div>
        </td>
        <td>
          <strong>${formatCurrency(purchase.total_amount || 0, purchase.currency)}</strong>
        </td>
        <td>
          <span class="badge badge-${purchase.payment_method || 'default'}">
            ${purchase.payment_method ? purchase.payment_method.toUpperCase() : 'N/A'}
          </span>
        </td>
        <td>
          <span class="status-badge status-${purchase.status || 'unknown'}">
            ${purchase.status || 'unknown'}
          </span>
        </td>
        <td>${new Date(purchase.created_at).toLocaleString()}</td>
        <td>
          <div class="btn-group">
            <button 
              class="btn btn-sm btn-info" 
              onclick="viewPurchaseDetails(${purchase.id})"
              title="View Details"
            >
              <i class="fas fa-eye"></i>
            </button>
            ${purchase.status === 'pending' && purchase.payment_method === 'cash' ? `
              <button 
                class="btn btn-sm btn-success" 
                onclick="approvePurchase(${purchase.id})"
                title="Approve Payment"
              >
                <i class="fas fa-check"></i>
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

  // Add pagination
  if (data.pagination.pages > 1) {
    html += `
      <div class="pagination">
        <button 
          class="btn btn-secondary" 
          onclick="changePage(${currentPage - 1})"
          ${currentPage === 1 ? 'disabled' : ''}
        >
          <i class="fas fa-chevron-left"></i> Previous
        </button>
        <span>Page ${currentPage} of ${data.pagination.pages}</span>
        <button 
          class="btn btn-secondary" 
          onclick="changePage(${currentPage + 1})"
          ${currentPage === data.pagination.pages ? 'disabled' : ''}
        >
          Next <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
}

/**
 * View purchase details
 */
function viewPurchaseDetails(purchaseId) {
  const purchase = currentPurchases.find(p => p.id === purchaseId);
  
  if (!purchase) return;

  const items = purchase.items;
  const itemsHTML = items.map(item => `
    <tr>
      <td>${item.resource_name}</td>
      <td>${item.quantity}</td>
      <td>${formatCurrency(item.unit_price, purchase.currency)}</td>
      <td><strong>${formatCurrency(item.quantity * item.unit_price, purchase.currency)}</strong></td>
    </tr>
  `).join('');

  showModal({
    title: `Purchase #${purchase.id} Details`,
    content: `
      <div style="margin-bottom: 20px;">
        <h3>Tenant Information</h3>
        <p><strong>Name:</strong> ${purchase.tenant_name}</p>
        <p><strong>Email:</strong> ${purchase.tenant_email}</p>
      </div>

      <div style="margin-bottom: 20px;">
        <h3>Purchase Details</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align: right;"><strong>Total:</strong></td>
              <td><strong>${formatCurrency(purchase.total_amount, purchase.currency)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div>
        <h3>Payment Information</h3>
        <p><strong>Method:</strong> ${purchase.payment_method ? purchase.payment_method.toUpperCase() : 'N/A'}</p>
        <p><strong>Status:</strong> <span class="status-badge status-${purchase.status}">${purchase.status}</span></p>
        <p><strong>Payment ID:</strong> ${purchase.payment_id || 'N/A'}</p>
        <p><strong>Date:</strong> ${new Date(purchase.created_at).toLocaleString()}</p>
      </div>
    `,
    size: 'large'
  });
}

/**
 * Approve manual payment
 */
async function approvePurchase(purchaseId) {
  console.log('🔍 Approving purchase:', purchaseId);
  
  // Removed confirmation dialog - approve directly
  try {
    console.log('📡 Sending approval request...');
    const result = await apiRequest(`/superadmin/addon-purchases/${purchaseId}/approve`, {
      method: 'POST'
    });

    console.log('📥 Approval response:', result);

    if (result.success) {
      console.log('✅ Payment approved successfully');
      showNotification('Payment approved and resources activated', 'success');
      await loadPurchasesData();
    } else {
      throw new Error(result.message || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Error approving payment:', error);
    showNotification('Error approving payment: ' + error.message, 'error');
  }
}

/**
 * Filter purchases
 */
function filterPurchases() {
  currentPage = 1;
  loadPurchasesData();
}

/**
 * Change page
 */
function changePage(page) {
  currentPage = page;
  loadPurchasesData();
}

// Export functions for global access
window.loadAddonPurchases = loadAddonPurchases;
window.approvePurchase = approvePurchase;
window.viewPurchaseDetails = viewPurchaseDetails;
window.filterPurchases = filterPurchases;
window.changePage = changePage;
