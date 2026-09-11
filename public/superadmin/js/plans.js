/**
 * Subscription Plans Management Module
 */

// Store biolink addon status
let biolinkAddonActive = false;
let allCurrencies = [];

// Check if biolink addon is active
async function checkBiolinkAddonStatus() {
    try {
        const response = await apiRequest('/superadmin/system-addons');
        const addons = response.data?.addons || [];
        const biolinkAddon = addons.find(a => a.slug === 'biolink');
        biolinkAddonActive = biolinkAddon && biolinkAddon.active;
        console.log('🔌 Biolink addon active:', biolinkAddonActive);
        return biolinkAddonActive;
    } catch (error) {
        console.error('Error checking biolink addon status:', error);
        biolinkAddonActive = false;
        return false;
    }
}

// Global toggle functions for plan forms
function togglePaymentFields() {
    const isFree = document.getElementById('is_free');
    const paymentFields = document.getElementById('payment_fields');
    if (isFree && paymentFields) {
        paymentFields.style.display = isFree.checked ? 'none' : 'block';
    }
}

function toggleBioLinkFields() {
    const enabled = document.getElementById('biolink_enabled');
    const biolinkFields = document.getElementById('biolink_fields');
    if (enabled && biolinkFields) {
        biolinkFields.style.display = enabled.checked ? 'block' : 'none';
    }
}

function toggleEditPaymentFields() {
    const isFree = document.getElementById('edit_is_free');
    const paymentFields = document.getElementById('edit_payment_fields');
    if (isFree && paymentFields) {
        paymentFields.style.display = isFree.checked ? 'none' : 'block';
    }
}

function toggleEditBioLinkFields() {
    const enabled = document.getElementById('edit_biolink_enabled');
    const biolinkFields = document.getElementById('edit_biolink_fields');
    if (enabled && biolinkFields) {
        biolinkFields.style.display = enabled.checked ? 'block' : 'none';
    }
}

