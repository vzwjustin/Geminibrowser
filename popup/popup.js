/**
 * Popup Script
 * Handles UI interactions and communication with background script
 */

// DOM Elements
const elements = {
  // Status
  statusIndicator: document.getElementById('statusIndicator'),
  statusDot: document.querySelector('.status-dot'),
  statusText: document.querySelector('.status-text'),

  // Tabs
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),

  // Chat
  messages: document.getElementById('messages'),
  userInput: document.getElementById('userInput'),
  sendBtn: document.getElementById('sendBtn'),

  // Settings
  apiProvider: document.getElementById('apiProvider'),
  apiKey: document.getElementById('apiKey'),
  toggleApiKey: document.getElementById('toggleApiKey'),
  apiKeyHint: document.getElementById('apiKeyHint'),
  modelSelect: document.getElementById('modelSelect'),
  googleModels: document.getElementById('googleModels'),
  openrouterModels: document.getElementById('openrouterModels'),
  temperature: document.getElementById('temperature'),
  temperatureValue: document.getElementById('temperatureValue'),
  autoScreenshot: document.getElementById('autoScreenshot'),
  saveSettings: document.getElementById('saveSettings'),
  testConnection: document.getElementById('testConnection'),

  // History
  historyList: document.getElementById('historyList'),
  clearHistory: document.getElementById('clearHistory')
};

// State
let settings = {
  provider: 'google',
  apiKey: '',
  model: 'gemini-1.5-flash',
  temperature: 0.7,
  autoScreenshot: true
};

let isProcessing = false;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadSettings();
  await loadHistory();
  setupEventListeners();
  updateStatus();
}

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  if (result.settings) {
    settings = { ...settings, ...result.settings };
  }

  // Update UI
  elements.apiProvider.value = settings.provider;
  elements.apiKey.value = settings.apiKey;
  elements.temperature.value = settings.temperature;
  elements.temperatureValue.textContent = settings.temperature;
  elements.autoScreenshot.checked = settings.autoScreenshot;

  updateProviderUI();
  selectModel(settings.model);
}

// Load history from storage
async function loadHistory() {
  const result = await chrome.storage.local.get(['history']);
  const history = result.history || [];
  renderHistory(history);
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Chat
  elements.sendBtn.addEventListener('click', sendMessage);
  elements.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Settings
  elements.apiProvider.addEventListener('change', handleProviderChange);
  elements.toggleApiKey.addEventListener('click', toggleApiKeyVisibility);
  elements.temperature.addEventListener('input', handleTemperatureChange);
  elements.saveSettings.addEventListener('click', saveSettings);
  elements.testConnection.addEventListener('click', testConnection);

  // History
  elements.clearHistory.addEventListener('click', clearHistory);
}

// Tab switching
function switchTab(tabId) {
  elements.tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  elements.tabContents.forEach(content => {
    content.classList.toggle('active', content.id === tabId);
  });
}

// Provider change handler
function handleProviderChange() {
  settings.provider = elements.apiProvider.value;
  updateProviderUI();
}

function updateProviderUI() {
  const isGoogle = settings.provider === 'google';

  // Update hint text
  elements.apiKeyHint.textContent = isGoogle
    ? 'Get your key from Google AI Studio'
    : 'Get your key from OpenRouter';

  // Show/hide model groups
  elements.googleModels.style.display = isGoogle ? '' : 'none';
  elements.openrouterModels.style.display = isGoogle ? 'none' : '';

  // Select first model of the active group
  const activeGroup = isGoogle ? elements.googleModels : elements.openrouterModels;
  const firstOption = activeGroup.querySelector('option');
  if (firstOption) {
    elements.modelSelect.value = firstOption.value;
  }
}

function selectModel(model) {
  const option = elements.modelSelect.querySelector(`option[value="${model}"]`);
  if (option) {
    elements.modelSelect.value = model;
  }
}

// Toggle API key visibility
function toggleApiKeyVisibility() {
  const isPassword = elements.apiKey.type === 'password';
  elements.apiKey.type = isPassword ? 'text' : 'password';
}

// Temperature change handler
function handleTemperatureChange() {
  settings.temperature = parseFloat(elements.temperature.value);
  elements.temperatureValue.textContent = settings.temperature;
}

// Save settings
async function saveSettings() {
  settings.provider = elements.apiProvider.value;
  settings.apiKey = elements.apiKey.value;
  settings.model = elements.modelSelect.value;
  settings.temperature = parseFloat(elements.temperature.value);
  settings.autoScreenshot = elements.autoScreenshot.checked;

  await chrome.storage.local.set({ settings });

  showToast('Settings saved!');
  updateStatus();
}

