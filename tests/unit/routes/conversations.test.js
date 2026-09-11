/**
 * Unit Tests for Conversations Routes
 * Multi-tenant conversation management
 * 
 * @module tests/unit/routes/conversations
 */

const request = require('supertest');
const express = require('express');
const { pool } = require('../../../config/database');
const conversationsRouter = require('../../../routes/conversations');

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../../services/WhatsAppService', () => ({
  getWhatsAppService: jest.fn(() => ({
    sendMessage: jest.fn().mockResolvedValue({ success: true })
  }))
}));

// Mock auth middleware
jest.mock('../../../middleware/auth', () => ({
  requireAuth: (req, res, next) => next(),
  requireAdmin: (req, res, next) => next()
}));

// Mock tenant middleware
jest.mock('../../../middleware/tenant', () => ({
  requireTenant: (req, res, next) => next()
}));

// Create test app
const app = express();
app.use(express.json());

// Mock Socket.IO
app.set('io', {
  of: jest.fn(() => ({
    emit: jest.fn()
  }))
});

// Mock middleware
app.use((req, res, next) => {
  req.user = {
    id: 1,
    userId: 1, // Route uses userId, not id
    tenantId: 1,
    role: 'admin',
    username: 'testuser',
    store: 'Store1'
  };
  req.tenantId = 1;
  next();
});

app.use('/api/admin/conversations', conversationsRouter);