async function loadPlans() {
    const content = document.getElementById('content');
    showLoading(content);

    // Check biolink addon status first
    await checkBiolinkAddonStatus();
    await loadCurrencies();

    try {
        const response = await apiRequest('/superadmin/plans');
        const plans = response.data || [];

        content.innerHTML = `
            <div class="card-header" style="background: white; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h1 style="margin: 0; color: var(--dark);" data-i18n="superadmin.plans.title">Subscription Plans</h1>
                    <button class="btn btn-primary" onclick="showCreatePlanModal()">
                        <i class="fas fa-plus"></i> <span data-i18n="superadmin.plans.create">Create Plan</span>
                    </button>
                </div>
            </div>

            <div class="stats-grid">
                ${plans.map(plan => `
                    <div class="card">
                        <div style="text-align: center; padding: 1rem;">
                            <h3 style="color: var(--primary); margin-bottom: 0.5rem;">${plan.name}</h3>
                            <div style="font-size: 2rem; font-weight: 700; color: var(--dark); margin: 1rem 0;">
                                ${formatPlanPrice(plan.price, plan.currency)}
                                <span style="font-size: 1rem; color: var(--text-light);">/<span data-i18n="superadmin.plans.${plan.billing_period === 'monthly' ? 'month' : 'year'}">${plan.billing_period === 'monthly' ? 'month' : 'year'}</span></span>
                            </div>
                            <p style="color: var(--text-light); margin-bottom: 1rem;">${plan.description || ''}</p>
                            
                            <!-- Resource Limits -->
                            <div style="text-align: left; margin: 1.5rem 0; padding: 1rem; background: var(--light); border-radius: 8px;">
                                <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--primary);" data-i18n="superadmin.plans.resource_limits">Resource Limits</div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-store" style="color: var(--primary); width: 20px;"></i>
                                    <strong>${plan.max_stores || 0}</strong> <span data-i18n="superadmin.plans.stores">store(s)</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-users" style="color: var(--primary); width: 20px;"></i>
                                    <strong>${plan.max_users || 0}</strong> <span data-i18n="superadmin.plans.users">users</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-building" style="color: var(--primary); width: 20px;"></i>
                                    <strong>${plan.max_departments || 0}</strong> <span data-i18n="superadmin.plans.departments">departments</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-address-book" style="color: var(--primary); width: 20px;"></i>
                                    <strong>${plan.max_contacts || 0}</strong> <span data-i18n="superadmin.plans.contacts">contacts</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-mobile-alt" style="color: var(--primary); width: 20px;"></i>
                                    <strong>${plan.max_devices || 0}</strong> <span data-i18n="superadmin.plans.devices">device(s)</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-comments" style="color: var(--primary); width: 20px;"></i>
                                    <strong>${plan.max_conversations || 0}</strong> <span data-i18n="superadmin.plans.conversations">conversations</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-envelope" style="color: var(--primary); width: 20px;"></i>
                                    <strong>${plan.max_messages_per_month || 0}</strong> <span data-i18n="superadmin.plans.messages_month">messages/month</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-question-circle" style="color: var(--primary); width: 20px;"></i>
                                    <strong>${plan.max_faqs || 0}</strong> <span data-i18n="superadmin.plans.faqs">FAQs</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-layer-group" style="color: var(--primary); width: 20px;"></i>
                                    <strong>${plan.max_contact_groups || 0}</strong> <span data-i18n="superadmin.plans.contact_groups">contact groups</span>
                                </div>
                            </div>

                            <!-- Features -->
                            <div style="text-align: left; margin: 1rem 0; padding: 1rem; background: #f8f9fa; border-radius: 8px; font-size: 0.9rem;">
                                <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--primary);" data-i18n="superadmin.plans.features">Features</div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas ${plan.whatsapp_enabled ? 'fa-check text-success' : 'fa-times text-danger'}" style="width: 20px;"></i>
                                    <span data-i18n="superadmin.plans.whatsapp">WhatsApp</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas ${plan.ai_enabled ? 'fa-check text-success' : 'fa-times text-danger'}" style="width: 20px;"></i>
                                    <span data-i18n="superadmin.plans.ai">AI</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas ${plan.woocommerce_enabled ? 'fa-check text-success' : 'fa-times text-danger'}" style="width: 20px;"></i>
                                    <span data-i18n="superadmin.plans.woocommerce">WooCommerce</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas ${plan.analytics_enabled ? 'fa-check text-success' : 'fa-times text-danger'}" style="width: 20px;"></i>
                                    <span data-i18n="superadmin.plans.analytics">Analytics</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas ${plan.api_access_enabled ? 'fa-check text-success' : 'fa-times text-danger'}" style="width: 20px;"></i>
                                    <span data-i18n="superadmin.plans.api_access">API Access</span>
                                </div>
                            </div>

                            <!-- Quantity-based Features -->
                            <div style="text-align: left; margin: 1rem 0; padding: 1rem; background: #e8f5e9; border-radius: 8px; font-size: 0.9rem;">
                                <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--primary);" data-i18n="superadmin.plans.addon_features">Add-on Features</div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-file-invoice ${plan.max_invoices_per_month > 0 ? 'text-success' : 'text-muted'}" style="width: 20px;"></i>
                                    <strong>${plan.max_invoices_per_month || 0}</strong> <span data-i18n="superadmin.plans.invoices_month">invoices/month</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-file-alt ${plan.max_quotes_per_month > 0 ? 'text-success' : 'text-muted'}" style="width: 20px;"></i>
                                    <strong>${plan.max_quotes_per_month || 0}</strong> <span data-i18n="superadmin.plans.quotes_month">quotes/month</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-puzzle-piece ${plan.max_widgets > 0 ? 'text-success' : 'text-muted'}" style="width: 20px;"></i>
                                    <strong>${plan.max_widgets || 0}</strong> <span data-i18n="superadmin.plans.widgets">widgets</span>
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-link ${plan.max_payment_links_per_month > 0 ? 'text-success' : 'text-muted'}" style="width: 20px;"></i>
                                    <strong>${plan.max_payment_links_per_month || 0}</strong> <span data-i18n="superadmin.plans.links_month">links/month</span>
                                </div>
                            </div>

                            <!-- Bio Link Features -->
                            ${biolinkAddonActive && plan.biolink_enabled ? `
                            <div style="text-align: left; margin: 1rem 0; padding: 1rem; background: #e3f2fd; border-radius: 8px; font-size: 0.9rem;">
                                <div style="font-weight: 600; margin-bottom: 0.5rem; color: var(--primary);"><i class="fas fa-link"></i> Bio Link</div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-file-alt text-success" style="width: 20px;"></i>
                                    <strong>${plan.max_bio_pages || 0}</strong> bio pages
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-link text-success" style="width: 20px;"></i>
                                    <strong>${plan.max_short_links || 0}</strong> short links
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-qrcode text-success" style="width: 20px;"></i>
                                    <strong>${plan.max_qr_codes || 0}</strong> QR codes
                                </div>
                                <div style="margin-bottom: 0.3rem;">
                                    <i class="fas fa-file-upload text-success" style="width: 20px;"></i>
                                    <strong>${plan.max_file_transfers || 0}</strong> file transfers
                                </div>
                            </div>
                            ` : ''}

                            <div style="margin-top: 1rem;">
                                <span class="badge ${plan.active ? 'badge-success' : 'badge-danger'}">
                                    <span data-i18n="superadmin.common.${plan.active ? 'active' : 'inactive'}">${plan.active ? 'Active' : 'Inactive'}</span>
                                </span>
                                <span class="badge badge-info">${plan.tenant_count || 0} <span data-i18n="superadmin.plans.tenants">tenants</span></span>
                            </div>

                            <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                                <button class="btn btn-primary" onclick="editPlan(${plan.id})" style="flex: 1;">
                                    <i class="fas fa-edit"></i> <span data-i18n="superadmin.plans.edit">Edit</span>
                                </button>
                                <button class="btn btn-warning" onclick="syncPlanLimits(${plan.id}, '${plan.name}', ${plan.tenant_count || 0})" title="Sync limits to all tenants" ${plan.tenant_count === 0 ? 'disabled' : ''}>
                                    <i class="fas fa-sync"></i>
                                </button>
                                <button class="btn btn-danger" onclick="deletePlan(${plan.id}, '${plan.name}', ${plan.tenant_count || 0})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        // Apply translations
        if (typeof i18n !== 'undefined') {
            i18n.translatePage();
        }
    } catch (error) {
        showError(content, error.message);
    }
}

