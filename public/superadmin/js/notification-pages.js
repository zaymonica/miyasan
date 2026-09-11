/**
 * Notification Pages Loader
 * Handles loading of Email notification pages
 * WhatsApp notifications temporarily disabled
 */

/* WhatsApp Notifications temporarily disabled
// Override loadWhatsAppNotifications
window.loadWhatsAppNotifications = function() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="page-header">
            <h1><i class="fab fa-whatsapp"></i> <span data-i18n="notifications.whatsapp.title">WhatsApp Notifications</span></h1>
            <p data-i18n="notifications.whatsapp.subtitle">Connect WhatsApp Web to send automated notifications to tenants</p>
        </div>

        <div class="row">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-link"></i> <span data-i18n="notifications.whatsapp.connection">WhatsApp Web Connection</span></h3>
                    </div>
                    <div class="card-body">
                        <div id="whatsappStatusContainer" style="text-align: center; padding: 40px;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 3em; color: #25d366;"></i>
                            <p style="margin-top: 20px;" data-i18n="notifications.whatsapp.checking_status">Checking connection status...</p>
                        </div>
                        <div id="qrCodeContainer" style="display: none; text-align: center; padding: 40px;">
                            <h3 style="color: #25d366;"><i class="fab fa-whatsapp"></i> <span data-i18n="notifications.whatsapp.scan_qr">Scan QR Code</span></h3>
                            <p data-i18n="notifications.whatsapp.qr_instructions">Open WhatsApp on your phone → Settings → Linked Devices → Link a Device</p>
                            <div style="margin: 30px auto; max-width: 350px; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                                <img id="qrCodeImage" src="" alt="QR Code" style="max-width: 100%; border: 3px solid #25d366; border-radius: 8px;">
                            </div>
                        </div>
                        <div id="connectedContainer" style="display: none; text-align: center; padding: 40px;">
                            <i class="fas fa-check-circle" style="font-size: 5em; color: #25d366;"></i>
                            <h3 style="margin-top: 20px; color: #25d366;" data-i18n="notifications.whatsapp.connected">WhatsApp Connected!</h3>
                            <div style="margin: 30px auto; max-width: 400px; background: #f0f9ff; padding: 20px; border-radius: 10px;">
                                <p style="margin: 10px 0;"><strong data-i18n="notifications.whatsapp.phone">Phone:</strong> <span id="connectedPhone">-</span></p>
                                <p style="margin: 10px 0;"><strong data-i18n="notifications.whatsapp.last_connected">Connected:</strong> <span id="lastConnected">-</span></p>
                            </div>
                            <button onclick="WhatsAppNotifications.disconnectWhatsApp()" class="btn btn-danger" style="margin-top: 20px;">
                                <i class="fas fa-unlink"></i> <span data-i18n="notifications.whatsapp.disconnect">Disconnect</span>
                            </button>
                        </div>
                        <div id="disconnectedContainer" style="display: none; text-align: center; padding: 40px;">
                            <i class="fas fa-times-circle" style="font-size: 5em; color: #f44336;"></i>
                            <h3 style="margin-top: 20px;" data-i18n="notifications.whatsapp.not_connected">WhatsApp Not Connected</h3>
                            <p style="color: #666; margin: 20px 0;" data-i18n="notifications.whatsapp.connect_prompt">Connect your WhatsApp to start sending automated notifications</p>
                            <button onclick="WhatsAppNotifications.initWhatsApp()" class="btn btn-success btn-lg" style="margin-top: 20px;">
                                <i class="fab fa-whatsapp"></i> <span data-i18n="notifications.whatsapp.connect">Connect WhatsApp Web</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row mt-4">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-calendar-alt"></i> <span data-i18n="notifications.expiration.title">Plan Expiration Reminders</span></h3>
                    </div>
                    <div class="card-body">
                        <p class="text-muted" data-i18n="notifications.expiration.description">Configure when to send reminders before and after plan expiration</p>
                        <div class="row mt-3">
                            <div class="col-md-6">
                                <h5 data-i18n="notifications.expiration.before">Days Before Expiration</h5>
                                <div class="row">
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.reminder_1">Reminder 1</label>
                                        <select id="days_before_1" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.reminder_2">Reminder 2</label>
                                        <select id="days_before_2" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.reminder_3">Reminder 3</label>
                                        <select id="days_before_3" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.reminder_4">Reminder 4</label>
                                        <select id="days_before_4" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <h5 data-i18n="notifications.expiration.after">Days After Expiration</h5>
                                <div class="row">
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.overdue_1">Overdue 1</label>
                                        <select id="days_after_1" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.overdue_2">Overdue 2</label>
                                        <select id="days_after_2" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.overdue_3">Overdue 3</label>
                                        <select id="days_after_3" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="row mt-3">
                            <div class="col-md-6">
                                <label class="switch-label">
                                    <span data-i18n="notifications.expiration.enabled">Enable Reminders</span>
                                    <label class="switch">
                                        <input type="checkbox" id="expiration_enabled">
                                        <span class="slider"></span>
                                    </label>
                                </label>
                            </div>
                            <div class="col-md-6 text-right">
                                <button id="saveExpirationSettings" class="btn btn-primary">
                                    <i class="fas fa-save"></i> <span data-i18n="common.save">Save</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row mt-4">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-file-alt"></i> <span data-i18n="notifications.templates.title">Notification Templates</span></h3>
                        <div class="card-actions">
                            <select id="templateCategory" class="form-control">
                                <option value="" data-i18n="notifications.category.all">All Categories</option>
                                <option value="tenant" data-i18n="notifications.category.tenant">Tenant</option>
                                <option value="subscription" data-i18n="notifications.category.subscription">Subscription</option>
                                <option value="security" data-i18n="notifications.category.security">Security</option>
                                <option value="system" data-i18n="notifications.category.system">System</option>
                            </select>
                            <input type="text" id="searchTemplates" class="form-control" data-i18n-placeholder="notifications.search_templates" placeholder="Search templates...">
                        </div>
                    </div>
                    <div class="card-body">
                        <div id="templatesContainer">
                            <div class="loading"><div class="spinner"></div><p data-i18n="common.loading">Loading...</p></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row mt-4">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-paper-plane"></i> <span data-i18n="notifications.test.title">Send Test Message</span></h3>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label data-i18n="notifications.test.phone">Phone Number</label>
                                    <input type="text" id="test_phone" class="form-control">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label data-i18n="notifications.test.message">Message</label>
                                    <textarea id="test_message" class="form-control" rows="3" placeholder="Test message..."></textarea>
                                </div>
                            </div>
                            <div class="col-md-2" style="display: flex; align-items: flex-end;">
                                <button onclick="WhatsAppNotifications.sendTestMessage()" class="btn btn-success btn-block">
                                    <i class="fab fa-whatsapp"></i> <span data-i18n="notifications.test.send">Send</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Initialize module
    if (window.WhatsAppNotifications) {
        WhatsAppNotifications.init();
    } else {
        const script = document.createElement('script');
        script.src = '/superadmin/js/whatsapp-notifications.js';
        script.onload = () => { if (window.WhatsAppNotifications) WhatsAppNotifications.init(); };
        document.body.appendChild(script);
    }
    if (window.i18n) i18n.translatePage();
};
End of WhatsApp Notifications disabled section */


