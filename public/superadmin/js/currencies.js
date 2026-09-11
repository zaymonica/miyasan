/**
 * Currencies Management Module
 */

async function loadCurrencies() {
    const content = document.getElementById('content');
    showLoading(content);

    try {
        const response = await apiRequest('/superadmin/currencies');
        const currencies = response.data.currencies;

        content.innerHTML = `
            <div class="card-header" style="background: white; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h1 style="margin: 0; color: var(--dark);">Currencies</h1>
                    <button class="btn btn-primary" onclick="showCreateCurrencyModal()">
                        <i class="fas fa-plus"></i> Add Currency
                    </button>
                </div>
            </div>

            <div class="card">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Name</th>
                                <th>Symbol</th>
                                <th>Exchange Rate</th>
                                <th>Default</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${currencies.map(currency => `
                                <tr>
                                    <td><strong>${currency.code}</strong></td>
                                    <td>${currency.name}</td>
                                    <td><span style="font-size: 1.25rem;">${currency.symbol}</span></td>
                                    <td>${currency.exchange_rate}</td>
                                    <td>
                                        ${currency.is_default ? '<span class="badge badge-success">Default</span>' : ''}
                                    </td>
                                    <td>
                                        <span class="badge ${currency.active ? 'badge-success' : 'badge-danger'}">
                                            ${currency.active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td>
                                        <button class="btn btn-primary" onclick="editCurrency(${currency.id})" style="padding: 0.375rem 0.75rem;">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-danger" onclick="deleteCurrency(${currency.id}, '${currency.code}', ${currency.is_default})" style="padding: 0.375rem 0.75rem;">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        showError(content, error.message);
    }
}

function showCreateCurrencyModal() {
    const content = `
        <form id="createCurrencyForm">
            <div class="form-group">
                <label class="form-label">Currency Code * (e.g., USD, EUR)</label>
                <input type="text" class="form-control" name="code" required maxlength="3" style="text-transform: uppercase;">
            </div>
            <div class="form-group">
                <label class="form-label">Currency Name *</label>
                <input type="text" class="form-control" name="name" required>
            </div>
            <div class="form-group">
                <label class="form-label">Symbol *</label>
                <input type="text" class="form-control" name="symbol" required maxlength="10">
            </div>
            <div class="form-group">
                <label class="form-label">Exchange Rate (relative to USD)</label>
                <input type="number" class="form-control" name="exchange_rate" step="0.0001" value="1.0000">
            </div>
            <div class="form-group">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                    <input type="checkbox" name="is_default" value="1">
                    <span>Set as default currency</span>
                </label>
            </div>
        </form>
    `;

    const footer = `
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitCreateCurrency()">Add Currency</button>
    `;

    createModal('Add Currency', content, footer);
}

async function submitCreateCurrency() {
    const form = document.getElementById('createCurrencyForm');
    const formData = new FormData(form);
    const data = {
        code: formData.get('code').toUpperCase(),
        name: formData.get('name'),
        symbol: formData.get('symbol'),
        exchange_rate: parseFloat(formData.get('exchange_rate')),
        is_default: formData.get('is_default') === '1'
    };

    try {
        await apiRequest('/superadmin/currencies', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        closeModal();
        showSuccess('Currency added successfully!');
        loadCurrencies();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function editCurrency(id) {
    try {
        const response = await apiRequest('/superadmin/currencies');
        const currency = response.data.currencies.find(c => c.id === id);

        const content = `
            <form id="editCurrencyForm">
                <div class="form-group">
                    <label class="form-label">Currency Code</label>
                    <input type="text" class="form-control" value="${currency.code}" disabled>
                </div>
                <div class="form-group">
                    <label class="form-label">Currency Name</label>
                    <input type="text" class="form-control" name="name" value="${currency.name}">
                </div>
                <div class="form-group">
                    <label class="form-label">Symbol</label>
                    <input type="text" class="form-control" name="symbol" value="${currency.symbol}">
                </div>
                <div class="form-group">
                    <label class="form-label">Exchange Rate</label>
                    <input type="number" class="form-control" name="exchange_rate" step="0.0001" value="${currency.exchange_rate}">
                </div>
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <select class="form-control" name="active">
                        <option value="1" ${currency.active ? 'selected' : ''}>Active</option>
                        <option value="0" ${!currency.active ? 'selected' : ''}>Inactive</option>
                    </select>
                </div>
                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input type="checkbox" name="is_default" value="1" ${currency.is_default ? 'checked' : ''}>
                        <span>Set as default currency</span>
                    </label>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="submitEditCurrency(${id})">Update</button>
        `;

        createModal('Edit Currency', content, footer);
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function submitEditCurrency(id) {
    const form = document.getElementById('editCurrencyForm');
    const formData = new FormData(form);
    const data = {
        name: formData.get('name'),
        symbol: formData.get('symbol'),
        exchange_rate: parseFloat(formData.get('exchange_rate')),
        active: formData.get('active') === '1',
        is_default: formData.get('is_default') === '1'
    };

    try {
        await apiRequest(`/superadmin/currencies/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        closeModal();
        showSuccess('Currency updated successfully!');
        loadCurrencies();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function deleteCurrency(id, code, isDefault) {
    if (isDefault) {
        alert(`Cannot delete default currency "${code}". Please set another currency as default first.`);
        return;
    }

    if (confirm(`Are you sure you want to delete currency "${code}"?`)) {
        apiRequest(`/superadmin/currencies/${id}`, {
            method: 'DELETE'
        }).then(() => {
            showSuccess('Currency deleted successfully!');
            loadCurrencies();
        }).catch(error => {
            alert('Error: ' + error.message);
        });
    }
}
