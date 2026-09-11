/**
 * FAQ Management Module
 * Adapted from 2.0 for multi-tenant system
 */

console.log('FAQ.js loaded');

// Global variables
let welcomeMessages = [];
let placeholders = [];
let faqs = [];
let currentEditingFaq = null;
let isRendering = false;

// Register page handler
if (!window.pageHandlers) {
    console.log('pageHandlers not defined, creating it');
    window.pageHandlers = {};
}

window.pageHandlers.faqs = function() {
    console.log('FAQ handler called!');
    loadFAQPage();
};

console.log('FAQ handler registered:', typeof window.pageHandlers.faqs);

// ===== PAGE INITIALIZATION =====

function loadFAQPage() {
    console.log('Loading FAQ page...');
    
    loadWelcomeMessages();
    loadPlaceholders();
    loadFaqs();
    
    console.log('FAQ page loaded');
}

// ===== WELCOME MESSAGES =====

async function loadWelcomeMessages() {
    try {
        console.log('Loading welcome messages...');
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/faqs/welcome-messages', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('Welcome messages response status:', response.status);
        
        if (response.ok) {
            welcomeMessages = await response.json();
            console.log('Welcome messages loaded:', welcomeMessages);
            renderWelcomeMessages();
            updateMobilePreview();
        } else {
            console.error('Failed to load welcome messages:', response.status, response.statusText);
            // Initialize with empty messages if API fails
            welcomeMessages = [];
            renderWelcomeMessages();
        }
    } catch (error) {
        console.error('Error loading welcome messages:', error);
        // Initialize with empty messages if error
        welcomeMessages = [];
        renderWelcomeMessages();
    }
}

function renderWelcomeMessages() {
    // Prevent multiple simultaneous renders
    if (isRendering) {
        console.log('Already rendering, skipping...');
        return;
    }
    
    isRendering = true;
    console.log('renderWelcomeMessages called');
    
    const container = document.getElementById('welcomeMessages');
    console.log('Container found:', !!container);
    
    if (!container) {
        console.error('welcomeMessages container not found!');
        isRendering = false;
        return;
    }
    
    container.innerHTML = '';
    
    // Ensure at least 3 default messages
    while (welcomeMessages.length < 3) {
        welcomeMessages.push({ message_text: '', order_position: welcomeMessages.length + 1 });
    }
    
    console.log('Rendering', welcomeMessages.length, 'messages');
    
    welcomeMessages.forEach((message, index) => {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = 'margin-bottom: 15px; padding: 15px; border: 2px solid #e0e0e0; border-radius: 8px; background: #fafafa;';
        messageDiv.innerHTML = `
            <strong data-i18n="faqs.welcome_msg${index + 1}" style="display: block; margin-bottom: 10px;">Message ${index + 1}</strong>
            <textarea 
                id="welcomeMsg${index + 1}"
                data-i18n-placeholder="faqs.welcome_msg${index + 1}_placeholder"
                placeholder="Enter message ${index + 1}..."
                style="width: 100%; min-height: 80px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; font-family: inherit;"
                oninput="updateMobilePreview()"
            >${message.message_text || ''}</textarea>
            <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px;">
                <span onclick="insertPlaceholderDirect(${index + 1}, '{{customer_name}}')" style="cursor: pointer; background: #e3f2fd; padding: 4px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #90caf9;" title="Nome do contato do WhatsApp">{{customer_name}}</span>
                <span onclick="insertPlaceholderDirect(${index + 1}, '{{current_date}}')" style="cursor: pointer; background: #e3f2fd; padding: 4px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #90caf9;" title="Data atual">{{current_date}}</span>
                <span onclick="insertPlaceholderDirect(${index + 1}, '{{current_time}}')" style="cursor: pointer; background: #e3f2fd; padding: 4px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #90caf9;" title="Hora atual">{{current_time}}</span>
            </div>
        `;
        container.appendChild(messageDiv);
    });
    
    console.log('Messages rendered successfully');
    isRendering = false;
}

