/**
 * MCP Analytics Dashboard
 * Vanilla JavaScript application for analytics visualization
 */

class MCPAnalyticsDashboard {
  constructor() {
    this.apiBase = '/api/v1';
    this.currentPage = 'overview';
    this.currentTimeRange = '24h';
    this.projectId = null;
    this.apiKey = null;
    this.refreshInterval = null;
    
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadConfiguration();
    
    if (this.projectId && this.apiKey) {
      this.showDashboard();
      await this.loadData();
      this.startAutoRefresh();
    } else {
      this.showSetup();
    }
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const page = e.currentTarget.dataset.page;
        this.navigateToPage(page);
      });
    });

    // Time range selector
    document.getElementById('timeRange').addEventListener('change', (e) => {
      this.currentTimeRange = e.target.value;
      this.loadData();
    });

    // Project creation form
    document.getElementById('createProjectForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.createProject();
    });
  }

  async loadConfiguration() {
    // Try to load from localStorage first
    const stored = localStorage.getItem('mcp-analytics-config');
    if (stored) {
      const config = JSON.parse(stored);
      this.projectId = config.projectId;
      this.apiKey = config.apiKey;
      return;
    }

    // Try to detect if we're in demo mode (seed data exists)
    try {
      const response = await fetch(`${this.apiBase}/projects/demo/analytics`, {
        headers: { 'X-API-Key': 'demo-key' }
      });
      
      if (response.status === 401) {
        // No demo data, show setup
        return;
      }
    } catch (error) {
      // Server not responding or no demo data
      return;
    }
  }

  saveConfiguration(projectId, apiKey) {
    const config = { projectId, apiKey };
    localStorage.setItem('mcp-analytics-config', JSON.stringify(config));
    this.projectId = projectId;
    this.apiKey = apiKey;
  }

  async createProject() {
    const form = document.getElementById('createProjectForm');
    const formData = new FormData(form);
    const name = formData.get('projectName');
    const description = formData.get('projectDescription');

    try {
      const response = await fetch(`${this.apiBase}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description })
      });

      if (!response.ok) {
        throw new Error('Failed to create project');
      }

      const result = await response.json();
      this.saveConfiguration(result.projectId, result.apiKey);
      
      // Show success message and transition to dashboard
      this.showProjectCreated(result);
      
      setTimeout(() => {
        this.showDashboard();
        this.loadData();
        this.startAutoRefresh();
      }, 3000);

    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project. Please try again.');
    }
  }

  showProjectCreated(result) {
    const setupContent = document.querySelector('.setup-content');
    setupContent.innerHTML = `
      <h2>✅ Project Created Successfully!</h2>
      <p>Your MCP Analytics project has been set up.</p>
      
      <div class="setup-form">
        <h3>Integration Details</h3>
        <div class="form-group">
          <label>Project ID</label>
          <div class="code">${result.projectId}</div>
        </div>
        <div class="form-group">
          <label>API Key</label>
          <div class="code">${result.apiKey}</div>
        </div>
        <p style="margin-top: 1rem; color: var(--color-text-secondary); font-size: 0.875rem;">
          Save these credentials! Use them to integrate your MCP server with analytics.
        </p>
        <p style="margin-top: 0.5rem; color: var(--color-text-secondary); font-size: 0.875rem;">
          Redirecting to dashboard in 3 seconds...
        </p>
      </div>
    `;
  }

  showSetup() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    document.getElementById('setup').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
  }

  showDashboard() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    document.getElementById('setup').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
  }

  showError(message) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('error').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
  }

  showLoading() {
    document.getElementById('loading').style.display = 'flex';
    document.getElementById('error').style.display = 'none';
    document.getElementById('setup').style.display = 'none';
    document.getElementById('dashboard').style.display = 'none';
  }

  navigateToPage(page) {
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-page="${page}"]`).classList.add('active');

    // Hide all pages
    document.querySelectorAll('.page').forEach(p => {
      p.style.display = 'none';
    });

    // Show selected page
    document.getElementById(`page-${page}`).style.display = 'block';
    this.currentPage = page;

    // Load page-specific data
    this.loadPageData(page);
  }

  async loadData() {
    if (!this.projectId || !this.apiKey) return;

    try {
      await Promise.all([
        this.loadProject(),
        this.loadPageData(this.currentPage)
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      if (error.message.includes('401') || error.message.includes('403')) {
        // Authentication error, clear config and show setup
        localStorage.removeItem('mcp-analytics-config');
        this.showSetup();
      } else {
        this.showError('Failed to load analytics data');
      }
    }
  }

  async loadProject() {
    try {
      const response = await this.apiCall(`/projects/${this.projectId}`);
      document.getElementById('projectName').textContent = response.name;
      document.getElementById('projectId').textContent = this.projectId;
    } catch (error) {
      // If project API fails, just show the project ID
      document.getElementById('projectName').textContent = 'MCP Analytics';
      document.getElementById('projectId').textContent = this.projectId;
    }
  }

  async loadPageData(page) {
    switch (page) {
      case 'overview':
        await this.loadOverview();
        break;
      case 'sessions':
        await this.loadSessions();
        break;
      case 'tools':
        await this.loadTools();
        break;
      case 'intents':
        await this.loadIntents();
        break;
      case 'errors':
        await this.loadErrors();
        break;
    }
  }

  async loadOverview() {
    try {
      const analytics = await this.apiCall(`/projects/${this.projectId}/analytics?timeRange=${this.currentTimeRange}`);
      
      // Update metrics
      document.getElementById('totalSessions').textContent = analytics.totalSessions.toLocaleString();
      document.getElementById('totalEvents').textContent = analytics.totalEvents.toLocaleString();
      document.getElementById('errorRate').textContent = `${analytics.errorRate.toFixed(1)}%`;
      document.getElementById('avgLatency').textContent = `${Math.round(analytics.avgLatency)}ms`;

      // Render charts
      this.renderTopToolsChart(analytics.topTools);
      this.renderTopIntentsChart(analytics.topIntents);
      
    } catch (error) {
      console.error('Error loading overview:', error);
    }
  }

  async loadSessions() {
    try {
      const response = await this.apiCall(`/projects/${this.projectId}/sessions?limit=50`);
      this.renderSessionsTable(response.sessions);
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  }

  async loadTools() {
    try {
      const response = await this.apiCall(`/projects/${this.projectId}/tools?timeRange=${this.currentTimeRange}`);
      this.renderToolsTable(response.tools);
    } catch (error) {
      console.error('Error loading tools:', error);
    }
  }

  async loadIntents() {
    try {
      const analytics = await this.apiCall(`/projects/${this.projectId}/analytics?timeRange=${this.currentTimeRange}`);
      this.renderIntentsGrid(analytics.topIntents);
    } catch (error) {
      console.error('Error loading intents:', error);
    }
  }

  async loadErrors() {
    try {
      const response = await this.apiCall(`/projects/${this.projectId}/errors?limit=100`);
      this.renderErrorsTable(response.errors);
    } catch (error) {
      console.error('Error loading errors:', error);
    }
  }

  renderTopToolsChart(tools) {
    const container = document.getElementById('topToolsChart');
    
    if (!tools || tools.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--color-text-muted);">No tool data available</p>';
      return;
    }

    const maxCount = Math.max(...tools.map(t => t.count));
    
    container.innerHTML = tools.map(tool => `
      <div style="display: flex; align-items: center; margin-bottom: 1rem;">
        <div style="width: 120px; font-size: 0.875rem; color: var(--color-text-secondary);">
          ${tool.name.replace('tools/', '')}
        </div>
        <div style="flex: 1; margin: 0 1rem;">
          <div style="background-color: var(--color-bg-primary); height: 20px; border-radius: 10px; overflow: hidden;">
            <div style="background-color: var(--color-accent); height: 100%; width: ${(tool.count / maxCount) * 100}%; transition: width 0.3s ease;"></div>
          </div>
        </div>
        <div style="width: 80px; text-align: right; font-size: 0.875rem;">
          ${tool.count} calls
        </div>
        <div style="width: 60px; text-align: right; font-size: 0.75rem; color: ${tool.errorRate > 5 ? 'var(--color-error)' : 'var(--color-success)'};">
          ${tool.errorRate.toFixed(1)}%
        </div>
      </div>
    `).join('');
  }

  renderTopIntentsChart(intents) {
    const container = document.getElementById('topIntentsChart');
    
    if (!intents || intents.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--color-text-muted);">No intent data available</p>';
      return;
    }

    const maxCount = Math.max(...intents.map(i => i.count));
    
    container.innerHTML = intents.slice(0, 8).map(intent => `
      <div style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
          <div style="font-size: 0.875rem; color: var(--color-text-primary); font-weight: 500;">
            ${this.truncateText(intent.intent, 40)}
          </div>
          <div style="font-size: 0.75rem; color: var(--color-text-secondary);">
            ${intent.count}
          </div>
        </div>
        <div style="background-color: var(--color-bg-primary); height: 6px; border-radius: 3px; overflow: hidden;">
          <div style="background-color: var(--color-success); height: 100%; width: ${(intent.count / maxCount) * 100}%; transition: width 0.3s ease;"></div>
        </div>
      </div>
    `).join('');
  }

  renderSessionsTable(sessions) {
    const tbody = document.getElementById('sessionsTableBody');
    
    if (!sessions || sessions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--color-text-muted);">No sessions found</td></tr>';
      return;
    }

    tbody.innerHTML = sessions.map(session => `
      <tr>
        <td>
          <div class="code" style="font-size: 0.75rem;">${session.sessionId.slice(0, 8)}...</div>
        </td>
        <td>${session.userId || '-'}</td>
        <td>${session.clientName || '-'} ${session.clientVersion || ''}</td>
        <td>${this.formatDateTime(session.startTime)}</td>
        <td>
          <span class="badge badge-success">${session.eventCount}</span>
        </td>
        <td>
          ${session.errorCount > 0 ? 
            `<span class="badge badge-error">${session.errorCount}</span>` : 
            '<span class="badge badge-success">0</span>'
          }
        </td>
        <td>
          <button class="btn btn-sm" onclick="dashboard.viewSession('${session.sessionId}')">
            View Replay
          </button>
        </td>
      </tr>
    `).join('');
  }

  renderToolsTable(tools) {
    const tbody = document.getElementById('toolsTableBody');
    
    if (!tools || tools.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted);">No tools data available</td></tr>';
      return;
    }

    tbody.innerHTML = tools.map(tool => `
      <tr>
        <td>
          <strong>${tool.name}</strong>
        </td>
        <td>${tool.count.toLocaleString()}</td>
        <td>
          <span class="status-success">${tool.successRate.toFixed(1)}%</span>
        </td>
        <td>
          <span class="${tool.errorRate > 5 ? 'status-error' : 'status-success'}">
            ${tool.errorRate.toFixed(1)}%
          </span>
        </td>
        <td>${Math.round(tool.avgLatency)}ms</td>
        <td>${Math.round(tool.p95Latency)}ms</td>
      </tr>
    `).join('');
  }

  renderIntentsGrid(intents) {
    const container = document.getElementById('intentsGrid');
    
    if (!intents || intents.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--color-text-muted); grid-column: 1/-1;">No intent data available</div>';
      return;
    }

    container.innerHTML = intents.map(intent => `
      <div class="intent-card">
        <div class="intent-text">${intent.intent}</div>
        <div class="intent-count">${intent.count} occurrences</div>
      </div>
    `).join('');
  }

  renderErrorsTable(errors) {
    const tbody = document.getElementById('errorsTableBody');
    
    if (!errors || errors.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted);">No errors found</td></tr>';
      return;
    }

    tbody.innerHTML = errors.map(error => `
      <tr>
        <td>${this.formatDateTime(error.timestamp)}</td>
        <td>
          <span class="code">${error.eventType}</span>
        </td>
        <td>
          <div style="font-weight: 500; margin-bottom: 0.25rem;">${error.error.name}</div>
          <div style="color: var(--color-text-secondary); font-size: 0.875rem;">${this.truncateText(error.error.message, 60)}</div>
        </td>
        <td>${error.context ? this.truncateText(error.context, 50) : '-'}</td>
        <td>
          <button class="btn btn-sm" onclick="dashboard.viewSession('${error.sessionId}')">
            View Session
          </button>
        </td>
      </tr>
    `).join('');
  }

  async viewSession(sessionId) {
    try {
      const response = await this.apiCall(`/projects/${this.projectId}/sessions/${sessionId}`);
      this.showSessionReplay(response.session, response.events);
    } catch (error) {
      console.error('Error loading session:', error);
      alert('Failed to load session details');
    }
  }

  showSessionReplay(session, events) {
    const modal = document.getElementById('sessionModal');
    const container = document.getElementById('sessionReplay');
    
    // Sort events by timestamp
    events.sort((a, b) => a.timestamp - b.timestamp);
    
    container.innerHTML = `
      <div style="margin-bottom: 2rem; padding: 1.5rem; background-color: var(--color-bg-primary); border-radius: var(--border-radius);">
        <h3>Session ${session.sessionId.slice(0, 8)}...</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem; font-size: 0.875rem;">
          <div><strong>User:</strong> ${session.userId || 'Anonymous'}</div>
          <div><strong>Client:</strong> ${session.clientName || 'Unknown'}</div>
          <div><strong>Started:</strong> ${this.formatDateTime(session.startTime)}</div>
          <div><strong>Events:</strong> ${session.eventCount}</div>
        </div>
      </div>
      
      <div class="session-events">
        ${events.map(event => this.renderEventItem(event)).join('')}
      </div>
    `;
    
    modal.style.display = 'flex';
  }

  renderEventItem(event) {
    const isError = !!event.error;
    const duration = event.duration ? `${event.duration}ms` : '';
    
    return `
      <div class="event-item ${isError ? 'error' : ''}">
        <div class="event-header">
          <div class="event-type">${event.eventType}</div>
          <div class="event-time">
            ${this.formatTime(event.timestamp)} ${duration}
          </div>
        </div>
        
        ${event.context ? `
          <div class="event-context">
            "${event.context}"
          </div>
        ` : ''}
        
        <div class="event-details">
          ${event.request ? `
            <div class="event-section">
              <h4>Request</h4>
              <pre>${JSON.stringify(event.request, null, 2)}</pre>
            </div>
          ` : ''}
          
          ${event.response && !isError ? `
            <div class="event-section">
              <h4>Response</h4>
              <pre>${JSON.stringify(event.response, null, 2)}</pre>
            </div>
          ` : ''}
          
          ${isError ? `
            <div class="event-section" style="grid-column: 1/-1;">
              <h4>Error</h4>
              <pre style="color: var(--color-error);">${JSON.stringify(event.error, null, 2)}</pre>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  startAutoRefresh() {
    // Refresh data every 30 seconds
    this.refreshInterval = setInterval(() => {
      this.loadPageData(this.currentPage);
    }, 30000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async apiCall(endpoint) {
    const response = await fetch(`${this.apiBase}${endpoint}`, {
      headers: {
        'X-API-Key': this.apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  formatDateTime(timestamp) {
    return new Date(timestamp).toLocaleString();
  }

  formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString();
  }

  truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
  }
}

// Global functions for event handlers
window.closeSessionModal = function() {
  document.getElementById('sessionModal').style.display = 'none';
};

// Initialize dashboard
window.dashboard = new MCPAnalyticsDashboard();