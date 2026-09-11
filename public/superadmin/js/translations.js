/**
 * Translations Management Module
 * Handles language management, import/export, and default language settings
 */

let translationsState = {
    languages: [],
    defaultLanguage: 'en'
};

/**
 * Load translations page
 */
async function loadTranslations() {
    const content = document.getElementById('content');
    showLoading(content);

    try {
        // Load available languages and default
        await loadLanguagesData();

        content.innerHTML = `
            <div class="page-header">
                <h1><i class="fas fa-language"></i> Language Management</h1>
            </div>

            <!-- Export Template Section -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-download"></i> Export Translation Template</h3>
                </div>
                <div class="card-body" style="padding: 1.5rem;">
                    <p style="color: var(--text-light); margin-bottom: 1rem;">
                        Download the English (en.json) template file with all system strings. 
                        Translate it to your desired language and import it below.
                    </p>
                    <button class="btn btn-primary" onclick="exportEnglishTemplate()">
                        <i class="fas fa-file-export"></i> Export en.json Template
                    </button>
                </div>
            </div>

            <!-- Create New Language Section -->
            <div class="card" style="margin-bottom: 1.5rem;">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-plus-circle"></i> Create New Language</h3>
                </div>
                <div class="card-body" style="padding: 1.5rem;">
                    <div class="form-row">
                        <div class="form-group col-md-3">
                            <label>Language Code *</label>
                            <input type="text" class="form-control" id="newLangCode" placeholder="e.g., es, fr, de" maxlength="5">
                            <small class="form-text">ISO 639-1 code (2-5 chars)</small>
                        </div>
                        <div class="form-group col-md-4">
                            <label>Language Name *</label>
                            <input type="text" class="form-control" id="newLangName" placeholder="e.g., Spanish, French">
                        </div>
                        <div class="form-group col-md-3">
                            <label>Translation File *</label>
                            <input type="file" class="form-control" id="newLangFile" accept=".json">
                        </div>
                        <div class="form-group col-md-2" style="display: flex; align-items: flex-end;">
                            <button class="btn btn-success" onclick="createLanguage()" style="width: 100%;">
                                <i class="fas fa-plus"></i> Create
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Available Languages Section -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title"><i class="fas fa-globe"></i> Available Languages</h3>
                </div>
                <div class="card-body" style="padding: 0;">
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Language</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="languagesTableBody">
                                ${renderLanguagesTable()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        showError(content, error.message);
    }
}

/**
 * Load languages data from server
 */
async function loadLanguagesData() {
    try {
        const response = await apiRequest('/superadmin/languages');
        if (response.success) {
            translationsState.languages = response.data.languages || [];
            translationsState.defaultLanguage = response.data.defaultLanguage || 'en';
        }
    } catch (error) {
        console.error('Error loading languages:', error);
        // Fallback to default
        translationsState.languages = [
            { code: 'en', name: 'English', isDefault: true }
        ];
        translationsState.defaultLanguage = 'en';
    }
}

/**
 * Render languages table
 */
function renderLanguagesTable() {
    if (translationsState.languages.length === 0) {
        return `
            <tr>
                <td colspan="4" style="text-align: center; padding: 2rem; color: var(--text-light);">
                    <i class="fas fa-language" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
                    No languages configured. English (en) is used by default.
                </td>
            </tr>
        `;
    }

    return translationsState.languages.map(lang => `
        <tr>
            <td><code style="font-size: 1rem;">${lang.code}</code></td>
            <td><strong>${lang.name}</strong></td>
            <td>
                ${lang.code === translationsState.defaultLanguage 
                    ? '<span class="badge badge-success"><i class="fas fa-check"></i> Default</span>' 
                    : '<span class="badge badge-secondary">Available</span>'}
            </td>
            <td>
                <div style="display: flex; gap: 0.5rem;">
                    ${lang.code !== translationsState.defaultLanguage ? `
                        <button class="btn btn-primary btn-sm" onclick="setDefaultLanguage('${lang.code}')" title="Set as Default">
                            <i class="fas fa-star"></i> Set Default
                        </button>
                    ` : ''}
                    <button class="btn btn-info btn-sm" onclick="exportLanguage('${lang.code}')" title="Export">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-warning btn-sm" onclick="updateLanguage('${lang.code}', '${lang.name}')" title="Update">
                        <i class="fas fa-upload"></i>
                    </button>
                    ${lang.code !== 'en' ? `
                        <button class="btn btn-danger btn-sm" onclick="deleteLanguage('${lang.code}', '${lang.name}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

/**
 * Export English template
 */
async function exportEnglishTemplate() {
    try {
        const response = await fetch('/locales/en.json');
        if (!response.ok) throw new Error('Failed to load English template');
        
        const data = await response.json();
        downloadJSON(data, 'en-template.json');
        showNotification('English template exported successfully!', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error exporting template: ' + error.message, 'error');
    }
}

/**
 * Export a specific language
 */
async function exportLanguage(code) {
    try {
        const response = await fetch(`/locales/${code}.json`);
        if (!response.ok) throw new Error(`Failed to load ${code} translations`);
        
        const data = await response.json();
        downloadJSON(data, `${code}.json`);
        showNotification(`${code}.json exported successfully!`, 'success');
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error exporting: ' + error.message, 'error');
    }
}

/**
 * Download JSON file
 */
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Create new language
 */
async function createLanguage() {
    const code = document.getElementById('newLangCode').value.trim().toLowerCase();
    const name = document.getElementById('newLangName').value.trim();
    const fileInput = document.getElementById('newLangFile');
    
    if (!code || !name) {
        showNotification('Please enter language code and name', 'error');
        return;
    }
    
    if (code.length < 2 || code.length > 5) {
        showNotification('Language code must be 2-5 characters', 'error');
        return;
    }
    
    if (!fileInput.files || !fileInput.files[0]) {
        showNotification('Please select a translation JSON file', 'error');
        return;
    }
    
    try {
        const file = fileInput.files[0];
        const content = await readFileAsText(file);
        
        // Validate JSON
        let jsonData;
        try {
            jsonData = JSON.parse(content);
        } catch (e) {
            showNotification('Invalid JSON file', 'error');
            return;
        }
        
        // Send to server
        const response = await apiRequest('/superadmin/languages', {
            method: 'POST',
            body: JSON.stringify({
                code,
                name,
                translations: jsonData
            })
        });
        
        if (response.success) {
            showNotification(`Language "${name}" (${code}) created successfully!`, 'success');
            // Clear form
            document.getElementById('newLangCode').value = '';
            document.getElementById('newLangName').value = '';
            document.getElementById('newLangFile').value = '';
            // Reload page
            loadTranslations();
            if (typeof showRestartRequiredModal === 'function') {
                showRestartRequiredModal();
            }
        } else {
            showNotification(response.message || 'Error creating language', 'error');
        }
    } catch (error) {
        console.error('Create language error:', error);
        showNotification('Error creating language: ' + error.message, 'error');
    }
}

/**
 * Update existing language
 */
async function updateLanguage(code, name) {
    const modal = `
        <div class="modal-overlay active" id="updateLangModal" onclick="closeUpdateLangModal(event)">
            <div class="modal-dialog" onclick="event.stopPropagation()">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-upload"></i> Update ${name} (${code})</h3>
                        <button class="modal-close" onclick="closeUpdateLangModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p style="margin-bottom: 1rem; color: var(--text-light);">
                            Upload a new JSON file to update the translations for ${name}.
                        </p>
                        <div class="form-group">
                            <label>Translation File (JSON)</label>
                            <input type="file" class="form-control" id="updateLangFile" accept=".json">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeUpdateLangModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="submitUpdateLanguage('${code}')">
                            <i class="fas fa-save"></i> Update
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('modalContainer').innerHTML = modal;
}

function closeUpdateLangModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('updateLangModal')?.remove();
}

async function submitUpdateLanguage(code) {
    const fileInput = document.getElementById('updateLangFile');
    
    if (!fileInput.files || !fileInput.files[0]) {
        showNotification('Please select a translation JSON file', 'error');
        return;
    }
    
    try {
        const file = fileInput.files[0];
        const content = await readFileAsText(file);
        
        let jsonData;
        try {
            jsonData = JSON.parse(content);
        } catch (e) {
            showNotification('Invalid JSON file', 'error');
            return;
        }
        
        const response = await apiRequest(`/superadmin/languages/${code}`, {
            method: 'PUT',
            body: JSON.stringify({ translations: jsonData })
        });
        
        if (response.success) {
            showNotification(`Language "${code}" updated successfully!`, 'success');
            closeUpdateLangModal();
            loadTranslations();
            if (typeof showRestartRequiredModal === 'function') {
                showRestartRequiredModal();
            }
        } else {
            showNotification(response.message || 'Error updating language', 'error');
        }
    } catch (error) {
        console.error('Update language error:', error);
        showNotification('Error updating language: ' + error.message, 'error');
    }
}

/**
 * Set default language
 */
async function setDefaultLanguage(code) {
    try {
        const response = await apiRequest('/superadmin/languages/default', {
            method: 'PUT',
            body: JSON.stringify({ code })
        });
        
        if (response.success) {
            translationsState.defaultLanguage = code;
            showNotification(`Default language set to "${code}"`, 'success');
            localStorage.setItem('system_default_language', code);
            localStorage.setItem('language', code);
            
            // Update table
            document.getElementById('languagesTableBody').innerHTML = renderLanguagesTable();
            if (typeof showRestartRequiredModal === 'function') {
                showRestartRequiredModal();
            }
        } else {
            showNotification(response.message || 'Error setting default language', 'error');
        }
    } catch (error) {
        console.error('Set default error:', error);
        showNotification('Error setting default language: ' + error.message, 'error');
    }
}

/**
 * Delete language
 */
async function deleteLanguage(code, name) {
    if (!confirm(`Are you sure you want to delete "${name}" (${code})?\n\nThis action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await apiRequest(`/superadmin/languages/${code}`, {
            method: 'DELETE'
        });
        
        if (response.success) {
            showNotification(`Language "${name}" deleted successfully!`, 'success');
            loadTranslations();
        } else {
            showNotification(response.message || 'Error deleting language', 'error');
        }
    } catch (error) {
        console.error('Delete language error:', error);
        showNotification('Error deleting language: ' + error.message, 'error');
    }
}

/**
 * Read file as text
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);
        reader.readAsText(file);
    });
}
