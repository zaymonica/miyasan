/**
 * Main Application Logic
 */

let currentPage = 'dashboard';
let activeAddons = []; // Store active addons

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login';
    return;
  }

  // SECURITY: Verify user role - only 'admin' can access tenant admin panel
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userRole = payload.role;
    
    // Block users - they should only access /user
    if (userRole === 'user') {
      console.warn('Access denied: User role cannot access admin panel');
      window.location.href = '/user';
      return;
    }
    
    // Block superadmin - they should use /superadmin
    if (userRole === 'superadmin') {
      console.warn('Access denied: SuperAdmin should use superadmin panel');
      window.location.href = '/superadmin';
      return;
    }
    
    // Only allow 'admin' role
    if (userRole !== 'admin') {
      console.warn('Access denied: Invalid role for admin panel');
      localStorage.removeItem('token');
      window.location.href = '/login';
      return;
    }
  } catch (e) {
    console.error('Error parsing token:', e);
    localStorage.removeItem('token');
    window.location.href = '/login';
    return;
  }

  try {
    console.log('Initializing i18n with system default language');
    await i18n.init();
    console.log('i18n initialized successfully');

    // Load active addons and update sidebar visibility
    await loadActiveAddons();

    // Setup navigation
    setupNavigation();

    // Listen for hash changes
    window.addEventListener('hashchange', (event) => {
      console.log('🔗 Hash changed:', window.location.hash);
      const page = window.location.hash.substring(1) || 'dashboard';
      console.log('🔗 Navigating to page:', page);
      navigateTo(page, false);
    });

    // Load initial page from URL hash or default to dashboard
    const initialPage = window.location.hash.substring(1) || 'dashboard';
    console.log('🚀 Initial page:', initialPage);
    navigateTo(initialPage, false);

    // Setup mobile menu
    setupMobileMenu();
  } catch (error) {
    console.error('Error initializing app:', error);
  }
});

/**
 * Load active addons and update sidebar visibility
 */
async function loadActiveAddons() {
  try {
    console.log('🔌 Loading active addons...');
    const response = await api.get('/active-addons');
    console.log('🔌 Active addons response:', response);
    if (response.success && response.data && response.data.addons) {
      activeAddons = response.data.addons.map(a => a.slug);
      console.log('🔌 Active addons:', activeAddons);
    } else {
      console.log('🔌 No addons found in response');
      activeAddons = [];
    }
  } catch (error) {
    console.error('Error loading active addons:', error);
    activeAddons = [];
  }
  
  // Update sidebar visibility based on active addons
  updateSidebarForAddons();
}

/**
 * Update sidebar menu items based on active addons
 */
function updateSidebarForAddons() {
  console.log('🔌 Updating sidebar for addons. Active addons:', activeAddons);
  
  // Find all nav items with data-feature attribute
  const navItems = document.querySelectorAll('.nav-item[data-feature]');
  console.log('🔌 Found nav items with data-feature:', navItems.length);
  
  navItems.forEach(item => {
    const feature = item.getAttribute('data-feature');
    console.log('🔌 Checking feature:', feature);
    
    // Check if this feature requires an addon
    if (feature === 'biolink') {
      // Hide biolink menu if addon is not active
      if (!activeAddons.includes('biolink')) {
        item.style.display = 'none';
        console.log('🔒 Hiding biolink menu - addon not active');
      } else {
        item.style.display = '';
        console.log('✅ Showing biolink menu - addon is active');
      }
    }
  });
}

/**
 * Check if an addon is active
 * @param {string} addonSlug - The addon slug to check
 * @returns {boolean}
 */
function isAddonActive(addonSlug) {
  return activeAddons.includes(addonSlug);
}

function setupNavigation() {
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.getAttribute('data-page');
      navigateTo(page);
      const sidebar = document.getElementById('sidebar');
      if (sidebar && window.innerWidth <= 768) {
        sidebar.classList.remove('active');
      }
    });
  });
}

function navigateTo(page, updateHistory = true) {
  console.log('🎯 navigateTo called with page:', page, 'updateHistory:', updateHistory);
  
  // Update URL without reloading page
  if (updateHistory) {
    window.location.hash = page;
  }
  
  document.title = `${page.charAt(0).toUpperCase() + page.slice(1)} - Misayan SaaS`;

  // Update active nav item
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-page') === page) {
      item.classList.add('active');
    }
  });

  // Load page data FIRST (this may create the page element dynamically)
  loadPageData(page);
  
  // Then hide all pages and show the selected one
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');

  const pageEl = document.getElementById(`${page}-page`);
  console.log('🎯 Page element found after loadPageData:', !!pageEl, 'for id:', `${page}-page`);
  
  if (pageEl) {
    pageEl.style.display = 'block';
    currentPage = page;
  } else {
    console.warn('⚠️ Page element still not found after loadPageData for:', page);
  }
}