async function loadCurrencies() {
    try {
        const response = await apiRequest('/superadmin/currencies');
        allCurrencies = response.data?.currencies || [];
    } catch (error) {
        console.error('Error loading currencies:', error);
        allCurrencies = [];
    }
}

function getDefaultCurrency() {
    return allCurrencies.find(c => c.is_default) || allCurrencies[0] || null;
}

function getCurrencySymbol(code) {
    const currency = allCurrencies.find(c => c.code === code);
    if (currency?.symbol) return currency.symbol;
    const fallback = getDefaultCurrency();
    return fallback?.symbol || code || '$';
}

function formatPlanPrice(amount, code) {
    // Use formatCurrency from app.js if available for consistency
    if (typeof formatCurrency === 'function') {
        return formatCurrency(amount, code);
    }
    // Fallback to simple formatting
    const symbol = getCurrencySymbol(code);
    return `${symbol} ${parseFloat(amount).toFixed(2)}`;
}


function buildCurrencyOptions(selectedCode) {
    if (allCurrencies.length > 0) {
        const defaultCurrency = allCurrencies.find(c => c.is_default) || allCurrencies[0];
        const resolvedSelected = selectedCode || defaultCurrency?.code;
        return allCurrencies.map(c => `<option value="${c.code}" ${resolvedSelected === c.code ? 'selected' : ''}>${c.symbol} - ${c.code}</option>`).join('');
    }
    const fallback = selectedCode || 'USD';
    return `
        <option value="USD" ${fallback === 'USD' ? 'selected' : ''}>USD</option>
        <option value="EUR" ${fallback === 'EUR' ? 'selected' : ''}>EUR</option>
        <option value="GBP" ${fallback === 'GBP' ? 'selected' : ''}>GBP</option>
        <option value="BRL" ${fallback === 'BRL' ? 'selected' : ''}>BRL</option>
    `;
}
async function showCreatePlanModal() {
    if (!allCurrencies.length) {
        await loadCurrencies();
    }
    const content = `
            <h3 style="margin-top: 0; color: var(--primary);" data-i18n="superadmin.plans.basic_info">Basic Information</h3>
            <div class="form-group">
                <label class="form-label" data-i18n="superadmin.plans.name_required">Plan Name *</label>
                <input type="text" class="form-control" name="name" required>
            </div>
            <div class="form-group">
                <label class="form-label" data-i18n="superadmin.plans.description">Description</label>
                <textarea class="form-control" name="description" rows="3"></textarea>
            </div>
            <div class="row">
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.price_required">Price *</label>
                        <input type="number" class="form-control" name="price" step="0.01" required>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.currency">Currency</label>
                        <input type="text" class="form-control" name="currency" value="${getDefaultCurrency()?.code || 'USD'}" readonly>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.billing_period">Billing Period</label>
                        <select class="form-control" name="billing_period">
                            <option value="monthly" data-i18n="superadmin.plans.monthly">Monthly</option>
                            <option value="yearly" data-i18n="superadmin.plans.yearly">Yearly</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <hr>
            <h3 style="color: var(--primary);" data-i18n="superadmin.plans.resource_limits">Resource Limits</h3>
            <div class="row">
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.max_stores">Max Stores</label>
                        <input type="number" class="form-control" name="max_stores" value="1" min="1">
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.max_users">Max Users</label>
                        <input type="number" class="form-control" name="max_users" value="5" min="1">
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.max_departments">Max Departments</label>
                        <input type="number" class="form-control" name="max_departments" value="5" min="1">
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.max_contacts">Max Contacts</label>
                        <input type="number" class="form-control" name="max_contacts" value="1000" min="0">
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.max_devices">Max Devices</label>
                        <input type="number" class="form-control" name="max_devices" value="1" min="0">
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.max_conversations">Max Conversations</label>
                        <input type="number" class="form-control" name="max_conversations" value="1000" min="0">
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.max_messages_month">Max Messages/Month</label>
                        <input type="number" class="form-control" name="max_messages_per_month" value="10000" min="0">
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.max_faqs">Max FAQs</label>
                        <input type="number" class="form-control" name="max_faqs" value="10" min="0">
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.max_contact_groups">Max Contact Groups</label>
                        <input type="number" class="form-control" name="max_contact_groups" value="10" min="0">
                    </div>
                </div>
            </div>

            <hr>
            <h3 style="color: var(--primary);" data-i18n="superadmin.plans.features">Features</h3>
            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label class="switch-label">
                            <input type="checkbox" name="whatsapp_enabled" checked>
                            <span data-i18n="superadmin.plans.whatsapp_enabled">WhatsApp Enabled</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="switch-label">
                            <input type="checkbox" name="ai_enabled">
                            <span data-i18n="superadmin.plans.ai_enabled">AI Enabled</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="switch-label">
                            <input type="checkbox" name="woocommerce_enabled">
                            <span data-i18n="superadmin.plans.woocommerce_enabled">WooCommerce Enabled</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="switch-label">
                            <input type="checkbox" name="analytics_enabled" checked>
                            <span data-i18n="superadmin.plans.analytics_enabled">Analytics Enabled</span>
                        </label>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label class="switch-label">
                            <input type="checkbox" name="priority_support_enabled">
                            <span data-i18n="superadmin.plans.priority_support">Priority Support</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="switch-label">
                            <input type="checkbox" name="api_access_enabled">
                            <span data-i18n="superadmin.plans.api_access">API Access</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="switch-label">
                            <input type="checkbox" name="custom_branding_enabled">
                            <span data-i18n="superadmin.plans.custom_branding">Custom Branding</span>
                        </label>
                    </div>
                </div>
            </div>

            <hr>
            <h3 style="color: var(--primary);" data-i18n="superadmin.plans.addon_features">Add-on Features (Quantity Limits)</h3>
            <p style="color: #666; font-size: 0.9rem; margin-bottom: 1rem;" data-i18n="superadmin.plans.addon_features_note">Set quantity limits for features. Set 0 to disable the feature.</p>
            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-file-invoice" style="color: var(--primary);"></i> <span data-i18n="superadmin.plans.max_invoices_month">Max Invoices/Month</span></label>
                        <input type="number" class="form-control" name="max_invoices_per_month" value="0" min="0">
                        <small class="form-text" data-i18n="superadmin.plans.zero_disabled">0 = disabled</small>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-file-alt" style="color: var(--primary);"></i> <span data-i18n="superadmin.plans.max_quotes_month">Max Quotes/Month</span></label>
                        <input type="number" class="form-control" name="max_quotes_per_month" value="0" min="0">
                        <small class="form-text" data-i18n="superadmin.plans.zero_disabled">0 = disabled</small>
                    </div>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-puzzle-piece" style="color: var(--primary);"></i> <span data-i18n="superadmin.plans.max_widgets">Max Widgets</span></label>
                        <input type="number" class="form-control" name="max_widgets" value="0" min="0">
                        <small class="form-text" data-i18n="superadmin.plans.zero_disabled">0 = disabled</small>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label class="form-label"><i class="fas fa-link" style="color: var(--primary);"></i> <span data-i18n="superadmin.plans.max_payment_links_month">Max Payment Links/Month</span></label>
                        <input type="number" class="form-control" name="max_payment_links_per_month" value="0" min="0">
                        <small class="form-text" data-i18n="superadmin.plans.zero_disabled">0 = disabled</small>
                    </div>
                </div>
            </div>

            <hr>
            <h3 style="color: var(--primary);"><i class="fas fa-link"></i> Bio Link</h3>
            ${!biolinkAddonActive ? `
            <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                <i class="fas fa-exclamation-triangle" style="color: #856404;"></i>
                <strong style="color: #856404;">Addon Not Active</strong>
                <p style="color: #856404; margin: 5px 0 0; font-size: 0.9rem;">
                    The Bio Link addon is not installed or active. Go to System Add-ons to activate it first.
                </p>
            </div>
            ` : `
            <p style="color: #666; font-size: 0.9rem; margin-bottom: 1rem;">Enable Bio Link features and set resource limits for this plan.</p>
            <div class="form-group">
                <label class="switch-label">
                    <input type="checkbox" name="biolink_enabled" id="biolink_enabled" onchange="toggleBioLinkFields()">
                    <span>Bio Link Enabled</span>
                </label>
            </div>
            <div id="biolink_fields" style="display: none;">
                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label"><i class="fas fa-file-alt" style="color: var(--primary);"></i> Max Bio Pages</label>
                            <input type="number" class="form-control" name="max_bio_pages" value="1" min="0">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label"><i class="fas fa-link" style="color: var(--primary);"></i> Max Short Links</label>
                            <input type="number" class="form-control" name="max_short_links" value="10" min="0">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label"><i class="fas fa-qrcode" style="color: var(--primary);"></i> Max QR Codes</label>
                            <input type="number" class="form-control" name="max_qr_codes" value="10" min="0">
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label"><i class="fas fa-file-upload" style="color: var(--primary);"></i> Max File Transfers</label>
                            <input type="number" class="form-control" name="max_file_transfers" value="5" min="0">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label"><i class="fas fa-address-card" style="color: var(--primary);"></i> Max vCards</label>
                            <input type="number" class="form-control" name="max_vcards" value="2" min="0">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label"><i class="fas fa-calendar-alt" style="color: var(--primary);"></i> Max Event Links</label>
                            <input type="number" class="form-control" name="max_event_links" value="5" min="0">
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label"><i class="fas fa-code" style="color: var(--primary);"></i> Max HTML Pages</label>
                            <input type="number" class="form-control" name="max_html_pages" value="2" min="0">
                        </div>
                    </div>
                </div>
            </div>
            `}

            <hr>
            <h3 style="color: var(--primary);" data-i18n="superadmin.plans.payment_integration">Payment Gateway Integration</h3>
            <div class="form-group">
                <label class="switch-label">
                    <input type="checkbox" name="is_free" id="is_free" onchange="togglePaymentFields()">
                    <span data-i18n="superadmin.plans.free_plan">Free Plan</span>
                </label>
                <small class="form-text" data-i18n="superadmin.plans.free_plan_note">If checked, payment IDs are not required</small>
            </div>
            <div id="payment_fields">
                <div class="form-group">
                    <label class="form-label" data-i18n="superadmin.plans.stripe_price_id">Stripe Price ID</label>
                    <input type="text" class="form-control" name="stripe_price_id" data-i18n-placeholder="plans.stripe_price_placeholder">
                    <small class="form-text" data-i18n="superadmin.plans.stripe_price_note">Price ID created in Stripe (required if Stripe is active)</small>
                </div>
                <div class="form-group">
                    <label class="form-label" data-i18n="superadmin.plans.paypal_plan_id">PayPal Plan ID</label>
                    <input type="text" class="form-control" name="paypal_plan_id" data-i18n-placeholder="plans.paypal_plan_placeholder">
                    <small class="form-text" data-i18n="superadmin.plans.paypal_plan_note">Subscription plan ID created in PayPal (required if PayPal is active)</small>
                </div>
            </div>
        </form>

        <style>
            .switch-label {
                display: flex;
                align-items: center;
                cursor: pointer;
                user-select: none;
            }
            .switch-label input[type="checkbox"] {
                margin-right: 10px;
                width: 18px;
                height: 18px;
                cursor: pointer;
            }
            .switch-label span {
                font-weight: 500;
            }
            .row {
                display: flex;
                gap: 1rem;
                margin-bottom: 1rem;
            }
            .col-md-4 {
                flex: 1;
                min-width: 0;
            }
            .col-md-6 {
                flex: 1;
                min-width: 0;
            }
            .form-text {
                display: block;
                margin-top: 0.25rem;
                font-size: 0.875rem;
                color: #6c757d;
            }
        </style>
    `;

    const footer = `
        <button class="btn btn-secondary" onclick="closeModal()" data-i18n="superadmin.common.cancel">Cancel</button>
        <button class="btn btn-primary" onclick="submitCreatePlan()" data-i18n="superadmin.plans.create">Create Plan</button>
    `;

    createModal(typeof i18n !== 'undefined' ? i18n.t('superadmin.plans.create') : 'Create Subscription Plan', content, footer);
    
    // Apply translations after modal is created
    if (typeof i18n !== 'undefined') {
        i18n.translatePage();
    }
}


