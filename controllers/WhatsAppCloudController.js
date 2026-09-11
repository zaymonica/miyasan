/**
 * WhatsApp Cloud Controller
 * Handles WhatsApp Cloud API integration and Facebook Embedded Signup
 */

const BaseController = require('./BaseController');
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const axios = require('axios');
const crypto = require('crypto');
/* const WhatsAppCloudFAQService = require('../services/WhatsAppCloudFAQService'); */

class WhatsAppCloudController extends BaseController {
  /**
   * Process Facebook Embedded Signup callback OR manual connection
   * POST /api/whatsapp-cloud/facebook-callback
   */
  static async facebookCallback(req, res) {
    try {
      const { code, auth_response, manual, account_name, waba_id, phone_number_id, phone_number, access_token } = req.body;
      const tenantId = req.tenantId || req.user.tenantId;

      logger.info('🔍 Facebook callback initiated', {
        tenantId,
        hasCode: !!code,
        hasAuthResponse: !!auth_response,
        isManual: !!manual,
        authResponseKeys: auth_response ? Object.keys(auth_response) : [],
        userId: req.user?.id,
        userRole: req.user?.role
      });

      if (!tenantId) {
        logger.error('❌ Tenant ID not found in request', {
          user: req.user,
          headers: req.headers
        });
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }

      // Handle manual connection
      if (manual) {
        logger.info('Processing manual WhatsApp connection', { tenantId, account_name });

        if (!account_name || !phone_number_id || !access_token) {
          return res.status(400).json({
            success: false,
            message: 'Account name, phone number ID, and access token are required for manual connection'
          });
        }

        // Check if account already exists
        const [existing] = await pool.execute(
          'SELECT id FROM whatsapp_cloud_accounts WHERE phone_number_id = ? AND tenant_id = ?',
          [phone_number_id, tenantId]
        );

        let accountId;

        if (existing.length > 0) {
          // Update existing account
          accountId = existing[0].id;
          await pool.execute(
            `UPDATE whatsapp_cloud_accounts 
             SET account_name = ?, waba_id = ?, phone_number = ?, 
                 access_token = ?, status = 'connected', updated_at = NOW()
             WHERE id = ?`,
            [account_name, waba_id, phone_number, access_token, accountId]
          );
          logger.info('WhatsApp account updated (manual)', { tenantId, accountId });
        } else {
          // Check if this is the first account for this tenant
          const [accountCount] = await pool.execute(
            'SELECT COUNT(*) as count FROM whatsapp_cloud_accounts WHERE tenant_id = ?',
            [tenantId]
          );

          const isDefault = accountCount[0].count === 0;

          // Create new account
          const [result] = await pool.execute(
            `INSERT INTO whatsapp_cloud_accounts 
             (tenant_id, account_name, waba_id, phone_number_id, phone_number, access_token, status, is_default, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'connected', ?, NOW(), NOW())`,
            [tenantId, account_name, waba_id, phone_number_id, phone_number, access_token, isDefault]
          );

          accountId = result.insertId;
          logger.info('WhatsApp account created (manual)', { tenantId, accountId });
        }

        return res.json({
          success: true,
          message: 'Account connected successfully',
          data: { account_id: accountId }
        });
      }

      // Handle Facebook OAuth flow
      if (!code && !auth_response) {
        logger.error('❌ No authorization code or auth response provided', {
          tenantId,
          bodyKeys: Object.keys(req.body)
        });
        return res.status(400).json({
          success: false,
          message: 'Authorization code or auth response is required'
        });
      }

      logger.info('🔄 Processing Facebook OAuth flow', { 
        tenantId, 
        hasCode: !!code,
        codeLength: code?.length,
        hasAuthResponse: !!auth_response
      });

      // Get Meta App credentials from system settings
      const [settings] = await pool.execute(
        `SELECT setting_key, setting_value FROM system_settings_kv 
         WHERE setting_key IN ('meta_app_id', 'meta_app_secret', 'meta_embedded_signup_enabled')`
      );

      const settingsObj = {};
      settings.forEach(row => {
        settingsObj[row.setting_key] = row.setting_value;
      });

      // Check if Embedded Signup is enabled
      if (settingsObj.meta_embedded_signup_enabled !== '1' && settingsObj.meta_embedded_signup_enabled !== 'true') {
        logger.error('❌ Embedded Signup not enabled', {
          tenantId,
          embeddedSignupValue: settingsObj.meta_embedded_signup_enabled
        });
        return res.status(400).json({
          success: false,
          message: 'Facebook Embedded Signup is not enabled in system settings'
        });
      }

      if (!settingsObj.meta_app_id || !settingsObj.meta_app_secret) {
        logger.error('❌ Meta App credentials missing', {
          tenantId,
          hasAppId: !!settingsObj.meta_app_id,
          hasAppSecret: !!settingsObj.meta_app_secret
        });
        return res.status(400).json({
          success: false,
          message: 'Meta App credentials are not configured'
        });
      }

      logger.info('✅ Meta credentials validated', {
        tenantId,
        appId: settingsObj.meta_app_id,
        hasSecret: !!settingsObj.meta_app_secret
      });

      // Construct redirect URI - MUST match the one used in frontend OAuth dialog
      // Frontend uses: window.location.origin + '/admin/facebook-callback.html'
      const redirectUri = `${req.protocol}://${req.get('host')}/admin/facebook-callback.html`;
      logger.info('🔄 Redirect URI constructed', { redirectUri });

      // Step 1: Exchange code for access token
      logger.info('🔄 Step 1: Exchanging code for access token', { tenantId });
      const tokenData = await WhatsAppCloudController.exchangeCodeForToken(
        code || auth_response.code,
        settingsObj.meta_app_id,
        settingsObj.meta_app_secret,
        redirectUri
      );

      logger.info('✅ Step 1 completed: Token exchange successful', { 
        tenantId,
        hasAccessToken: !!tokenData.access_token,
        tokenType: tokenData.token_type
      });

      // Step 2: Get WABA details from Meta API
      logger.info('🔄 Step 2: Getting WABA details', { tenantId });
      
      let wabaDetails;
      try {
        wabaDetails = await WhatsAppCloudController.getWABADetails(tokenData.access_token);
      } catch (wabaError) {
        logger.warn('⚠️ Failed to get WABA from API, checking auth_response', { 
          error: wabaError.message 
        });
        
        // Fallback: Check if auth_response contains WABA info
        if (auth_response && (auth_response.waba_id || auth_response.phone_number_id)) {
          logger.info('✅ Using WABA info from auth_response');
          wabaDetails = {
            id: auth_response.waba_id || auth_response.business_id,
            name: auth_response.account_name || auth_response.business_name || 'WhatsApp Business Account',
            phone_number_id: auth_response.phone_number_id,
            phone_number: auth_response.phone_number || auth_response.display_phone_number,
            verified_name: auth_response.verified_name
          };
        } else {
          // If no WABA info available, throw the original error
          throw wabaError;
        }
      }

      logger.info('✅ Step 2 completed: WABA details retrieved', { 
        tenantId, 
        wabaId: wabaDetails.id,
        wabaName: wabaDetails.name,
        phoneNumberId: wabaDetails.phone_number_id,
        phoneNumber: wabaDetails.phone_number
      });

      // Step 3: Check if account already exists
      logger.info('🔄 Step 3: Checking for existing account', { 
        tenantId, 
        wabaId: wabaDetails.id 
      });
      const [existing] = await pool.execute(
        'SELECT id FROM whatsapp_cloud_accounts WHERE waba_id = ? AND tenant_id = ?',
        [wabaDetails.id, tenantId]
      );

      let accountId;

      if (existing.length > 0) {
        // Update existing account
        accountId = existing[0].id;
        logger.info('🔄 Updating existing account', { tenantId, accountId });
        
        await pool.execute(
          `UPDATE whatsapp_cloud_accounts 
           SET account_name = ?, phone_number_id = ?, phone_number = ?, 
               access_token = ?, status = 'connected', updated_at = NOW()
           WHERE id = ?`,
          [
            wabaDetails.name,
            wabaDetails.phone_number_id,
            wabaDetails.phone_number,
            tokenData.access_token,
            accountId
          ]
        );
        logger.info('✅ WhatsApp account updated successfully', { tenantId, accountId });
      } else {
        // Check if this is the first account for this tenant
        logger.info('🔄 Creating new account', { tenantId });
        const [accountCount] = await pool.execute(
          'SELECT COUNT(*) as count FROM whatsapp_cloud_accounts WHERE tenant_id = ?',
          [tenantId]
        );
        const isFirstAccount = accountCount[0].count === 0;
        
        logger.info('📊 Account count check', { 
          tenantId, 
          existingCount: accountCount[0].count,
          isFirstAccount 
        });

        // Insert new account
        const [result] = await pool.execute(
          `INSERT INTO whatsapp_cloud_accounts 
           (tenant_id, account_name, waba_id, phone_number_id, phone_number, 
            access_token, status, is_default)
           VALUES (?, ?, ?, ?, ?, ?, 'connected', ?)`,
          [
            tenantId,
            wabaDetails.name,
            wabaDetails.id,
            wabaDetails.phone_number_id,
            wabaDetails.phone_number,
            tokenData.access_token,
            isFirstAccount
          ]
        );
        accountId = result.insertId;
        logger.info('✅ WhatsApp account created successfully', { 
          tenantId, 
          accountId,
          insertId: result.insertId,
          affectedRows: result.affectedRows
        });
      }

      logger.info('🎉 Facebook callback completed successfully', {
        tenantId,
        accountId,
        wabaId: wabaDetails.id,
        accountName: wabaDetails.name,
        phoneNumber: wabaDetails.phone_number
      });

      return res.json({
        success: true,
        message: 'WhatsApp account connected successfully',
        data: {
          account_id: accountId,
          account_name: wabaDetails.name,
          phone_number: wabaDetails.phone_number,
          waba_id: wabaDetails.id
        }
      });
    } catch (error) {
      logger.error('❌ Facebook callback error', { 
        error: error.message, 
        stack: error.stack,
        response: error.response?.data,
        tenantId: req.tenantId || req.user?.tenantId,
        userId: req.user?.id
      });
      
      return res.status(500).json({
        success: false,
        message: error.response?.data?.error?.message || error.message || 'Failed to process Facebook login'
      });
    }
  }

  /**
   * Exchange authorization code for access token
   */
  static async exchangeCodeForToken(code, appId, appSecret, redirectUri = null) {
    try {
      logger.info('🔄 Attempting token exchange', {
        hasCode: !!code,
        codeLength: code?.length,
        hasAppId: !!appId,
        hasAppSecret: !!appSecret,
        appId: appId,
        redirectUri: redirectUri
      });

      const params = {
        client_id: appId,
        client_secret: appSecret,
        code: code
      };

      // Add redirect_uri if provided (required by some OAuth flows)
      if (redirectUri) {
        params.redirect_uri = redirectUri;
      }

      const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: params
      });

      logger.info('✅ Token exchange successful', {
        hasAccessToken: !!response.data?.access_token,
        tokenType: response.data?.token_type
      });

