/**
 * System Branding Loader
 * Loads and applies system branding (logo, favicon, name) across all pages
 */

(function () {
  'use strict';

  const BRANDING_CACHE_KEY = 'system_branding';
  const BRANDING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get cached branding or fetch from API
   */
  async function getBranding() {
    // Check cache first
    const cached = localStorage.getItem(BRANDING_CACHE_KEY);
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < BRANDING_CACHE_TTL) {
          return data;
        }
      } catch (e) {
        localStorage.removeItem(BRANDING_CACHE_KEY);
      }
    }

    // Fetch from API
    try {
      const response = await fetch('/api/public/branding');
      const result = await response.json();

      if (result.success && result.data) {
        // Cache the result
        localStorage.setItem(
          BRANDING_CACHE_KEY,
          JSON.stringify({
            data: result.data,
            timestamp: Date.now(),
          })
        );
        return result.data;
      }
    } catch (error) {
      console.error('Failed to load branding:', error);
    }

    return null;
  }

  /**
   * Check if image URL is valid
   */
  function checkImageExists(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  /**
   * Apply favicon to the page
   */
  async function applyFavicon(faviconUrl) {
    if (!faviconUrl) return;

    // Check if favicon exists
    const exists = await checkImageExists(faviconUrl);
    if (!exists) return;

    // Remove existing favicons
    const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
    existingFavicons.forEach((el) => el.remove());

    // Add new favicon
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = faviconUrl.endsWith('.ico') ? 'image/x-icon' : 'image/png';
    link.href = faviconUrl;
    document.head.appendChild(link);

    // Also add apple-touch-icon
    const appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    appleLink.href = faviconUrl;
    document.head.appendChild(appleLink);
  }

  /**
   * Apply logo to sidebar headers
   */
  async function applyLogo(logoUrl, systemName) {
    // Check if logo exists before applying
    let logoExists = false;
    if (logoUrl) {
      logoExists = await checkImageExists(logoUrl);
    }

    // Update sidebar headers with logo
    const sidebarHeaders = document.querySelectorAll('.sidebar-header');

    sidebarHeaders.forEach((header) => {
      const h2 = header.querySelector('h2');
      if (h2 && !h2.classList.contains('conversations-header')) {
        if (logoExists && logoUrl) {
          // Replace text with logo image (hide text completely)
          h2.innerHTML = `<img src="${logoUrl}" alt="${systemName || 'Logo'}" class="sidebar-logo" style="max-height: 40px; max-width: 150px; object-fit: contain;">`;
        } else if (systemName) {
          // No logo or logo doesn't exist - show only text
          h2.textContent = systemName;
        }
      }
    });

    // Update nav-brand on landing page
    const navBrand = document.querySelector('.nav-brand span');
    if (navBrand && systemName) {
      navBrand.textContent = systemName;
    }

    // Update nav-brand with logo if exists
    const navBrandContainer = document.querySelector('.nav-brand');
    if (navBrandContainer) {
      const existingIcon = navBrandContainer.querySelector('i');
      const existingImg = navBrandContainer.querySelector('img.nav-logo');

      if (logoExists && logoUrl) {
        // Hide icon, show logo
        if (existingIcon) {
          existingIcon.style.display = 'none';
        }
        if (!existingImg) {
          const img = document.createElement('img');
          img.src = logoUrl;
          img.alt = systemName || 'Logo';
          img.className = 'nav-logo';
          img.style.cssText =
            'max-height: 35px; max-width: 120px; object-fit: contain; margin-right: 10px;';
          navBrandContainer.insertBefore(img, navBrandContainer.firstChild);
        }
      } else {
        // No logo - show icon, remove any existing logo img
        if (existingIcon) {
          existingIcon.style.display = '';
        }
        if (existingImg) {
          existingImg.remove();
        }
      }
    }
  }

  /**
   * Apply system name to page title
   */
  function applySystemName(systemName) {
    if (!systemName) return;

    // Update page title if it contains default name
    const title = document.title;
    if (title.includes('Misayan')) {
      document.title = title.replace(/Misayan( SaaS)?/g, systemName);
    }

    // Update any elements with data-system-name attribute
    document.querySelectorAll('[data-system-name]').forEach((el) => {
      el.textContent = systemName;
    });
  }

  /**
   * Initialize branding
   */
  async function initBranding() {
    const branding = await getBranding();

    if (branding) {
      // Apply favicon
      if (branding.favicon) {
        await applyFavicon(branding.favicon);
      }

      // Apply logo and system name
      await applyLogo(branding.system_logo, branding.system_name);

      // Apply system name to title
      applySystemName(branding.system_name);
    }
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBranding);
  } else {
    initBranding();
  }

  // Also run after a short delay to catch dynamically loaded content
  setTimeout(initBranding, 500);

  // Expose for manual refresh
  window.SystemBranding = {
    refresh: async function () {
      localStorage.removeItem(BRANDING_CACHE_KEY);
      await initBranding();
    },
    get: getBranding,
    apply: initBranding,
  };
})();
