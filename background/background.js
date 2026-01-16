/**
 * Background Service Worker
 * Handles API communication and message routing
 */

import { GeminiClient } from '../api/gemini.js';

const geminiClient = new GeminiClient();

// Initialize settings from storage
chrome.storage.local.get(['settings'], (result) => {
  if (result.settings) {
    geminiClient.updateConfig({
      provider: result.settings.provider,
      apiKey: result.settings.apiKey,
      model: result.settings.model,
      temperature: result.settings.temperature
    });
  }
});

// Listen for storage changes to update client config
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.settings) {
    const settings = changes.settings.newValue;
    geminiClient.updateConfig({
      provider: settings.provider,
      apiKey: settings.apiKey,
      model: settings.model,
      temperature: settings.temperature
    });
  }
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse);
  return true; // Keep the message channel open for async response
});

async function handleMessage(request, sender) {
  switch (request.type) {
    case 'SEND_MESSAGE':
      return handleSendMessage(request);

    case 'TEST_CONNECTION':
      return handleTestConnection(request);

    case 'EXECUTE_ACTIONS':
      return handleExecuteActions(request);

    case 'GET_PAGE_CONTEXT':
      return handleGetPageContext(request);

    case 'CAPTURE_SCREENSHOT':
      return handleCaptureScreenshot(request);

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

async function handleSendMessage(request) {
  try {
    const { message, includeScreenshot } = request;

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    let screenshot = null;
    let pageContext = { url: tab.url, title: tab.title };

    // Get page context from content script
    try {
      const contextResponse = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' });
      if (contextResponse) {
        pageContext = { ...pageContext, ...contextResponse };
      }
    } catch (e) {
      console.log('Could not get page context:', e.message);
    }

    // Capture screenshot if requested
    if (includeScreenshot) {
      try {
        screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      } catch (e) {
        console.log('Could not capture screenshot:', e.message);
      }
    }

    // Send message to Gemini
    const response = await geminiClient.sendMessage(message, { screenshot, pageContext });

    // Save to history
    await saveToHistory({
      type: 'message',
      request: message,
      response: response,
      timestamp: Date.now(),
      url: tab.url
    });

    return { success: true, response };
  } catch (error) {
    console.error('Send message error:', error);
    return { success: false, error: error.message };
  }
}

async function handleTestConnection(request) {
  try {
    // Temporarily update config if test config provided
    if (request.config) {
      geminiClient.updateConfig(request.config);
    }

    const result = await geminiClient.testConnection();
    return result;
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function handleExecuteActions(request) {
  try {
    const { actions } = request;
    const results = [];

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    for (const action of actions) {
      try {
        let result;

        if (action.action === 'navigate') {
          // Handle navigation in background
          await chrome.tabs.update(tab.id, { url: action.url });
          result = { success: true, action: 'navigate', url: action.url };
        } else {
          // Send action to content script
          result = await chrome.tabs.sendMessage(tab.id, {
            type: 'EXECUTE_ACTION',
            action
          });
        }

        results.push(result);

        // Save action to history
        await saveToHistory({
          type: 'action',
          action: action,
          result: result,
          timestamp: Date.now(),
          url: tab.url
        });

        // Small delay between actions
        if (actions.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (e) {
        results.push({ success: false, error: e.message, action: action.action });
      }
    }

    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleGetPageContext(request) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    const contextResponse = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' });
    return {
      success: true,
      context: {
        url: tab.url,
        title: tab.title,
        ...contextResponse
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleCaptureScreenshot(request) {
  try {
    const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    return { success: true, screenshot };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function saveToHistory(entry) {
  try {
    const result = await chrome.storage.local.get(['history']);
    const history = result.history || [];

    // Keep last 100 entries
    history.unshift(entry);
    if (history.length > 100) {
      history.pop();
    }

    await chrome.storage.local.set({ history });
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}

// Context menu for quick actions
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'gemini-explain',
    title: 'Explain with Gemini',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'gemini-summarize',
    title: 'Summarize with Gemini',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'gemini-explain' && info.selectionText) {
    const response = await geminiClient.sendMessage(
      `Explain this text: "${info.selectionText}"`,
      { pageContext: { url: tab.url, title: tab.title } }
    );

    // Send result to content script to display
    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_NOTIFICATION',
      message: response.message
    });
  } else if (info.menuItemId === 'gemini-summarize') {
    const contextResponse = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' });
    const response = await geminiClient.sendMessage(
      'Summarize the main content of this page',
      { pageContext: { url: tab.url, title: tab.title, ...contextResponse } }
    );

    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_NOTIFICATION',
      message: response.message
    });
  }
});