describe('Conversations Routes', () => {
  let mockConnection;

  beforeEach(() => {
    mockConnection = {
      execute: jest.fn(),
      release: jest.fn()
    };
    pool.getConnection = jest.fn().mockResolvedValue(mockConnection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/conversations', () => {
    it('should return conversations for tenant', async () => {
      const testDate = new Date();
      const mockConversations = [
        {
          id: 1,
          tenant_id: 1,
          phone_number: '5511999999999',
          contact_name: 'John Doe',
          last_message: 'Hello',
          last_message_time: testDate,
          status: 'waiting',
          assigned_user_id: null,
          assigned_username: null
        }
      ];

      mockConnection.execute.mockResolvedValue([mockConversations]);

      const response = await request(app)
        .get('/api/admin/conversations')
        .expect(200);

      // JSON serializes dates as strings
      expect(response.body).toEqual([
        {
          ...mockConversations[0],
          last_message_time: testDate.toISOString()
        }
      ]);
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE c.tenant_id = ?'),
        expect.arrayContaining([1])
      );
    });

    it('should filter conversations by status', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      await request(app)
        .get('/api/admin/conversations?status=waiting')
        .expect(200);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('AND c.status = ?'),
        expect.arrayContaining([1, 'waiting'])
      );
    });

    it('should filter conversations by search', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      await request(app)
        .get('/api/admin/conversations?search=john')
        .expect(200);

      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('AND (c.phone_number LIKE ? OR c.contact_name LIKE ?)'),
        expect.arrayContaining([1, '%john%', '%john%'])
      );
    });

    it('should return 400 if tenant ID not found', async () => {
      const appNoTenant = express();
      appNoTenant.use(express.json());
      appNoTenant.use((req, res, next) => {
        req.user = { id: 1, role: 'admin' };
        req.tenantId = null;
        next();
      });
      appNoTenant.use('/api/admin/conversations', conversationsRouter);

      const response = await request(appNoTenant)
        .get('/api/admin/conversations')
        .expect(400);

      expect(response.body.error).toBe('Tenant ID not found');
    });

    it('should handle database errors', async () => {
      mockConnection.execute.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/admin/conversations')
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('GET /api/admin/conversations/:id/messages', () => {
    it('should return messages for conversation', async () => {
      const testDate = new Date();
      const mockMessages = [
        {
          id: 1,
          conversation_id: 1,
          phone_number: '5511999999999',
          message_text: 'Hello',
          timestamp: testDate,
          is_from_bot: false
        }
      ];

      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Conversation exists
        .mockResolvedValueOnce([mockMessages]); // Messages

      const response = await request(app)
        .get('/api/admin/conversations/1/messages')
        .expect(200);

      // JSON serializes dates as strings
      expect(response.body).toEqual([
        {
          ...mockMessages[0],
          timestamp: testDate.toISOString()
        }
      ]);
    });

    it('should return 404 if conversation not found', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const response = await request(app)
        .get('/api/admin/conversations/999/messages')
        .expect(404);

      expect(response.body.error).toBe('Conversation not found');
    });

    it('should verify tenant ownership', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      await request(app)
        .get('/api/admin/conversations/1/messages')
        .expect(404);

      // req.params.id comes as string from URL
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ? AND tenant_id = ?'),
        ['1', 1]
      );
    });
  });

  describe('POST /api/admin/conversations/:id/attend', () => {
    it('should attend conversation successfully', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ 
          assigned_user_id: null, 
          phone_number: '5511999999999',
          assigned_store: null 
        }]]) // Conversation exists and not attended
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update successful

      const response = await request(app)
        .post('/api/admin/conversations/1/attend')
        .expect(200);

      expect(response.body.message).toBe('Conversation attended successfully');
    });

    it('should return 400 if conversation already attended', async () => {
      mockConnection.execute.mockResolvedValue([[{ 
        assigned_user_id: 2, 
        phone_number: '5511999999999',
        assigned_store: 'Store1'
      }]]);

      const response = await request(app)
        .post('/api/admin/conversations/1/attend')
        .expect(400);

      expect(response.body.error).toBe('Conversation is already being attended');
    });

    it('should return 404 if conversation not found', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const response = await request(app)
        .post('/api/admin/conversations/999/attend')
        .expect(404);

      expect(response.body.error).toBe('Conversation not found');
    });

    it('should preserve department assignment', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ 
          assigned_user_id: null, 
          phone_number: '5511999999999',
          assigned_store: 'SETOR:Support'
        }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]);

      await request(app)
        .post('/api/admin/conversations/1/attend')
        .expect(200);

      // Check the UPDATE query (second call)
      const updateCall = mockConnection.execute.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE conversations SET');
      expect(updateCall[1]).toEqual([1, 'SETOR:Support', 'attended', '1']);
    });
  });

  describe('POST /api/admin/conversations/:id/close', () => {
    it('should close conversation successfully', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Conversation exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update successful

      const response = await request(app)
        .post('/api/admin/conversations/1/close')
        .expect(200);

      expect(response.body.message).toBe('Conversation closed successfully');
    });

    it('should return 404 if conversation not found', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const response = await request(app)
        .post('/api/admin/conversations/999/close')
        .expect(404);

      expect(response.body.error).toBe('Conversation not found');
    });
  });

  describe('POST /api/admin/conversations/:id/messages', () => {
    it('should send message successfully', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ phone_number: '5511999999999' }]]) // Conversation exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Update successful

      const response = await request(app)
        .post('/api/admin/conversations/1/messages')
        .send({ message: 'Test message' })
        .expect(200);

      expect(response.body.message).toBe('Message sent successfully');
    });

    it('should return 400 if message is empty', async () => {
      const response = await request(app)
        .post('/api/admin/conversations/1/messages')
        .send({ message: '' })
        .expect(400);

      expect(response.body.error).toBe('Message is required');
    });

    it('should return 404 if conversation not found', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const response = await request(app)
        .post('/api/admin/conversations/999/messages')
        .send({ message: 'Test' })
        .expect(404);

      expect(response.body.error).toBe('Conversation not found');
    });
  });

  describe('DELETE /api/admin/conversations/:id', () => {
    it('should delete conversation successfully', async () => {
      mockConnection.execute
        .mockResolvedValueOnce([[{ id: 1 }]]) // Conversation exists
        .mockResolvedValueOnce([{ affectedRows: 1 }]); // Delete successful

      const response = await request(app)
        .delete('/api/admin/conversations/1')
        .expect(200);

      expect(response.body.message).toBe('Conversation deleted successfully');
    });

    it('should return 404 if conversation not found', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      const response = await request(app)
        .delete('/api/admin/conversations/999')
        .expect(404);

      expect(response.body.error).toBe('Conversation not found');
    });

    it('should verify tenant ownership before deleting', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      await request(app)
        .delete('/api/admin/conversations/1')
        .expect(404);

      // req.params.id comes as string from URL
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ? AND tenant_id = ?'),
        ['1', 1]
      );
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should not allow access to other tenant conversations', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      await request(app)
        .get('/api/admin/conversations/1/messages')
        .expect(404);

      // Verify tenant_id is always in the query
      expect(mockConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = ?'),
        expect.any(Array)
      );
    });

    it('should filter by tenant in all queries', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      await request(app).get('/api/admin/conversations');
      await request(app).get('/api/admin/conversations/1/messages');
      await request(app).post('/api/admin/conversations/1/attend');

      // All queries should include tenant_id
      const calls = mockConnection.execute.mock.calls;
      calls.forEach(call => {
        const query = call[0];
        const params = call[1];
        
        if (query.includes('SELECT') || query.includes('UPDATE')) {
          expect(query).toMatch(/tenant_id/i);
          expect(params).toContain(1); // tenantId
        }
      });
    });
  });

  describe('Role-based Access', () => {
    it('should allow admin to see all conversations', async () => {
      mockConnection.execute.mockResolvedValue([[]]);

      await request(app).get('/api/admin/conversations');

      const query = mockConnection.execute.mock.calls[0][0];
      expect(query).not.toMatch(/assigned_store/);
    });

    it('should filter by store for store users', async () => {
      const appStoreUser = express();
      appStoreUser.use(express.json());
      appStoreUser.use((req, res, next) => {
        req.user = {
          id: 2,
          userId: 2,
          tenantId: 1,
          role: 'user',
          username: 'storeuser',
          store: 'Store1'
        };
        req.tenantId = 1;
        next();
      });
      appStoreUser.use('/api/admin/conversations', conversationsRouter);

      mockConnection.execute.mockResolvedValue([[]]);

      await request(appStoreUser).get('/api/admin/conversations');

      const query = mockConnection.execute.mock.calls[0][0];
      // Check for store filtering in query (normalize whitespace)
      const normalizedQuery = query.replace(/\s+/g, ' ');
      expect(normalizedQuery).toContain('assigned_store IS NULL OR c.assigned_store = ?');
    });
  });
});
