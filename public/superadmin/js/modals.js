/**
 * Custom Modal and Notification System for SuperAdmin
 * No browser alerts - all custom UI
 */

class ModalSystem {
  constructor() {
    this.activeModals = [];
  }

  /**
   * Get i18n instance safely
   */
  getI18n() {
    return window.i18n || (typeof i18n !== 'undefined' ? i18n : null);
  }

  /**
   * Check if i18n is ready
   */
  isI18nReady() {
    const i18nInstance = this.getI18n();
    if (!i18nInstance || !i18nInstance.translations) return false;
    const currentLang = i18nInstance.currentLanguage || 'en';
    return i18nInstance.translations[currentLang] && Object.keys(i18nInstance.translations[currentLang]).length > 0;
  }

  /**
   * Translate a key
   */
  translate(key) {
    const i18nInstance = this.getI18n();
    if (this.isI18nReady() && i18nInstance) {
      return i18nInstance.t(key);
    }
    return key;
  }

  /**
   * Show confirmation dialog
   */
  confirm(message, onConfirm, onCancel = null) {
    const hasI18n = this.isI18nReady();
    const i18nInstance = this.getI18n();
    
    const confirmText = hasI18n ? this.translate('common.confirm') : 'Confirm';
    const cancelText = hasI18n ? this.translate('common.cancel') : 'Cancel';
    const messageText = hasI18n ? this.translate(message) : message;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-dialog modal-sm">
        <div class="modal-content">
          <div class="modal-header">
            <h3 data-i18n="common.confirm">${confirmText}</h3>
          </div>
          <div class="modal-body">
            <p data-i18n="${message}">${messageText}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-action="cancel">
              <span data-i18n="common.cancel">${cancelText}</span>
            </button>
            <button class="btn btn-primary" data-action="confirm">
              <span data-i18n="common.confirm">${confirmText}</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.activeModals.push(modal);
    
    // Translate page after modal is added to DOM
    if (hasI18n && i18nInstance && i18nInstance.translatePage) {
      i18nInstance.translatePage();
    }

    // Handle buttons
    modal.querySelector('[data-action="confirm"]').onclick = () => {
      this.close(modal);
      if (onConfirm) onConfirm();
    };

    modal.querySelector('[data-action="cancel"]').onclick = () => {
      this.close(modal);
      if (onCancel) onCancel();
    };

    // Close on background click
    modal.onclick = (e) => {
      if (e.target === modal) {
        this.close(modal);
        if (onCancel) onCancel();
      }
    };

    // Close on ESC
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this.close(modal);
        if (onCancel) onCancel();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  /**
   * Show alert dialog
   */
  alert(message, type = 'info') {
    const icons = {
      info: 'fa-info-circle',
      success: 'fa-check-circle',
      warning: 'fa-exclamation-triangle',
      error: 'fa-times-circle'
    };

    const colors = {
      info: '#3498db',
      success: '#27ae60',
      warning: '#f39c12',
      error: '#e74c3c'
    };

    const hasI18n = this.isI18nReady();
    const i18nInstance = this.getI18n();
    
    const typeText = hasI18n ? this.translate(`notification.${type}`) : type;
    const messageText = hasI18n ? this.translate(message) : message;
    const closeText = hasI18n ? this.translate('common.close') : 'Close';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-dialog modal-sm">
        <div class="modal-content">
          <div class="modal-header" style="border-bottom-color: ${colors[type]};">
            <h3>
              <i class="fas ${icons[type]}" style="color: ${colors[type]};"></i>
              <span data-i18n="notification.${type}">${typeText}</span>
            </h3>
          </div>
          <div class="modal-body">
            <p data-i18n="${message}">${messageText}</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-primary" data-action="close">
              <span data-i18n="common.close">${closeText}</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.activeModals.push(modal);
    
    // Translate page after modal is added to DOM
    if (hasI18n && i18nInstance && i18nInstance.translatePage) {
      i18nInstance.translatePage();
    }

    // Handle close
    modal.querySelector('[data-action="close"]').onclick = () => {
      this.close(modal);
    };

    // Close on background click
    modal.onclick = (e) => {
      if (e.target === modal) {
        this.close(modal);
      }
    };

    // Close on ESC
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        this.close(modal);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  /**
   * Show toast notification
   */
  toast(message, type = 'info', duration = 3000) {
    // Ensure message is valid
    if (!message || typeof message !== 'string') {
      message = 'errors.server_error';
    }

    const icons = {
      info: 'fa-info-circle',
      success: 'fa-check-circle',
      warning: 'fa-exclamation-triangle',
      error: 'fa-times-circle'
    };

    const colors = {
      info: '#3498db',
      success: '#27ae60',
      warning: '#f39c12',
      error: '#e74c3c'
    };

    // Create toast container if it doesn't exist
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} show`;
    
    // Get translated message safely
    let translatedMessage = message;
    try {
      if (this.isI18nReady()) {
        translatedMessage = this.translate(message);
      }
    } catch (e) {
      console.error('Translation error:', e);
      translatedMessage = message;
    }
    
    toast.innerHTML = `
      <div class="toast-icon">
        <i class="fas ${icons[type]}" style="color: ${colors[type]};"></i>
      </div>
      <div class="toast-content">
        <span>${translatedMessage}</span>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    `;

    container.appendChild(toast);

    // Auto remove
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  }

  /**
   * Close modal
   */
  close(modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.remove();
      const index = this.activeModals.indexOf(modal);
      if (index > -1) {
        this.activeModals.splice(index, 1);
      }
    }, 300);
  }

  /**
   * Close all modals
   */
  closeAll() {
    this.activeModals.forEach(modal => this.close(modal));
  }
}

// Create global instance
window.modalSystem = new ModalSystem();

// Global helper functions
window.showConfirm = (message, onConfirm, onCancel) => {
  window.modalSystem.confirm(message, onConfirm, onCancel);
};

window.showAlert = (message, type = 'info') => {
  window.modalSystem.alert(message, type);
};

window.showNotification = (message, type = 'success') => {
  window.modalSystem.toast(message, type);
};

window.showSuccess = (message) => {
  window.modalSystem.toast(message, 'success');
};

window.showError = (message) => {
  // Ensure message is a valid string
  const validMessage = message && typeof message === 'string' ? message : 'errors.server_error';
  window.modalSystem.toast(validMessage, 'error');
};

window.showWarning = (message) => {
  window.modalSystem.toast(message, 'warning');
};

window.showInfo = (message) => {
  window.modalSystem.toast(message, 'info');
};


/**
 * Show a custom modal dialog
 * Supports two calling conventions:
 * 1. showModal(title, content, footer) - legacy format
 * 2. showModal({ title, content, size, footer }) - object format
 */
window.showModal = function(titleOrOptions, content = '', footer = '') {
  let title, size;
  
  // Support both calling conventions
  if (typeof titleOrOptions === 'object') {
    title = titleOrOptions.title;
    content = titleOrOptions.content;
    size = titleOrOptions.size || 'medium';
    footer = titleOrOptions.footer || '';
  } else {
    title = titleOrOptions;
    size = 'medium';
  }

  const sizeClass = {
    small: 'modal-sm',
    medium: '',
    large: 'modal-lg'
  }[size] || '';

  const modal = document.createElement('div');
  modal.className = 'modal-overlay active';
  modal.id = 'customModal';
  modal.innerHTML = `
    <div class="modal-dialog ${sizeClass}">
      <div class="modal-content">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" onclick="closeCustomModal()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    </div>
  `;

  // Remove existing modal if any
  const existingModal = document.getElementById('customModal');
  if (existingModal) {
    existingModal.remove();
  }

  document.body.appendChild(modal);

  // Close on background click
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeCustomModal();
    }
  };

  // Close on ESC
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeCustomModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
};

/**
 * Close custom modal
 */
window.closeCustomModal = function() {
  const modal = document.getElementById('customModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  }
};