async function submitCreatePlan() {
    const form = document.getElementById('createPlanForm');
    const formData = new FormData(form);
    const data = {};
    
    // Process all form fields
    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }
    
    // Process checkboxes (they won't be in formData if unchecked)
    const checkboxes = [
        'whatsapp_enabled', 'ai_enabled', 'woocommerce_enabled', 'analytics_enabled',
        'priority_support_enabled', 'api_access_enabled', 'custom_branding_enabled',
        'is_free', 'biolink_enabled'
    ];
    
    checkboxes.forEach(checkbox => {
        const element = form.querySelector(`input[name="${checkbox}"]`);
        data[checkbox] = element ? element.checked : false;
    });

    // Set feature enabled flags based on quantity limits
    data.invoices_enabled = parseInt(data.max_invoices_per_month || 0) > 0;
    data.quotes_enabled = parseInt(data.max_quotes_per_month || 0) > 0;
    data.widgets_enabled = parseInt(data.max_widgets || 0) > 0;
    data.payment_links_enabled = parseInt(data.max_payment_links_per_month || 0) > 0;

    // Validate payment IDs if not free plan
    if (!data.is_free) {
        if (!data.stripe_price_id && !data.paypal_plan_id) {
            showAlert('superadmin.plans.payment_id_required', 'warning');
            return;
        }
    }

    try {
        await apiRequest('/superadmin/plans', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        closeModal();
        showSuccess('superadmin.plans.created_success');
        loadPlans();
    } catch (error) {
        showError(error.message);
    }
}

