/**
 * Gemini API Client
 * Supports both Google AI Studio and OpenRouter endpoints
 */

const GOOGLE_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export class GeminiClient {
  constructor(config = {}) {
    this.provider = config.provider || 'google';
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gemini-1.5-flash';
    this.temperature = config.temperature ?? 0.7;
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

    // Add screenshot if available
    if (screenshot) {
      parts.unshift({
        inline_data: {
          mime_type: 'image/png',
          data: screenshot.split(',')[1] // Remove data:image/png;base64, prefix
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
      headers: {
        'Content-Type': 'application/json',
      },
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

    // Add screenshot if available
    if (screenshot) {
      content.push({
        type: 'image_url',
        image_url: { url: screenshot }
      });
    }

    content.push({
      type: 'text',
      text: message
    });

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

Be precise with selectors. Prefer specific selectors like IDs, unique class names, or data attributes. If unsure, describe the element clearly.

IMPORTANT: Return ONLY valid JSON, no markdown formatting or code blocks.`;
  }

  parseResponse(text) {
    // Try to extract JSON from the response
    let jsonStr = text.trim();

    // Remove markdown code blocks if present
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
      // If parsing fails, treat the response as a plain message
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

export default GeminiClient;
