/**
 * Landing Page JavaScript
 */

// Load landing page data
document.addEventListener('DOMContentLoaded', async () => {
  await loadLandingPageData();
  setupNavigation();
  setupWhatsAppGenerator();
});

/**
 * Load landing page data from API
 */
async function loadLandingPageData() {
  try {
    const response = await fetch('/api/landing/settings');
    const data = await response.json();

    if (data.success) {
      const { settings, features, testimonials, plans } = data.data;
      const landingEnabled = settings.landing_enabled === undefined ? true : Boolean(Number(settings.landing_enabled));
      if (!landingEnabled) {
        window.location.href = '/login';
        return;
      }
      
      // Debug: Log settings to console
      console.log('Landing Page Settings:', settings);
      console.log('Social Media Links:', {
        facebook: settings.social_facebook,
        twitter: settings.social_twitter,
        instagram: settings.social_instagram,
        linkedin: settings.social_linkedin,
        email: settings.contact_email,
        phone: settings.contact_phone
      });
      
      // Apply settings
      applySettings(settings);
      
      // Render sections
      renderFeatures(features);
      renderPlans(plans);
      renderTestimonials(testimonials);
      renderSocialLinks(settings);
    }
  } catch (error) {
    console.error('Error loading landing page:', error);
  }
}

/**
 * Apply settings to page
 */
function applySettings(settings) {
  // Meta tags
  const pageTitle = document.getElementById('pageTitle');
  const pageDescription = document.getElementById('pageDescription');
  if (pageTitle) pageTitle.textContent = settings.meta_title;
  if (pageDescription) pageDescription.content = settings.meta_description;

  // Header/Navbar logo
  const headerLogo = document.getElementById('headerLogo');
  const headerIcon = document.getElementById('headerIcon');
  const headerName = document.getElementById('headerName');
  
  if (settings.header_logo) {
    if (headerLogo) {
      headerLogo.src = settings.header_logo;
      headerLogo.style.display = 'block';
    }
    if (headerIcon) headerIcon.style.display = 'none';
    if (headerName) headerName.style.display = 'none';
  } else {
    if (headerLogo) headerLogo.style.display = 'none';
    if (headerIcon) headerIcon.style.display = 'inline';
    if (headerName) {
      headerName.style.display = 'inline';
      headerName.textContent = settings.company_name || 'Misayan';
    }
  }

  // Hero section logo
  const heroLogo = document.getElementById('heroLogo');
  const heroIcon = document.getElementById('heroIcon');
  
  if (settings.hero_logo) {
    if (heroLogo) {
      heroLogo.src = settings.hero_logo;
      heroLogo.style.display = 'block';
    }
    if (heroIcon) heroIcon.style.display = 'none';
  } else {
    if (heroLogo) heroLogo.style.display = 'none';
    if (heroIcon) heroIcon.style.display = 'inline';
  }

  // Footer logo
  const footerLogo = document.getElementById('footerLogo');
  const footerIcon = document.getElementById('footerIcon');
  const footerName = document.getElementById('footerName');
  
  if (settings.footer_logo) {
    if (footerLogo) {
      footerLogo.src = settings.footer_logo;
      footerLogo.style.display = 'block';
    }
    if (footerIcon) footerIcon.style.display = 'none';
    if (footerName) footerName.style.display = 'none';
  } else {
    if (footerLogo) footerLogo.style.display = 'none';
    if (footerIcon) footerIcon.style.display = 'inline';
    if (footerName) {
      footerName.style.display = 'inline';
      footerName.textContent = settings.company_name || 'Misayan';
    }
  }

  // Hero section
  const heroTitle = document.getElementById('heroTitle');
  const heroSubtitle = document.getElementById('heroSubtitle');
  const heroCta = document.getElementById('heroCta');
  const heroSection = document.getElementById('hero');
  
  if (heroTitle) heroTitle.textContent = settings.hero_title;
  if (heroSubtitle) heroSubtitle.textContent = settings.hero_subtitle;
  if (heroCta) {
    heroCta.textContent = settings.hero_cta_text;
    heroCta.href = settings.hero_cta_link;
  }
  if (heroSection) {
    heroSection.style.background = `linear-gradient(135deg, ${settings.hero_bg_color} 0%, ${settings.secondary_color} 100%)`;
  }

  // Features section
  const featuresTitle = document.getElementById('featuresTitle');
  const featuresSubtitle = document.getElementById('featuresSubtitle');
  if (featuresTitle) featuresTitle.textContent = settings.features_title;
  if (featuresSubtitle) featuresSubtitle.textContent = settings.features_subtitle;

  // WhatsApp Generator
  const waGenerator = document.getElementById('waGenerator');
  const waGeneratorTitle = document.getElementById('waGeneratorTitle');
  const waGeneratorSubtitle = document.getElementById('waGeneratorSubtitle');
  
  if (!settings.wa_generator_enabled) {
    if (waGenerator) waGenerator.style.display = 'none';
  } else {
    if (waGeneratorTitle) waGeneratorTitle.textContent = settings.wa_generator_title;
    if (waGeneratorSubtitle) waGeneratorSubtitle.textContent = settings.wa_generator_subtitle;
  }

  // Plans section
  const plansTitle = document.getElementById('plansTitle');
  const plansSubtitle = document.getElementById('plansSubtitle');
  if (plansTitle) plansTitle.textContent = settings.plans_title;
  if (plansSubtitle) plansSubtitle.textContent = settings.plans_subtitle;

  // Testimonials section
  const testimonials = document.getElementById('testimonials');
  const testimonialsTitle = document.getElementById('testimonialsTitle');
  const testimonialsSubtitle = document.getElementById('testimonialsSubtitle');
  
  if (!settings.testimonials_enabled) {
    if (testimonials) testimonials.style.display = 'none';
  } else {
    if (testimonialsTitle) testimonialsTitle.textContent = settings.testimonials_title;
    if (testimonialsSubtitle) testimonialsSubtitle.textContent = settings.testimonials_subtitle;
  }

  // CTA section
  const ctaTitle = document.getElementById('ctaTitle');
  const ctaSubtitle = document.getElementById('ctaSubtitle');
  const ctaButton = document.getElementById('ctaButton');
  const ctaSection = document.getElementById('cta');
  
  if (ctaTitle) ctaTitle.textContent = settings.cta_title;
  if (ctaSubtitle) ctaSubtitle.textContent = settings.cta_subtitle;
  if (ctaButton) ctaButton.textContent = settings.cta_button_text;
  if (ctaSection) {
    ctaSection.style.background = `linear-gradient(135deg, ${settings.cta_bg_color} 0%, ${settings.secondary_color} 100%)`;
  }

  // Footer
  const footerText = document.getElementById('footerText');
  const footer = document.getElementById('footer');
  if (footerText) footerText.textContent = settings.footer_text;
  if (footer) footer.style.background = settings.footer_bg_color;

  // Apply colors
  document.documentElement.style.setProperty('--primary-color', settings.primary_color);
  document.documentElement.style.setProperty('--secondary-color', settings.secondary_color);
  document.documentElement.style.setProperty('--accent-color', settings.accent_color);
  document.documentElement.style.setProperty('--text-color', settings.text_color);
}

