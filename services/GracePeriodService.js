/**
 * GracePeriodService.js
 * 
 * Manages the hidden grace period functionality for tenant subscriptions.
 * The grace period adds 7 extra days after the official subscription end date,
 * but this is invisible to both super admin and tenant interfaces.
 * 
 * @module services/GracePeriodService
 */

const { pool } = require('../config/database');
const { logger } = require('../config/logger');

// Default grace period in days (hidden from UI)
const DEFAULT_GRACE_PERIOD_DAYS = 7;

class GracePeriodService {
  /**
   * Get the grace period days from system settings
   * @returns {Promise<number>} Number of grace period days
   */
  static async getGracePeriodDays() {
    try {
      const [settings] = await pool.execute(
        'SELECT grace_period_days FROM system_settings WHERE id = 1'
      );
      return settings[0]?.grace_period_days || DEFAULT_GRACE_PERIOD_DAYS;
    } catch (error) {
      logger.error('Error getting grace period days:', error);
      return DEFAULT_GRACE_PERIOD_DAYS;
    }
  }

  /**
   * Calculate the grace period end date based on subscription end date
   * @param {Date|string} subscriptionEndDate - The official subscription end date
   * @returns {Promise<Date>} The actual date when tenant should be blocked
   */
  static async calculateGracePeriodEnd(subscriptionEndDate) {
    const graceDays = await this.getGracePeriodDays();
    const endDate = new Date(subscriptionEndDate);
    endDate.setDate(endDate.getDate() + graceDays);
    return endDate;
  }

