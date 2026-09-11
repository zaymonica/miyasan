/**
 * LandingPageController Unit Tests
 */

const LandingPageController = require('../../../controllers/LandingPageController');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn(),
    getConnection: jest.fn()
  }
}));

const { pool } = require('../../../config/database');

describe('LandingPageController', () => {
  let mockReq;
  let mockRes;
  let mockConnection;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConnection = {
      execute: jest.fn(),
      query: jest.fn(),
      release: jest.fn()
    };

    pool.getConnection.mockResolvedValue(mockConnection);

    mockReq = {
      body: {},
      query: {},
      params: {},
      t: jest.fn((key) => key)
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      render: jest.fn()
    };
  });

  describe('getSettings', () => {
    it('should return landing page settings', async () => {
      pool.execute.mockResolvedValue([[{
        id: 1,
        hero_title: 'Welcome',
        primary_color: '#667eea'
      }]]);

      await LandingPageController.getSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Object)
        })
      );
    });

    it('should return default settings if none exist', async () => {
      pool.execute.mockResolvedValue([[]]);

      await LandingPageController.getSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('updateSettings', () => {
    it('should update landing page settings', async () => {
      mockReq.body = {
        hero_title: 'New Title',
        hero_subtitle: 'New Subtitle',
        primary_color: '#FF0000'
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await LandingPageController.updateSettings(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getFeatures', () => {
    it('should return all features', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, title: 'Feature 1', icon: 'fa-check' },
        { id: 2, title: 'Feature 2', icon: 'fa-star' }
      ]]);

      await LandingPageController.getFeatures(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      );
    });
  });

  describe('createFeature', () => {
    it('should create new feature', async () => {
      mockReq.body = {
        title: 'New Feature',
        description: 'Feature description',
        icon: 'fa-rocket'
      };

      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      await LandingPageController.createFeature(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 1 })
        })
      );
    });

    it('should reject if required fields missing', async () => {
      mockReq.body = { title: 'Feature' };

      await LandingPageController.createFeature(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('updateFeature', () => {
    it('should update feature', async () => {
      mockReq.params = { id: 1 };
      mockReq.body = { title: 'Updated Feature' };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await LandingPageController.updateFeature(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('deleteFeature', () => {
    it('should delete feature', async () => {
      mockReq.params = { id: 1 };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await LandingPageController.deleteFeature(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getTestimonials', () => {
    it('should return all testimonials', async () => {
      pool.execute.mockResolvedValue([[
        { id: 1, customer_name: 'John', testimonial_text: 'Great!' },
        { id: 2, customer_name: 'Jane', testimonial_text: 'Awesome!' }
      ]]);

      await LandingPageController.getTestimonials(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array)
        })
      );
    });
  });

  describe('createTestimonial', () => {
    it('should create new testimonial', async () => {
      mockReq.body = {
        customer_name: 'John Doe',
        testimonial_text: 'Great service!',
        rating: 5
      };

      pool.execute.mockResolvedValue([{ insertId: 1 }]);

      await LandingPageController.createTestimonial(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({ id: 1 })
        })
      );
    });
  });

  describe('updateTestimonial', () => {
    it('should update testimonial', async () => {
      mockReq.params = { id: 1 };
      mockReq.body = { testimonial_text: 'Updated review' };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await LandingPageController.updateTestimonial(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('deleteTestimonial', () => {
    it('should delete testimonial', async () => {
      mockReq.params = { id: 1 };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await LandingPageController.deleteTestimonial(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('reorderFeatures', () => {
    it('should reorder features', async () => {
      mockReq.body = {
        order: [3, 1, 2]
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await LandingPageController.reorderFeatures(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('reorderTestimonials', () => {
    it('should reorder testimonials', async () => {
      mockReq.body = {
        order: [2, 3, 1]
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      await LandingPageController.reorderTestimonials(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });
});