/**
 * Render features
 */
function renderFeatures(features) {
  const container = document.getElementById('featuresGrid');
  if (!container) return;
  
  container.innerHTML = features.map(feature => `
    <div class="feature-card">
      <div class="feature-icon">
        <i class="fas ${feature.icon}"></i>
      </div>
      <h3>${feature.title}</h3>
      <p>${feature.description}</p>
    </div>
  `).join('');
}

/**
 * Render plans
 */
function renderPlans(plans) {
  const container = document.getElementById('plansGrid');
  if (!container) return;
  
  container.innerHTML = plans.map((plan, index) => {
    // Get formatted features
    const features = plan.formatted_features || [];
    const currencySymbol = plan.currency_symbol || '';
    const currencyCode = plan.currency || '';
    const priceValue = parseFloat(plan.price || 0).toFixed(2);
    const priceLabel = plan.is_free ? 'Free' : `${currencySymbol || currencyCode} ${priceValue}`;
    
    return `
      <div class="plan-card ${index === 1 ? 'featured' : ''}">
        ${plan.is_free ? '<div class="plan-badge">FREE</div>' : ''}
        ${plan.is_trial ? '<div class="plan-badge trial">TRIAL</div>' : ''}
        <div class="plan-name">${plan.name}</div>
        <div class="plan-price">
          ${priceLabel}
          ${!plan.is_free ? '<span>/month</span>' : ''}
        </div>
        ${plan.description ? `<p class="plan-description">${plan.description}</p>` : ''}
        <ul class="plan-features">
          ${features.map(feature => `
            <li><i class="fas fa-check"></i> ${feature.text}</li>
          `).join('')}
        </ul>
        <a href="/register?plan=${plan.id}" class="btn btn-primary btn-block">
          ${plan.is_trial ? `Start ${plan.trial_days}-Day Trial` : plan.is_free ? 'Get Started Free' : 'Choose Plan'}
        </a>
      </div>
    `;
  }).join('');
}

