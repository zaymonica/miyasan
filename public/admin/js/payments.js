// Payments Admin - Simplified version

let paymentMethods = [];
let paymentCurrencyCode = null;

async function loadSystemCurrency() {
    if (paymentCurrencyCode) return paymentCurrencyCode;
    try {
        const response = await fetch('/api/public/default-currency');
        const data = await response.json();
        paymentCurrencyCode = data?.data?.code || null;
    } catch (error) {
        paymentCurrencyCode = null;
    }
    if (!paymentCurrencyCode) {
        paymentCurrencyCode = localStorage.getItem('system_default_currency') || 'USD';
    }
    return paymentCurrencyCode;
}

function formatCurrencyAmount(amount) {
    const code = paymentCurrencyCode || localStorage.getItem('system_default_currency') || 'USD';
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return amount;
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(numericAmount);
    } catch (e) {
        return `${code} ${numericAmount.toFixed(2)}`;
    }
}

// Page handler
if (!window.pageHandlers) window.pageHandlers = {};
window.pageHandlers.payments = function() {
    console.log('Payments handler called');
    // Check if feature is enabled before loading
    if (typeof checkFeatureEnabled === 'function') {
        checkFeatureEnabled('payments').then(enabled => {
            if (enabled) {
                loadPaymentMethods();
                loadPaymentStats();
                loadPaymentLinks();
            }
        });
    } else {
        loadPaymentMethods();
        loadPaymentStats();
        loadPaymentLinks();
    }
};

// Load payment methods
async function loadPaymentMethods() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/payments/methods', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            paymentMethods = await response.json();
            renderPaymentMethods();
        } else {
            console.error('Error loading payment methods');
        }
    } catch (error) {
        console.error('Error:', error);
        Modal.alert('Error', 'Failed to load payment methods. Please refresh the page.', 'error');
    }
}

