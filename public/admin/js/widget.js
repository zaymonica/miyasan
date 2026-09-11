/**
 * Widget Management JavaScript
 * 
 * Handles WhatsApp chat widget configuration, preview, and embed code generation.
 * Provides real-time preview and CRUD operations for widget management.
 */

// Check if already loaded
if (typeof window.widgetModuleLoaded !== 'undefined') {
  console.warn('Widget module already loaded, skipping...');
} else {
  window.widgetModuleLoaded = true;

let currentWidgetId = null;
let searchTimeout = null;

/**
 * API Request helper for widget operations
 */
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };
  
  const mergedOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers
    }
  };
  
  try {
    const response = await fetch('/api' + endpoint, mergedOptions);
    
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      // Include validation details in error message
      let errorMessage = data.message || data.error || 'Request failed';
      if (data.details && Array.isArray(data.details)) {
        errorMessage = data.details.map(d => `${d.field}: ${d.message}`).join(', ');
      }
      console.error('API Error Details:', data);
      throw new Error(errorMessage);
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Page handler
 */
window.pageHandlers.widget = function() {
  console.log('Widget handler called');
  // Check if feature is enabled before loading
  if (typeof checkFeatureEnabled === 'function') {
    checkFeatureEnabled('widgets').then(enabled => {
      if (enabled) {
        loadWidgets();
      }
    });
  } else {
    loadWidgets();
  }
};

/**
 * Load all widgets
 */
async function loadWidgets() {
  try {
    const searchQuery = document.getElementById('widgetSearchInput')?.value || '';
    const response = await apiRequest(`/widget/admin?search=${encodeURIComponent(searchQuery)}`);

    if (response.success) {
      displayWidgets(response.data.data || []);
    }
  } catch (error) {
    console.error('Error loading widgets:', error);
    showNotification('Error loading widgets', 'error');
    document.getElementById('widgetsContainer').innerHTML = `
      <div style="text-align: center; padding: 40px; color: #999;">
        <p data-i18n="widget.error_load">Error loading widgets</p>
      </div>
    `;
  }
}

/**
 * Display widgets in grid
 */
function displayWidgets(widgets) {
  const container = document.getElementById('widgetsContainer');
  
  if (!widgets || widgets.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #999;">
        <p data-i18n="widget.no_data">No widgets found. Create your first widget to get started!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px;">
      ${widgets.map(widget => `
        <div class="widget-card" style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: box-shadow 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
            <div>
              <h3 style="margin: 0 0 5px 0; font-size: 18px; color: #333;">${escapeHtml(widget.name)}</h3>
              <span style="display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; ${widget.is_active ? 'background: #d4edda; color: #155724;' : 'background: #f8d7da; color: #721c24;'}">
                ${widget.is_active ? '<span data-i18n="widget.status_active">Active</span>' : '<span data-i18n="widget.status_inactive">Inactive</span>'}
              </span>
            </div>
          </div>

          <div style="margin-bottom: 15px;">
            <div style="margin-bottom: 8px;">
              <strong style="font-size: 12px; color: #666;" data-i18n="widget.whatsapp_number">WhatsApp Number:</strong>
              <p style="margin: 2px 0; font-size: 14px; color: #333;">${escapeHtml(widget.whatsapp_number)}</p>
            </div>
            <div style="margin-bottom: 8px;">
              <strong style="font-size: 12px; color: #666;" data-i18n="widget.button_title">Button Title:</strong>
              <p style="margin: 2px 0; font-size: 14px; color: #333;">${escapeHtml(widget.button_title)}</p>
            </div>
          </div>

          <!-- Widget Preview -->
          <div style="background: #f8f9fa; border-radius: 6px; padding: 15px; margin-bottom: 15px; position: relative; min-height: 60px;">
            <div style="position: absolute; right: 15px; bottom: 15px; display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: ${widget.button_background_color}; color: white; border-radius: ${widget.border_radius}px; font-size: 13px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              <span>${escapeHtml(widget.button_title)}</span>
            </div>
          </div>

          <!-- Actions -->
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button onclick="editWidget(${widget.id})" class="btn btn-sm btn-secondary" style="flex: 1; min-width: 80px;">
              ✏️ <span data-i18n="widget.edit">Edit</span>
            </button>
            <button onclick="showEmbedCode(${widget.id})" class="btn btn-sm btn-primary" style="flex: 1; min-width: 80px;">
              📋 <span data-i18n="widget.embed_code">Embed</span>
            </button>
            <button onclick="deleteWidget(${widget.id})" class="btn btn-sm btn-danger" style="min-width: 40px;">
              🗑️
            </button>
          </div>

          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0; font-size: 11px; color: #999;">
            <span data-i18n="widget.created_at">Created:</span> ${new Date(widget.created_at).toLocaleDateString()}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Show widget modal for create/edit
 */
window.showWidgetModal = function(widgetId = null) {
  currentWidgetId = widgetId;
  const modal = document.getElementById('widgetModal');
  const title = document.getElementById('widgetModalTitle');
  
  if (widgetId) {
    title.setAttribute('data-i18n', 'widget.edit');
    title.textContent = 'Edit Widget';
    loadWidgetData(widgetId);
  } else {
    title.setAttribute('data-i18n', 'widget.create');
    title.textContent = 'Create Widget';
    document.getElementById('widgetForm').reset();
    document.getElementById('widgetId').value = '';
    document.getElementById('widgetButtonColor').value = '#25D366';
    document.getElementById('widgetButtonColorHex').value = '#25D366';
    document.getElementById('widgetMarginRight').value = '20';
    document.getElementById('widgetMarginBottom').value = '20';
    document.getElementById('widgetBorderRadius').value = '50';
    document.getElementById('widgetMaxLength').value = '500';
    document.getElementById('widgetIsActive').checked = true;
  }
  
  modal.style.display = 'flex';
  updateWidgetPreview();
}

/**
 * Close widget modal
 */
window.closeWidgetModal = function() {
  document.getElementById('widgetModal').style.display = 'none';
  currentWidgetId = null;
}

/**
 * Load widget data for editing
 */
async function loadWidgetData(widgetId) {
  try {
    const response = await apiRequest(`/widget/admin/${widgetId}`);

    if (response.success) {
      const widget = response.data;

      document.getElementById('widgetId').value = widget.id;
      document.getElementById('widgetName').value = widget.name;
      document.getElementById('widgetWhatsappNumber').value = widget.whatsapp_number;
      document.getElementById('widgetButtonTitle').value = widget.button_title;
      document.getElementById('widgetButtonColor').value = widget.button_background_color;
      document.getElementById('widgetButtonColorHex').value = widget.button_background_color;
      document.getElementById('widgetTitle').value = widget.widget_title;
      document.getElementById('widgetPredefinedMessage').value = widget.predefined_message || '';
      document.getElementById('widgetMaxLength').value = widget.max_message_length;
      document.getElementById('widgetMarginRight').value = widget.margin_right;
      document.getElementById('widgetMarginBottom').value = widget.margin_bottom;
      document.getElementById('widgetBorderRadius').value = widget.border_radius;
      document.getElementById('widgetIsActive').checked = widget.is_active;

      updateWidgetPreview();
    }
  } catch (error) {
    console.error('Error loading widget:', error);
    showNotification('Error loading widget', 'error');
  }
}

/**
 * Save widget (create or update)
 */
window.saveWidget = async function() {
  try {
    const widgetId = document.getElementById('widgetId').value;
    const formData = {
      name: document.getElementById('widgetName').value,
      whatsapp_number: document.getElementById('widgetWhatsappNumber').value,
      button_title: document.getElementById('widgetButtonTitle').value,
      button_background_color: document.getElementById('widgetButtonColor').value,
      widget_title: document.getElementById('widgetTitle').value,
      predefined_message: document.getElementById('widgetPredefinedMessage').value || null,
      max_message_length: parseInt(document.getElementById('widgetMaxLength').value),
      margin_right: parseInt(document.getElementById('widgetMarginRight').value),
      margin_bottom: parseInt(document.getElementById('widgetMarginBottom').value),
      border_radius: parseInt(document.getElementById('widgetBorderRadius').value),
      is_active: document.getElementById('widgetIsActive').checked
    };

    const url = widgetId ? `/widget/admin/${widgetId}` : '/widget/admin';
    const method = widgetId ? 'PUT' : 'POST';

    const response = await apiRequest(url, {
      method: method,
      body: JSON.stringify(formData)
    });

    if (response.success) {
      showNotification(
        widgetId ? 'Widget updated successfully' : 'Widget created successfully', 
        'success'
      );
      closeWidgetModal();
      loadWidgets();
    }
  } catch (error) {
    console.error('Error saving widget:', error);
    showNotification(error.message || 'Error saving widget', 'error');
  }
}

/**
 * Edit widget
 */
window.editWidget = function(widgetId) {
  showWidgetModal(widgetId);
}

/**
 * Delete widget
 */
window.deleteWidget = async function(widgetId) {
  Modal.confirm(
    'widget.delete_confirm_title',
    'widget.delete_confirm_message',
    async () => {
      try {
        const response = await apiRequest(`/widget/admin/${widgetId}`, {
          method: 'DELETE'
        });

        if (response.success) {
          showNotification('Widget deleted successfully', 'success');
          loadWidgets();
        }
      } catch (error) {
        console.error('Error deleting widget:', error);
        showNotification('Error deleting widget', 'error');
      }
    }
  );
}

/**
 * Show embed code modal
 */
window.showEmbedCode = async function(widgetId) {
  try {
    const response = await apiRequest(`/widget/admin/${widgetId}/embed-code`);

    if (response.success) {
      document.getElementById('embedCodeContent').textContent = response.data.embedCode;
      document.getElementById('embedCodeModal').style.display = 'flex';
    }
  } catch (error) {
    console.error('Error generating embed code:', error);
    showNotification('Error generating embed code', 'error');
  }
}

/**
 * Close embed code modal
 */
window.closeEmbedCodeModal = function() {
  document.getElementById('embedCodeModal').style.display = 'none';
}

/**
 * Copy embed code to clipboard
 */
window.copyEmbedCode = async function() {
  const code = document.getElementById('embedCodeContent').textContent;
  
  try {
    await navigator.clipboard.writeText(code);
    showNotification('Embed code copied to clipboard', 'success');
  } catch (error) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = code;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showNotification('Embed code copied to clipboard', 'success');
  }
}

/**
 * Update widget preview in real-time
 */
window.updateWidgetPreview = function() {
  const buttonTitle = document.getElementById('widgetButtonTitle')?.value || 'Chat with us';
  const buttonColor = document.getElementById('widgetButtonColor')?.value || '#25D366';
  const marginRight = document.getElementById('widgetMarginRight')?.value || '20';
  const marginBottom = document.getElementById('widgetMarginBottom')?.value || '20';
  const borderRadius = document.getElementById('widgetBorderRadius')?.value || '50';

  const previewButton = document.getElementById('widgetButtonPreview');
  const previewTitle = document.getElementById('previewButtonTitle');

  if (previewButton) {
    previewButton.style.background = buttonColor;
    previewButton.style.right = `${marginRight}px`;
    previewButton.style.bottom = `${marginBottom}px`;
    previewButton.style.borderRadius = `${borderRadius}px`;
  }

  if (previewTitle) {
    previewTitle.textContent = buttonTitle;
  }

  // Sync color inputs
  const colorInput = document.getElementById('widgetButtonColor');
  const hexInput = document.getElementById('widgetButtonColorHex');
  if (colorInput && hexInput) {
    hexInput.value = colorInput.value.toUpperCase();
  }
}

/**
 * Sync color input fields
 */
window.syncColorInput = function() {
  const hexInput = document.getElementById('widgetButtonColorHex');
  const colorInput = document.getElementById('widgetButtonColor');
  
  if (hexInput && colorInput) {
    const hexValue = hexInput.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(hexValue)) {
      colorInput.value = hexValue;
      updateWidgetPreview();
    }
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Debounce search
 */
window.debounceWidgetSearch = function() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadWidgets(), 500);
}

// Initialize search listener
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('widgetSearchInput');
    if (searchInput) {
      searchInput.addEventListener('keyup', debounceWidgetSearch);
    }
  });
}

} // End of module check
