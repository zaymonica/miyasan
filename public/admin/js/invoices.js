/**
 * Invoices & Quotes Management
 * Multi-tenant admin interface with tabs support
 */

let currentInvoices = [];
let searchTimeout = null;
let currentInvoiceItems = [];
let currentTab = 'active';
let tabCounts = { active: 0, archived: 0, disabled: 0 };

/**
 * Show custom alert modal
 */
function showAlert(message, type = 'info') {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.style.zIndex = '10001';
  const bgColor = type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#00a149';
  const icon = type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
  const title = type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Information';
  
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <div class="modal-header" style="background: ${bgColor};">
        <h3 style="color: white; margin: 0;">${icon} <span data-i18n="common.${type}">${title}</span></h3>
      </div>
      <div class="modal-body">
        <p style="margin: 20px 0; font-size: 15px;">${message}</p>
      </div>
      <div class="modal-footer" style="text-align: right; padding: 15px; border-top: 1px solid #ddd;">
        <button class="btn btn-primary" onclick="this.closest('.modal').remove()" data-i18n="common.ok">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

/**
 * Show custom confirm modal
 */
function showConfirm(message, onConfirm, onCancel = null) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.style.zIndex = '10001';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 450px;">
      <div class="modal-header" style="background: #00a149;">
        <h3 style="color: white; margin: 0;">🤔 <span data-i18n="common.confirm">Confirm Action</span></h3>
      </div>
      <div class="modal-body">
        <p style="margin: 20px 0; font-size: 15px;">${message}</p>
      </div>
      <div class="modal-footer" style="text-align: right; padding: 15px; border-top: 1px solid #ddd; display: flex; gap: 10px; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="this.closest('.modal').remove(); ${onCancel ? 'window.invoiceConfirmCancel()' : ''}" data-i18n="common.cancel">Cancel</button>
        <button class="btn btn-primary" onclick="this.closest('.modal').remove(); window.invoiceConfirmCallback()" data-i18n="common.ok">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  window.invoiceConfirmCallback = onConfirm;
  if (onCancel) window.invoiceConfirmCancel = onCancel;
}

/**
 * Initialize invoices page
 */
function initInvoicesPage() {
  renderTabs();
  loadInvoices();
}

/**
 * Render tabs
 */
function renderTabs() {
  const tabsContainer = document.getElementById('invoicesTabs');
  if (!tabsContainer) return;
  
  tabsContainer.innerHTML = `
    <div class="tabs-container" style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">
      <button class="tab-btn ${currentTab === 'active' ? 'active' : ''}" onclick="switchTab('active')" data-i18n="invoices.tab_active">
        📋 Active <span class="tab-count">(${tabCounts.active})</span>
      </button>
      <button class="tab-btn ${currentTab === 'archived' ? 'active' : ''}" onclick="switchTab('archived')" data-i18n="invoices.tab_archived">
        📦 Archived <span class="tab-count">(${tabCounts.archived})</span>
      </button>
      <button class="tab-btn ${currentTab === 'disabled' ? 'active' : ''}" onclick="switchTab('disabled')" data-i18n="invoices.tab_disabled">
        🚫 Disabled <span class="tab-count">(${tabCounts.disabled})</span>
      </button>
    </div>
  `;
}

/**
 * Switch tab
 */
function switchTab(tab) {
  currentTab = tab;
  renderTabs();
  loadInvoices();
}

/**
 * Load invoices list
 */