/**
 * Render testimonials
 */
function renderTestimonials(testimonials) {
  const container = document.getElementById('testimonialsGrid');
  if (!container) return;
  
  container.innerHTML = testimonials.map(testimonial => `
    <div class="testimonial-card">
      <div class="testimonial-header">
        <div class="testimonial-avatar">
          ${testimonial.avatar ? `<img src="${testimonial.avatar}" alt="${testimonial.name}">` : testimonial.name.charAt(0)}
        </div>
        <div class="testimonial-info">
          <h4>${testimonial.name}</h4>
          <p>${testimonial.role}${testimonial.company ? ` at ${testimonial.company}` : ''}</p>
        </div>
      </div>
      <div class="testimonial-rating">
        ${'★'.repeat(testimonial.rating)}${'☆'.repeat(5 - testimonial.rating)}
      </div>
      <p class="testimonial-text">"${testimonial.testimonial}"</p>
    </div>
  `).join('');
}

/**
 * Render social links
 */
function renderSocialLinks(settings) {
  const container = document.getElementById('footerSocial');
  if (!container) return;
  
  const links = [];

  // Check for social media links (support both naming conventions)
  const facebookUrl = settings.social_facebook || settings.facebook_url;
  const twitterUrl = settings.social_twitter || settings.twitter_url;
  const instagramUrl = settings.social_instagram || settings.instagram_url;
  const linkedinUrl = settings.social_linkedin || settings.linkedin_url;

  if (facebookUrl) {
    links.push(`<a href="${facebookUrl}" target="_blank" rel="noopener noreferrer" title="Facebook"><i class="fab fa-facebook-f"></i></a>`);
  }
  if (twitterUrl) {
    links.push(`<a href="${twitterUrl}" target="_blank" rel="noopener noreferrer" title="Twitter"><i class="fab fa-twitter"></i></a>`);
  }
  if (instagramUrl) {
    links.push(`<a href="${instagramUrl}" target="_blank" rel="noopener noreferrer" title="Instagram"><i class="fab fa-instagram"></i></a>`);
  }
  if (linkedinUrl) {
    links.push(`<a href="${linkedinUrl}" target="_blank" rel="noopener noreferrer" title="LinkedIn"><i class="fab fa-linkedin-in"></i></a>`);
  }

  // Add contact info if available
  const contactEmail = settings.contact_email;
  const contactPhone = settings.contact_phone;

  if (contactEmail) {
    links.push(`<a href="mailto:${contactEmail}" title="Email"><i class="fas fa-envelope"></i></a>`);
  }
  if (contactPhone) {
    links.push(`<a href="tel:${contactPhone}" title="Phone"><i class="fas fa-phone"></i></a>`);
  }

  container.innerHTML = links.join('');
}

/**
 * Setup navigation
 */
function setupNavigation() {
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      navMenu.classList.toggle('active');
    });
  }

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (navMenu) navMenu.classList.remove('active');
      }
    });
  });

  // Navbar scroll effect
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.style.boxShadow = '0 5px 20px rgba(0, 0, 0, 0.1)';
      } else {
        navbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.05)';
      }
    });
  }
}

/**
 * Setup WhatsApp Link Generator
 */
function setupWhatsAppGenerator() {
  const generateBtn = document.getElementById('generateLinkBtn');
  const copyBtn = document.getElementById('copyLinkBtn');

  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      const phoneInput = document.getElementById('waPhone');
      const messageInput = document.getElementById('waMessage');
      const phone = phoneInput ? phoneInput.value.trim() : '';
      const message = messageInput ? messageInput.value.trim() : '';

      if (!phone) {
        alert('Please enter a WhatsApp number');
        return;
      }

      try {
        const response = await fetch('/api/landing/whatsapp-link', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ phone, message })
        });

        const data = await response.json();

        if (data.success) {
          const linkOutput = document.getElementById('linkOutput');
          const generatedLink = document.getElementById('generatedLink');
          if (linkOutput) linkOutput.value = data.data.link;
          if (generatedLink) generatedLink.style.display = 'block';
        } else {
          alert(data.message || 'Error generating link');
        }
      } catch (error) {
        console.error('Error:', error);
        alert('Error generating link. Please try again.');
      }
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const linkOutput = document.getElementById('linkOutput');
      if (linkOutput) {
        linkOutput.select();
        document.execCommand('copy');
        
        // Show feedback
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
        }, 2000);
      }
    });
  }
}

