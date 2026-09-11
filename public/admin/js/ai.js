/**
 * AI Configuration Module
 */

window.pageHandlers.ai = function() {
  loadAIPage();
};

let aiConfig = {};

async function loadAIPage() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1>AI Configuration</h1>
    </div>

    <div class="card">
      <div class="card-body">
        <div id="aiSettings">Loading...</div>
      </div>
    </div>
  `;

  await loadAIConfig();
}

async function loadAIConfig() {
  try {
    const response = await apiRequest('/ai/config');
    if (response.success) {
      aiConfig = response.data;
      renderAISettings();
    }
  } catch (error) {
    showAlert('Error loading AI configuration: ' + error.message, 'error');
  }
}

function renderAISettings() {
  const container = document.getElementById('aiSettings');
  
  container.innerHTML = `
    <form id="aiForm">
      <div class="form-group">
        <label>OpenAI API Key *</label>
        <input type="password" name="openai_api_key" class="form-control" value="${aiConfig.openai_api_key || ''}" required>
        <small>Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a></small>
      </div>
      <div class="form-group">
        <label>Model</label>
        <select name="model" class="form-control">
          <option value="gpt-3.5-turbo" ${aiConfig.model === 'gpt-3.5-turbo' ? 'selected' : ''}>GPT-3.5 Turbo</option>
          <option value="gpt-4" ${aiConfig.model === 'gpt-4' ? 'selected' : ''}>GPT-4</option>
          <option value="gpt-4-turbo" ${aiConfig.model === 'gpt-4-turbo' ? 'selected' : ''}>GPT-4 Turbo</option>
        </select>
      </div>
      <div class="form-group">
        <label>System Prompt</label>
        <textarea name="system_prompt" class="form-control" rows="4">${aiConfig.system_prompt || 'You are a helpful customer service assistant.'}</textarea>
      </div>
      <div class="form-group">
        <label>Temperature (0-2)</label>
        <input type="number" name="temperature" class="form-control" value="${aiConfig.temperature || 0.7}" step="0.1" min="0" max="2">
        <small>Higher values make output more random, lower values more focused</small>
      </div>
      <div class="form-group">
        <label>Max Tokens</label>
        <input type="number" name="max_tokens" class="form-control" value="${aiConfig.max_tokens || 500}" min="1" max="4000">
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" name="auto_reply" ${aiConfig.auto_reply ? 'checked' : ''}> 
          Enable Auto-Reply
        </label>
      </div>
      <div class="form-group">
        <label>
          <input type="checkbox" name="is_active" ${aiConfig.is_active ? 'checked' : ''}> 
          Active
        </label>
      </div>
      <button type="button" class="btn btn-primary" onclick="saveAIConfig()">Save Configuration</button>
      <button type="button" class="btn btn-secondary" onclick="testAI()">Test AI</button>
    </form>
  `;
}

async function saveAIConfig() {
  const form = document.getElementById('aiForm');
  const formData = new FormData(form);
  
  const data = {
    openai_api_key: formData.get('openai_api_key'),
    model: formData.get('model'),
    system_prompt: formData.get('system_prompt'),
    temperature: parseFloat(formData.get('temperature')),
    max_tokens: parseInt(formData.get('max_tokens')),
    auto_reply: formData.get('auto_reply') ? 1 : 0,
    is_active: formData.get('is_active') ? 1 : 0
  };

  try {
    const response = await apiRequest('/ai/config', { 
      method: 'PUT', 
      body: JSON.stringify(data) 
    });

    if (response.success) {
      showAlert('AI configuration saved successfully', 'success');
      await loadAIConfig();
    }
  } catch (error) {
    showAlert('Error saving configuration: ' + error.message, 'error');
  }
}

async function testAI() {
  const testMessage = prompt('Enter a test message:');
  if (!testMessage) return;

  try {
    const response = await apiRequest('/ai/test', { 
      method: 'POST',
      body: JSON.stringify({ message: testMessage })
    });

    if (response.success) {
      showModal('AI Response', `<p><strong>Your message:</strong> ${testMessage}</p><p><strong>AI Response:</strong> ${response.data.response}</p>`);
    }
  } catch (error) {
    showAlert('AI test failed: ' + error.message, 'error');
  }
}
