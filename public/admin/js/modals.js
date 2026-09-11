/**
 * Modal System - Custom modals (NO Chrome alerts)
 */

class Modal {
  static show(options) {
    const {
      title = '',
      message = '',
      type = 'info',
      buttons = [],
      onClose = null
    } = options;

    // Translate if i18n is available
    let displayTitle = title;
    let displayMessage = message;
    
    if (typeof i18n !== 'undefined' && i18n.t) {
      const translatedTitle = i18n.t(title);
      const translatedMessage = i18n.t(message);
      
      // Only use translation if it's different from the key (meaning it was found)
      if (translatedTitle && translatedTitle !== title) {
        displayTitle = translatedTitle;
      }
      if (translatedMessage && translatedMessage !== message) {
        displayMessage = translatedMessage;
      }
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-dialog modal-${type}">
        <div class="modal-header">
          <h3>${displayTitle}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <p>${displayMessage}</p>
        </div>
        <div class="modal-footer">
          ${buttons.map((btn, idx) => {
            let btnText = btn.text;
            if (typeof i18n !== 'undefined' && i18n.t) {
              const translated = i18n.t(btn.text);
              if (translated && translated !== btn.text) {
                btnText = translated;
              }
            }
            return `
              <button class="btn ${btn.class}" data-action="${idx}">
                <span>${btnText}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;

    buttons.forEach((btn, idx) => {
      const btnEl = modal.querySelector(`[data-action="${idx}"]`);
      btnEl.onclick = () => {
        if (btn.action) btn.action();
        modal.remove();
        if (onClose) onClose();
      };
    });

    document.body.appendChild(modal);
    return modal;
  }

  static confirm(title, message, onConfirm) {
    return Modal.show({
      title,
      message,
      type: 'warning',
      buttons: [
        { text: 'common.cancel', class: 'btn-secondary' },
        { text: 'common.confirm', class: 'btn-primary', action: onConfirm }
      ]
    });
  }

  static alert(title, message, type = 'info') {
    return Modal.show({
      title,
      message,
      type,
      buttons: [
        { text: 'common.close', class: 'btn-primary' }
      ]
    });
  }

  static form(options) {
    const {
      title = '',
      fields = [],
      onSubmit = null,
      submitText = 'common.save',
      cancelText = 'common.cancel'
    } = options;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 data-i18n="${title}">${i18n.t(title)}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <form class="modal-body" id="modalForm">
          ${fields.map(field => `
            <div class="form-group">
              <label data-i18n="${field.label}">${i18n.t(field.label)}</label>
              ${field.type === 'textarea' ? `
                <textarea 
                  name="${field.name}" 
                  ${field.required ? 'required' : ''}
                  data-i18n-placeholder="${field.placeholder || ''}"
                  placeholder="${field.placeholder ? i18n.t(field.placeholder) : ''}"
                >${field.value || ''}</textarea>
              ` : field.type === 'select' ? `
                <select name="${field.name}" ${field.required ? 'required' : ''}>
                  ${field.options.map(opt => `
                    <option value="${opt.value}" ${opt.value === field.value ? 'selected' : ''}>
                      ${opt.label}
                    </option>
                  `).join('')}
                </select>
              ` : `
                <input 
                  type="${field.type || 'text'}" 
                  name="${field.name}" 
                  value="${field.value || ''}"
                  ${field.required ? 'required' : ''}
                  data-i18n-placeholder="${field.placeholder || ''}"
                  placeholder="${field.placeholder ? i18n.t(field.placeholder) : ''}"
                />
              `}
            </div>
          `).join('')}
        </form>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
            <span data-i18n="${cancelText}">${i18n.t(cancelText)}</span>
          </button>
          <button class="btn btn-primary" id="modalSubmit">
            <span data-i18n="${submitText}">${i18n.t(submitText)}</span>
          </button>
        </div>
      </div>
    `;

    const form = modal.querySelector('#modalForm');
    const submitBtn = modal.querySelector('#modalSubmit');

    submitBtn.onclick = (e) => {
      e.preventDefault();
      if (form.checkValidity()) {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);
        if (onSubmit) onSubmit(data);
        modal.remove();
      } else {
        form.reportValidity();
      }
    };

    document.body.appendChild(modal);
    return modal;
  }

  static prompt(title, message, defaultValue = '', onSubmit) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    
    let displayTitle = title;
    let displayMessage = message;
    
    if (typeof i18n !== 'undefined' && i18n.t) {
      const translatedTitle = i18n.t(title);
      const translatedMessage = i18n.t(message);
      
      if (translatedTitle && translatedTitle !== title) {
        displayTitle = translatedTitle;
      }
      if (translatedMessage && translatedMessage !== message) {
        displayMessage = translatedMessage;
      }
    }
    
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>${displayTitle}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <form class="modal-body" id="promptForm">
          <p style="margin-bottom: 15px;">${displayMessage}</p>
          <div class="form-group">
            <input 
              type="text" 
              id="promptInput" 
              class="form-control"
              value="${defaultValue}"
              required
              autofocus
            />
          </div>
        </form>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">
            <span data-i18n="common.cancel">Cancel</span>
          </button>
          <button class="btn btn-primary" id="promptSubmit">
            <span data-i18n="common.confirm">Confirm</span>
          </button>
        </div>
      </div>
    `;

    const form = modal.querySelector('#promptForm');
    const input = modal.querySelector('#promptInput');
    const submitBtn = modal.querySelector('#promptSubmit');

    const handleSubmit = (e) => {
      if (e) e.preventDefault();
      const value = input.value.trim();
      if (value) {
        if (onSubmit) onSubmit(value);
        modal.remove();
      } else {
        input.focus();
      }
    };

    submitBtn.onclick = handleSubmit;
    form.onsubmit = handleSubmit;

    document.body.appendChild(modal);
    
    // Focus input after a small delay to ensure modal is rendered
    setTimeout(() => input.focus(), 100);
    
    return modal;
  }
}
