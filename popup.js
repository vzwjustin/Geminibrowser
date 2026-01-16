/**
 * Gemini Browser Control - Popup Script
 * Claude Code style interface for browser control
 */

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

// Load settings
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  if (result.settings) {
    settings = { ...settings, ...result.settings };
  }

  document.getElementById('apiProvider').value = settings.provider;
  document.getElementById('apiKey').value = settings.apiKey;
  document.getElementById('temperature').value = settings.temperature;
  document.getElementById('temperatureValue').textContent = settings.temperature;
  document.getElementById('autoScreenshot').checked = settings.autoScreenshot;

  updateProviderUI();
  selectModel(settings.model);
}

// Load history
async function loadHistory() {
  const result = await chrome.storage.local.get(['history']);
  const history = result.history || [];
  renderHistory(history);
}

// Setup events
function setupEventListeners() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Chat
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('userInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Settings
  document.getElementById('apiProvider').addEventListener('change', handleProviderChange);
  document.getElementById('toggleApiKey').addEventListener('click', toggleApiKeyVisibility);
  document.getElementById('temperature').addEventListener('input', handleTemperatureChange);
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('testConnection').addEventListener('click', testConnection);

  // History
  document.getElementById('clearHistory').addEventListener('click', clearHistory);
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === tabId);
  });
}

function handleProviderChange() {
  settings.provider = document.getElementById('apiProvider').value;
  updateProviderUI();
}

function updateProviderUI() {
  const isGoogle = settings.provider === 'google';
  document.getElementById('apiKeyHint').textContent = isGoogle
    ? 'Get your key from Google AI Studio'
    : 'Get your key from OpenRouter';
  document.getElementById('googleModels').style.display = isGoogle ? '' : 'none';
  document.getElementById('openrouterModels').style.display = isGoogle ? 'none' : '';

  const activeGroup = document.getElementById(isGoogle ? 'googleModels' : 'openrouterModels');
  const firstOption = activeGroup.querySelector('option');
  if (firstOption) {
    document.getElementById('modelSelect').value = firstOption.value;
  }
}

function selectModel(model) {
  const option = document.querySelector(`#modelSelect option[value="${model}"]`);
  if (option) {
    document.getElementById('modelSelect').value = model;
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function handleTemperatureChange() {
  const val = document.getElementById('temperature').value;
  settings.temperature = parseFloat(val);
  document.getElementById('temperatureValue').textContent = val;
}

async function saveSettings() {
  settings.provider = document.getElementById('apiProvider').value;
  settings.apiKey = document.getElementById('apiKey').value;
  settings.model = document.getElementById('modelSelect').value;
  settings.temperature = parseFloat(document.getElementById('temperature').value);
  settings.autoScreenshot = document.getElementById('autoScreenshot').checked;

  await chrome.storage.local.set({ settings });
  showToast('Settings saved!');
  updateStatus();
}

async function testConnection() {
  const btn = document.getElementById('testConnection');
  btn.disabled = true;
  btn.textContent = 'Testing...';

  const config = {
    provider: document.getElementById('apiProvider').value,
    apiKey: document.getElementById('apiKey').value,
    model: document.getElementById('modelSelect').value,
    temperature: parseFloat(document.getElementById('temperature').value)
  };

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_CONNECTION',
      config
    });

    if (response.success) {
      showToast('Connection successful!', 'success');
      updateStatus(true);
    } else {
      showToast('Connection failed: ' + response.message, 'error');
      updateStatus(false);
    }
  } catch (error) {
    showToast('Connection failed: ' + error.message, 'error');
    updateStatus(false);
  }

  btn.disabled = false;
  btn.textContent = 'Test Connection';
}

function updateStatus(connected = null) {
  if (connected === null) {
    connected = !!settings.apiKey;
  }
  document.querySelector('.status-dot').classList.toggle('connected', connected);
  document.querySelector('.status-text').textContent = connected ? 'Connected' : 'Not Connected';
}

async function sendMessage() {
  const input = document.getElementById('userInput');
  const message = input.value.trim();
  if (!message || isProcessing) return;

  if (!settings.apiKey) {
    showToast('Please configure your API key in Settings', 'error');
    switchTab('settings');
    return;
  }

  isProcessing = true;
  document.getElementById('sendBtn').disabled = true;
  input.value = '';

  addMessage(message, 'user');
  const loadingMsg = addMessage('<div class="loading-dots"><span></span><span></span><span></span></div>', 'assistant');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_MESSAGE',
      message,
      includeScreenshot: settings.autoScreenshot
    });

    loadingMsg.remove();

    if (response.success) {
      const { thought, actions, message: responseMessage } = response.response;

      if (responseMessage) {
        addMessage(responseMessage, 'assistant');
      }

      if (actions && actions.length > 0) {
        addMessage('Executing ' + actions.length + ' action(s)...', 'action');

        const actionResponse = await chrome.runtime.sendMessage({
          type: 'EXECUTE_ACTIONS',
          actions
        });

        if (actionResponse.success) {
          const results = actionResponse.results;
          const successCount = results.filter(r => r.success).length;
          addMessage('Completed ' + successCount + '/' + results.length + ' actions', 'action');

          results.forEach(r => {
            if (!r.success) {
              addMessage('Failed: ' + r.action + ' - ' + r.error, 'error');
            }
          });
        } else {
          addMessage('Actions failed: ' + actionResponse.error, 'error');
        }
      }
    } else {
      addMessage('Error: ' + response.error, 'error');
    }
  } catch (error) {
    loadingMsg.remove();
    addMessage('Error: ' + error.message, 'error');
  }

  isProcessing = false;
  document.getElementById('sendBtn').disabled = false;
  loadHistory();
}

function addMessage(content, type) {
  const messages = document.getElementById('messages');
  const msg = document.createElement('div');
  msg.className = 'message ' + type;
  msg.innerHTML = content;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
  return msg;
}

function renderHistory(history) {
  const list = document.getElementById('historyList');
  if (history.length === 0) {
    list.innerHTML = '<p class="empty-state">No actions yet</p>';
    return;
  }

  list.innerHTML = history.slice(0, 20).map(entry => {
    const time = new Date(entry.timestamp).toLocaleString();
    if (entry.type === 'message') {
      return '<div class="history-item">' +
        '<div class="action-type">Message</div>' +
        '<div class="action-desc">' + escapeHtml(entry.request.slice(0, 100)) + '</div>' +
        '<div class="action-time">' + time + '</div>' +
        '</div>';
    } else {
      return '<div class="history-item">' +
        '<div class="action-type">' + entry.action.action + '</div>' +
        '<div class="action-desc">' + escapeHtml(entry.action.description || entry.action.selector || '') + '</div>' +
        '<div class="action-time">' + time + '</div>' +
        '</div>';
    }
  }).join('');
}

async function clearHistory() {
  await chrome.storage.local.set({ history: [] });
  renderHistory([]);
  showToast('History cleared');
}

function showToast(message, type) {
  type = type || 'info';
  const toast = document.createElement('div');
  let bg = '#667eea';
  if (type === 'error') bg = '#ef4444';
  if (type === 'success') bg = '#22c55e';

  toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);' +
    'padding:8px 16px;background:' + bg + ';color:white;border-radius:6px;' +
    'font-size:12px;z-index:1000;';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
