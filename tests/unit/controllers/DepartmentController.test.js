/**
 * Department Controller Unit Tests
 * 
 * Tests for department management functionality
 * Ensures tenant isolation and proper CRUD operations
 */

const DepartmentController = require('../../../controllers/DepartmentController');
const Department = require('../../../models/Department');

// Mock the Department model
jest.mock('../../../models/Department');

describe('DepartmentController', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

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

    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getDepartments', () => {
    it('should return all departments for tenant', async () => {
      const mockDepartments = [
        { id: 1, tenant_id: 1, name: 'Sales', user_count: 5 },
        { id: 2, tenant_id: 1, name: 'Support', user_count: 3 }
      ];

      Department.findByTenant.mockResolvedValue(mockDepartments);

      await DepartmentController.getDepartments(req, res);

      expect(Department.findByTenant).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockDepartments
      });
    });

    it('should handle errors gracefully', async () => {
      Department.findByTenant.mockRejectedValue(new Error('Database error'));

      await DepartmentController.getDepartments(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to fetch departments',
        error: 'Database error'
      });
    });
  });

  describe('getDepartment', () => {
    it('should return single department', async () => {
      const mockDepartment = { id: 1, tenant_id: 1, name: 'Sales', user_count: 5 };
      req.params.id = '1';

      Department.findById.mockResolvedValue(mockDepartment);

      await DepartmentController.getDepartment(req, res);

      expect(Department.findById).toHaveBeenCalledWith('1', 1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockDepartment
      });
    });

    it('should return 404 if department not found', async () => {
      req.params.id = '999';
      Department.findById.mockResolvedValue(null);

      await DepartmentController.getDepartment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Department not found'
      });
    });
  });

  describe('createDepartment', () => {
    it('should create new department successfully', async () => {
      const departmentData = {
        name: 'Marketing',
        description: 'Marketing team'
      };

      req.body = departmentData;

      const mockCreatedDepartment = { id: 1, tenant_id: 1, ...departmentData };

      Department.nameExists.mockResolvedValue(false);
      Department.create.mockResolvedValue(mockCreatedDepartment);

      await DepartmentController.createDepartment(req, res);

      expect(Department.nameExists).toHaveBeenCalledWith('Marketing', 1);
      expect(Department.create).toHaveBeenCalledWith(departmentData, 1);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Department created successfully',
        data: mockCreatedDepartment
      });
    });

    it('should reject duplicate department name', async () => {
      req.body = { name: 'Existing Department' };

      Department.nameExists.mockResolvedValue(true);

      await DepartmentController.createDepartment(req, res);

      expect(Department.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Department name already exists'
      });
    });
  });

  describe('updateDepartment', () => {
    it('should update department successfully', async () => {
      const departmentData = {
        name: 'Updated Department',
        description: 'Updated description'
      };

      req.params.id = '1';
      req.body = departmentData;

      const mockExistingDepartment = { id: 1, tenant_id: 1, name: 'Old Name' };
      const mockUpdatedDepartment = { id: 1, tenant_id: 1, ...departmentData };

      Department.findById.mockResolvedValue(mockExistingDepartment);
      Department.nameExists.mockResolvedValue(false);
      Department.update.mockResolvedValue(mockUpdatedDepartment);

      await DepartmentController.updateDepartment(req, res);

      expect(Department.findById).toHaveBeenCalledWith('1', 1);
      expect(Department.nameExists).toHaveBeenCalledWith('Updated Department', 1, '1');
      expect(Department.update).toHaveBeenCalledWith('1', departmentData, 1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Department updated successfully',
        data: mockUpdatedDepartment
      });
    });

    it('should return 404 if department not found', async () => {
      req.params.id = '999';
      req.body = { name: 'Updated Department' };

      Department.findById.mockResolvedValue(null);

      await DepartmentController.updateDepartment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Department not found'
      });
    });
  });

  describe('deleteDepartment', () => {
    it('should delete department successfully', async () => {
      req.params.id = '1';

      const mockDepartment = { id: 1, tenant_id: 1, name: 'Sales', user_count: 0 };

      Department.findById.mockResolvedValue(mockDepartment);
      Department.delete.mockResolvedValue(true);

      await DepartmentController.deleteDepartment(req, res);

      expect(Department.findById).toHaveBeenCalledWith('1', 1);
      expect(Department.delete).toHaveBeenCalledWith('1', 1);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Department deleted successfully'
      });
    });

    it('should prevent deletion of department with users', async () => {
      req.params.id = '1';

      const mockDepartment = { id: 1, tenant_id: 1, name: 'Sales', user_count: 5 };

      Department.findById.mockResolvedValue(mockDepartment);

      await DepartmentController.deleteDepartment(req, res);

      expect(Department.delete).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Cannot delete department with assigned users. Please reassign users first.'
      });
    });

    it('should return 404 if department not found', async () => {
      req.params.id = '999';

      Department.findById.mockResolvedValue(null);

      await DepartmentController.deleteDepartment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Department not found'
      });
    });
  });

  describe('Tenant Isolation', () => {
    it('should only access departments from own tenant', async () => {
      req.user.tenant_id = 2;

      await DepartmentController.getDepartments(req, res);

      expect(Department.findByTenant).toHaveBeenCalledWith(2);
    });

    it('should not access departments from other tenants', async () => {
      req.user.tenant_id = 1;
      req.params.id = '1';

      await DepartmentController.getDepartment(req, res);

      expect(Department.findById).toHaveBeenCalledWith('1', 1);
    });
  });
});
