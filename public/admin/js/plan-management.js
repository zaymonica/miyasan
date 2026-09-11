/**
 * Plan Management Module
 * Handles tenant plan and add-on resources management
 */

console.log('📦 Plan Management module loading...');

let currentPlan = null;
let availableAddons = [];
let cart = {};

/**
 * API Request helper
 */
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  const defaultOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };

  const config = { ...defaultOptions, ...options };
  
  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(endpoint, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  // Use existing notification system if available
  if (window.modalSystem && window.modalSystem.toast) {
    window.modalSystem.toast(message, type);
    return;
  }

  // Fallback notification
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : type === 'warning' ? '#f39c12' : '#3498db'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Load plan management page
 */
async function loadPlanManagement() {
  console.log('🔄 Loading plan management page...');
  
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  // Check if page already exists
  let pageEl = document.getElementById('plan-management-page');
  
  if (!pageEl) {
    // Create the page element
    const content = document.querySelector('.content');
    if (!content) {
      console.error('❌ .content element not found!');
      return;
    }
    
    pageEl = document.createElement('div');
    pageEl.id = 'plan-management-page';
    pageEl.className = 'page';
    content.appendChild(pageEl);
    console.log('✅ Page element created and appended to .content');
  }
  
  // Show the page
  pageEl.classList.add('active');
  console.log('✅ Page set to active');
  
  pageEl.innerHTML = `
    <div class="page-header">
      <h1><i class="fas fa-box"></i> <span data-i18n="plan.title">Manage Plan & Resources</span></h1>
    </div>

      <!-- Current Plan Card -->
      <div class="card" style="margin-bottom: 30px;">
        <div class="card-header" style="background: linear-gradient(135deg, #00a149 0%, #319131 100%); color: white; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0;"><i class="fas fa-crown"></i> <span data-i18n="plan.current_plan">Current Plan</span></h2>
        </div>
        <div class="card-body" id="currentPlanInfo">
          <div class="loading">
            <div class="spinner"></div>
            <p data-i18n="common.loading">Loading...</p>
          </div>
        </div>
      </div>

      <!-- Purchased Add-ons (Active) -->
      <div class="card" style="margin-bottom: 30px;" id="purchasedAddonsCard" style="display: none;">
        <div class="card-header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0;"><i class="fas fa-puzzle-piece"></i> <span data-i18n="plan.purchased_addons">Active Add-ons</span></h2>
        </div>
        <div class="card-body" id="purchasedAddons">
          <div class="loading">
            <div class="spinner"></div>
            <p data-i18n="common.loading">Loading...</p>
          </div>
        </div>
      </div>

      <!-- Resources Usage -->
      <div class="card" style="margin-bottom: 30px;">
        <div class="card-header">
          <h2><i class="fas fa-chart-bar"></i> <span data-i18n="plan.resources_usage">Resources Usage</span></h2>
        </div>
        <div class="card-body" id="resourcesUsage">
          <div class="loading">
            <div class="spinner"></div>
            <p data-i18n="common.loading">Loading...</p>
          </div>
        </div>
      </div>

      <!-- Available Add-ons -->
      <div class="card">
        <div class="card-header">
          <h2><i class="fas fa-plus-circle"></i> <span data-i18n="plan.available_addons">Available Add-ons</span></h2>
          <p style="margin: 5px 0 0; color: #666; font-size: 14px;" data-i18n="plan.addons_subtitle">Purchase additional resources as needed</p>
        </div>
        <div class="card-body" id="availableAddons">
          <div class="loading">
            <div class="spinner"></div>
            <p data-i18n="common.loading">Loading...</p>
          </div>
        </div>
      </div>

      <!-- System Add-ons (Bio Link, etc.) -->
      <div class="card" id="systemAddonsCard" style="margin-top: 30px; display: none;">
        <div class="card-header" style="background: linear-gradient(135deg, #00b4d8 0%, #0077b6 100%); color: white; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0;"><i class="fas fa-puzzle-piece"></i> <span data-i18n="plan.system_addons">System Add-ons</span></h2>
          <p style="margin: 5px 0 0; opacity: 0.9; font-size: 14px;">Premium features included in your plan</p>
        </div>
        <div class="card-body" id="systemAddons">
          <div class="loading">
            <div class="spinner"></div>
            <p data-i18n="common.loading">Loading...</p>
          </div>
        </div>
      </div>

      <!-- Shopping Cart (Fixed Bottom) -->
      <div id="shoppingCart" class="shopping-cart" style="display: none;">
        <div class="cart-content">
          <div class="cart-header">
            <h3><i class="fas fa-shopping-cart"></i> <span data-i18n="plan.cart">Cart</span></h3>
            <button class="btn-close-cart" onclick="closeCart()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="cart-items" id="cartItems"></div>
          <div class="cart-footer">
            <div class="cart-total">
              <span data-i18n="plan.total">Total:</span>
              <strong id="cartTotal">$0.00</strong>
            </div>
            <button class="btn btn-primary btn-block" onclick="proceedToCheckout()">
              <i class="fas fa-credit-card"></i>
              <span data-i18n="plan.checkout">Proceed to Checkout</span>
            </button>
          </div>
        </div>
      </div>
  `;

  console.log('✅ Plan management HTML created');
  
  // Verify that the page is visible
  console.log('📍 Page element:', pageEl);
  console.log('📍 Page classes:', pageEl.className);
  console.log('📍 Page display:', window.getComputedStyle(pageEl).display);

  // Load data
  try {
    await Promise.all([
      loadCurrentPlan(),
      loadPurchasedAddons(),
      loadResourcesUsage(),
      loadAvailableAddons(),
      loadSystemAddons()
    ]);
    
    console.log('✅ Plan management data loaded');
  } catch (error) {
    console.error('❌ Error loading plan management data:', error);
    showNotification('Error loading plan management data: ' + error.message, 'error');
  }
}

/**
 * Load current plan information
 */
async function loadCurrentPlan() {
  try {
    console.log('📊 Loading current plan...');
    const response = await apiRequest('/api/tenant/plan/current');
    currentPlan = response.data;
    console.log('✅ Current plan loaded:', currentPlan);

    const container = document.getElementById('currentPlanInfo');
    if (!container) {
      console.error('❌ currentPlanInfo container not found');
      return;
    }
    
    const currencyLabel = currentPlan.currency_symbol || currentPlan.currency;
    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
        <div>
          <h3 style="font-size: 32px; color: #00a149; margin-bottom: 10px;">${currentPlan.plan_name}</h3>
          <div style="font-size: 24px; font-weight: bold; color: #333; margin-bottom: 20px;">
            ${currencyLabel} ${parseFloat(currentPlan.price).toFixed(2)} <span style="font-size: 16px; color: #666; font-weight: normal;">/month</span>
          </div>
          <div style="margin-bottom: 15px;">
            <span style="color: #666;">Status:</span>
            <span class="status-badge status-${currentPlan.status}">${currentPlan.status}</span>
          </div>
          ${currentPlan.trial_ends_at ? `
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
              <i class="fas fa-clock"></i>
              <strong>Trial Period</strong><br>
              <span style="font-size: 14px;">Ends: ${new Date(currentPlan.trial_ends_at).toLocaleDateString()}</span>
            </div>
          ` : ''}
        </div>
        <div>
          <h4 style="margin-bottom: 15px; color: #333;">Plan Features</h4>
          <ul style="list-style: none; padding: 0;">
            ${currentPlan.features ? currentPlan.features.map(f => `
              <li style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                <i class="fas fa-check" style="color: #27ae60; margin-right: 10px;"></i>
                ${f}
              </li>
            `).join('') : ''}
          </ul>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading current plan:', error);
    const container = document.getElementById('currentPlanInfo');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-warning">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Unable to load plan information at this time.</p>
          <p style="font-size: 12px; margin-top: 10px;">Error: ${error.message}</p>
        </div>
      `;
    }
  }
}

/**
 * Load purchased add-ons
 */
async function loadPurchasedAddons() {
  try {
    console.log('📊 Loading purchased add-ons...');
    const response = await apiRequest('/api/tenant/plan/purchased-addons');
    const { addons } = response.data;
    console.log('✅ Purchased add-ons loaded:', addons);

    const card = document.getElementById('purchasedAddonsCard');
    const container = document.getElementById('purchasedAddons');
    
    if (!container || !card) {
      console.error('❌ purchasedAddons container not found');
      return;
    }

    // Check if there are any addons
    if (!addons || addons.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';

    // Build the addons grid - each addon is already grouped by resource_key
    let addonsHTML = '<div class="resources-grid">';

    addons.forEach(addon => {
      const percentage = addon.percentage || 0;
      const progressColor = percentage >= 90 ? '#e74c3c' : percentage >= 70 ? '#f39c12' : '#667eea';
      
      addonsHTML += `
        <div class="resource-card" style="border-left: 4px solid #667eea;">
          <div class="resource-icon" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
            <i class="${getResourceIcon(addon.resource_key)}" style="color: white;"></i>
          </div>
          <div class="resource-info">
            <h4>${addon.resource_name}</h4>
            <div class="resource-usage">
              <span class="usage-current" style="color: #667eea; font-weight: bold;">${addon.used}</span>
              <span class="usage-separator">/</span>
              <span class="usage-limit">${addon.limit}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${Math.min(percentage, 100)}%; background: ${progressColor};"></div>
            </div>
            <div class="resource-percentage">${percentage.toFixed(0)}% used</div>
          </div>
        </div>
      `;
    });

    addonsHTML += '</div>';
    container.innerHTML = addonsHTML;

  } catch (error) {
    console.error('Error loading purchased add-ons:', error);
    const card = document.getElementById('purchasedAddonsCard');
    if (card) {
      card.style.display = 'none';
    }
  }
}

/**
 * Load resources usage
 */
async function loadResourcesUsage() {
  try {
    console.log('📊 Loading resources usage...');
    const response = await apiRequest('/api/tenant/plan/resources-usage');
    const usage = response.data;
    console.log('✅ Resources usage loaded:', usage);

    const container = document.getElementById('resourcesUsage');
    if (!container) {
      console.error('❌ resourcesUsage container not found');
      return;
    }
    
    container.innerHTML = `
      <div class="resources-grid">
        ${Object.entries(usage).map(([key, data]) => `
          <div class="resource-card ${data.percentage >= 90 ? 'resource-warning' : ''}">
            <div class="resource-icon">
              <i class="${getResourceIcon(key)}"></i>
            </div>
            <div class="resource-info">
              <h4>${getResourceLabel(key)}</h4>
              <div class="resource-usage">
                <span class="usage-current">${data.used}</span>
                <span class="usage-separator">/</span>
                <span class="usage-limit">${data.limit === -1 ? '∞' : data.limit}</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${Math.min(data.percentage, 100)}%; background: ${data.percentage >= 90 ? '#e74c3c' : data.percentage >= 70 ? '#f39c12' : '#27ae60'};"></div>
              </div>
              <div class="resource-percentage">${data.percentage.toFixed(0)}% used</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    console.error('Error loading resources usage:', error);
    const container = document.getElementById('resourcesUsage');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-warning">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Unable to load resources usage at this time.</p>
          <p style="font-size: 12px; margin-top: 10px;">Error: ${error.message}</p>
        </div>
      `;
    }
  }
}

/**
 * Load available add-ons
 */
async function loadAvailableAddons() {
  try {
    console.log('📊 Loading available add-ons...');
    const response = await apiRequest('/api/tenant/plan/available-addons');
    availableAddons = response.data;
    console.log('✅ Available add-ons loaded:', availableAddons);

    const container = document.getElementById('availableAddons');
    if (!container) {
      console.error('❌ availableAddons container not found');
      return;
    }
    
    if (availableAddons.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-box-open"></i>
          <p data-i18n="plan.no_addons">No add-ons available at this time</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="addons-grid">
        ${availableAddons.map(addon => `
          <div class="addon-card">
            <div class="addon-header">
              <div class="addon-icon">
                <i class="${getResourceIcon(addon.resource_key)}"></i>
              </div>
              <h3>${addon.resource_name}</h3>
            </div>
            <div class="addon-body">
              <div class="addon-price">
                ${addon.currency} ${parseFloat(addon.unit_price).toFixed(2)}
                <span class="price-unit">/unit/month</span>
              </div>
              <p class="addon-description">${addon.description || 'Additional ' + addon.resource_name}</p>
              <div class="addon-quantity">
                <label>Quantity:</label>
                <div class="quantity-selector">
                  <button class="btn-quantity" onclick="decreaseQuantity('${addon.resource_key}')">
                    <i class="fas fa-minus"></i>
                  </button>
                  <input 
                    type="number" 
                    id="qty-${addon.resource_key}" 
                    value="0" 
                    min="0" 
                    max="100"
                    onchange="updateQuantity('${addon.resource_key}', this.value)"
                  >
                  <button class="btn-quantity" onclick="increaseQuantity('${addon.resource_key}')">
                    <i class="fas fa-plus"></i>
                  </button>
                </div>
              </div>
              <button 
                class="btn btn-primary btn-block" 
                onclick="addToCart('${addon.resource_key}')"
                id="btn-add-${addon.resource_key}"
              >
                <i class="fas fa-cart-plus"></i>
                Add to Cart
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    console.error('Error loading add-ons:', error);
    const container = document.getElementById('availableAddons');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-warning">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Unable to load add-ons at this time.</p>
          <p style="font-size: 12px; margin-top: 10px;">Error: ${error.message}</p>
        </div>
      `;
    }
  }
}

/**
 * Load system add-ons (Bio Link, etc.)
 */
async function loadSystemAddons() {
  try {
    console.log('📊 Loading system add-ons...');
    const response = await apiRequest('/api/tenant/plan/system-addons');
    const systemAddons = response.data || {};
    console.log('✅ System add-ons loaded:', systemAddons);

    const card = document.getElementById('systemAddonsCard');
    const container = document.getElementById('systemAddons');
    
    if (!container || !card) {
      console.error('❌ systemAddons container not found');
      return;
    }

    // Check if Bio Link is enabled
    if (!systemAddons.biolink || !systemAddons.biolink.enabled) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    const biolink = systemAddons.biolink;

    container.innerHTML = `
      <div class="system-addon-section">
        <div class="system-addon-header" style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
          <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #00b4d8 0%, #0077b6 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-link" style="font-size: 24px; color: white;"></i>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 20px; color: #333;">Bio Link</h3>
            <p style="margin: 5px 0 0; color: #666; font-size: 14px;">Create bio pages, short links, QR codes, and more</p>
          </div>
          <a href="#biolink" class="btn btn-primary" style="margin-left: auto;" onclick="loadPage('biolink')">
            <i class="fas fa-external-link-alt"></i> Open Bio Link
          </a>
        </div>
        
        <div class="resources-grid">
          ${biolink.resources.map(resource => {
            const percentage = resource.limit > 0 ? (resource.used / resource.limit) * 100 : 0;
            const progressColor = percentage >= 90 ? '#e74c3c' : percentage >= 70 ? '#f39c12' : '#00b4d8';
            
            return `
              <div class="resource-card" style="border-left: 4px solid #00b4d8;">
                <div class="resource-icon" style="background: linear-gradient(135deg, #00b4d8 0%, #0077b6 100%);">
                  <i class="${getResourceIcon(resource.key)}" style="color: white;"></i>
                </div>
                <div class="resource-info">
                  <h4>${resource.name}</h4>
                  <div class="resource-usage">
                    <span class="usage-current" style="color: #00b4d8; font-weight: bold;">${resource.used}</span>
                    <span class="usage-separator">/</span>
                    <span class="usage-limit">${resource.limit}</span>
                  </div>
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.min(percentage, 100)}%; background: ${progressColor};"></div>
                  </div>
                  <div class="resource-percentage">${percentage.toFixed(0)}% used</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

  } catch (error) {
    console.error('Error loading system add-ons:', error);
    const card = document.getElementById('systemAddonsCard');
    if (card) {
      card.style.display = 'none';
    }
  }
}

/**
 * Helper functions
 */
function getResourceIcon(key) {
  const icons = {
    stores: 'fas fa-store',
    departments: 'fas fa-building',
    users: 'fas fa-users',
    conversations: 'fas fa-comments',
    messages: 'fas fa-envelope',
    contacts: 'fas fa-address-book',
    devices: 'fas fa-mobile-alt',
    widget: 'fas fa-comment-dots',
    widgets: 'fas fa-comment-dots',
    invoice: 'fas fa-file-invoice',
    invoices: 'fas fa-file-invoice',
    quotes: 'fas fa-file-alt',
    faq: 'fas fa-question-circle',
    faqs: 'fas fa-question-circle',
    ai: 'fas fa-robot',
    woocommerce: 'fab fa-wordpress',
    payment_links: 'fas fa-link',
    // Bio Link icons
    bio_pages: 'fas fa-file-alt',
    short_links: 'fas fa-link',
    qr_codes: 'fas fa-qrcode',
    file_transfers: 'fas fa-file-upload',
    vcards: 'fas fa-address-card',
    event_links: 'fas fa-calendar-alt',
    html_pages: 'fas fa-code'
  };
  return icons[key] || 'fas fa-cube';
}

function getResourceLabel(key) {
  const labels = {
    stores: 'Stores',
    departments: 'Departments',
    users: 'Users',
    conversations: 'Conversations',
    messages: 'Messages',
    contacts: 'Contacts',
    devices: 'Devices'
  };
  return labels[key] || key;
}

function increaseQuantity(resourceKey) {
  const input = document.getElementById(`qty-${resourceKey}`);
  input.value = parseInt(input.value) + 1;
  updateQuantity(resourceKey, input.value);
}

function decreaseQuantity(resourceKey) {
  const input = document.getElementById(`qty-${resourceKey}`);
  if (parseInt(input.value) > 0) {
    input.value = parseInt(input.value) - 1;
    updateQuantity(resourceKey, input.value);
  }
}

function updateQuantity(resourceKey, quantity) {
  const qty = parseInt(quantity) || 0;
  const input = document.getElementById(`qty-${resourceKey}`);
  input.value = Math.max(0, Math.min(100, qty));
}

function addToCart(resourceKey) {
  const quantity = parseInt(document.getElementById(`qty-${resourceKey}`).value);
  
  if (quantity <= 0) {
    showNotification('Please select a quantity', 'warning');
    return;
  }

  const addon = availableAddons.find(a => a.resource_key === resourceKey);
  
  console.log('Adding to cart:', {
    resourceKey,
    quantity,
    addon,
    unit_price: addon?.unit_price,
    unit_price_type: typeof addon?.unit_price
  });
  
  if (!addon) {
    showNotification('Addon not found', 'error');
    return;
  }
  
  if (!cart[resourceKey]) {
    cart[resourceKey] = {
      addon: addon,
      quantity: 0
    };
  }
  
  cart[resourceKey].quantity += quantity;
  
  // Reset quantity input
  document.getElementById(`qty-${resourceKey}`).value = 0;
  
  updateCartDisplay();
  showNotification(`Added ${quantity} ${addon.resource_name} to cart`, 'success');
}

function updateCartDisplay() {
  const cartContainer = document.getElementById('shoppingCart');
  const cartItems = document.getElementById('cartItems');
  const cartTotal = document.getElementById('cartTotal');
  
  if (Object.keys(cart).length === 0) {
    cartContainer.style.display = 'none';
    return;
  }
  
  cartContainer.style.display = 'block';
  
  let total = 0;
  let itemsHTML = '';
  
  Object.entries(cart).forEach(([key, item]) => {
    // Ensure unit_price is a number
    const unitPrice = parseFloat(item.addon.unit_price) || 0;
    const subtotal = item.quantity * unitPrice;
    total += subtotal;
    
    console.log('Cart item:', {
      key,
      quantity: item.quantity,
      unit_price: item.addon.unit_price,
      unitPrice,
      subtotal
    });
    
    itemsHTML += `
      <div class="cart-item">
        <div class="cart-item-info">
          <h4>${item.addon.resource_name}</h4>
          <p>${item.quantity} × ${item.addon.currency} ${unitPrice.toFixed(2)}</p>
        </div>
        <div class="cart-item-actions">
          <span class="cart-item-subtotal">${item.addon.currency} ${subtotal.toFixed(2)}</span>
          <button class="btn-remove-item" onclick="removeFromCart('${key}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  });
  
  cartItems.innerHTML = itemsHTML;
  
  const currency = cart[Object.keys(cart)[0]]?.addon?.currency || 'USD';
  cartTotal.textContent = `${currency} ${total.toFixed(2)}`;
  
  console.log('Cart total:', total);
}

function removeFromCart(resourceKey) {
  delete cart[resourceKey];
  updateCartDisplay();
  showNotification('Item removed from cart', 'info');
}

function closeCart() {
  document.getElementById('shoppingCart').style.display = 'none';
}

async function proceedToCheckout() {
  if (Object.keys(cart).length === 0) {
    showNotification('Cart is empty', 'warning');
    return;
  }

  // ONLY CASH PAYMENT FOR ADDONS - Stripe/PayPal removed temporarily
  // Show gateway selection modal
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h2><i class="fas fa-credit-card"></i> Select Payment Method</h2>
        <button class="modal-close" onclick="this.closest('.modal').remove()">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="payment-methods">
          <!-- STRIPE PAYMENT - COMMENTED OUT FOR FUTURE USE
          <div class="payment-method" onclick="selectGateway('stripe')">
            <div class="payment-icon">
              <i class="fab fa-stripe"></i>
            </div>
            <div class="payment-info">
              <h3>Stripe</h3>
              <p>Pay with credit/debit card</p>
            </div>
            <i class="fas fa-chevron-right"></i>
          </div>
          -->
          
          <!-- PAYPAL PAYMENT - COMMENTED OUT FOR FUTURE USE
          <div class="payment-method" onclick="selectGateway('paypal')">
            <div class="payment-icon">
              <i class="fab fa-paypal"></i>
            </div>
            <div class="payment-info">
              <h3>PayPal</h3>
              <p>Pay with PayPal account</p>
            </div>
            <i class="fas fa-chevron-right"></i>
          </div>
          -->
          
          <div class="payment-method" onclick="selectGateway('cash')">
            <div class="payment-icon">
              <i class="fas fa-money-bill-wave"></i>
            </div>
            <div class="payment-info">
              <h3>Cash/Transfer</h3>
              <p>Manual payment instructions</p>
            </div>
            <i class="fas fa-chevron-right"></i>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function selectGateway(gateway) {
  // Close modal
  document.querySelector('.modal').remove();

  // Prepare checkout data - ensure numeric values
  const items = Object.entries(cart).map(([key, item]) => ({
    addon_id: item.addon.id,
    resource_key: key,
    resource_name: item.addon.resource_name,
    quantity: parseInt(item.quantity) || 1,
    unit_price: parseFloat(item.addon.unit_price) || 0,
    currency: item.addon.currency || 'USD'
  }));

  console.log('Checkout items:', items);

  try {
    showNotification('Processing checkout...', 'info');
    
    const response = await apiRequest('/api/tenant/plan/checkout-addons', {
      method: 'POST',
      body: { items, gateway }
    });

    if (response.success) {
      // Clear cart after successful checkout
      cart = {};
      updateCartDisplay();
      
      // Handle different payment methods
      if (gateway === 'cash') {
        // Show payment instructions modal
        showCashPaymentModal(response.data);
      } else if (response.data.checkout_url) {
        // Redirect to payment page (Stripe/PayPal)
        window.location.href = response.data.checkout_url;
      }
    }
  } catch (error) {
    console.error('Checkout error:', error);
    showNotification('Error: ' + error.message, 'error');
  }
}

function showCashPaymentModal(data) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header" style="background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%); color: white;">
        <h2><i class="fas fa-check-circle"></i> Order Created Successfully</h2>
        <button class="modal-close" onclick="this.closest('.modal').remove()" style="color: white;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="modal-body">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 48px; color: #27ae60; margin-bottom: 10px;">
            <i class="fas fa-file-invoice-dollar"></i>
          </div>
          <h3 style="margin: 0;">Order #${data.purchase_id}</h3>
          <p style="color: #666; margin: 5px 0;">Awaiting Payment</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 15px 0;"><i class="fas fa-shopping-cart"></i> Order Summary</h4>
          ${data.items.map(item => `
            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
              <span>${item.quantity}x ${item.resource_name}</span>
              <span>${data.currency} ${item.subtotal.toFixed(2)}</span>
            </div>
          `).join('')}
          <div style="display: flex; justify-content: space-between; padding: 12px 0 0; font-weight: bold; font-size: 18px;">
            <span>Total:</span>
            <span style="color: #27ae60;">${data.currency} ${data.total_amount.toFixed(2)}</span>
          </div>
        </div>
        
        <div style="background: #fff3cd; padding: 20px; border-radius: 8px; border-left: 4px solid #ffc107;">
          <h4 style="margin: 0 0 10px 0;"><i class="fas fa-info-circle"></i> Payment Instructions</h4>
          <p style="margin: 0; white-space: pre-line;">${data.instructions || 'Please contact support for payment instructions.'}</p>
        </div>
      </div>
      <div class="modal-footer" style="text-align: center;">
        <button class="btn btn-primary" onclick="this.closest('.modal').remove()">
          <i class="fas fa-check"></i> Got it
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// Export for use in navigation
window.loadPlanManagement = loadPlanManagement;

console.log('✅ Plan Management module loaded. loadPlanManagement:', typeof window.loadPlanManagement);