// Test connection
async function testConnection() {
  elements.testConnection.disabled = true;
  elements.testConnection.textContent = 'Testing...';

  const config = {
    provider: elements.apiProvider.value,
    apiKey: elements.apiKey.value,
    model: elements.modelSelect.value,
    temperature: parseFloat(elements.temperature.value)
  };

  const response = await chrome.runtime.sendMessage({
    type: 'TEST_CONNECTION',
    config
  });

  elements.testConnection.disabled = false;
  elements.testConnection.textContent = 'Test Connection';

  if (response.success) {
    showToast('Connection successful!', 'success');
    updateStatus(true);
  } else {
    showToast(`Connection failed: ${response.message}`, 'error');
    updateStatus(false);
  }
}

// Update status indicator
function updateStatus(connected = null) {
  if (connected === null) {
    connected = !!settings.apiKey;
  }

  elements.statusDot.classList.toggle('connected', connected);
  elements.statusText.textContent = connected ? 'Connected' : 'Not Connected';
}

// Send message to AI
async function sendMessage() {
  const message = elements.userInput.value.trim();
  if (!message || isProcessing) return;

  if (!settings.apiKey) {
    showToast('Please configure your API key in Settings', 'error');
    switchTab('settings');
    return;
  }

  isProcessing = true;
  elements.sendBtn.disabled = true;
  elements.userInput.value = '';

  // Add user message
  addMessage(message, 'user');

  // Add loading message
  const loadingMsg = addMessage('<div class="loading-dots"><span></span><span></span><span></span></div>', 'assistant');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_MESSAGE',
      message,
      includeScreenshot: settings.autoScreenshot
    });

    // Remove loading message
    loadingMsg.remove();

    if (response.success) {
      const { thought, actions, message: responseMessage } = response.response;

      // Show AI response
      if (responseMessage) {
        addMessage(responseMessage, 'assistant');
      }

      // Execute actions if any
      if (actions && actions.length > 0) {
        addMessage(`Executing ${actions.length} action(s)...`, 'action');

        const actionResponse = await chrome.runtime.sendMessage({
          type: 'EXECUTE_ACTIONS',
          actions
        });

        if (actionResponse.success) {
          const results = actionResponse.results;
          const successCount = results.filter(r => r.success).length;
          addMessage(`Completed ${successCount}/${results.length} actions`, 'action');

          // Show any errors
          results.forEach(r => {
            if (!r.success) {
              addMessage(`Failed: ${r.action} - ${r.error}`, 'error');
            }
          });
        } else {
          addMessage(`Actions failed: ${actionResponse.error}`, 'error');
        }
      }
    } else {
      addMessage(`Error: ${response.error}`, 'error');
    }
  } catch (error) {
    loadingMsg.remove();
    addMessage(`Error: ${error.message}`, 'error');
  }

  isProcessing = false;
  elements.sendBtn.disabled = false;

  // Refresh history
  loadHistory();
}

// Add message to chat
function addMessage(content, type) {
  const msg = document.createElement('div');
  msg.className = `message ${type}`;
  msg.innerHTML = content;
  elements.messages.appendChild(msg);
  elements.messages.scrollTop = elements.messages.scrollHeight;
  return msg;
}

// Render history
function renderHistory(history) {
  if (history.length === 0) {
    elements.historyList.innerHTML = '<p class="empty-state">No actions yet</p>';
    return;
  }

  elements.historyList.innerHTML = history.slice(0, 20).map(entry => {
    const time = new Date(entry.timestamp).toLocaleString();

    if (entry.type === 'message') {
      return `
        <div class="history-item">
          <div class="action-type">Message</div>
          <div class="action-desc">${escapeHtml(entry.request.slice(0, 100))}</div>
          <div class="action-time">${time}</div>
        </div>
      `;
    } else {
      return `
        <div class="history-item">
          <div class="action-type">${entry.action.action}</div>
          <div class="action-desc">${escapeHtml(entry.action.description || entry.action.selector || '')}</div>
          <div class="action-time">${time}</div>
        </div>
      `;
    }
  }).join('');
}

// Clear history
async function clearHistory() {
  await chrome.storage.local.set({ history: [] });
  renderHistory([]);
  showToast('History cleared');
}

// Show toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#667eea'};
    color: white;
    border-radius: 6px;
    font-size: 12px;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