  /**
   * Update tenant's grace period end date
   * @param {number} tenantId - Tenant ID
   * @param {Date|string} subscriptionEndDate - The official subscription end date
   * @returns {Promise<void>}
   */
  static async updateTenantGracePeriod(tenantId, subscriptionEndDate) {
    try {
      const gracePeriodEnd = await this.calculateGracePeriodEnd(subscriptionEndDate);
      
      await pool.execute(
        'UPDATE tenants SET grace_period_end = ?, updated_at = NOW() WHERE id = ?',
        [gracePeriodEnd, tenantId]
      );
      
      logger.info(`Grace period updated for tenant ${tenantId}: ends at ${gracePeriodEnd.toISOString()}`);
    } catch (error) {
      logger.error(`Error updating grace period for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a tenant is within the grace period
   * Returns true if tenant should still have access (even if subscription appears expired)
   * @param {number} tenantId - Tenant ID
   * @returns {Promise<{isActive: boolean, inGracePeriod: boolean, daysRemaining: number}>}
   */
  static async checkTenantGracePeriod(tenantId) {
    try {
      const [tenants] = await pool.execute(
        `SELECT id, status, subscription_end_date, next_billing_date, grace_period_end, payment_status
         FROM tenants WHERE id = ?`,
        [tenantId]
      );

      if (!tenants.length) {
        return { isActive: false, inGracePeriod: false, daysRemaining: 0 };
      }

      const tenant = tenants[0];
      const now = new Date();

      // If tenant is active, they're good
      if (tenant.status === 'active') {
        return { isActive: true, inGracePeriod: false, daysRemaining: 0 };
      }

      // If tenant is in grace_period status, check if still within grace period
      if (tenant.status === 'grace_period') {
        const gracePeriodEnd = tenant.grace_period_end ? new Date(tenant.grace_period_end) : null;
        
        if (gracePeriodEnd && now < gracePeriodEnd) {
          const daysRemaining = Math.ceil((gracePeriodEnd - now) / (1000 * 60 * 60 * 24));
          return { isActive: true, inGracePeriod: true, daysRemaining };
        }
      }

      // Check if we should be in grace period based on dates
      const subscriptionEnd = tenant.subscription_end_date ? new Date(tenant.subscription_end_date) : null;
      const nextBilling = tenant.next_billing_date ? new Date(tenant.next_billing_date) : null;
      const gracePeriodEnd = tenant.grace_period_end ? new Date(tenant.grace_period_end) : null;

      // If grace_period_end is set and we're still within it
      if (gracePeriodEnd && now < gracePeriodEnd) {
        const daysRemaining = Math.ceil((gracePeriodEnd - now) / (1000 * 60 * 60 * 24));
        return { isActive: true, inGracePeriod: true, daysRemaining };
      }

      // If no grace_period_end but subscription_end_date exists, calculate on the fly
      if (!gracePeriodEnd && (subscriptionEnd || nextBilling)) {
        const referenceDate = subscriptionEnd || nextBilling;
        const calculatedGraceEnd = await this.calculateGracePeriodEnd(referenceDate);
        
        if (now < calculatedGraceEnd) {
          const daysRemaining = Math.ceil((calculatedGraceEnd - now) / (1000 * 60 * 60 * 24));
          // Update the grace_period_end in database for future checks
          await this.updateTenantGracePeriod(tenantId, referenceDate);
          return { isActive: true, inGracePeriod: true, daysRemaining };
        }
      }

      return { isActive: false, inGracePeriod: false, daysRemaining: 0 };
    } catch (error) {
      logger.error(`Error checking grace period for tenant ${tenantId}:`, error);
      // Fail open - allow access if there's an error checking
      return { isActive: true, inGracePeriod: false, daysRemaining: 0 };
    }
  }

  /**
   * Check if tenant should be allowed access based on status and grace period
   * This is the main method to be used by middleware and auth
   * @param {Object} tenant - Tenant object with status and dates
   * @returns {Promise<boolean>} True if tenant should have access
   */
  static async shouldAllowAccess(tenant) {
    if (!tenant) return false;

    // Active tenants always have access
    if (tenant.status === 'active') {
      return true;
    }

    // Grace period status - check if still within grace period
    if (tenant.status === 'grace_period') {
      const result = await this.checkTenantGracePeriod(tenant.id);
      return result.isActive;
    }

    // For suspended/cancelled, check if they should actually be in grace period
    if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
      const result = await this.checkTenantGracePeriod(tenant.id);
      if (result.inGracePeriod) {
        // Update status to grace_period since they're still within the period
        await pool.execute(
          'UPDATE tenants SET status = ?, updated_at = NOW() WHERE id = ?',
          ['grace_period', tenant.id]
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Process all tenants and update their status based on grace period
   * This should be called by a scheduled job
   * @returns {Promise<{processed: number, suspended: number, inGracePeriod: number}>}
   */
  static async processAllTenants() {
    const connection = await pool.getConnection();
    let processed = 0;
    let suspended = 0;
    let inGracePeriod = 0;

    try {
      await connection.beginTransaction();

      // Get all tenants that might need status update (exclude system tenant id=0)
      const [tenants] = await connection.execute(`
        SELECT id, status, subscription_end_date, next_billing_date, grace_period_end, payment_status
        FROM tenants 
        WHERE status IN ('active', 'grace_period')
          AND (subscription_end_date IS NOT NULL OR next_billing_date IS NOT NULL)
          AND id != 0
      `);

      const now = new Date();
      const graceDays = await this.getGracePeriodDays();

      for (const tenant of tenants) {
        processed++;
        
        const subscriptionEnd = tenant.subscription_end_date ? new Date(tenant.subscription_end_date) : null;
        const nextBilling = tenant.next_billing_date ? new Date(tenant.next_billing_date) : null;
        const referenceDate = subscriptionEnd || nextBilling;

        if (!referenceDate) continue;

        // Calculate grace period end if not set
        let gracePeriodEnd = tenant.grace_period_end ? new Date(tenant.grace_period_end) : null;
        if (!gracePeriodEnd) {
          gracePeriodEnd = new Date(referenceDate);
          gracePeriodEnd.setDate(gracePeriodEnd.getDate() + graceDays);
          
          await connection.execute(
            'UPDATE tenants SET grace_period_end = ? WHERE id = ?',
            [gracePeriodEnd, tenant.id]
          );
        }

        // Check if subscription has "officially" expired (for display purposes)
        if (now > referenceDate) {
          // Check if still within grace period
          if (now < gracePeriodEnd) {
            // Should be in grace period (but this is hidden from UI)
            if (tenant.status !== 'grace_period') {
              await connection.execute(
                'UPDATE tenants SET status = ?, updated_at = NOW() WHERE id = ?',
                ['grace_period', tenant.id]
              );
              inGracePeriod++;
              logger.info(`Tenant ${tenant.id} moved to grace period (hidden)`);
            }
          } else {
            // Grace period has ended, suspend the tenant
            if (tenant.status !== 'suspended') {
              await connection.execute(
                'UPDATE tenants SET status = ?, suspension_date = NOW(), updated_at = NOW() WHERE id = ?',
                ['suspended', tenant.id]
              );
              suspended++;
              logger.info(`Tenant ${tenant.id} suspended after grace period ended`);

              // Send suspension notification
              try {
                const notificationService = require('./NotificationService');
                await notificationService.sendNotificationToTenant(
                  tenant.id,
                  'account_suspended',
                  'both',
                  {
                    suspension_reason: 'Período de graça expirado - pagamento pendente'
                  }
                );
                logger.info(`Suspension notification sent to tenant ${tenant.id}`);
              } catch (notifError) {
                logger.error(`Failed to send suspension notification to tenant ${tenant.id}:`, notifError);
              }
            }
          }
        }
      }

      await connection.commit();
      
      logger.info(`Grace period processing complete: ${processed} processed, ${inGracePeriod} in grace period, ${suspended} suspended`);
      
      return { processed, suspended, inGracePeriod };
    } catch (error) {
      await connection.rollback();
      logger.error('Error processing tenants for grace period:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Set grace period for a new subscription or renewal
   * @param {number} tenantId - Tenant ID
   * @param {Date|string} subscriptionEndDate - The official subscription end date
   * @param {Date|string} [nextBillingDate] - The next billing date (optional)
   * @returns {Promise<void>}
   */
  static async setGracePeriodForSubscription(tenantId, subscriptionEndDate, nextBillingDate = null) {
    try {
      const gracePeriodEnd = await this.calculateGracePeriodEnd(subscriptionEndDate);
      
      const updateFields = ['grace_period_end = ?', 'updated_at = NOW()'];
      const values = [gracePeriodEnd];

      if (subscriptionEndDate) {
        updateFields.push('subscription_end_date = ?');
        values.push(subscriptionEndDate);
      }

      if (nextBillingDate) {
        updateFields.push('next_billing_date = ?');
        values.push(nextBillingDate);
      }

      values.push(tenantId);

      await pool.execute(
        `UPDATE tenants SET ${updateFields.join(', ')} WHERE id = ?`,
        values
      );

      logger.info(`Grace period set for tenant ${tenantId}: subscription ends ${subscriptionEndDate}, grace period ends ${gracePeriodEnd.toISOString()}`);
    } catch (error) {
      logger.error(`Error setting grace period for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get tenant status for display (hides grace period details)
   * For super admin and tenant UI, grace_period appears as "active"
   * @param {Object} tenant - Tenant object
   * @returns {Object} Tenant with display-friendly status
   */
  static getDisplayStatus(tenant) {
    if (!tenant) return null;

    const displayTenant = { ...tenant };

    // Hide grace_period status - show as active to users
    if (displayTenant.status === 'grace_period') {
      displayTenant.display_status = 'active';
    } else {
      displayTenant.display_status = displayTenant.status;
    }

    // Don't expose grace_period_end to the UI
    delete displayTenant.grace_period_end;

    return displayTenant;
  }

  /**
   * Get all tenants with display-friendly status
   * @param {Array} tenants - Array of tenant objects
   * @returns {Array} Tenants with display-friendly status
   */
  static getDisplayStatusForAll(tenants) {
    return tenants.map(tenant => this.getDisplayStatus(tenant));
  }
}

module.exports = GracePeriodService;
