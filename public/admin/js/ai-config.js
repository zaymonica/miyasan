/**
 * AI Configuration Management Module
 * Multi-tenant AI provider configuration
 */

console.log('AI Config.js loaded');

// Global variables
let aiConfigs = [];
let currentEditingConfig = null;

// Register page handler
if (!window.pageHandlers) {
  console.log('pageHandlers not defined, creating it');
  window.pageHandlers = {};
}

window.pageHandlers['ai-config'] = function () {
  console.log('AI Config handler called!');
  // Check if feature is enabled before loading
  checkFeatureEnabled('ai').then(enabled => {
    if (enabled) {
      loadAIConfigPage();
    }
  });
};

console.log('AI Config handler registered:', typeof window.pageHandlers['ai-config']);

// ===== PAGE INITIALIZATION =====

function loadAIConfigPage() {
  console.log('Loading AI Config page...');

  loadAIStats();
  loadAIConfigs();

  console.log('AI Config page loaded');
}

// ===== STATISTICS =====

async function loadAIStats() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/tenant/ai-config/stats', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.ok) {
      const stats = await response.json();

      document.getElementById('todayAIMessages').textContent = stats.today_ai_messages;
      document.getElementById('weekAIMessages').textContent = stats.week_ai_messages;
      document.getElementById('avgResponseTime').textContent = `${stats.avg_response_time.toFixed(2)}s`;
      document.getElementById('activeConfigName').textContent = stats.active_config
        ? stats.active_config.persona_name
        : 'None';
    }
  } catch (error) {
    console.error('Error loading AI stats:', error);
  }
}

// ===== CONFIGURATIONS LIST =====

async function loadAIConfigs() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/tenant/ai-config/settings', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.ok) {
      aiConfigs = await response.json();
      renderAIConfigs();
    }
  } catch (error) {
    console.error('Error loading AI configs:', error);
  }
}

function renderAIConfigs() {
  const container = document.getElementById('aiConfigsList');
  if (!container) return;

  container.innerHTML = '';

  if (aiConfigs.length === 0) {
    container.innerHTML = `
      <p style="text-align: center; color: #666; padding: 20px;" data-i18n="ai_config.no_configs">
        No AI configurations yet. Click "Add Configuration" to create one.
      </p>
    `;
    return;
  }

  aiConfigs.forEach((config) => {
    const configDiv = document.createElement('div');
    configDiv.style.cssText =
      'margin-bottom: 15px; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;';

    const providerColors = {
      deepseek: '#4CAF50',
      gpt: '#2196F3',
      openai: '#2196F3'
    };

    const providerColor = providerColors[config.provider] || '#666';

    configDiv.innerHTML = `
      <div style="padding: 15px; background: #f9f9f9; display: flex; align-items: center; justify-content: space-between;">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
            <span style="background: ${providerColor}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
              ${config.provider}
            </span>
            ${
              config.active
                ? '<span style="background: #4CAF50; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px;" data-i18n="ai_config.active">Active</span>'
                : ''
            }
          </div>
          <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">${config.persona_name}</div>
          <div style="color: #666; font-size: 14px;">${config.model_name}</div>
          ${
            config.persona_description
              ? `<div style="color: #888; font-size: 12px; margin-top: 5px;">${config.persona_description}</div>`
              : ''
          }
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-sm btn-info" onclick="testAIConfig(${config.id})" data-i18n="ai_config.test">Test</button>
          <button class="btn btn-sm btn-primary" onclick="editAIConfig(${config.id})" data-i18n="btn.edit">Edit</button>
          <button class="btn btn-sm ${config.active ? 'btn-warning' : 'btn-success'}" onclick="toggleAIConfig(${config.id}, ${!config.active})">
            <span data-i18n="${config.active ? 'btn.deactivate' : 'btn.activate'}">${config.active ? 'Deactivate' : 'Activate'}</span>
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteAIConfig(${config.id})" data-i18n="btn.delete">Delete</button>
        </div>
      </div>
      <div style="padding: 15px; background: white; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; font-size: 13px;">
        <div>
          <strong data-i18n="ai_config.temperature">Temperature:</strong> ${config.temperature}
        </div>
        <div>
          <strong data-i18n="ai_config.max_tokens">Max Tokens:</strong> ${config.max_tokens}
        </div>
        <div>
          <strong data-i18n="ai_config.business_hours">Business Hours:</strong> ${config.business_hours_start} - ${config.business_hours_end}
        </div>
        <div>
          <strong data-i18n="ai_config.auto_response">Auto Response:</strong> ${config.auto_response_enabled ? 'Yes' : 'No'}
        </div>
        <div>
          <strong data-i18n="ai_config.response_delay">Response Delay:</strong> ${config.response_delay}s
        </div>
        <div>
          <strong data-i18n="ai_config.api_key_status">API Key:</strong> 
          <span style="color: ${config.api_key_status === 'configured' ? '#4CAF50' : '#f44336'};">
            ${config.api_key_status === 'configured' ? 'Configured' : 'Not Configured'}
          </span>
        </div>
      </div>
    `;

    container.appendChild(configDiv);
  });

  // Apply translations if available
  if (window.applyTranslations) {
    window.applyTranslations();
  }
}

