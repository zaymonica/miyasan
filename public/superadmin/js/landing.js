/**
 * Landing Page Editor Module
 * Comprehensive editor for managing landing page content
 */

// Initialize pageHandlers if not exists
window.pageHandlers = window.pageHandlers || {};

window.pageHandlers.landing = function() {
  loadLandingEditor();
};

// Global state
const landingState = {
  settings: {},
  features: [],
  testimonials: [],
  currentTab: 'general'
};

/**
 * Initialize landing page editor
 */
async function loadLandingEditor() {
  document.getElementById('content').innerHTML = `
    <div class="page-header">
      <h1 data-i18n="landing.title">Landing Page Editor</h1>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="previewLandingPage()">
          <i class="fas fa-eye"></i> <span data-i18n="landing.preview">Preview</span>
        </button>
        <button class="btn btn-success" onclick="saveAllSettings()">
          <i class="fas fa-save"></i> <span data-i18n="landing.saveAll">Save All Changes</span>
        </button>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" data-tab="general" onclick="switchTab('general')">
        <i class="fas fa-cog"></i> <span data-i18n="landing.tabs.general">General</span>
      </button>
      <button class="tab-btn" data-tab="hero" onclick="switchTab('hero')">
        <i class="fas fa-star"></i> <span data-i18n="landing.tabs.hero">Hero Section</span>
      </button>
      <button class="tab-btn" data-tab="features" onclick="switchTab('features')">
        <i class="fas fa-list"></i> <span data-i18n="landing.tabs.features">Features</span>
      </button>
      <button class="tab-btn" data-tab="testimonials" onclick="switchTab('testimonials')">
        <i class="fas fa-quote-left"></i> <span data-i18n="landing.tabs.testimonials">Testimonials</span>
      </button>
      <button class="tab-btn" data-tab="colors" onclick="switchTab('colors')">
        <i class="fas fa-palette"></i> <span data-i18n="landing.tabs.colors">Colors</span>
      </button>
    </div>

    <div id="tabContent" class="tab-content"></div>
  `;

  await loadSettings();
  switchTab('general');
}

/**
 * Load all settings from API
 */
async function loadSettings() {
  try {
    const response = await apiRequest('/landing/settings');
    if (response.success) {
      landingState.settings = response.data.settings || {};
    }

    const featuresRes = await apiRequest('/landing/features');
    if (featuresRes.success) {
      landingState.features = featuresRes.data || [];
    }

    const testimonialsRes = await apiRequest('/landing/testimonials');
    if (testimonialsRes.success) {
      landingState.testimonials = testimonialsRes.data || [];
    }
  } catch (error) {
    showAlert('Error loading settings: ' + error.message, 'error');
  }
}

/**
 * Switch between tabs
 */
function switchTab(tab) {
  landingState.currentTab = tab;
  
  // Update active tab button
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tab') === tab) {
      btn.classList.add('active');
    }
  });

  const content = document.getElementById('tabContent');

  switch(tab) {
    case 'general':
      content.innerHTML = renderGeneralTab();
      bindLandingGeneralHandlers();
      break;
    case 'hero':
      content.innerHTML = renderHeroTab();
      break;
    case 'features':
      content.innerHTML = renderFeaturesTab();
      break;
    case 'testimonials':
      content.innerHTML = renderTestimonialsTab();
      break;
    case 'colors':
      content.innerHTML = renderColorsTab();
      break;
  }
  
  // Apply translations
  if (window.i18n && window.i18n.translatePage) {
    window.i18n.translatePage();
  }
}

function bindLandingGeneralHandlers() {
  const landingToggle = document.getElementById('landing_enabled');
  if (landingToggle) {
    landingState.settings.landing_enabled = landingToggle.checked ? 1 : 0;
    landingToggle.addEventListener('change', () => {
      landingState.settings.landing_enabled = landingToggle.checked ? 1 : 0;
    });
  }
}

/**
 * Render General Settings Tab
 */