async function loadInvoices() {
  const type = document.getElementById('invoiceTypeFilter')?.value || '';
  const status = document.getElementById('invoiceStatusFilter')?.value || '';
  const search = document.getElementById('invoiceSearchInput')?.value || '';

  try {
    const params = new URLSearchParams();
    params.append('tab', currentTab);
    if (type) params.append('type', type);
    if (status && currentTab === 'active') params.append('status', status);
    if (search) params.append('search', search);

    const response = await fetch(`/api/invoices/admin?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });

    const data = await response.json();

    if (data.success) {
      currentInvoices = data.invoices;
      if (data.tabCounts) {
        tabCounts = data.tabCounts;
        renderTabs();
      }
      renderInvoicesList(data.invoices);
    } else {
      showNotification(data.error || 'Failed to load invoices', 'error');
    }
  } catch (error) {
    console.error('Error loading invoices:', error);
    showNotification('Failed to load invoices', 'error');
  }
}

/**
 * Render invoices list
 */
function renderInvoicesList(invoices) {
  const container = document.getElementById('invoicesContainer');
  
  if (!invoices || invoices.length === 0) {
    const emptyMessages = {
      active: 'No active invoices found',
      archived: 'No archived invoices',
      disabled: 'No disabled invoices'
    };
    container.innerHTML = `<p style="text-align: center; padding: 40px; color: #999;" data-i18n="invoices.empty_${currentTab}">${emptyMessages[currentTab]}</p>`;
    return;
  }

  const table = `
    <table class="data-table">
      <thead>
        <tr>
          <th data-i18n="invoices.number">Number</th>
          <th data-i18n="invoices.type">Type</th>
          <th data-i18n="invoices.client">Client</th>
          <th data-i18n="invoices.title">Title</th>
          <th data-i18n="invoices.amount">Amount</th>
          <th data-i18n="invoices.status">Status</th>
          <th data-i18n="invoices.date">Date</th>
          <th data-i18n="invoices.actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${invoices.map(inv => renderInvoiceRow(inv)).join('')}
      </tbody>
    </table>
  `;

  container.innerHTML = table;
}

/**
 * Render single invoice row
 */
function renderInvoiceRow(inv) {
  const isRejected = inv.status === 'rejected';
  const isArchived = inv.status === 'archived';
  const isDisabled = inv.is_active === 0 || inv.is_active === false;
  
  let actions = `
    <button class="btn-icon" onclick="viewInvoice(${inv.id})" title="View">👁️</button>
    <button class="btn-icon" onclick="copyInvoiceLink('${inv.invoice_number}')" title="Copy Link">🔗</button>
  `;
  
  if (currentTab === 'active') {
    actions += `
      <button class="btn-icon" onclick="sendInvoice(${inv.id})" title="Send via WhatsApp">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
      </button>
    `;
    
    if (inv.type === 'quote' && inv.status === 'accepted') {
      actions += `<button class="btn-icon" onclick="convertToInvoice(${inv.id})" title="Convert to Invoice">🔄</button>`;
    }
    
    if (isRejected) {
      actions += `<button class="btn-icon" onclick="handleRejection(${inv.id})" title="Handle Rejection">⚠️</button>`;
    }
    
    actions += `
      <button class="btn-icon" onclick="archiveInvoice(${inv.id})" title="Archive">📦</button>
      <button class="btn-icon" onclick="toggleInvoiceActive(${inv.id}, false)" title="Disable">🚫</button>
      <button class="btn-icon btn-delete" onclick="deleteInvoice(${inv.id})" title="Delete">🗑️</button>
    `;
  } else if (currentTab === 'archived') {
    actions += `
      <button class="btn-icon" onclick="reactivateInvoice(${inv.id})" title="Reactivate">♻️</button>
      <button class="btn-icon" onclick="deleteInvoice(${inv.id})" title="Delete Permanently">🗑️</button>
    `;
  } else if (currentTab === 'disabled') {
    actions += `
      <button class="btn-icon" onclick="toggleInvoiceActive(${inv.id}, true)" title="Enable">✅</button>
      <button class="btn-icon" onclick="deleteInvoice(${inv.id})" title="Delete Permanently">🗑️</button>
    `;
  }
  
  return `
    <tr class="${isRejected ? 'row-rejected' : ''} ${isDisabled ? 'row-disabled' : ''}">
      <td><strong>${inv.invoice_number}</strong></td>
      <td>${inv.type === 'quote' ? '📋 Quote' : '📄 Invoice'}</td>
      <td>${inv.client_name}<br><small>${inv.client_email}</small></td>
      <td>${inv.title}</td>
      <td><strong>${formatCurrency(inv.total_amount, inv.currency)}</strong></td>
      <td><span class="status-badge status-${inv.status}">${inv.status}</span></td>
      <td>${new Date(inv.created_at).toLocaleDateString()}</td>
      <td>${actions}</td>
    </tr>
  `;
}


/**
 * Show create invoice modal
 */
async function showCreateInvoiceModal() {
  let defaultCurrency = 'USD';
  try {
    const response = await fetch('/api/public/default-currency');
    const data = await response.json();
    defaultCurrency = data?.data?.code || defaultCurrency;
  } catch (e) {}
  try {
    const res = await api.get('/plan/current');
    defaultCurrency = res.data?.currency || res.data?.data?.currency || defaultCurrency;
  } catch (e) {}
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'createInvoiceModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
      <div class="modal-header">
        <h2 data-i18n="invoices.create_title">Create New Invoice/Quote</h2>
        <button class="close-btn" onclick="closeModal('createInvoiceModal')">&times;</button>
      </div>
      <div class="modal-body">
        <form id="createInvoiceForm" onsubmit="submitInvoice(event)">
          <div class="form-row">
            <div class="form-group">
              <label data-i18n="invoices.currency">Currency *</label>
              <select id="invoiceCurrency" required>
                <option value="USD" ${defaultCurrency==='USD'?'selected':''}>USD ($)</option>
                <option value="BRL" ${defaultCurrency==='BRL'?'selected':''}>BRL (R$)</option>
                <option value="EUR" ${defaultCurrency==='EUR'?'selected':''}>EUR (€)</option>
                <option value="GBP" ${defaultCurrency==='GBP'?'selected':''}>GBP (£)</option>
              </select>
            </div>
            <div class="form-group">
              <label data-i18n="invoices.type">Type *</label>
              <select id="invoiceType" required>
                <option value="invoice" data-i18n="invoices.type_invoice">Invoice</option>
                <option value="quote" data-i18n="invoices.type_quote">Quote</option>
              </select>
            </div>
          </div>

          <h3 style="margin-top: 20px; margin-bottom: 15px;" data-i18n="invoices.client_info">Client Information</h3>
          <div class="form-row">
            <div class="form-group">
              <label data-i18n="invoices.client_name">Client Name *</label>
              <input type="text" id="clientName" required>
            </div>
            <div class="form-group">
              <label data-i18n="invoices.client_email">Email * (used as password)</label>
              <input type="email" id="clientEmail" required>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label data-i18n="invoices.client_phone">Phone (with country code) *</label>
              <input type="text" id="clientPhone" required>
            </div>
            <div class="form-group">
              <label data-i18n="invoices.client_company">Company Name</label>
              <input type="text" id="clientCompany">
            </div>
          </div>

          <h3 style="margin-top: 20px; margin-bottom: 15px;" data-i18n="invoices.details">Invoice Details</h3>
          <div class="form-group">
            <label data-i18n="invoices.title_field">Title *</label>
            <input type="text" id="invoiceTitle" required>
          </div>
          <div class="form-group">
            <label data-i18n="invoices.description">Description</label>
            <textarea id="invoiceDescription" rows="3"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label data-i18n="invoices.due_date">Due Date</label>
              <input type="date" id="invoiceDueDate">
            </div>
          </div>

          <div class="form-group" style="margin-top: 15px;">
            <label data-i18n="invoices.payment_methods_allowed">Allowed Payment Methods</label>
            <p style="font-size: 12px; color: #666; margin-bottom: 10px;" data-i18n="invoices.payment_methods_help">Select which payment methods the client can use to pay this invoice.</p>
            <div class="payment-methods-toggles" style="display: flex; flex-wrap: wrap; gap: 20px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <label class="toggle-switch">
                  <input type="checkbox" class="payment-method-toggle" value="stripe" checked>
                  <span class="toggle-slider"></span>
                </label>
                <span>💳 Stripe</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <label class="toggle-switch">
                  <input type="checkbox" class="payment-method-toggle" value="paypal">
                  <span class="toggle-slider"></span>
                </label>
                <span>🅿️ PayPal</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <label class="toggle-switch">
                  <input type="checkbox" class="payment-method-toggle" value="bank_transfer">
                  <span class="toggle-slider"></span>
                </label>
                <span data-i18n="invoices.bank_transfer">🏦 Bank Transfer</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <label class="toggle-switch">
                  <input type="checkbox" class="payment-method-toggle" value="cash">
                  <span class="toggle-slider"></span>
                </label>
                <span data-i18n="invoices.cash">💵 Cash</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <label class="toggle-switch">
                  <input type="checkbox" class="payment-method-toggle" value="pix">
                  <span class="toggle-slider"></span>
                </label>
                <span>📱 PIX</span>
              </div>
            </div>
          </div>

          <div class="invoice-items-section">
            <h4 data-i18n="invoices.items">Items</h4>
            <div id="itemsList"></div>
            <button type="button" class="btn-add-item" onclick="addInvoiceItem()" data-i18n="invoices.add_item">+ Add Item</button>
          </div>

          <div class="form-row" style="margin-top: 20px;">
            <div class="form-group invoice-tax-section">
              <label data-i18n="invoices.tax_rate">Tax Rate (%)</label>
              <input type="number" id="invoiceTaxRate" value="0" min="0" max="100" step="0.01" onchange="calculateInvoiceTotal()">
            </div>
            <div class="form-group">
              <label data-i18n="invoices.discount_type">Discount Type</label>
              <select id="invoiceDiscountType" onchange="calculateInvoiceTotal()">
                <option value="fixed" data-i18n="invoices.fixed">Fixed Amount</option>
                <option value="percentage" data-i18n="invoices.percentage">Percentage</option>
              </select>
            </div>
            <div class="form-group">
              <label data-i18n="invoices.discount_value">Discount Value</label>
              <input type="number" id="invoiceDiscountValue" value="0" min="0" step="0.01" onchange="calculateInvoiceTotal()">
            </div>
          </div>

          <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span data-i18n="invoices.subtotal">Subtotal:</span>
              <strong id="displaySubtotal">$0.00</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span data-i18n="invoices.tax">Tax:</span>
              <strong id="displayTax">$0.00</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span data-i18n="invoices.discount">Discount:</span>
              <strong id="displayDiscount">$0.00</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 18px; padding-top: 10px; border-top: 2px solid #ddd;">
              <span data-i18n="invoices.total">Total:</span>
              <strong id="displayTotal" style="color: #00a149;">$0.00</strong>
            </div>
          </div>

          <div class="form-actions" style="margin-top: 30px;">
            <button type="button" class="btn btn-secondary" onclick="closeModal('createInvoiceModal')" data-i18n="common.cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" data-i18n="common.create">Create</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  currentInvoiceItems = [];
  addInvoiceItem();
}

/**
 * Add invoice item
 */
function addInvoiceItem() {
  const itemId = Date.now();
  currentInvoiceItems.push({ id: itemId, description: '', quantity: 1, unit_price: 0 });
  
  const itemsList = document.getElementById('itemsList');
  const itemDiv = document.createElement('div');
  itemDiv.className = 'invoice-items-grid';
  itemDiv.id = `item-${itemId}`;
  itemDiv.innerHTML = `
    <div>
      <label data-i18n="invoices.item_description">Description</label>
      <input type="text" data-item-id="${itemId}" data-field="description" onchange="updateInvoiceItem(${itemId})" required>
    </div>
    <div>
      <label data-i18n="invoices.item_quantity">Quantity</label>
      <input type="number" data-item-id="${itemId}" data-field="quantity" value="1" min="1" onchange="updateInvoiceItem(${itemId})" required>
    </div>
    <div>
      <label data-i18n="invoices.item_price">Unit Price</label>
      <input type="number" data-item-id="${itemId}" data-field="unit_price" value="0" min="0" step="0.01" onchange="updateInvoiceItem(${itemId})" required>
    </div>
    <div>
      <label data-i18n="invoices.item_total">Total</label>
      <input type="text" id="item-total-${itemId}" value="$0.00" readonly>
    </div>
    <button type="button" class="btn-remove-item" onclick="removeInvoiceItem(${itemId})">×</button>
  `;
  
  itemsList.appendChild(itemDiv);
}

/**
 * Update invoice item
 */
function updateInvoiceItem(itemId) {
  const item = currentInvoiceItems.find(i => i.id === itemId);
  if (!item) return;

  const inputs = document.querySelectorAll(`[data-item-id="${itemId}"]`);
  inputs.forEach(input => {
    const field = input.getAttribute('data-field');
    item[field] = input.value;
  });

  const total = parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0);
  const currency = document.getElementById('invoiceCurrency').value;
  document.getElementById(`item-total-${itemId}`).value = formatCurrency(total, currency);
  calculateInvoiceTotal();
}

/**
 * Remove invoice item
 */
function removeInvoiceItem(itemId) {
  if (currentInvoiceItems.length <= 1) {
    showAlert('At least one item is required', 'error');
    return;
  }
  currentInvoiceItems = currentInvoiceItems.filter(i => i.id !== itemId);
  document.getElementById(`item-${itemId}`).remove();
  calculateInvoiceTotal();
}

/**
 * Calculate invoice total
 */
function calculateInvoiceTotal() {
  const currency = document.getElementById('invoiceCurrency').value;
  const taxRate = parseFloat(document.getElementById('invoiceTaxRate').value || 0);
  const discountType = document.getElementById('invoiceDiscountType').value;
  const discountValue = parseFloat(document.getElementById('invoiceDiscountValue').value || 0);

  const subtotal = currentInvoiceItems.reduce((sum, item) => {
    return sum + (parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0));
  }, 0);

  const taxAmount = (subtotal * taxRate) / 100;
  const discountAmount = discountType === 'percentage' ? (subtotal * discountValue) / 100 : discountValue;
  const total = subtotal + taxAmount - discountAmount;

  document.getElementById('displaySubtotal').textContent = formatCurrency(subtotal, currency);
  document.getElementById('displayTax').textContent = formatCurrency(taxAmount, currency);
  document.getElementById('displayDiscount').textContent = formatCurrency(discountAmount, currency);
  document.getElementById('displayTotal').textContent = formatCurrency(total, currency);
}

/**
 * Submit invoice
 */
async function submitInvoice(event) {
  event.preventDefault();

  if (currentInvoiceItems.length === 0) {
    showAlert('Please add at least one item', 'error');
    return;
  }

  // Get selected payment methods
  const selectedPaymentMethods = [];
  document.querySelectorAll('.payment-method-toggle:checked').forEach(checkbox => {
    selectedPaymentMethods.push(checkbox.value);
  });

  if (selectedPaymentMethods.length === 0) {
    showAlert('Please select at least one payment method', 'error');
    return;
  }

  const invoiceData = {
    type: document.getElementById('invoiceType').value,
    title: document.getElementById('invoiceTitle').value,
    description: document.getElementById('invoiceDescription').value,
    currency: document.getElementById('invoiceCurrency').value,
    tax_rate: parseFloat(document.getElementById('invoiceTaxRate').value || 0),
    discount_type: document.getElementById('invoiceDiscountType').value,
    discount_value: parseFloat(document.getElementById('invoiceDiscountValue').value || 0),
    allowed_payment_methods: selectedPaymentMethods,
    due_date: document.getElementById('invoiceDueDate').value || null,
    client: {
      name: document.getElementById('clientName').value,
      email: document.getElementById('clientEmail').value,
      phone: document.getElementById('clientPhone').value,
      company_name: document.getElementById('clientCompany').value || null
    },
    items: currentInvoiceItems.map(item => ({
      description: item.description,
      quantity: parseFloat(item.quantity),
      unit_price: parseFloat(item.unit_price)
    }))
  };

  try {
    const response = await fetch('/api/invoices/admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(invoiceData)
    });

    const data = await response.json();

    if (data.success) {
      showNotification(`${invoiceData.type === 'quote' ? 'Quote' : 'Invoice'} created successfully!`, 'success');
      closeModal('createInvoiceModal');
      loadInvoices();
    } else {
      showNotification(data.error || 'Failed to create invoice', 'error');
    }
  } catch (error) {
    console.error('Error creating invoice:', error);
    showNotification('Failed to create invoice', 'error');
  }
}

/**
 * View invoice details
 */
async function viewInvoice(id) {
  try {
    const response = await fetch(`/api/invoices/admin/${id}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const data = await response.json();

    if (data.success) {
      showInvoiceDetailsModal(data.invoice);
    } else {
      showNotification(data.error || 'Failed to load invoice', 'error');
    }
  } catch (error) {
    console.error('Error loading invoice:', error);
    showNotification('Failed to load invoice', 'error');
  }
}

/**
 * Show invoice details modal
 */
function showInvoiceDetailsModal(invoice) {
  const isRejected = invoice.status === 'rejected';
  
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'invoiceDetailsModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
      <div class="modal-header">
        <h2>${invoice.invoice_number} - ${invoice.title}</h2>
        <button class="close-btn" onclick="closeModal('invoiceDetailsModal')">&times;</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom: 20px;">
          <span class="status-badge status-${invoice.status}">${invoice.status}</span>
          <span style="margin-left: 10px;">${invoice.type === 'quote' ? '📋 Quote' : '📄 Invoice'}</span>
        </div>

        ${isRejected && invoice.rejection_reason ? `
          <div style="background: #f8d7da; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="color: #721c24; margin-bottom: 10px;">⚠️ <span data-i18n="invoices.rejection_reason">Rejection Reason</span>:</h4>
            <p style="color: #721c24;">"${invoice.rejection_reason}"</p>
          </div>
        ` : ''}

        <h3 data-i18n="invoices.client">Client</h3>
        <p><strong>${invoice.client_name}</strong><br>
        ${invoice.client_email}<br>
        ${invoice.client_phone}</p>

        <h3 style="margin-top: 20px;" data-i18n="invoices.items">Items</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th data-i18n="invoices.item_description">Description</th>
              <th data-i18n="invoices.item_quantity">Qty</th>
              <th data-i18n="invoices.item_price">Price</th>
              <th data-i18n="invoices.item_total">Total</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.items.map(item => `
              <tr>
                <td>${item.description}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.unit_price, invoice.currency)}</td>
                <td>${formatCurrency(item.total_price, invoice.currency)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="margin-top: 20px; text-align: right;">
          <p><span data-i18n="invoices.subtotal">Subtotal</span>: ${formatCurrency(invoice.subtotal, invoice.currency)}</p>
          <p><span data-i18n="invoices.tax">Tax</span>: ${formatCurrency(invoice.tax_amount, invoice.currency)}</p>
          <p><span data-i18n="invoices.discount">Discount</span>: ${formatCurrency(invoice.discount_amount, invoice.currency)}</p>
          <p style="font-size: 20px;"><strong><span data-i18n="invoices.total">Total</span>: ${formatCurrency(invoice.total_amount, invoice.currency)}</strong></p>
        </div>

        <div class="form-actions" style="margin-top: 30px;">
          <button class="btn btn-secondary" onclick="closeModal('invoiceDetailsModal')" data-i18n="common.close">Close</button>
          ${invoice.status === 'draft' ? `<button class="btn btn-primary" onclick="sendInvoice(${invoice.id})" data-i18n="invoices.send">Send</button>` : ''}
          ${isRejected ? `<button class="btn btn-primary" onclick="showRespondModal(${invoice.id})" data-i18n="invoices.respond">Respond</button>` : ''}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}


/**
 * Show respond to rejection modal
 */
function showRespondModal(invoiceId) {
  closeModal('invoiceDetailsModal');
  
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'respondModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h2 data-i18n="invoices.respond_title">Respond to Rejection</h2>
        <button class="close-btn" onclick="closeModal('respondModal')">&times;</button>
      </div>
      <div class="modal-body">
        <p data-i18n="invoices.respond_prompt">Write your response to the client. The invoice will be sent back for their review.</p>
        <textarea id="adminResponse" rows="5" style="width: 100%; margin-top: 15px; padding: 12px; border: 1px solid #ddd; border-radius: 8px;" placeholder="Your response..."></textarea>
        <div class="form-actions" style="margin-top: 20px;">
          <button class="btn btn-secondary" onclick="closeModal('respondModal')" data-i18n="common.cancel">Cancel</button>
          <button class="btn btn-primary" onclick="submitResponse(${invoiceId})" data-i18n="invoices.send_response">Send Response</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

/**
 * Submit response to rejection
 */
async function submitResponse(invoiceId) {
  const response = document.getElementById('adminResponse').value.trim();
  if (response.length < 10) {
    showAlert('Response must be at least 10 characters', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/invoices/admin/${invoiceId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ response })
    });

    const data = await res.json();

    if (data.success) {
      showNotification('Response sent successfully!', 'success');
      closeModal('respondModal');
      loadInvoices();
    } else {
      showNotification(data.error || 'Failed to send response', 'error');
    }
  } catch (error) {
    console.error('Error sending response:', error);
    showNotification('Failed to send response', 'error');
  }
}

/**
 * Send invoice via WhatsApp
 */
async function sendInvoice(id) {
  const invoice = currentInvoices.find(inv => inv.id === id);
  if (!invoice) {
    showNotification('Invoice not found', 'error');
    return;
  }
  showSendWhatsAppModal(invoice);
}

/**
 * Show send via WhatsApp modal
 */
function showSendWhatsAppModal(invoice) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'sendWhatsAppModal';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header">
        <h2 data-i18n="invoices.send_whatsapp">Send via WhatsApp</h2>
        <button class="close-btn" onclick="closeModal('sendWhatsAppModal')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>
            <input type="radio" name="phoneOption" value="client" checked onchange="togglePhoneSelection()">
            <span data-i18n="invoices.use_client_phone">Use Client Phone</span>
          </label>
          <div style="margin-left: 25px; margin-top: 8px; color: #666;">
            <strong>${invoice.client_name}</strong><br>
            📱 ${invoice.client_phone}
          </div>
        </div>

        <div style="margin: 20px 0; text-align: center; color: #999;">— OR —</div>

        <div class="form-group">
          <label>
            <input type="radio" name="phoneOption" value="manual" onchange="togglePhoneSelection()">
            <span data-i18n="invoices.custom_phone">Custom Phone</span>
          </label>
          <div id="manualPhoneSection" style="margin-left: 25px; margin-top: 10px; display: none;">
            <input type="text" id="customPhone">
          </div>
        </div>

        <div class="form-actions" style="margin-top: 30px;">
          <button class="btn btn-secondary" onclick="closeModal('sendWhatsAppModal')" data-i18n="common.cancel">Cancel</button>
          <button class="btn btn-primary" id="sendWhatsAppBtn" onclick="confirmSendWhatsApp(${invoice.id})" data-i18n="invoices.send_now">Send Now</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

/**
 * Toggle phone selection mode
 */
function togglePhoneSelection() {
  const manualSection = document.getElementById('manualPhoneSection');
  const isManual = document.querySelector('input[name="phoneOption"]:checked').value === 'manual';
  manualSection.style.display = isManual ? 'block' : 'none';
}

/**
 * Confirm and send invoice via WhatsApp
 */
async function confirmSendWhatsApp(invoiceId) {
  const phoneOption = document.querySelector('input[name="phoneOption"]:checked').value;
  const sendBtn = document.getElementById('sendWhatsAppBtn');
  
  let requestBody = phoneOption === 'client' 
    ? { use_client_phone: true }
    : { phone: document.getElementById('customPhone')?.value, use_client_phone: false };

  if (phoneOption !== 'client' && !requestBody.phone) {
    showNotification('Please enter a phone number', 'error');
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';

  try {
    const response = await fetch(`/api/invoices/admin/${invoiceId}/send-whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (data.success) {
      showNotification('Invoice sent successfully via WhatsApp!', 'success');
      closeModal('sendWhatsAppModal');
      loadInvoices();
    } else {
      showNotification(data.error || 'Failed to send invoice', 'error');
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Now';
    }
  } catch (error) {
    console.error('Error sending invoice:', error);
    showNotification('Failed to send invoice', 'error');
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Now';
  }
}

/**
 * Convert quote to invoice
 */
async function convertToInvoice(id) {
  showConfirm('Convert this quote to an invoice?', async () => {
    try {
      const response = await fetch(`/api/invoices/admin/${id}/convert-to-invoice`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();

      if (data.success) {
        showNotification('Quote converted to invoice!', 'success');
        loadInvoices();
      } else {
        showNotification(data.error || 'Failed to convert quote', 'error');
      }
    } catch (error) {
      console.error('Error converting quote:', error);
      showNotification('Failed to convert quote', 'error');
    }
  });
}

/**
 * Handle rejection
 */
function handleRejection(id) {
  const invoice = currentInvoices.find(inv => inv.id === id);
  if (!invoice) return;

  showConfirm(
    `<strong data-i18n="invoices.rejection_reason">Rejection reason</strong>: "${invoice.rejection_reason || 'No reason provided'}"<br><br>
     <span data-i18n="invoices.rejection_options">Click OK to archive, or Cancel to respond to the client.</span>`,
    () => finalizeRejection(id),
    () => showRespondModal(id)
  );
}

/**
 * Finalize rejection (archive)
 */
async function finalizeRejection(id) {
  try {
    const response = await fetch(`/api/invoices/admin/${id}/finalize-rejection`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const data = await response.json();

    if (data.success) {
      showNotification('Invoice archived', 'success');
      loadInvoices();
    } else {
      showNotification(data.error || 'Failed to archive', 'error');
    }
  } catch (error) {
    console.error('Error archiving:', error);
    showNotification('Failed to archive', 'error');
  }
}

/**
 * Archive invoice
 */
async function archiveInvoice(id) {
  showConfirm('Archive this invoice?', async () => {
    try {
      const response = await fetch(`/api/invoices/admin/${id}/archive`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();

      if (data.success) {
        showNotification('Invoice archived', 'success');
        loadInvoices();
      } else {
        showNotification(data.error || 'Failed to archive', 'error');
      }
    } catch (error) {
      console.error('Error archiving:', error);
      showNotification('Failed to archive', 'error');
    }
  });
}

/**
 * Toggle invoice active status
 */
async function toggleInvoiceActive(id, isActive) {
  const action = isActive ? 'enable' : 'disable';
  showConfirm(`${isActive ? 'Enable' : 'Disable'} this invoice?`, async () => {
    try {
      const response = await fetch(`/api/invoices/admin/${id}/toggle-active`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ is_active: isActive })
      });
      const data = await response.json();

      if (data.success) {
        showNotification(`Invoice ${isActive ? 'enabled' : 'disabled'}`, 'success');
        loadInvoices();
      } else {
        showNotification(data.error || `Failed to ${action}`, 'error');
      }
    } catch (error) {
      console.error(`Error ${action}ing:`, error);
      showNotification(`Failed to ${action}`, 'error');
    }
  });
}

/**
 * Reactivate invoice
 */
async function reactivateInvoice(id) {
  showConfirm('Reactivate this invoice?', async () => {
    try {
      const response = await fetch(`/api/invoices/admin/${id}/reactivate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();

      if (data.success) {
        showNotification('Invoice reactivated', 'success');
        loadInvoices();
      } else {
        showNotification(data.error || 'Failed to reactivate', 'error');
      }
    } catch (error) {
      console.error('Error reactivating:', error);
      showNotification('Failed to reactivate', 'error');
    }
  });
}

/**
 * Delete invoice permanently
 */
async function deleteInvoice(id) {
  showConfirm('⚠️ Delete this invoice permanently? This action cannot be undone.', async () => {
    try {
      const response = await fetch(`/api/invoices/admin/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();

      if (data.success) {
        showNotification('Invoice deleted', 'success');
        loadInvoices();
      } else {
        showNotification(data.error || 'Failed to delete', 'error');
      }
    } catch (error) {
      console.error('Error deleting:', error);
      showNotification('Failed to delete', 'error');
    }
  });
}

/**
 * Copy invoice public link
 */
function copyInvoiceLink(invoiceNumber) {
  const baseUrl = window.location.origin;
  const publicLink = `${baseUrl}/invoice/${invoiceNumber}`;
  
  navigator.clipboard.writeText(publicLink).then(() => {
    showNotification('Link copied to clipboard!', 'success');
  }).catch(() => {
    const textArea = document.createElement('textarea');
    textArea.value = publicLink;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showNotification('Link copied to clipboard!', 'success');
  });
}

/**
 * Format currency
 */
function formatCurrency(amount, currency) {
  const symbols = { USD: '$', BRL: 'R$', EUR: '€', GBP: '£' };
  return `${symbols[currency] || currency} ${parseFloat(amount).toFixed(2)}`;
}

/**
 * Debounce search
 */
function debounceSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadInvoices(), 500);
}

