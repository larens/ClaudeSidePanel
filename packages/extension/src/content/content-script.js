// Content script — injected into every page
// Collects page context when requested by the side panel

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "extract-page-context") {
    const context = extractPageContext(message.options);
    sendResponse(context);
  }
  if (message.type === "extract-selection") {
    sendResponse({
      selectedText: window.getSelection()?.toString() ?? "",
      url: window.location.href,
      title: document.title,
    });
  }
  if (message.type === "inspect-mode") {
    if (message.action === "enter") {
      enterInspectMode();
      sendResponse({ ok: true });
    } else if (message.action === "exit") {
      exitInspectMode();
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
  }
  if (message.type === "screenshot-mode") {
    enterScreenshotMode();
    sendResponse({ ok: true });
  }
});

// Listen for screenshot preview from background service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "screenshot-area-preview") return;
  const { dataUrl, rect } = message.payload ?? {};
  if (!dataUrl || !rect) return;

  const isZh = (navigator.language || "").toLowerCase().startsWith("zh");

  // Remove any existing preview
  document.querySelectorAll('[data-screenshot-preview="true"]').forEach((el) => el.remove());

  const img = new Image();
  img.onload = () => {
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.round(rect.x * dpr);
    const sy = Math.round(rect.y * dpr);
    const sw = Math.round(rect.width * dpr);
    const sh = Math.round(rect.height * dpr);

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const croppedDataUrl = canvas.toDataURL("image/png");

    const host = document.createElement("div");
    host.setAttribute("data-screenshot-preview", "true");
    const root = host.attachShadow({ mode: "closed" });

    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;left:0;top:0;right:0;bottom:0;" +
      "background:rgba(0,0,0,0.55);z-index:2147483645;" +
      "display:flex;align-items:center;justify-content:center;flex-direction:column;";

    const container = document.createElement("div");
    container.style.cssText =
      "position:relative;max-width:85vw;max-height:70vh;" +
      "padding:12px;background:#1a1a2e;border-radius:12px;" +
      "box-shadow:0 8px 32px rgba(0,0,0,0.5);";

    const previewImg = document.createElement("img");
    previewImg.src = croppedDataUrl;
    previewImg.style.cssText =
      "display:block;max-width:100%;max-height:60vh;border-radius:4px;object-fit:contain;";

    const sizeHint = document.createElement("div");
    sizeHint.style.cssText =
      "margin-top:10px;text-align:center;color:#999;font:12px -apple-system,sans-serif;";
    sizeHint.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)} px`;

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:12px;margin-top:14px;justify-content:center;";

    const cancelBtn = document.createElement("button");
    cancelBtn.style.cssText =
      "padding:8px 24px;border-radius:8px;border:1px solid #555;background:#2a2a3e;" +
      "color:#aaa;font:13px -apple-system,sans-serif;cursor:pointer;transition:all 0.2s;";
    cancelBtn.textContent = isZh ? "取消" : "Cancel";

    const confirmBtn = document.createElement("button");
    confirmBtn.style.cssText =
      "padding:8px 24px;border-radius:8px;border:none;background:#4ade80;" +
      "color:#000;font:13px -apple-system,sans-serif;cursor:pointer;font-weight:600;" +
      "transition:all 0.2s;";
    confirmBtn.textContent = isZh ? "确认" : "Confirm";

    const cleanup = () => {
      overlay.removeEventListener("click", onOverlayClick);
      cancelBtn.removeEventListener("click", onCancel);
      confirmBtn.removeEventListener("click", onConfirm);
      window.removeEventListener("keydown", onKey, true);
      host.remove();
    };

    const onOverlayClick = (e) => {
      if (e.target === overlay) cleanup();
    };

    const onCancel = () => cleanup();

    const onConfirm = () => {
      chrome.runtime.sendMessage({
        type: "screenshot-confirmed",
        payload: { croppedDataUrl },
      });
      cleanup();
    };

    const onKey = (e) => {
      if (e.key === "Escape") cleanup();
    };

    cancelBtn.addEventListener("click", onCancel);
    cancelBtn.addEventListener("mouseenter", () => {
      cancelBtn.style.background = "#3a3a5e";
      cancelBtn.style.color = "#fff";
    });
    cancelBtn.addEventListener("mouseleave", () => {
      cancelBtn.style.background = "#2a2a3e";
      cancelBtn.style.color = "#aaa";
    });
    confirmBtn.addEventListener("click", onConfirm);
    confirmBtn.addEventListener("mouseenter", () => {
      confirmBtn.style.background = "#22c55e";
    });
    confirmBtn.addEventListener("mouseleave", () => {
      confirmBtn.style.background = "#4ade80";
    });
    overlay.addEventListener("click", onOverlayClick);
    window.addEventListener("keydown", onKey, true);

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);
    container.appendChild(previewImg);
    container.appendChild(sizeHint);
    container.appendChild(btnRow);
    overlay.appendChild(container);
    root.appendChild(overlay);
    document.documentElement.appendChild(host);
  };
  img.src = dataUrl;
});

function extractPageContext(options) {
  const maxLen = options?.maxLength ?? 10000;
  const selectedText = window.getSelection()?.toString().trim() ?? "";
  const meta = extractMeta();
  const headings = extractHeadings();
  const bodyText = extractMainContent(maxLen);
  const links = options?.includeLinks ? extractLinks() : [];

  return {
    url: window.location.href,
    title: document.title,
    isFrame: window.top !== window,
    selectedText,
    bodyText,
    meta,
    headings,
    links,
  };
}

function extractMeta() {
  const getMeta = (name) =>
    document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)
      ?.getAttribute("content") ?? undefined;

  return {
    description: getMeta("description") ?? getMeta("og:description"),
    author: getMeta("author"),
    publishDate: getMeta("article:published_time") ?? getMeta("date") ?? undefined,
    siteName: getMeta("og:site_name"),
    type: getMeta("og:type"),
  };
}

function extractHeadings() {
  const headings = [];
  const elements = document.querySelectorAll('h1, h2, h3, h4, [role="heading"], [aria-level]');
  for (const el of elements) {
    const text = getElementText(el, 200);
    if (text && text.length < 200) {
      headings.push(`${el.tagName.toLowerCase()}: ${text}`);
    }
    if (headings.length >= 30) break;
  }
  return headings;
}

function extractMainContent(maxLength) {
  const candidates = [
    document.querySelector("article"),
    document.querySelector("main"),
    document.querySelector('[role="main"]'),
    document.querySelector("#root"),
    document.querySelector("#app"),
    document.querySelector(".app"),
    document.querySelector(".post-content, .article-content, .entry-content, .content"),
  ].filter(Boolean);

  const visibleCandidates = candidates
    .concat(Array.from(document.querySelectorAll('[class*="content"], [class*="main"], [class*="review"], [class*="preview"], [class*="container"]')))
    .filter(isVisibleElement);
  const primary = visibleCandidates
    .map((el) => ({ el, text: getElementText(el, maxLength * 2) }))
    .filter((item) => item.text.length > 0)
    .sort((a, b) => b.text.length - a.text.length)[0];
  if (primary) {
    return cleanText(primary.text, maxLength);
  }
  return cleanText(getElementText(document.body, maxLength * 2), maxLength);
}

function extractLinks() {
  const links = [];
  const anchors = document.querySelectorAll("a[href]");
  for (const a of anchors) {
    const text = a.textContent?.trim();
    const href = a.href;
    if (text && href && !href.startsWith("javascript:") && text.length < 100) {
      links.push({ text, href });
    }
    if (links.length >= 20) break;
  }
  return links;
}

function cleanText(text, maxLength) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function getElementText(root, maxLength) {
  if (!root) return "";
  const parts = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (!parent || !isVisibleElement(parent)) return NodeFilter.FILTER_REJECT;
        return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }

      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        const tag = el.tagName?.toLowerCase();
        if (["script", "style", "noscript", "svg", "canvas"].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }
        return isVisibleElement(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_REJECT;
    },
  });

  let node;
  while ((node = walker.nextNode())) {
    if (parts.join(" ").length >= maxLength) break;
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent.trim());
      continue;
    }

    const el = node;
    const tag = el.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") {
      const value = el.value || el.placeholder || el.getAttribute("aria-label");
      if (value) parts.push(value);
    } else {
      const aria = el.getAttribute("aria-label");
      const title = el.getAttribute("title");
      if (aria) parts.push(aria);
      if (title && title !== aria) parts.push(title);
    }
  }

  return cleanText(parts.join("\n"), maxLength);
}

function isVisibleElement(el) {
  if (!el || !(el instanceof Element)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

let inspectState = null;

function enterInspectMode() {
  if (inspectState) return;

  const isZh = (navigator.language || "").toLowerCase().startsWith("zh");
  const t = (zh, en) => (isZh ? zh : en);

  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });

  const glass = document.createElement("div");
  glass.style.position = "fixed";
  glass.style.left = "0";
  glass.style.top = "0";
  glass.style.right = "0";
  glass.style.bottom = "0";
  glass.style.cursor = "crosshair";
  glass.style.background = "rgba(0,0,0,0.02)";
  glass.style.zIndex = "2147483645";
  glass.style.pointerEvents = "auto";

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.width = "0";
  overlay.style.height = "0";
  overlay.style.pointerEvents = "none";
  overlay.style.boxSizing = "border-box";
  overlay.style.border = "2px solid rgba(212, 165, 116, 0.9)";
  overlay.style.background = "rgba(212, 165, 116, 0.12)";
  overlay.style.borderRadius = "6px";
  overlay.style.zIndex = "2147483646";

  const bubble = document.createElement("div");
  bubble.style.position = "fixed";
  bubble.style.left = "12px";
  bubble.style.top = "12px";
  bubble.style.display = "block";
  bubble.style.zIndex = "2147483647";
  bubble.style.fontFamily =
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif';
  bubble.style.fontSize = "12px";
  bubble.style.color = "#111";

  const bubbleCard = document.createElement("div");
  bubbleCard.style.background = "rgba(255, 255, 255, 0.98)";
  bubbleCard.style.border = "1px solid rgba(0,0,0,0.12)";
  bubbleCard.style.borderRadius = "10px";
  bubbleCard.style.padding = "10px";
  bubbleCard.style.minWidth = "220px";
  bubbleCard.style.boxShadow = "0 10px 30px rgba(0,0,0,0.18)";
  bubbleCard.style.pointerEvents = "auto";

  const bubbleTitle = document.createElement("div");
  bubbleTitle.textContent = t(
    "选择页面元素以检查",
    "Select an element in the page to inspect it"
  );
  bubbleTitle.style.fontWeight = "600";
  bubbleTitle.style.marginBottom = "8px";

  const bubbleActions = document.createElement("div");
  bubbleActions.style.display = "flex";
  bubbleActions.style.gap = "8px";
  bubbleActions.style.justifyContent = "flex-end";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = t("添加到对话", "Add to chat");
  addBtn.disabled = true;
  addBtn.style.border = "0";
  addBtn.style.borderRadius = "8px";
  addBtn.style.padding = "6px 10px";
  addBtn.style.background = "rgb(212,165,116)";
  addBtn.style.color = "#111";
  addBtn.style.cursor = "pointer";
  addBtn.style.opacity = "0.5";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = t("取消", "Cancel");
  cancelBtn.style.border = "1px solid rgba(0,0,0,0.12)";
  cancelBtn.style.borderRadius = "8px";
  cancelBtn.style.padding = "6px 10px";
  cancelBtn.style.background = "transparent";
  cancelBtn.style.color = "#111";
  cancelBtn.style.cursor = "pointer";

  bubbleActions.appendChild(cancelBtn);
  bubbleActions.appendChild(addBtn);
  bubbleCard.appendChild(bubbleTitle);
  bubbleCard.appendChild(bubbleActions);
  bubble.appendChild(bubbleCard);

  root.appendChild(glass);
  root.appendChild(overlay);
  root.appendChild(bubble);
  document.documentElement.appendChild(host);

  const state = {
    host,
    glass,
    overlay,
    bubble,
    addBtn,
    cancelBtn,
    hoveredEl: null,
    selectedEl: null,
  };

  const setOverlayForElement = (el) => {
    if (!el || el === document.documentElement || el === document.body) {
      overlay.style.width = "0";
      overlay.style.height = "0";
      return;
    }
    const rect = el.getBoundingClientRect();
    overlay.style.left = `${Math.max(0, rect.left)}px`;
    overlay.style.top = `${Math.max(0, rect.top)}px`;
    overlay.style.width = `${Math.max(0, rect.width)}px`;
    overlay.style.height = `${Math.max(0, rect.height)}px`;
  };

  const positionBubbleNearElement = (el) => {
    const rect = el.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - 8 - 240
    );
    const top = Math.min(
      Math.max(8, rect.bottom + 8),
      window.innerHeight - 8 - 60
    );
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  };

  const onMove = (e) => {
    if (state.selectedEl) return;
    const prevPointerEvents = glass.style.pointerEvents;
    glass.style.pointerEvents = "none";
    const target = document.elementFromPoint(e.clientX, e.clientY);
    glass.style.pointerEvents = prevPointerEvents;
    if (!(target instanceof Element)) return;
    if (target === host) return;
    state.hoveredEl = target;
    setOverlayForElement(target);
  };

  const onClick = (e) => {
    if (state.selectedEl) return;
    const prevPointerEvents = glass.style.pointerEvents;
    glass.style.pointerEvents = "none";
    const target = document.elementFromPoint(e.clientX, e.clientY);
    glass.style.pointerEvents = prevPointerEvents;
    if (!(target instanceof Element)) return;
    if (target === host) return;
    state.selectedEl = target;
    setOverlayForElement(target);
    positionBubbleNearElement(target);
    addBtn.disabled = false;
    addBtn.style.opacity = "1";
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      exitInspectMode();
    }
  };

  const onAdd = () => {
    if (!state.selectedEl) return;
    const el = state.selectedEl;
    const selector = getStableSelector(el);
    const rect = el.getBoundingClientRect();
    const boundingRect = {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    const pagePath = buildPagePath(el);
    const nearbyText = buildNearbyText(el);
    const preview = buildPreview(el, selector, boundingRect);
    const elementStructure = buildElementStructure(el);
    const elementText = extractElementText(el);
    chrome.runtime.sendMessage({
      type: "inspect-element-selected",
      payload: { selector, elementStructure, elementText, preview, boundingRect, pagePath, nearbyText },
    });
    exitInspectMode();
  };

  const onCancel = () => exitInspectMode();

  state.addBtn.addEventListener("click", onAdd);
  state.cancelBtn.addEventListener("click", onCancel);

  state.glass.addEventListener("mousemove", onMove);
  state.glass.addEventListener("click", onClick);
  window.addEventListener("keydown", onKeyDown, true);
  const previousCursor = document.documentElement.style.cursor;
  document.documentElement.style.cursor = "crosshair";

  inspectState = {
    state,
    onMove,
    onClick,
    onKeyDown,
    onAdd,
    onCancel,
    previousCursor,
  };
}

function exitInspectMode() {
  if (!inspectState) return;
  const { state, onMove, onClick, onKeyDown, previousCursor } = inspectState;
  state.glass.removeEventListener("mousemove", onMove);
  state.glass.removeEventListener("click", onClick);
  window.removeEventListener("keydown", onKeyDown, true);
  document.documentElement.style.cursor = previousCursor || "";
  state.host.remove();
  inspectState = null;
  chrome.runtime.sendMessage({ type: "inspect-mode-exited" });
}

function buildElementStructure(el, depth, maxDepth) {
  if (depth === undefined) depth = 0;
  if (maxDepth === undefined) maxDepth = 8;
  if (!el || depth > maxDepth) return "";
  var indent = "  ".repeat(depth);
  var tag = el.tagName.toLowerCase();
  var attrs = "";
  if (el.id) attrs += " #" + el.id;
  if (el.classList && el.classList.length) {
    attrs += " ." + Array.from(el.classList).slice(0, 3).join(".");
  }
  if (tag !== "div") {
    attrs += " [" + tag + "]";
    tag = "div";
  }
  var line = indent + "<" + tag + attrs + ">";
  var children = [];
  for (var i = 0; i < el.children.length; i++) {
    var child = el.children[i];
    if (child.nodeType !== 1) continue;
    var childTag = child.tagName.toLowerCase();
    if (childTag === "script" || childTag === "style" || childTag === "noscript") continue;
    var childStr = buildElementStructure(child, depth + 1, maxDepth);
    if (childStr) children.push(childStr);
  }
  if (children.length === 0) return line;
  return line + "\n" + children.join("\n");
}

function extractElementText(el) {
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  var parts = [];
  var node;
  while ((node = walker.nextNode())) {
    var text = node.textContent.trim();
    if (text) parts.push(text);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 5000);
}

function buildPreview(el, selector, rect) {
  const tag = (el.tagName || "element").toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const classList = (el.classList && el.classList.length)
    ? `.${Array.from(el.classList).slice(0, 2).join(".")}`
    : "";
  const pos = rect ? ` at (${rect.left}, ${rect.top}) ${rect.width}x${rect.height}` : "";
  return `<${tag}${id}${classList}>${pos}`;
}

function buildPagePath(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      part += `#${node.id}`;
    } else if (node.classList && node.classList.length) {
      const cls = Array.from(node.classList).slice(0, 2).join(".");
      if (cls) part += `.${cls}`;
    }
    parts.unshift(part);
    if (node.id) break;
    if (parts.length >= 6) break;
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function buildNearbyText(el) {
  const parent = el.parentElement;
  if (!parent) return "";
  const text = (parent.textContent || "").replace(/\s+/g, " ").trim();
  return text.length > 200 ? text.slice(0, 200) + "..." : text;
}

