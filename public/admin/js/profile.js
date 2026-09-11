/**
 * Profile Management JavaScript
 * 
 * Handles tenant profile customization including logo upload and color scheme.
 * Provides real-time preview of color changes.
 */

let currentProfile = null;

/**
 * API Request helper for profile operations
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
    const response = await fetch(endpoint, mergedOptions);
    
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
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
window.pageHandlers.profile = function() {
  loadProfilePage();
};

/**
 * Load profile page
 */
async function loadProfilePage() {
  try {
    const response = await apiRequest('/api/tenant/admin-credentials');
    currentProfile = response.success ? response.data : { email: '' };
    renderProfilePage();
  } catch (error) {
    console.error('Error loading profile:', error);
    showNotification('Error loading profile', 'error');
  }
}

/**
 * Render profile page
 */
function renderProfilePage() {
  const container = document.getElementById('profile-page');
  container.innerHTML = `
    <div class="page-header">
      <h2>Editar Credenciais</h2>
      <p style="color: #666; margin-top: 5px;">Atualize o email e a senha de login</p>
    </div>
    <div class="card">
      <div class="card-body">
        <form id="adminCredentialsForm">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="adminEmail" class="form-control" value="${currentProfile.email || ''}" required>
          </div>
          <div class="form-group">
            <label>Senha atual</label>
            <input type="password" id="currentPassword" class="form-control" placeholder="Informe a senha atual">
          </div>
          <div class="form-group">
            <label>Nova senha</label>
            <input type="password" id="newPassword" class="form-control" placeholder="Mínimo de 8 caracteres">
          </div>
          <div style="margin-top: 12px; display: flex; gap: 10px;">
            <button type="submit" class="btn btn-primary">
              <i class="fas fa-save"></i> Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  const form = document.getElementById('adminCredentialsForm');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      await saveAdminCredentials();
    };
  }
}

async function saveAdminCredentials() {
  const email = document.getElementById('adminEmail')?.value || '';
  const current_password = document.getElementById('currentPassword')?.value || '';
  const new_password = document.getElementById('newPassword')?.value || '';
  try {
    const payload = { email };
    if (new_password) {
      payload.current_password = current_password;
      payload.new_password = new_password;
    }
    const res = await apiRequest('/api/tenant/admin-credentials', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    if (res.success) {
      showNotification('Credenciais atualizadas com sucesso', 'success');
      loadProfilePage();
    } else {
      showNotification(res.message || 'Erro ao salvar', 'error');
    }
  } catch (error) {
    showNotification(error.message || 'Erro ao salvar', 'error');
  }
}

/**
 * Handle logo upload
 */
async function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file size
  if (file.size > 2 * 1024 * 1024) {
    showNotification('File size must be less than 2MB', 'error');
    return;
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    showNotification('Only image files are allowed (JPEG, PNG, GIF, SVG)', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('logo', file);

  try {
    // Show progress
    document.getElementById('uploadProgress').style.display = 'block';
    document.getElementById('uploadProgressBar').style.width = '50%';

    const response = await fetch('/api/tenant/profile/logo', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: formData
    });

    const data = await response.json();

    document.getElementById('uploadProgressBar').style.width = '100%';

    if (data.success) {
      showNotification('Logo uploaded successfully', 'success');
      currentProfile.logo_url = data.data.logo_url;
      
      // Update sidebar logo
      const sidebarLogo = document.querySelector('.sidebar-logo img');
      if (sidebarLogo) {
        sidebarLogo.src = data.data.logo_url;
      }
      
      // Reload page to show new logo
      setTimeout(() => {
        loadProfilePage();
      }, 500);
    } else {
      showNotification(data.error || 'Failed to upload logo', 'error');
    }
  } catch (error) {
    console.error('Error uploading logo:', error);
    showNotification('Failed to upload logo', 'error');
  } finally {
    setTimeout(() => {
      document.getElementById('uploadProgress').style.display = 'none';
      document.getElementById('uploadProgressBar').style.width = '0%';
    }, 1000);
  }
}

/**
 * Delete logo
 */
async function deleteLogo() {
  Modal.confirm(
    'profile.delete_logo_title',
    'profile.delete_logo_message',
    async () => {
      try {
        const response = await apiRequest('/api/tenant/profile/logo', {
          method: 'DELETE'
        });

        if (response.success) {
          showNotification('Logo deleted successfully', 'success');
          currentProfile.logo_url = null;
          
          // Update sidebar logo
          const sidebarLogo = document.querySelector('.sidebar-logo img');
          if (sidebarLogo) {
            sidebarLogo.src = '/images/logo.png'; // Default logo
          }
          
          loadProfilePage();
        }
      } catch (error) {
        console.error('Error deleting logo:', error);
        showNotification('Failed to delete logo', 'error');
      }
    }
  );
}

/**
 * Update color preview
 */
function updateColorPreview() {
  const preview = document.getElementById('colorPreview');
  if (!preview) return;

  const colors = {
    '--primary-color': document.getElementById('primaryColor').value,
    '--accent-color': document.getElementById('accentColor').value,
    '--success': document.getElementById('successColor').value,
    '--warning': document.getElementById('warningColor').value,
    '--danger': document.getElementById('dangerColor').value,
    '--info': document.getElementById('infoColor').value
  };

  Object.keys(colors).forEach(key => {
    preview.style.setProperty(key, colors[key]);
  });

  // Sync hex inputs
  syncAllHexInputs();
}

/**
 * Sync color from hex input
 */
function syncColorFromHex(colorName) {
  const hexInput = document.getElementById(`${colorName}ColorHex`) || document.getElementById(`${colorName}Hex`);
  const colorInput = document.getElementById(`${colorName}Color`) || document.getElementById(`${colorName}`);
  
  if (hexInput && colorInput) {
    const hexValue = hexInput.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(hexValue)) {
      colorInput.value = hexValue;
      updateColorPreview();
    }
  }
}

/**
 * Sync all hex inputs
 */
function syncAllHexInputs() {
  const colorMap = {
    'primaryColor': 'primaryColorHex',
    'primaryDark': 'primaryDarkHex',
    'primaryLight': 'primaryLightHex',
    'accentColor': 'accentColorHex',
    'textColor': 'textColorHex',
    'textLight': 'textLightHex',
    'successColor': 'successColorHex',
    'warningColor': 'warningColorHex',
    'dangerColor': 'dangerColorHex',
    'infoColor': 'infoColorHex'
  };

  Object.keys(colorMap).forEach(colorId => {
    const colorInput = document.getElementById(colorId);
    const hexInput = document.getElementById(colorMap[colorId]);
    if (colorInput && hexInput) {
      hexInput.value = colorInput.value.toUpperCase();
    }
  });
}

/**
 * Save colors
 */
async function saveColors() {
  try {
    const colorData = {
      primary_color: document.getElementById('primaryColor').value,
      primary_dark: document.getElementById('primaryDark').value,
      primary_light: document.getElementById('primaryLight').value,
      accent_color: document.getElementById('accentColor').value,
      text_color: document.getElementById('textColor').value,
      text_light: document.getElementById('textLight').value,
      success: document.getElementById('successColor').value,
      warning: document.getElementById('warningColor').value,
      danger: document.getElementById('dangerColor').value,
      info: document.getElementById('infoColor').value
    };

    const response = await apiRequest('/api/tenant/profile/colors', {
      method: 'PUT',
      body: JSON.stringify(colorData)
    });

    if (response.success) {
      showNotification('Colors saved successfully', 'success');
      currentProfile = response.data;
      applyCurrentColors();
    }
  } catch (error) {
    console.error('Error saving colors:', error);
    showNotification('Failed to save colors', 'error');
  }
}

/**
 * Reset colors to default
 */
async function resetColors() {
  Modal.confirm(
    'profile.reset_colors_title',
    'profile.reset_colors_message',
    async () => {
      try {
        const response = await apiRequest('/api/tenant/profile/reset-colors', {
          method: 'POST'
        });

        if (response.success) {
          showNotification('Colors reset successfully', 'success');
          currentProfile = response.data;
          loadProfilePage();
          applyCurrentColors();
        }
      } catch (error) {
        console.error('Error resetting colors:', error);
        showNotification('Failed to reset colors', 'error');
      }
    }
  );
}

/**
 * Apply current colors to the page
 */
function applyCurrentColors() {
  if (!currentProfile) return;

  const root = document.documentElement;
  root.style.setProperty('--primary-color', currentProfile.primary_color);
  root.style.setProperty('--primary-dark', currentProfile.primary_dark);
  root.style.setProperty('--primary-light', currentProfile.primary_light);
  root.style.setProperty('--accent-color', currentProfile.accent_color);
  root.style.setProperty('--text-color', currentProfile.text_color);
  root.style.setProperty('--text-light', currentProfile.text_light);
  root.style.setProperty('--bg-color', currentProfile.bg_color);
  root.style.setProperty('--white', currentProfile.white);
  root.style.setProperty('--success', currentProfile.success);
  root.style.setProperty('--warning', currentProfile.warning);
  root.style.setProperty('--danger', currentProfile.danger);
  root.style.setProperty('--info', currentProfile.info);
}

// Load profile colors on page load
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    // Only load profile if user is authenticated
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }
    
    try {
      const response = await fetch('/api/tenant/profile', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          currentProfile = data.data;
          applyCurrentColors();
          
          // Update logo if exists
          if (currentProfile.logo_url) {
            const sidebarLogo = document.querySelector('.sidebar-logo img');
            if (sidebarLogo) {
              sidebarLogo.src = currentProfile.logo_url;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading profile on startup:', error);
    }
  });
}
