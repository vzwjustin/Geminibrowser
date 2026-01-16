/**
 * Gemini Browser Control - Content Script
 * Handles DOM interaction and browser control actions
 */

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request).then(sendResponse);
  return true;
});

async function handleMessage(request) {
  switch (request.type) {
    case 'GET_CONTEXT':
      return getPageContext();
    case 'EXECUTE_ACTION':
      return executeAction(request.action);
    case 'SHOW_NOTIFICATION':
      return showNotification(request.message);
    default:
      return { success: false, error: 'Unknown message type' };
  }
}

function getPageContext() {
  const elements = getInteractiveElements();
  const mainContent = getMainContent();

  return {
    url: window.location.href,
    title: document.title,
    elements: elements,
    mainContent: mainContent
  };
}

function getInteractiveElements() {
  const selectors = [
    'button',
    'a[href]',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[onclick]',
    '[tabindex]'
  ];

  const elements = [];
  const seen = new Set();

  document.querySelectorAll(selectors.join(', ')).forEach((el, index) => {
    if (!isVisible(el) || seen.has(el)) return;
    seen.add(el);

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const info = {
      index,
      tag: el.tagName.toLowerCase(),
      type: el.type || null,
      id: el.id || null,
      className: el.className ? el.className.toString().slice(0, 50) : null,
      text: getElementText(el),
      placeholder: el.placeholder || null,
      ariaLabel: el.getAttribute('aria-label'),
      name: el.name || null,
      href: el.href || null,
      selector: generateSelector(el)
    };

    if (info.text || info.id || info.placeholder || info.ariaLabel || info.name) {
      elements.push(info);
    }
  });

  return elements.slice(0, 50);
}

function getMainContent() {
  const mainSelectors = ['main', 'article', '[role="main"]', '.content', '#content'];
  let content = '';

  for (const selector of mainSelectors) {
    const el = document.querySelector(selector);
    if (el) {
      content = el.innerText;
      break;
    }
  }

  if (!content) {
    content = document.body.innerText;
  }

  return content.slice(0, 2000);
}

function isVisible(el) {
  const style = window.getComputedStyle(el);
  return style.display !== 'none' &&
         style.visibility !== 'hidden' &&
         style.opacity !== '0' &&
         el.offsetParent !== null;
}

function getElementText(el) {
  let text = el.innerText || el.textContent || '';
  text = text.trim().replace(/\s+/g, ' ');
  return text.slice(0, 100);
}

function generateSelector(el) {
  if (el.id) {
    return '#' + CSS.escape(el.id);
  }

  if (el.name) {
    const nameSelector = '[name="' + CSS.escape(el.name) + '"]';
    if (document.querySelectorAll(nameSelector).length === 1) {
      return nameSelector;
    }
  }

  const path = [];
  let current = el;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = '#' + CSS.escape(current.id);
      path.unshift(selector);
      break;
    }

    if (current.className) {
      const classes = current.className.toString().split(/\s+/).filter(c => c && !c.includes(':'));
      if (classes.length > 0) {
        selector += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
      }
    }

    const siblings = current.parentNode?.children;
    if (siblings && siblings.length > 1) {
      const index = Array.from(siblings).filter(s => s.tagName === current.tagName).indexOf(current);
      if (index > 0) {
        selector += ':nth-of-type(' + (index + 1) + ')';
      }
    }

    path.unshift(selector);
    current = current.parentNode;
  }

  return path.join(' > ');
}

async function executeAction(action) {
  try {
    switch (action.action) {
      case 'click':
        return await executeClick(action);
      case 'type':
        return await executeType(action);
      case 'scroll':
        return await executeScroll(action);
      case 'extract':
        return await executeExtract(action);
      case 'wait':
        return await executeWait(action);
      case 'select':
        return await executeSelect(action);
      case 'hover':
        return await executeHover(action);
      default:
        return { success: false, error: 'Unknown action: ' + action.action };
    }
  } catch (error) {
    return { success: false, error: error.message, action: action.action };
  }
}

function findElement(selectorOrDesc) {
  try {
    const el = document.querySelector(selectorOrDesc);
    if (el) return el;
  } catch (e) {}

  const searchText = selectorOrDesc.toLowerCase();
  const candidates = document.querySelectorAll('button, a, input, textarea, select, [role="button"]');

  for (const el of candidates) {
    const text = getElementText(el).toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const placeholder = (el.placeholder || '').toLowerCase();
    const title = (el.title || '').toLowerCase();

    if (text.includes(searchText) ||
        ariaLabel.includes(searchText) ||
        placeholder.includes(searchText) ||
        title.includes(searchText)) {
      return el;
    }
  }

  return null;
}

