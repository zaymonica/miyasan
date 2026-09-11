let apiKeysCache = [];
let webhooksCache = [];
let lastGeneratedApiKey = null;

if (!window.pageHandlers) window.pageHandlers = {};

window.pageHandlers['api-rest'] = function() {
  if (typeof checkFeatureEnabled === 'function') {
    checkFeatureEnabled('api-rest').then(enabled => {
      if (enabled) {
        loadApiRestPage();
      }
    });
  } else {
    loadApiRestPage();
  }
};

window.pageHandlers['api-documentation'] = function() {
  if (typeof checkFeatureEnabled === 'function') {
    checkFeatureEnabled('api-documentation').then(enabled => {
      if (enabled) {
        loadApiDocumentationPage();
      }
    });
  } else {
    loadApiDocumentationPage();
  }
};

window.pageHandlers.webhook = function() {
  if (typeof checkFeatureEnabled === 'function') {
    checkFeatureEnabled('webhook').then(enabled => {
      if (enabled) {
        loadWebhookPage();
      }
    });
  } else {
    loadWebhookPage();
  }
};

function loadApiRestPage() {
  const notice = document.getElementById('apiKeyNotice');
  if (notice && !lastGeneratedApiKey) {
    notice.style.display = 'none';
  }
  loadApiKeys();
}

function loadApiDocumentationPage() {
  if (window.i18n && typeof window.i18n.translatePage === 'function') {
    window.i18n.translatePage();
  }
  initApiDocsTabs();
  updateApiDocsBaseUrl();
}

function loadWebhookPage() {
  loadWebhooks();
}

function initApiDocsTabs() {
  const container = document.getElementById('api-docs-tabs');
  if (!container) return;

  const tabs = Array.from(container.querySelectorAll('[data-doc-tab]'));
  const panels = Array.from(container.querySelectorAll('[data-doc-panel]'));

  const activateTab = (name) => {
    tabs.forEach(tab => {
      const isActive = tab.dataset.docTab === name;
      tab.style.background = isActive ? 'var(--primary)' : '#f8fafc';
      tab.style.color = isActive ? '#fff' : '#0f172a';
      tab.style.borderColor = isActive ? 'var(--primary)' : '#e2e8f0';
    });

    panels.forEach(panel => {
      panel.style.display = panel.dataset.docPanel === name ? 'block' : 'none';
    });
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.docTab));
  });

  const initial = tabs.find(tab => tab.style.background.includes('var(--primary)')) || tabs[0];
  if (initial) {
    activateTab(initial.dataset.docTab);
  }
}

function updateApiDocsBaseUrl() {
  const baseUrl = window.location.origin;
  const baseUrlElement = document.getElementById('api-docs-base-url');
  if (baseUrlElement) {
    baseUrlElement.textContent = baseUrl;
  }

  const container = document.getElementById('api-docs-tabs');
  if (!container) return;

  const codeBlocks = Array.from(container.querySelectorAll('pre code'));
  codeBlocks.forEach(block => {
    if (block.textContent.includes('__BASE_URL__')) {
      block.textContent = block.textContent.replaceAll('__BASE_URL__', baseUrl);
    }
  });
}

