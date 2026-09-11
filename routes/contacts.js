/**
 * Contact Routes
 * Handles contact and contact group management
 * 
 * @module routes/contacts
 */

const express = require('express');
const router = express.Router();
const ContactController = require('../controllers/ContactController');
const { checkResourceLimit } = require('../middleware/planLimits');

// Note: requireAuth is applied globally in server.js for /api/tenant/* routes

/**
 * @swagger
 * /api/tenant/contacts:
 *   get:
 *     summary: Get all contacts for tenant
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: group_id
 *         schema:
 *           type: integer
 *         description: Filter by group ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, phone, or email
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: List of contacts
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/contacts', ContactController.getContacts);

/**
 * @swagger
 * /api/tenant/contacts/{id}:
 *   get:
 *     summary: Get single contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contact ID
 *     responses:
 *       200:
 *         description: Contact details
 *       404:
 *         description: Contact not found
 *       500:
 *         description: Server error
 */
router.get('/contacts/:id', ContactController.getContact);

/**
 * @swagger
 * /api/tenant/contacts:
 *   post:
 *     summary: Create new contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - phone
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               group_id:
 *                 type: integer
 *               tags:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contact created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Contact limit reached
 *       500:
 *         description: Server error
 */
router.post('/contacts', checkResourceLimit('contacts'), ContactController.createContact);

/**
 * @swagger
 * /api/tenant/contacts/{id}:
 *   put:
 *     summary: Update contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contact ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               email:
 *                 type: string
 *               group_id:
 *                 type: integer
 *               tags:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contact updated successfully
 *       404:
 *         description: Contact not found
 *       500:
 *         description: Server error
 */
router.put('/contacts/:id', ContactController.updateContact);

/**
 * @swagger
 * /api/tenant/contacts/{id}:
 *   delete:
 *     summary: Delete contact
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Contact ID
 *     responses:
 *       200:
 *         description: Contact deleted successfully
 *       404:
 *         description: Contact not found
 *       500:
 *         description: Server error
 */
router.delete('/contacts/:id', ContactController.deleteContact);

/**
 * @swagger
 * /api/tenant/contacts/import:
 *   post:
 *     summary: Import multiple contacts
 *     tags: [Contacts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contacts
 *             properties:
 *               contacts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - phone
 *                   properties:
 *                     name:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     email:
 *                       type: string
 *                     group_id:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Contacts imported successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Contact limit reached
 *       500:
 *         description: Server error
 */
router.post('/contacts/import', ContactController.importContacts);

/**
 * @swagger
 * /api/tenant/contact-groups:
 *   get:
 *     summary: Get all contact groups
 *     tags: [Contact Groups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of contact groups
 *       500:
 *         description: Server error
 */
router.get('/contact-groups', ContactController.getGroups);

/**
 * @swagger
 * /api/tenant/contact-groups:
 *   post:
 *     summary: Create new contact group
 *     tags: [Contact Groups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - group_name
 *             properties:
 *               group_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Group created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Group limit reached
 *       500:
 *         description: Server error
 */
router.post('/contact-groups', checkResourceLimit('contact_groups'), ContactController.createGroup);

/**
 * @swagger
 * /api/tenant/contact-groups/{id}:
 *   put:
 *     summary: Update contact group
 *     tags: [Contact Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Group ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               group_name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Group updated successfully
 *       404:
 *         description: Group not found
 *       500:
 *         description: Server error
 */
router.put('/contact-groups/:id', ContactController.updateGroup);

/**
 * @swagger
 * /api/tenant/contact-groups/{id}:
 *   delete:
 *     summary: Delete contact group
 *     tags: [Contact Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Group ID
 *     responses:
 *       200:
 *         description: Group deleted successfully
 *       400:
 *         description: Cannot delete default group
 *       404:
 *         description: Group not found
 *       500:
 *         description: Server error
 */
router.delete('/contact-groups/:id', ContactController.deleteGroup);

module.exports = router;
