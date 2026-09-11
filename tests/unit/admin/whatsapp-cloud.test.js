const fs = require('fs');
const path = require('path');
const scriptPath = path.resolve(__dirname, '../../../public/admin/js/whatsapp-cloud.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf8');

function setupDom() {
  document.body.innerHTML = `
    <div id="whatsapp-cloud-page">
      <div id="wcAccountList"></div>
      <div id="wcAccountEmpty"></div>
      <input id="wcAccountSearch" />
      <button id="wcAddAccountBtn"></button>
      <button id="wcEmptyConnectBtn"></button>
      <button id="wcConnectAccountShortcut"></button>
      <button id="wcCreateTemplateBtn"></button>
      <button id="wcTemplateSyncBtn"></button>
      <button id="wcOpenInboxBtn"></button>
      <button id="wcRefreshAccounts"></button>
      <div id="wcActiveAccountLabel"></div>
      <div id="wcTabs">
        <button class="wc-tab active" data-wc-tab="conversations"></button>
        <button class="wc-tab" data-wc-tab="flow-builder"></button>
        <button class="wc-tab" data-wc-tab="faq"></button>
        <button class="wc-tab" data-wc-tab="campaigns"></button>
        <button class="wc-tab" data-wc-tab="connection"></button>
      </div>
      <div class="wc-panel active" data-wc-panel="conversations"></div>
      <div class="wc-panel" data-wc-panel="flow-builder"></div>
      <div class="wc-panel" data-wc-panel="faq"></div>
      <div class="wc-panel" data-wc-panel="campaigns"></div>
      <div class="wc-panel" data-wc-panel="connection"></div>
      <select class="wc-account-select"></select>
      <select class="wc-account-select"></select>
      <select id="wcConnectionAccountSelect" class="wc-account-select"></select>
      <strong id="wcAccountStatus"></strong>
      <form id="wcConnectionForm"></form>
      <button id="wcTestConnectionBtn"></button>
      <button id="wcRotateTokenBtn"></button>
    </div>
  `;
}

describe('WhatsApp Cloud UI', () => {
  let lastModal;

  beforeAll(() => {
    window.eval(scriptCode);
  });

  beforeEach(() => {
    localStorage.clear();
    setupDom();
    window.showNotification = jest.fn();
    window.navigateTo = jest.fn();
    window.i18n = { t: key => key };
    window.Modal = {
      form: jest.fn(config => {
        lastModal = { config };
        return lastModal;
      })
    };
    window.eval("wcState = { accounts: [], activeAccountId: null, activeTab: 'conversations', search: '' };");
  });

  it('should render empty state when no accounts exist', () => {
    window.initWhatsAppCloudPage();

    expect(document.getElementById('wcAccountList').innerHTML).toBe('');
    expect(document.getElementById('wcAccountEmpty').style.display).toBe('block');
    expect(document.getElementById('wcActiveAccountLabel').textContent).toBe('whatsapp_cloud.no_active_account');
  });

  it('should add account through modal and set as active', () => {
    window.initWhatsAppCloudPage();

    document.getElementById('wcAddAccountBtn').click();
    lastModal.submit({
      name: 'Cloud Number 1',
      phoneNumberId: '123',
      wabaId: 'waba-1',
      status: 'connected'
    });

    const list = document.getElementById('wcAccountList');
    expect(list.innerHTML).toContain('Cloud Number 1');
    expect(document.getElementById('wcActiveAccountLabel').textContent).toBe('Cloud Number 1');
    expect(window.showNotification).toHaveBeenCalled();
  });

  it('should switch active account from selector', () => {
    localStorage.setItem('whatsappCloudAccounts', JSON.stringify([
      { id: '1', name: 'Account A', phoneNumberId: '111', status: 'connected', isDefault: true },
      { id: '2', name: 'Account B', phoneNumberId: '222', status: 'pending', isDefault: false }
    ]));

    window.initWhatsAppCloudPage();

    const select = document.querySelector('.wc-account-select');
    select.value = '2';
    select.dispatchEvent(new Event('change'));

    expect(document.getElementById('wcActiveAccountLabel').textContent).toBe('Account B');
  });

  it('should switch panels when tab is clicked', () => {
    window.initWhatsAppCloudPage();

    const flowTab = document.querySelector('[data-wc-tab="flow-builder"]');
    flowTab.click();

    expect(flowTab.classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-wc-panel="flow-builder"]').classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-wc-panel="conversations"]').classList.contains('active')).toBe(false);
  });

  it('should mark account as connected on connection form submit', () => {
    localStorage.setItem('whatsappCloudAccounts', JSON.stringify([
      { id: '1', name: 'Account A', phoneNumberId: '111', status: 'pending', isDefault: true }
    ]));

    window.initWhatsAppCloudPage();
    const form = document.getElementById('wcConnectionForm');
    form.dispatchEvent(new Event('submit'));

    expect(document.getElementById('wcAccountStatus').textContent).toBe('whatsapp_cloud.status_connected');
    expect(window.showNotification).toHaveBeenCalled();
  });
});