async function loadApiKeys() {
  const tbody = document.getElementById('apiKeysTableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align: center;" data-i18n="common.loading">Loading...</td>
    </tr>
  `;

  try {
    const result = await api.get('/api-keys');
    apiKeysCache = result.data || [];

    if (!apiKeysCache.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center;" data-i18n="integration.no_api_keys">No API keys created yet.</td>
        </tr>
      `;
    } else {
      tbody.innerHTML = apiKeysCache.map(key => `
        <tr>
          <td>${escapeHtml(key.key_name)}</td>
          <td>${escapeHtml(key.key_prefix)}</td>
          <td>
            <span class="badge ${key.is_active ? 'badge-success' : 'badge-danger'}">
              ${key.is_active ? getTranslation('integration.active', 'Active') : getTranslation('integration.inactive', 'Inactive')}
            </span>
          </td>
          <td>${formatDateTime(key.created_at)}</td>
          <td>${key.last_used_at ? formatDateTime(key.last_used_at) : getTranslation('integration.never_used', 'Never')}</td>
          <td>
            ${key.is_active ? `
              <button class="btn btn-danger btn-sm" onclick="revokeApiKey(${key.id})">
                <i class="fas fa-ban"></i> <span data-i18n="integration.revoke_key">Revoke</span>
              </button>
            ` : `
              <span data-i18n="integration.revoked">Revoked</span>
            `}
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: #ef4444;" data-i18n="integration.load_api_keys_error">Error loading API keys.</td>
      </tr>
    `;
  }

  if (window.i18n && typeof window.i18n.translatePage === 'function') {
    window.i18n.translatePage();
  }
}

function showCreateApiKeyModal() {
  Modal.form({
    title: 'integration.create_api_key',
    fields: [
      {
        label: 'integration.key_name',
        name: 'name',
        placeholder: 'integration.key_name_placeholder',
        required: true
      }
    ],
    onSubmit: async (data) => {
      await createApiKey(data.name);
    }
  });
}

async function createApiKey(name) {
  try {
    const result = await api.post('/api-keys', { name });
    if (result && result.data && result.data.key) {
      lastGeneratedApiKey = result.data.key;
      const notice = document.getElementById('apiKeyNotice');
      const value = document.getElementById('apiKeyValue');
      if (notice && value) {
        value.textContent = lastGeneratedApiKey;
        notice.style.display = 'block';
      }
    }
    if (typeof showNotification === 'function') {
      showNotification(getTranslation('integration.api_key_created', 'API key created successfully.'), 'success');
    }
    await loadApiKeys();
  } catch (error) {
    if (typeof showNotification === 'function') {
      showNotification(getTranslation('integration.api_key_create_error', 'Error creating API key.'), 'error');
    }
  }
}

async function revokeApiKey(id) {
  Modal.confirm('integration.revoke_key', 'integration.revoke_key_confirm', async () => {
    try {
      await api.delete(`/api-keys/${id}`);
      if (typeof showNotification === 'function') {
        showNotification(getTranslation('integration.api_key_revoked', 'API key revoked.'), 'success');
      }
      await loadApiKeys();
    } catch (error) {
      if (typeof showNotification === 'function') {
        showNotification(getTranslation('integration.api_key_revoke_error', 'Error revoking API key.'), 'error');
      }
    }
  });
}

function copyApiKey() {
  if (!lastGeneratedApiKey) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(lastGeneratedApiKey).then(() => {
      if (typeof showNotification === 'function') {
        showNotification(getTranslation('integration.key_copied', 'API key copied.'), 'success');
      }
    });
  } else {
    const temp = document.createElement('textarea');
    temp.value = lastGeneratedApiKey;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    temp.remove();
    if (typeof showNotification === 'function') {
      showNotification(getTranslation('integration.key_copied', 'API key copied.'), 'success');
    }
  }
}

