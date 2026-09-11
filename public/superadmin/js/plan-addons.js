/**
 * Plan Add-ons Management Module
 * Superadmin interface for managing add-on resources
 */

let addons = [];

async function loadPlanAddons() {
    const content = document.getElementById('content');
    showLoading(content);

    try {
        // Load default currency first
        if (typeof loadDefaultCurrency === 'function') {
            await loadDefaultCurrency();
        }
        
        const response = await apiRequest('/superadmin/plan-addons');
        addons = response.data || [];

        content.innerHTML = `
            <div class="card-header" style="background: white; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h1 style="margin: 0; color: var(--dark);">Plan Add-ons</h1>
                        <p style="margin: 0.5rem 0 0 0; color: var(--text-light);">Configure additional resources that tenants can purchase</p>
                    </div>
                    <button class="btn btn-primary" onclick="showAddAddonModal()">
                        <i class="fas fa-plus"></i> Add New Add-on
                    </button>
                </div>
            </div>

            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 5%">Active</th>
                                <th style="width: 25%">Resource</th>
                                <th style="width: 35%">Description</th>
                                <th style="width: 15%">Price</th>
                                <!-- STRIPE/PAYPAL COLUMNS HIDDEN - ONLY CASH PAYMENT FOR ADDONS
                                <th style="width: 15%">Stripe Price ID</th>
                                <th style="width: 15%">PayPal Plan ID</th>
                                -->
                                <th style="width: 20%">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="addonsTableBody">
                            ${addons.length === 0 ? `
                                <tr>
                                    <td colspan="5" style="text-align: center; padding: 40px;">
                                        <i class="fas fa-box-open" style="font-size: 48px; color: #ccc; margin-bottom: 15px;"></i>
                                        <p style="color: #666;">No add-ons configured yet. Click "Add New Add-on" to create one.</p>
                                    </td>
                                </tr>
                            ` : addons.map(addon => {
                                const isActive = addon.active === 1 || addon.active === true || addon.active === '1';
                                return `
                                <tr>
                                    <td>
                                        <label class="switch" title="Toggle active status">
                                            <input type="checkbox" 
                                                   data-addon-id="${addon.id}" 
                                                   data-active="${addon.active}"
                                                   ${isActive ? 'checked' : ''} 
                                                   onchange="toggleAddon(${addon.id}, this.checked)">
                                            <span class="slider round"></span>
                                        </label>
                                    </td>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 10px;">
                                            <i class="${getResourceIcon(addon.resource_key)}" style="font-size: 20px; color: #00a149;"></i>
                                            <strong>${addon.resource_name}</strong>
                                        </div>
                                        <small style="color: #666;">${addon.resource_key}</small>
                                    </td>
                                    <td>${addon.description || '-'}</td>
                                    <td>
                                        <strong style="color: #00a149;">${formatCurrency(addon.unit_price)}</strong>
                                        <br><small style="color: #666;">/unit/month</small>
                                    </td>
                                    <!-- STRIPE/PAYPAL COLUMNS HIDDEN
                                    <td>
                                        ${addon.stripe_price_id ? `
                                            <code style="font-size: 11px; background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${addon.stripe_price_id}</code>
                                        ` : '<span style="color: #999;">Not set</span>'}
                                    </td>
                                    <td>
                                        ${addon.paypal_plan_id ? `
                                            <code style="font-size: 11px; background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${addon.paypal_plan_id}</code>
                                        ` : '<span style="color: #999;">Not set</span>'}
                                    </td>
                                    -->
                                    <td>
                                        <button class="btn btn-sm btn-secondary" onclick="editAddon(${addon.id})" title="Edit">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger" onclick="deleteAddon(${addon.id})" title="Delete">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card" style="margin-top: 20px;">
                <div class="card-header">
                    <h3><i class="fas fa-info-circle"></i> How to Configure Add-ons</h3>
                </div>
                <div class="card-body">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
                        <div>
                            <h4 style="color: #00a149; margin-bottom: 15px;"><i class="fab fa-stripe"></i> Stripe Configuration</h4>
                            <ol style="line-height: 1.8;">
                                <li>Go to <a href="https://dashboard.stripe.com/products" target="_blank">Stripe Products</a></li>
                                <li>Create a new product (e.g., "Additional Store")</li>
                                <li>Add a recurring price (monthly)</li>
                                <li>Copy the <strong>Price ID</strong> (starts with <code>price_</code>)</li>
                                <li>Paste it in the "Stripe Price ID" field</li>
                            </ol>
                        </div>
                        <div>
                            <h4 style="color: #0070ba; margin-bottom: 15px;"><i class="fab fa-paypal"></i> PayPal Configuration</h4>
                            <ol style="line-height: 1.8;">
                                <li>Go to <a href="https://developer.paypal.com/dashboard/" target="_blank">PayPal Developer</a></li>
                                <li>Create a subscription plan</li>
                                <li>Set the billing cycle to monthly</li>
                                <li>Copy the <strong>Plan ID</strong> (starts with <code>P-</code>)</li>
                                <li>Paste it in the "PayPal Plan ID" field</li>
                            </ol>
                        </div>
                    </div>
                    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #ffc107;">
                        <strong><i class="fas fa-exclamation-triangle"></i> Important:</strong>
                        <p style="margin: 5px 0 0;">Add-ons without Stripe/PayPal IDs will only be available for Cash/Transfer payment method.</p>
                    </div>
                </div>
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

function getResourceIcon(key) {
    const icons = {
        stores: 'fas fa-store',
        departments: 'fas fa-building',
        users: 'fas fa-users',
        conversations: 'fas fa-comments',
        messages: 'fas fa-envelope',
        contacts: 'fas fa-address-book',
        devices: 'fas fa-mobile-alt',
        ai: 'fas fa-robot',
        woocommerce: 'fas fa-shopping-cart',
        mass_send: 'fas fa-paper-plane',
        invoices: 'fas fa-file-invoice',
        widgets: 'fas fa-code',
        payment_links: 'fas fa-credit-card'
    };
    return icons[key] || 'fas fa-cube';
}

async function getCurrencyOptions(selectedCurrency = null) {
    try {
        const response = await apiRequest('/superadmin/currencies');
        const currencies = response.data?.currencies || [];
        const defaultCurrency = currencies.find(c => c.is_default) || currencies[0];
        const selected = selectedCurrency || defaultCurrency?.code || state.defaultCurrencyCode || 'USD';
        
        if (currencies.length > 0) {
            return currencies
                .filter(c => c.active)
                .map(c => `<option value="${c.code}" ${c.code === selected ? 'selected' : ''}>${c.code} - ${c.name}</option>`)
                .join('');
        }
    } catch (error) {
        console.warn('Failed to load currencies:', error);
    }
    
    // Fallback options
    const fallbackCurrencies = [
        { code: 'USD', name: 'US Dollar' },
        { code: 'EUR', name: 'Euro' },
        { code: 'GBP', name: 'British Pound' },
        { code: 'BRL', name: 'Brazilian Real' }
    ];
    const selected = selectedCurrency || state.defaultCurrencyCode || 'USD';
    return fallbackCurrencies
        .map(c => `<option value="${c.code}" ${c.code === selected ? 'selected' : ''}>${c.code} - ${c.name}</option>`)
        .join('');
}

async function showAddAddonModal() {
    const currencyOptions = await getCurrencyOptions();
    
    const modalHTML = `
        <div class="modal active" id="addonModal">
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3 class="modal-title">Add New Add-on</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="addonForm" onsubmit="saveAddon(event)">
                        <div class="form-group">
                            <label>Resource Key <span style="color: red;">*</span></label>
                            <input type="text" name="resource_key" class="form-control" required 
                                   placeholder="e.g., stores, users, messages"
                                   pattern="[a-z_]+" title="Only lowercase letters and underscores">
                            <small>Unique identifier (lowercase, no spaces)</small>
                        </div>

                        <div class="form-group">
                            <label>Resource Name <span style="color: red;">*</span></label>
                            <input type="text" name="resource_name" class="form-control" required 
                                   placeholder="e.g., Store, User, Message">
                        </div>

                        <div class="form-group">
                            <label>Description</label>
                            <textarea name="description" class="form-control" rows="2" 
                                      placeholder="Brief description of this add-on"></textarea>
                        </div>

                        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="form-group">
                                <label>Unit Price <span style="color: red;">*</span></label>
                                <input type="number" name="unit_price" class="form-control" required 
                                       step="0.01" min="0" placeholder="0.00">
                            </div>

                            <div class="form-group">
                                <label>Currency <span style="color: red;">*</span></label>
                                <select name="currency" class="form-control" required>
                                    ${currencyOptions}
                                </select>
                            </div>
                        </div>

                        <!-- STRIPE/PAYPAL FIELDS HIDDEN - ONLY CASH PAYMENT FOR ADDONS
                        <div class="form-group">
                            <label>Stripe Price ID</label>
                            <input type="text" name="stripe_price_id" class="form-control" 
                                   placeholder="price_xxxxxxxxxxxxx">
                            <small>Optional: Price ID from Stripe (starts with price_)</small>
                        </div>

                        <div class="form-group">
                            <label>PayPal Plan ID</label>
                            <input type="text" name="paypal_plan_id" class="form-control" 
                                   placeholder="P-xxxxxxxxxxxxx">
                            <small>Optional: Plan ID from PayPal (starts with P-)</small>
                        </div>
                        -->

                        <div class="form-group">
                            <label>Sort Order</label>
                            <input type="number" name="sort_order" class="form-control" value="0" min="0">
                            <small>Display order (lower numbers appear first)</small>
                        </div>

                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" name="active" checked>
                                <span>Active (visible to tenants)</span>
                            </label>
                        </div>

                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-save"></i> Save Add-on
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHTML;
}

async function editAddon(id) {
    const addon = addons.find(a => a.id === id);
    if (!addon) return;

    const currencyOptions = await getCurrencyOptions(addon.currency);

    const modalHTML = `
        <div class="modal active" id="addonModal">
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3 class="modal-title">Edit Add-on</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="addonForm" onsubmit="updateAddon(event, ${id})">
                        <div class="form-group">
                            <label>Resource Key <span style="color: red;">*</span></label>
                            <input type="text" name="resource_key" class="form-control" required 
                                   value="${addon.resource_key}" readonly style="background: #f0f0f0;">
                            <small>Cannot be changed after creation</small>
                        </div>

                        <div class="form-group">
                            <label>Resource Name <span style="color: red;">*</span></label>
                            <input type="text" name="resource_name" class="form-control" required 
                                   value="${addon.resource_name}">
                        </div>

                        <div class="form-group">
                            <label>Description</label>
                            <textarea name="description" class="form-control" rows="2">${addon.description || ''}</textarea>
                        </div>

                        <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="form-group">
                                <label>Unit Price <span style="color: red;">*</span></label>
                                <input type="number" name="unit_price" class="form-control" required 
                                       step="0.01" min="0" value="${addon.unit_price}">
                            </div>

                            <div class="form-group">
                                <label>Currency <span style="color: red;">*</span></label>
                                <select name="currency" class="form-control" required>
                                    ${currencyOptions}
                                </select>
                            </div>
                        </div>

                        <!-- STRIPE/PAYPAL FIELDS HIDDEN - ONLY CASH PAYMENT FOR ADDONS
                        <div class="form-group">
                            <label>Stripe Price ID</label>
                            <input type="text" name="stripe_price_id" class="form-control" 
                                   value="${addon.stripe_price_id || ''}" placeholder="price_xxxxxxxxxxxxx">
                        </div>

                        <div class="form-group">
                            <label>PayPal Plan ID</label>
                            <input type="text" name="paypal_plan_id" class="form-control" 
                                   value="${addon.paypal_plan_id || ''}" placeholder="P-xxxxxxxxxxxxx">
                        </div>
                        -->

                        <div class="form-group">
                            <label>Sort Order</label>
                            <input type="number" name="sort_order" class="form-control" value="${addon.sort_order}" min="0">
                        </div>

                        <div class="form-group">
                            <label class="checkbox-label">
                                <input type="checkbox" name="active" ${addon.active ? 'checked' : ''}>
                                <span>Active (visible to tenants)</span>
                            </label>
                        </div>

                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">
                                <i class="fas fa-save"></i> Update Add-on
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modalContainer').innerHTML = modalHTML;
}

async function saveAddon(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = {
        resource_key: formData.get('resource_key'),
        resource_name: formData.get('resource_name'),
        description: formData.get('description'),
        unit_price: parseFloat(formData.get('unit_price')),
        currency: formData.get('currency'),
        stripe_price_id: formData.get('stripe_price_id') || null,
        paypal_plan_id: formData.get('paypal_plan_id') || null,
        sort_order: parseInt(formData.get('sort_order')) || 0,
        active: formData.get('active') === 'on'
    };

    try {
        await apiRequest('/superadmin/plan-addons', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showSuccess('Add-on created successfully');
        closeModal();
        loadPlanAddons();
    } catch (error) {
        showError(error.message);
    }
}

async function updateAddon(event, id) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = {
        resource_name: formData.get('resource_name'),
        description: formData.get('description'),
        unit_price: parseFloat(formData.get('unit_price')),
        currency: formData.get('currency'),
        stripe_price_id: formData.get('stripe_price_id') || null,
        paypal_plan_id: formData.get('paypal_plan_id') || null,
        sort_order: parseInt(formData.get('sort_order')) || 0,
        active: formData.get('active') === 'on'
    };

    try {
        await apiRequest(`/superadmin/plan-addons/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        showSuccess('Add-on updated successfully');
        closeModal();
        loadPlanAddons();
    } catch (error) {
        showError(error.message);
    }
}

async function toggleAddon(id, active) {
    try {
        await apiRequest(`/superadmin/plan-addons/${id}/toggle`, {
            method: 'PUT',
            body: JSON.stringify({ active })
        });

        showSuccess(active ? 'Add-on activated' : 'Add-on deactivated');
        loadPlanAddons();
    } catch (error) {
        showError(error.message);
        loadPlanAddons();
    }
}

async function deleteAddon(id) {
    if (!confirm('Are you sure you want to delete this add-on? This action cannot be undone.')) {
        return;
    }

    try {
        await apiRequest(`/superadmin/plan-addons/${id}`, {
            method: 'DELETE'
        });

        showSuccess('Add-on deleted successfully');
        loadPlanAddons();
    } catch (error) {
        showError(error.message);
    }
}
