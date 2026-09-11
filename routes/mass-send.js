/**
 * Mass Send Routes - Multi-tenant
 * 
 * Handles mass messaging campaigns, schedules, and reminders with tenant isolation
 * 
 * @module routes/mass-send
 */

const express = require('express');
const MassSendController = require('../controllers/MassSendController');

const router = express.Router();

// Note: requireAuth is applied globally in server.js for /api/tenant/* routes

// ===== HISTORY (Send Now) =====
router.get('/history', MassSendController.getHistory);
router.post('/history', MassSendController.createHistory);
router.patch('/history/:id/status', MassSendController.updateStatus);
router.patch('/history/:id/message', MassSendController.updateMessage);
router.patch('/history/:id/archive', MassSendController.archive);
router.delete('/history/:id', MassSendController.delete);

// ===== SCHEDULES =====
router.get('/schedules', MassSendController.getSchedules);
router.post('/schedule', MassSendController.createSchedule);
router.patch('/schedule/:id/cancel', MassSendController.cancelSchedule);

// ===== REMINDERS =====
router.get('/reminders', MassSendController.getReminders);
router.post('/reminder', MassSendController.createReminder);
router.patch('/reminder/:id/cancel', MassSendController.cancelReminder);
router.delete('/reminder/:id', MassSendController.deleteReminder);

// ===== LOGS =====
router.get('/logs/:type/:id', MassSendController.getLogs);

module.exports = router;