async function loadWebhooks() {
  const tbody = document.getElementById('webhooksTableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" style="text-align: center;" data-i18n="common.loading">Loading...</td>
    </tr>
  `;

  try {
    const result = await api.get('/webhooks');
    webhooksCache = result.data || [];

    if (!webhooksCache.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center;" data-i18n="integration.no_webhooks">No webhooks configured.</td>
        </tr>
      `;
    } else {
      tbody.innerHTML = webhooksCache.map(hook => `
        <tr>
          <td>${escapeHtml(hook.event_type)}</td>
          <td style="max-width: 320px; word-break: break-all;">${escapeHtml(hook.webhook_url)}</td>
          <td>
            <span class="badge ${hook.is_active ? 'badge-success' : 'badge-danger'}">
              ${hook.is_active ? getTranslation('integration.active', 'Active') : getTranslation('integration.inactive', 'Inactive')}
            </span>
          </td>
          <td>${formatDateTime(hook.created_at)}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="showEditWebhookModal(${hook.id})">
              <i class="fas fa-edit"></i> <span data-i18n="integration.edit">Edit</span>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteWebhook(${hook.id})">
              <i class="fas fa-trash"></i> <span data-i18n="integration.delete">Delete</span>
            </button>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #ef4444;" data-i18n="integration.load_webhooks_error">Error loading webhooks.</td>
      </tr>
    `;
  }

  if (window.i18n && typeof window.i18n.translatePage === 'function') {
    window.i18n.translatePage();
  }
}

function showCreateWebhookModal() {
  Modal.form({
    title: 'integration.create_webhook',
    fields: [
      {
        label: 'integration.webhook_event',
        name: 'event_type',
        type: 'select',
        required: true,
        options: [
          { value: 'conversation.created', label: 'conversation.created' },
          { value: 'conversation.closed', label: 'conversation.closed' },
          { value: 'message.received', label: 'message.received' },
          { value: 'message.sent', label: 'message.sent' },
          { value: 'payment.received', label: 'payment.received' }
        ]
      },
      {
        label: 'integration.webhook_url',
        name: 'webhook_url',
        placeholder: 'integration.webhook_url_placeholder',
        required: true
      },
      {
        label: 'integration.webhook_secret',
        name: 'secret_key',
        placeholder: 'integration.webhook_secret_placeholder',
        required: false
      },
      {
        label: 'integration.webhook_status',
        name: 'is_active',
        type: 'select',
        options: [
          { value: 'true', label: getTranslation('integration.active', 'Active') },
          { value: 'false', label: getTranslation('integration.inactive', 'Inactive') }
        ]
      }
    ],
    onSubmit: async (data) => {
      await createWebhook(data);
    }
  });
}

async function createWebhook(data) {
  try {
    await api.post('/webhooks', {
      event_type: data.event_type,
      webhook_url: data.webhook_url,
      secret_key: data.secret_key,
      is_active: data.is_active !== 'false'
    });
    if (typeof showNotification === 'function') {
      showNotification(getTranslation('integration.webhook_created', 'Webhook created successfully.'), 'success');
    }
    await loadWebhooks();
  } catch (error) {
    if (typeof showNotification === 'function') {
      showNotification(getTranslation('integration.webhook_create_error', 'Error creating webhook.'), 'error');
    }
  }
}

function showEditWebhookModal(id) {
  const hook = webhooksCache.find(item => item.id === id);
  if (!hook) return;

  Modal.form({
    title: 'integration.edit_webhook',
    fields: [
      {
        label: 'integration.webhook_event',
        name: 'event_type',
        type: 'select',
        required: true,
        value: hook.event_type,
        options: [
          { value: 'conversation.created', label: 'conversation.created' },
          { value: 'conversation.closed', label: 'conversation.closed' },
          { value: 'message.received', label: 'message.received' },
          { value: 'message.sent', label: 'message.sent' },
          { value: 'payment.received', label: 'payment.received' }
        ]
      },
      {
        label: 'integration.webhook_url',
        name: 'webhook_url',
        placeholder: 'integration.webhook_url_placeholder',
        value: hook.webhook_url,
        required: true
      },
      {
        label: 'integration.webhook_secret',
        name: 'secret_key',
        placeholder: 'integration.webhook_secret_placeholder',
        value: hook.secret_key || '',
        required: false
      },
      {
        label: 'integration.webhook_status',
        name: 'is_active',
        type: 'select',
        value: hook.is_active ? 'true' : 'false',
        options: [
          { value: 'true', label: getTranslation('integration.active', 'Active') },
          { value: 'false', label: getTranslation('integration.inactive', 'Inactive') }
        ]
      }
    ],
    onSubmit: async (data) => {
      await updateWebhook(id, data);
    }
  });
}

async function updateWebhook(id, data) {
  try {
    await api.put(`/webhooks/${id}`, {
      webhook_url: data.webhook_url,
      secret_key: data.secret_key,
      is_active: data.is_active !== 'false'
    });
    if (typeof showNotification === 'function') {
      showNotification(getTranslation('integration.webhook_updated', 'Webhook updated successfully.'), 'success');
    }
    await loadWebhooks();
  } catch (error) {
    if (typeof showNotification === 'function') {
      showNotification(getTranslation('integration.webhook_update_error', 'Error updating webhook.'), 'error');
    }
  }
}

async function deleteWebhook(id) {
  Modal.confirm('integration.delete', 'integration.delete_webhook_confirm', async () => {
    try {
      await api.delete(`/webhooks/${id}`);
      if (typeof showNotification === 'function') {
        showNotification(getTranslation('integration.webhook_deleted', 'Webhook deleted successfully.'), 'success');
      }
      await loadWebhooks();
    } catch (error) {
      if (typeof showNotification === 'function') {
        showNotification(getTranslation('integration.webhook_delete_error', 'Error deleting webhook.'), 'error');
      }
    }
  });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-US');
}

function getTranslation(key, fallback) {
  if (window.i18n && typeof window.i18n.t === 'function') {
    const translated = window.i18n.t(key);
    if (translated && translated !== key) {
      return translated;
    }
  }
  return fallback;
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
