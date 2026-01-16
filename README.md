# Gemini Browser Control

A Chrome extension for AI-powered browser control using Google's Gemini models via Google AI Studio or OpenRouter.

## Features

- **Natural Language Commands**: Control your browser using plain English
- **Multiple API Providers**: Support for both Google AI Studio and OpenRouter
- **Browser Actions**:
  - Click on elements
  - Type text into inputs
  - Scroll the page
  - Navigate to URLs
  - Extract content (text, links, images)
  - Wait for elements
  - Select dropdown options
  - Hover over elements
- **Screenshot Analysis**: Optionally sends page screenshots for better context
- **Action History**: Track all executed actions
- **Context Menu Integration**: Right-click to explain text or summarize pages

## Installation

### From Source

1. Clone or download this repository
2. Generate icons (optional but recommended):
   ```bash
   npm install sharp
   node scripts/generate-icons.js
   ```
   Or manually create PNG icons in the `icons` folder (16x16, 32x32, 48x48, 128x128)

3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" (toggle in top right)
5. Click "Load unpacked" and select the extension folder

### API Key Setup

#### Google AI Studio
1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Create a new API key
3. Paste the key in the extension settings

#### OpenRouter
1. Visit [OpenRouter](https://openrouter.ai/)
2. Create an account and generate an API key
3. Select "OpenRouter" as the provider in extension settings
4. Paste your API key

## Usage

### Basic Commands

Click the extension icon to open the popup, then type natural language commands:

- "Click on the login button"
- "Type 'hello world' in the search box"
- "Scroll down"
- "Navigate to github.com"
- "Extract all links from this page"
- "Wait for the loading spinner to disappear"

### Settings

- **API Provider**: Choose between Google AI Studio or OpenRouter
- **Model**: Select the Gemini model to use
- **Temperature**: Adjust response creativity (0 = deterministic, 1 = creative)
- **Screenshot**: Toggle sending page screenshots with requests

### Context Menu

Right-click on any page to:
- **Explain with Gemini**: Explain selected text
- **Summarize with Gemini**: Get a summary of the page content

## Available Models

### Google AI Studio
- Gemini 2.0 Flash (Experimental)
- Gemini 1.5 Pro
- Gemini 1.5 Flash

### OpenRouter
- Gemini 2.0 Flash Exp (Free tier available)
- Gemini 1.5 Pro
- Gemini 1.5 Flash

## Architecture

```
├── manifest.json        # Extension configuration
├── popup/
│   ├── popup.html      # Extension popup UI
│   ├── popup.css       # Popup styles
│   └── popup.js        # Popup logic
├── background/
│   └── background.js   # Service worker for API calls
├── content/
│   └── content.js      # DOM interaction script
├── api/
│   └── gemini.js       # Gemini API client
├── icons/
│   └── icon*.png       # Extension icons
└── scripts/
    └── generate-icons.js  # Icon generation utility
```

## Permissions

The extension requires the following permissions:
- `activeTab`: Access current tab for browser control
- `scripting`: Execute content scripts
- `storage`: Save settings and history
- `tabs`: Tab management for navigation
- `<all_urls>`: Access any website for browser control

## Privacy

- API keys are stored locally in Chrome storage
- No data is sent to third parties except the configured API provider
- Screenshots are only captured when enabled and sent directly to your API provider

## Troubleshooting

### Extension not working on a page
- Some pages (chrome://, chrome-extension://) don't allow content scripts
- Try refreshing the page after installing the extension

### API errors
- Verify your API key is correct
- Check your API quota/billing status
- Try a different model

### Actions not finding elements
- Be more specific in your descriptions
- Use visible text or unique identifiers
- The AI works better with page screenshots enabled

## License

MIT License - Feel free to modify and distribute.