async function editPlan(id) {
    try {
        const response = await apiRequest('/superadmin/plans');
        const plan = (response.data || []).find(p => p.id === id);

        const content = `
            <form id="editPlanForm">
                <h3 style="margin-top: 0; color: var(--primary);" data-i18n="superadmin.plans.basic_info">Basic Information</h3>
                <div class="form-group">
                    <label class="form-label" data-i18n="superadmin.plans.name">Plan Name</label>
                    <input type="text" class="form-control" name="name" value="${plan.name}">
                </div>
                <div class="form-group">
                    <label class="form-label" data-i18n="superadmin.plans.description">Description</label>
                    <textarea class="form-control" name="description" rows="3">${plan.description || ''}</textarea>
                </div>
                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.price">Price</label>
                            <input type="number" class="form-control" name="price" step="0.01" value="${plan.price}">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.currency">Currency</label>
                            <input type="text" class="form-control" name="currency" value="${plan.currency}" readonly>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.billing_period">Billing Period</label>
                            <select class="form-control" name="billing_period">
                                <option value="monthly" ${plan.billing_period === 'monthly' ? 'selected' : ''} data-i18n="superadmin.plans.monthly">Monthly</option>
                                <option value="yearly" ${plan.billing_period === 'yearly' ? 'selected' : ''} data-i18n="superadmin.plans.yearly">Yearly</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <hr>
                <h3 style="color: var(--primary);" data-i18n="superadmin.plans.resource_limits">Resource Limits</h3>
                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.max_stores">Max Stores</label>
                            <input type="number" class="form-control" name="max_stores" value="${plan.max_stores || 1}">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.max_users">Max Users</label>
                            <input type="number" class="form-control" name="max_users" value="${plan.max_users}">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.max_departments">Max Departments</label>
                            <input type="number" class="form-control" name="max_departments" value="${plan.max_departments || 5}">
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.max_contacts">Max Contacts</label>
                            <input type="number" class="form-control" name="max_contacts" value="${plan.max_contacts || 1000}" min="0">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.max_devices">Max Devices</label>
                            <input type="number" class="form-control" name="max_devices" value="${plan.max_devices || 1}" min="0">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.max_conversations">Max Conversations</label>
                            <input type="number" class="form-control" name="max_conversations" value="${plan.max_conversations}" min="0">
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.max_messages_month">Max Messages/Month</label>
                            <input type="number" class="form-control" name="max_messages_per_month" value="${plan.max_messages_per_month}" min="0">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.max_faqs">Max FAQs</label>
                            <input type="number" class="form-control" name="max_faqs" value="${plan.max_faqs || 10}" min="0">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.max_contact_groups">Max Contact Groups</label>
                            <input type="number" class="form-control" name="max_contact_groups" value="${plan.max_contact_groups || 10}" min="0">
                        </div>
                    </div>
                </div>

                <hr>
                <h3 style="color: var(--primary);" data-i18n="superadmin.plans.features">Features</h3>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label class="switch-label">
                                <input type="checkbox" name="whatsapp_enabled" ${plan.whatsapp_enabled ? 'checked' : ''}>
                                <span data-i18n="superadmin.plans.whatsapp_enabled">WhatsApp Enabled</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="switch-label">
                                <input type="checkbox" name="ai_enabled" ${plan.ai_enabled ? 'checked' : ''}>
                                <span data-i18n="superadmin.plans.ai_enabled">AI Enabled</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="switch-label">
                                <input type="checkbox" name="woocommerce_enabled" ${plan.woocommerce_enabled ? 'checked' : ''}>
                                <span data-i18n="superadmin.plans.woocommerce_enabled">WooCommerce Enabled</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="switch-label">
                                <input type="checkbox" name="analytics_enabled" ${plan.analytics_enabled ? 'checked' : ''}>
                                <span data-i18n="superadmin.plans.analytics_enabled">Analytics Enabled</span>
                            </label>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label class="switch-label">
                                <input type="checkbox" name="priority_support_enabled" ${plan.priority_support_enabled ? 'checked' : ''}>
                                <span data-i18n="superadmin.plans.priority_support">Priority Support</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="switch-label">
                                <input type="checkbox" name="api_access_enabled" ${plan.api_access_enabled ? 'checked' : ''}>
                                <span data-i18n="superadmin.plans.api_access">API Access</span>
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="switch-label">
                                <input type="checkbox" name="custom_branding_enabled" ${plan.custom_branding_enabled ? 'checked' : ''}>
                                <span data-i18n="superadmin.plans.custom_branding">Custom Branding</span>
                            </label>
                        </div>
                    </div>
                </div>

                <hr>
                <h3 style="color: var(--primary);" data-i18n="superadmin.plans.addon_features">Add-on Features (Quantity Limits)</h3>
                <p style="color: #666; font-size: 0.9rem; margin-bottom: 1rem;" data-i18n="superadmin.plans.addon_features_note">Set quantity limits for features. Set 0 to disable the feature.</p>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label class="form-label"><i class="fas fa-file-invoice" style="color: var(--primary);"></i> <span data-i18n="superadmin.plans.max_invoices_month">Max Invoices/Month</span></label>
                            <input type="number" class="form-control" name="max_invoices_per_month" value="${plan.max_invoices_per_month || 0}" min="0">
                            <small class="form-text" data-i18n="superadmin.plans.zero_disabled">0 = disabled</small>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label class="form-label"><i class="fas fa-file-alt" style="color: var(--primary);"></i> <span data-i18n="superadmin.plans.max_quotes_month">Max Quotes/Month</span></label>
                            <input type="number" class="form-control" name="max_quotes_per_month" value="${plan.max_quotes_per_month || 0}" min="0">
                            <small class="form-text" data-i18n="superadmin.plans.zero_disabled">0 = disabled</small>
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label class="form-label"><i class="fas fa-puzzle-piece" style="color: var(--primary);"></i> <span data-i18n="superadmin.plans.max_widgets">Max Widgets</span></label>
                            <input type="number" class="form-control" name="max_widgets" value="${plan.max_widgets || 0}" min="0">
                            <small class="form-text" data-i18n="superadmin.plans.zero_disabled">0 = disabled</small>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label class="form-label"><i class="fas fa-link" style="color: var(--primary);"></i> <span data-i18n="superadmin.plans.max_payment_links_month">Max Payment Links/Month</span></label>
                            <input type="number" class="form-control" name="max_payment_links_per_month" value="${plan.max_payment_links_per_month || 0}" min="0">
                            <small class="form-text" data-i18n="superadmin.plans.zero_disabled">0 = disabled</small>
                        </div>
                    </div>
                </div>

                <hr>
                <h3 style="color: var(--primary);"><i class="fas fa-link"></i> Bio Link</h3>
                ${!biolinkAddonActive ? `
                <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                    <i class="fas fa-exclamation-triangle" style="color: #856404;"></i>
                    <strong style="color: #856404;">Addon Not Active</strong>
                    <p style="color: #856404; margin: 5px 0 0; font-size: 0.9rem;">
                        The Bio Link addon is not installed or active. Go to System Add-ons to activate it first.
                    </p>
                </div>
                ` : `
                <p style="color: #666; font-size: 0.9rem; margin-bottom: 1rem;">Enable Bio Link features and set resource limits for this plan.</p>
                <div class="form-group">
                    <label class="switch-label">
                        <input type="checkbox" name="biolink_enabled" id="edit_biolink_enabled" ${plan.biolink_enabled ? 'checked' : ''} onchange="toggleEditBioLinkFields()">
                        <span>Bio Link Enabled</span>
                    </label>
                </div>
                <div id="edit_biolink_fields" style="display: ${plan.biolink_enabled ? 'block' : 'none'};">
                    <div class="row">
                        <div class="col-md-4">
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-file-alt" style="color: var(--primary);"></i> Max Bio Pages</label>
                                <input type="number" class="form-control" name="max_bio_pages" value="${plan.max_bio_pages || 1}" min="0">
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-link" style="color: var(--primary);"></i> Max Short Links</label>
                                <input type="number" class="form-control" name="max_short_links" value="${plan.max_short_links || 10}" min="0">
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-qrcode" style="color: var(--primary);"></i> Max QR Codes</label>
                                <input type="number" class="form-control" name="max_qr_codes" value="${plan.max_qr_codes || 10}" min="0">
                            </div>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-4">
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-file-upload" style="color: var(--primary);"></i> Max File Transfers</label>
                                <input type="number" class="form-control" name="max_file_transfers" value="${plan.max_file_transfers || 5}" min="0">
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-address-card" style="color: var(--primary);"></i> Max vCards</label>
                                <input type="number" class="form-control" name="max_vcards" value="${plan.max_vcards || 2}" min="0">
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-calendar-alt" style="color: var(--primary);"></i> Max Event Links</label>
                                <input type="number" class="form-control" name="max_event_links" value="${plan.max_event_links || 5}" min="0">
                            </div>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-4">
                            <div class="form-group">
                                <label class="form-label"><i class="fas fa-code" style="color: var(--primary);"></i> Max HTML Pages</label>
                                <input type="number" class="form-control" name="max_html_pages" value="${plan.max_html_pages || 2}" min="0">
                            </div>
                        </div>
                    </div>
                </div>
                `}

                <hr>
                <h3 style="color: var(--primary);" data-i18n="superadmin.plans.payment_integration">Payment Gateway Integration</h3>
                <div class="form-group">
                    <label class="switch-label">
                        <input type="checkbox" name="is_free" id="edit_is_free" ${plan.is_free ? 'checked' : ''} onchange="toggleEditPaymentFields()">
                        <span data-i18n="superadmin.plans.free_plan">Free Plan</span>
                    </label>
                    <small class="form-text" data-i18n="superadmin.plans.free_plan_note">If checked, payment IDs are not required</small>
                </div>
                <div id="edit_payment_fields" style="display: ${plan.is_free ? 'none' : 'block'};">
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.stripe_price_id">Stripe Price ID</label>
                        <input type="text" class="form-control" name="stripe_price_id" value="${plan.stripe_price_id || ''}">
                        <small class="form-text" data-i18n="superadmin.plans.stripe_price_note">Price ID created in Stripe (required if Stripe is active)</small>
                    </div>
                    <div class="form-group">
                        <label class="form-label" data-i18n="superadmin.plans.paypal_plan_id">PayPal Plan ID</label>
                        <input type="text" class="form-control" name="paypal_plan_id" value="${plan.paypal_plan_id || ''}">
                        <small class="form-text" data-i18n="superadmin.plans.paypal_plan_note">Subscription plan ID created in PayPal (required if PayPal is active)</small>
                    </div>
                </div>

                <hr>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.sort_order">Sort Order</label>
                            <input type="number" class="form-control" name="sort_order" value="${plan.sort_order || 0}">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.plans.status">Status</label>
                            <select class="form-control" name="active">
                                <option value="1" ${plan.active ? 'selected' : ''} data-i18n="superadmin.common.active">Active</option>
                                <option value="0" ${!plan.active ? 'selected' : ''} data-i18n="superadmin.common.inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
                </div>
            </form>

            <style>
                .switch-label {
                    display: flex;
                    align-items: center;
                    cursor: pointer;
                    user-select: none;
                }
                .switch-label input[type="checkbox"] {
                    margin-right: 10px;
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                }
                .switch-label span {
                    font-weight: 500;
                }
                .row {
                    display: flex;
                    gap: 1rem;
                    margin-bottom: 1rem;
                }
                .col-md-4 {
                    flex: 1;
                    min-width: 0;
                }
                .col-md-6 {
                    flex: 1;
                    min-width: 0;
                }
                .form-text {
                    display: block;
                    margin-top: 0.25rem;
                    font-size: 0.875rem;
                    color: #6c757d;
                }
            </style>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="closeModal()" data-i18n="superadmin.common.cancel">Cancel</button>
            <button class="btn btn-primary" onclick="submitEditPlan(${id})" data-i18n="superadmin.common.update">Update</button>
        `;

        createModal(typeof i18n !== 'undefined' ? i18n.t('superadmin.plans.edit') : 'Edit Plan', content, footer);
        
        // Apply translations after modal is created
        if (typeof i18n !== 'undefined') {
            i18n.translatePage();
        }
    } catch (error) {
        showError(error.message);
    }
}