function loadPageData(page) {
  console.log('📄 loadPageData called for page:', page);
  switch(page) {
    case 'dashboard':
      loadDashboard();
      startDashboardRefresh();
      break;
    case 'stores':
      stopDashboardRefresh();
      loadStores();
      break;
    case 'departments':
      stopDashboardRefresh();
      loadDepartments();
      break;
    case 'users':
      stopDashboardRefresh();
      console.log('👤 Calling loadUsers...');
      console.log('👤 loadUsers function exists?', typeof loadUsers);
      console.log('👤 loadUsers function:', loadUsers);
      if (typeof loadUsers === 'function') {
        try {
          console.log('👤 About to call loadUsers()...');
          const result = loadUsers();
          console.log('👤 loadUsers() returned:', result);
          if (result && result.catch) {
            result.catch(err => console.error('👤 loadUsers() promise rejected:', err));
          }
        } catch (err) {
          console.error('👤 Error calling loadUsers():', err);
        }
      } else {
        console.error('❌ loadUsers is not a function!');
      }
      break;
    case 'whatsapp':
      stopDashboardRefresh();
      // loadWhatsApp();
      break;
    case 'whatsapp-cloud':
      stopDashboardRefresh();
      if (typeof initWhatsAppCloudPage === 'function') {
        initWhatsAppCloudPage();
      }
      break;
    case 'conversations':
      stopDashboardRefresh();
      if (typeof initConversationsPage === 'function') {
        initConversationsPage();
      }
      break;
    case 'contacts':
      stopDashboardRefresh();
      if (typeof loadContactsPage === 'function') {
        loadContactsPage();
      }
      break;
    case 'invoices':
      stopDashboardRefresh();
      if (typeof loadInvoices === 'function') {
        loadInvoices();
      }
      break;
    case 'faqs':
      stopDashboardRefresh();
      if (window.pageHandlers && window.pageHandlers.faqs) {
        window.pageHandlers.faqs();
      }
      break;
    case 'plan-management':
      stopDashboardRefresh();
      console.log('🎯 Plan management case triggered');
      console.log('🎯 loadPlanManagement exists?', typeof loadPlanManagement);
      console.log('🎯 window.loadPlanManagement exists?', typeof window.loadPlanManagement);
      if (typeof loadPlanManagement === 'function') {
        console.log('✅ Calling loadPlanManagement...');
        loadPlanManagement().catch(err => console.error('❌ loadPlanManagement error:', err));
      } else if (typeof window.loadPlanManagement === 'function') {
        console.log('✅ Calling window.loadPlanManagement...');
        window.loadPlanManagement().catch(err => console.error('❌ window.loadPlanManagement error:', err));
      } else {
        console.error('❌ loadPlanManagement function not found!');
      }
      break;
    case 'biolink':
      stopDashboardRefresh();
      if (typeof BioLink !== 'undefined' && typeof BioLink.init === 'function') {
        BioLink.init();
      } else if (typeof loadBioLink === 'function') {
        loadBioLink();
      } else {
        console.error('❌ BioLink module not found!');
      }
      break;
    default:
      stopDashboardRefresh();
      // Check if there's a page handler for this page
      if (window.pageHandlers && window.pageHandlers[page]) {
        window.pageHandlers[page]();
      } else {
        console.warn('No handler found for page:', page);
        document.getElementById('content').innerHTML = `
          <div style="padding: 20px;">
            <h1>${page.charAt(0).toUpperCase() + page.slice(1)}</h1>
            <p>${page} page - Coming soon</p>
          </div>
        `;
      }
  }
}

function setupMobileMenu() {
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');

  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('active');
    });
  }
  document.addEventListener('click', (e) => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return;
    if (!sidebar.classList.contains('active')) return;
    const insideSidebar = sidebar.contains(e.target);
    const isToggle = menuToggle && menuToggle.contains(e.target);
    if (!insideSidebar && !isToggle) {
      sidebar.classList.remove('active');
    }
  });

  // Sidebar toggle button (desktop)
  if (sidebarToggleBtn && sidebar) {
    // Load saved state
    const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (sidebarCollapsed) {
      sidebar.classList.add('collapsed');
    }

    sidebarToggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      const isCollapsed = sidebar.classList.contains('collapsed');
      localStorage.setItem('sidebarCollapsed', isCollapsed);
    });
  }
}

function logout() {
  Modal.confirm('common.logout', 'common.logout_confirm', () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  });
}


// ===== GLOBAL CUSTOM MODALS =====

