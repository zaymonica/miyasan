/**
 * Store Controller Unit Tests
 * 
 * Tests for store management functionality
 * Ensures tenant isolation and proper CRUD operations
 */

const StoreController = require('../../../controllers/StoreController');
const Store = require('../../../models/Store');

// Mock the Store model
jest.mock('../../../models/Store');

describe('StoreController', () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock request object
    req = {
      user: {
        id: 1,
        tenant_id: 1,
        role: 'admin'
      },
      params: {},
      body: {},
      query: {}
    };

    // Mock response object
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getStores', () => {
    it('should return all stores for tenant', async () => {
      const mockStores = [
        { id: 1, tenant_id: 1, name: 'Store 1', user_count: 5 },
        { id: 2, tenant_id: 1, name: 'Store 2', user_count: 3 }
      ];

      Store.findByTenant.mockResolvedValue(mockStores);

      await StoreController.getStores(req, res);

      expect(Store.findByTenant).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockStores
      });
    });

    it('should handle errors gracefully', async () => {
      Store.findByTenant.mockRejectedValue(new Error('Database error'));

      await StoreController.getStores(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to fetch stores',
        error: 'Database error'
      });
    });
  });

  describe('getStore', () => {
    it('should return single store', async () => {
      const mockStore = { id: 1, tenant_id: 1, name: 'Store 1', user_count: 5 };
      req.params.id = '1';

      Store.findById.mockResolvedValue(mockStore);

      await StoreController.getStore(req, res);

      expect(Store.findById).toHaveBeenCalledWith('1', 1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockStore
      });
    });

    it('should return 404 if store not found', async () => {
      req.params.id = '999';
      Store.findById.mockResolvedValue(null);

      await StoreController.getStore(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Store not found'
      });
    });
  });

  describe('createStore', () => {
    it('should create new store successfully', async () => {
      const storeData = {
        name: 'New Store',
        description: 'Test store',
        address: '123 Main St',
        phone: '1234567890',
        email: 'store@test.com'
      };

      req.body = storeData;

      const mockCreatedStore = { id: 1, tenant_id: 1, ...storeData };

      Store.nameExists.mockResolvedValue(false);
      Store.create.mockResolvedValue(mockCreatedStore);

      await StoreController.createStore(req, res);

      expect(Store.nameExists).toHaveBeenCalledWith('New Store', 1);
      expect(Store.create).toHaveBeenCalledWith(storeData, 1);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Store created successfully',
        data: mockCreatedStore
      });
    });

    it('should reject duplicate store name', async () => {
      req.body = { name: 'Existing Store' };

      Store.nameExists.mockResolvedValue(true);

      await StoreController.createStore(req, res);

      expect(Store.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Store name already exists'
      });
    });
  });

  describe('updateStore', () => {
    it('should update store successfully', async () => {
      const storeData = {
        name: 'Updated Store',
        description: 'Updated description'
      };

      req.params.id = '1';
      req.body = storeData;

      const mockExistingStore = { id: 1, tenant_id: 1, name: 'Old Name' };
      const mockUpdatedStore = { id: 1, tenant_id: 1, ...storeData };

      Store.findById.mockResolvedValue(mockExistingStore);
      Store.nameExists.mockResolvedValue(false);
      Store.update.mockResolvedValue(mockUpdatedStore);

      await StoreController.updateStore(req, res);

      expect(Store.findById).toHaveBeenCalledWith('1', 1);
      expect(Store.nameExists).toHaveBeenCalledWith('Updated Store', 1, '1');
      expect(Store.update).toHaveBeenCalledWith('1', storeData, 1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Store updated successfully',
        data: mockUpdatedStore
      });
    });

    it('should return 404 if store not found', async () => {
      req.params.id = '999';
      req.body = { name: 'Updated Store' };

      Store.findById.mockResolvedValue(null);

      await StoreController.updateStore(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Store not found'
      });
    });
  });

  describe('deleteStore', () => {
    it('should delete store successfully', async () => {
      req.params.id = '1';

      const mockStore = { id: 1, tenant_id: 1, name: 'Store 1', user_count: 0 };

      Store.findById.mockResolvedValue(mockStore);
      Store.delete.mockResolvedValue(true);

      await StoreController.deleteStore(req, res);

      expect(Store.findById).toHaveBeenCalledWith('1', 1);
      expect(Store.delete).toHaveBeenCalledWith('1', 1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Store deleted successfully'
      });
    });

    it('should prevent deletion of store with users', async () => {
      req.params.id = '1';

      const mockStore = { id: 1, tenant_id: 1, name: 'Store 1', user_count: 5 };

      Store.findById.mockResolvedValue(mockStore);

      await StoreController.deleteStore(req, res);

      expect(Store.delete).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cannot delete store with assigned users. Please reassign users first.'
      });
    });

    it('should return 404 if store not found', async () => {
      req.params.id = '999';

      Store.findById.mockResolvedValue(null);

      await StoreController.deleteStore(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Store not found'
      });
    });
  });

  describe('Tenant Isolation', () => {
    it('should only access stores from own tenant', async () => {
      req.user.tenant_id = 2;

      await StoreController.getStores(req, res);

      expect(Store.findByTenant).toHaveBeenCalledWith(2);
    });

    it('should not access stores from other tenants', async () => {
      req.user.tenant_id = 1;
      req.params.id = '1';

      const mockStore = { id: 1, tenant_id: 2, name: 'Other Tenant Store' };
      Store.findById.mockResolvedValue(mockStore);

      await StoreController.getStore(req, res);

      // Should call with tenant_id 1, not find store from tenant 2
      expect(Store.findById).toHaveBeenCalledWith('1', 1);
    });
  });
});
