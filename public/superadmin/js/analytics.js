/**
 * Analytics Module
 * Advanced statistics and charts
 */

window.analyticsModule = {
  period: 30,

  /**
   * Initialize analytics page
   */
  async init() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="page-header">
        <h1><i class="fas fa-chart-bar"></i> Advanced Analytics</h1>
        <div class="header-actions">
          <select id="periodSelect" onchange="analyticsModule.changePeriod(this.value)" class="filter-select">
            <option value="7">Last 7 Days</option>
            <option value="30" selected>Last 30 Days</option>
            <option value="60">Last 60 Days</option>
            <option value="90">Last 90 Days</option>
          </select>
        </div>
      </div>

      <!-- Key Metrics -->
      <div class="stats-grid" id="keyMetrics">
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #00a149 0%, #319131 100%);">
            <i class="fas fa-chart-line"></i>
          </div>
          <div class="stat-info">
            <h3 id="churnRate">0%</h3>
            <p>Churn Rate</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
            <i class="fas fa-users"></i>
          </div>
          <div class="stat-info">
            <h3 id="activeCount">0</h3>
            <p>Active Tenants</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
            <i class="fas fa-user-times"></i>
          </div>
          <div class="stat-info">
            <h3 id="churnedCount">0</h3>
            <p>Churned (30d)</p>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);">
            <i class="fas fa-percentage"></i>
          </div>
          <div class="stat-info">
            <h3 id="retentionRate">0%</h3>
            <p>Retention Rate</p>
          </div>
        </div>
      </div>

      <!-- Charts Row 1 -->
      <div class="charts-row">
        <div class="card chart-card">
          <div class="card-header">
            <h2><i class="fas fa-chart-area"></i> Tenant Growth</h2>
          </div>
          <div class="chart-container">
            <canvas id="growthChart"></canvas>
          </div>
        </div>
        <div class="card chart-card">
          <div class="card-header">
            <h2><i class="fas fa-chart-line"></i> Revenue Trend (Plans + Addons)</h2>
          </div>
          <div class="chart-container">
            <canvas id="revenueChart"></canvas>
          </div>
        </div>
      </div>

      <!-- Charts Row 2 -->
      <div class="charts-row">
        <div class="card chart-card">
          <div class="card-header">
            <h2><i class="fas fa-chart-pie"></i> Plan Distribution</h2>
          </div>
          <div class="chart-container">
            <canvas id="planChart"></canvas>
          </div>
        </div>
        <div class="card chart-card">
          <div class="card-header">
            <h2><i class="fas fa-chart-bar"></i> Status Distribution</h2>
          </div>
          <div class="chart-container">
            <canvas id="statusChart"></canvas>
          </div>
        </div>
      </div>

      <!-- Top Tenants -->
      <div class="card">
        <div class="card-header">
          <h2><i class="fas fa-trophy"></i> Top 10 Tenants by Usage</h2>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Tenant</th>
                <th>Subdomain</th>
                <th>Plan</th>
                <th>Messages Sent</th>
              </tr>
            </thead>
            <tbody id="topTenantsBody">
              <tr>
                <td colspan="5" class="text-center">
                  <i class="fas fa-spinner fa-spin"></i> Loading...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Load Chart.js if not already loaded
    if (typeof Chart === 'undefined') {
      await this.loadChartJS();
    }

    await this.loadAnalytics();
  },

  /**
   * Load Chart.js library
   */
  async loadChartJS() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  },

  /**
   * Load analytics data
   */
  async loadAnalytics() {
    try {
      const response = await apiRequest(`/superadmin/stats?period=${this.period}`);
      
      if (response.success) {
        this.renderMetrics(response.data);
        this.renderGrowthChart(response.data.growth);
        this.renderRevenueChart(response.data.revenue);
        this.renderPlanChart(response.data.planDistribution);
        this.renderStatusChart(response.data.statusDistribution);
        this.renderTopTenants(response.data.topTenants);
      }
    } catch (error) {
      showAlert('Error loading analytics: ' + error.message, 'error');
    }
  },

  /**
   * Render key metrics
   */
  renderMetrics(data) {
    document.getElementById('churnRate').textContent = data.churnRate + '%';
    document.getElementById('activeCount').textContent = data.churnStats.active || 0;
    document.getElementById('churnedCount').textContent = data.churnStats.churned || 0;
    
    const retentionRate = data.churnStats.active > 0 
      ? (100 - data.churnRate).toFixed(2)
      : 100;
    document.getElementById('retentionRate').textContent = retentionRate + '%';
  },

  /**
   * Render growth chart
   */
  renderGrowthChart(data) {
    const ctx = document.getElementById('growthChart');
    
    if (window.growthChartInstance) {
      window.growthChartInstance.destroy();
    }

    window.growthChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => formatDate(d.date)),
        datasets: [{
          label: 'New Tenants',
          data: data.map(d => d.new_tenants),
          borderColor: 'rgb(102, 126, 234)',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  },

  /**
   * Render revenue chart with plans and addons breakdown
   */
  renderRevenueChart(data) {
    const ctx = document.getElementById('revenueChart');
    
    if (window.revenueChartInstance) {
      window.revenueChartInstance.destroy();
    }

    // Check if data has breakdown (plan_revenue and addon_revenue)
    const hasBreakdown = data.length > 0 && data[0].plan_revenue !== undefined;

    if (hasBreakdown) {
      // Stacked bar chart with plans and addons
      window.revenueChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.map(d => formatDate(d.date)),
          datasets: [
            {
              label: 'Plans',
              data: data.map(d => d.plan_revenue || 0),
              backgroundColor: 'rgba(75, 192, 192, 0.6)',
              borderColor: 'rgb(75, 192, 192)',
              borderWidth: 1
            },
            {
              label: 'Addons',
              data: data.map(d => d.addon_revenue || 0),
              backgroundColor: 'rgba(153, 102, 255, 0.6)',
              borderColor: 'rgb(153, 102, 255)',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                afterBody: function(context) {
                  const dataIndex = context[0].dataIndex;
                  const total = (data[dataIndex].plan_revenue || 0) + (data[dataIndex].addon_revenue || 0);
                  const currencySymbol = state?.defaultCurrencyCode || localStorage.getItem('system_default_currency') || 'USD';
                  return 'Total: ' + formatCurrency(total, currencySymbol);
                }
              }
            }
          },
          scales: {
            x: {
              stacked: true
            },
            y: {
              stacked: true,
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  const currencySymbol = state?.defaultCurrencyCode || localStorage.getItem('system_default_currency') || 'USD';
                  return formatCurrency(value, currencySymbol);
                }
              }
            }
          }
        }
      });
    } else {
      // Simple bar chart (fallback for old data format)
      window.revenueChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.map(d => formatDate(d.date)),
          datasets: [{
            label: 'Revenue',
            data: data.map(d => d.revenue || 0),
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
            borderColor: 'rgb(75, 192, 192)',
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const currencySymbol = state?.defaultCurrencyCode || localStorage.getItem('system_default_currency') || 'USD';
                  return 'Revenue: ' + formatCurrency(context.parsed.y, currencySymbol);
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: function(value) {
                  const currencySymbol = state?.defaultCurrencyCode || localStorage.getItem('system_default_currency') || 'USD';
                  return formatCurrency(value, currencySymbol);
                }
              }
            }
          }
        }
      });
    }
  },

  /**
   * Render plan distribution chart
   */
  renderPlanChart(data) {
    const ctx = document.getElementById('planChart');
    
    if (window.planChartInstance) {
      window.planChartInstance.destroy();
    }

    const colors = [
      'rgba(255, 99, 132, 0.8)',
      'rgba(54, 162, 235, 0.8)',
      'rgba(255, 206, 86, 0.8)',
      'rgba(75, 192, 192, 0.8)',
      'rgba(153, 102, 255, 0.8)'
    ];

    window.planChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.name),
        datasets: [{
          data: data.map(d => d.tenant_count),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value} tenants (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  },

  /**
   * Render status distribution chart
   */
  renderStatusChart(data) {
    const ctx = document.getElementById('statusChart');
    
    if (window.statusChartInstance) {
      window.statusChartInstance.destroy();
    }

    const statusColors = {
      active: 'rgba(75, 192, 192, 0.8)',
      trial: 'rgba(255, 206, 86, 0.8)',
      suspended: 'rgba(255, 99, 132, 0.8)',
      cancelled: 'rgba(201, 203, 207, 0.8)'
    };

    window.statusChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.status.charAt(0).toUpperCase() + d.status.slice(1)),
        datasets: [{
          label: 'Tenants',
          data: data.map(d => d.count),
          backgroundColor: data.map(d => statusColors[d.status] || 'rgba(201, 203, 207, 0.8)'),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  },

  /**
   * Render top tenants table
   */
  renderTopTenants(tenants) {
    const tbody = document.getElementById('topTenantsBody');
    
    if (!tenants || tenants.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">No data available</td></tr>';
      return;
    }

    tbody.innerHTML = tenants.map((tenant, index) => `
      <tr>
        <td>
          <strong style="font-size: 1.2em;">
            ${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
          </strong>
        </td>
        <td><strong>${tenant.company_name || 'N/A'}</strong></td>
        <td><code>${tenant.subdomain || 'N/A'}</code></td>
        <td><span class="badge badge-primary">${tenant.plan_name || 'No Plan'}</span></td>
        <td><strong>${(tenant.messages_sent || 0).toLocaleString()}</strong> messages</td>
      </tr>
    `).join('');
  },

  /**
   * Change period
   */
  async changePeriod(period) {
    this.period = parseInt(period);
    await this.loadAnalytics();
  }
};

// Add to page handlers
window.pageHandlers = window.pageHandlers || {};
window.pageHandlers.analytics = () => window.analyticsModule.init();