async function submitEditPlan(id) {
    const form = document.getElementById('editPlanForm');
    const formData = new FormData(form);
    const data = {};
    
    // Process all form fields
    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }
    
    // Process checkboxes
    const checkboxes = [
        'whatsapp_enabled', 'ai_enabled', 'woocommerce_enabled', 'analytics_enabled',
        'priority_support_enabled', 'api_access_enabled', 'custom_branding_enabled',
        'is_free', 'biolink_enabled'
    ];
    
    checkboxes.forEach(checkbox => {
        const element = form.querySelector(`input[name="${checkbox}"]`);
        data[checkbox] = element ? element.checked : false;
    });

    // Set feature enabled flags based on quantity limits
    data.invoices_enabled = parseInt(data.max_invoices_per_month || 0) > 0;
    data.quotes_enabled = parseInt(data.max_quotes_per_month || 0) > 0;
    data.widgets_enabled = parseInt(data.max_widgets || 0) > 0;
    data.payment_links_enabled = parseInt(data.max_payment_links_per_month || 0) > 0;

    // Validate payment IDs if not free plan
    if (!data.is_free) {
        if (!data.stripe_price_id && !data.paypal_plan_id) {
            showAlert('superadmin.plans.payment_id_required', 'warning');
            return;
        }
    }

    try {
        await apiRequest(`/superadmin/plans/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        closeModal();
        showSuccess('superadmin.plans.updated_success');
        loadPlans();
    } catch (error) {
        showError(error.message);
    }
}

function deletePlan(id, name, tenantCount) {
    if (tenantCount > 0) {
        showAlert('superadmin.plans.cannot_delete_active', 'warning');
        return;
    }

    showConfirm('superadmin.plans.delete_confirm', () => {
        apiRequest(`/superadmin/plans/${id}`, {
            method: 'DELETE'
        }).then(() => {
            showSuccess('superadmin.plans.deleted_success');
            loadPlans();
        }).catch(error => {
            showError(error.message);
        });
    });
}

/**
 * Sync plan limits to all tenants using this plan
 */
async function syncPlanLimits(planId, planName, tenantCount) {
    if (tenantCount === 0) {
        showAlert('superadmin.plans.no_tenants_to_sync', 'info');
        return;
    }

    const confirmMsg = typeof i18n !== 'undefined' 
        ? i18n.t('superadmin.plans.sync_confirm', { name: planName, count: tenantCount })
        : `This will update limits for ${tenantCount} tenant(s) using plan "${planName}". Continue?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        const response = await apiRequest(`/superadmin/plans/${planId}/sync-limits`, {
            method: 'POST'
        });

        const updatedCount = response.data?.tenants_updated || 0;
        showSuccess('superadmin.plans.sync_success', { count: updatedCount });
        loadPlans();
    } catch (error) {
        showError(error.message);
    }
}