// ===== ADD/EDIT CONFIGURATION =====

function showAddAIConfigModal() {
  currentEditingConfig = null;
  showAIConfigModal();
}

function editAIConfig(configId) {
  const config = aiConfigs.find((c) => c.id === configId);
  if (!config) return;

  currentEditingConfig = config;
  showAIConfigModal(config);
}

async function showAIConfigModal(config = null) {
  const modal = document.createElement('div');
  modal.id = 'aiConfigModal';
  modal.style.cssText =
    'position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; overflow-y: auto;';

  // Load available models if editing
  let modelsHTML = '';
  if (config) {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/tenant/ai-config/models/${config.provider}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const models = await response.json();
        modelsHTML = models
          .map(
            (m) =>
              `<option value="${m.id}" ${config.model_name === m.id ? 'selected' : ''}>${m.name} - ${m.description}</option>`
          )
          .join('');
      }
    } catch (error) {
      console.error('Error loading models:', error);
    }
  }

  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 10px; width: 90%; max-width: 800px; max-height: 90vh; overflow-y: auto;">
      <h2 data-i18n="ai_config.${config ? 'edit' : 'add'}_config">${config ? 'Edit' : 'Add'} AI Configuration</h2>
      
      <form id="aiConfigForm" onsubmit="handleAIConfigSubmit(event)" style="margin-top: 20px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">
          
          <div style="grid-column: 1 / -1;">
            <label data-i18n="ai_config.provider">Provider:</label>
            <select id="aiProvider" required onchange="loadModelsForProvider(this.value)" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
              <option value="" data-i18n="ai_config.select_provider">Select provider...</option>
              <option value="deepseek" ${config?.provider === 'deepseek' ? 'selected' : ''}>DeepSeek</option>
              <option value="openai" ${config?.provider === 'openai' || config?.provider === 'gpt' ? 'selected' : ''}>OpenAI (GPT)</option>
            </select>
          </div>

          <div style="grid-column: 1 / -1;">
            <label data-i18n="ai_config.model">Model:</label>
            <select id="aiModel" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
              <option value="" data-i18n="ai_config.select_model">Select model...</option>
              ${modelsHTML}
            </select>
          </div>

          <div style="grid-column: 1 / -1;">
            <label data-i18n="ai_config.api_key">API Key:</label>
            <input type="password" id="aiApiKey" ${config ? '' : 'required'} placeholder="${config ? 'Leave empty to keep current' : 'Enter API key...'}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
          </div>

          <div style="grid-column: 1 / -1;">
            <label data-i18n="ai_config.persona_name">Persona Name:</label>
            <input type="text" id="aiPersonaName" value="${config?.persona_name || ''}" required placeholder="Customer Support Bot" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
          </div>

          <div style="grid-column: 1 / -1;">
            <label data-i18n="ai_config.persona_description">Persona Description:</label>
            <textarea id="aiPersonaDescription" placeholder="A helpful assistant..." style="width: 100%; min-height: 60px; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">${config?.persona_description || ''}</textarea>
          </div>

          <div style="grid-column: 1 / -1;">
            <label data-i18n="ai_config.system_prompt">System Prompt:</label>
            <textarea id="aiSystemPrompt" required placeholder="You are a helpful assistant..." style="width: 100%; min-height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">${config?.system_prompt || ''}</textarea>
          </div>

          <div>
            <label data-i18n="ai_config.temperature">Temperature (0-2):</label>
            <input type="number" id="aiTemperature" value="${config?.temperature || 0.7}" step="0.1" min="0" max="2" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
          </div>

          <div>
            <label data-i18n="ai_config.max_tokens">Max Tokens:</label>
            <input type="number" id="aiMaxTokens" value="${config?.max_tokens || 1000}" min="1" max="128000" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
          </div>

          <div>
            <label data-i18n="ai_config.business_hours_start">Business Hours Start:</label>
            <input type="time" id="aiBusinessStart" value="${config?.business_hours_start || '08:00'}" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
          </div>

          <div>
            <label data-i18n="ai_config.business_hours_end">Business Hours End:</label>
            <input type="time" id="aiBusinessEnd" value="${config?.business_hours_end || '18:00'}" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
          </div>

          <div style="grid-column: 1 / -1;">
            <label data-i18n="ai_config.business_days">Business Days:</label>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;">
              ${['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                .map((day) => {
                  const checked = config?.business_days?.includes(day) || (!config && day !== 'sunday');
                  return `
                  <label style="display: flex; align-items: center; gap: 5px;">
                    <input type="checkbox" class="business-day" value="${day}" ${checked ? 'checked' : ''}>
                    <span data-i18n="days.${day}">${day}</span>
                  </label>
                `;
                })
                .join('')}
            </div>
          </div>

          <div>
            <label data-i18n="ai_config.response_delay">Response Delay (seconds):</label>
            <input type="number" id="aiResponseDelay" value="${config?.response_delay || 2}" min="0" max="60" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="aiAutoResponse" ${config?.auto_response_enabled !== false ? 'checked' : ''}>
              <span data-i18n="ai_config.auto_response_enabled">Enable Auto Response</span>
            </label>
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
              <input type="checkbox" id="aiActive" ${config?.active ? 'checked' : ''}>
              <span data-i18n="ai_config.set_active">Set as Active</span>
            </label>
          </div>

        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
          <button type="button" class="btn btn-secondary" onclick="closeAIConfigModal()" data-i18n="btn.cancel">Cancel</button>
          <button type="submit" class="btn btn-primary" data-i18n="btn.save">Save</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  // Apply translations if available
  if (window.applyTranslations) {
    window.applyTranslations();
  }
}

