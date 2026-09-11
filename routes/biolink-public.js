/**
 * Bio Link Public Routes
 * Serves public bio pages, short links, QR codes, etc.
 * 
 * IMPORTANT: These routes check if the biolink addon is active before serving content
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { logger } = require('../config/logger');
const { checkAddonStatus } = require('../middleware/addonCheck');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

/**
 * Get SMTP settings from database
 */
async function getSMTPSettings() {
  try {
    const [settings] = await pool.execute(
      'SELECT * FROM email_notification_settings WHERE id = 1'
    );
    return settings[0] || null;
  } catch (error) {
    logger.error('Error getting SMTP settings', { error: error.message });
    return null;
  }
}

/**
 * Send email notification for biolink lead
 */
async function sendLeadNotificationEmail(recipientEmail, leadData, projectName) {
  try {
    const smtpSettings = await getSMTPSettings();
    
    if (!smtpSettings || !smtpSettings.enabled) {
      logger.warn('SMTP not configured or disabled, skipping email notification');
      return { success: false, reason: 'SMTP not configured' };
    }

    const transporterConfig = {
      host: smtpSettings.smtp_host,
      port: parseInt(smtpSettings.smtp_port),
      secure: smtpSettings.smtp_secure === true || smtpSettings.smtp_secure === 'true' || parseInt(smtpSettings.smtp_port) === 465,
      auth: {
        user: smtpSettings.smtp_user,
        pass: smtpSettings.smtp_password
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      }
    };

    if (parseInt(smtpSettings.smtp_port) === 587) {
      transporterConfig.secure = false;
      transporterConfig.requireTLS = true;
    }

    const transporter = nodemailer.createTransport(transporterConfig);

    // Build email content based on lead type
    let subject, htmlBody;
    
    if (leadData.type === 'email') {
      subject = `📧 New Email Signup - ${projectName}`;
      htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3b82f6; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">New Email Signup</h2>
          <p style="color: #666;">You have a new email signup from your Bio Link page <strong>${projectName}</strong>.</p>
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Email:</strong> ${leadData.email}</p>
          </div>
          <p style="color: #999; font-size: 12px;">This notification was sent from your Bio Link page.</p>
        </div>
      `;
    } else if (leadData.type === 'phone') {
      subject = `📱 New Phone Submission - ${projectName}`;
      htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #84cc16; border-bottom: 2px solid #84cc16; padding-bottom: 10px;">New Phone Submission</h2>
          <p style="color: #666;">You have a new phone submission from your Bio Link page <strong>${projectName}</strong>.</p>
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Phone:</strong> ${leadData.phone}</p>
          </div>
          <p style="color: #999; font-size: 12px;">This notification was sent from your Bio Link page.</p>
        </div>
      `;
    } else if (leadData.type === 'contact') {
      subject = `💬 New Contact Message - ${projectName}`;
      htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #8b5cf6; border-bottom: 2px solid #8b5cf6; padding-bottom: 10px;">New Contact Message</h2>
          <p style="color: #666;">You have a new contact message from your Bio Link page <strong>${projectName}</strong>.</p>
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="margin: 10px 0;"><strong>Name:</strong> ${leadData.name || 'Not provided'}</p>
            <p style="margin: 10px 0;"><strong>Email:</strong> ${leadData.email || 'Not provided'}</p>
            <p style="margin: 10px 0;"><strong>Message:</strong></p>
            <p style="background: white; padding: 15px; border-radius: 4px; border-left: 3px solid #8b5cf6;">${leadData.message || 'No message'}</p>
          </div>
          <p style="color: #999; font-size: 12px;">This notification was sent from your Bio Link page.</p>
        </div>
      `;
    } else {
      subject = `📋 New Lead - ${projectName}`;
      htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #3b82f6; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">New Lead</h2>
          <p style="color: #666;">You have a new lead from your Bio Link page <strong>${projectName}</strong>.</p>
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
            ${leadData.name ? `<p style="margin: 10px 0;"><strong>Name:</strong> ${leadData.name}</p>` : ''}
            ${leadData.email ? `<p style="margin: 10px 0;"><strong>Email:</strong> ${leadData.email}</p>` : ''}
            ${leadData.phone ? `<p style="margin: 10px 0;"><strong>Phone:</strong> ${leadData.phone}</p>` : ''}
            ${leadData.message ? `<p style="margin: 10px 0;"><strong>Message:</strong> ${leadData.message}</p>` : ''}
          </div>
          <p style="color: #999; font-size: 12px;">This notification was sent from your Bio Link page.</p>
        </div>
      `;
    }

    await transporter.sendMail({
      from: `"${smtpSettings.from_name || 'Bio Link'}" <${smtpSettings.from_email}>`,
      to: recipientEmail,
      subject: subject,
      html: htmlBody
    });

    logger.info('Lead notification email sent', { recipientEmail, type: leadData.type, projectName });
    return { success: true };
  } catch (error) {
    logger.error('Error sending lead notification email', { error: error.message, recipientEmail });
    return { success: false, reason: error.message };
  }
}

