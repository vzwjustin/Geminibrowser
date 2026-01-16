/**
 * Gemini Browser Control - Background Service Worker
 * Handles API communication and message routing
 */

// ============================================
// GEMINI API CLIENT
// ============================================

const GOOGLE_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

class GeminiClient {
  constructor() {
    this.provider = 'google';
    this.apiKey = '';
    this.model = 'gemini-1.5-flash';
    this.temperature = 0.7;
  }

  updateConfig(config) {
    if (config.provider !== undefined) this.provider = config.provider;
    if (config.apiKey !== undefined) this.apiKey = config.apiKey;
    if (config.model !== undefined) this.model = config.model;
    if (config.temperature !== undefined) this.temperature = config.temperature;
  }

  async sendMessage(message, options = {}) {
    if (!this.apiKey) {
      throw new Error('API key is not configured');
    }

    const { screenshot, pageContext } = options;

    if (this.provider === 'google') {
      return this.sendGoogleRequest(message, { screenshot, pageContext });
    } else {
      return this.sendOpenRouterRequest(message, { screenshot, pageContext });
    }
  }

  async sendGoogleRequest(message, options = {}) {
    const { screenshot, pageContext } = options;
    const url = `${GOOGLE_API_URL}/${this.model}:generateContent?key=${this.apiKey}`;

    const systemPrompt = this.buildSystemPrompt(pageContext);
    const parts = [{ text: `${systemPrompt}\n\nUser request: ${message}` }];

    if (screenshot) {
      parts.unshift({
        inline_data: {
          mime_type: 'image/png',
          data: screenshot.split(',')[1]
        }
      });
    }

    const requestBody = {
      contents: [{ parts }],
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: 2048,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response generated');
    }

    return this.parseResponse(text);
  }

  async sendOpenRouterRequest(message, options = {}) {
    const { screenshot, pageContext } = options;
    const systemPrompt = this.buildSystemPrompt(pageContext);

    const content = [];

    if (screenshot) {
      content.push({
        type: 'image_url',
        image_url: { url: screenshot }
      });
    }

    content.push({ type: 'text', text: message });

    const requestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content }
      ],
      temperature: this.temperature,
      max_tokens: 2048
    };

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'chrome-extension://gemini-browser-control',
        'X-Title': 'Gemini Browser Control'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error('No response generated');
    }

    return this.parseResponse(text);
  }

  buildSystemPrompt(pageContext = {}) {
    const { url, title, elements } = pageContext;

    return `You are a browser automation assistant. You help users interact with web pages by generating precise browser control commands.

CURRENT PAGE CONTEXT:
- URL: ${url || 'Unknown'}
- Title: ${title || 'Unknown'}
${elements ? `- Interactive Elements: ${JSON.stringify(elements, null, 2)}` : ''}

AVAILABLE ACTIONS:
1. CLICK - Click on an element
   Format: {"action": "click", "selector": "CSS selector or description", "description": "what you're clicking"}

2. TYPE - Type text into an input field
   Format: {"action": "type", "selector": "CSS selector", "text": "text to type", "description": "what field you're typing in"}

3. SCROLL - Scroll the page
   Format: {"action": "scroll", "direction": "up|down|left|right", "amount": pixels, "description": "scrolling context"}

4. NAVIGATE - Navigate to a URL
   Format: {"action": "navigate", "url": "full URL", "description": "where you're navigating"}

5. EXTRACT - Extract information from the page
   Format: {"action": "extract", "selector": "CSS selector (optional)", "type": "text|links|images|all", "description": "what you're extracting"}

6. WAIT - Wait for an element or time
   Format: {"action": "wait", "selector": "CSS selector (optional)", "timeout": milliseconds, "description": "what you're waiting for"}

7. SELECT - Select an option from a dropdown
   Format: {"action": "select", "selector": "CSS selector", "value": "option value", "description": "what you're selecting"}

8. HOVER - Hover over an element
   Format: {"action": "hover", "selector": "CSS selector", "description": "what you're hovering over"}

RESPONSE FORMAT:
Always respond with a JSON object containing:
{
  "thought": "Your reasoning about what to do",
  "actions": [array of action objects],
  "message": "A friendly message to show the user"
}

If the user's request doesn't require browser actions (just a question), respond with:
{
  "thought": "Your reasoning",
  "actions": [],
  "message": "Your answer to their question"
}

Be precise with selectors. Prefer specific selectors like IDs, unique class names, or data attributes.

IMPORTANT: Return ONLY valid JSON, no markdown formatting or code blocks.`;
  }

  parseResponse(text) {
    let jsonStr = text.trim();

    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return {
        success: true,
        thought: parsed.thought || '',
        actions: parsed.actions || [],
        message: parsed.message || ''
      };
    } catch (e) {
      return {
        success: true,
        thought: '',
        actions: [],
        message: text
      };
    }
  }

  async testConnection() {
    try {
      const response = await this.sendMessage('Say "Connection successful!" if you can read this.', {});
      return { success: true, message: response.message };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

// ============================================
// BACKGROUND SERVICE WORKER
// ============================================

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

// Listen for storage changes
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
  return true;
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

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    let screenshot = null;
    let pageContext = { url: tab.url, title: tab.title };

    try {
      const contextResponse = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' });
      if (contextResponse) {
        pageContext = { ...pageContext, ...contextResponse };
      }
    } catch (e) {
      console.log('Could not get page context:', e.message);
    }

    if (includeScreenshot) {
      try {
        screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
      } catch (e) {
        console.log('Could not capture screenshot:', e.message);
      }
    }

    const response = await geminiClient.sendMessage(message, { screenshot, pageContext });

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

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active tab found');
    }

    for (const action of actions) {
      try {
        let result;

        if (action.action === 'navigate') {
          await chrome.tabs.update(tab.id, { url: action.url });
          result = { success: true, action: 'navigate', url: action.url };
        } else {
          result = await chrome.tabs.sendMessage(tab.id, {
            type: 'EXECUTE_ACTION',
            action
          });
        }

        results.push(result);

        await saveToHistory({
          type: 'action',
          action: action,
          result: result,
          timestamp: Date.now(),
          url: tab.url
        });

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
      context: { url: tab.url, title: tab.title, ...contextResponse }
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
    history.unshift(entry);
    if (history.length > 100) {
      history.pop();
    }
    await chrome.storage.local.set({ history });
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}

// Context menu
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

    chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_NOTIFICATION',
      message: response.message
    });
  } else if (info.menuItemId === 'gemini-summarize') {
    try {
      const contextResponse = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' });
      const response = await geminiClient.sendMessage(
        'Summarize the main content of this page',
        { pageContext: { url: tab.url, title: tab.title, ...contextResponse } }
      );

      chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_NOTIFICATION',
        message: response.message
      });
    } catch (e) {
      console.error('Summarize error:', e);
    }
  }
});