async function loadModelsForProvider(provider) {
  if (!provider) return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/tenant/ai-config/models/${provider}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.ok) {
      const models = await response.json();
      const modelSelect = document.getElementById('aiModel');
      modelSelect.innerHTML = '<option value="" data-i18n="ai_config.select_model">Select model...</option>';

      models.forEach((model) => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name} - ${model.description}`;
        modelSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading models:', error);
  }
}

async function handleAIConfigSubmit(event) {
  event.preventDefault();

  try {
    const token = localStorage.getItem('token');

    const businessDays = Array.from(document.querySelectorAll('.business-day:checked'))
      .map((cb) => cb.value)
      .join(',');

    const configData = {
      provider: document.getElementById('aiProvider').value,
      model_name: document.getElementById('aiModel').value,
      persona_name: document.getElementById('aiPersonaName').value,
      persona_description: document.getElementById('aiPersonaDescription').value,
      system_prompt: document.getElementById('aiSystemPrompt').value,
      temperature: parseFloat(document.getElementById('aiTemperature').value),
      max_tokens: parseInt(document.getElementById('aiMaxTokens').value),
      business_hours_start: document.getElementById('aiBusinessStart').value,
      business_hours_end: document.getElementById('aiBusinessEnd').value,
      business_days: businessDays,
      response_delay: parseInt(document.getElementById('aiResponseDelay').value),
      auto_response_enabled: document.getElementById('aiAutoResponse').checked,
      active: document.getElementById('aiActive').checked
    };

    const apiKey = document.getElementById('aiApiKey').value;
    if (apiKey) {
      configData.api_key = apiKey;
    }

    const url = currentEditingConfig
      ? `/api/tenant/ai-config/settings/${currentEditingConfig.id}`
      : '/api/tenant/ai-config/settings';

    const method = currentEditingConfig ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(configData)
    });

    if (response.ok) {
      showNotification('Configuration saved successfully!', 'success');
      closeAIConfigModal();
      loadAIConfigs();
      loadAIStats();
    } else {
      const error = await response.json();
      showNotification(error.error || 'Error saving configuration', 'error');
    }
  } catch (error) {
    console.error('Error saving configuration:', error);
    showNotification('Error saving configuration', 'error');
  }
}

function closeAIConfigModal() {
  const modal = document.getElementById('aiConfigModal');
  if (modal) {
    modal.remove();
  }
  currentEditingConfig = null;
}

// ===== TOGGLE CONFIGURATION =====

async function toggleAIConfig(configId, active) {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/tenant/ai-config/settings/${configId}/toggle`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ active })
    });

    if (response.ok) {
      showNotification(`Configuration ${active ? 'activated' : 'deactivated'} successfully!`, 'success');
      loadAIConfigs();
      loadAIStats();
    } else {
      const error = await response.json();
      showNotification(error.error || 'Error toggling configuration', 'error');
    }
  } catch (error) {
    console.error('Error toggling configuration:', error);
    showNotification('Error toggling configuration', 'error');
  }
}

