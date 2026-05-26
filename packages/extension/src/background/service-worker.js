// Background service worker for ClaudeSidePanel extension

// ── Side Panel ────────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ── Context Menu ──────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  const isZh = chrome.i18n.getUILanguage().toLowerCase().startsWith("zh");
  const t = (zh, en) => (isZh ? zh : en);

  chrome.contextMenus.create({
    id: "claude-web-ask",
    title: t('问 Claude：“%s”', 'Ask Claude about "%s"'),
    contexts: ["selection"],
  });

  chrome.contextMenus.create({
    id: "claude-web-summarize",
    title: t("用 Claude 总结此页面", "Summarize this page with Claude"),
    contexts: ["page"],
  });

  chrome.contextMenus.create({
    id: "claude-web-explain",
    title: t("用 Claude 解释选中内容", "Explain this with Claude"),
    contexts: ["selection", "link"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  // Make sure side panel is open
  await chrome.sidePanel.open({ tabId: tab.id });

  // Small delay to let side panel initialize
  await new Promise((r) => setTimeout(r, 200));

  switch (info.menuItemId) {
    case "claude-web-ask":
    case "claude-web-explain":
      if (info.selectionText) {
        chrome.runtime.sendMessage({
          type: "context-action",
          action: "ask",
          text: info.selectionText,
          url: tab.url,
          title: tab.title,
        });
      }
      break;

    case "claude-web-summarize":
      chrome.runtime.sendMessage({
        type: "context-action",
        action: "summarize",
        url: tab.url,
        title: tab.title,
      });
      break;
  }
});

// ── Message Relay ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get-page-context") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            type: "extract-page-context",
            options: message.options,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              sendResponse(null);
            } else {
              sendResponse(response);
            }
          }
        );
      } else {
        sendResponse(null);
      }
    });
    return true; // async response
  }

  if (message.type === "get-selection") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { type: "extract-selection" },
          (response) => {
            sendResponse(response ?? null);
          }
        );
      } else {
        sendResponse(null);
      }
    });
    return true;
  }

  if (message.type === "capture-visible-tab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const windowId = tabs[0]?.windowId;
      if (typeof windowId !== "number") {
        sendResponse({ ok: false, error: "No active window" });
        return;
      }

      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError?.message ?? "Capture failed",
          });
          return;
        }

        sendResponse({ ok: true, dataUrl });
      });
    });
    return true;
  }

  if (message.type === "screenshot-area-selected") {
    const rect = message.payload;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const windowId = tabs[0]?.windowId;
      if (typeof windowId !== "number") {
        sendResponse({ ok: false, error: "No active window" });
        return;
      }

      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError?.message ?? "Capture failed",
          });
          return;
        }

        // Relay full screenshot + crop rect to sidepanel for client-side cropping
        chrome.runtime.sendMessage({
          type: "screenshot-area-cropped",
          payload: { dataUrl, rect },
        });
        sendResponse({ ok: true });
      });
    });
    return true;
  }
});
