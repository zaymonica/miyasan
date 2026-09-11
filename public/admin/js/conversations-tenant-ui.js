// Admin Conversations UI Adapter
// Mounts the user conversations UI in admin with read-only and pipeline edit capabilities
window.initTenantConversationsUI = function initTenantConversationsUI() {
  const mount = document.getElementById('conversations-page');
  if (!mount) return;
  mount.innerHTML = `
    <div id="user-conversations-page" style="display:block;"></div>
    <div id="conversation-modal" class="conversation-modal hidden"></div>
    <div id="conversation-overlay" class="conversation-overlay hidden"></div>
  `;
  window.UserConversationsConfig = {
    webSource: 'service',
    adminMode: true,
    readOnly: true,
    allowPipelineEdit: true
  };
  if (typeof UserConversations !== 'undefined' && typeof UserConversations.init === 'function') {
    UserConversations.init();
  }
}
