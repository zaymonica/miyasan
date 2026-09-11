/**
 * Passenger Entry Point (cPanel Shared Hosting)
 * 
 * This file serves as the entry point for Phusion Passenger on cPanel.
 * It simply requires the main server.js file.
 * 
 * In cPanel > Setup Node.js App, you can use either:
 * - Application startup file: server.js (recommended)
 * - Application startup file: app.js (this file)
 */

// Load the main server
require('./server');