/**
 * Middleware to check if biolink addon is active for public routes
 */
async function checkBiolinkAddon(req, res, next) {
  try {
    const status = await checkAddonStatus('biolink');
    if (!status.installed || !status.active) {
      return res.status(404).send(renderAddonDisabled());
    }
    next();
  } catch (error) {
    logger.error('Error checking biolink addon status', { error: error.message });
    return res.status(500).send(renderError());
  }
}

/**
 * Render addon disabled page
 */
function renderAddonDisabled() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Not Available</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-align: center;
      padding: 20px;
    }
    .container {
      max-width: 400px;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 10px;
    }
    p {
      opacity: 0.9;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔒</div>
    <h1>Page Not Available</h1>
    <p>This page is currently unavailable. Please try again later.</p>
  </div>
</body>
</html>`;
}

// Apply addon check to all routes
router.use(checkBiolinkAddon);

/**
 * POST /lead - Save form submission (email, phone, contact)
 */
router.post('/lead', async (req, res) => {
  try {
    const { blockId, type, email, phone, name, message } = req.body;
    
    if (!blockId || !type) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Get block and project info
    const [blocks] = await pool.execute(
      `SELECT b.*, p.project_id, pr.tenant_id 
       FROM biolink_blocks b
       JOIN biolink_pages p ON b.page_id = p.id
       JOIN biolink_projects pr ON p.project_id = pr.id
       WHERE b.id = ?`,
      [blockId]
    );

    if (blocks.length === 0) {
      return res.status(404).json({ success: false, message: 'Block not found' });
    }

    const block = blocks[0];
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';

    // Parse block content to get recipient email
    let blockContent = {};
    try {
      blockContent = typeof block.content === 'string' ? JSON.parse(block.content || '{}') : block.content || {};
    } catch (e) {
      blockContent = {};
    }

    // Save lead
    await pool.execute(
      `INSERT INTO biolink_leads (tenant_id, project_id, block_id, lead_type, email, phone, name, message, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [block.tenant_id, block.project_id, blockId, type, email || null, phone || null, name || null, message || null, ip, userAgent]
    );

    logger.info('Biolink lead saved', { blockId, type, tenantId: block.tenant_id });

    // Get project name for email
    const [projects] = await pool.execute(
      'SELECT name FROM biolink_projects WHERE id = ?',
      [block.project_id]
    );
    const projectName = projects[0]?.name || 'Bio Link';

    // Determine recipient email
    let recipientEmail = blockContent.recipientEmail || blockContent.notificationEmail;
    
    // If no recipient email in block, try to get tenant email
    if (!recipientEmail) {
      const [tenants] = await pool.execute(
        'SELECT email FROM tenants WHERE id = ?',
        [block.tenant_id]
      );
      recipientEmail = tenants[0]?.email;
    }

    // Send email notification if we have a recipient
    if (recipientEmail) {
      const leadData = { type, email, phone, name, message };
      sendLeadNotificationEmail(recipientEmail, leadData, projectName)
        .then(result => {
          if (result.success) {
            logger.info('Lead notification email sent successfully', { recipientEmail, blockId });
          } else {
            logger.warn('Lead notification email not sent', { reason: result.reason, recipientEmail, blockId });
          }
        })
        .catch(err => {
          logger.error('Error sending lead notification email', { error: err.message, recipientEmail, blockId });
        });
    }

    return res.json({ success: true, message: 'Lead saved successfully' });
  } catch (error) {
    logger.error('Error saving biolink lead', { error: error.message });
    return res.status(500).json({ success: false, message: 'Error saving lead' });
  }
});