      return response.data;
    } catch (error) {
      logger.error('❌ Token exchange failed', { 
        error: error.message,
        responseStatus: error.response?.status,
        responseData: error.response?.data,
        hasCode: !!code,
        hasAppId: !!appId,
        hasAppSecret: !!appSecret
      });
      
      // Return more specific error message from Facebook
      const fbError = error.response?.data?.error;
      if (fbError) {
        throw new Error(`Facebook API Error: ${fbError.message || fbError.error_user_msg || 'Token exchange failed'}`);
      }
      
      throw new Error('Failed to exchange authorization code for access token');
    }
  }

  /**
   * Get WABA details from Meta API
   */
  static async getWABADetails(accessToken) {
    try {
      logger.info('🔄 Getting WABA details from Meta API');

      // Try multiple approaches to get WABA information
      let wabaList = [];

      // Approach 1: Try to get directly from /me/whatsapp_business_accounts
      try {
        logger.info('Trying approach 1: /me/whatsapp_business_accounts');
        const wabaResponse = await axios.get('https://graph.facebook.com/v18.0/me/whatsapp_business_accounts', {
          params: {
            access_token: accessToken,
            fields: 'id,name,phone_numbers{id,display_phone_number,verified_name}'
          }
        });
        wabaList = wabaResponse.data.data || [];
        logger.info('Approach 1 result', { count: wabaList.length });
      } catch (err) {
        logger.warn('Approach 1 failed', { error: err.message });
      }

      // Approach 2: Try to get from businesses
      if (wabaList.length === 0) {
        try {
          logger.info('Trying approach 2: /me/businesses');
          const businessesResponse = await axios.get('https://graph.facebook.com/v18.0/me/businesses', {
            params: {
              access_token: accessToken,
              fields: 'owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}'
            }
          });
          
          if (businessesResponse.data.data && businessesResponse.data.data.length > 0) {
            for (const business of businessesResponse.data.data) {
              if (business.owned_whatsapp_business_accounts?.data) {
                wabaList.push(...business.owned_whatsapp_business_accounts.data);
              }
            }
          }
          logger.info('Approach 2 result', { count: wabaList.length });
        } catch (err) {
          logger.warn('Approach 2 failed', { error: err.message });
        }
      }

      // Approach 3: Try to get from client_whatsapp_business_accounts
      if (wabaList.length === 0) {
        try {
          logger.info('Trying approach 3: Get user ID first');
          const meResponse = await axios.get('https://graph.facebook.com/v18.0/me', {
            params: {
              access_token: accessToken,
              fields: 'id'
            }
          });
          
          const userId = meResponse.data.id;
          logger.info('Got user ID', { userId });

          const clientWabaResponse = await axios.get(`https://graph.facebook.com/v18.0/${userId}/client_whatsapp_business_accounts`, {
            params: {
              access_token: accessToken,
              fields: 'id,name,phone_numbers{id,display_phone_number,verified_name}'
            }
          });
          wabaList = clientWabaResponse.data.data || [];
          logger.info('Approach 3 result', { count: wabaList.length });
        } catch (err) {
          logger.warn('Approach 3 failed', { error: err.message, response: err.response?.data });
        }
      }

      if (!wabaList || wabaList.length === 0) {
        logger.error('No WABA found with any approach');
        throw new Error('No WhatsApp Business Accounts found. Please make sure you have completed the Embedded Signup flow and have access to a WhatsApp Business Account.');
      }

      logger.info('✅ Found WABAs', { count: wabaList.length });

      // Get the first WABA and its first phone number
      const waba = wabaList[0];
      const phoneNumbers = waba.phone_numbers?.data || [];

      logger.info('Selected WABA', { 
        wabaId: waba.id, 
        wabaName: waba.name,
        phoneNumbersCount: phoneNumbers.length 
      });

      if (phoneNumbers.length === 0) {
        throw new Error('No phone numbers found for this WhatsApp Business Account. Please add a phone number in Meta Business Manager.');
      }

      const phoneNumber = phoneNumbers[0];

      return {
        id: waba.id,
        name: waba.name || 'WhatsApp Business Account',
        phone_number_id: phoneNumber.id,
        phone_number: phoneNumber.display_phone_number,
        verified_name: phoneNumber.verified_name
      };
    } catch (error) {
      logger.error('❌ Failed to get WABA details', { 
        error: error.message,
        response: error.response?.data 
      });
      throw new Error(error.response?.data?.error?.message || 'Failed to retrieve WhatsApp Business Account details');
    }
  }

  /**
   * Get all WhatsApp Cloud accounts for tenant
   * GET /api/whatsapp-cloud/accounts
   */
  static async getAccounts(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }

      // Check if user is admin
      if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'superadmin')) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required.'
        });
      }

      const [accounts] = await pool.execute(
        `SELECT id, account_name, waba_id, phone_number_id, phone_number, 
                status, is_default, webhook_verified, verify_token, templates_synced_at, templates_count,
                created_at, updated_at
         FROM whatsapp_cloud_accounts 
         WHERE tenant_id = ?
         ORDER BY is_default DESC, created_at DESC`,
        [tenantId]
      );

      return res.json({
        success: true,
        data: accounts
      });
    } catch (error) {
      logger.error('Error getting WhatsApp accounts', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        message: 'Failed to load WhatsApp accounts'
      });
    }
  }

  /**
   * Set default WhatsApp account
   * PUT /api/whatsapp-cloud/accounts/:id/set-default
   */
  static async setDefaultAccount(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const accountId = req.params.id;

      // Verify account belongs to tenant
      const [accounts] = await pool.execute(
        'SELECT id FROM whatsapp_cloud_accounts WHERE id = ? AND tenant_id = ?',
        [accountId, tenantId]
      );

      if (accounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      // Remove default from all accounts
      await pool.execute(
        'UPDATE whatsapp_cloud_accounts SET is_default = FALSE WHERE tenant_id = ?',
        [tenantId]
      );

      // Set new default
      await pool.execute(
        'UPDATE whatsapp_cloud_accounts SET is_default = TRUE WHERE id = ?',
        [accountId]
      );

      logger.info('Default WhatsApp account updated', { tenantId, accountId });

      return res.json({
        success: true,
        message: 'Default account updated successfully'
      });
    } catch (error) {
      logger.error('Error setting default account', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to update default account'
      });
    }
  }

  /**
   * Delete WhatsApp account
   * DELETE /api/whatsapp-cloud/accounts/:id
   */
  static async deleteAccount(req, res) {
    const connection = await pool.getConnection();
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const accountId = req.params.id;

      logger.info('Delete account request', { tenantId, accountId, userId: req.user?.id });

      // Verify account belongs to tenant
      const [accounts] = await connection.execute(
        'SELECT id, account_name, is_default FROM whatsapp_cloud_accounts WHERE id = ? AND tenant_id = ?',
        [accountId, tenantId]
      );

      if (accounts.length === 0) {
        logger.warn('Account not found for deletion', { tenantId, accountId });
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      const account = accounts[0];
      const wasDefault = account.is_default;

      logger.info('Starting account deletion process', { 
        tenantId, 
        accountId, 
        accountName: account.account_name,
        wasDefault 
      });

      // Start transaction for complete deletion
      await connection.beginTransaction();

      try {
        // Delete related messages first
        const [messageResult] = await connection.execute(
          `DELETE wm FROM whatsapp_cloud_messages wm 
           INNER JOIN whatsapp_cloud_conversations wc ON wm.conversation_id = wc.id 
           WHERE wc.account_id = ?`,
          [accountId]
        );
        logger.info('Deleted messages', { accountId, deletedMessages: messageResult.affectedRows });

        // Delete related conversations
        const [conversationResult] = await connection.execute(
          'DELETE FROM whatsapp_cloud_conversations WHERE account_id = ?',
          [accountId]
        );
        logger.info('Deleted conversations', { accountId, deletedConversations: conversationResult.affectedRows });

        const [campaignResult] = await connection.execute(
          'DELETE FROM whatsapp_cloud_campaigns WHERE account_id = ?',
          [accountId]
        );
        logger.info('Deleted campaigns', { accountId, deletedCampaigns: campaignResult.affectedRows });

        const [templateResult] = await connection.execute(
          'DELETE FROM whatsapp_cloud_templates WHERE account_id = ?',
          [accountId]
        );
        logger.info('Deleted templates', { accountId, deletedTemplates: templateResult.affectedRows });

        // Delete the account itself
        const [accountResult] = await connection.execute(
          'DELETE FROM whatsapp_cloud_accounts WHERE id = ?',
          [accountId]
        );
        logger.info('Deleted account', { accountId, deletedAccounts: accountResult.affectedRows });

        // If deleted account was default, set another as default
        if (wasDefault) {
          const [defaultResult] = await connection.execute(
            `UPDATE whatsapp_cloud_accounts 
             SET is_default = TRUE 
             WHERE tenant_id = ? 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [tenantId]
          );
          logger.info('Updated default account', { tenantId, updatedRows: defaultResult.affectedRows });
        }

        // Commit transaction
        await connection.commit();

        logger.info('WhatsApp account completely deleted from database', { 
          tenantId, 
          accountId, 
          accountName: account.account_name,
          deletedMessages: messageResult.affectedRows,
          deletedConversations: conversationResult.affectedRows
        });

        return res.json({
          success: true,
          message: `Account "${account.account_name}" and all related data have been permanently deleted from the database`
        });

      } catch (transactionError) {
        // Rollback transaction on error
        await connection.rollback();
        throw transactionError;
      }

    } catch (error) {
      logger.error('Error deleting account', { 
        error: error.message, 
        stack: error.stack,
        tenantId: req.tenantId || req.user?.tenantId,
        accountId: req.params.id
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to delete account from database'
      });
    } finally {
      connection.release();
    }
  }

  /**
   * Update WhatsApp account manually
   * PUT /api/whatsapp-cloud/accounts/:id
   */
  static async updateAccount(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const accountId = req.params.id;
      const {
        account_name,
        waba_id,
        phone_number_id,
        phone_number,
        access_token,
        app_id,
        app_secret,
        verify_token
      } = req.body;

      // Verify account belongs to tenant
      const [accounts] = await pool.execute(
        'SELECT id FROM whatsapp_cloud_accounts WHERE id = ? AND tenant_id = ?',
        [accountId, tenantId]
      );

      if (accounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      const updates = [];
      const values = [];

      if (account_name !== undefined) {
        updates.push('account_name = ?');
        values.push(account_name);
      }
      if (waba_id !== undefined) {
        updates.push('waba_id = ?');
        values.push(waba_id);
      }
      if (phone_number_id !== undefined) {
        updates.push('phone_number_id = ?');
        values.push(phone_number_id);
      }
      if (phone_number !== undefined) {
        updates.push('phone_number = ?');
        values.push(phone_number);
      }
      if (access_token !== undefined && access_token !== '********') {
        updates.push('access_token = ?');
        values.push(access_token);
      }
      if (app_id !== undefined) {
        updates.push('app_id = ?');
        values.push(app_id);
      }
      if (app_secret !== undefined && app_secret !== '********') {
        updates.push('app_secret = ?');
        values.push(app_secret);
      }
      if (verify_token !== undefined) {
        updates.push('verify_token = ?');
        values.push(verify_token);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
      }

      updates.push('updated_at = NOW()');
      values.push(accountId);

      await pool.execute(
        `UPDATE whatsapp_cloud_accounts SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      logger.info('WhatsApp account updated', { tenantId, accountId });

      return res.json({
        success: true,
        message: 'Account updated successfully'
      });
    } catch (error) {
      logger.error('Error updating account', { error: error.message });
      return res.status(500).json({
        success: false,
        message: 'Failed to update account'
      });
    }
  }

  /**
   * Test WhatsApp account connection
   * POST /api/whatsapp-cloud/accounts/:id/test
   */
  static async testAccount(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const accountId = req.params.id;

      // Get account details
      const [accounts] = await pool.execute(
        'SELECT phone_number_id, access_token FROM whatsapp_cloud_accounts WHERE id = ? AND tenant_id = ?',
        [accountId, tenantId]
      );

      if (accounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      const account = accounts[0];

      // Test connection by getting phone number details
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}`,
        {
          params: {
            access_token: account.access_token,
            fields: 'id,display_phone_number,verified_name,quality_rating'
          }
        }
      );

      return res.json({
        success: true,
        message: 'Connection test successful',
        data: {
          phone_number: response.data.display_phone_number,
          verified_name: response.data.verified_name,
          quality_rating: response.data.quality_rating
        }
      });
    } catch (error) {
      logger.error('Connection test failed', { 
        error: error.message,
        response: error.response?.data 
      });
      
      return res.status(400).json({
        success: false,
        message: error.response?.data?.error?.message || 'Connection test failed',
        error: error.response?.data
      });
    }
  }

  /**
   * Webhook verification (GET)
   * Facebook will call this to verify the webhook
   */
  static async webhookVerify(req, res) {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      logger.info('Webhook verification request', { mode, token: token ? '***' : 'none' });

      if (mode !== 'subscribe') {
        logger.warn('Invalid webhook mode', { mode });
        return res.sendStatus(403);
      }

      if (!token) {
        logger.warn('No verify token provided');
        return res.sendStatus(403);
      }

      // Check if any account has this verify token
      const [accounts] = await pool.execute(
        'SELECT id, account_name FROM whatsapp_cloud_accounts WHERE verify_token = ? AND webhook_verified = TRUE',
        [token]
      );

      if (accounts.length > 0) {
        logger.info('Webhook verified successfully', { 
          accountId: accounts[0].id, 
          accountName: accounts[0].account_name 
        });
        return res.status(200).send(challenge);
      } else {
        logger.warn('No account found with matching verify token');
        return res.sendStatus(403);
      }
    } catch (error) {
      logger.error('Webhook verification error', { error: error.message });
      return res.sendStatus(403);
    }
  }

  /**
   * Webhook receiver (POST)
   * Receives messages and events from WhatsApp
   */
  static async webhookReceive(req, res) {
    try {
      const body = req.body;

      logger.info('Webhook event received', { 
        object: body.object,
        entries: body.entry?.length,
        fullBody: JSON.stringify(body)
      });

      // Respond quickly to Facebook
      res.sendStatus(200);

      // Process webhook asynchronously
      if (body.object === 'whatsapp_business_account') {
        if (body.entry && body.entry.length > 0) {
          for (const entry of body.entry) {
            logger.info('Processing entry', { entryId: entry.id });
            
            if (entry.changes && entry.changes.length > 0) {
              for (const change of entry.changes) {
                logger.info('Processing change', { field: change.field });
                
                if (change.field === 'messages') {
                  await WhatsAppCloudController.processMessage(change.value);
                }
              }
            }
          }
        }
      } else {
        logger.warn('Unknown webhook object type', { object: body.object });
      }
    } catch (error) {
      logger.error('Webhook processing error', { 
        error: error.message, 
        stack: error.stack,
        body: JSON.stringify(req.body)
      });
      // Still return 200 to Facebook to avoid retries
      if (!res.headersSent) {
        res.sendStatus(200);
      }
    }
  }

  /**
   * Process incoming WhatsApp message
   */
  static async processMessage(value) {
    try {
      logger.info('Processing WhatsApp message', { 
        phoneNumberId: value.metadata?.phone_number_id,
        displayPhoneNumber: value.metadata?.display_phone_number,
        messagesCount: value.messages?.length,
        statusesCount: value.statuses?.length
      });

      // Handle message statuses (sent, delivered, read)
      if (value.statuses && value.statuses.length > 0) {
        logger.info('Received message statuses', { 
          count: value.statuses.length,
          statuses: value.statuses.map(s => ({ id: s.id, status: s.status }))
        });
        
        // Update message status in database
        for (const status of value.statuses) {
          await pool.execute(
            `UPDATE whatsapp_cloud_messages 
             SET status = ? 
             WHERE message_id = ?`,
            [status.status, status.id]
          );
          logger.info('Message status updated', { messageId: status.id, status: status.status });
        }
        return;
      }

      if (!value.messages || value.messages.length === 0) {
        logger.info('No messages to process');
        return;
      }

      const phoneNumberId = value.metadata?.phone_number_id;
      
      if (!phoneNumberId) {
        logger.error('No phone_number_id in metadata');
        return;
      }

      // Find which tenant owns this phone number
      const [accounts] = await pool.execute(
        'SELECT id, tenant_id, account_name, access_token, phone_number_id FROM whatsapp_cloud_accounts WHERE phone_number_id = ?',
        [phoneNumberId]
      );

      if (accounts.length === 0) {
        logger.warn('No account found for phone number', { phoneNumberId });
        return;
      }

      const account = accounts[0];
      const tenantId = account.tenant_id;
      const accountId = account.id;
      
      logger.info('Found tenant for message', { tenantId, accountId, accountName: account.account_name });
      if (!account.access_token || !account.phone_number_id) {
        logger.error('Account missing WhatsApp credentials', { accountId, hasAccessToken: !!account.access_token, hasPhoneNumberId: !!account.phone_number_id });
      }

      // Mark webhook as verified for this account upon receiving any event
      try {
        await pool.execute(
          'UPDATE whatsapp_cloud_accounts SET webhook_verified = TRUE, updated_at = NOW() WHERE id = ?',
          [accountId]
        );
      } catch (e) {
        logger.warn('Failed to mark webhook verified', { accountId, error: e.message });
      }

      // Process each message
      for (const message of value.messages) {
        try {
          const contactPhone = message.from;
          const contactName = value.contacts?.[0]?.profile?.name || contactPhone;
          
          logger.info('Processing message', {
            tenantId,
            accountId,
            from: contactPhone,
            type: message.type,
            messageId: message.id,
            timestamp: message.timestamp
          });

          // Get or create conversation
          let conversationId;
          const [existingConv] = await pool.execute(
            'SELECT id FROM whatsapp_cloud_conversations WHERE account_id = ? AND contact_phone = ?',
            [accountId, contactPhone]
          );

          if (existingConv.length > 0) {
            conversationId = existingConv[0].id;
            
            // Update conversation
            await pool.execute(
              `UPDATE whatsapp_cloud_conversations 
               SET last_message_text = ?, 
                   last_message_time = FROM_UNIXTIME(?), 
                   last_message_from = 'customer',
                   unread_count = unread_count + 1,
                   contact_name = ?,
                   updated_at = NOW()
               WHERE id = ?`,
              [
                message.text?.body || `[${message.type}]`,
                message.timestamp,
                contactName,
                conversationId
              ]
            );
          } else {
            // Create new conversation (unassigned - no store/department)
            const [result] = await pool.execute(
              `INSERT INTO whatsapp_cloud_conversations 
               (tenant_id, account_id, contact_phone, contact_name, last_message_text, 
                last_message_time, last_message_from, unread_count, status, store_id, department_id)
               VALUES (?, ?, ?, ?, ?, FROM_UNIXTIME(?), 'customer', 1, 'open', NULL, NULL)`,
              [
                tenantId,
                accountId,
                contactPhone,
                contactName,
                message.text?.body || `[${message.type}]`,
                message.timestamp
              ]
            );
            conversationId = result.insertId;
          }

          // Extract message content based on type
          let textBody = null;
          let mediaUrl = null;
          let mediaMimeType = null;
          let mediaCaption = null;
          let mediaFilename = null;

          switch (message.type) {
            case 'text':
              textBody = message.text?.body;
              break;
            case 'image':
              mediaUrl = message.image?.id; // Store media ID, will need to download later
              mediaMimeType = message.image?.mime_type;
              mediaCaption = message.image?.caption;
              break;
            case 'video':
              mediaUrl = message.video?.id;
              mediaMimeType = message.video?.mime_type;
              mediaCaption = message.video?.caption;
              break;
            case 'audio':
              mediaUrl = message.audio?.id;
              mediaMimeType = message.audio?.mime_type;
              break;
            case 'document':
              mediaUrl = message.document?.id;
              mediaMimeType = message.document?.mime_type;
              mediaCaption = message.document?.caption;
              mediaFilename = message.document?.filename;
              break;
            case 'interactive': {
              const buttonTitle = message.interactive?.button_reply?.title;
              const listTitle = message.interactive?.list_reply?.title;
              const listDescription = message.interactive?.list_reply?.description;
              const replyId = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id;
              textBody = buttonTitle || listTitle || listDescription || replyId || null;
              break;
            }
            case 'location':
              textBody = `Location: ${message.location?.latitude}, ${message.location?.longitude}`;
              break;
            case 'sticker':
              mediaUrl = message.sticker?.id;
              mediaMimeType = message.sticker?.mime_type;
              break;
          }

          if (!textBody && mediaCaption) {
            textBody = mediaCaption;
          }

          // Save message to database
          // Simple INSERT with only the columns that definitely exist
          await pool.execute(
            `INSERT INTO whatsapp_cloud_messages 
             (conversation_id, message_id, message_type, text_content, media_url, status)
             VALUES (?, ?, ?, ?, ?, 'delivered')`,
            [
              conversationId,
              message.id,
              message.type,
              textBody || mediaCaption || `[${message.type}]`,
              mediaUrl
            ]
          );

          logger.info('Message saved to database', {
            tenantId,
            accountId,
            conversationId,
            messageId: message.id,
            type: message.type
          });

          await WhatsAppCloudController.processFlowAutoReply({
            tenantId,
            accountId,
            account,
            conversationId,
            contactPhone,
            contactName,
            message,
            textBody
          });

          /* FAQ auto-reply disabled for now
          let faqHandled = false;
          try {
            const faqResult = await WhatsAppCloudFAQService.processMessage(
              tenantId,
              accountId,
              conversationId,
              textBody || '',
              contactPhone,
              { contactName, messageType: message?.type || 'text' }
            );
            faqHandled = !!faqResult?.matched;
          } catch (faqError) {
            logger.error('Error processing FAQ auto-reply', { error: faqError.message });
          }
          if (!faqHandled) {
            logger.debug('No flow or FAQ match');
          }
          */

        } catch (msgError) {
          console.error('❌ ERROR PROCESSING MESSAGE:', {
            error: msgError.message,
            stack: msgError.stack,
            messageId: message?.id,
            messageType: message?.type,
            sqlMessage: msgError.sqlMessage,
            code: msgError.code,
            errno: msgError.errno,
            sql: msgError.sql
          });
          
          logger.error('Error processing individual message', {
            error: msgError.message,
            stack: msgError.stack,
            messageId: message?.id,
            messageType: message?.type,
            sqlMessage: msgError.sqlMessage,
            code: msgError.code,
            errno: msgError.errno
          });
        }
      }
    } catch (error) {
      logger.error('Error processing message', { 
        error: error.message, 
        stack: error.stack,
        value: JSON.stringify(value)
      });
    }
  }

  static async processFlowAutoReply({
    tenantId,
    accountId,
    account,
    conversationId,
    contactPhone,
    contactName,
    message,
    textBody,
    retry = false
  }) {
    try {
      let flows = [];
      const accountIdValue = accountId !== undefined && accountId !== null ? String(accountId) : '';
      try {
        const [flowRows] = await pool.execute(
          `SELECT * FROM whatsapp_cloud_flows 
           WHERE tenant_id = ? 
             AND (active = 1 OR active IS NULL)
             AND (account_id = ? OR account_id IS NULL OR account_id = '' OR account_id = '0' OR account_id = 0)
           ORDER BY updated_at DESC`,
          [tenantId, accountIdValue]
        );
        flows = flowRows;
      } catch (error) {
        if (!retry && error.code === 'ER_NO_SUCH_TABLE') {
          await WhatsAppCloudController.ensureFlowTables();
          return WhatsAppCloudController.processFlowAutoReply({
            tenantId,
            accountId,
            account,
            conversationId,
            contactPhone,
            contactName,
            message,
            textBody,
            retry: true
          });
        }
        throw error;
      }

      if (!flows || flows.length === 0) {
        try {
          const [fallbackRows] = await pool.execute(
            `SELECT * FROM whatsapp_cloud_flows 
             WHERE tenant_id = ? AND (active = 1 OR active IS NULL)
             ORDER BY updated_at DESC`,
            [tenantId]
          );
          flows = fallbackRows;
        } catch (error) {
          throw error;
        }
      }

      if (!flows || flows.length === 0) {
        return false;
      }

      let sessions = [];
      try {
        const [sessionRows] = await pool.execute(
          `SELECT * FROM whatsapp_cloud_flow_sessions 
           WHERE tenant_id = ? AND contact_phone = ? AND (account_id = ? OR account_id IS NULL OR account_id = '' OR account_id = '0' OR account_id = 0)
           ORDER BY updated_at DESC LIMIT 1`,
          [tenantId, contactPhone, accountIdValue]
        );
        sessions = sessionRows;
      } catch (error) {
        if (!retry && error.code === 'ER_NO_SUCH_TABLE') {
          await WhatsAppCloudController.ensureFlowTables();
          return WhatsAppCloudController.processFlowAutoReply({
            tenantId,
            accountId,
            account,
            conversationId,
            contactPhone,
            contactName,
            message,
            textBody,
            retry: true
          });
        }
        throw error;
      }

      let activeSession = sessions?.[0] || null;
      let sessionVariables = activeSession
        ? WhatsAppCloudController.safeJsonParse(activeSession.variables, {})
        : {};
      const normalizedText = WhatsAppCloudController.normalizeFlowText(textBody || '');
      const messageWords = normalizedText.split(' ').filter(Boolean);
      const now = Date.now();
      const lastWelcomeAt = sessionVariables?.welcome?.lastSentAt
        ? Date.parse(sessionVariables.welcome.lastSentAt)
        : null;
      const welcomeCooldownMs = 70 * 60 * 1000;
      const isWelcomeCooldownActive = lastWelcomeAt && now - lastWelcomeAt < welcomeCooldownMs;
      let flowRow = null;

      if (activeSession) {
        flowRow = flows.find(f => f.flow_id === activeSession.flow_id);
        if (flowRow && (flowRow.trigger_type || 'keyword') === 'welcome' && isWelcomeCooldownActive && !activeSession.waiting_type) {
          activeSession = null;
          sessionVariables = {};
          flowRow = null;
        }
      }

      if (!flowRow) {
        flowRow = flows.find(f => {
          const triggerType = f.trigger_type || 'keyword';
          const triggerValue = (f.trigger_value || '').trim();
          if (triggerType === 'welcome') {
            return !isWelcomeCooldownActive;
          }
          if (triggerType === 'any' || triggerValue === '*' || !triggerValue) return true;
          if (triggerType === 'keyword') {
            return WhatsAppCloudController.isKeywordTriggerMatch(triggerValue, normalizedText, messageWords);
          }
          return triggerValue ? normalizedText.includes(WhatsAppCloudController.normalizeFlowText(triggerValue)) : true;
        });
      }

      if (!flowRow) return false;

      const nodes = WhatsAppCloudController.safeJsonParse(flowRow.nodes, []);
      const connections = WhatsAppCloudController.safeJsonParse(flowRow.connections, []);
      const flow = {
        id: flowRow.flow_id,
        nodes,
        connections
      };

      if (!flow.nodes || flow.nodes.length === 0) return false;

      if (activeSession && activeSession.waiting_type === 'ai') {
        const aiSettings = sessionVariables.ai || {};
        if (!aiSettings.aiConfigId) {
          if (sessionVariables.ai) delete sessionVariables.ai;
          await pool.execute(
            `UPDATE whatsapp_cloud_flow_sessions 
             SET waiting_node_id = NULL, waiting_type = NULL, variables = ? 
             WHERE id = ?`,
            [JSON.stringify(sessionVariables), activeSession.id]
          );
        } else {
          const aiHandled = await WhatsAppCloudController.processCloudAIResponse({
            tenantId,
            account,
            conversationId,
            contactPhone,
            message,
            textBody,
            aiSettings
          });
          return aiHandled;
        }
      }

      if (activeSession && activeSession.waiting_type) {
        const waitNode = flow.nodes.find(n => n.id === activeSession.waiting_node_id);
        if (waitNode) {
          const nextNodeId = WhatsAppCloudController.resolveWaitingNextNode(waitNode, message, flow.connections);
          if (nextNodeId) {
            await pool.execute(
              `UPDATE whatsapp_cloud_flow_sessions 
               SET current_node_id = ?, waiting_node_id = NULL, waiting_type = NULL 
               WHERE id = ?`,
              [nextNodeId, activeSession.id]
            );
            await WhatsAppCloudController.executeFlowFromNode({
              tenantId,
              accountId,
              account,
              conversationId,
              contactPhone,
              contactName,
              flow,
              startNodeId: nextNodeId,
              sessionId: activeSession.id,
              message,
              textBody
            });
            return true;
          }
          await pool.execute(
            `UPDATE whatsapp_cloud_flow_sessions 
             SET waiting_node_id = NULL, waiting_type = NULL 
             WHERE id = ?`,
            [activeSession.id]
          );
          activeSession.waiting_node_id = null;
          activeSession.waiting_type = null;
        }
      }

      const startNode = WhatsAppCloudController.getStartNode(flow);
      if (!startNode) return false;

      let sessionId = activeSession?.id;
      const isWelcomeFlow = (flowRow.trigger_type || 'keyword') === 'welcome';
      if (isWelcomeFlow) {
        sessionVariables = {
          ...sessionVariables,
          welcome: {
            ...sessionVariables.welcome,
            lastSentAt: new Date().toISOString()
          }
        };
      }
      if (!sessionId) {
        const [result] = await pool.execute(
          `INSERT INTO whatsapp_cloud_flow_sessions 
           (tenant_id, account_id, contact_phone, flow_id, current_node_id, variables)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [tenantId, String(accountId), contactPhone, flow.id, startNode.id, JSON.stringify(sessionVariables)]
        );
        sessionId = result.insertId;
      } else {
        await pool.execute(
          `UPDATE whatsapp_cloud_flow_sessions SET current_node_id = ?, variables = ? WHERE id = ?`,
          [startNode.id, JSON.stringify(sessionVariables), sessionId]
        );
      }

      await WhatsAppCloudController.executeFlowFromNode({
        tenantId,
        accountId,
        account,
        conversationId,
        contactPhone,
        contactName,
        flow,
        startNodeId: startNode.id,
        sessionId,
        message,
        textBody
      });
      return true;
    } catch (error) {
      logger.error('Error processing flow auto-reply', { 
        error: error.message,
        stack: error.stack,
        code: error.code,
        sqlMessage: error.sqlMessage
      });
      return false;
    }
  }

  static async sendFlowMediaMessage({ tenantId, account, conversationId, contactPhone, node }) {
    try {
      if (!account?.access_token || !account?.phone_number_id) {
        logger.error('Media message missing account credentials', { accountId: account?.id });
        return false;
      }
      const mediaType = (node.config?.mediaType || 'document').toLowerCase();
      const mediaUrl = node.config?.mediaUrl || '';
      const caption = node.config?.caption || '';
      if (!mediaUrl.trim()) {
        logger.error('Media message missing media URL', { nodeId: node.id });
        return false;
      }

      const allowedTypes = new Set(['image', 'video', 'audio', 'document']);
      const type = allowedTypes.has(mediaType) ? mediaType : 'document';
      const payload = {
        messaging_product: 'whatsapp',
        to: contactPhone,
        type
      };

      if (/^https?:\/\//i.test(mediaUrl.trim())) {
        payload[type] = { link: mediaUrl.trim() };
        if (caption && type !== 'audio') {
          payload[type].caption = caption.trim();
        }
      } else {
        const fs = require('fs');
        const path = require('path');
        const FormData = require('form-data');
        let actualPath = mediaUrl.trim();
        if (actualPath.startsWith('/uploads/')) {
          actualPath = path.join(__dirname, '..', actualPath);
        } else if (!path.isAbsolute(actualPath)) {
          actualPath = path.join(__dirname, '..', actualPath);
        }
        if (!fs.existsSync(actualPath)) {
          logger.error('Media file not found for flow', { nodeId: node.id, path: actualPath });
          return false;
        }
        const formData = new FormData();
        formData.append('messaging_product', 'whatsapp');
        formData.append('file', fs.createReadStream(actualPath));
        const uploadResponse = await axios.post(
          `https://graph.facebook.com/v18.0/${account.phone_number_id}/media`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${account.access_token}`,
              ...formData.getHeaders()
            }
          }
        );
        const mediaId = uploadResponse.data.id;
        payload[type] = { id: mediaId };
        if (caption && type !== 'audio') {
          payload[type].caption = caption.trim();
        }
      }

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const messageId = response?.data?.messages?.[0]?.id || `flow_${Date.now()}`;
      const summary = caption?.trim() || `[${type}]`;
      await pool.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (conversation_id, message_id, direction, message_type, text_content, media_url, status, timestamp, created_at)
         VALUES (?, ?, 'outbound', ?, ?, ?, 'sent', NOW(), NOW())`,
        [conversationId, messageId, type, summary, mediaUrl.trim()]
      );

      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET last_message_text = ?, last_message_time = NOW(), last_message_from = 'business', updated_at = NOW()
         WHERE id = ?`,
        [summary, conversationId]
      );
      return true;
    } catch (error) {
      logger.error('Error sending flow media message', { 
        error: error.message, 
        stack: error.stack, 
        response: error.response?.data || null 
      });
      return false;
    }
  }

  static async sendFlowMenuOptionsMessage({ tenantId, account, conversationId, contactPhone, node }) {
    try {
      if (!account?.access_token || !account?.phone_number_id) {
        logger.error('Menu options message missing account credentials', { accountId: account?.id });
        return false;
      }
      const prompt = node.config?.prompt || '';
      const options = (node.config?.options || []).filter(opt => opt.label && opt.label.trim()).slice(0, 10);
      if (options.length === 0) {
        logger.error('Menu options has no valid options', { nodeId: node.id });
        return false;
      }
      const truncate = (text, max) => text.length > max ? text.slice(0, max - 1) : text;
      const bodyText = truncate((prompt && prompt.trim() ? prompt.trim() : 'Selecione uma opção'), 1024);

      const payload = {
        messaging_product: 'whatsapp',
        to: contactPhone,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: bodyText },
          action: {
            button: 'Selecionar',
            sections: [
              {
                title: 'Opções',
                rows: options.map((opt, index) => ({
                  id: truncate((opt.value || `row_${node.id}_${index}`).trim(), 200),
                  title: truncate(opt.label.trim(), 24)
                }))
              }
            ]
          }
        }
      };

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const messageId = response?.data?.messages?.[0]?.id || `flow_${Date.now()}`;
      const summary = bodyText || options.map(opt => opt.label).join(', ');
      await pool.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (conversation_id, message_id, direction, message_type, text_content, status, timestamp, created_at)
         VALUES (?, ?, 'outbound', 'interactive', ?, 'sent', NOW(), NOW())`,
        [conversationId, messageId, summary]
      );

      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET last_message_text = ?, last_message_time = NOW(), last_message_from = 'business', updated_at = NOW()
         WHERE id = ?`,
        [summary, conversationId]
      );
      return true;
    } catch (error) {
      logger.error('Error sending menu options message', { 
        error: error.message, 
        stack: error.stack, 
        response: error.response?.data || null 
      });
      return false;
    }
  }

  static safeJsonParse(value, fallback) {
    if (!value) return fallback;
    try {
      if (typeof value === 'object') return value;
      return JSON.parse(value);
    } catch (error) {
      logger.error('Error parsing flow JSON', { error: error.message });
      return fallback;
    }
  }

  static normalizeFlowText(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static isKeywordTriggerMatch(triggerValue, normalizedText, messageWords) {
    const normalizedTrigger = WhatsAppCloudController.normalizeFlowText(triggerValue || '');
    if (!normalizedTrigger) return false;
    if (normalizedTrigger.includes(' ')) {
      return normalizedText.includes(normalizedTrigger);
    }
    return messageWords.includes(normalizedTrigger);
  }

  static async ensureFlowTables() {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_flows (
        id INT AUTO_INCREMENT PRIMARY KEY,
        flow_id VARCHAR(64) NOT NULL,
        tenant_id INT NOT NULL,
        account_id VARCHAR(64),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        active BOOLEAN DEFAULT FALSE,
        trigger_type VARCHAR(50),
        trigger_value VARCHAR(255),
        nodes JSON,
        connections JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_flow (tenant_id, flow_id),
        INDEX idx_tenant (tenant_id),
        INDEX idx_account (account_id),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_cloud_flow_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        account_id VARCHAR(64),
        contact_phone VARCHAR(30) NOT NULL,
        flow_id VARCHAR(64) NOT NULL,
        current_node_id VARCHAR(64),
        waiting_node_id VARCHAR(64),
        waiting_type VARCHAR(32),
        variables JSON,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_session (tenant_id, account_id, contact_phone, flow_id),
        INDEX idx_contact (contact_phone),
        INDEX idx_flow (flow_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  static resolveWaitingNextNode(node, message, connections) {
    if (node.type === 'button_message') {
      const replyId = message?.interactive?.button_reply?.id || message?.button?.payload || message?.button?.text;
      const replyText = message?.interactive?.button_reply?.title || message?.button?.text || message?.text?.body || '';
      const buttons = node.config?.buttons || [];
      const matchIndex = buttons.findIndex((btn, idx) => {
        const expectedId = `btn_${node.id}_${idx}`;
        return replyId === expectedId || replyText === btn.text;
      });
      if (matchIndex >= 0) {
        const handle = `button-${matchIndex}`;
        const conn = connections.find(c => c.from === node.id && (c.fromHandle || 'default') === handle);
        return conn?.to || null;
      }
    }

    if (node.type === 'list_message') {
      const replyId = message?.interactive?.list_reply?.id;
      const items = node.config?.items || [];
      const matchIndex = items.findIndex((item, idx) => {
        const expectedId = item.id || `row_${node.id}_${idx}`;
        return replyId === expectedId;
      });
      if (matchIndex >= 0) {
        const conn = connections.find(c => c.from === node.id);
        return conn?.to || null;
      }
    }

    if (node.type === 'menu_options') {
      const replyId = message?.interactive?.list_reply?.id;
      const options = node.config?.options || [];
      const matchIndex = options.findIndex((opt, idx) => {
        const expectedId = opt.value || `row_${node.id}_${idx}`;
        return replyId === expectedId;
      });
      if (matchIndex >= 0) {
        const conn = connections.find(c => c.from === node.id);
        return conn?.to || null;
      }
    }

    return null;
  }

  static getStartNode(flow) {
    const targets = new Set((flow.connections || []).map(c => c.to));
    const start = (flow.nodes || []).find(n => !targets.has(n.id));
    return start || (flow.nodes || [])[0] || null;
  }

  static getNextNodeId(flow, nodeId, handle = 'default') {
    const conn = (flow.connections || []).find(c => c.from === nodeId && (c.fromHandle || 'default') === handle);
    return conn?.to || null;
  }

  static async executeFlowFromNode({
    tenantId,
    accountId,
    account,
    conversationId,
    contactPhone,
    contactName,
    flow,
    startNodeId,
    sessionId,
    message,
    textBody
  }) {
    let currentNodeId = startNodeId;
    let steps = 0;

    while (currentNodeId && steps < 10) {
      steps += 1;
      const node = (flow.nodes || []).find(n => n.id === currentNodeId);
      if (!node) break;

      if (node.type === 'send_message') {
        const body = node.config?.message || node.content || '';
        if (body) {
          const sent = await WhatsAppCloudController.sendFlowTextMessage({
            tenantId,
            account,
            conversationId,
            contactPhone,
            message: body
          });
          if (!sent) {
            return;
          }
        }
        currentNodeId = WhatsAppCloudController.getNextNodeId(flow, node.id);
        continue;
      }

      if (node.type === 'button_message') {
        const sent = await WhatsAppCloudController.sendFlowButtonsMessage({
          tenantId,
          account,
          conversationId,
          contactPhone,
          node
        });
        if (!sent) {
          return;
        }
        await pool.execute(
          `UPDATE whatsapp_cloud_flow_sessions 
           SET current_node_id = ?, waiting_node_id = ?, waiting_type = ? 
           WHERE id = ?`,
          [node.id, node.id, 'button_message', sessionId]
        );
        return;
      }

      if (node.type === 'list_message') {
        const sent = await WhatsAppCloudController.sendFlowListMessage({
          tenantId,
          account,
          conversationId,
          contactPhone,
          node
        });
        if (!sent) {
          return;
        }
        await pool.execute(
          `UPDATE whatsapp_cloud_flow_sessions 
           SET current_node_id = ?, waiting_node_id = ?, waiting_type = ? 
           WHERE id = ?`,
          [node.id, node.id, 'list_message', sessionId]
        );
        return;
      }

      if (node.type === 'products') {
        const sent = await WhatsAppCloudController.sendFlowProductsMessage({
          tenantId,
          account,
          conversationId,
          contactPhone,
          node
        });
        if (!sent) {
          return;
        }
        currentNodeId = WhatsAppCloudController.getNextNodeId(flow, node.id);
        continue;
      }

      if (node.type === 'cta_message') {
        const sent = await WhatsAppCloudController.sendFlowCtaMessage({
          tenantId,
          account,
          conversationId,
          contactPhone,
          node
        });
        if (!sent) {
          return;
        }
        currentNodeId = WhatsAppCloudController.getNextNodeId(flow, node.id);
        continue;
      }

      if (node.type === 'send_media') {
        const sent = await WhatsAppCloudController.sendFlowMediaMessage({
          tenantId,
          account,
          conversationId,
          contactPhone,
          node
        });
        if (!sent) {
          return;
        }
        currentNodeId = WhatsAppCloudController.getNextNodeId(flow, node.id);
        continue;
      }

      if (node.type === 'menu_options') {
        const sent = await WhatsAppCloudController.sendFlowMenuOptionsMessage({
          tenantId,
          account,
          conversationId,
          contactPhone,
          node
        });
        if (!sent) {
          return;
        }
        await pool.execute(
          `UPDATE whatsapp_cloud_flow_sessions 
           SET current_node_id = ?, waiting_node_id = ?, waiting_type = ? 
           WHERE id = ?`,
          [node.id, node.id, 'menu_options', sessionId]
        );
        return;
      }

      if (node.type === 'ai_control') {
        const mode = node.config?.mode || 'enable';
        const [sessionRows] = await pool.execute(
          `SELECT variables FROM whatsapp_cloud_flow_sessions WHERE id = ?`,
          [sessionId]
        );
        const sessionVariables = WhatsAppCloudController.safeJsonParse(sessionRows?.[0]?.variables, {});
        if (mode === 'disable') {
          if (sessionVariables.ai) delete sessionVariables.ai;
          await pool.execute(
            `UPDATE whatsapp_cloud_flow_sessions 
             SET waiting_node_id = NULL, waiting_type = NULL, variables = ? 
             WHERE id = ?`,
            [JSON.stringify(sessionVariables), sessionId]
          );
          currentNodeId = WhatsAppCloudController.getNextNodeId(flow, node.id);
          continue;
        }
        const aiConfigId = node.config?.aiConfigId || '';
        if (!aiConfigId) {
          if (sessionVariables.ai) delete sessionVariables.ai;
          await pool.execute(
            `UPDATE whatsapp_cloud_flow_sessions 
             SET waiting_node_id = NULL, waiting_type = NULL, variables = ? 
             WHERE id = ?`,
            [JSON.stringify(sessionVariables), sessionId]
          );
          currentNodeId = WhatsAppCloudController.getNextNodeId(flow, node.id);
          continue;
        }
        let welcomeMessage = (node.config?.welcomeMessage || '').trim();
        if (welcomeMessage) {
          let personaName = '';
          if (welcomeMessage.includes('{{persona')) {
            let configRows = [];
            if (aiConfigId) {
              [configRows] = await pool.execute(
                `SELECT persona_name, model_name 
                 FROM ai_configurations 
                 WHERE id = ? AND tenant_id = ? 
                 LIMIT 1`,
                [aiConfigId, tenantId]
              );
            }
            if (!configRows || configRows.length === 0) {
              [configRows] = await pool.execute(
                `SELECT persona_name, model_name 
                 FROM ai_configurations 
                 WHERE tenant_id = ? AND active = TRUE 
                 LIMIT 1`,
                [tenantId]
              );
            }
            const cfg = configRows?.[0] || null;
            personaName = cfg?.persona_name || cfg?.model_name || '';
            if (personaName) {
              welcomeMessage = welcomeMessage.replace(/\{\{\s*persona\s*\}\}/gi, personaName);
            }
          }
        }
        sessionVariables.ai = {
          aiConfigId,
          enabled: true,
          temperature: node.config?.temperature ?? '',
          maxTokens: node.config?.maxTokens ?? '',
          prompt: node.config?.prompt || node.config?.instructions || '',
          welcomeMessage
        };
        await pool.execute(
          `UPDATE whatsapp_cloud_flow_sessions 
           SET current_node_id = ?, waiting_node_id = ?, waiting_type = ?, variables = ? 
           WHERE id = ?`,
          [node.id, node.id, 'ai', JSON.stringify(sessionVariables), sessionId]
        );
        if (sessionVariables.ai.welcomeMessage) {
          await WhatsAppCloudController.sendFlowTextMessage({
            tenantId,
            account,
            conversationId,
            contactPhone,
            message: sessionVariables.ai.welcomeMessage
          });
        }
        await WhatsAppCloudController.processCloudAIResponse({
          tenantId,
          account,
          conversationId,
          contactPhone,
          message,
          textBody,
          aiSettings: sessionVariables.ai
        });
        return;
      }

      if (node.type === 'transfer') {
        const targetType = node.config?.targetType || 'store';
        const targetId = node.config?.targetId || '';
        if (targetId) {
          const storeId = targetType === 'store' ? targetId : null;
          const departmentId = targetType === 'department' ? targetId : null;
          const nextStoreId = storeId || null;
          const nextDepartmentId = null;
          const nextTransferredStore = storeId || null;
          const nextTransferredDepartment = departmentId || null;
          await pool.execute(
            `UPDATE whatsapp_cloud_conversations 
             SET store_id = ?, 
                 department_id = ?, 
                 transferred_to_store = ?, 
                 transferred_to_department = ?, 
                 transferred_at = NOW(), 
                 claimed_by_user_id = NULL, 
                 claimed_at = NULL, 
                 updated_at = NOW() 
             WHERE id = ?`,
            [nextStoreId, nextDepartmentId, nextTransferredStore, nextTransferredDepartment, conversationId]
          );
        }
        currentNodeId = WhatsAppCloudController.getNextNodeId(flow, node.id);
        continue;
      }

      if (node.type === 'delay') {
        const delaySeconds = Number(node.config?.delay || 0);
        const responseDelayMs = Math.max(7000, delaySeconds * 1000);
        const reactionDelayMs = 3000;
        const shouldReact = !!node.config?.reaction && !!message?.id;
        if (shouldReact) {
          await new Promise(resolve => setTimeout(resolve, reactionDelayMs));
          await WhatsAppCloudController.sendFlowReaction({
            account,
            contactPhone,
            messageId: message.id,
            emoji: node.config.reaction
          });
        }
        const remainingDelay = responseDelayMs - (shouldReact ? reactionDelayMs : 0);
        if (remainingDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, remainingDelay));
        }
        if (node.config?.typingEffect) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        currentNodeId = WhatsAppCloudController.getNextNodeId(flow, node.id);
        continue;
      }

      if (node.type === 'end_chat') {
        await pool.execute(
          `DELETE FROM whatsapp_cloud_flow_sessions WHERE id = ?`,
          [sessionId]
        );
        return;
      }

      currentNodeId = WhatsAppCloudController.getNextNodeId(flow, node.id);
    }
  }

  static async sendFlowTextMessage({ tenantId, account, conversationId, contactPhone, message }) {
    if (!message) return false;
    if (!account?.access_token || !account?.phone_number_id) {
      logger.error('Flow text message missing account credentials', { accountId: account?.id });
      return false;
    }
    try {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}/messages`,
        {
          messaging_product: 'whatsapp',
          to: contactPhone,
          type: 'text',
          text: { body: message }
        },
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const messageId = response?.data?.messages?.[0]?.id || `flow_${Date.now()}`;
      await pool.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (conversation_id, message_id, direction, message_type, text_content, status, timestamp, created_at)
         VALUES (?, ?, 'outbound', 'text', ?, 'sent', NOW(), NOW())`,
        [conversationId, messageId, message]
      );

      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET last_message_text = ?, last_message_time = NOW(), last_message_from = 'business', updated_at = NOW()
         WHERE id = ?`,
        [message, conversationId]
      );
      return true;
    } catch (error) {
      logger.error('Error sending flow text message', { 
        error: error.message, 
        stack: error.stack, 
        response: error.response?.data || null 
      });
      return false;
    }
  }

  static async sendFlowReaction({ account, contactPhone, messageId, emoji }) {
    if (!messageId || !emoji) return false;
    try {
      await axios.post(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}/messages`,
        {
          messaging_product: 'whatsapp',
          to: contactPhone,
          type: 'reaction',
          reaction: {
            message_id: messageId,
            emoji: emoji
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return true;
    } catch (error) {
      logger.warn('Error sending reaction', { error: error.message });
      return false;
    }
  }

  static decryptApiKey(encryptedText) {
    try {
      const keyString = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32';
      const key = crypto.createHash('sha256').update(keyString).digest();
      const textParts = encryptedText.split(':');
      const iv = Buffer.from(textParts.shift(), 'hex');
      const encrypted = textParts.join(':');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      logger.error('Error decrypting API key', { error: error.message });
      return null;
    }
  }

  static async processCloudAIResponse({ tenantId, account, conversationId, contactPhone, message, textBody, aiSettings }) {
    if (!textBody) return false;
    if (!aiSettings || !aiSettings.aiConfigId) {
      return false;
    }
    let connection;
    try {
      connection = await pool.getConnection();
      let config = null;
      const [configRows] = await connection.execute(
        `SELECT * FROM ai_configurations WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [aiSettings.aiConfigId, tenantId]
      );
      if (configRows.length > 0) config = configRows[0];
      if (!config) {
        connection.release();
        return false;
      }
      const apiKey = WhatsAppCloudController.decryptApiKey(config.api_key);
      if (!apiKey) {
        connection.release();
        return false;
      }
      if (config.business_hours_start && config.business_hours_end) {
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5);
        const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const businessDays = (config.business_days || '').toLowerCase().split(',').map(d => d.trim()).filter(Boolean);
        if (businessDays.length > 0 && !businessDays.includes(currentDay)) {
          connection.release();
          return false;
        }
        if (currentTime < String(config.business_hours_start).slice(0, 5) || currentTime > String(config.business_hours_end).slice(0, 5)) {
          connection.release();
          return false;
        }
      }
      const [history] = await connection.execute(
        `SELECT text_content, direction 
         FROM whatsapp_cloud_messages 
         WHERE conversation_id = ? 
         ORDER BY created_at DESC LIMIT 10`,
        [conversationId]
      );
      const messages = [];
      const systemPrompt = aiSettings?.prompt || aiSettings?.instructions || config.system_prompt || config.persona_description || 'You are a helpful assistant.';
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      const reversedHistory = history.reverse();
      for (const msg of reversedHistory) {
        if (!msg?.text_content) continue;
        messages.push({
          role: msg.direction === 'inbound' ? 'user' : 'assistant',
          content: msg.text_content
        });
      }
      if (messages.length === 0 || messages[messages.length - 1].content !== textBody) {
        messages.push({ role: 'user', content: textBody });
      }
      const temperatureValue = Number.isFinite(parseFloat(aiSettings?.temperature))
        ? parseFloat(aiSettings.temperature)
        : parseFloat(config.temperature) || 0.7;
      const maxTokensValue = Number.isFinite(parseInt(aiSettings?.maxTokens, 10))
        ? parseInt(aiSettings.maxTokens, 10)
        : parseInt(config.max_tokens, 10) || 1000;
      const apiUrl = config.provider === 'deepseek'
        ? 'https://api.deepseek.com/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const response = await axios.post(
        apiUrl,
        {
          model: config.model_name,
          messages,
          temperature: temperatureValue,
          max_tokens: maxTokensValue
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      const aiResponse = response?.data?.choices?.[0]?.message?.content;
      if (!aiResponse) {
        connection.release();
        return false;
      }
      const delayMs = Math.max(0, Number(config.response_delay || 0) * 1000);
      if (delayMs) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      await WhatsAppCloudController.sendFlowTextMessage({
        tenantId,
        account,
        conversationId,
        contactPhone,
        message: aiResponse
      });
      connection.release();
      return true;
    } catch (error) {
      if (connection) connection.release();
      logger.error('Error processing cloud AI response', { error: error.message, tenantId });
      return false;
    }
  }

  static async sendFlowButtonsMessage({ tenantId, account, conversationId, contactPhone, node }) {
    if (!account?.access_token || !account?.phone_number_id) {
      logger.error('Button message missing account credentials', { accountId: account?.id });
      return false;
    }
    const body = node.config?.message || '';
    const footer = node.config?.footer || '';
    const rawButtons = Array.isArray(node.config?.buttons) ? node.config.buttons : [];
    const buttons = rawButtons
      .filter(btn => btn?.text && btn.text.trim())
      .slice(0, 3);
    if (buttons.length === 0) {
      logger.error('Button message has no valid buttons', { nodeId: node.id });
      return false;
    }
    const truncate = (text, max) => text.length > max ? text.slice(0, max - 1) : text;

    const payload = {
      messaging_product: 'whatsapp',
      to: contactPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: truncate(body || ' ', 1024) },
        action: {
          buttons: buttons.map((btn, index) => ({
            type: 'reply',
            reply: { id: `btn_${node.id}_${index}`, title: truncate(btn.text.trim(), 20) }
          }))
        }
      }
    };

    if (footer) {
      payload.interactive.footer = { text: truncate(footer.trim(), 60) };
    }

    try {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const messageId = response?.data?.messages?.[0]?.id || `flow_${Date.now()}`;
      const summary = body || buttons.map(b => b.text).join(', ');
      await pool.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (conversation_id, message_id, direction, message_type, text_content, status, timestamp, created_at)
         VALUES (?, ?, 'outbound', 'interactive', ?, 'sent', NOW(), NOW())`,
        [conversationId, messageId, summary]
      );

      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET last_message_text = ?, last_message_time = NOW(), last_message_from = 'business', updated_at = NOW()
         WHERE id = ?`,
        [summary, conversationId]
      );
      return true;
    } catch (error) {
      logger.error('Error sending button message', { 
        error: error.message, 
        stack: error.stack, 
        response: error.response?.data || null 
      });
      return false;
    }
  }

  static async sendFlowListMessage({ tenantId, account, conversationId, contactPhone, node }) {
    try {
      if (!account?.access_token || !account?.phone_number_id) {
        logger.error('List message missing account credentials', { accountId: account?.id });
        return false;
      }
      const header = node.config?.header || '';
      const body = node.config?.body || '';
      const footer = node.config?.footer || '';
      const buttonText = node.config?.buttonText || 'Selecionar';
      const items = (node.config?.items || []).filter(item => item.title && item.title.trim()).slice(0, 10);
      if (items.length === 0) {
        logger.error('List message has no items with title', { nodeId: node.id });
        return false;
      }

      const truncate = (text, max) => text.length > max ? text.slice(0, max - 1) : text;
      const sectionTitle = truncate((header || 'Opções').trim(), 24);
      const buttonLabel = truncate(buttonText.trim(), 20);
      const bodyText = truncate((body && body.trim() ? body.trim() : 'Selecione uma opção'), 1024);

      const payload = {
        messaging_product: 'whatsapp',
        to: contactPhone,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: bodyText },
          action: {
            button: buttonLabel,
            sections: [
              {
                title: sectionTitle,
                rows: items.map((item, index) => ({
                  id: truncate((item.id || `row_${node.id}_${index}`).trim(), 200),
                  title: truncate(item.title.trim(), 24),
                  description: item.description ? truncate(item.description.trim(), 72) : undefined
                }))
              }
            ]
          }
        }
      };

      if (footer && footer.trim()) {
        payload.interactive.footer = { text: truncate(footer.trim(), 60) };
      }

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const messageId = response?.data?.messages?.[0]?.id || `flow_${Date.now()}`;
      const summary = bodyText || items.map(i => i.title).join(', ');
      await pool.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (conversation_id, message_id, direction, message_type, text_content, status, timestamp, created_at)
         VALUES (?, ?, 'outbound', 'interactive', ?, 'sent', NOW(), NOW())`,
        [conversationId, messageId, summary]
      );

      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET last_message_text = ?, last_message_time = NOW(), last_message_from = 'business', updated_at = NOW()
         WHERE id = ?`,
        [summary, conversationId]
      );
      return true;
    } catch (error) {
      logger.error('Error sending list message', { 
        error: error.message, 
        stack: error.stack, 
        response: error.response?.data || null 
      });
      return false;
    }
  }

  static async sendFlowProductsMessage({ tenantId, account, conversationId, contactPhone, node }) {
    try {
      if (!account?.access_token || !account?.phone_number_id) {
        logger.error('Products message missing account credentials', { accountId: account?.id });
        return false;
      }
      const rawIds = node.config?.productIds || '';
      const limit = Math.max(1, parseInt(node.config?.limit, 10) || 5);
      const displayMode = node.config?.displayMode || 'list';
      const includePrice = node.config?.includePrice !== false;
      const message = node.config?.message || '';
      const ids = rawIds
        .split(/[\s,;]+/)
        .map(value => parseInt(value, 10))
        .filter(value => Number.isFinite(value));
      let products = [];
      if (ids.length > 0) {
        const uniqueIds = Array.from(new Set(ids));
        const placeholders = uniqueIds.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT * FROM woocommerce_products WHERE tenant_id = ? AND wc_product_id IN (${placeholders}) AND is_active = TRUE`,
          [tenantId, ...uniqueIds]
        );
        const byId = new Map(rows.map(row => [String(row.wc_product_id), row]));
        products = ids.map(id => byId.get(String(id))).filter(Boolean);
      } else {
        const [rows] = await pool.execute(
          `SELECT * FROM woocommerce_products 
           WHERE tenant_id = ? AND is_active = TRUE 
           ORDER BY updated_at DESC 
           LIMIT ?`,
          [tenantId, limit]
        );
        products = rows;
      }
      if (products.length === 0) {
        logger.error('No WooCommerce products found for flow', { nodeId: node.id });
        return false;
      }
      const truncate = (text, max) => text.length > max ? text.slice(0, max - 1) : text;
      const formatPrice = (product) => {
        const price = product.sale_price || product.regular_price || product.price;
        if (!price) return 'Consulte';
        return `R$ ${parseFloat(price).toFixed(2).replace('.', ',')}`;
      };

      let payload;
      if (displayMode === 'carousel') {
        const eligibleProducts = products.filter(product => (
          (product.thumbnail_url || product.image_url) && (product.permalink || '').trim()
        ));
        if (eligibleProducts.length < 2) {
          return WhatsAppCloudController.sendFlowProductsMessage({
            tenantId,
            account,
            conversationId,
            contactPhone,
            node: { ...node, config: { ...node.config, displayMode: 'list' } }
          });
        }
        const carouselBody = truncate(message && message.trim() ? message.trim() : 'Confira nossos produtos', 1024);
        const cards = eligibleProducts.slice(0, 10).map((product, index) => {
          const imageLink = product.thumbnail_url || product.image_url;
          const priceText = includePrice ? formatPrice(product) : '';
          const shortDesc = product.short_description || '';
          const bodyText = truncate(
            `${product.name || 'Produto'}${priceText ? `\n${priceText}` : ''}${shortDesc ? `\n${shortDesc}` : ''}`,
            160
          );
          return {
            card_index: index,
            type: 'cta_url',
            header: { type: 'image', image: { link: imageLink } },
            body: { text: bodyText },
            action: {
              name: 'cta_url',
              parameters: {
                display_text: truncate('Ver produto', 20),
                url: product.permalink
              }
            }
          };
        });
        payload = {
          messaging_product: 'whatsapp',
          to: contactPhone,
          type: 'interactive',
          interactive: {
            type: 'carousel',
            body: { text: carouselBody },
            action: { cards }
          }
        };
      } else {
        const buttonLabel = truncate('Selecionar', 20);
        const bodyText = truncate(message && message.trim() ? message.trim() : 'Selecione um produto', 1024);
        const rows = products.slice(0, 10).map(product => {
          const descriptionBase = product.short_description || '';
          const priceText = includePrice ? formatPrice(product) : '';
          const description = priceText
            ? `${priceText}${descriptionBase ? ` - ${descriptionBase}` : ''}`
            : descriptionBase;
          return {
            id: truncate(`product_${product.wc_product_id}`, 200),
            title: truncate((product.name || 'Produto').trim(), 24),
            description: description ? truncate(description.trim(), 72) : undefined
          };
        }).filter(row => row.title && row.title.trim());
        if (rows.length === 0) {
          logger.error('WooCommerce product list has no valid rows', { nodeId: node.id });
          return false;
        }
        payload = {
          messaging_product: 'whatsapp',
          to: contactPhone,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: bodyText },
            action: {
              button: buttonLabel,
              sections: [
                {
                  title: truncate('Produtos', 24),
                  rows
                }
              ]
            }
          }
        };
      }

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const messageId = response?.data?.messages?.[0]?.id || `flow_${Date.now()}`;
      const summary = message && message.trim()
        ? message.trim()
        : products.map(product => product.name).join(', ');
      await pool.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (conversation_id, message_id, direction, message_type, text_content, status, timestamp, created_at)
         VALUES (?, ?, 'outbound', 'interactive', ?, 'sent', NOW(), NOW())`,
        [conversationId, messageId, summary]
      );

      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET last_message_text = ?, last_message_time = NOW(), last_message_from = 'business', updated_at = NOW()
         WHERE id = ?`,
        [summary, conversationId]
      );
      return true;
    } catch (error) {
      logger.error('Error sending WooCommerce products message', { 
        error: error.message, 
        stack: error.stack, 
        response: error.response?.data || null 
      });
      return false;
    }
  }

  static async sendFlowCtaMessage({ tenantId, account, conversationId, contactPhone, node }) {
    const header = node.config?.header || '';
    const body = node.config?.body || '';
    const footer = node.config?.footer || '';
    const buttonText = node.config?.buttonText || '';
    let ctaType = node.config?.ctaType || 'url';
    if (ctaType === 'cta_call' || ctaType === 'call') ctaType = 'phone';
    if (ctaType === 'cta_url') ctaType = 'url';
    if (ctaType !== 'url' && ctaType !== 'phone') ctaType = 'url';
    const ctaValue = node.config?.ctaValue || '';
    try {
      if (!account?.access_token || !account?.phone_number_id) {
        logger.error('CTA message missing account credentials', { accountId: account?.id });
        return false;
      }
      const truncate = (text, max) => text.length > max ? text.slice(0, max - 1) : text;
      const normalizeUrl = (value) => {
        const trimmed = value.trim();
        if (!trimmed) return '';
        const normalized = trimmed.startsWith('http://') || trimmed.startsWith('https://')
          ? trimmed
          : `https://${trimmed}`;
        try {
          const url = new URL(normalized);
          return url.href;
        } catch (error) {
          return '';
        }
      };
      const normalizePhone = (value) => {
        const digits = value.replace(/[^\d+]/g, '');
        if (!digits) return '';
        return digits.startsWith('+') ? digits : `+${digits}`;
      };
      const bodyText = body && body.trim() ? body.trim() : (header && header.trim() ? header.trim() : 'Clique abaixo');
      const resolvedButtonText = buttonText && buttonText.trim()
        ? buttonText.trim()
        : (ctaType === 'phone' ? 'Ligar' : 'Abrir');
      const normalizedUrl = ctaType === 'phone' ? '' : normalizeUrl(ctaValue);
      const normalizedPhone = ctaType === 'phone' ? normalizePhone(ctaValue) : '';
      const ctaUrl = ctaType === 'phone'
        ? (normalizedPhone ? `tel:${normalizedPhone}` : '')
        : normalizedUrl;
      if (!bodyText || !ctaUrl) {
        logger.error('CTA message missing body or value', { nodeId: node.id });
        throw new Error('Invalid CTA payload');
      }
      const basePayload = {
        messaging_product: 'whatsapp',
        to: contactPhone,
        recipient_type: 'individual',
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: { text: truncate(bodyText, 1024) },
          action: {
            name: 'cta_url',
            parameters: {
              display_text: truncate(resolvedButtonText, 20),
              url: ctaUrl
            }
          }
        }
      };

      if (header && header.trim()) {
        basePayload.interactive.header = { type: 'text', text: truncate(header.trim(), 60) };
      }
      if (footer && footer.trim()) {
        basePayload.interactive.footer = { text: truncate(footer.trim(), 60) };
      }

      const sendPayload = async (payload) => axios.post(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}/messages`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      let response;
      try {
        response = await sendPayload(basePayload);
      } catch (sendError) {
        const trimmedPayload = {
          ...basePayload,
          interactive: {
            type: basePayload.interactive.type,
            body: basePayload.interactive.body,
            action: basePayload.interactive.action
          }
        };
        response = await sendPayload(trimmedPayload);
      }

      const messageId = response?.data?.messages?.[0]?.id || `flow_${Date.now()}`;
      const summary = bodyText;
      await pool.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (conversation_id, message_id, direction, message_type, text_content, status, timestamp, created_at)
         VALUES (?, ?, 'outbound', 'interactive', ?, 'sent', NOW(), NOW())`,
        [conversationId, messageId, summary]
      );

      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET last_message_text = ?, last_message_time = NOW(), last_message_from = 'business', updated_at = NOW()
         WHERE id = ?`,
        [summary, conversationId]
      );
      return true;
    } catch (error) {
      logger.error('Error sending CTA message', { 
        error: error.message, 
        stack: error.stack, 
        response: error.response?.data || null 
      });
      try {
        const fallbackBody = body && body.trim() ? body.trim() : (header && header.trim() ? header.trim() : 'Clique abaixo');
        const fallbackValue = ctaValue && ctaValue.trim() ? ctaValue.trim() : '';
        const fallbackText = fallbackValue ? `${fallbackBody}\n${fallbackValue}` : fallbackBody;
        await WhatsAppCloudController.sendFlowTextMessage({
          tenantId,
          account,
          conversationId,
          contactPhone,
          message: fallbackText
        });
        return true;
      } catch (fallbackError) {
        logger.error('Error sending CTA fallback text', { error: fallbackError.message });
        return false;
      }
    }
  }

  /**
   * Sync message templates from Meta Graph API
   * POST /api/whatsapp-cloud/accounts/:id/sync-templates
   */
  static async syncTemplates(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const accountId = req.params.id;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }

      // Get account details
      const [accounts] = await pool.execute(
        'SELECT waba_id, access_token FROM whatsapp_cloud_accounts WHERE id = ? AND tenant_id = ?',
        [accountId, tenantId]
      );

      if (accounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      const account = accounts[0];

      if (!account.waba_id || !account.access_token) {
        return res.status(400).json({
          success: false,
          message: 'Account is missing WABA ID or access token'
        });
      }

      logger.info('Syncing templates from Meta', { tenantId, accountId, wabaId: account.waba_id });

      // Call Meta Graph API to get message templates
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/${account.waba_id}/message_templates`,
        {
          params: {
            access_token: account.access_token,
            fields: 'name,language,status,category,components,id'
          }
        }
      );

      const templates = response.data.data || [];

      logger.info('Templates retrieved from Meta', { 
        tenantId, 
        accountId, 
        count: templates.length 
      });

      // Save templates to database
      for (const template of templates) {
        const body = template.components?.find(c => c.type === 'BODY')?.text || '';
        const header = template.components?.find(c => c.type === 'HEADER')?.text || '';
        const footer = template.components?.find(c => c.type === 'FOOTER')?.text || '';
        const buttons = template.components?.find(c => c.type === 'BUTTONS')?.buttons || [];

        // Insert or update template
        await pool.execute(
          `INSERT INTO whatsapp_cloud_templates 
           (tenant_id, account_id, template_id, name, language, status, category, components, body, header, footer, buttons)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           language = VALUES(language),
           status = VALUES(status),
           category = VALUES(category),
           components = VALUES(components),
           body = VALUES(body),
           header = VALUES(header),
           footer = VALUES(footer),
           buttons = VALUES(buttons),
           updated_at = NOW()`,
          [
            tenantId,
            accountId,
            template.id,
            template.name,
            template.language,
            template.status,
            template.category,
            JSON.stringify(template.components || []),
            body,
            header,
            footer,
            JSON.stringify(buttons)
          ]
        );
      }

      logger.info('Templates saved to database', { tenantId, accountId, count: templates.length });

      // Update account with sync info
      await pool.execute(
        `UPDATE whatsapp_cloud_accounts 
         SET templates_synced_at = NOW(), templates_count = ?
         WHERE id = ?`,
        [templates.length, accountId]
      );

      // Format templates for frontend
      const formattedTemplates = templates.map(template => ({
        id: template.id,
        name: template.name,
        language: template.language,
        status: template.status,
        category: template.category,
        components: template.components || [],
        body: template.components?.find(c => c.type === 'BODY')?.text || '',
        header: template.components?.find(c => c.type === 'HEADER')?.text || '',
        footer: template.components?.find(c => c.type === 'FOOTER')?.text || '',
        buttons: template.components?.find(c => c.type === 'BUTTONS')?.buttons || []
      }));

      return res.json({
        success: true,
        message: `${templates.length} templates synced successfully`,
        data: {
          count: templates.length,
          templates: formattedTemplates
        }
      });
    } catch (error) {
      logger.error('Error syncing templates', { 
        error: error.message,
        stack: error.stack,
        response: error.response?.data 
      });
      
      return res.status(500).json({
        success: false,
        message: error.response?.data?.error?.message || 'Failed to sync templates from Meta',
        error: error.response?.data
      });
    }
  }

  /**
   * Get templates for account
   * GET /api/whatsapp-cloud/accounts/:id/templates
   */
  static async getTemplates(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const accountId = req.params.id;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }

      // Get templates from database
      const [templates] = await pool.execute(
        `SELECT template_id as id, name, language, status, category, components, body, header, footer, buttons
         FROM whatsapp_cloud_templates
         WHERE tenant_id = ? AND account_id = ?
         ORDER BY name ASC`,
        [tenantId, accountId]
      );

      // Parse JSON fields
      const formattedTemplates = templates.map(template => ({
        ...template,
        components: typeof template.components === 'string' ? JSON.parse(template.components) : template.components,
        buttons: typeof template.buttons === 'string' ? JSON.parse(template.buttons) : template.buttons
      }));

      return res.json({
        success: true,
        data: {
          count: formattedTemplates.length,
          templates: formattedTemplates
        }
      });
    } catch (error) {
      logger.error('Error getting templates', { 
        error: error.message,
        stack: error.stack
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to load templates'
      });
    }
  }

  static async markWebhookVerified(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const accountId = req.params.id;
      const { verify_token } = req.body || {};
      
      logger.info('Mark webhook verified request', { 
        tenantId, 
        accountId, 
        hasVerifyToken: !!verify_token
      });
      
      if (!tenantId) {
        logger.error('No tenant ID in mark webhook verified request');
        return res.status(400).json({ success: false, message: 'Tenant ID not found in request' });
      }
      
      if (!verify_token) {
        return res.status(400).json({ success: false, message: 'Verify token is required' });
      }
      
      const [accounts] = await pool.execute(
        'SELECT id FROM whatsapp_cloud_accounts WHERE id = ? AND tenant_id = ?',
        [accountId, tenantId]
      );
      
      if (accounts.length === 0) {
        logger.warn('Account not found for webhook verification', { accountId, tenantId });
        return res.status(404).json({ success: false, message: 'Account not found' });
      }
      
      // Save the verify token to the account and mark as verified
      await pool.execute(
        'UPDATE whatsapp_cloud_accounts SET webhook_verified = TRUE, verify_token = ?, updated_at = NOW() WHERE id = ?',
        [verify_token, accountId]
      );
      
      logger.info('Webhook marked as verified successfully', { accountId, tenantId });
      return res.json({ success: true, message: 'Webhook verified and token saved' });
    } catch (error) {
      logger.error('Error marking webhook verified', { error: error.message, stack: error.stack });
      return res.status(500).json({ success: false, message: 'Failed to verify webhook' });
    }
  }
  /**
   * Get all conversations for active account
   * GET /api/user/whatsapp-cloud/conversations
   */
  static async getWebConversations(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }

      const io = req.app.get('io');
      const whatsappService = getWhatsAppService(io);

      const conversations = await whatsappService.getWebConversations(tenantId);
      const normalizedTenantId = Number(tenantId);
      const instance = whatsappService.getInstance?.(normalizedTenantId);
      const connected = instance?.connection?.isConnected?.(normalizedTenantId) || false;
      const hasSession = instance?.connection?.stateManager?.hasSession?.(normalizedTenantId) || false;

      return res.json({
        success: true,
        data: conversations,
        meta: {
          connected,
          hasSession,
          chatsCount: conversations?.length || 0
        }
      });
    } catch (error) {
      logger.error('Error fetching Web WhatsApp conversations', {
        tenantId: req.tenantId || req.user.tenantId,
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch Web WhatsApp conversations'
      });
    }
  }

  /**
   * Get all conversations for active account
   * GET /api/user/whatsapp-cloud/conversations
   */
  static async getConversations(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }

      // Get conversations with account info
      const [conversations] = await pool.execute(
        `SELECT c.*, a.account_name, a.phone_number as account_phone
         FROM whatsapp_cloud_conversations c
         JOIN whatsapp_cloud_accounts a ON c.account_id = a.id
         WHERE c.tenant_id = ?
         ORDER BY c.last_message_time DESC`,
        [tenantId]
      );

      return res.json({
        success: true,
        data: conversations
      });
    } catch (error) {
      logger.error('Error getting conversations', { 
        error: error.message,
        stack: error.stack
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to load conversations'
      });
    }
  }

  /**
   * Get messages for a conversation
   * GET /api/whatsapp-cloud/conversations/:id/messages
   */
  static async getMessages(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const conversationId = req.params.id;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }

      // Verify conversation belongs to tenant
      const [conversations] = await pool.execute(
        'SELECT id FROM whatsapp_cloud_conversations WHERE id = ? AND tenant_id = ?',
        [conversationId, tenantId]
      );

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found'
        });
      }

      // Get messages
      const [messages] = await pool.execute(
        `SELECT m.*,
                u.name as sent_by_name,
                COALESCE(u.store, s.name) as sent_by_store,
                COALESCE(u.department, d.name) as sent_by_department
         FROM whatsapp_cloud_messages m
         LEFT JOIN users u ON m.sent_by_user_id = u.id
         LEFT JOIN stores s ON u.store_id = s.id
         LEFT JOIN departments d ON u.department_id = d.id
         WHERE m.conversation_id = ?
         ORDER BY m.created_at ASC`,
        [conversationId]
      );

      // Mark messages as read
      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET unread_count = 0 
         WHERE id = ?`,
        [conversationId]
      );

      return res.json({
        success: true,
        data: messages
      });
    } catch (error) {
      logger.error('Error getting messages', { 
        error: error.message,
        stack: error.stack
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to load messages'
      });
    }
  }

  /**
   * Send text message
   * POST /api/whatsapp-cloud/send-message
   */
  static async sendMessage(req, res) {
    try {
      const { accountId, to, message, conversationId } = req.body;
      const tenantId = req.tenantId || req.user.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }

      if (!accountId || !to || !message) {
        return res.status(400).json({
          success: false,
          message: 'Account ID, recipient, and message are required'
        });
      }

      // Get account details
      const [accounts] = await pool.execute(
        'SELECT * FROM whatsapp_cloud_accounts WHERE id = ? AND tenant_id = ?',
        [accountId, tenantId]
      );

      if (accounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      const account = accounts[0];

      // Send message via WhatsApp Cloud API
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: {
            body: message
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Message sent via WhatsApp Cloud API', {
        tenantId,
        accountId,
        to,
        messageId: response.data.messages[0].id
      });

      // Save message to database
      let convId = conversationId;
      
      // If no conversation ID provided, find or create conversation
      if (!convId) {
        const [existingConv] = await pool.execute(
          'SELECT id FROM whatsapp_cloud_conversations WHERE account_id = ? AND contact_phone = ?',
          [accountId, to]
        );

        if (existingConv.length > 0) {
          convId = existingConv[0].id;
        } else {
          // Create new conversation (unassigned - no store/department)
          const [newConv] = await pool.execute(
            `INSERT INTO whatsapp_cloud_conversations 
             (tenant_id, account_id, contact_phone, contact_name, last_message_text, last_message_time, last_message_from, unread_count, status, created_at, updated_at, store_id, department_id)
             VALUES (?, ?, ?, ?, ?, NOW(), 'agent', 0, 'open', NOW(), NOW(), NULL, NULL)`,
            [tenantId, accountId, to, to, message]
          );
          convId = newConv.insertId;
        }
      }

      // Save message
      await pool.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (conversation_id, message_id, direction, message_type, text_content, status, timestamp, created_at)
         VALUES (?, ?, 'outbound', 'text', ?, 'sent', NOW(), NOW())`,
        [convId, response.data.messages[0].id, message]
      );

      // Update conversation
      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET last_message_text = ?, last_message_time = NOW(), last_message_from = 'agent', updated_at = NOW()
         WHERE id = ?`,
        [message, convId]
      );

      return res.json({
        success: true,
        message: 'Message sent successfully',
        data: {
          messageId: response.data.messages[0].id,
          conversationId: convId
        }
      });
    } catch (error) {
      logger.error('Error sending message', {
        error: error.message,
        stack: error.stack,
        response: error.response?.data
      });

      return res.status(500).json({
        success: false,
        message: error.response?.data?.error?.message || 'Failed to send message'
      });
    }
  }

  static normalizePhone(value) {
    return String(value || '').replace(/[^\d]/g, '');
  }

  static parseAudienceNumbers(input) {
    if (Array.isArray(input)) {
      return input.map(item => String(item || '')).filter(item => item.trim().length > 0);
    }
    if (typeof input === 'string') {
      return input.split(/\r?\n/).map(item => item.trim()).filter(item => item.length > 0);
    }
    return [];
  }

  static normalizeScheduleAt(value) {
    if (!value) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) return null;
      let normalized = trimmed.replace('T', ' ');
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) {
        normalized += ':00';
      }
      return normalized;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const pad = (n) => String(n).padStart(2, '0');
      return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
    }
    return null;
  }

  static async getCampaignRecipients({ tenantId, accountId, audienceType, audienceGroups, audienceCustomNumbers }) {
    const recipients = [];
    const normalizedGroups = Array.isArray(audienceGroups) ? audienceGroups : [];
    const customNumbers = WhatsAppCloudController.parseAudienceNumbers(audienceCustomNumbers);

    if (audienceType === 'custom') {
      const seen = new Set();
      customNumbers.forEach(number => {
        const normalized = WhatsAppCloudController.normalizePhone(number);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        recipients.push({ phone: normalized, name: normalized });
      });
      return recipients;
    }

    let query = `SELECT name, phone FROM contacts WHERE tenant_id = ? AND phone IS NOT NULL AND phone <> ''`;
    const params = [tenantId];

    if (audienceType === 'groups') {
      if (!normalizedGroups.length) {
        return [];
      }
      const placeholders = normalizedGroups.map(() => '?').join(', ');
      query += ` AND group_id IN (${placeholders})`;
      params.push(...normalizedGroups);
    }

    const [rows] = await pool.execute(query, params);
    const seen = new Set();
    rows.forEach(row => {
      const normalized = WhatsAppCloudController.normalizePhone(row.phone);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      recipients.push({ phone: normalized, name: row.name || normalized });
    });
    return recipients;
  }

  static async ensureCloudConversation({ tenantId, accountId, contactPhone, contactName }) {
    const [existing] = await pool.execute(
      'SELECT id FROM whatsapp_cloud_conversations WHERE account_id = ? AND contact_phone = ?',
      [accountId, contactPhone]
    );
    if (existing.length > 0) {
      return existing[0].id;
    }
    try {
      const [result] = await pool.execute(
        `INSERT INTO whatsapp_cloud_conversations
         (tenant_id, account_id, contact_phone, contact_name, last_message_text, last_message_time, last_message_from, unread_count, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, NOW(), 'business', 0, 'open', NOW(), NOW())`,
        [tenantId, accountId, contactPhone, contactName || contactPhone]
      );
      return result.insertId;
    } catch (error) {
      const [existingRetry] = await pool.execute(
        'SELECT id FROM whatsapp_cloud_conversations WHERE account_id = ? AND contact_phone = ?',
        [accountId, contactPhone]
      );
      if (existingRetry.length > 0) {
        return existingRetry[0].id;
      }
      throw error;
    }
  }

  /**
   * Send campaign template messages
   * POST /api/whatsapp-cloud/campaigns/send
   */
  static async sendTemplateCampaign(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const {
        accountId,
        templateId,
        audienceType,
        audienceGroups,
        audienceCustomNumbers,
        filters,
        source,
        timezone
      } = req.body || {};
      const resolvedAudienceType = audienceType || req.body?.audienceId || 'all';

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }

      if (!accountId || !templateId) {
        return res.status(400).json({
          success: false,
          message: 'Account ID and template ID are required'
        });
      }

      if (source && String(source).toLowerCase() !== 'meta') {
        return res.status(400).json({
          success: false,
          message: 'Custom source is not supported for Cloud templates'
        });
      }

      if (resolvedAudienceType === 'groups' && (!Array.isArray(audienceGroups) || audienceGroups.length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'At least one group is required'
        });
      }

      if (resolvedAudienceType === 'custom') {
        const customNumbers = WhatsAppCloudController.parseAudienceNumbers(audienceCustomNumbers);
        if (customNumbers.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'At least one custom number is required'
          });
        }
      }

      const [accounts] = await pool.execute(
        'SELECT id, access_token, phone_number_id FROM whatsapp_cloud_accounts WHERE id = ? AND tenant_id = ?',
        [accountId, tenantId]
      );

      if (accounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      const account = accounts[0];
      if (!account.access_token || !account.phone_number_id) {
        return res.status(400).json({
          success: false,
          message: 'Account is missing access token or phone number id'
        });
      }

      const [templateRows] = await pool.execute(
        `SELECT template_id, name, language 
         FROM whatsapp_cloud_templates 
         WHERE tenant_id = ? AND account_id = ? AND template_id = ? 
         LIMIT 1`,
        [tenantId, accountId, templateId]
      );

      if (templateRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      const template = templateRows[0];
      const languageCode = template.language || 'en';

      const recipients = await WhatsAppCloudController.getCampaignRecipients({
        tenantId,
        accountId,
        audienceType: resolvedAudienceType,
        audienceGroups,
        audienceCustomNumbers
      });
      const total = recipients.length;
      let sent = 0;
      let failed = 0;
      const failures = [];

      for (const recipient of recipients) {
        const contactPhone = recipient.phone;
        if (!contactPhone) {
          failed += 1;
          failures.push({ to: contactPhone, error: 'Missing contact phone' });
          continue;
        }

        const payload = {
          messaging_product: 'whatsapp',
          to: contactPhone,
          type: 'template',
          template: {
            name: template.name,
            language: { code: languageCode }
          }
        };

        try {
          const response = await axios.post(
            `https://graph.facebook.com/v18.0/${account.phone_number_id}/messages`,
            payload,
            {
              headers: {
                'Authorization': `Bearer ${account.access_token}`,
                'Content-Type': 'application/json'
              }
            }
          );

          const messageId = response?.data?.messages?.[0]?.id || `campaign_${Date.now()}`;
          const conversationId = await WhatsAppCloudController.ensureCloudConversation({
            tenantId,
            accountId,
            contactPhone,
            contactName: recipient.name || contactPhone
          });

          await pool.execute(
            `INSERT INTO whatsapp_cloud_messages 
             (conversation_id, message_id, direction, message_type, text_content, status, timestamp, created_at)
             VALUES (?, ?, 'outbound', 'template', ?, 'sent', NOW(), NOW())`,
            [conversationId, messageId, template.name]
          );

          await pool.execute(
            `UPDATE whatsapp_cloud_conversations 
             SET last_message_text = ?, last_message_time = NOW(), last_message_from = 'business', updated_at = NOW()
             WHERE id = ?`,
            [template.name, conversationId]
          );

          sent += 1;
        } catch (sendError) {
          failed += 1;
          failures.push({
            to: contactPhone,
            error: sendError.response?.data?.error?.message || sendError.message
          });
        }
      }

      return res.json({
        success: true,
        data: {
          audienceType: resolvedAudienceType,
          filters: filters || {},
          timezone: timezone || 'UTC',
          total,
          sent,
          failed,
          failures
        }
      });
    } catch (error) {
      logger.error('Error sending template campaign', {
        error: error.message,
        stack: error.stack,
        response: error.response?.data
      });

      return res.status(500).json({
        success: false,
        message: error.response?.data?.error?.message || 'Failed to send campaign'
      });
    }
  }

  static async listTemplateCampaigns(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { status, accountId } = req.query || {};
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }
      const params = [tenantId];
      let where = 'tenant_id = ?';
      if (status) {
        where += ' AND status = ?';
        params.push(status);
      }
      if (accountId) {
        where += ' AND account_id = ?';
        params.push(accountId);
      }
      const [rows] = await pool.execute(
        `SELECT id, account_id, template_id, template_name, audience_type, schedule_at, timezone, status, total_count, sent_count, failed_count, created_at
         FROM whatsapp_cloud_campaigns
         WHERE ${where}
         ORDER BY schedule_at ASC`,
        params
      );
      return res.json({
        success: true,
        data: rows
      });
    } catch (error) {
      logger.error('Error listing template campaigns', {
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to list campaigns'
      });
    }
  }

  static async createTemplateCampaign(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const {
        accountId,
        templateId,
        scheduleAt,
        timezone,
        audienceType,
        audienceGroups,
        audienceCustomNumbers,
        filters,
        source
      } = req.body || {};
      const resolvedAudienceType = audienceType || 'all';

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }
      if (!accountId || !templateId || !scheduleAt) {
        return res.status(400).json({
          success: false,
          message: 'Account ID, template ID, and schedule time are required'
        });
      }
      const normalizedScheduleAt = WhatsAppCloudController.normalizeScheduleAt(scheduleAt);
      if (!normalizedScheduleAt) {
        return res.status(400).json({
          success: false,
          message: 'Invalid schedule time'
        });
      }
      if (source && String(source).toLowerCase() !== 'meta') {
        return res.status(400).json({
          success: false,
          message: 'Custom source is not supported for Cloud templates'
        });
      }
      if (resolvedAudienceType === 'groups' && (!Array.isArray(audienceGroups) || audienceGroups.length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'At least one group is required'
        });
      }
      if (resolvedAudienceType === 'custom') {
        const customNumbers = WhatsAppCloudController.parseAudienceNumbers(audienceCustomNumbers);
        if (customNumbers.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'At least one custom number is required'
          });
        }
      }

      const [accounts] = await pool.execute(
        'SELECT id FROM whatsapp_cloud_accounts WHERE id = ? AND tenant_id = ?',
        [accountId, tenantId]
      );
      if (accounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      const [templateRows] = await pool.execute(
        `SELECT template_id, name
         FROM whatsapp_cloud_templates
         WHERE tenant_id = ? AND account_id = ? AND template_id = ?
         LIMIT 1`,
        [tenantId, accountId, templateId]
      );
      if (templateRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Template not found'
        });
      }

      const recipients = await WhatsAppCloudController.getCampaignRecipients({
        tenantId,
        accountId,
        audienceType: resolvedAudienceType,
        audienceGroups,
        audienceCustomNumbers
      });
      const total = recipients.length;

      const [result] = await pool.execute(
        `INSERT INTO whatsapp_cloud_campaigns
         (tenant_id, account_id, template_id, template_name, source, audience_type, audience_groups, audience_custom_numbers, filters, schedule_at, timezone, total_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          accountId,
          templateId,
          templateRows[0].name,
          source || 'meta',
          resolvedAudienceType,
          JSON.stringify(Array.isArray(audienceGroups) ? audienceGroups : []),
          JSON.stringify(WhatsAppCloudController.parseAudienceNumbers(audienceCustomNumbers)),
          JSON.stringify(filters || {}),
          normalizedScheduleAt,
          timezone || 'UTC',
          total
        ]
      );

      return res.json({
        success: true,
        data: {
          id: result.insertId,
          total
        }
      });
    } catch (error) {
      logger.error('Error creating template campaign', {
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to create campaign'
      });
    }
  }

  static async updateTemplateCampaign(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { id } = req.params;
      const { scheduleAt, timezone } = req.body || {};
      if (!tenantId || !id || !scheduleAt) {
        return res.status(400).json({
          success: false,
          message: 'Campaign ID and schedule time are required'
        });
      }
      const normalizedScheduleAt = WhatsAppCloudController.normalizeScheduleAt(scheduleAt);
      if (!normalizedScheduleAt) {
        return res.status(400).json({
          success: false,
          message: 'Invalid schedule time'
        });
      }
      const [result] = await pool.execute(
        `UPDATE whatsapp_cloud_campaigns
         SET schedule_at = ?, timezone = ?, updated_at = NOW()
         WHERE id = ? AND tenant_id = ? AND status = 'scheduled'`,
        [normalizedScheduleAt, timezone || 'UTC', id, tenantId]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found or cannot be updated'
        });
      }
      return res.json({
        success: true
      });
    } catch (error) {
      logger.error('Error updating template campaign', {
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to update campaign'
      });
    }
  }

  static async deleteTemplateCampaign(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;
      const { id } = req.params;
      if (!tenantId || !id) {
        return res.status(400).json({
          success: false,
          message: 'Campaign ID is required'
        });
      }
      const [result] = await pool.execute(
        `UPDATE whatsapp_cloud_campaigns
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = ? AND tenant_id = ? AND status = 'scheduled'`,
        [id, tenantId]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found or cannot be deleted'
        });
      }
      return res.json({
        success: true
      });
    } catch (error) {
      logger.error('Error deleting template campaign', {
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to delete campaign'
      });
    }
  }

  /**
   * Send media message
   * POST /api/whatsapp-cloud/send-media
   */
  static async sendMedia(req, res) {
    try {
      const { accountId, to, conversationId } = req.body;
      const tenantId = req.tenantId || req.user.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }

      if (!accountId || !to || !req.file) {
        return res.status(400).json({
          success: false,
          message: 'Account ID, recipient, and media file are required'
        });
      }

      // Get account details
      const [accounts] = await pool.execute(
        'SELECT * FROM whatsapp_cloud_accounts WHERE id = ? AND tenant_id = ?',
        [accountId, tenantId]
      );

      if (accounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      const account = accounts[0];
      const file = req.file;

      // Determine media type
      let mediaType = 'document';
      if (file.mimetype.startsWith('image/')) mediaType = 'image';
      else if (file.mimetype.startsWith('video/')) mediaType = 'video';
      else if (file.mimetype.startsWith('audio/')) mediaType = 'audio';

      // Upload media to WhatsApp Cloud API
      const FormData = require('form-data');
      const fs = require('fs');
      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('file', fs.createReadStream(file.path), {
        filename: file.originalname,
        contentType: file.mimetype
      });

      const uploadResponse = await axios.post(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}/media`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            ...formData.getHeaders()
          }
        }
      );

      const mediaId = uploadResponse.data.id;

      // Send message with media
      const messagePayload = {
        messaging_product: 'whatsapp',
        to: to,
        type: mediaType,
        [mediaType]: {
          id: mediaId
        }
      };

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${account.phone_number_id}/messages`,
        messagePayload,
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Media message sent via WhatsApp Cloud API', {
        tenantId,
        accountId,
        to,
        mediaType,
        messageId: response.data.messages[0].id
      });

      // Save message to database
      let convId = conversationId;
      
      if (!convId) {
        const [existingConv] = await pool.execute(
          'SELECT id FROM whatsapp_cloud_conversations WHERE account_id = ? AND contact_phone = ?',
          [accountId, to]
        );

        if (existingConv.length > 0) {
          convId = existingConv[0].id;
        } else {
          const [newConv] = await pool.execute(
            `INSERT INTO whatsapp_cloud_conversations 
             (tenant_id, account_id, contact_phone, contact_name, last_message_text, last_message_time, last_message_from, unread_count, status, created_at, updated_at, store_id, department_id)
             VALUES (?, ?, ?, ?, '[Media]', NOW(), 'agent', 0, 'open', NOW(), NOW(), NULL, NULL)`,
            [tenantId, accountId, to, to]
          );
          convId = newConv.insertId;
        }
      }

      // Save message
      await pool.execute(
        `INSERT INTO whatsapp_cloud_messages 
         (conversation_id, message_id, direction, message_type, media_url, filename, status, timestamp, created_at)
         VALUES (?, ?, 'outbound', ?, ?, ?, 'sent', NOW(), NOW())`,
        [convId, response.data.messages[0].id, mediaType, file.path, file.originalname]
      );

      // Update conversation
      await pool.execute(
        `UPDATE whatsapp_cloud_conversations 
         SET last_message_text = '[Media]', last_message_time = NOW(), last_message_from = 'agent', updated_at = NOW()
         WHERE id = ?`,
        [convId]
      );

      // Clean up uploaded file
      fs.unlinkSync(file.path);

      return res.json({
        success: true,
        message: 'Media sent successfully',
        data: {
          messageId: response.data.messages[0].id,
          conversationId: convId
        }
      });
    } catch (error) {
      logger.error('Error sending media', {
        error: error.message,
        stack: error.stack,
        response: error.response?.data
      });

      // Clean up file on error
      if (req.file) {
        const fs = require('fs');
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          logger.error('Error deleting temp file', { error: e.message });
        }
      }

      return res.status(500).json({
        success: false,
        message: error.response?.data?.error?.message || 'Failed to send media'
      });
    }
  }

  /**
   * Get all conversations for tenant (admin view)
   * GET /api/whatsapp-cloud/admin/conversations
   */
  static async getAdminConversations(req, res) {
    try {
      const tenantId = req.tenantId || req.user.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'Tenant ID not found in request'
        });
      }

      // Get conversations with account info and user info
      const [conversations] = await pool.execute(
        `SELECT c.*, 
                a.account_name, 
                a.phone_number as account_phone,
                u.name as claimed_by_name,
                u.username as claimed_by_username,
                COALESCE(u.store, s.name) as claimed_by_store,
                COALESCE(u.department, d.name) as claimed_by_department
         FROM whatsapp_cloud_conversations c
         JOIN whatsapp_cloud_accounts a ON c.account_id = a.id
         LEFT JOIN users u ON c.claimed_by_user_id = u.id AND u.tenant_id = c.tenant_id
         LEFT JOIN stores s ON u.store_id = s.id
         LEFT JOIN departments d ON u.department_id = d.id
         WHERE c.tenant_id = ?
         ORDER BY c.last_message_time DESC`,
        [tenantId]
      );

      logger.info('Admin conversations retrieved', { 
        tenantId, 
        count: conversations.length 
      });

      return res.json({
        success: true,
        data: conversations
      });
    } catch (error) {
      logger.error('Error getting admin conversations', { 
        error: error.message,
        stack: error.stack
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to load conversations'
      });
    }
  }
}

module.exports = WhatsAppCloudController;
