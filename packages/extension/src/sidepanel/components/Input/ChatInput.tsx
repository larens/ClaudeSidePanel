import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useChatStore } from "@/sidepanel/stores/chatStore";
import { useConnectionStore } from "@/sidepanel/stores/connectionStore";
import { useSessionStore } from "@/sidepanel/stores/sessionStore";
import { useWorkspaceStore } from "@/sidepanel/stores/workspaceStore";
import { bridgeClient } from "@/lib/bridge-client";
import type { FileWritePayload, ToolCallInfo } from "@/lib/protocol";

function extractTag(text: string): string {
  // Extract tag name from selector like "#id > div.class" or preview like "<button.btn …>"
  const tagMatch = text.match(/<(\w[\w-]*)/);
  if (tagMatch) return `<${tagMatch[1]}>`;
  const selMatch = text.match(/(?:^|>\s*)(\w[\w-]*)/);
  if (selMatch) return `<${selMatch[1]}>`;
  return "<el>";
}

export function ChatInput() {
  const isZh = navigator.language?.toLowerCase().startsWith("zh");
  const t = useCallback(
    (zh: string, en: string) => (isZh ? zh : en),
    [isZh]
  );

  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechRef = useRef<unknown>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const inspectSnippetsRef = useRef(
    new Map<string, { selector: string; outerHTML: string; preview: string }>()
  );
  const {
    addUserMessage,
    startAssistantMessage,
    appendText,
    appendThinking,
    upsertToolCall,
    completeMessage,
    isStreaming,
  } = useChatStore();
  const connectionState = useConnectionStore((s) => s.state);
  const { ensureWorkspaceSession, activeSessionId } = useSessionStore();
  const { activeWorkspaceId, workspaces } = useWorkspaceStore();

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const canUseWorkspace =
    connectionState === "connected" &&
    Boolean(activeWorkspace) &&
    activeWorkspace?.status === "ready";
  const canSend = canUseWorkspace && !isStreaming;

  const doSend = useCallback(
    async (text: string, contextPrefix?: string) => {
      if (!activeWorkspace) {
        useChatStore
          .getState()
          .addSystemMessage(t("请先选择一个工作区", "Please select a workspace first"));
        return;
      }
      if (activeWorkspace.status !== "ready") {
        useChatStore.getState().addSystemMessage(
          t(
            "当前工作区不可用，请刷新或选择其他文件夹",
            "The selected workspace is unavailable. Refresh it or choose another folder."
          )
        );
        return;
      }

      addUserMessage(text);

      const sessionId = await ensureWorkspaceSession(
        activeWorkspace.id,
        activeWorkspace.path
      );
      if (!sessionId) {
        useChatStore
          .getState()
          .addSystemMessage(t("创建会话失败", "Failed to create session"));
        return;
      }

      const assistantId = startAssistantMessage();

      bridgeClient.sendStream(
        "chat",
        "chat.send",
        {
          sessionId,
          message: text,
          contextPrefix,
          cwd: activeWorkspace.path,
          workspaceId: activeWorkspace.id,
        },
        (msg) => {
          const payload = msg.payload as {
            delta?: string;
            blockType?: string;
            toolCall?: ToolCallInfo;
          };

          if (payload.blockType === "thinking" && payload.delta) {
            appendThinking(assistantId, payload.delta);
          } else if (payload.blockType === "text" && payload.delta) {
            appendText(assistantId, payload.delta);
          }

          if (payload.toolCall) {
            upsertToolCall(assistantId, payload.toolCall);
          }
        },
        (msg) => {
          const result = msg.payload as { text?: string };
          if (result?.text) {
            const current = useChatStore.getState().messages.find((m) => m.id === assistantId);
            if (!current?.content) {
              appendText(assistantId, result.text);
            }
          }
          completeMessage(assistantId);
        },
        (error) => {
          appendText(assistantId, `\n\n> Error: ${error.message}`);
          completeMessage(assistantId);
        }
      );
    },
    [
      activeWorkspace,
      addUserMessage,
      startAssistantMessage,
      appendText,
      appendThinking,
      upsertToolCall,
      completeMessage,
      ensureWorkspaceSession,
      t,
    ]
  );

  const expandInspectSnippets = useCallback((text: string) => {
    return text.replace(/<<i:([a-z0-9]+)>>\S*/gi, (_match, id) => {
      const data = inspectSnippetsRef.current.get(String(id));
      if (!data) return "";
      const selectorLine = data.selector ? `Selector: ${data.selector}\n` : "";
      return `[Selected element]\n${selectorLine}HTML:\n\`\`\`html\n${data.outerHTML}\n\`\`\``;
    });
  }, []);

  const getActiveTabId = useCallback(async () => {
    const tab = await new Promise<chrome.tabs.Tab | null>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs?.[0] ?? null);
      });
    });
    return tab?.id ?? null;
  }, []);

  const toggleInspectMode = useCallback(async () => {
    const tabId = await getActiveTabId();
    if (!tabId) {
      useChatStore
        .getState()
        .addSystemMessage(t("未找到可用的浏览器标签页", "No active tab found"));
      setIsInspecting(false);
      return;
    }
    const next = !isInspecting;
    const result = await new Promise<{
      ok: boolean;
      error?: string;
    }>((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        { type: "inspect-mode", action: next ? "enter" : "exit" },
        (resp) => {
          const err = chrome.runtime.lastError?.message;
          if (err) {
            resolve({ ok: false, error: err });
            return;
          }
          resolve({ ok: Boolean((resp as any)?.ok) });
        }
      );
    });

    if (!result.ok) {
      const hint = t(
        "启动检查模式，请刷新当前网页后重试",
        "To start inspect mode, please refresh the page and try again"
      );
      useChatStore
        .getState()
        .addSystemMessage(
          result.error ? `${hint}（${result.error}）` : hint
        );
      setIsInspecting(false);
      return;
    }

    setIsInspecting(next);
  }, [getActiveTabId, isInspecting, t]);

  useEffect(() => {
    const handler = (msg: any) => {
      if (msg?.type === "inspect-mode-exited") {
        setIsInspecting(false);
        return;
      }
      if (msg?.type !== "inspect-element-selected") return;
      const payload = msg?.payload as
        | { selector: string; outerHTML: string; preview: string }
        | undefined;
      if (!payload?.outerHTML) return;
      const id = Math.random().toString(36).slice(2, 8);
      inspectSnippetsRef.current.set(id, {
        selector: payload.selector ?? "",
        outerHTML: payload.outerHTML,
        preview: payload.preview ?? "",
      });
      const tag = extractTag(payload.selector || payload.preview || "");
      const line = `<<i:${id}>>${tag}`;
      setMessage((m) => `${m}${m ? "\n" : ""}${line}`);
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.style.height = "auto";
          textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
          textarea.focus();
        }
      }, 50);
      setIsInspecting(false);
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const stopCurrent = useCallback(async () => {
    if (!isStreaming) {
      useChatStore
        .getState()
        .addSystemMessage(t("当前没有可停止的任务", "No running task to stop"));
      return;
    }

    const store = useChatStore.getState();
    const assistantId = store.currentAssistantId;
    if (assistantId) {
      store.appendText(assistantId, "\n\n> Stopped");
      store.completeMessage(assistantId);
    } else {
      store.completeMessage("");
    }

    if (activeSessionId) {
      try {
        await bridgeClient.send("chat", "chat.interrupt", { sessionId: activeSessionId });
      } catch {
        // ignore
      }
    }
  }, [activeSessionId, isStreaming, t]);

  useEffect(() => {
    if (!isStreaming) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      void stopCurrent();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isStreaming, stopCurrent]);

  const writeFileToWorkspace = useCallback(
    async (relativePath: string, dataBase64: string) => {
      if (!activeWorkspace) return null;
      const payload: FileWritePayload = {
        cwd: activeWorkspace.path,
        relativePath,
        dataBase64,
      };
      try {
        const result = await bridgeClient.send<{ path: string }>(
          "file",
          "file.write",
          payload
        );
        return result.path;
      } catch {
        return null;
      }
    },
    [activeWorkspace]
  );

  const handlePickFile = useCallback(() => {
    if (!canUseWorkspace) return;
    fileInputRef.current?.click();
  }, [canUseWorkspace]);

  const handleFileChange = useCallback(async () => {
    const input = fileInputRef.current;
    if (!input?.files?.length || !activeWorkspace) return;
    const file = input.files[0];
    input.value = "";

    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!dataUrl) {
      useChatStore
        .getState()
        .addSystemMessage(t("读取文件失败", "Failed to read file"));
      return;
    }

    const base64 = dataUrl.split(",")[1] ?? "";
    if (!base64) {
      useChatStore
        .getState()
        .addSystemMessage(t("读取文件失败", "Failed to read file"));
      return;
    }

    const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
    const relativePath = `.claudeweb/attachments/${Date.now()}-${safeName}`;
    const saved = await writeFileToWorkspace(relativePath, base64);
    if (!saved) {
      useChatStore
        .getState()
        .addSystemMessage(
          t("保存附件到工作区失败", "Failed to save file into workspace")
        );
      return;
    }

    setMessage((m) => `${m}${m ? "\n" : ""}${saved}`);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [activeWorkspace, writeFileToWorkspace, t]);

  const handleScreenshot = useCallback(async () => {
    if (!canUseWorkspace || !activeWorkspace) return;
    try {
      const response = await new Promise<{
        ok: boolean;
        dataUrl?: string;
        error?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage({ type: "capture-visible-tab" }, resolve);
      });
      if (!response?.ok || !response.dataUrl) {
        throw new Error(response?.error ?? "Capture failed");
      }
      const dataUrl = response.dataUrl;

      const base64 = dataUrl.split(",")[1] ?? "";
      if (!base64) throw new Error("Capture failed");

      const relativePath = `.claudeweb/attachments/${Date.now()}-screenshot.png`;
      const saved = await writeFileToWorkspace(relativePath, base64);
      if (!saved) throw new Error("Failed to save screenshot");

      setMessage((m) => `${m}${m ? "\n" : ""}${saved}`);
      setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Capture failed";
      useChatStore
        .getState()
        .addSystemMessage(t(`截图失败：${msg}`, `Failed to capture screenshot: ${msg}`));
    }
  }, [activeWorkspace, canUseWorkspace, writeFileToWorkspace, t]);

  const handleToggleVoice = useCallback(() => {
    if (!canUseWorkspace) return;
    type SpeechCtor = new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((e: any) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const Speech =
      (window as unknown as { SpeechRecognition?: SpeechCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechCtor })
        .webkitSpeechRecognition;

    if (!Speech) {
      useChatStore
        .getState()
        .addSystemMessage(
          t("当前浏览器不支持语音识别", "Speech recognition not supported")
        );
      return;
    }

    if (!speechRef.current) {
      const rec = new Speech();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = navigator.language || "en-US";
      rec.onresult = (e: any) => {
        const transcript = String(e?.results?.[0]?.[0]?.transcript ?? "").trim();
        if (transcript) {
          setMessage((m) => (m ? `${m} ${transcript}` : transcript));
        }
      };
      rec.onend = () => setIsRecording(false);
      rec.onerror = () => setIsRecording(false);
      speechRef.current = rec;
    }

    if (isRecording) {
      (speechRef.current as any)?.stop();
      setIsRecording(false);
    } else {
      (speechRef.current as any)?.start();
      setIsRecording(true);
    }
  }, [canUseWorkspace, isRecording, t]);

  // Listen for auto-send events from context menu actions or retry
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.prompt) return;

      if (detail.autoSubmit && canSend) {
        doSend(detail.prompt);
      } else {
        setMessage(detail.prompt);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    };
    window.addEventListener("claude-web-auto-send", handler);
    return () => window.removeEventListener("claude-web-auto-send", handler);
  }, [canSend, doSend]);

  const handleSend = useCallback(() => {
    const text = message.trim();
    if (!text) return;
    if (text === "/stop") {
      setMessage("");
      void stopCurrent();
      return;
    }
    if (!canSend) return;
    setMessage("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    doSend(expandInspectSnippets(text));
  }, [message, canSend, doSend, stopCurrent, expandInspectSnippets]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && isStreaming) {
      e.preventDefault();
      void stopCurrent();
      return;
    }
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !(e.nativeEvent as unknown as { isComposing?: boolean }).isComposing
    ) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  return (
    <div className="shrink-0 border-t border-claude-border">
      <div className="px-3 py-2">
        <div className="border border-claude-border rounded-xl bg-claude-surface overflow-hidden">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={
              !activeWorkspace
                ? t(
                    "选择工作区后开始对话…",
                    "Select a workspace to start chatting..."
                  )
                : activeWorkspace.status !== "ready"
                ? t(
                    "请刷新工作区或选择其他文件夹…",
                    "Refresh the workspace or choose another folder..."
                  )
                : !canSend && isStreaming
                ? t("Claude 正在思考…", "Claude is responding...")
                : connectionState !== "connected"
                ? t("正在连接本地服务…", "Connecting to bridge...")
                : t("输入消息，Enter 发送…", "Ask Claude anything...")
            }
            disabled={!canUseWorkspace}
            rows={1}
            className="w-full resize-none bg-transparent px-3.5 pt-3 pb-2 text-sm text-claude-text placeholder:text-claude-muted/60 focus:outline-none disabled:opacity-50 transition-colors"
          />
          <div className="flex items-center justify-end gap-1.5 px-2 pb-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => void toggleInspectMode()}
              className={`p-2 rounded-lg transition-colors ${
                isInspecting
                  ? "text-claude-accent border-claude-accent/40 bg-claude-accent/10"
                  : "text-claude-muted hover:text-claude-text hover:bg-claude-border/30"
              }`}
              title={t("检查元素", "Inspect element")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="7" />
                <line x1="12" y1="3" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="21" />
                <line x1="3" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="21" y2="12" />
                <circle cx="12" cy="12" r="1" fill="currentColor" />
              </svg>
            </button>
            <button
              onClick={handlePickFile}
              disabled={!canUseWorkspace}
              className="p-2 rounded-lg text-claude-muted hover:text-claude-text hover:bg-claude-border/30 disabled:opacity-40 transition-colors"
              title={t("添加附件", "Attach file")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <button
              onClick={() => void handleScreenshot()}
              disabled={!canUseWorkspace}
              className="p-2 rounded-lg text-claude-muted hover:text-claude-text hover:bg-claude-border/30 disabled:opacity-40 transition-colors"
              title={t("截图", "Screenshot")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <line x1="20" y1="4" x2="8.12" y2="15.88" />
                <line x1="20" y1="20" x2="8.12" y2="8.12" />
              </svg>
            </button>
            <button
              onClick={handleToggleVoice}
              disabled={!canUseWorkspace}
              className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
                isRecording
                  ? "text-claude-accent border-claude-accent/40 bg-claude-accent/10"
                  : "text-claude-muted hover:text-claude-text hover:bg-claude-border/30"
              }`}
              title={t("语音输入", "Voice input")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
            <button
              onClick={isStreaming ? () => void stopCurrent() : handleSend}
              disabled={isStreaming ? !canUseWorkspace : !message.trim() || !canSend}
              className="p-2 rounded-lg bg-claude-accent text-claude-bg hover:bg-claude-accent-hover disabled:opacity-30 disabled:hover:bg-claude-accent transition-colors"
              title={isStreaming ? t("停止", "Stop") : t("发送", "Send")}
            >
              {isStreaming ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
