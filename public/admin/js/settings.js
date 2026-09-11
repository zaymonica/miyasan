/**
 * Settings Module
 */

window.pageHandlers.settings = function() {
  loadSettingsPage();
};

async function loadSettingsPage() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1>Settings</h1>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Account Information</h3>
      </div>
      <div class="card-body">
        <div id="accountInfo">Loading...</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Subscription</h3>
      </div>
      <div class="card-body">
        <div id="subscriptionInfo">Loading...</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Change Password</h3>
      </div>
      <div class="card-body">
        <div id="passwordForm">
          <form id="changePasswordForm">
            <div class="form-group">
              <label>Current Password</label>
              <input type="password" name="current_password" class="form-control" required>
            </div>
            <div class="form-group">
              <label>New Password</label>
              <input type="password" name="new_password" class="form-control" required>
            </div>
            <div class="form-group">
              <label>Confirm New Password</label>
              <input type="password" name="confirm_password" class="form-control" required>
            </div>
            <button type="button" class="btn btn-primary" onclick="changePassword()">Change Password</button>
          </form>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 data-i18n="end_chat.config_title">End chat message</h3>
      </div>
      <div class="card-body">
        <button type="button" class="btn btn-primary" id="endChatConfigBtn" data-i18n="end_chat.config_button">Config - end chat</button>
      </div>
    </div>
  `;

  loadAccountInfo();
  loadSubscriptionInfo();
  attachEndChatConfig();
}

async function loadAccountInfo() {
  const container = document.getElementById('accountInfo');
  
  if (!currentUser) {
    container.innerHTML = '<p>Loading...</p>';
    return;
  }

  container.innerHTML = `
    <div class="info-grid">
      <div class="info-item">
        <label>Name:</label>
        <span>${currentUser.name}</span>
      </div>
      <div class="info-item">
        <label>Email:</label>
        <span>${currentUser.email}</span>
      </div>
      <div class="info-item">
        <label>Role:</label>
        <span class="badge badge-primary">${currentUser.role}</span>
      </div>
      <div class="info-item">
        <label>Tenant:</label>
        <span>${currentUser.tenant_name || 'N/A'}</span>
      </div>
      <div class="info-item">
        <label>Account Created:</label>
        <span>${formatDate(currentUser.created_at)}</span>
      </div>
    </div>
  `;
}

async function loadSubscriptionInfo() {
  const container = document.getElementById('subscriptionInfo');
  
  try {
    const response = await apiRequest('/dashboard');
    if (response.success && response.data.subscription) {
      const sub = response.data.subscription;
      container.innerHTML = `
        <div class="info-grid">
          <div class="info-item">
            <label>Plan:</label>
            <span class="badge badge-success">${sub.plan_name}</span>
          </div>
          <div class="info-item">
            <label>Status:</label>
            <span class="badge badge-${sub.status === 'active' ? 'success' : 'warning'}">${sub.status}</span>
          </div>
          <div class="info-item">
            <label>Monthly Price:</label>
            <span>${formatCurrency(sub.monthly_price, sub.currency)}</span>
          </div>
          <div class="info-item">
            <label>Message Limit:</label>
            <span>${sub.message_limit} messages/month</span>
          </div>
          <div class="info-item">
            <label>Current Usage:</label>
            <span>${sub.current_usage || 0} messages</span>
          </div>
          <div class="info-item">
            <label>Next Billing:</label>
            <span>${formatDate(sub.next_billing_date)}</span>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = '<p>No subscription information available</p>';
    }
  } catch (error) {
    container.innerHTML = '<p>Error loading subscription information</p>';
  }
}

async function changePassword() {
  const form = document.getElementById('changePasswordForm');
  const formData = new FormData(form);
  
  const currentPassword = formData.get('current_password');
  const newPassword = formData.get('new_password');
  const confirmPassword = formData.get('confirm_password');

  if (newPassword !== confirmPassword) {
    showAlert('New passwords do not match', 'error');
    return;
  }

  if (newPassword.length < 6) {
    showAlert('Password must be at least 6 characters', 'error');
    return;
  }

  try {
    const response = await apiRequest('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    });

    if (response.success) {
      showAlert('Password changed successfully', 'success');
      form.reset();
    }
  } catch (error) {
    showAlert('Error changing password: ' + error.message, 'error');
  }
}

function attachEndChatConfig() {
  const btn = document.getElementById('endChatConfigBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const defaultMessage = "Obrigado(a) por entrar em contato!\n*Essa conversa foi encerrada*";
    let currentMessage = defaultMessage;
    try {
      const response = await api.get('/end-chat-settings');
      currentMessage = response?.data?.message || defaultMessage;
    } catch (e) {
      currentMessage = defaultMessage;
    }
    Modal.form({
      title: 'end_chat.config_title',
      fields: [
        {
          name: 'message',
          label: 'end_chat.message_label',
          type: 'textarea',
          value: currentMessage,
          placeholder: defaultMessage,
          rows: 4
        }
      ],
      submitText: 'common.save',
      cancelText: 'common.cancel',
      onSubmit: async (data) => {
        await api.put('/end-chat-settings', { message: data.message });
        if (typeof showAlert === 'function') {
          showAlert(i18n.t('end_chat.save_success'), 'success');
        }
      }
    });
  });
}