function getStableSelector(el) {
  if (!(el instanceof Element)) return "";
  if (el.id) return `#${cssEscape(el.id)}`;
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    let part = node.tagName.toLowerCase();
    const classes = Array.from(node.classList || [])
      .filter((c) => c && c.length < 40)
      .slice(0, 2)
      .map(cssEscape);
    if (classes.length) {
      part += `.${classes.join(".")}`;
    }
    const parent = node.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === node.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(node) + 1;
        part += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(part);
    if (node.id) break;
    if (parts.length >= 5) break;
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") {
    return window.CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_\-]/g, "\\$&");
}

// ── Area Screenshot Mode ─────────────────────────────────────

let screenshotState = null;

function enterScreenshotMode() {
  if (screenshotState) return;
  // Exit inspect mode if active
  if (inspectState) exitInspectMode();

  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "closed" });

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;left:0;top:0;right:0;bottom:0;cursor:crosshair;" +
    "background:rgba(0,0,0,0.15);z-index:2147483645;pointer-events:auto;";

  const hint = document.createElement("div");
  hint.style.cssText =
    "position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;" +
    "background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:8px;" +
    "font:13px -apple-system,sans-serif;pointer-events:none;white-space:nowrap;";
  const isZh = (navigator.language || "").toLowerCase().startsWith("zh");
  hint.textContent = isZh
    ? "拖拽选择截图区域，按 Esc 取消"
    : "Drag to select area, Esc to cancel";

  const selRect = document.createElement("div");
  selRect.style.cssText =
    "position:fixed;pointer-events:none;z-index:2147483646;" +
    "border:2px solid #4af;background:rgba(68,170,255,0.15);display:none;";

  root.appendChild(overlay);
  root.appendChild(selRect);
  root.appendChild(hint);
  document.documentElement.appendChild(host);

  let startX = 0, startY = 0;
  let dragging = false;

  const onDown = (e) => {
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;
    selRect.style.display = "block";
    updateRect(e.clientX, e.clientY);
  };

  const onMove = (e) => {
    if (!dragging) return;
    updateRect(e.clientX, e.clientY);
  };

  const updateRect = (curX, curY) => {
    const x = Math.min(startX, curX);
    const y = Math.min(startY, curY);
    const w = Math.abs(curX - startX);
    const h = Math.abs(curY - startY);
    selRect.style.left = x + "px";
    selRect.style.top = y + "px";
    selRect.style.width = w + "px";
    selRect.style.height = h + "px";
  };

  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    exitScreenshotMode();
    if (w > 10 && h > 10) {
      chrome.runtime.sendMessage({
        type: "screenshot-area-selected",
        payload: { x, y, width: w, height: h },
      });
    }
  };

  const onKey = (e) => {
    if (e.key === "Escape") exitScreenshotMode();
  };

  overlay.addEventListener("mousedown", onDown);
  overlay.addEventListener("mousemove", onMove);
  overlay.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", onKey, true);

  screenshotState = { host, overlay, selRect, hint, onDown, onMove, onUp, onKey };
}

function exitScreenshotMode() {
  // Clean up any existing preview overlay
  document.querySelectorAll('[data-screenshot-preview="true"]').forEach((el) => el.remove());
  if (!screenshotState) return;
  const { host, overlay, onDown, onMove, onUp, onKey } = screenshotState;
  overlay.removeEventListener("mousedown", onDown);
  overlay.removeEventListener("mousemove", onMove);
  overlay.removeEventListener("mouseup", onUp);
  window.removeEventListener("keydown", onKey, true);
  host.remove();
  screenshotState = null;
}