// Override loadEmailNotifications
window.loadEmailNotifications = function() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="page-header">
            <h1><i class="fas fa-envelope"></i> <span data-i18n="notifications.email.title">Email Notifications</span></h1>
            <p data-i18n="notifications.email.subtitle">Configure SMTP settings and manage email notification templates</p>
        </div>

        <div class="row">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-cog"></i> <span data-i18n="notifications.email.smtp_config">SMTP Configuration</span></h3>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label data-i18n="notifications.email.smtp_host">SMTP Host</label>
                                    <input type="text" id="smtp_host" class="form-control" placeholder="smtp.gmail.com">
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label data-i18n="notifications.email.smtp_port">SMTP Port</label>
                                    <input type="number" id="smtp_port" class="form-control" value="587">
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label data-i18n="notifications.email.smtp_secure">Use SSL/TLS</label>
                                    <label class="switch">
                                        <input type="checkbox" id="smtp_secure">
                                        <span class="slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label data-i18n="notifications.email.smtp_user">SMTP Username</label>
                                    <input type="text" id="smtp_user" class="form-control">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label data-i18n="notifications.email.smtp_password">SMTP Password</label>
                                    <input type="password" id="smtp_password" class="form-control" data-i18n-placeholder="notifications.email.password_placeholder" placeholder="Leave empty to keep current">
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label data-i18n="notifications.email.from_email">From Email</label>
                                    <input type="email" id="from_email" class="form-control" placeholder="noreply@yourdomain.com">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label data-i18n="notifications.email.from_name">From Name</label>
                                    <input type="text" id="from_name" class="form-control" placeholder="Misayan SaaS">
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label data-i18n="notifications.email.test_recipient">Test Recipient Email</label>
                                    <input type="email" id="test_recipient" class="form-control" placeholder="test@example.com">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label data-i18n="notifications.email.enabled">Enable Email Notifications</label>
                                    <label class="switch">
                                        <input type="checkbox" id="email_enabled">
                                        <span class="slider"></span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button id="testEmailConnection" class="btn btn-secondary">
                                <i class="fas fa-paper-plane"></i> <span data-i18n="notifications.email.send_test">Send Test Email</span>
                            </button>
                            <button id="saveEmailSettings" class="btn btn-primary">
                                <i class="fas fa-save"></i> <span data-i18n="common.save">Save Settings</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row mt-4">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-calendar-alt"></i> <span data-i18n="notifications.expiration.title">Plan Expiration Reminders</span></h3>
                    </div>
                    <div class="card-body">
                        <p class="text-muted" data-i18n="notifications.expiration.description">Configure when to send reminders before and after plan expiration</p>
                        <div class="row mt-3">
                            <div class="col-md-6">
                                <h5 data-i18n="notifications.expiration.before">Days Before Expiration</h5>
                                <div class="row">
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.reminder_1">Reminder 1</label>
                                        <select id="email_days_before_1" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.reminder_2">Reminder 2</label>
                                        <select id="email_days_before_2" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.reminder_3">Reminder 3</label>
                                        <select id="email_days_before_3" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.reminder_4">Reminder 4</label>
                                        <select id="email_days_before_4" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <h5 data-i18n="notifications.expiration.after">Days After Expiration</h5>
                                <div class="row">
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.overdue_1">Overdue 1</label>
                                        <select id="email_days_after_1" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.overdue_2">Overdue 2</label>
                                        <select id="email_days_after_2" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                    <div class="col-6 form-group">
                                        <label data-i18n="notifications.expiration.overdue_3">Overdue 3</label>
                                        <select id="email_days_after_3" class="form-control">
                                            <option value="0" data-i18n="notifications.days.0">0 days</option>
                                            <option value="1" data-i18n="notifications.days.1">1 day</option>
                                            <option value="2" data-i18n="notifications.days.2">2 days</option>
                                            <option value="3" data-i18n="notifications.days.3">3 days</option>
                                            <option value="4" data-i18n="notifications.days.4">4 days</option>
                                            <option value="5" data-i18n="notifications.days.5">5 days</option>
                                            <option value="6" data-i18n="notifications.days.6">6 days</option>
                                            <option value="7" data-i18n="notifications.days.7">7 days</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="row mt-3">
                            <div class="col-md-6">
                                <label class="switch-label">
                                    <span data-i18n="notifications.expiration.enabled">Enable Reminders</span>
                                    <label class="switch">
                                        <input type="checkbox" id="email_expiration_enabled">
                                        <span class="slider"></span>
                                    </label>
                                </label>
                            </div>
                            <div class="col-md-6 text-right">
                                <button id="testExpirationCheck" class="btn btn-info mr-2" onclick="testExpirationNotifications()">
                                    <i class="fas fa-play"></i> <span data-i18n="notifications.test_check">Test Check Now</span>
                                </button>
                                <button id="saveEmailExpirationSettings" class="btn btn-primary">
                                    <i class="fas fa-save"></i> <span data-i18n="common.save">Save</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row mt-4">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-file-alt"></i> <span data-i18n="notifications.templates.title">Email Templates</span></h3>
                        <div class="card-actions">
                            <select id="templateCategory" class="form-control">
                                <option value="" data-i18n="notifications.category.all">All Categories</option>
                                <option value="tenant" data-i18n="notifications.category.tenant">Tenant</option>
                                <option value="subscription" data-i18n="notifications.category.subscription">Subscription</option>
                                <option value="security" data-i18n="notifications.category.security">Security</option>
                                <option value="system" data-i18n="notifications.category.system">System</option>
                            </select>
                            <input type="text" id="searchTemplates" class="form-control" data-i18n-placeholder="notifications.search_templates" placeholder="Search templates...">
                        </div>
                    </div>
                    <div class="card-body">
                        <div id="templatesContainer">
                            <div class="loading"><div class="spinner"></div><p data-i18n="common.loading">Loading...</p></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Initialize module
    if (window.EmailNotifications) {
        EmailNotifications.init();
    } else {
        const script = document.createElement('script');
        script.src = '/superadmin/js/email-notifications.js';
        script.onload = () => { if (window.EmailNotifications) EmailNotifications.init(); };
        document.body.appendChild(script);
    }
    if (window.i18n) i18n.translatePage();
};
