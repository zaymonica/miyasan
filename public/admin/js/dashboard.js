/**
 * Dashboard Management
 * Multi-tenant adapted dashboard with complete metrics
 */

let dashboardChart = null;
let dashboardInterval = null;

/**
 * Load complete dashboard
 */
async function loadDashboard() {
  try {
    await Promise.all([
      loadDashboardMetrics(),
      loadActiveUsers(),
      loadHourlyChart()
    ]);
    
    // Start auto-refresh
    startDashboardRefresh();
  } catch (error) {
    console.error('Error loading dashboard:', error);
    Notification.error('errors.loading_dashboard');
  }
}

/**
 * Load dashboard metrics (conversations and invoices)
 */
async function loadDashboardMetrics() {
  try {
    const response = await api.get('/dashboard');
    const data = response.data || {};

    // Update conversation metrics with animation
    animateNumber('todayMessages', data.todayMessages || 0);
    animateNumber('waitingConversations', data.waitingConversations || 0);
    animateNumber('activeConversations', data.activeConversations || 0);
    setBreakdown('todayMessagesBreakdown', data.todayMessagesWeb, data.todayMessagesCloud);
    setBreakdown('waitingConversationsBreakdown', data.waitingConversationsWeb, data.waitingConversationsCloud);
    setBreakdown('activeConversationsBreakdown', data.activeConversationsWeb, data.activeConversationsCloud);

    // Update invoice metrics with animation
    animateNumber('invoicesPending', data.invoicesPending || 0);
    animateNumber('invoicesAccepted', data.invoicesAccepted || 0);
    animateNumber('invoicesPaid', data.invoicesPaid || 0);
  } catch (error) {
    console.error('Error loading metrics:', error);
    // Set zeros on error
    ['todayMessages', 'waitingConversations', 'activeConversations', 
     'invoicesPending', 'invoicesAccepted', 'invoicesPaid'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '0';
    });
    ['todayMessagesBreakdown', 'waitingConversationsBreakdown', 'activeConversationsBreakdown'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = 'Web: 0 · Cloud: 0';
    });
  }
}

function setBreakdown(elementId, webValue, cloudValue) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const web = typeof webValue === 'number' ? webValue : 0;
  const cloud = typeof cloudValue === 'number' ? cloudValue : 0;
  el.textContent = `Web: ${web} · Cloud: ${cloud}`;
}

/**
 * Animate number change
 */
function animateNumber(elementId, targetValue) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const currentValue = parseInt(element.textContent) || 0;
  const difference = targetValue - currentValue;
  const duration = 500; // ms
  const steps = 20;
  const stepValue = difference / steps;
  const stepDuration = duration / steps;

  let currentStep = 0;

  const interval = setInterval(() => {
    currentStep++;
    const newValue = Math.round(currentValue + (stepValue * currentStep));
    element.textContent = newValue;

    if (currentStep >= steps) {
      element.textContent = targetValue;
      clearInterval(interval);
    }
  }, stepDuration);
}

/**
 * Load active users list
 */
async function loadActiveUsers() {
  try {
    const response = await api.getUsers({ limit: 10, active: true });
    const users = response.data || [];

    const usersList = document.getElementById('dashboardUsersList');
    if (!usersList) return;

    if (users.length === 0) {
      usersList.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #7f8c8d;">
          <p data-i18n="dashboard.no_users">${i18n.t('dashboard.no_users')}</p>
        </div>
      `;
      return;
    }

    usersList.innerHTML = users.map(user => {
      // Normalize active field (can be 'active', 'is_active', or boolean)
      const isActive = user.active === 1 || user.active === true || user.is_active === 1 || user.is_active === true;
      
      // Get role display name
      const roleKey = `users.role_${user.role}`;
      const roleDisplay = i18n.t(roleKey) !== roleKey ? i18n.t(roleKey) : user.role.charAt(0).toUpperCase() + user.role.slice(1);
      
      // Get user name safely
      const userName = user.name || user.username || 'Unknown';
      const userInitial = userName.charAt(0).toUpperCase();
      
      return `
        <div class="user-item">
          <div class="user-avatar" style="background: ${getAvatarColor(user.role)}">
            ${userInitial}
          </div>
          <div class="user-info">
            <div class="user-name">${escapeHtml(userName)}</div>
            <div class="user-role">${roleDisplay}</div>
          </div>
          <span class="badge badge-${isActive ? 'success' : 'secondary'}">
            ${isActive ? i18n.t('users.active') : i18n.t('users.inactive')}
          </span>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading users:', error);
    const usersList = document.getElementById('dashboardUsersList');
    if (usersList) {
      usersList.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #e74c3c;">
          <p>${i18n.t('errors.loading_users')}</p>
        </div>
      `;
    }
  }
}

/**
 * Get avatar color based on role
 */
function getAvatarColor(role) {
  const colors = {
    admin: '#3498db',
    operator: '#27ae60',
    viewer: '#95a5a6'
  };
  return colors[role] || '#3498db';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Load hourly messages chart
 */
async function loadHourlyChart() {
  try {
    const response = await api.get('/dashboard/hourly-messages');
    const data = response.data || [];

    const canvas = document.getElementById('hourlyChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Destroy existing chart
    if (dashboardChart) {
      dashboardChart.destroy();
      dashboardChart = null;
    }

    // Prepare data for last 24 hours
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const chartData = hours.map(hour => {
      const found = data.find(d => d.hour === hour);
      return found ? found.count : 0;
    });

    // Create new chart
    dashboardChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: hours.map(h => `${h.toString().padStart(2, '0')}:00`),
        datasets: [{
          label: i18n.t('dashboard.messages_per_hour'),
          data: chartData,
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: '#3498db',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: '#3498db',
            borderWidth: 1,
            displayColors: false,
            callbacks: {
              label: function(context) {
                return `${i18n.t('dashboard.messages')}: ${context.parsed.y}`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
              color: '#7f8c8d'
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            }
          },
          x: {
            ticks: {
              color: '#7f8c8d',
              maxRotation: 45,
              minRotation: 45
            },
            grid: {
              display: false
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Error loading chart:', error);
    const canvas = document.getElementById('hourlyChart');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '14px Arial';
      ctx.fillStyle = '#e74c3c';
      ctx.textAlign = 'center';
      ctx.fillText(i18n.t('errors.loading_chart'), canvas.width / 2, canvas.height / 2);
    }
  }
}

/**
 * Start auto-refresh dashboard every 30 seconds
 */
function startDashboardRefresh() {
  stopDashboardRefresh();
  dashboardInterval = setInterval(() => {
    if (currentPage === 'dashboard') {
      loadDashboardMetrics();
      loadActiveUsers();
      // Don't reload chart on auto-refresh to avoid flickering
    }
  }, 30000);
}

/**
 * Stop dashboard auto-refresh
 */
function stopDashboardRefresh() {
  if (dashboardInterval) {
    clearInterval(dashboardInterval);
    dashboardInterval = null;
  }
}

/**
 * Navigate to page from dashboard cards
 */
function navigateToPage(page) {
  navigateTo(page);
}