/**
 * Close modal
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.remove();
}

// Initialize when page loads
if (typeof window !== 'undefined') {
  // Register page handler
  if (!window.pageHandlers) window.pageHandlers = {};
  window.pageHandlers.invoices = function() {
    console.log('Invoices handler called');
    // Check if feature is enabled before loading
    if (typeof checkFeatureEnabled === 'function') {
      checkFeatureEnabled('invoices').then(enabled => {
        if (enabled) {
          initInvoicesPage();
        }
      });
    } else {
      initInvoicesPage();
    }
  };

  window.initInvoicesPage = initInvoicesPage;
  window.loadInvoices = loadInvoices;
  window.switchTab = switchTab;
  window.showCreateInvoiceModal = showCreateInvoiceModal;
  window.addInvoiceItem = addInvoiceItem;
  window.updateInvoiceItem = updateInvoiceItem;
  window.removeInvoiceItem = removeInvoiceItem;
  window.calculateInvoiceTotal = calculateInvoiceTotal;
  window.submitInvoice = submitInvoice;
  window.viewInvoice = viewInvoice;
  window.sendInvoice = sendInvoice;
  window.convertToInvoice = convertToInvoice;
  window.handleRejection = handleRejection;
  window.archiveInvoice = archiveInvoice;
  window.toggleInvoiceActive = toggleInvoiceActive;
  window.reactivateInvoice = reactivateInvoice;
  window.deleteInvoice = deleteInvoice;
  window.showRespondModal = showRespondModal;
  window.submitResponse = submitResponse;
  window.debounceSearch = debounceSearch;
  window.closeModal = closeModal;
  window.togglePhoneSelection = togglePhoneSelection;
  window.confirmSendWhatsApp = confirmSendWhatsApp;
  window.copyInvoiceLink = copyInvoiceLink;
}