// Render payment methods
function renderPaymentMethods() {
    const container = document.getElementById('paymentMethodsContainer');
    if (!container) return;
    
    const methods = [
        { name: 'paypal', displayName: 'PayPal', icon: '💳' },
        { name: 'stripe', displayName: 'Stripe', icon: '💵' }
    ];
    
    container.innerHTML = methods.map(method => {
        const config = paymentMethods.find(m => m.method_name === method.name);
        const status = config?.active ? 'Active' : config ? 'Inactive' : 'Not Configured';
        
        return `
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                    <span style="font-size: 32px;">${method.icon}</span>
                    <div>
                        <h3 style="margin: 0;">${method.displayName}</h3>
                        <span style="font-size: 11px; padding: 4px 8px; border-radius: 4px; background: ${config?.active ? '#4CAF50' : '#ccc'}; color: white;">${status}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-primary" onclick="configureMethod('${method.name}')" style="flex: 1;">
                        ${config ? '⚙️ Reconfigure' : '➕ Configure'}
                    </button>
                    ${config ? `
                        <button class="btn ${config.active ? 'btn-warning' : 'btn-success'}" onclick="toggleMethod(${config.id}, ${!config.active})">
                            ${config.active ? '⏸️ Disable' : '▶️ Enable'}
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Configure method
window.configureMethod = function(methodName) {
    const config = paymentMethods.find(m => m.method_name === methodName);
    const isPayPal = methodName === 'paypal';
    const isStripe = methodName === 'stripe';
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>Configure ${isPayPal ? 'PayPal' : isStripe ? 'Stripe' : methodName}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <form class="modal-body" id="paymentConfigForm">
          <div class="form-group">
            <label>${isPayPal ? 'Client ID' : isStripe ? 'Publishable Key' : 'API Key'}</label>
            <input 
              type="text" 
              name="api_key" 
              class="form-control"
              value="${config?.api_key || ''}" 
              required
              placeholder="${isStripe ? 'pk_...' : ''}"
            />
          </div>
          <div class="form-group">
            <label>${isPayPal ? 'Secret' : 'Secret Key'}</label>
            <input 
              type="password" 
              name="api_secret" 
              class="form-control"
              value="${config?.api_secret || ''}" 
              required
              placeholder="${isStripe ? 'sk_...' : ''}"
            />
          </div>
          <div class="form-group">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input 
                type="checkbox" 
                name="sandbox_mode" 
                ${!config || config.sandbox_mode === true || config.sandbox_mode === 1 ? 'checked' : ''}
              />
              <span>Sandbox Mode (Testing)</span>
            </label>
          </div>
        </form>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
            Cancel
          </button>
          <button class="btn btn-primary" id="savePaymentConfig">
            Save
          </button>
        </div>
      </div>
    `;
    
    const form = modal.querySelector('#paymentConfigForm');
    const saveBtn = modal.querySelector('#savePaymentConfig');
    
    saveBtn.onclick = async (e) => {
        e.preventDefault();
        
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        
        const formData = new FormData(form);
        
        try {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span>Saving...</span>';
            
            const token = localStorage.getItem('token');
            const response = await fetch('/api/tenant/payments/methods', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    method_name: methodName,
                    api_key: formData.get('api_key'),
                    api_secret: formData.get('api_secret'),
                    sandbox_mode: formData.get('sandbox_mode') === 'on'
                })
            });
            
            if (response.ok) {
                modal.remove();
                Modal.alert('Success', 'Payment method saved successfully!', 'success');
                loadPaymentMethods();
            } else {
                const errorData = await response.json();
                Modal.alert('Error', errorData.error || 'Error saving payment method', 'error');
            }
        } catch (error) {
            Modal.alert('Error', error.message || 'An unexpected error occurred', 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span>Save</span>';
        }
    };
    
    document.body.appendChild(modal);
};

// Toggle method
window.toggleMethod = async function(id, active) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/tenant/payments/methods/${id}/toggle`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ active })
        });
        
        if (response.ok) {
            Modal.alert('Success', `Payment method ${active ? 'enabled' : 'disabled'} successfully!`, 'success');
            loadPaymentMethods();
        } else {
            const errorData = await response.json();
            Modal.alert('Error', errorData.error || 'Error updating payment method', 'error');
        }
    } catch (error) {
        Modal.alert('Error', error.message || 'An unexpected error occurred', 'error');
    }
};

// Load stats
async function loadPaymentStats() {
    try {
        await loadSystemCurrency();
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/payments/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('todayPayments').textContent = stats.today.count;
            document.getElementById('totalAmount').textContent = formatCurrencyAmount(stats.today.total);
            document.getElementById('pendingPayments').textContent = stats.pending;
            document.getElementById('successRate').textContent = `${stats.success_rate}%`;
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// Load links
async function loadPaymentLinks() {
    try {
        await loadSystemCurrency();
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/payments/links?page=1&limit=20', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            const tbody = document.getElementById('paymentsTableBody');
            if (tbody) {
                tbody.innerHTML = data.links.length ? data.links.map(link => `
                    <tr>
                        <td>#${link.id}</td>
                        <td>${link.customer_name || 'N/A'}<br><small>${link.customer_phone}</small></td>
                        <td>${formatCurrencyAmount(link.amount)}</td>
                        <td>${link.payment_method}</td>
                        <td>${link.status}</td>
                        <td>${link.created_by_name || 'N/A'}</td>
                        <td>${new Date(link.created_at).toLocaleString()}</td>
                        <td><button class="btn btn-sm" onclick="window.open('${link.payment_url}')">View</button></td>
                    </tr>
                `).join('') : '<tr><td colspan="8" style="text-align: center;">No links found</td></tr>';
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

window.filterPayments = loadPaymentLinks;
window.refreshPayments = function() {
    loadPaymentStats();
    loadPaymentLinks();
};

console.log('Payments module loaded');
