/**
 * Payment Gateways Management Module
 */

async function loadPaymentGateways() {
    const content = document.getElementById('content');
    showLoading(content);

    try {
        const response = await apiRequest('/superadmin/payment-gateways');
        const gateways = response.data || {};

        content.innerHTML = `
            <div class="card-header" style="background: white; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
                <h1 style="margin: 0; color: var(--dark);" data-i18n="superadmin.gateways.title">Payment Gateways</h1>
                <p style="margin: 0.5rem 0 0 0; color: var(--text-light);" data-i18n="superadmin.gateways.subtitle">Configure payment methods for plan subscriptions</p>
            </div>

            <!-- Stripe Gateway -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <i class="fab fa-stripe" style="font-size: 2rem; color: #635bff;"></i>
                        <div>
                            <h3 style="margin: 0;" data-i18n="superadmin.gateways.stripe">Stripe</h3>
                            <p style="margin: 0; color: var(--text-light); font-size: 0.9rem;" data-i18n="superadmin.gateways.stripe_desc">Credit card payments</p>
                        </div>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="stripe_enabled" ${gateways.stripe?.enabled ? 'checked' : ''} onchange="toggleGateway('stripe', this.checked)">
                        <span class="slider round"></span>
                    </label>
                </div>
                <div class="card-body">
                    <form id="stripeForm">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.gateways.mode">Mode</label>
                            <select class="form-control" name="stripe_mode">
                                <option value="test" ${gateways.stripe?.stripe_mode === 'test' || !gateways.stripe?.stripe_mode ? 'selected' : ''} data-i18n="superadmin.gateways.sandbox">Test (Sandbox)</option>
                                <option value="live" ${gateways.stripe?.stripe_mode === 'live' ? 'selected' : ''} data-i18n="superadmin.gateways.live">Live (Production)</option>
                            </select>
                            <small class="form-text" data-i18n="superadmin.gateways.stripe_mode_note">Use Test mode for development and testing</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.gateways.stripe_secret_key">Stripe Secret Key</label>
                            <input type="password" class="form-control" name="stripe_secret_key" 
                                   value="${gateways.stripe?.stripe_secret_key || ''}" 
                                   data-i18n-placeholder="gateways.stripe_secret_placeholder">
                            <small class="form-text" data-i18n="superadmin.gateways.stripe_secret_note">Stripe API secret key (sk_test_... or sk_live_...)</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.gateways.stripe_publishable_key">Stripe Publishable Key</label>
                            <input type="text" class="form-control" name="stripe_publishable_key" 
                                   value="${gateways.stripe?.stripe_publishable_key || ''}" 
                                   data-i18n-placeholder="gateways.stripe_publishable_placeholder">
                            <small class="form-text" data-i18n="superadmin.gateways.stripe_publishable_note">Public key for frontend (pk_test_... or pk_live_...)</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.gateways.webhook_secret">Webhook Secret (Optional)</label>
                            <input type="password" class="form-control" name="stripe_webhook_secret" 
                                   value="${gateways.stripe?.stripe_webhook_secret || ''}" 
                                   data-i18n-placeholder="gateways.webhook_secret_placeholder">
                            <small class="form-text" data-i18n="superadmin.gateways.stripe_webhook_note">Secret to validate Stripe webhooks</small>
                        </div>
                        <button type="button" class="btn btn-primary" onclick="saveGatewaySettings('stripe')">
                            <i class="fas fa-save"></i> <span data-i18n="superadmin.gateways.save_stripe">Save Stripe Settings</span>
                        </button>
                    </form>
                </div>
            </div>

            <!-- PayPal Gateway -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <i class="fab fa-paypal" style="font-size: 2rem; color: #0070ba;"></i>
                        <div>
                            <h3 style="margin: 0;" data-i18n="superadmin.gateways.paypal">PayPal</h3>
                            <p style="margin: 0; color: var(--text-light); font-size: 0.9rem;" data-i18n="superadmin.gateways.paypal_desc">PayPal payments</p>
                        </div>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="paypal_enabled" ${gateways.paypal?.enabled ? 'checked' : ''} onchange="toggleGateway('paypal', this.checked)">
                        <span class="slider round"></span>
                    </label>
                </div>
                <div class="card-body">
                    <form id="paypalForm">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.gateways.paypal_client_id">PayPal Client ID</label>
                            <input type="text" class="form-control" name="paypal_client_id" 
                                   value="${gateways.paypal?.paypal_client_id || ''}" 
                                   data-i18n-placeholder="gateways.paypal_client_placeholder">
                            <small class="form-text" data-i18n="superadmin.gateways.paypal_client_note">PayPal application Client ID</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.gateways.paypal_client_secret">PayPal Client Secret</label>
                            <input type="password" class="form-control" name="paypal_client_secret" 
                                   value="${gateways.paypal?.paypal_client_secret || ''}" 
                                   data-i18n-placeholder="gateways.paypal_secret_placeholder">
                            <small class="form-text" data-i18n="superadmin.gateways.paypal_secret_note">PayPal application secret</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.gateways.mode">Mode</label>
                            <select class="form-control" name="paypal_mode">
                                <option value="sandbox" ${gateways.paypal?.paypal_mode === 'sandbox' ? 'selected' : ''} data-i18n="superadmin.gateways.sandbox">Sandbox (Test)</option>
                                <option value="live" ${gateways.paypal?.paypal_mode === 'live' ? 'selected' : ''} data-i18n="superadmin.gateways.live">Live (Production)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.gateways.paypal_webhook_id">Webhook ID (Optional)</label>
                            <input type="text" class="form-control" name="paypal_webhook_id" 
                                   value="${gateways.paypal?.paypal_webhook_id || ''}" 
                                   data-i18n-placeholder="gateways.paypal_webhook_placeholder">
                            <small class="form-text" data-i18n="superadmin.gateways.paypal_webhook_note">Webhook ID for validation</small>
                        </div>
                        <button type="button" class="btn btn-primary" onclick="saveGatewaySettings('paypal')">
                            <i class="fas fa-save"></i> <span data-i18n="superadmin.gateways.save_paypal">Save PayPal Settings</span>
                        </button>
                    </form>
                </div>
            </div>

            <!-- Cash Gateway -->
            <div class="card">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <i class="fas fa-money-bill-wave" style="font-size: 2rem; color: #28a745;"></i>
                        <div>
                            <h3 style="margin: 0;" data-i18n="superadmin.gateways.cash">Cash / Transfer</h3>
                            <p style="margin: 0; color: var(--text-light); font-size: 0.9rem;" data-i18n="superadmin.gateways.cash_desc">Manual offline payment</p>
                        </div>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="cash_enabled" ${gateways.cash?.enabled ? 'checked' : ''} onchange="toggleGateway('cash', this.checked)">
                        <span class="slider round"></span>
                    </label>
                </div>
                <div class="card-body">
                    <form id="cashForm">
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.gateways.cash_instructions">Payment Instructions</label>
                            <textarea class="form-control" name="cash_instructions" rows="4" 
                                      data-i18n-placeholder="gateways.cash_instructions_placeholder">${gateways.cash?.cash_instructions || ''}</textarea>
                            <small class="form-text" data-i18n="superadmin.gateways.cash_instructions_note">Instructions displayed to customer when selecting this method</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.gateways.contact_email">Contact Email</label>
                            <input type="email" class="form-control" name="cash_contact_email" 
                                   value="${gateways.cash?.cash_contact_email || ''}" 
                                   data-i18n-placeholder="gateways.contact_email_placeholder">
                            <small class="form-text" data-i18n="superadmin.gateways.contact_email_note">Email for customer to contact</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label" data-i18n="superadmin.gateways.contact_phone">Contact Phone</label>
                            <input type="text" class="form-control" name="cash_contact_phone" 
                                   value="${gateways.cash?.cash_contact_phone || ''}" 
                                   data-i18n-placeholder="gateways.contact_phone_placeholder">
                            <small class="form-text" data-i18n="superadmin.gateways.contact_phone_note">Phone for customer to contact</small>
                        </div>
                        <button type="button" class="btn btn-primary" onclick="saveGatewaySettings('cash')">
                            <i class="fas fa-save"></i> <span data-i18n="superadmin.gateways.save_cash">Save Settings</span>
                        </button>
                    </form>
                </div>
            </div>

            <style>
                .switch {
                    position: relative;
                    display: inline-block;
                    width: 60px;
                    height: 34px;
                }
                .switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                .slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: #ccc;
                    transition: .4s;
                }
                .slider:before {
                    position: absolute;
                    content: "";
                    height: 26px;
                    width: 26px;
                    left: 4px;
                    bottom: 4px;
                    background-color: white;
                    transition: .4s;
                }
                input:checked + .slider {
                    background-color: #2196F3;
                }
                input:checked + .slider:before {
                    transform: translateX(26px);
                }
                .slider.round {
                    border-radius: 34px;
                }
                .slider.round:before {
                    border-radius: 50%;
                }
            </style>
        `;

        // Apply translations
        if (typeof i18n !== 'undefined') {
            i18n.translatePage();
        }
    } catch (error) {
        showError(content, error.message);
    }
}

async function toggleGateway(gateway, enabled) {
    try {
        await apiRequest(`/superadmin/payment-gateways/${gateway}/toggle`, {
            method: 'PUT',
            body: JSON.stringify({ enabled })
        });
        showSuccess(enabled ? 'superadmin.gateways.enabled' : 'superadmin.gateways.disabled');
    } catch (error) {
        showError(error.message || 'errors.server_error');
        // Revert checkbox
        document.getElementById(`${gateway}_enabled`).checked = !enabled;
    }
}

async function saveGatewaySettings(gateway) {
    const form = document.getElementById(`${gateway}Form`);
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
        await apiRequest(`/superadmin/payment-gateways/${gateway}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
        showSuccess('superadmin.gateways.settings_saved');
    } catch (error) {
        showError(error.message || 'errors.server_error');
    }
}

