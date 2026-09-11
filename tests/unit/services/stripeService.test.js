/**
 * stripeService Unit Tests
 */

const stripeService = require('../../../services/stripeService');

// Mock dependencies
jest.mock('../../../config/database', () => ({
  pool: {
    execute: jest.fn()
  }
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
      del: jest.fn()
    },
    subscriptions: {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
      list: jest.fn()
    },
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      confirm: jest.fn()
    },
    paymentMethods: {
      attach: jest.fn(),
      detach: jest.fn(),
      list: jest.fn()
    },
    prices: {
      list: jest.fn(),
      retrieve: jest.fn()
    },
    products: {
      list: jest.fn(),
      retrieve: jest.fn()
    },
    webhooks: {
      constructEvent: jest.fn()
    }
  }));
});

const { pool } = require('../../../config/database');
const stripe = require('stripe')();

describe('stripeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return Stripe settings', async () => {
      pool.execute.mockResolvedValue([[{
        stripe_secret_key: 'sk_test_123',
        stripe_publishable_key: 'pk_test_123',
        enabled: true
      }]]);

      const settings = await stripeService.getSettings();

      expect(settings).toEqual(expect.objectContaining({
        stripe_secret_key: 'sk_test_123'
      }));
    });

    it('should return null if no settings', async () => {
      pool.execute.mockResolvedValue([[]]);

      const settings = await stripeService.getSettings();

      expect(settings).toBeNull();
    });
  });

  describe('createCustomer', () => {
    it('should create Stripe customer', async () => {
      stripe.customers.create.mockResolvedValue({
        id: 'cus_123',
        email: 'test@test.com'
      });

      const customer = await stripeService.createCustomer({
        email: 'test@test.com',
        name: 'Test User'
      });

      expect(customer.id).toBe('cus_123');
    });
  });

  describe('getCustomer', () => {
    it('should retrieve customer', async () => {
      stripe.customers.retrieve.mockResolvedValue({
        id: 'cus_123',
        email: 'test@test.com'
      });

      const customer = await stripeService.getCustomer('cus_123');

      expect(customer.id).toBe('cus_123');
    });
  });

  describe('createSubscription', () => {
    it('should create subscription', async () => {
      stripe.subscriptions.create.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        customer: 'cus_123'
      });

      const subscription = await stripeService.createSubscription({
        customerId: 'cus_123',
        priceId: 'price_123',
        paymentMethodId: 'pm_123'
      });

      expect(subscription.id).toBe('sub_123');
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription immediately', async () => {
      stripe.subscriptions.cancel.mockResolvedValue({
        id: 'sub_123',
        status: 'canceled'
      });

      const result = await stripeService.cancelSubscription('sub_123', true);

      expect(result.status).toBe('canceled');
    });

    it('should cancel at period end', async () => {
      stripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        cancel_at_period_end: true
      });

      const result = await stripeService.cancelSubscription('sub_123', false);

      expect(result.cancel_at_period_end).toBe(true);
    });
  });

  describe('updateSubscription', () => {
    it('should update subscription', async () => {
      stripe.subscriptions.update.mockResolvedValue({
        id: 'sub_123',
        status: 'active'
      });

      const result = await stripeService.updateSubscription('sub_123', {
        priceId: 'price_456'
      });

      expect(result.id).toBe('sub_123');
    });
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent', async () => {
      stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_123',
        client_secret: 'secret_123',
        status: 'requires_payment_method'
      });

      const intent = await stripeService.createPaymentIntent({
        amount: 9999,
        currency: 'usd',
        customerId: 'cus_123'
      });

      expect(intent.id).toBe('pi_123');
    });
  });

  describe('attachPaymentMethod', () => {
    it('should attach payment method to customer', async () => {
      stripe.paymentMethods.attach.mockResolvedValue({
        id: 'pm_123',
        customer: 'cus_123'
      });

      const result = await stripeService.attachPaymentMethod('pm_123', 'cus_123');

      expect(result.customer).toBe('cus_123');
    });
  });

  describe('listPaymentMethods', () => {
    it('should list customer payment methods', async () => {
      stripe.paymentMethods.list.mockResolvedValue({
        data: [
          { id: 'pm_123', type: 'card' },
          { id: 'pm_456', type: 'card' }
        ]
      });

      const methods = await stripeService.listPaymentMethods('cus_123');

      expect(methods.data).toHaveLength(2);
    });
  });

  describe('handleWebhook', () => {
    it('should handle payment_intent.succeeded', async () => {
      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            amount: 9999,
            customer: 'cus_123'
          }
        }
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await stripeService.handleWebhook(event);

      expect(result.processed).toBe(true);
    });

    it('should handle customer.subscription.created', async () => {
      const event = {
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_123',
            customer: 'cus_123',
            status: 'active'
          }
        }
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await stripeService.handleWebhook(event);

      expect(result.processed).toBe(true);
    });

    it('should handle invoice.paid', async () => {
      const event = {
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_123',
            customer: 'cus_123',
            amount_paid: 9999
          }
        }
      };

      pool.execute.mockResolvedValue([{ affectedRows: 1 }]);

      const result = await stripeService.handleWebhook(event);

      expect(result.processed).toBe(true);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify webhook signature', () => {
      stripe.webhooks.constructEvent.mockReturnValue({ type: 'test' });

      const result = stripeService.verifyWebhookSignature(
        'payload',
        'signature',
        'webhook_secret'
      );

      expect(result).toEqual({ type: 'test' });
    });

    it('should throw on invalid signature', () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      expect(() => {
        stripeService.verifyWebhookSignature('payload', 'bad_sig', 'secret');
      }).toThrow();
    });
  });
});
