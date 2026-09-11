/**
 * API Client for Tenant Panel
 */

class API {
  constructor() {
    this.baseURL = '/api/tenant';
    this.token = localStorage.getItem('token');
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return headers;
  }

  async handleResponse(response) {
    const data = await response.json();
    
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }
      throw new Error(data.error || data.message || 'API request failed');
    }
    
    // Return the data object if success is true, otherwise throw error
    if (data.success === false) {
      throw new Error(data.error || data.message || 'Request failed');
    }
    
    return data;
  }

  async get(endpoint, params = {}) {
    const url = new URL(`${window.location.origin}${this.baseURL}${endpoint}`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const response = await fetch(url, { method: 'GET', headers: this.getHeaders() });
    return this.handleResponse(response);
  }

  async post(endpoint, data = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(response);
  }

  async put(endpoint, data = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data)
    });
    return this.handleResponse(response);
  }

  async delete(endpoint) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    return this.handleResponse(response);
  }

  // Stores
  async getStores() { return this.get('/stores'); }
  async getStore(id) { return this.get(`/stores/${id}`); }
  async createStore(data) { return this.post('/stores', data); }
  async updateStore(id, data) { return this.put(`/stores/${id}`, data); }
  async deleteStore(id) { return this.delete(`/stores/${id}`); }

  // Departments
  async getDepartments() { return this.get('/departments'); }
  async getDepartment(id) { return this.get(`/departments/${id}`); }
  async createDepartment(data) { return this.post('/departments', data); }
  async updateDepartment(id, data) { return this.put(`/departments/${id}`, data); }
  async deleteDepartment(id) { return this.delete(`/departments/${id}`); }

  // Users
  async getUsers(params = {}) { return this.get('/users', params); }
  async getUser(id) { return this.get(`/users/${id}`); }
  async createUser(data) { return this.post('/users', data); }
  async updateUser(id, data) { return this.put(`/users/${id}`, data); }
  async deleteUser(id) { return this.delete(`/users/${id}`); }
  async toggleUserActive(id) { return this.put(`/users/${id}/toggle-active`); }

  // Dashboard
  async getDashboard() { return this.get('/dashboard'); }
  async getHourlyMessages() { return this.get('/dashboard/hourly-messages'); }

  // Conversations
  async getConversations(params = {}) { return this.get('/conversations', params); }
  async getConversation(id) { return this.get(`/conversations/${id}`); }
  async getConversationStats() { return this.get('/conversations/stats'); }

  // Contacts
  async getContacts(params = {}) { return this.get('/contacts', params); }
  async getContact(id) { return this.get(`/contacts/${id}`); }
  async createContact(data) { return this.post('/contacts', data); }
  async updateContact(id, data) { return this.put(`/contacts/${id}`, data); }
  async deleteContact(id) { return this.delete(`/contacts/${id}`); }
  async importContacts(data) { return this.post('/contacts/import', data); }

  // Contact Groups
  async getContactGroups() { return this.get('/contact-groups'); }
  async createContactGroup(data) { return this.post('/contact-groups', data); }
  async updateContactGroup(id, data) { return this.put(`/contact-groups/${id}`, data); }
  async deleteContactGroup(id) { return this.delete(`/contact-groups/${id}`); }
}

const api = new API();