async function executeClick(action) {
  const el = findElement(action.selector);
  if (!el) {
    return { success: false, error: 'Element not found: ' + action.selector };
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(200);

  highlightElement(el);

  el.focus();
  el.click();
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  return {
    success: true,
    action: 'click',
    element: getElementText(el) || action.selector
  };
}

async function executeType(action) {
  const el = findElement(action.selector);
  if (!el) {
    return { success: false, error: 'Element not found: ' + action.selector };
  }

  if (!['INPUT', 'TEXTAREA'].includes(el.tagName) && !el.isContentEditable) {
    return { success: false, error: 'Element is not a text input' };
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(200);

  highlightElement(el);
  el.focus();

  if (el.isContentEditable) {
    el.innerHTML = '';
  } else {
    el.value = '';
  }

  const text = action.text;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (el.isContentEditable) {
      el.innerHTML += char;
    } else {
      el.value += char;
    }

    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: char }));
    await sleep(30);
  }

  el.dispatchEvent(new Event('change', { bubbles: true }));

  return {
    success: true,
    action: 'type',
    text: text.slice(0, 50) + (text.length > 50 ? '...' : '')
  };
}

async function executeScroll(action) {
  const amount = action.amount || 300;
  let scrollX = 0;
  let scrollY = 0;

  switch (action.direction) {
    case 'up':
      scrollY = -amount;
      break;
    case 'down':
      scrollY = amount;
      break;
    case 'left':
      scrollX = -amount;
      break;
    case 'right':
      scrollX = amount;
      break;
    default:
      scrollY = amount;
  }

  window.scrollBy({ left: scrollX, top: scrollY, behavior: 'smooth' });

  return {
    success: true,
    action: 'scroll',
    direction: action.direction || 'down',
    amount
  };
}

async function executeExtract(action) {
  const type = action.type || 'text';
  let data;

  const container = action.selector ? document.querySelector(action.selector) : document.body;
  if (!container) {
    return { success: false, error: 'Container not found: ' + action.selector };
  }

  switch (type) {
    case 'text':
      data = container.innerText;
      break;
    case 'links':
      data = Array.from(container.querySelectorAll('a[href]')).map(a => ({
        text: getElementText(a),
        href: a.href
      }));
      break;
    case 'images':
      data = Array.from(container.querySelectorAll('img')).map(img => ({
        src: img.src,
        alt: img.alt
      }));
      break;
    case 'all':
      data = {
        text: container.innerText.slice(0, 5000),
        links: Array.from(container.querySelectorAll('a[href]')).slice(0, 50).map(a => ({
          text: getElementText(a),
          href: a.href
        })),
        images: Array.from(container.querySelectorAll('img')).slice(0, 20).map(img => ({
          src: img.src,
          alt: img.alt
        }))
      };
      break;
    default:
      return { success: false, error: 'Unknown extract type: ' + type };
  }

  return { success: true, action: 'extract', type, data };
}

async function executeWait(action) {
  const timeout = action.timeout || 1000;

  if (action.selector) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const el = document.querySelector(action.selector);
      if (el && isVisible(el)) {
        return { success: true, action: 'wait', found: true, selector: action.selector };
      }
      await sleep(100);
    }
    return { success: false, error: 'Timeout waiting for: ' + action.selector };
  } else {
    await sleep(timeout);
    return { success: true, action: 'wait', duration: timeout };
  }
}

async function executeSelect(action) {
  const el = findElement(action.selector);
  if (!el) {
    return { success: false, error: 'Element not found: ' + action.selector };
  }

  if (el.tagName !== 'SELECT') {
    return { success: false, error: 'Element is not a select dropdown' };
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(200);

  highlightElement(el);
  el.focus();
  el.value = action.value;
  el.dispatchEvent(new Event('change', { bubbles: true }));

  return { success: true, action: 'select', value: action.value };
}

async function executeHover(action) {
  const el = findElement(action.selector);
  if (!el) {
    return { success: false, error: 'Element not found: ' + action.selector };
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(200);

  highlightElement(el);

  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

  return { success: true, action: 'hover', element: getElementText(el) || action.selector };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function highlightElement(el) {
  const originalOutline = el.style.outline;
  const originalTransition = el.style.transition;

  el.style.transition = 'outline 0.2s';
  el.style.outline = '3px solid #667eea';

  setTimeout(() => {
    el.style.outline = originalOutline;
    el.style.transition = originalTransition;
  }, 1000);
}

function showNotification(message) {
  const existing = document.getElementById('gemini-notification');
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.id = 'gemini-notification';
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      max-width: 400px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e4e4e7;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      border: 1px solid rgba(102, 126, 234, 0.3);
      animation: geminiSlideIn 0.3s ease;
    ">
      <style>
        @keyframes geminiSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        <div style="
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 4px; color: #667eea;">Gemini</div>
          <div>${message}</div>
        </div>
        <button onclick="this.parentElement.parentElement.parentElement.remove()" style="
          background: none;
          border: none;
          color: #71717a;
          cursor: pointer;
          padding: 4px;
          font-size: 18px;
          line-height: 1;
        ">&times;</button>
      </div>
    </div>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 10000);

  return { success: true };
}

console.log('Gemini Browser Control content script loaded');
