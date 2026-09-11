/**
 * Payment Links Module
 */

window.pageHandlers['payment-links'] = function() {
  loadPaymentLinksPage();
};

let paymentLinks = [];

async function loadPaymentLinksPage() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1>Payment Links</h1>
      <button class="btn btn-primary" onclick="showCreatePaymentLinkModal()">
        <i class="fas fa-plus"></i> New Payment Link
      </button>
    </div>

    <div class="card">
      <div class="card-body">
        <div id="paymentLinkList">Loading...</div>
      </div>
    </div>
  `;

  await loadPaymentLinks();
}

async function loadPaymentLinks() {
  try {
    const response = await apiRequest('/payment-links');
    if (response.success) {
      paymentLinks = response.data;
      renderPaymentLinks(paymentLinks);
    }
  } catch (error) {
    showAlert('Error loading payment links: ' + error.message, 'error');
  }
}

function renderPaymentLinks(data) {
  const container = document.getElementById('paymentLinkList');
  
  if (data.length === 0) {
    container.innerHTML = '<p class="text-center">No payment links found</p>';
    return;
  }

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Amount</th>
          <th>Link</th>
          <th>Status</th>
          <th>Clicks</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(link => `
          <tr>
            <td>${link.title}</td>
            <td>${formatCurrency(link.amount, link.currency)}</td>
            <td>
              <code>${link.short_url || link.link_id}</code>
              <button class="btn btn-sm" onclick="copyPaymentLink('${link.short_url || link.link_id}')">
                <i class="fas fa-copy"></i>
              </button>
            </td>
            <td>
              <span class="badge badge-${link.is_active ? 'success' : 'secondary'}">
                ${link.is_active ? 'Active' : 'Inactive'}
              </span>
            </td>
            <td>${link.click_count || 0}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="viewPaymentLink(${link.id})">
                <i class="fas fa-eye"></i>
              </button>
              <button class="btn btn-sm btn-danger" onclick="deletePaymentLink(${link.id})">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function showCreatePaymentLinkModal() {
  let defaultCurrency = 'USD';
  try {
    const res = await api.get('/plan/current');
    defaultCurrency = res.data?.currency || defaultCurrency;
  } catch (e) {}
  const content = `
    <form id="paymentLinkForm">
      <div class="form-group">
        <label>Title *</label>
        <input type="text" name="title" class="form-control" required>
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea name="description" class="form-control" rows="3"></textarea>
      </div>
      <div class="form-group">
        <label>Amount *</label>
        <input type="number" name="amount" class="form-control" step="0.01" required>
      </div>
      <div class="form-group">
        <label>Currency</label>
        <select name="currency" class="form-control">
          <option value="USD" ${defaultCurrency==='USD'?'selected':''}>USD</option>
          <option value="EUR" ${defaultCurrency==='EUR'?'selected':''}>EUR</option>
          <option value="BRL" ${defaultCurrency==='BRL'?'selected':''}>BRL</option>
        </select>
      </div>
      <div class="form-group">
        <label>Payment Method</label>
        <select name="payment_method" class="form-control">
          <option value="stripe">Stripe</option>
          <option value="paypal">PayPal</option>
          <option value="pix">PIX (Brazil)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Expiration Date (optional)</label>
        <input type="datetime-local" name="expires_at" class="form-control">
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" name="is_active" checked> Active
        </label>
      </div>
    </form>
  `;

  const actions = `
    <button class="btn btn-secondary" onclick="closeModal(this)">Cancel</button>
    <button class="btn btn-primary" onclick="savePaymentLink()">Create</button>
  `;

  showModal('New Payment Link', content, actions);
}

async function savePaymentLink() {
  const form = document.getElementById('paymentLinkForm');
  const formData = new FormData(form);
  
  const data = {
    title: formData.get('title'),
    description: formData.get('description'),
    amount: parseFloat(formData.get('amount')),
    currency: formData.get('currency'),
    payment_method: formData.get('payment_method'),
    expires_at: formData.get('expires_at'),
    is_active: formData.get('is_active') ? 1 : 0
  };

  try {
    const response = await apiRequest('/payment-links', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    });

    if (response.success) {
      showAlert('Payment link created successfully', 'success');
      closeModal(document.querySelector('.modal-close'));
      await loadPaymentLinks();
    }
  } catch (error) {
    showAlert('Error creating payment link: ' + error.message, 'error');
  }
}

async function viewPaymentLink(id) {
  const link = paymentLinks.find(l => l.id === id);
  if (!link) return;

  const fullUrl = window.location.origin + '/pay/' + (link.short_url || link.link_id);
  
  const content = `
    <div class="payment-link-details">
      <p><strong>Title:</strong> ${link.title}</p>
      <p><strong>Description:</strong> ${link.description || 'N/A'}</p>
      <p><strong>Amount:</strong> ${formatCurrency(link.amount, link.currency)}</p>
      <p><strong>Payment Method:</strong> ${link.payment_method}</p>
      <p><strong>Status:</strong> <span class="badge badge-${link.is_active ? 'success' : 'secondary'}">${link.is_active ? 'Active' : 'Inactive'}</span></p>
      <p><strong>Clicks:</strong> ${link.click_count || 0}</p>
      ${link.expires_at ? `<p><strong>Expires:</strong> ${formatDate(link.expires_at)}</p>` : ''}
      <p><strong>Link:</strong><br><code>${fullUrl}</code></p>
      <button class="btn btn-primary" onclick="copyPaymentLink('${fullUrl}')">
        <i class="fas fa-copy"></i> Copy Link
      </button>
    </div>
  `;

  showModal('Payment Link Details', content);
}

function copyPaymentLink(url) {
  const fullUrl = url.startsWith('http') ? url : window.location.origin + '/pay/' + url;
  navigator.clipboard.writeText(fullUrl).then(() => {
    showAlert('Payment link copied to clipboard', 'success');
  });
}

async function deletePaymentLink(id) {
  if (!confirm('Are you sure you want to delete this payment link?')) return;

  try {
    const response = await apiRequest(`/payment-links/${id}`, { method: 'DELETE' });
    if (response.success) {
      showAlert('Payment link deleted successfully', 'success');
      await loadPaymentLinks();
    }
  } catch (error) {
    showAlert('Error deleting payment link: ' + error.message, 'error');
  }
}
