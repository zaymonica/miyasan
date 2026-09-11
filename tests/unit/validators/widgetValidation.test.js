/**
 * widgetValidation Unit Tests
 */

const widgetValidation = require('../../../middleware/validators/widgetValidation');

describe('widgetValidation', () => {
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

  describe('validateCreateWidget', () => {
    it('should pass valid widget data', () => {
      mockReq.body = {
        name: 'My Widget',
        whatsapp_number: '5511999999999',
        button_title: 'Chat with us'
      };

      widgetValidation.validateCreateWidget(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject missing name', () => {
      mockReq.body = {
        whatsapp_number: '5511999999999'
      };

      widgetValidation.validateCreateWidget(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject missing whatsapp_number', () => {
      mockReq.body = {
        name: 'My Widget'
      };

      widgetValidation.validateCreateWidget(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject invalid whatsapp_number', () => {
      mockReq.body = {
        name: 'My Widget',
        whatsapp_number: 'invalid'
      };

      widgetValidation.validateCreateWidget(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateUpdateWidget', () => {
    it('should pass valid update data', () => {
      mockReq.body = {
        name: 'Updated Widget',
        button_background_color: '#FF0000'
      };

      widgetValidation.validateUpdateWidget(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid color format', () => {
      mockReq.body = {
        button_background_color: 'red'
      };

      widgetValidation.validateUpdateWidget(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateWidgetSettings', () => {
    it('should pass valid settings', () => {
      mockReq.body = {
        margin_right: 20,
        margin_bottom: 20,
        border_radius: 50,
        max_message_length: 500
      };

      widgetValidation.validateWidgetSettings(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject negative margin', () => {
      mockReq.body = {
        margin_right: -10
      };

      widgetValidation.validateWidgetSettings(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject invalid border_radius', () => {
      mockReq.body = {
        border_radius: -5
      };

      widgetValidation.validateWidgetSettings(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should reject max_message_length over limit', () => {
      mockReq.body = {
        max_message_length: 10000
      };

      widgetValidation.validateWidgetSettings(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateColor', () => {
    it('should pass valid hex color', () => {
      const result = widgetValidation.validateColor('#FF0000');
      expect(result).toBe(true);
    });

    it('should pass valid short hex color', () => {
      const result = widgetValidation.validateColor('#F00');
      expect(result).toBe(true);
    });

    it('should reject invalid color', () => {
      const result = widgetValidation.validateColor('red');
      expect(result).toBe(false);
    });

    it('should reject invalid hex', () => {
      const result = widgetValidation.validateColor('#GGG');
      expect(result).toBe(false);
    });
  });

  describe('validatePhoneNumber', () => {
    it('should pass valid phone with country code', () => {
      const result = widgetValidation.validatePhoneNumber('+5511999999999');
      expect(result).toBe(true);
    });

    it('should pass valid phone without plus', () => {
      const result = widgetValidation.validatePhoneNumber('5511999999999');
      expect(result).toBe(true);
    });

    it('should reject too short phone', () => {
      const result = widgetValidation.validatePhoneNumber('123');
      expect(result).toBe(false);
    });

    it('should reject phone with letters', () => {
      const result = widgetValidation.validatePhoneNumber('55abc999999');
      expect(result).toBe(false);
    });
  });

  describe('validateWidgetEvent', () => {
    it('should pass valid event type', () => {
      mockReq.body = {
        event_type: 'opened',
        page_url: 'https://example.com'
      };

      widgetValidation.validateWidgetEvent(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid event type', () => {
      mockReq.body = {
        event_type: 'invalid_event'
      };

      widgetValidation.validateWidgetEvent(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should pass all valid event types', () => {
      const validEvents = ['loaded', 'opened', 'closed', 'message_sent', 'clicked'];

      for (const event of validEvents) {
        mockReq.body = { event_type: event };
        mockNext.mockClear();

        widgetValidation.validateWidgetEvent(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalled();
      }
    });
  });
});
