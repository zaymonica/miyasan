/**
 * PWA Module
 * Handles service worker registration, install prompt, and preloader
 */

(function() {
    'use strict';

    let deferredPrompt = null;
    let pwaSettings = null;

    /**
     * Initialize PWA
     */
    async function initPWA() {
        console.log('[PWA] Initializing...');
        
        // Load PWA settings
        await loadPWASettings();
        
        // Apply preloader settings
        applyPreloaderSettings();
        
        // Register service worker
        registerServiceWorker();
        
        // Setup install prompt
        setupInstallPrompt();
        
        // Hide preloader when app is ready
        window.addEventListener('load', () => {
            setTimeout(hidePreloader, 1000);
        });
    }

    /**
     * Load PWA settings from server
     */
    async function loadPWASettings() {
        try {
            const response = await fetch('/api/pwa/settings');
            const data = await response.json();
            if (data.success) {
                pwaSettings = data.data;
                console.log('[PWA] Settings loaded:', pwaSettings);
            }
        } catch (error) {
            console.warn('[PWA] Could not load settings:', error);
            pwaSettings = {};
        }
    }

    /**
     * Apply preloader settings
     */
    function applyPreloaderSettings() {
        if (!pwaSettings) return;

        const preloader = document.getElementById('pwaPreloader');
        const preloaderLogo = document.getElementById('preloaderLogo');
        const preloaderText = document.getElementById('preloaderText');

        if (preloader && pwaSettings.preloader_bg_color) {
            preloader.style.setProperty('--preloader-bg', pwaSettings.preloader_bg_color);
            preloader.style.background = pwaSettings.preloader_bg_color;
        }

        if (preloaderLogo && pwaSettings.pwa_icon_192) {
            preloaderLogo.querySelector('img').src = pwaSettings.pwa_icon_192;
        }

        if (preloaderText && pwaSettings.preloader_text) {
            preloaderText.textContent = pwaSettings.preloader_text;
        }
    }

    /**
     * Hide preloader
     */
    function hidePreloader() {
        const preloader = document.getElementById('pwaPreloader');
        const appContainer = document.getElementById('appContainer');
        
        if (preloader) {
            preloader.classList.add('hidden');
            setTimeout(() => {
                preloader.style.display = 'none';
            }, 500);
        }
        
        if (appContainer) {
            appContainer.style.display = 'flex';
        }
    }

    /**
     * Register service worker
     */
    async function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/user/sw.js', {
                    scope: '/user/'
                });
                console.log('[PWA] Service Worker registered:', registration.scope);

                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateNotification();
                        }
                    });
                });
            } catch (error) {
                console.error('[PWA] Service Worker registration failed:', error);
            }
        }
    }

    /**
     * Setup install prompt
     */
    function setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('[PWA] Install prompt available');
            e.preventDefault();
            deferredPrompt = e;
            
            // Show install prompt after a delay
            setTimeout(() => {
                if (!isAppInstalled()) {
                    showInstallPrompt();
                }
            }, 30000); // Show after 30 seconds
        });

        window.addEventListener('appinstalled', () => {
            console.log('[PWA] App installed');
            deferredPrompt = null;
            hideInstallPrompt();
        });
    }

    /**
     * Check if app is installed
     */
    function isAppInstalled() {
        return window.matchMedia('(display-mode: standalone)').matches ||
               window.navigator.standalone === true;
    }

    /**
     * Show install prompt
     */
    function showInstallPrompt() {
        if (!deferredPrompt) return;

        let prompt = document.getElementById('pwaInstallPrompt');
        if (!prompt) {
            prompt = document.createElement('div');
            prompt.id = 'pwaInstallPrompt';
            prompt.className = 'pwa-install-prompt';
            prompt.innerHTML = `
                <div class="pwa-install-content">
                    <div class="pwa-install-icon">
                        <img src="/api/pwa/icon/48" alt="App Icon">
                    </div>
                    <div class="pwa-install-text">
                        <h4 data-i18n="pwa.install_title">Install App</h4>
                        <p data-i18n="pwa.install_description">Install this app for a better experience</p>
                    </div>
                </div>
                <div class="pwa-install-actions">
                    <button class="pwa-install-btn secondary" onclick="window.PWA.dismissInstall()" data-i18n="common.later">Later</button>
                    <button class="pwa-install-btn primary" onclick="window.PWA.installApp()" data-i18n="pwa.install">Install</button>
                </div>
            `;
            document.body.appendChild(prompt);
        }
        
        prompt.classList.add('show');
    }

    /**
     * Hide install prompt
     */
    function hideInstallPrompt() {
        const prompt = document.getElementById('pwaInstallPrompt');
        if (prompt) {
            prompt.classList.remove('show');
        }
    }

    /**
     * Install app
     */
    async function installApp() {
        if (!deferredPrompt) return;

        hideInstallPrompt();
        deferredPrompt.prompt();
        
        const { outcome } = await deferredPrompt.userChoice;
        console.log('[PWA] Install outcome:', outcome);
        
        deferredPrompt = null;
    }

    /**
     * Dismiss install prompt
     */
    function dismissInstall() {
        hideInstallPrompt();
        // Don't show again for 24 hours
        localStorage.setItem('pwa_install_dismissed', Date.now());
    }

    /**
     * Show update notification
     */
    function showUpdateNotification() {
        if (typeof showNotification === 'function') {
            showNotification('A new version is available. Refresh to update.', 'info');
        }
    }

    // Expose to window
    window.PWA = {
        init: initPWA,
        installApp: installApp,
        dismissInstall: dismissInstall,
        isInstalled: isAppInstalled,
        hidePreloader: hidePreloader
    };

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPWA);
    } else {
        initPWA();
    }
})();