function renderGeneralTab() {
  const s = landingState.settings;
  return `
    <div class="card">
      <div class="card-header">
        <h3 data-i18n="landing.general.title">General Settings</h3>
      </div>
      <div class="card-body">
        <form id="generalForm">
          <div class="form-row">
            <div class="form-group col-md-6">
              <label data-i18n="landing.general.landing_enabled">Landing ativa</label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="landing_enabled" ${Number(s.landing_enabled) === 0 ? '' : 'checked'}>
                <small class="form-text text-muted" data-i18n="landing.general.landing_enabled_hint">Se desativar, redireciona para o login</small>
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group col-md-6">
              <label data-i18n="landing.general.companyName">Company Name</label>
              <input type="text" class="form-control" id="company_name" value="${s.company_name || ''}" placeholder="Your Company Name">
            </div>
            <div class="form-group col-md-6">
              <label data-i18n="landing.general.companyLogo">Company Logo</label>
              <div class="logo-upload-container">
                <input type="file" class="form-control-file" id="company_logo_file" accept="image/*" onchange="previewLogoUpload('company_logo')">
                <input type="hidden" id="company_logo" value="${s.company_logo || ''}">
                ${s.company_logo ? `
                  <div class="logo-preview mt-2" id="company_logo_preview">
                    <img src="${s.company_logo}" alt="Company Logo" style="max-height: 60px; max-width: 200px; object-fit: contain; border: 1px solid #ddd; padding: 5px; border-radius: 5px;">
                    <button type="button" class="btn btn-sm btn-danger ml-2" onclick="removeLogo('company_logo')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                ` : '<div class="logo-preview mt-2" id="company_logo_preview"></div>'}
              </div>
            </div>
          </div>

          <h4 class="mt-4 mb-3"><i class="fas fa-images"></i> Landing Page Logos</h4>
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i> Configure custom logos for different sections of the landing page. When a logo is set, it will replace the default WhatsApp icon.
          </div>
          
          <div class="form-row">
            <div class="form-group col-md-4">
              <label><i class="fas fa-heading"></i> Header Logo</label>
              <div class="logo-upload-container">
                <input type="file" class="form-control-file" id="header_logo_file" accept="image/*" onchange="previewLogoUpload('header_logo')">
                <input type="hidden" id="header_logo" value="${s.header_logo || ''}">
                <small class="form-text text-muted">Logo displayed in the navigation bar.</small>
                ${s.header_logo ? `
                  <div class="logo-preview mt-2" id="header_logo_preview">
                    <img src="${s.header_logo}" alt="Header Logo" style="max-height: 50px; max-width: 150px; object-fit: contain; border: 1px solid #ddd; padding: 5px; border-radius: 5px;">
                    <button type="button" class="btn btn-sm btn-danger ml-2" onclick="removeLogo('header_logo')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                ` : '<div class="logo-preview mt-2" id="header_logo_preview"></div>'}
              </div>
            </div>
            <div class="form-group col-md-4">
              <label><i class="fas fa-star"></i> Hero Logo</label>
              <div class="logo-upload-container">
                <input type="file" class="form-control-file" id="hero_logo_file" accept="image/*" onchange="previewLogoUpload('hero_logo')">
                <input type="hidden" id="hero_logo" value="${s.hero_logo || ''}">
                <small class="form-text text-muted">Square logo in the hero section.</small>
                ${s.hero_logo ? `
                  <div class="logo-preview mt-2" id="hero_logo_preview">
                    <img src="${s.hero_logo}" alt="Hero Logo" style="max-height: 100px; max-width: 100px; object-fit: contain; border: 1px solid #ddd; padding: 5px; border-radius: 5px;">
                    <button type="button" class="btn btn-sm btn-danger ml-2" onclick="removeLogo('hero_logo')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                ` : '<div class="logo-preview mt-2" id="hero_logo_preview"></div>'}
              </div>
            </div>
            <div class="form-group col-md-4">
              <label><i class="fas fa-shoe-prints"></i> Footer Logo</label>
              <div class="logo-upload-container">
                <input type="file" class="form-control-file" id="footer_logo_file" accept="image/*" onchange="previewLogoUpload('footer_logo')">
                <input type="hidden" id="footer_logo" value="${s.footer_logo || ''}">
                <small class="form-text text-muted">Logo displayed in the footer.</small>
                ${s.footer_logo ? `
                  <div class="logo-preview mt-2" id="footer_logo_preview">
                    <img src="${s.footer_logo}" alt="Footer Logo" style="max-height: 50px; max-width: 150px; object-fit: contain; border: 1px solid #ddd; padding: 5px; border-radius: 5px;">
                    <button type="button" class="btn btn-sm btn-danger ml-2" onclick="removeLogo('footer_logo')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                ` : '<div class="logo-preview mt-2" id="footer_logo_preview"></div>'}
              </div>
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group col-md-6">
              <label data-i18n="landing.general.contactEmail">Contact Email</label>
              <input type="email" class="form-control" id="contact_email" value="${s.contact_email || ''}" placeholder="contact@example.com">
            </div>
            <div class="form-group col-md-6">
              <label data-i18n="landing.general.contactPhone">Contact Phone</label>
              <input type="text" class="form-control" id="contact_phone" value="${s.contact_phone || ''}">
            </div>
          </div>

          <div class="form-group">
            <label data-i18n="landing.general.footerText">Footer Text</label>
            <textarea class="form-control" id="footer_text" rows="2" placeholder="© 2024 Your Company. All rights reserved.">${s.footer_text || ''}</textarea>
          </div>

          <h4 class="mt-4" data-i18n="landing.general.socialMedia">Social Media Links</h4>
          <div class="form-row">
            <div class="form-group col-md-6">
              <label><i class="fab fa-facebook"></i> Facebook</label>
              <input type="url" class="form-control" id="social_facebook" value="${s.social_facebook || ''}" placeholder="https://facebook.com/yourpage">
            </div>
            <div class="form-group col-md-6">
              <label><i class="fab fa-twitter"></i> Twitter</label>
              <input type="url" class="form-control" id="social_twitter" value="${s.social_twitter || ''}" placeholder="https://twitter.com/yourhandle">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group col-md-6">
              <label><i class="fab fa-instagram"></i> Instagram</label>
              <input type="url" class="form-control" id="social_instagram" value="${s.social_instagram || ''}" placeholder="https://instagram.com/yourhandle">
            </div>
            <div class="form-group col-md-6">
              <label><i class="fab fa-linkedin"></i> LinkedIn</label>
              <input type="url" class="form-control" id="social_linkedin" value="${s.social_linkedin || ''}" placeholder="https://linkedin.com/company/yourcompany">
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Render Hero Section Tab
 */
function renderHeroTab() {
  const s = landingState.settings;
  return `
    <div class="card">
      <div class="card-header">
        <h3 data-i18n="landing.hero.title">Hero Section</h3>
      </div>
      <div class="card-body">
        <form id="heroForm">
          <div class="form-group">
            <label data-i18n="landing.hero.heroTitle">Hero Title</label>
            <input type="text" class="form-control" id="hero_title" value="${s.hero_title || ''}" placeholder="Transform Your Business with WhatsApp">
          </div>
          <div class="form-group">
            <label data-i18n="landing.hero.heroSubtitle">Hero Subtitle</label>
            <textarea class="form-control" id="hero_subtitle" rows="2" placeholder="Powerful multi-tenant WhatsApp Business platform">${s.hero_subtitle || ''}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group col-md-6">
              <label data-i18n="landing.hero.ctaText">CTA Button Text</label>
              <input type="text" class="form-control" id="hero_cta_text" value="${s.hero_cta_text || ''}" placeholder="Get Started">
            </div>
            <div class="form-group col-md-6">
              <label data-i18n="landing.hero.ctaLink">CTA Button Link</label>
              <input type="text" class="form-control" id="hero_cta_link" value="${s.hero_cta_link || ''}" placeholder="/register">
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Render Features Tab
 */
function renderFeaturesTab() {
  return `
    <div class="card">
      <div class="card-header">
        <h3 data-i18n="landing.features.title">Features Section</h3>
        <button class="btn btn-primary" onclick="showAddFeatureModal()">
          <i class="fas fa-plus"></i> <span data-i18n="landing.features.addFeature">Add Feature</span>
        </button>
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-hover">
            <thead>
              <tr>
                <th data-i18n="landing.features.icon">Icon</th>
                <th data-i18n="landing.features.featureTitle">Title</th>
                <th data-i18n="landing.features.description">Description</th>
                <th data-i18n="landing.features.order">Order</th>
                <th data-i18n="landing.features.status">Status</th>
                <th data-i18n="landing.features.actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${landingState.features.length === 0 ? `
                <tr>
                  <td colspan="6" class="text-center" data-i18n="landing.features.noFeatures">No features added yet</td>
                </tr>
              ` : landingState.features.map(f => `
                <tr>
                  <td><i class="fas ${f.icon}" style="font-size: 1.5rem; color: #00a149;"></i></td>
                  <td><strong>${escapeHtml(f.title)}</strong></td>
                  <td>${escapeHtml(f.description).substring(0, 60)}${f.description.length > 60 ? '...' : ''}</td>
                  <td>${f.sort_order}</td>
                  <td>
                    <span class="badge badge-${f.active ? 'success' : 'secondary'}">
                      ${f.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button class="btn btn-sm btn-primary" onclick="editFeature(${f.id})" title="Edit">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-${f.active ? 'warning' : 'success'}" onclick="toggleFeatureStatus(${f.id}, ${!f.active})" title="${f.active ? 'Deactivate' : 'Activate'}">
                      <i class="fas fa-${f.active ? 'eye-slash' : 'eye'}"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteFeature(${f.id})" title="Delete">
                      <i class="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Testimonials Tab
 */
function renderTestimonialsTab() {
  return `
    <div class="card">
      <div class="card-header">
        <h3 data-i18n="landing.testimonials.title">Testimonials Section</h3>
        <button class="btn btn-primary" onclick="showAddTestimonialModal()">
          <i class="fas fa-plus"></i> <span data-i18n="landing.testimonials.addTestimonial">Add Testimonial</span>
        </button>
      </div>
      <div class="card-body">
        <div class="table-responsive">
          <table class="table table-hover">
            <thead>
              <tr>
                <th data-i18n="landing.testimonials.name">Name</th>
                <th data-i18n="landing.testimonials.title">Title</th>
                <th data-i18n="landing.testimonials.company">Company</th>
                <th data-i18n="landing.testimonials.testimonial">Testimonial</th>
                <th data-i18n="landing.testimonials.rating">Rating</th>
                <th data-i18n="landing.testimonials.order">Order</th>
                <th data-i18n="landing.testimonials.status">Status</th>
                <th data-i18n="landing.testimonials.actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${landingState.testimonials.length === 0 ? `
                <tr>
                  <td colspan="8" class="text-center" data-i18n="landing.testimonials.noTestimonials">No testimonials added yet</td>
                </tr>
              ` : landingState.testimonials.map(t => `
                <tr>
                  <td><strong>${escapeHtml(t.customer_name)}</strong></td>
                  <td>${escapeHtml(t.customer_title || '')}</td>
                  <td>${escapeHtml(t.customer_company || '')}</td>
                  <td>${escapeHtml(t.testimonial_text).substring(0, 50)}${t.testimonial_text.length > 50 ? '...' : ''}</td>
                  <td>${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</td>
                  <td>${t.sort_order}</td>
                  <td>
                    <span class="badge badge-${t.active ? 'success' : 'secondary'}">
                      ${t.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button class="btn btn-sm btn-primary" onclick="editTestimonial(${t.id})" title="Edit">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-${t.active ? 'warning' : 'success'}" onclick="toggleTestimonialStatus(${t.id}, ${!t.active})" title="${t.active ? 'Deactivate' : 'Activate'}">
                      <i class="fas fa-${t.active ? 'eye-slash' : 'eye'}"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteTestimonial(${t.id})" title="Delete">
                      <i class="fas fa-trash"></i>
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Colors & Branding Tab
 */
function renderColorsTab() {
  const s = landingState.settings;
  return `
    <div class="card">
      <div class="card-header">
        <h3 data-i18n="landing.colors.title">Colors & Branding</h3>
      </div>
      <div class="card-body">
        <form id="colorsForm">
          <div class="form-row">
            <div class="form-group col-md-6">
              <label data-i18n="landing.colors.primaryColor">Primary Color</label>
              <div class="input-group">
                <input type="color" class="form-control" id="primary_color" value="${s.primary_color || '#00a149'}" style="height: 50px;">
                <input type="text" class="form-control" value="${s.primary_color || '#00a149'}" readonly>
              </div>
              <small class="form-text text-muted" data-i18n="landing.colors.primaryColorDesc">Main brand color used for buttons and accents</small>
            </div>
            <div class="form-group col-md-6">
              <label data-i18n="landing.colors.secondaryColor">Secondary Color</label>
              <div class="input-group">
                <input type="color" class="form-control" id="secondary_color" value="${s.secondary_color || '#319131'}" style="height: 50px;">
                <input type="text" class="form-control" value="${s.secondary_color || '#319131'}" readonly>
              </div>
              <small class="form-text text-muted" data-i18n="landing.colors.secondaryColorDesc">Secondary brand color for gradients</small>
            </div>
          </div>

          <div class="alert alert-info mt-3">
            <i class="fas fa-info-circle"></i> <span data-i18n="landing.colors.previewNote">Colors will be applied to the landing page after saving</span>
          </div>

          <div class="color-preview mt-4">
            <h5 data-i18n="landing.colors.preview">Preview</h5>
            <div class="preview-box" style="background: linear-gradient(135deg, ${s.primary_color || '#00a149'} 0%, ${s.secondary_color || '#319131'} 100%); padding: 30px; border-radius: 10px; color: white; text-align: center;">
              <h3>Sample Heading</h3>
              <p>This is how your gradient will look on the landing page</p>
              <button class="btn btn-light">Sample Button</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Save all settings
 */
async function saveAllSettings() {
  // First, upload any logo files
  const logoFields = ['company_logo', 'header_logo', 'hero_logo', 'footer_logo'];
  const hasLogoFiles = logoFields.some(field => {
    const fileInput = document.getElementById(`${field}_file`);
    return fileInput && fileInput.files && fileInput.files.length > 0;
  });
  
  const hasLogoRemovals = logoFields.some(field => {
    return window[`remove_${field}`] === true;
  });

  if (hasLogoFiles || hasLogoRemovals) {
    await uploadLogoFiles();
  }

  const settings = {};
  
  // Collect all form values from current tab (excluding file inputs and logo hidden fields)
  document.querySelectorAll('#tabContent input, #tabContent textarea').forEach(input => {
    if (input.id && input.type !== 'file' && !logoFields.includes(input.id)) {
      if (input.type === 'checkbox') {
        settings[input.id] = input.checked ? 1 : 0;
      } else {
        settings[input.id] = input.value;
      }
    }
  });

  if (landingState.settings.landing_enabled !== undefined && settings.landing_enabled === undefined) {
    settings.landing_enabled = landingState.settings.landing_enabled;
  }

  if (Object.keys(settings).length === 0) {
    showAlert('No changes to save', 'warning');
    return;
  }

  try {
    const response = await apiRequest('/landing/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });

    if (response.success) {
      showAlert('Settings saved successfully!', 'success');
      await loadSettings();
      switchTab(landingState.currentTab); // Refresh current tab
    } else {
      showAlert('Error saving settings: ' + (response.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    showAlert('Error saving settings: ' + error.message, 'error');
  }
}

/**
 * Upload logo files
 */
async function uploadLogoFiles() {
  const logoFields = ['company_logo', 'header_logo', 'hero_logo', 'footer_logo'];
  const formData = new FormData();
  let hasFiles = false;

  for (const field of logoFields) {
    const fileInput = document.getElementById(`${field}_file`);
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      formData.append(`${field}_file`, fileInput.files[0]);
      hasFiles = true;
    }
    
    // Check for removal flags
    if (window[`remove_${field}`] === true) {
      formData.append(`remove_${field}`, 'true');
      hasFiles = true;
      window[`remove_${field}`] = false; // Reset flag
    }
  }

  if (!hasFiles) return;

  try {
    const token = localStorage.getItem('superadmin_token');
    const response = await fetch('/api/landing/upload-logos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || 'Upload failed');
    }
    
    showAlert('Logos uploaded successfully!', 'success');
  } catch (error) {
    showAlert('Error uploading logos: ' + error.message, 'error');
    throw error;
  }
}

/**
 * Preview logo upload
 */
function previewLogoUpload(field) {
  const fileInput = document.getElementById(`${field}_file`);
  const previewContainer = document.getElementById(`${field}_preview`);
  
  if (!fileInput || !fileInput.files || !fileInput.files.length) return;
  
  const file = fileInput.files[0];
  const reader = new FileReader();
  
  reader.onload = function(e) {
    const maxHeight = field === 'hero_logo' ? '100px' : '60px';
    const maxWidth = field === 'hero_logo' ? '100px' : '200px';
    
    previewContainer.innerHTML = `
      <img src="${e.target.result}" alt="${field} preview" 
           style="max-height: ${maxHeight}; max-width: ${maxWidth}; object-fit: contain; border: 1px solid #ddd; padding: 5px; border-radius: 5px;">
      <button type="button" class="btn btn-sm btn-danger ml-2" onclick="removeLogo('${field}')">
        <i class="fas fa-trash"></i>
      </button>
      <span class="badge badge-info ml-2">New</span>
    `;
  };
  
  reader.readAsDataURL(file);
}

/**
 * Remove logo
 */
function removeLogo(field) {
  const fileInput = document.getElementById(`${field}_file`);
  const hiddenInput = document.getElementById(field);
  const previewContainer = document.getElementById(`${field}_preview`);
  
  // Clear file input
  if (fileInput) {
    fileInput.value = '';
  }
  
  // Clear hidden input
  if (hiddenInput) {
    hiddenInput.value = '';
  }
  
  // Clear preview
  if (previewContainer) {
    previewContainer.innerHTML = '';
  }
  
  // Set removal flag
  window[`remove_${field}`] = true;
  
  showAlert('Logo marked for removal. Click "Save All Changes" to apply.', 'info');
}

/**
 * Preview landing page
 */
function previewLandingPage() {
  window.open('/', '_blank');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// FEATURE MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Show add feature modal
 */
function showAddFeatureModal() {
  const content = `
    <form id="featureForm">
      <div class="form-group">
        <label data-i18n="landing.features.iconClass">Icon Class (FontAwesome)</label>
        <input type="text" name="icon" class="form-control" placeholder="fa-check" required>
        <small class="form-text text-muted">
          Visit <a href="https://fontawesome.com/icons" target="_blank">FontAwesome</a> for icon names
        </small>
      </div>
      <div class="form-group">
        <label data-i18n="landing.features.featureTitle">Title</label>
        <input type="text" name="title" class="form-control" placeholder="Amazing Feature" required>
      </div>
      <div class="form-group">
        <label data-i18n="landing.features.description">Description</label>
        <textarea name="description" class="form-control" rows="3" placeholder="Describe this feature..." required></textarea>
      </div>
      <div class="form-group">
        <label data-i18n="landing.features.displayOrder">Display Order</label>
        <input type="number" name="sort_order" class="form-control" value="0" min="0">
      </div>
      <div class="form-group">
        <label class="d-flex align-items-center">
          <input type="checkbox" name="active" checked style="margin-right: 10px;">
          <span data-i18n="landing.features.activeOnLanding">Active on landing page</span>
        </label>
      </div>
    </form>
  `;

  const actions = `
    <button class="btn btn-secondary" onclick="closeModal(this)" data-i18n="common.cancel">Cancel</button>
    <button class="btn btn-primary" onclick="saveFeature()" data-i18n="common.save">Save</button>
  `;

  showModal('Add Feature', content, actions);
  
  // Apply translations
  if (window.i18n && window.i18n.translatePage) {
    window.i18n.translatePage();
  }
}

/**
 * Save feature
 */
async function saveFeature(featureId = null) {
  const form = document.getElementById('featureForm');
  const formData = new FormData(form);
  
  const data = {
    icon: formData.get('icon'),
    title: formData.get('title'),
    description: formData.get('description'),
    sort_order: parseInt(formData.get('sort_order')) || 0,
    active: formData.get('active') ? 1 : 0
  };

  try {
    const url = featureId ? `/landing/features/${featureId}` : '/landing/features';
    const method = featureId ? 'PUT' : 'POST';
    
    const response = await apiRequest(url, {
      method: method,
      body: JSON.stringify(data)
    });

    if (response.success) {
      showAlert(featureId ? 'Feature updated successfully' : 'Feature added successfully', 'success');
      closeModal(document.querySelector('.modal-close'));
      await loadSettings();
      switchTab('features');
    } else {
      showAlert('Error saving feature: ' + (response.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    showAlert('Error saving feature: ' + error.message, 'error');
  }
}

/**
 * Edit feature
 */
function editFeature(id) {
  const feature = landingState.features.find(f => f.id === id);
  if (!feature) {
    showAlert('Feature not found', 'error');
    return;
  }

  const content = `
    <form id="featureForm">
      <div class="form-group">
        <label data-i18n="landing.features.iconClass">Icon Class (FontAwesome)</label>
        <input type="text" name="icon" class="form-control" value="${feature.icon}" required>
        <small class="form-text text-muted">
          Visit <a href="https://fontawesome.com/icons" target="_blank">FontAwesome</a> for icon names
        </small>
      </div>
      <div class="form-group">
        <label data-i18n="landing.features.featureTitle">Title</label>
        <input type="text" name="title" class="form-control" value="${escapeHtml(feature.title)}" required>
      </div>
      <div class="form-group">
        <label data-i18n="landing.features.description">Description</label>
        <textarea name="description" class="form-control" rows="3" required>${escapeHtml(feature.description)}</textarea>
      </div>
      <div class="form-group">
        <label data-i18n="landing.features.displayOrder">Display Order</label>
        <input type="number" name="sort_order" class="form-control" value="${feature.sort_order}" min="0">
      </div>
      <div class="form-group">
        <label class="d-flex align-items-center">
          <input type="checkbox" name="active" ${feature.active ? 'checked' : ''} style="margin-right: 10px;">
          <span data-i18n="landing.features.activeOnLanding">Active on landing page</span>
        </label>
      </div>
    </form>
  `;

  const actions = `
    <button class="btn btn-secondary" onclick="closeModal(this)" data-i18n="common.cancel">Cancel</button>
    <button class="btn btn-primary" onclick="saveFeature(${id})" data-i18n="common.save">Save</button>
  `;

  showModal('Edit Feature', content, actions);
  
  // Apply translations
  if (window.i18n && window.i18n.translatePage) {
    window.i18n.translatePage();
  }
}

/**
 * Toggle feature status
 */
async function toggleFeatureStatus(id, newStatus) {
  try {
    // Get the current feature data
    const feature = landingState.features.find(f => f.id === id);
    if (!feature) {
      showAlert('Feature not found', 'error');
      return;
    }

    const response = await apiRequest(`/landing/features/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        icon: feature.icon,
        title: feature.title,
        description: feature.description,
        sort_order: feature.sort_order,
        active: newStatus ? 1 : 0
      })
    });

    if (response.success) {
      showAlert(`Feature ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
      await loadSettings();
      switchTab('features');
    } else {
      showAlert('Error updating feature: ' + (response.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    showAlert('Error updating feature: ' + error.message, 'error');
  }
}

/**
 * Delete feature
 */
async function deleteFeature(id) {
  const feature = landingState.features.find(f => f.id === id);
  if (!feature) return;

  const content = `
    <p>Are you sure you want to delete the feature "<strong>${escapeHtml(feature.title)}</strong>"?</p>
    <p class="text-danger">This action cannot be undone.</p>
  `;

  const actions = `
    <button class="btn btn-secondary" onclick="closeModal(this)" data-i18n="common.cancel">Cancel</button>
    <button class="btn btn-danger" onclick="confirmDeleteFeature(${id})" data-i18n="common.delete">Delete</button>
  `;

  showModal('Confirm Delete', content, actions);
}

/**
 * Confirm delete feature
 */
async function confirmDeleteFeature(id) {
  try {
    const response = await apiRequest(`/landing/features/${id}`, { method: 'DELETE' });
    
    if (response.success) {
      showAlert('Feature deleted successfully', 'success');
      closeModal(document.querySelector('.modal-close'));
      await loadSettings();
      switchTab('features');
    } else {
      showAlert('Error deleting feature: ' + (response.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    showAlert('Error deleting feature: ' + error.message, 'error');
  }
}

// ============================================================================
// TESTIMONIAL MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Show add testimonial modal
 */
function showAddTestimonialModal() {
  const content = `
    <form id="testimonialForm">
      <div class="form-group">
        <label data-i18n="landing.testimonials.customerName">Customer Name</label>
        <input type="text" name="customer_name" class="form-control" placeholder="John Doe" required>
      </div>
      <div class="form-row">
        <div class="form-group col-md-6">
          <label data-i18n="landing.testimonials.customerTitle">Title/Position</label>
          <input type="text" name="customer_title" class="form-control" placeholder="CEO">
        </div>
        <div class="form-group col-md-6">
          <label data-i18n="landing.testimonials.customerCompany">Company</label>
          <input type="text" name="customer_company" class="form-control" placeholder="Acme Corp">
        </div>
      </div>
      <div class="form-group">
        <label data-i18n="landing.testimonials.avatarUrl">Avatar URL (optional)</label>
        <input type="url" name="customer_avatar" class="form-control" placeholder="https://example.com/avatar.jpg">
      </div>
      <div class="form-group">
        <label data-i18n="landing.testimonials.testimonialText">Testimonial</label>
        <textarea name="testimonial_text" class="form-control" rows="4" placeholder="This product changed our business..." required></textarea>
      </div>
      <div class="form-row">
        <div class="form-group col-md-6">
          <label data-i18n="landing.testimonials.rating">Rating</label>
          <select name="rating" class="form-control">
            <option value="5">5 Stars ★★★★★</option>
            <option value="4">4 Stars ★★★★☆</option>
            <option value="3">3 Stars ★★★☆☆</option>
            <option value="2">2 Stars ★★☆☆☆</option>
            <option value="1">1 Star ★☆☆☆☆</option>
          </select>
        </div>
        <div class="form-group col-md-6">
          <label data-i18n="landing.testimonials.displayOrder">Display Order</label>
          <input type="number" name="sort_order" class="form-control" value="0" min="0">
        </div>
      </div>
      <div class="form-group">
        <label class="d-flex align-items-center">
          <input type="checkbox" name="active" checked style="margin-right: 10px;">
          <span data-i18n="landing.testimonials.activeOnLanding">Active on landing page</span>
        </label>
      </div>
    </form>
  `;

  const actions = `
    <button class="btn btn-secondary" onclick="closeModal(this)" data-i18n="common.cancel">Cancel</button>
    <button class="btn btn-primary" onclick="saveTestimonial()" data-i18n="common.save">Save</button>
  `;

  showModal('Add Testimonial', content, actions);
  
  // Apply translations
  if (window.i18n && window.i18n.translatePage) {
    window.i18n.translatePage();
  }
}

/**
 * Save testimonial
 */
async function saveTestimonial(testimonialId = null) {
  const form = document.getElementById('testimonialForm');
  const formData = new FormData(form);
  
  const data = {
    customer_name: formData.get('customer_name'),
    customer_title: formData.get('customer_title'),
    customer_company: formData.get('customer_company'),
    customer_avatar: formData.get('customer_avatar'),
    testimonial_text: formData.get('testimonial_text'),
    rating: parseInt(formData.get('rating')) || 5,
    sort_order: parseInt(formData.get('sort_order')) || 0,
    active: formData.get('active') ? 1 : 0
  };

  try {
    const url = testimonialId ? `/landing/testimonials/${testimonialId}` : '/landing/testimonials';
    const method = testimonialId ? 'PUT' : 'POST';
    
    const response = await apiRequest(url, {
      method: method,
      body: JSON.stringify(data)
    });

    if (response.success) {
      showAlert(testimonialId ? 'Testimonial updated successfully' : 'Testimonial added successfully', 'success');
      closeModal(document.querySelector('.modal-close'));
      await loadSettings();
      switchTab('testimonials');
    } else {
      showAlert('Error saving testimonial: ' + (response.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    showAlert('Error saving testimonial: ' + error.message, 'error');
  }
}

/**
 * Edit testimonial
 */
function editTestimonial(id) {
  const testimonial = landingState.testimonials.find(t => t.id === id);
  if (!testimonial) {
    showAlert('Testimonial not found', 'error');
    return;
  }

  const content = `
    <form id="testimonialForm">
      <div class="form-group">
        <label data-i18n="landing.testimonials.customerName">Customer Name</label>
        <input type="text" name="customer_name" class="form-control" value="${escapeHtml(testimonial.customer_name)}" required>
      </div>
      <div class="form-row">
        <div class="form-group col-md-6">
          <label data-i18n="landing.testimonials.customerTitle">Title/Position</label>
          <input type="text" name="customer_title" class="form-control" value="${escapeHtml(testimonial.customer_title || '')}">
        </div>
        <div class="form-group col-md-6">
          <label data-i18n="landing.testimonials.customerCompany">Company</label>
          <input type="text" name="customer_company" class="form-control" value="${escapeHtml(testimonial.customer_company || '')}">
        </div>
      </div>
      <div class="form-group">
        <label data-i18n="landing.testimonials.avatarUrl">Avatar URL (optional)</label>
        <input type="url" name="customer_avatar" class="form-control" value="${testimonial.customer_avatar || ''}">
      </div>
      <div class="form-group">
        <label data-i18n="landing.testimonials.testimonialText">Testimonial</label>
        <textarea name="testimonial_text" class="form-control" rows="4" required>${escapeHtml(testimonial.testimonial_text)}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group col-md-6">
          <label data-i18n="landing.testimonials.rating">Rating</label>
          <select name="rating" class="form-control">
            <option value="5" ${testimonial.rating === 5 ? 'selected' : ''}>5 Stars ★★★★★</option>
            <option value="4" ${testimonial.rating === 4 ? 'selected' : ''}>4 Stars ★★★★☆</option>
            <option value="3" ${testimonial.rating === 3 ? 'selected' : ''}>3 Stars ★★★☆☆</option>
            <option value="2" ${testimonial.rating === 2 ? 'selected' : ''}>2 Stars ★★☆☆☆</option>
            <option value="1" ${testimonial.rating === 1 ? 'selected' : ''}>1 Star ★☆☆☆☆</option>
          </select>
        </div>
        <div class="form-group col-md-6">
          <label data-i18n="landing.testimonials.displayOrder">Display Order</label>
          <input type="number" name="sort_order" class="form-control" value="${testimonial.sort_order}" min="0">
        </div>
      </div>
      <div class="form-group">
        <label class="d-flex align-items-center">
          <input type="checkbox" name="active" ${testimonial.active ? 'checked' : ''} style="margin-right: 10px;">
          <span data-i18n="landing.testimonials.activeOnLanding">Active on landing page</span>
        </label>
      </div>
    </form>
  `;

  const actions = `
    <button class="btn btn-secondary" onclick="closeModal(this)" data-i18n="common.cancel">Cancel</button>
    <button class="btn btn-primary" onclick="saveTestimonial(${id})" data-i18n="common.save">Save</button>
  `;

  showModal('Edit Testimonial', content, actions);
  
  // Apply translations
  if (window.i18n && window.i18n.translatePage) {
    window.i18n.translatePage();
  }
}

/**
 * Toggle testimonial status
 */
async function toggleTestimonialStatus(id, newStatus) {
  try {
    const response = await apiRequest(`/landing/testimonials/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: newStatus ? 1 : 0 })
    });

    if (response.success) {
      showAlert(`Testimonial ${newStatus ? 'activated' : 'deactivated'} successfully`, 'success');
      await loadSettings();
      switchTab('testimonials');
    } else {
      showAlert('Error updating testimonial: ' + (response.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    showAlert('Error updating testimonial: ' + error.message, 'error');
  }
}

/**
 * Delete testimonial
 */
async function deleteTestimonial(id) {
  const testimonial = landingState.testimonials.find(t => t.id === id);
  if (!testimonial) return;

  const content = `
    <p>Are you sure you want to delete the testimonial from "<strong>${escapeHtml(testimonial.customer_name)}</strong>"?</p>
    <p class="text-danger">This action cannot be undone.</p>
  `;

  const actions = `
    <button class="btn btn-secondary" onclick="closeModal(this)" data-i18n="common.cancel">Cancel</button>
    <button class="btn btn-danger" onclick="confirmDeleteTestimonial(${id})" data-i18n="common.delete">Delete</button>
  `;

  showModal('Confirm Delete', content, actions);
}

/**
 * Confirm delete testimonial
 */
async function confirmDeleteTestimonial(id) {
  try {
    const response = await apiRequest(`/landing/testimonials/${id}`, { method: 'DELETE' });
    
    if (response.success) {
      showAlert('Testimonial deleted successfully', 'success');
      closeModal(document.querySelector('.modal-close'));
      await loadSettings();
      switchTab('testimonials');
    } else {
      showAlert('Error deleting testimonial: ' + (response.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    showAlert('Error deleting testimonial: ' + error.message, 'error');
  }
}