/**
 * GET /:slug - Render public bio page or redirect short link
 */
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // Find project by slug
    const [projects] = await pool.execute(
      `SELECT p.*, t.name as tenant_name, t.subdomain
       FROM biolink_projects p
       JOIN tenants t ON p.tenant_id = t.id
       WHERE p.slug = ? AND p.status = 'active'`,
      [slug]
    );

    if (projects.length === 0) {
      return res.status(404).send(renderNotFound());
    }

    const project = projects[0];

    // Track analytics
    trackAnalytics(req, project.id, project.tenant_id);

    // Handle different project types
    switch (project.type) {
      case 'biopage':
        return await renderBioPage(res, project);
      
      case 'shortlink':
        // Get link details
        const [links] = await pool.execute(
          'SELECT * FROM biolink_links WHERE project_id = ? AND is_active = 1',
          [project.id]
        );
        if (links.length > 0 && links[0].destination_url) {
          // Update click count
          await pool.execute(
            'UPDATE biolink_projects SET clicks = clicks + 1 WHERE id = ?',
            [project.id]
          );
          return res.redirect(links[0].destination_url);
        }
        return res.status(404).send(renderNotFound());

      case 'file':
        return await renderFilePage(res, project);

      case 'vcard':
        return await renderVCardPage(res, project);

      case 'event':
        return await renderEventPage(res, project);

      case 'qrcode':
        return await renderQRCodePage(res, project);

      default:
        return res.status(404).send(renderNotFound());
    }
  } catch (error) {
    logger.error('Error serving bio link page', { error: error.message, slug: req.params.slug });
    return res.status(500).send(renderError());
  }
});

/**
 * Render Bio Page
 */
async function renderBioPage(res, project) {
  try {
    // Get page details
    const [pages] = await pool.execute(
      'SELECT * FROM biolink_pages WHERE project_id = ?',
      [project.id]
    );

    const page = pages[0] || {};

    // Get blocks
    const [blocks] = await pool.execute(
      `SELECT * FROM biolink_blocks 
       WHERE page_id = ? AND is_active = 1 
       ORDER BY position ASC`,
      [page.id || 0]
    );

    // Generate HTML
    const html = generateBioPageHTML(project, page, blocks);
    return res.send(html);
  } catch (error) {
    logger.error('Error rendering bio page', { error: error.message });
    return res.status(500).send(renderError());
  }
}

/**
 * Generate Bio Page HTML
 */