async function saveWelcomeMessages() {
    try {
        const token = localStorage.getItem('token');
        
        // Collect messages from inputs
        const messages = [];
        for (let i = 1; i <= 3; i++) {
            const input = document.getElementById(`welcomeMsg${i}`);
            if (input && input.value.trim()) {
                messages.push({ text: input.value.trim() });
            }
        }
        
        const response = await fetch('/api/tenant/faqs/welcome-messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ messages })
        });
        
        if (response.ok) {
            showNotification('Welcome messages saved successfully!', 'success');
            loadWelcomeMessages();
        } else {
            throw new Error('Error saving messages');
        }
    } catch (error) {
        console.error('Error saving messages:', error);
        showNotification('Error saving welcome messages', 'error');
    }
}

// ===== PLACEHOLDERS =====

async function loadPlaceholders() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/faqs/placeholders', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            placeholders = await response.json();
            renderPlaceholders();
        }
    } catch (error) {
        console.error('Error loading placeholders:', error);
    }
}

function renderPlaceholders() {
    const container = document.getElementById('placeholdersList');
    if (!container) return;
    
    container.innerHTML = '';
    
    placeholders.forEach(placeholder => {
        const placeholderDiv = document.createElement('div');
        placeholderDiv.style.cssText = 'cursor: pointer; background: #e3f2fd; padding: 8px 12px; border-radius: 4px; font-size: 12px; border: 1px solid #90caf9; transition: all 0.2s;';
        placeholderDiv.onmouseover = function() { this.style.background = '#bbdefb'; };
        placeholderDiv.onmouseout = function() { this.style.background = '#e3f2fd'; };
        placeholderDiv.onclick = () => insertPlaceholder(placeholder.placeholder_key);
        placeholderDiv.innerHTML = `
            <div style="font-weight: bold;">${placeholder.placeholder_key}</div>
            <div style="font-size: 10px; color: #666;">${placeholder.placeholder_value}</div>
        `;
        container.appendChild(placeholderDiv);
    });
}

function insertPlaceholder(placeholderKey) {
    const activeInput = document.activeElement;
    if (activeInput && (activeInput.tagName === 'INPUT' || activeInput.tagName === 'TEXTAREA')) {
        const cursorPos = activeInput.selectionStart;
        const textBefore = activeInput.value.substring(0, cursorPos);
        const textAfter = activeInput.value.substring(activeInput.selectionEnd);
        
        activeInput.value = textBefore + placeholderKey + textAfter;
        activeInput.focus();
        activeInput.setSelectionRange(cursorPos + placeholderKey.length, cursorPos + placeholderKey.length);
        
        activeInput.dispatchEvent(new Event('input'));
        updateMobilePreview();
    } else {
        navigator.clipboard.writeText(placeholderKey);
        showNotification(`Placeholder ${placeholderKey} copied!`, 'info');
    }
}

function insertPlaceholderDirect(messageIndex, placeholderKey) {
    const input = document.getElementById(`welcomeMsg${messageIndex}`);
    if (input) {
        const cursorPos = input.selectionStart || input.value.length;
        const textBefore = input.value.substring(0, cursorPos);
        const textAfter = input.value.substring(cursorPos);
        
        input.value = textBefore + placeholderKey + textAfter;
        input.focus();
        input.setSelectionRange(cursorPos + placeholderKey.length, cursorPos + placeholderKey.length);
        
        updateMobilePreview();
    }
}

function insertPlaceholderToAnswer(placeholderKey) {
    const input = document.getElementById('faqAnswer');
    if (input) {
        const cursorPos = input.selectionStart || input.value.length;
        const textBefore = input.value.substring(0, cursorPos);
        const textAfter = input.value.substring(cursorPos);
        
        input.value = textBefore + placeholderKey + textAfter;
        input.focus();
        input.setSelectionRange(cursorPos + placeholderKey.length, cursorPos + placeholderKey.length);
    }
}

// ===== FAQs =====

async function loadFaqs() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/tenant/faqs', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            faqs = result.data || result;
            renderFaqs();
        }
    } catch (error) {
        console.error('Error loading FAQs:', error);
    }
}