/**
 * Show custom confirm modal (replaces window.confirm)
 * @param {string} message - Confirmation message
 * @param {string} description - Optional description
 * @param {function} onConfirm - Callback when confirmed
 */
window.showCustomConfirm = function(message, description, onConfirm) {
  const modal = document.createElement('div');
  modal.id = 'globalConfirmModal';
  modal.style.cssText =
    'position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;';

  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 10px; width: 90%; max-width: 400px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <h3 style="margin: 0 0 15px 0; color: #333;" data-i18n="modal.confirm_title">Confirm Action</h3>
      <p style="margin: 0 0 ${description ? '10px' : '20px'} 0; color: #666;">${message}</p>
      ${description ? `<p style="margin: 0 0 20px 0; color: #999; font-size: 14px;">${description}</p>` : ''}
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="window.closeGlobalConfirmModal()" data-i18n="btn.cancel">Cancel</button>
        <button class="btn btn-danger" onclick="window.confirmGlobalConfirmModal()" data-i18n="btn.confirm">Confirm</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Store callback
  window._globalConfirmCallback = onConfirm;

  // Apply translations if available
  if (window.applyTranslations) {
    window.applyTranslations();
  }
};

window.closeGlobalConfirmModal = function() {
  const modal = document.getElementById('globalConfirmModal');
  if (modal) {
    modal.remove();
  }
  window._globalConfirmCallback = null;
};

window.confirmGlobalConfirmModal = function() {
  if (window._globalConfirmCallback) {
    window._globalConfirmCallback();
  }
  window.closeGlobalConfirmModal();
};

/**
 * Show custom prompt modal (replaces window.prompt)
 * @param {string} message - Prompt message
 * @param {string} defaultValue - Default input value
 * @param {function} onSubmit - Callback with input value
 */
window.showCustomPrompt = function(message, defaultValue, onSubmit) {
  const modal = document.createElement('div');
  modal.id = 'globalPromptModal';
  modal.style.cssText =
    'position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;';

  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 10px; width: 90%; max-width: 500px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <h3 style="margin: 0 0 15px 0; color: #333;" data-i18n="modal.prompt_title">Enter Information</h3>
      <p style="margin: 0 0 15px 0; color: #666;">${message}</p>
      <textarea id="globalPromptInput" style="width: 100%; min-height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; resize: vertical;">${defaultValue || ''}</textarea>
      <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
        <button class="btn btn-secondary" onclick="window.closeGlobalPromptModal()" data-i18n="btn.cancel">Cancel</button>
        <button class="btn btn-primary" onclick="window.submitGlobalPromptModal()" data-i18n="btn.submit">Submit</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Store callback
  window._globalPromptCallback = onSubmit;

  // Focus on input
  setTimeout(() => {
    const input = document.getElementById('globalPromptInput');
    if (input) {
      input.focus();
      input.select();
    }
  }, 100);

  // Apply translations if available
  if (window.applyTranslations) {
    window.applyTranslations();
  }
};

window.closeGlobalPromptModal = function() {
  const modal = document.getElementById('globalPromptModal');
  if (modal) {
    modal.remove();
  }
  window._globalPromptCallback = null;
};

window.submitGlobalPromptModal = function() {
  const input = document.getElementById('globalPromptInput');
  if (window._globalPromptCallback && input) {
    window._globalPromptCallback(input.value);
  }
  window.closeGlobalPromptModal();
};

/**
 * Show custom alert modal (replaces window.alert)
 * @param {string} message - Alert message
 * @param {string} type - Alert type: 'info', 'success', 'warning', 'error'
 */
window.showCustomAlert = function(message, type = 'info') {
  const modal = document.createElement('div');
  modal.id = 'globalAlertModal';
  modal.style.cssText =
    'position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;';

  const colors = {
    info: '#2196F3',
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#f44336'
  };

  const icons = {
    info: 'ℹ️',
    success: '✓',
    warning: '⚠️',
    error: '✕'
  };

  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 10px; width: 90%; max-width: 400px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
        <div style="width: 40px; height: 40px; border-radius: 50%; background: ${colors[type]}; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px;">
          ${icons[type]}
        </div>
        <h3 style="margin: 0; color: #333;" data-i18n="modal.alert_title">Alert</h3>
      </div>
      <p style="margin: 0 0 20px 0; color: #666;">${message}</p>
      <div style="display: flex; justify-content: flex-end;">
        <button class="btn btn-primary" onclick="window.closeGlobalAlertModal()" data-i18n="btn.close">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Apply translations if available
  if (window.applyTranslations) {
    window.applyTranslations();
  }
};

window.closeGlobalAlertModal = function() {
  const modal = document.getElementById('globalAlertModal');
  if (modal) {
    modal.remove();
  }
};

console.log('Global custom modals initialized');
