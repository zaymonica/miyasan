/**
 * Feature Check Module
 * Checks if features are enabled for the tenant's plan
 * Shows disabled message with purchase option or admin contact
 */

console.log('Feature Check module loaded');

// Feature to page mapping
const featurePageMap = {
  ai: {
    pageId: 'ai-config-page',
    disabledContainerId: 'ai-feature-disabled',
    contentId: 'ai-config-content',
    featureName: 'ai_feature'
  },
  woocommerce: {
    pageId: 'woocommerce-settings-page',
    disabledContainerId: 'woocommerce-feature-disabled',
    contentId: 'woocommerce-settings-content',
    featureName: 'woocommerce_feature'
  },
  'woocommerce-products': {
    pageId: 'woocommerce-products-page',
    disabledContainerId: 'woocommerce-products-feature-disabled',
    contentId: 'woocommerce-products-content',
    featureName: 'woocommerce_feature',
    apiFeature: 'woocommerce'
  },
  'woocommerce-notifications': {
    pageId: 'woocommerce-notifications-page',
    disabledContainerId: 'woocommerce-notifications-feature-disabled',
    contentId: 'woocommerce-notifications-content',
    featureName: 'woocommerce_feature',
    apiFeature: 'woocommerce'
  },
  mass_send: {
    pageId: 'mass-send-page',
    disabledContainerId: 'mass-send-feature-disabled',
    contentId: 'mass-send-content',
    featureName: 'mass_send_feature'
  },
  payments: {
    pageId: 'payments-page',
    disabledContainerId: 'payments-feature-disabled',
    contentId: 'payments-content',
    featureName: 'payments_feature'
  },
  invoices: {
    pageId: 'invoices-page',
    disabledContainerId: 'invoices-feature-disabled',
    contentId: 'invoices-content',
    featureName: 'invoices_feature'
  },
  'api-rest': {
    pageId: 'api-rest-page',
    disabledContainerId: 'api-rest-feature-disabled',
    contentId: 'api-rest-content',
    featureName: 'api_feature',
    apiFeature: 'api_access'
  },
  'api-documentation': {
    pageId: 'api-documentation-page',
    disabledContainerId: 'api-documentation-feature-disabled',
    contentId: 'api-documentation-content',
    featureName: 'api_feature',
    apiFeature: 'api_access'
  },
  webhook: {
    pageId: 'webhook-page',
    disabledContainerId: 'webhook-feature-disabled',
    contentId: 'webhook-content',
    featureName: 'api_feature',
    apiFeature: 'api_access'
  },
  widgets: {
    pageId: 'widget-page',
    disabledContainerId: 'widget-feature-disabled',
    contentId: 'widget-content',
    featureName: 'widgets_feature'
  }
};

/**
 * Check if a feature is enabled and show appropriate message
 * @param {string} feature - Feature name (ai, woocommerce, mass_send, payments, invoices, widgets)
 * @returns {Promise<boolean>} - True if feature is enabled, false otherwise
 */
async function checkFeatureEnabled(feature) {
  const config = featurePageMap[feature];
  if (!config) {
    console.warn(`Unknown feature: ${feature}`);
    return true;
  }

  const disabledContainer = document.getElementById(config.disabledContainerId);
  const contentContainer = document.getElementById(config.contentId);

  if (!disabledContainer || !contentContainer) {
    console.warn(`Containers not found for feature ${feature}:`, {
      disabledContainer: config.disabledContainerId,
      contentContainer: config.contentId
    });
    return true;
  }

  try {
    const token = localStorage.getItem('token');
    const apiFeature = config.apiFeature || feature;
    
    const response = await fetch(`/api/tenant/feature-status/${apiFeature}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error(`Error checking feature status: ${response.status}`);
      // On error, show content (fail open)
      disabledContainer.style.display = 'none';
      contentContainer.style.display = 'block';
      return true;
    }

    const result = await response.json();
    
    if (result.success && result.data) {
      if (result.data.enabled) {
        // Feature is enabled - show content
        disabledContainer.style.display = 'none';
        contentContainer.style.display = 'block';
        return true;
      } else {
        // Feature is disabled - show message
        showFeatureDisabledMessage(config, result.data);
        disabledContainer.style.display = 'block';
        contentContainer.style.display = 'none';
        return false;
      }
    }

    // Default: show content
    disabledContainer.style.display = 'none';
    contentContainer.style.display = 'block';
    return true;
  } catch (error) {
    console.error(`Error checking feature ${feature}:`, error);
    // On error, show content (fail open)
    disabledContainer.style.display = 'none';
    contentContainer.style.display = 'block';
    return true;
  }
}

/**
 * Show the feature disabled message with appropriate content
 * @param {object} config - Feature configuration
 * @param {object} data - Feature status data from API
 */
function showFeatureDisabledMessage(config, data) {
  const container = document.getElementById(config.disabledContainerId);
  if (!container) {
    console.error(`Container not found: ${config.disabledContainerId}`);
    return;
  }

  const featureNameKey = `feature_disabled.${config.featureName}`;
  const featureName = window.i18n ? window.i18n.t(featureNameKey) : config.featureName;

  let html = `
    <div class="feature-disabled-card">
      <div class="feature-disabled-icon">🔒</div>
      <h2 data-i18n="feature_disabled.title">Feature Not Available</h2>
      <p data-i18n="feature_disabled.not_in_plan">Your current plan does not include access to this feature.</p>
  `;

  if (data.canPurchase && data.addon) {
    // Can purchase addon
    html += `
      <div class="feature-addon-info">
        <p data-i18n="feature_disabled.can_purchase">You can purchase this feature as an addon to unlock it.</p>
        <div class="addon-details">
          <strong>${data.addon.name}</strong>
          ${data.addon.price ? `<span class="addon-price">$${parseFloat(data.addon.price).toFixed(2)}</span>` : ''}
          ${data.addon.description ? `<p class="addon-description">${data.addon.description}</p>` : ''}
        </div>
        <button class="btn btn-primary" onclick="window.location.hash='#plan-management'" data-i18n="feature_disabled.purchase_addon">
          Purchase Addon
        </button>
      </div>
    `;
  } else {
    // Contact admin
    html += `
      <div class="feature-contact-admin">
        <p data-i18n="feature_disabled.contact_admin">Please contact the administrator to enable this feature.</p>
    `;

    if (data.adminContact && (data.adminContact.email || data.adminContact.phone)) {
      html += `
        <div class="admin-contact-info">
          <h4 data-i18n="feature_disabled.admin_contact">Administrator Contact</h4>
          ${data.adminContact.company ? `<p><strong>${data.adminContact.company}</strong></p>` : ''}
          ${data.adminContact.email ? `<p><i class="fas fa-envelope"></i> <a href="mailto:${data.adminContact.email}">${data.adminContact.email}</a></p>` : ''}
          ${data.adminContact.phone ? `<p><i class="fas fa-phone"></i> <a href="tel:${data.adminContact.phone}">${data.adminContact.phone}</a></p>` : ''}
        </div>
      `;
    }

    html += `</div>`;
  }

  html += `</div>`;

  container.innerHTML = html;

  // Apply translations if i18n is available
  if (window.applyTranslations) {
    window.applyTranslations();
  }
}

// Export for use in other modules
window.checkFeatureEnabled = checkFeatureEnabled;
window.featurePageMap = featurePageMap;

console.log('Feature Check module ready');