function renderFaqs() {
    const container = document.getElementById('faqsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (faqs.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;" data-i18n="faqs.no_faqs">No FAQs created yet. Click "Add FAQ" to create one.</p>';
        return;
    }
    
    faqs.forEach(faq => {
        const faqDiv = document.createElement('div');
        faqDiv.style.cssText = 'margin-bottom: 15px; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;';
        faqDiv.innerHTML = `
            <div style="padding: 15px; background: #f9f9f9; cursor: pointer; display: flex; align-items: center; justify-content: space-between;" onclick="toggleFaqContent(${faq.id})">
                <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                    <div style="font-size: 24px;">${faq.emoji || '❓'}</div>
                    <div style="font-weight: bold;">${faq.question}</div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-sm btn-primary" onclick="editFaq(${faq.id}); event.stopPropagation();" data-i18n="btn.edit">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteFaq(${faq.id}); event.stopPropagation();" data-i18n="btn.delete">Delete</button>
                    <button class="btn btn-sm btn-info" onclick="testFaq(${faq.id}); event.stopPropagation();" data-i18n="faqs.test">Test</button>
                </div>
            </div>
            <div id="faq-content-${faq.id}" style="display: none; padding: 15px; background: white;">
                <p><strong data-i18n="faqs.answer">Answer:</strong> ${faq.answer}</p>
                ${faq.reaction_time ? `<p><strong data-i18n="faqs.reaction_time">Reaction Time:</strong> ${faq.reaction_time}s</p>` : ''}
                ${faq.response_time ? `<p><strong data-i18n="faqs.response_time">Response Time:</strong> ${faq.response_time}s</p>` : ''}
                ${faq.schedule_hours ? `<p><strong data-i18n="faqs.schedule_hours">Schedule:</strong> ${faq.schedule_hours}</p>` : ''}
                ${faq.schedule_days ? `<p><strong data-i18n="faqs.schedule_days">Days:</strong> ${faq.schedule_days}</p>` : ''}
            </div>
        `;
        container.appendChild(faqDiv);
    });
}

function toggleFaqContent(faqId) {
    const content = document.getElementById(`faq-content-${faqId}`);
    if (content) {
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
    }
}

function showAddFaqModal() {
    currentEditingFaq = null;
    
    // Create modal
    const modal = createFaqModal();
    document.body.appendChild(modal);
}

function editFaq(faqId) {
    const faq = faqs.find(f => f.id === faqId);
    if (!faq) return;
    
    currentEditingFaq = faq;
    
    // Create modal with data
    const modal = createFaqModal(faq);
    document.body.appendChild(modal);
}