function generateBioPageHTML(project, page, blocks) {
  const bgStyle = page.background_type === 'gradient' 
    ? `background: ${page.background_value};`
    : page.background_type === 'image'
    ? `background-image: url('${page.background_value}'); background-size: cover; background-position: center;`
    : `background-color: ${page.background_value || '#ffffff'};`;

  const textColor = page.text_color || '#000000';
  const fontFamily = page.font_family || 'Inter';

  let blocksHTML = '';
  for (const block of blocks) {
    blocksHTML += renderBlock(block);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(page.seo_title || page.title || project.name)}</title>
  <meta name="description" content="${escapeHtml(page.seo_description || page.description || '')}">
  ${page.seo_image ? `<meta property="og:image" content="${page.seo_image}">` : ''}
  <meta property="og:title" content="${escapeHtml(page.seo_title || page.title || project.name)}">
  <meta property="og:description" content="${escapeHtml(page.seo_description || page.description || '')}">
  ${page.favicon ? `<link rel="icon" href="${page.favicon}">` : ''}
  <link href="https://fonts.googleapis.com/css2?family=${fontFamily.replace(' ', '+')}:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: '${fontFamily}', sans-serif;
      min-height: 100vh;
      ${bgStyle}
      color: ${textColor};
      display: flex;
      justify-content: center;
      padding: 40px 20px;
    }
    .container {
      width: 100%;
      max-width: 480px;
      text-align: center;
    }
    .avatar {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      object-fit: cover;
      margin-bottom: 15px;
      border: 3px solid rgba(255,255,255,0.3);
      box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    }
    .title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .description {
      font-size: 14px;
      opacity: 0.8;
      margin-bottom: 30px;
      line-height: 1.5;
    }
    .blocks {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .block-link {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 16px 24px;
      background: rgba(0,0,0,0.8);
      color: white;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 500;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .block-link:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0,0,0,0.2);
    }
    .block-heading {
      font-size: 18px;
      font-weight: 600;
      margin: 20px 0 10px;
    }
    .block-text {
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 15px;
    }
    .block-image {
      width: 100%;
      border-radius: 12px;
      margin-bottom: 15px;
    }
    .social-links {
      display: flex;
      justify-content: center;
      gap: 15px;
      margin: 20px 0;
    }
    .social-links a {
      width: 45px;
      height: 45px;
      border-radius: 50%;
      background: rgba(0,0,0,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: inherit;
      font-size: 20px;
      transition: transform 0.2s, background 0.2s;
    }
    .social-links a:hover {
      transform: scale(1.1);
      background: rgba(0,0,0,0.2);
    }
    .block-embed {
      width: 100%;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 15px;
    }
    .block-embed iframe {
      width: 100%;
      border: none;
      display: block;
    }
    .youtube-embed {
      position: relative;
      width: 100%;
      background: #000;
    }
    .youtube-embed iframe {
      width: 100%;
      height: 270px;
    }
    .spotify-embed {
      background: #282828;
    }
    .spotify-embed iframe {
      width: 100%;
      height: 152px;
    }
    .soundcloud-embed {
      background: #ff5500;
    }
    .soundcloud-embed iframe {
      width: 100%;
      height: 166px;
    }
    .vimeo-embed {
      position: relative;
      width: 100%;
      background: #000;
    }
    .vimeo-embed iframe {
      width: 100%;
      height: 270px;
    }
    .twitch-embed {
      position: relative;
      width: 100%;
      background: #9146ff;
    }
    .twitch-embed iframe {
      width: 100%;
      height: 270px;
    }
    .map-embed {
      background: #e5e5e5;
    }
    .map-embed iframe {
      width: 100%;
      height: 300px;
    }
    .payment-link {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .nft-link {
      background: linear-gradient(135deg, #2081e2 0%, #1868b7 100%);
    }
    .block-avatar {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      object-fit: cover;
      margin: 15px auto;
      display: block;
    }
    .block-divider {
      border: none;
      border-top: 1px solid rgba(128,128,128,0.3);
      margin: 20px 0;
    }
    .block-form {
      padding: 15px;
      border-radius: 12px;
      margin-bottom: 15px;
    }
    .block-form form {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .block-form input,
    .block-form textarea {
      padding: 12px 15px;
      border: 1px solid rgba(128,128,128,0.3);
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      background: rgba(255,255,255,0.9);
      color: #333;
    }
    .block-form input:focus,
    .block-form textarea:focus {
      outline: none;
      border-color: #3b82f6;
    }
    .block-form button {
      padding: 12px 20px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .block-form button:hover {
      background: #2563eb;
    }
    .powered-by {
      margin-top: 40px;
      font-size: 12px;
      opacity: 0.5;
    }
    .powered-by a {
      color: inherit;
      text-decoration: none;
    }
    /* Custom Modal Styles */
    .custom-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s, visibility 0.3s;
    }
    .custom-modal-overlay.active {
      opacity: 1;
      visibility: visible;
    }
    .custom-modal {
      background: white;
      border-radius: 16px;
      padding: 30px;
      max-width: 400px;
      width: 90%;
      text-align: center;
      transform: scale(0.9);
      transition: transform 0.3s;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .custom-modal-overlay.active .custom-modal {
      transform: scale(1);
    }
    .custom-modal-icon {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 28px;
    }
    .custom-modal-icon.success {
      background: #d1fae5;
      color: #059669;
    }
    .custom-modal-icon.info {
      background: #dbeafe;
      color: #2563eb;
    }
    .custom-modal-icon.error {
      background: #fee2e2;
      color: #dc2626;
    }
    .custom-modal h3 {
      margin: 0 0 10px;
      font-size: 20px;
      color: #1f2937;
    }
    .custom-modal p {
      margin: 0 0 25px;
      color: #6b7280;
      font-size: 14px;
      line-height: 1.5;
    }
    .custom-modal-btn {
      padding: 12px 30px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, transform 0.2s;
    }
    .custom-modal-btn:hover {
      transform: translateY(-1px);
    }
    .custom-modal-btn.primary {
      background: #3b82f6;
      color: white;
    }
    .custom-modal-btn.primary:hover {
      background: #2563eb;
    }
    ${page.custom_css || ''}
  </style>
  ${page.analytics_code || ''}
</head>
<body>
  <div class="container">
    ${page.avatar_url ? `<img src="${page.avatar_url}" alt="Avatar" class="avatar">` : ''}
    <h1 class="title">${escapeHtml(page.title || project.name)}</h1>
    ${page.description ? `<p class="description">${escapeHtml(page.description)}</p>` : ''}
    
    <div class="blocks">
      ${blocksHTML}
    </div>

    <div class="powered-by">
      <a href="/">Powered by Misayan</a>
    </div>
  </div>
  <script>
    // Custom Modal System
    function showModal(title, message, type = 'success') {
      // Remove existing modal if any
      const existing = document.querySelector('.custom-modal-overlay');
      if (existing) existing.remove();
      
      const icons = {
        success: 'fas fa-check',
        info: 'fas fa-info',
        error: 'fas fa-times'
      };
      
      const modal = document.createElement('div');
      modal.className = 'custom-modal-overlay';
      modal.innerHTML = \`
        <div class="custom-modal">
          <div class="custom-modal-icon \${type}">
            <i class="\${icons[type] || icons.success}"></i>
          </div>
          <h3>\${title}</h3>
          <p>\${message}</p>
          <button class="custom-modal-btn primary" onclick="closeModal()">OK</button>
        </div>
      \`;
      
      document.body.appendChild(modal);
      
      // Trigger animation
      setTimeout(() => modal.classList.add('active'), 10);
      
      // Close on overlay click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }
    
    function closeModal() {
      const modal = document.querySelector('.custom-modal-overlay');
      if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
      }
    }
    
    async function handleEmailSignup(form, blockId) {
      const email = form.email.value;
      const btn = form.querySelector('button');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      
      try {
        const response = await fetch('/b/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockId, type: 'email', email })
        });
        const data = await response.json();
        
        if (data.success) {
          showModal('Inscrito!', 'Email cadastrado com sucesso!', 'success');
          form.reset();
        } else {
          showModal('Erro', data.message || 'Erro ao cadastrar email', 'error');
        }
      } catch (error) {
        showModal('Erro', 'Erro de conexão. Tente novamente.', 'error');
      }
      
      btn.disabled = false;
      btn.innerHTML = 'Subscribe';
      return false;
    }
    
    async function handlePhoneCollector(form, blockId) {
      const phone = form.phone.value;
      const btn = form.querySelector('button');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      
      try {
        const response = await fetch('/b/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockId, type: 'phone', phone })
        });
        const data = await response.json();
        
        if (data.success) {
          showModal('Enviado!', 'Telefone cadastrado com sucesso!', 'success');
          form.reset();
        } else {
          showModal('Erro', data.message || 'Erro ao cadastrar telefone', 'error');
        }
      } catch (error) {
        showModal('Erro', 'Erro de conexão. Tente novamente.', 'error');
      }
      
      btn.disabled = false;
      btn.innerHTML = 'Submit';
      return false;
    }
    
    async function handleContactForm(form, blockId) {
      const name = form.name.value;
      const email = form.email.value;
      const message = form.message.value;
      const btn = form.querySelector('button');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      
      try {
        const response = await fetch('/b/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blockId, type: 'contact', name, email, message })
        });
        const data = await response.json();
        
        if (data.success) {
          showModal('Mensagem Enviada!', 'Obrigado pelo contato, ' + name + '! Responderemos em breve.', 'success');
          form.reset();
        } else {
          showModal('Erro', data.message || 'Erro ao enviar mensagem', 'error');
        }
      } catch (error) {
        showModal('Erro', 'Erro de conexão. Tente novamente.', 'error');
      }
      
      btn.disabled = false;
      btn.innerHTML = 'Send';
      return false;
    }
  </script>
</body>
</html>`;
}

/**
 * Get block style string from settings
 */
function getBlockStyle(settings) {
  if (!settings) return '';
  
  const styles = [];
  
  // Background with opacity
  if (settings.bgColor) {
    const opacity = (settings.bgOpacity ?? 100) / 100;
    const hex = settings.bgColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    styles.push(`background-color: rgba(${r}, ${g}, ${b}, ${opacity})`);
  }
  
  // Text color
  if (settings.textColor) {
    styles.push(`color: ${settings.textColor}`);
  }
  
  // Border
  if (settings.borderWidth && settings.borderWidth !== '0') {
    styles.push(`border: ${settings.borderWidth}px solid ${settings.borderColor || '#ffffff'}`);
  }
  
  // Border radius
  if (settings.borderRadius) {
    styles.push(`border-radius: ${settings.borderRadius}px`);
  }
  
  // Shadow
  if (settings.shadow && settings.shadow !== 'none') {
    const shadows = {
      'sm': '0 1px 2px rgba(0,0,0,0.1)',
      'md': '0 4px 6px rgba(0,0,0,0.1)',
      'lg': '0 10px 15px rgba(0,0,0,0.2)'
    };
    styles.push(`box-shadow: ${shadows[settings.shadow] || 'none'}`);
  }
  
  return styles.length > 0 ? `style="${styles.join('; ')}"` : '';
}

/**
 * Render individual block
 */
function renderBlock(block) {
  const content = typeof block.content === 'string' ? JSON.parse(block.content || '{}') : block.content || {};
  const settings = typeof block.settings === 'string' ? JSON.parse(block.settings || '{}') : block.settings || {};
  const blockStyle = getBlockStyle(settings);
  
  switch (block.type) {
    case 'link_url':
      return `
        <a href="${content.url || '#'}" class="block-link" ${blockStyle} target="_blank" rel="noopener">
          ${content.icon ? `<i class="${content.icon}"></i>` : ''}
          <span>${escapeHtml(block.title || content.text || 'Link')}</span>
        </a>
      `;
    
    case 'heading_text':
      return `<h2 class="block-heading" ${blockStyle}>${escapeHtml(block.title || content.text || 'Heading')}</h2>`;
    
    case 'paragraph_text':
      const paragraphText = content.text || block.title || '';
      if (!paragraphText) return '';
      return `<p class="block-text" ${blockStyle}>${escapeHtml(paragraphText)}</p>`;
    
    case 'custom_image':
      if (!content.url) {
        // Show placeholder if no image URL
        return '';
      }
      return `<img src="${content.url}" alt="${escapeHtml(block.title || 'Image')}" class="block-image" ${blockStyle}>`;
    
    case 'avatar_image':
      if (!content.url) return '';
      return `<img src="${content.url}" alt="${escapeHtml(block.title || 'Avatar')}" class="block-avatar" ${blockStyle}>`;
    
    case 'divider':
      return `<hr class="block-divider" ${blockStyle}>`;
    
    case 'social_links':
      const links = content.links || [];
      if (links.length === 0) {
        // No links configured, don't show anything
        return '';
      }
      return `
        <div class="social-links" ${blockStyle}>
          ${links.map(link => `
            <a href="${link.url || '#'}" target="_blank" rel="noopener" title="${escapeHtml(link.platform || '')}">
              <i class="fab fa-${link.platform || 'link'}"></i>
            </a>
          `).join('')}
        </div>
      `;
    
    case 'email_signup':
      return `
        <div class="block-form email-signup" ${blockStyle}>
          <form class="signup-form" onsubmit="return handleEmailSignup(this, ${block.id})">
            <input type="email" name="email" placeholder="${escapeHtml(content.placeholder || 'Enter your email')}" required>
            <button type="submit">${escapeHtml(content.buttonText || 'Subscribe')}</button>
          </form>
        </div>
      `;
    
    case 'phone_collector':
      return `
        <div class="block-form phone-collector" ${blockStyle}>
          <form class="phone-form" onsubmit="return handlePhoneCollector(this, ${block.id})">
            <input type="tel" name="phone" placeholder="${escapeHtml(content.placeholder || 'Enter your phone')}" required>
            <button type="submit">${escapeHtml(content.buttonText || 'Submit')}</button>
          </form>
        </div>
      `;
    
    case 'contact_form':
      return `
        <div class="block-form contact-form" ${blockStyle}>
          <form class="contact-form-inner" onsubmit="return handleContactForm(this, ${block.id})">
            <input type="text" name="name" placeholder="Name" required>
            <input type="email" name="email" placeholder="Email" required>
            <textarea name="message" placeholder="Message" rows="3" required></textarea>
            <button type="submit">${escapeHtml(content.buttonText || 'Send')}</button>
          </form>
        </div>
      `;
    
    case 'youtube_embed':
      let videoId = content.videoId || content.url || '';
      // Extract video ID if full URL was saved
      if (videoId) {
        videoId = String(videoId).trim();
        // Try multiple patterns
        const patterns = [
          /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
          /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
          /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
          /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
          /^([a-zA-Z0-9_-]{11})$/
        ];
        let extracted = false;
        for (const pattern of patterns) {
          const match = videoId.match(pattern);
          if (match) {
            videoId = match[1];
            extracted = true;
            break;
          }
        }
        // If no pattern matched and it's not 11 chars, it's invalid
        if (!extracted && videoId.length !== 11) {
          videoId = '';
        }
      }
      // If no valid video ID, show a placeholder link instead
      if (!videoId || videoId.length !== 11) {
        return `
          <a href="#" class="block-link" ${blockStyle} style="background: #ff0000;">
            <i class="fab fa-youtube"></i>
            <span>${escapeHtml(block.title || 'YouTube')}</span>
          </a>
        `;
      }
      return `
        <div class="block-embed youtube-embed">
          <iframe 
            src="https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
            loading="lazy"
          ></iframe>
        </div>
      `;
    
    case 'spotify_embed':
      let spotifyUrl = content.embedUrl || content.url || '';
      if (spotifyUrl) {
        spotifyUrl = String(spotifyUrl).trim();
        // Convert regular Spotify URL to embed URL if needed
        if (!spotifyUrl.includes('/embed/')) {
          spotifyUrl = spotifyUrl.replace('open.spotify.com/', 'open.spotify.com/embed/');
        }
      }
      // If no valid Spotify URL, show a placeholder link instead
      if (!spotifyUrl || !spotifyUrl.includes('spotify.com')) {
        return `
          <a href="#" class="block-link" ${blockStyle} style="background: #1db954;">
            <i class="fab fa-spotify"></i>
            <span>${escapeHtml(block.title || 'Spotify')}</span>
          </a>
        `;
      }
      return `
        <div class="block-embed spotify-embed">
          <iframe 
            src="${spotifyUrl}" 
            frameborder="0" 
            allowtransparency="true" 
            allow="encrypted-media" 
            loading="lazy"
          ></iframe>
        </div>
      `;
    
    case 'soundcloud_embed':
      if (!content.embedUrl && !content.url) return '';
      return `
        <div class="block-embed soundcloud-embed">
          <iframe src="${content.embedUrl || content.url}" height="166" frameborder="0" allow="autoplay" loading="lazy"></iframe>
        </div>
      `;
    
    case 'tiktok_embed':
      if (!content.videoId && !content.url) return '';
      return `
        <div class="block-embed tiktok-embed">
          <blockquote class="tiktok-embed" data-video-id="${content.videoId || ''}">
            <a href="${content.url || '#'}" target="_blank">View on TikTok</a>
          </blockquote>
        </div>
      `;
    
    case 'vimeo_embed':
      let vimeoId = content.videoId || content.url || '';
      if (vimeoId) {
        const vimeoMatch = vimeoId.match(/(?:vimeo\.com\/)(\d+)/);
        if (vimeoMatch) vimeoId = vimeoMatch[1];
      }
      if (!vimeoId || !/^\d+$/.test(vimeoId)) return '';
      return `
        <div class="block-embed vimeo-embed">
          <iframe src="https://player.vimeo.com/video/${vimeoId}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
        </div>
      `;
    
    case 'twitch_embed':
      if (!content.channel && !content.video) return '';
      const twitchSrc = content.video 
        ? `https://player.twitch.tv/?video=${content.video}&parent=${process.env.APP_DOMAIN || 'localhost'}`
        : `https://player.twitch.tv/?channel=${content.channel}&parent=${process.env.APP_DOMAIN || 'localhost'}`;
      return `
        <div class="block-embed twitch-embed">
          <iframe src="${twitchSrc}" frameborder="0" allowfullscreen loading="lazy"></iframe>
        </div>
      `;
    
    case 'map_embed':
      if (!content.embedUrl && !content.address) return '';
      const mapSrc = content.embedUrl || `https://maps.google.com/maps?q=${encodeURIComponent(content.address || '')}&output=embed`;
      return `
        <div class="block-embed map-embed">
          <iframe src="${mapSrc}" frameborder="0" allowfullscreen loading="lazy"></iframe>
        </div>
      `;
    
    case 'stripe_payment':
    case 'paypal_payment':
      return `
        <a href="${content.paymentUrl || '#'}" class="block-link payment-link" ${blockStyle} target="_blank" rel="noopener">
          <i class="fas fa-credit-card"></i>
          <span>${escapeHtml(block.title || content.buttonText || 'Pay Now')}</span>
        </a>
      `;
    
    case 'opensea_nft':
      if (!content.nftUrl) return '';
      return `
        <a href="${content.nftUrl}" class="block-link nft-link" ${blockStyle} target="_blank" rel="noopener">
          <i class="fas fa-gem"></i>
          <span>${escapeHtml(block.title || 'View NFT')}</span>
        </a>
      `;
    
    default:
      return '';
  }
}

/**
 * Render file download page
 */
async function renderFilePage(res, project) {
  // TODO: Implement file download page
  return res.send(renderNotFound());
}

/**
 * Render vCard page
 */
async function renderVCardPage(res, project) {
  // TODO: Implement vCard page
  return res.send(renderNotFound());
}

/**
 * Render event page
 */
async function renderEventPage(res, project) {
  // TODO: Implement event page
  return res.send(renderNotFound());
}

/**
 * Render QR code page
 */
async function renderQRCodePage(res, project) {
  // TODO: Implement QR code page
  return res.send(renderNotFound());
}

/**
 * Track analytics
 */
async function trackAnalytics(req, projectId, tenantId) {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    const referrer = req.headers['referer'] || '';

    await pool.execute(
      `INSERT INTO biolink_analytics (tenant_id, project_id, event_type, ip_address, user_agent, referrer)
       VALUES (?, ?, 'view', ?, ?, ?)`,
      [tenantId, projectId, ip, userAgent, referrer]
    );
  } catch (error) {
    // Don't fail the request if analytics fails
    logger.warn('Failed to track analytics', { error: error.message });
  }
}

/**
 * Render 404 page
 */
function renderNotFound() {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Page Not Found</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; }
    h1 { font-size: 72px; margin: 0; color: #333; }
    p { color: #666; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <p>Page not found</p>
  </div>
</body>
</html>`;
}

/**
 * Render error page
 */
function renderError() {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Error</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; }
    h1 { font-size: 48px; margin: 0; color: #e74c3c; }
    p { color: #666; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Oops!</h1>
    <p>Something went wrong</p>
  </div>
</body>
</html>`;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = router;
