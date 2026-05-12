// Background service worker: routes the toolbar button click to the
// active tab's content script. Content script does the actual DOM
// extraction + `loom://` URL trigger. We keep no state here — every
// click is independent.
//
// Manifest V3 declares this file as both `service_worker` (Chromium)
// and `scripts` (Safari, which runs background as a non-persistent
// page). The same code works in both contexts.

(function () {
  'use strict';

  const ext = (typeof browser !== 'undefined') ? browser : chrome;

  // Shared capture trigger — used by both the toolbar action (when the
  // browser exposes one) and the right-click context menu (Atlas-style
  // browsers that hide the toolbar UI). Both eventually message the
  // content script which extracts + fires `loom://capture?…`.
  async function triggerCapture(tab) {
    if (!tab || !tab.id) return;
    try {
      await ext.tabs.sendMessage(tab.id, { type: 'capture' });
    } catch (e) {
      try {
        await ext.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await ext.tabs.sendMessage(tab.id, { type: 'capture' });
      } catch (inner) {
        console.error('[Loom] capture failed:', inner);
      }
    }
  }

  // Toolbar action — surfaces in Safari + most Chromium browsers, but
  // NOT in OpenAI Atlas (Atlas hides the puzzle/extension UI). Kept
  // for the browsers that do expose it.
  ext.action.onClicked.addListener(triggerCapture);

  // Context menu — works in every Chromium-derived browser including
  // Atlas (which doesn't expose toolbar buttons). Adds a "Capture to
  // Loom" item to right-click menus on any page or selection. This is
  // the primary capture path for Atlas users.
  ext.runtime.onInstalled.addListener(() => {
    try {
      ext.contextMenus.removeAll(() => {
        ext.contextMenus.create({
          id: 'loom-capture-page',
          title: 'Capture this page to Loom',
          contexts: ['page']
        });
        ext.contextMenus.create({
          id: 'loom-capture-selection',
          title: 'Capture selection to Loom',
          contexts: ['selection']
        });
        ext.contextMenus.create({
          id: 'loom-capture-link',
          title: 'Capture link to Loom',
          contexts: ['link']
        });
      });
    } catch (e) {
      console.warn('[Loom] context menu registration failed:', e);
    }
  });

  ext.contextMenus.onClicked.addListener((info, tab) => {
    if (!info || !info.menuItemId) return;
    if (info.menuItemId === 'loom-capture-page' ||
        info.menuItemId === 'loom-capture-selection' ||
        info.menuItemId === 'loom-capture-link') {
      triggerCapture(tab);
    }
  });

  // Background-mediated `loom://` launch via `scripting.executeScript`
  // running in MAIN world. Why this path:
  //   - `tabs.create({url: 'loom://...'})` silently no-ops in Atlas /
  //     Chromium — the browser tries to load it as a tab URL, fails
  //     to recognize the scheme, never hands off to OS LaunchServices.
  //   - Inline `<script>` injection from content scripts is blocked
  //     by page CSP (Hacker News + many sites set strict script-src).
  //   - `chrome.scripting.executeScript({world: 'MAIN', func})` is
  //     injected directly by the browser via the debugger protocol,
  //     bypassing page CSP. Once running in main world, an anchor
  //     click on a `loom://` href is treated like a regular link
  //     activation and routes through OS handlers.
  //
  // The injected function runs in main world, creates an <a> element
  // with the loom:// href, and clicks it. macOS LaunchServices catches
  // the navigation and wakes Loom.app.
  function clickLoomUrlInPage(loomUrl) {
    const a = document.createElement('a');
    a.href = loomUrl;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  }

  async function captureVisibleTabDataURL(sender) {
    if (!ext.tabs || typeof ext.tabs.captureVisibleTab !== 'function') {
      throw new Error('captureVisibleTab unavailable');
    }
    const options = { format: 'jpeg', quality: 86 };
    const windowId = sender && sender.tab && sender.tab.windowId;
    const usePromiseCapture = typeof browser !== 'undefined';
    if (usePromiseCapture) {
      return windowId != null
        ? ext.tabs.captureVisibleTab(windowId, options)
        : ext.tabs.captureVisibleTab(options);
    }
    return await new Promise((resolve, reject) => {
      try {
        const callback = (dataUrl) => {
          const lastError = ext.runtime && ext.runtime.lastError;
          if (lastError) reject(new Error(lastError.message || String(lastError)));
          else if (dataUrl) resolve(dataUrl);
          else reject(new Error('empty visible-tab capture'));
        };
        if (windowId != null) ext.tabs.captureVisibleTab(windowId, options, callback);
        else ext.tabs.captureVisibleTab(options, callback);
      } catch (err) {
        reject(err);
      }
    });
  }

  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return false;
    if (!sender || !sender.tab || sender.tab.id == null) {
      try { sendResponse({ ok: false, error: 'no tab id' }); } catch (_) {}
      return false;
    }

    if (message.type === 'capture-visible-tab') {
      captureVisibleTabDataURL(sender).then((dataUrl) => {
        try { sendResponse({ ok: true, dataUrl }); } catch (_) {}
      }).catch((err) => {
        console.error('[Loom] captureVisibleTab failed:', err);
        try { sendResponse({ ok: false, error: String(err && err.message || err) }); } catch (_) {}
      });
      return true;
    }

    // Two URL shapes:
    //   - `open-loom-via-clipboard` → fire short URL `loom://capture?via=clipboard`
    //     (Loom reads clipboard for full JSON; bypasses URL truncation)
    //   - `open-loom` (fallback)    → embed JSON in URL (tolerates small payloads)
    let url;
    if (message.type === 'open-loom-via-clipboard') {
      url = 'loom://capture?via=clipboard';
    } else if (message.type === 'open-loom') {
      url = 'loom://capture?payload=' +
        encodeURIComponent(JSON.stringify(message.payload || {}));
    } else {
      return false;
    }

    ext.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: clickLoomUrlInPage,
      args: [url],
    }).then((results) => {
      const ok = Array.isArray(results) && results[0] && results[0].result === true;
      try { sendResponse({ ok }); } catch (_) {}
    }).catch((err) => {
      console.error('[Loom] scripting.executeScript main world failed:', err);
      try { sendResponse({ ok: false, error: String(err) }); } catch (_) {}
    });
    return true;
  });
})();