function createFaqModal(faq = null) {
    const modal = document.createElement('div');
    modal.id = 'faqModal';
    modal.style.cssText = 'position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;';
    
    // Escape HTML for safe display in attributes
    const escapeHtml = (text) => {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };
    
    modal.innerHTML = `
        <div style="background: white; padding: 30px; border-radius: 10px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto;">
            <h2 data-i18n="faqs.${faq ? 'edit' : 'add'}">${faq ? 'Edit FAQ' : 'Add FAQ'}</h2>
            <form id="faqForm" onsubmit="handleFaqSubmit(event)">
                <div style="margin-bottom: 15px;">
                    <label data-i18n="faqs.question">Question:</label>
                    <input type="text" id="faqQuestion" value="${faq ? escapeHtml(faq.question) : ''}" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label data-i18n="faqs.answer">Answer:</label>
                    <textarea id="faqAnswer" required style="width: 100%; min-height: 100px; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">${faq ? escapeHtml(faq.answer) : ''}</textarea>
                    <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px;">
                        <span onclick="insertPlaceholderToAnswer('{{customer_name}}')" style="cursor: pointer; background: #e3f2fd; padding: 4px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #90caf9;" title="Nome do contato do WhatsApp">{{customer_name}}</span>
                        <span onclick="insertPlaceholderToAnswer('{{current_date}}')" style="cursor: pointer; background: #e3f2fd; padding: 4px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #90caf9;" title="Data atual">{{current_date}}</span>
                        <span onclick="insertPlaceholderToAnswer('{{current_time}}')" style="cursor: pointer; background: #e3f2fd; padding: 4px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #90caf9;" title="Hora atual">{{current_time}}</span>
                    </div>
                </div>
                <div style="margin-bottom: 15px;">
                    <label data-i18n="faqs.emoji">Emoji:</label>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="text" id="faqEmoji" value="${faq ? faq.emoji || '' : ''}" maxlength="2" style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" placeholder="Select or type emoji">
                        <button type="button" onclick="showEmojiPicker()" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            😀 Pick Emoji
                        </button>
                    </div>
                    <div id="emojiPickerContainer" style="display: none; margin-top: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 4px; background: white; max-height: 200px; overflow-y: auto;">
                        <div style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px;">
                            ${['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤝','💪','🙏','✍️','💅','🤳','💃','🕺','👯','🧘','🛀','🛌','👨','👩','👶','👧','👦','👴','👵','🙋','🙆','🙅','🤷','🤦','💁','🙇','🙎','🙍','💇','💆','🧖','💅','🤱','🤰','🧑','👱','👨','👩','🧔','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🙇','🤦','🤷','💆','💇','🚶','🏃','💃','🕺','👯','🧖','🧗','🧘','🛀','🛌','🕴️','🗣️','👤','👥','👣','🐵','🐒','🦍','🦧','🐶','🐕','🦮','🐕‍🦺','🐩','🐺','🦊','🦝','🐱','🐈','🦁','🐯','🐅','🐆','🐴','🐎','🦄','🦓','🦌','🐮','🐂','🐃','🐄','🐷','🐖','🐗','🐽','🐏','🐑','🐐','🐪','🐫','🦙','🦒','🐘','🦏','🦛','🐭','🐁','🐀','🐹','🐰','🐇','🐿️','🦔','🦇','🐻','🐨','🐼','🦥','🦦','🦨','🦘','🦡','🐾','🦃','🐔','🐓','🐣','🐤','🐥','🐦','🐧','🕊️','🦅','🦆','🦢','🦉','🦩','🦚','🦜','🐸','🐊','🐢','🦎','🐍','🐲','🐉','🦕','🦖','🐳','🐋','🐬','🐟','🐠','🐡','🦈','🐙','🐚','🐌','🦋','🐛','🐜','🐝','🐞','🦗','🕷️','🕸️','🦂','🦟','🦠','💐','🌸','💮','🏵️','🌹','🥀','🌺','🌻','🌼','🌷','🌱','🌲','🌳','🌴','🌵','🌾','🌿','☘️','🍀','🍁','🍂','🍃','🍇','🍈','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🥝','🍅','🥥','🥑','🍆','🥔','🥕','🌽','🌶️','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🌰','🍞','🥐','🥖','🥨','🥯','🥞','🧇','🧀','🍖','🍗','🥩','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🥙','🧆','🥚','🍳','🥘','🍲','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🍵','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🥤','🧃','🧉','🧊','🥢','🍽️','🍴','🥄','🔪','🏺'].map(e => `<span onclick="selectEmoji('${e}')" style="font-size: 24px; cursor: pointer; padding: 5px; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='transparent'">${e}</span>`).join('')}
                        </div>
                    </div>
                </div>
                <div style="margin-bottom: 15px;">
                    <label data-i18n="faqs.reaction_time">Reaction Time (seconds):</label>
                    <input type="number" id="faqReactionTime" value="${faq ? faq.reaction_time || 3 : 3}" min="0" max="60" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label data-i18n="faqs.response_time">Response Time (seconds):</label>
                    <input type="number" id="faqResponseTime" value="${faq ? faq.response_time || 7 : 7}" min="0" max="60" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label data-i18n="faqs.schedule_hours">Schedule Hours:</label>
                    <input type="text" id="faqScheduleHours" value="${faq ? faq.schedule_hours || '08:00-18:00' : '08:00-18:00'}" placeholder="08:00-18:00" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label data-i18n="faqs.schedule_days">Active Days:</label>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;">
                        ${['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
                            const checked = faq && faq.schedule_days && faq.schedule_days.includes(day) ? 'checked' : '';
                            return `<label style="display: flex; align-items: center; gap: 5px;"><input type="checkbox" id="day_${day}" value="${day}" ${checked}> <span data-i18n="days.${day}">${day}</span></label>`;
                        }).join('')}
                    </div>
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" onclick="closeFaqModal()" data-i18n="btn.cancel">Cancel</button>
                    <button type="submit" class="btn btn-primary" data-i18n="btn.save">Save</button>
                </div>
            </form>
        </div>
    `;
    
    return modal;
}

