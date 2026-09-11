/**
 * Payment Gateway Controller Unit Tests
 * Tests for payment gateway management
 */

const PaymentGatewayController = require('../../../controllers/PaymentGatewayController');
const { pool } = require('../../../config/database');
const { logger } = require('../../../config/logger');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../config/logger');

describe('PaymentGatewayController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      user: { id: 1 }
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getAllGateways', () => {
    it('should return all payment gateways', async () => {
      const mockGateways = [
        { id: 1, gateway_name: 'stripe', enabled: true, stripe_secret_key: 'sk_test_123' },
        { id: 2, gateway_name: 'paypal', enabled: false, paypal_client_id: 'paypal_123' },
        { id: 3, gateway_name: 'cash', enabled: true, cash_instructions: 'Pay in cash' }
      ];

      pool.execute.mockResolvedValue([mockGateways]);

      await PaymentGatewayController.getAllGateways(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT * FROM payment_gateway_settings'
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          stripe: mockGateways[0],
          paypal: mockGateways[1],
          cash: mockGateways[2]
        }
      });
    });

    it('should return empty gateways map when no gateways exist', async () => {
      pool.execute.mockResolvedValue([[]]);

      await PaymentGatewayController.getAllGateways(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          stripe: null,
          paypal: null,
          cash: null
        }
      });
    });

    it('should handle database errors', async () => {
      pool.execute.mockRejectedValue(new Error('Database error'));

      await PaymentGatewayController.getAllGateways(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error loading payment gateways'
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('updateGateway', () => {
    it('should reject invalid gateway name', async () => {
      req.params.gateway = 'invalid';
      req.body = { some_key: 'value' };

      await PaymentGatewayController.updateGateway(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid gateway name'
      });
    });

    it('should insert new Stripe gateway', async () => {
      req.params.gateway = 'stripe';
      req.body = {
        stripe_secret_key: 'sk_test_new',
        stripe_publishable_key: 'pk_test_new',
        stripe_webhook_secret: 'whsec_test'
      };

      pool.execute
        .mockResolvedValueOnce([[]]) // Check if exists
        .mockResolvedValueOnce([{ insertId: 1 }]); // Insert

      await PaymentGatewayController.updateGateway(req, res);

      expect(pool.execute).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Gateway settings updated successfully'
      });
      expect(logger.info).toHaveBeenCalledWith('Payment gateway updated', { gateway: 'stripe' });
    });

    it('should update existing Stripe gateway', async () => {
      req.params.gateway = 'stripe';
      req.body = {
        stripe_secret_key: 'sk_test_updated',
        stripe_publishable_key: 'pk_test_updated'
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check if exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await PaymentGatewayController.updateGateway(req, res);

      expect(pool.execute).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Gateway settings updated successfully'
      });
    });

    it('should insert new PayPal gateway', async () => {
      req.params.gateway = 'paypal';
      req.body = {
        paypal_client_id: 'client_123',
        paypal_client_secret: 'secret_123',
        paypal_mode: 'sandbox',
        paypal_webhook_id: 'webhook_123'
      };

      pool.execute
        .mockResolvedValueOnce([[]]) // Check if exists
        .mockResolvedValueOnce([{ insertId: 1 }]); // Insert

      await PaymentGatewayController.updateGateway(req, res);

      expect(pool.execute).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Gateway settings updated successfully'
      });
    });

    it('should update existing PayPal gateway', async () => {
      req.params.gateway = 'paypal';
      req.body = {
        paypal_client_id: 'client_updated',
        paypal_mode: 'live'
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check if exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await PaymentGatewayController.updateGateway(req, res);

      expect(pool.execute).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Gateway settings updated successfully'
      });
    });

    it('should insert new Cash gateway', async () => {
      req.params.gateway = 'cash';
      req.body = {
        cash_instructions: 'Pay at our office',
        cash_contact_email: 'cash@example.com',
        cash_contact_phone: '+1234567890'
      };

      pool.execute
        .mockResolvedValueOnce([[]]) // Check if exists
        .mockResolvedValueOnce([{ insertId: 1 }]); // Insert

      await PaymentGatewayController.updateGateway(req, res);

      expect(pool.execute).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Gateway settings updated successfully'
      });
    });

    it('should update existing Cash gateway', async () => {
      req.params.gateway = 'cash';
      req.body = {
        cash_instructions: 'Updated instructions',
        cash_contact_email: 'updated@example.com'
      };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check if exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await PaymentGatewayController.updateGateway(req, res);

      expect(pool.execute).toHaveBeenCalledTimes(2);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Gateway settings updated successfully'
      });
    });

    it('should handle empty update fields', async () => {
      req.params.gateway = 'stripe';
      req.body = {}; // No fields to update

      pool.execute.mockResolvedValueOnce([[{ id: 1 }]]); // Check if exists

      await PaymentGatewayController.updateGateway(req, res);

      expect(pool.execute).toHaveBeenCalledTimes(1); // Only check, no update
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Gateway settings updated successfully'
      });
    });

    it('should handle database errors', async () => {
      req.params.gateway = 'stripe';
      req.body = { stripe_secret_key: 'sk_test' };

      pool.execute.mockRejectedValue(new Error('Database error'));

      await PaymentGatewayController.updateGateway(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error updating gateway settings'
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('toggleGateway', () => {
    it('should reject invalid gateway name', async () => {
      req.params.gateway = 'bitcoin';
      req.body = { enabled: true };

      await PaymentGatewayController.toggleGateway(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid gateway name'
      });
    });

    it('should insert new gateway when toggling non-existent gateway', async () => {
      req.params.gateway = 'stripe';
      req.body = { enabled: true };

      pool.execute
        .mockResolvedValueOnce([[]]) // Check if exists
        .mockResolvedValueOnce([{ insertId: 1 }]); // Insert

      await PaymentGatewayController.toggleGateway(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'INSERT INTO payment_gateway_settings (gateway_name, enabled) VALUES (?, ?)',
        ['stripe', true]
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Gateway enabled successfully'
      });
      expect(logger.info).toHaveBeenCalledWith('Payment gateway toggled', { 
        gateway: 'stripe', 
        enabled: true 
      });
    });

    it('should update existing gateway status to enabled', async () => {
      req.params.gateway = 'paypal';
      req.body = { enabled: true };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check if exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await PaymentGatewayController.toggleGateway(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'UPDATE payment_gateway_settings SET enabled = ? WHERE gateway_name = ?',
        [true, 'paypal']
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Gateway enabled successfully'
      });
    });

    it('should update existing gateway status to disabled', async () => {
      req.params.gateway = 'cash';
      req.body = { enabled: false };

      pool.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Check if exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update

      await PaymentGatewayController.toggleGateway(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'UPDATE payment_gateway_settings SET enabled = ? WHERE gateway_name = ?',
        [false, 'cash']
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Gateway disabled successfully'
      });
    });

    it('should handle database errors', async () => {
      req.params.gateway = 'stripe';
      req.body = { enabled: true };

      pool.execute.mockRejectedValue(new Error('Database error'));

      await PaymentGatewayController.toggleGateway(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error toggling gateway'
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getEnabledGateways', () => {
    it('should return list of enabled gateways', async () => {
      const mockGateways = [
        { gateway_name: 'stripe' },
        { gateway_name: 'cash' }
      ];

      pool.execute.mockResolvedValue([mockGateways]);

      await PaymentGatewayController.getEnabledGateways(req, res);

      expect(pool.execute).toHaveBeenCalledWith(
        'SELECT gateway_name FROM payment_gateway_settings WHERE enabled = TRUE'
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: ['stripe', 'cash']
      });
    });

    it('should return empty array when no gateways are enabled', async () => {
      pool.execute.mockResolvedValue([[]]);

      await PaymentGatewayController.getEnabledGateways(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: []
      });
    });

    it('should handle database errors', async () => {
      pool.execute.mockRejectedValue(new Error('Database error'));

      await PaymentGatewayController.getEnabledGateways(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Error loading enabled gateways'
      });
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