// ===== DELETE CONFIGURATION =====

async function deleteAIConfig(configId) {
  window.showCustomConfirm(
    'Are you sure you want to delete this configuration?',
    'This action cannot be undone.',
    async () => {
      await performDeleteAIConfig(configId);
    }
  );
}

async function performDeleteAIConfig(configId) {

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/tenant/ai-config/settings/${configId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.ok) {
      showNotification('Configuration deleted successfully!', 'success');
      loadAIConfigs();
      loadAIStats();
    } else {
      const error = await response.json();
      showNotification(error.error || 'Error deleting configuration', 'error');
    }
  } catch (error) {
    console.error('Error deleting configuration:', error);
    showNotification('Error deleting configuration', 'error');
  }
}

// ===== TEST CONFIGURATION =====

async function testAIConfig(configId) {
  window.showCustomPrompt(
    'Enter a test message:',
    'Hello, this is a connection test.',
    async (testMessage) => {
      if (!testMessage) return;
      await performTestAIConfig(configId, testMessage);
    }
  );
}

async function performTestAIConfig(configId, testMessage) {
  showNotification('Testing connection...', 'info');

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/tenant/ai-config/test/${configId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ test_message: testMessage })
    });

    const result = await response.json();

    if (result.success) {
      showTestResultModal(result);
    } else {
      showNotification(`Test failed: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Error testing configuration:', error);
    showNotification('Error testing configuration', 'error');
  }
}

function showTestResultModal(result) {
  const modal = document.createElement('div');
  modal.id = 'testResultModal';
  modal.style.cssText =
    'position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;';

  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 10px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto;">
      <h2 data-i18n="ai_config.test_result">Test Result</h2>
      
      <div style="margin: 20px 0; padding: 15px; background: #e8f5e9; border-radius: 5px; border-left: 4px solid #4CAF50;">
        <strong data-i18n="ai_config.test_success">✓ Connection successful!</strong>
      </div>

      <div style="margin: 20px 0;">
        <strong data-i18n="ai_config.ai_response">AI Response:</strong>
        <div style="margin-top: 10px; padding: 15px; background: #f5f5f5; border-radius: 5px; white-space: pre-wrap;">
          ${result.response}
        </div>
      </div>

      ${
        result.usage
          ? `
        <div style="margin: 20px 0; font-size: 13px; color: #666;">
          <strong data-i18n="ai_config.usage">Usage:</strong><br>
          Prompt Tokens: ${result.usage.prompt_tokens}<br>
          Completion Tokens: ${result.usage.completion_tokens}<br>
          Total Tokens: ${result.usage.total_tokens}
        </div>
      `
          : ''
      }

      <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
        <button class="btn btn-primary" onclick="closeTestResultModal()" data-i18n="btn.close">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Apply translations if available
  if (window.applyTranslations) {
    window.applyTranslations();
  }
}

function closeTestResultModal() {
  const modal = document.getElementById('testResultModal');
  if (modal) {
    modal.remove();
  }
}

// ===== UTILITIES =====

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 5px;
    color: white;
    font-weight: bold;
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;

  const colors = {
    success: '#4CAF50',
    error: '#f44336',
    info: '#2196F3',
    warning: '#FF9800'
  };

  notification.style.backgroundColor = colors[type] || colors.info;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

console.log('AI Config module fully loaded');