async function handleFaqSubmit(e) {
    e.preventDefault();
    
    const selectedDays = [];
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach(day => {
        const checkbox = document.getElementById(`day_${day}`);
        if (checkbox && checkbox.checked) {
            selectedDays.push(day);
        }
    });
    
    const question = document.getElementById('faqQuestion').value.trim();
    const answer = document.getElementById('faqAnswer').value.trim();
    
    // Validação no frontend
    if (!question || question.length < 5) {
        showNotification('A pergunta deve ter pelo menos 5 caracteres', 'error');
        return;
    }
    
    if (!answer || answer.length < 10) {
        showNotification('A resposta deve ter pelo menos 10 caracteres', 'error');
        return;
    }
    
    if (question.length > 500) {
        showNotification('A pergunta não pode ter mais de 500 caracteres', 'error');
        return;
    }
    
    const faqData = {
        question: question,
        answer: answer,
        emoji: document.getElementById('faqEmoji').value,
        reaction_time: parseInt(document.getElementById('faqReactionTime').value),
        response_time: parseInt(document.getElementById('faqResponseTime').value),
        schedule_hours: document.getElementById('faqScheduleHours').value,
        schedule_days: selectedDays.join(',')
    };
    
    console.log('Enviando FAQ:', faqData); // Debug
    
    try {
        const token = localStorage.getItem('token');
        const url = currentEditingFaq ? `/api/tenant/faqs/${currentEditingFaq.id}` : '/api/tenant/faqs';
        const method = currentEditingFaq ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(faqData)
        });
        
        if (response.ok) {
            showNotification('FAQ saved successfully!', 'success');
            closeFaqModal();
            loadFaqs();
        } else {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error || `Error ${response.status}: ${response.statusText}`;
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error('Error saving FAQ:', error);
        showNotification(error.message || 'Error saving FAQ', 'error');
    }
}

async function deleteFaq(faqId) {
    if (!confirm('Are you sure you want to delete this FAQ?')) return;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/tenant/faqs/${faqId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            showNotification('FAQ deleted successfully!', 'success');
            loadFaqs();
        } else {
            throw new Error('Error deleting FAQ');
        }
    } catch (error) {
        console.error('Error deleting FAQ:', error);
        showNotification('Error deleting FAQ', 'error');
    }
}

function closeFaqModal() {
    const modal = document.getElementById('faqModal');
    if (modal) {
        modal.remove();
    }
    currentEditingFaq = null;
}

// ===== MOBILE PREVIEW =====

let previewTimeout = null;

