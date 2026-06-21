// Background service worker for ClaudeSidePanel extension

const NATIVE_HOST_NAME = "com.claudesidepanel.bridge";

function ensureBridgeStarted() {
  try {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      { action: "start-bridge" },
      () => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[ClaudeSidePanel] Native bridge host unavailable:",
            chrome.runtime.lastError.message
          );
        }
      }
    );
  } catch (error) {
    console.warn("[ClaudeSidePanel] Failed to start native bridge host:", error);
  }
}

ensureBridgeStarted();

chrome.runtime.onStartup.addListener(() => {
  ensureBridgeStarted();
});

// ── Side Panel ────────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  ensureBridgeStarted();
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ── Context Menu ──────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  ensureBridgeStarted();

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

  ensureBridgeStarted();

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
        collectPageContextFromFrames(tabs[0].id, message.options, sendResponse);
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
    const { rect } = message.payload;
    const sourceTabId = sender.tab?.id;
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

        // Send full screenshot + crop rect to content script for preview
        if (sourceTabId) {
          chrome.tabs.sendMessage(sourceTabId, {
            type: "screenshot-area-preview",
            payload: { dataUrl, rect },
          });
        }
        sendResponse({ ok: true });
      });
    });
    return true;
  }
});

function collectPageContextFromFrames(tabId, options, sendResponse) {
  chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
    const frameIds = (frames ?? [])
      .map((frame) => frame.frameId)
      .filter((frameId) => typeof frameId === "number");

    if (frameIds.length === 0) {
      sendResponse(null);
      return;
    }

    const contexts = [];
    let remaining = frameIds.length;
    const finish = () => {
      remaining -= 1;
      if (remaining === 0) sendResponse(mergePageContexts(contexts, options));
    };

    for (const frameId of frameIds) {
      chrome.tabs.sendMessage(
        tabId,
        { type: "extract-page-context", options, frameId },
        { frameId },
        (response) => {
          if (!chrome.runtime.lastError && response) contexts.push(response);
          finish();
        }
      );
    }
  });
}

function mergePageContexts(contexts, options) {
  if (contexts.length === 0) return null;

  const primary = contexts.find((ctx) => !ctx.isFrame) ?? contexts[0];
  const maxLength = options?.maxLength ?? 12000;
  const seenText = new Set();
  const bodyParts = [];
  const headings = [];
  const links = [];

  for (const ctx of contexts) {
    const label = ctx.isFrame ? `Frame: ${ctx.title || ctx.url}` : "Main page";
    const bodyText = String(ctx.bodyText ?? "").trim();
    if (bodyText && !seenText.has(bodyText)) {
      seenText.add(bodyText);
      bodyParts.push(`[${label}]\n${bodyText}`);
    }
    if (Array.isArray(ctx.headings)) headings.push(...ctx.headings);
    if (Array.isArray(ctx.links)) links.push(...ctx.links);
  }

  return {
    ...primary,
    bodyText: bodyParts.join("\n\n").slice(0, maxLength),
    headings: Array.from(new Set(headings)).slice(0, 60),
    links: dedupeLinks(links).slice(0, 40),
    frames: contexts.map((ctx) => ({ url: ctx.url, title: ctx.title, isFrame: ctx.isFrame })),
  };
}

function dedupeLinks(links) {
  const seen = new Set();
  const result = [];
  for (const link of links) {
    const key = `${link.text}\n${link.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(link);
  }
  return result;
}
