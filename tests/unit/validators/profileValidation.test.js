/**
 * profileValidation Unit Tests
 */

const profileValidation = require('../../../middleware/validators/profileValidation');

describe('profileValidation', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      t: jest.fn((key) => key)
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockNext = jest.fn();
  });

  describe('validateUpdateProfile', () => {
    it('should pass valid profile data', () => {
      mockReq.body = {
        name: 'John Doe',
        email: 'john@test.com'
      };

      profileValidation.validateUpdateProfile(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid email', () => {
      mockReq.body = {
        name: 'John',
        email: 'invalid-email'
      };

      profileValidation.validateUpdateProfile(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject empty name', () => {
      mockReq.body = {
        name: '',
        email: 'john@test.com'
      };

      profileValidation.validateUpdateProfile(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should pass with only name', () => {
      mockReq.body = {
        name: 'John Doe'
      };

      profileValidation.validateUpdateProfile(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateChangePassword', () => {
    it('should pass valid password change', () => {
      mockReq.body = {
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword456'
      };

      profileValidation.validateChangePassword(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing currentPassword', () => {
      mockReq.body = {
        newPassword: 'newPassword456'
      };

      profileValidation.validateChangePassword(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject missing newPassword', () => {
      mockReq.body = {
        currentPassword: 'oldPassword123'
      };

      profileValidation.validateChangePassword(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject short newPassword', () => {
      mockReq.body = {
        currentPassword: 'oldPassword123',
        newPassword: '123'
      };

      profileValidation.validateChangePassword(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject same passwords', () => {
      mockReq.body = {
        currentPassword: 'samePassword123',
        newPassword: 'samePassword123'
      };

      profileValidation.validateChangePassword(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateTenantProfile', () => {
    it('should pass valid tenant profile', () => {
      mockReq.body = {
        company_name: 'My Company',
        phone: '123456789',
        email: 'company@test.com'
      };

      profileValidation.validateTenantProfile(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid phone', () => {
      mockReq.body = {
        company_name: 'My Company',
        phone: 'abc'
      };

      profileValidation.validateTenantProfile(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateBranding', () => {
    it('should pass valid branding data', () => {
      mockReq.body = {
        primary_color: '#667eea',
        accent_color: '#764ba2',
        text_color: '#333333'
      };

      profileValidation.validateBranding(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid color format', () => {
      mockReq.body = {
        primary_color: 'blue'
      };

      profileValidation.validateBranding(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should pass with partial branding data', () => {
      mockReq.body = {
        primary_color: '#FF0000'
      };

      profileValidation.validateBranding(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validateLogoUpload', () => {
    it('should pass valid image file', () => {
      mockReq.file = {
        mimetype: 'image/png',
        size: 500000
      };

      profileValidation.validateLogoUpload(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject non-image file', () => {
      mockReq.file = {
        mimetype: 'application/pdf',
        size: 500000
      };

      profileValidation.validateLogoUpload(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject file too large', () => {
      mockReq.file = {
        mimetype: 'image/png',
        size: 10000000 // 10MB
      };

      profileValidation.validateLogoUpload(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject missing file', () => {
      mockReq.file = null;

      profileValidation.validateLogoUpload(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should pass valid jpeg file', () => {
      mockReq.file = {
        mimetype: 'image/jpeg',
        size: 200000
      };

      profileValidation.validateLogoUpload(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validatePreferredLanguage', () => {
    it('should pass valid language code', () => {
      mockReq.body = {
        preferred_language: 'en'
      };

      profileValidation.validatePreferredLanguage(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should pass Portuguese', () => {
      mockReq.body = {
        preferred_language: 'pt'
      };

      profileValidation.validatePreferredLanguage(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid language code', () => {
      mockReq.body = {
        preferred_language: 'invalid'
      };

      profileValidation.validatePreferredLanguage(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