function updateMobilePreview() {
    // Clear any pending preview update
    if (previewTimeout) {
        clearTimeout(previewTimeout);
    }
    
    // Debounce the preview update
    previewTimeout = setTimeout(() => {
        const chatContainer = document.getElementById('mobileChat');
        if (!chatContainer) return;
        
        chatContainer.innerHTML = '';
        
        // Show welcome messages
        const messages = [];
        for (let i = 1; i <= 3; i++) {
            const input = document.getElementById(`welcomeMsg${i}`);
            if (input && input.value.trim()) {
                messages.push(input.value.trim());
            }
        }
        
        if (messages.length === 0) {
            chatContainer.innerHTML = '<div style="text-align: center; color: #666; font-size: 12px; padding: 10px;" data-i18n="faqs.welcome_preview_empty">Messages will appear here as you type</div>';
            return;
        }
        
        // Display messages without animation to avoid duplication
        messages.forEach((message, index) => {
            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = 'background: white; padding: 10px; border-radius: 8px; max-width: 80%; align-self: flex-start; box-shadow: 0 1px 2px rgba(0,0,0,0.1); margin-bottom: 8px;';
            messageDiv.textContent = processPlaceholdersForPreview(message);
            chatContainer.appendChild(messageDiv);
        });
        
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 300); // Wait 300ms after last keystroke
}

function processPlaceholdersForPreview(text) {
    let processed = text;
    
    // {{customer_name}} - Nome do contato do WhatsApp
    processed = processed.replace(/\{\{customer_name\}\}/g, 'João Silva');
    
    // {{current_date}} e {{current_time}} - Data e hora separados
    processed = processed.replace(/\{\{current_date\}\}/g, new Date().toLocaleDateString('pt-BR'));
    processed = processed.replace(/\{\{current_time\}\}/g, new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    
    processed = processed.replace(/\{\{business_hours\}\}/g, '08:00 às 18:00');
    processed = processed.replace(/\{\{store_phone\}\}/g, '(11) 99999-9999');
    processed = processed.replace(/\{\{store_address\}\}/g, 'Rua Principal, 123');
    
    return processed;
}

async function testFaq(faqId) {
    const faq = faqs.find(f => f.id === faqId);
    if (!faq) return;
    
    const chatContainer = document.getElementById('mobileChat');
    if (!chatContainer) return;
    
    chatContainer.innerHTML = '';
    
    // User question
    const userMessage = document.createElement('div');
    userMessage.style.cssText = 'background: #dcf8c6; padding: 10px; border-radius: 8px; max-width: 80%; align-self: flex-end; margin-left: auto; box-shadow: 0 1px 2px rgba(0,0,0,0.1);';
    userMessage.textContent = faq.question;
    chatContainer.appendChild(userMessage);
    
    // Reaction emoji
    if (faq.emoji && faq.reaction_time) {
        setTimeout(() => {
            const reactionDiv = document.createElement('div');
            reactionDiv.style.cssText = 'font-size: 32px; text-align: center; padding: 10px;';
            reactionDiv.textContent = faq.emoji;
            chatContainer.appendChild(reactionDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }, faq.reaction_time * 1000);
    }
    
    // Typing indicator
    const typingDelay = (faq.reaction_time || 0) + 1;
    setTimeout(() => {
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typingIndicator';
        typingDiv.style.cssText = 'background: white; padding: 10px; border-radius: 8px; max-width: 60px; align-self: flex-start; box-shadow: 0 1px 2px rgba(0,0,0,0.1);';
        typingDiv.innerHTML = '<div style="display: flex; gap: 4px;"><div style="width: 8px; height: 8px; background: #999; border-radius: 50%; animation: typing 1s infinite;"></div><div style="width: 8px; height: 8px; background: #999; border-radius: 50%; animation: typing 1s infinite 0.2s;"></div><div style="width: 8px; height: 8px; background: #999; border-radius: 50%; animation: typing 1s infinite 0.4s;"></div></div>';
        chatContainer.appendChild(typingDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Response
        setTimeout(() => {
            typingDiv.remove();
            
            const responseDiv = document.createElement('div');
            responseDiv.style.cssText = 'background: white; padding: 10px; border-radius: 8px; max-width: 80%; align-self: flex-start; box-shadow: 0 1px 2px rgba(0,0,0,0.1);';
            responseDiv.textContent = processPlaceholdersForPreview(faq.answer);
            chatContainer.appendChild(responseDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }, (faq.response_time || 5) * 1000);
        
    }, typingDelay * 1000);
}

// ===== UTILITIES =====

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 5px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    const colors = {
        success: '#4CAF50',
        error: '#f44336',
        info: '#2196F3',
        warning: '#FF9800'
    };
    
    notification.style.backgroundColor = colors[type] || colors.info;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    
    @keyframes typing {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-10px); }
    }
`;
document.head.appendChild(style);

console.log('FAQ module fully loaded');


// ===== EMOJI PICKER =====

function showEmojiPicker() {
    const container = document.getElementById('emojiPickerContainer');
    if (container) {
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    }
}

function selectEmoji(emoji) {
    const input = document.getElementById('faqEmoji');
    if (input) {
        input.value = emoji;
    }
    const container = document.getElementById('emojiPickerContainer');
    if (container) {
        container.style.display = 'none';
    }
}
