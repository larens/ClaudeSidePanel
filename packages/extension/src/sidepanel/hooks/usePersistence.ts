import { useEffect, useRef } from "react";
import { useChatStore } from "@/sidepanel/stores/chatStore";
import { useSessionStore } from "@/sidepanel/stores/sessionStore";
import { useHistoryStore } from "@/sidepanel/stores/historyStore";
import type { Message } from "@/lib/protocol";

const MSG_PREFIX = "claudeweb_messages_";

/**
 * Auto-persist chat messages to chrome.storage whenever they change.
 * Loads saved messages on session switch.
 */
export function usePersistence() {
  const messages = useChatStore((s) => s.messages);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist messages — debounced during streaming, immediate when done
  useEffect(() => {
    if (!activeSessionId || messages.length === 0) return;
    const key = MSG_PREFIX + activeSessionId;

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }

    if (!isStreaming) {
      try {
        chrome.storage.local.set({ [key]: messages });
      } catch {
        // chrome.storage not available in dev
      }
      return;
    }

    // During streaming, debounce at 500ms
    persistTimerRef.current = setTimeout(() => {
      try {
        chrome.storage.local.set({ [key]: messages });
      } catch {
        // ignore
      }
    }, 500);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, [messages, activeSessionId, isStreaming]);

  // Track which history sessions have been loaded to avoid re-loading
  const loadedHistoryRef = useRef(new Set<string>());

  // Load messages when session changes
  useEffect(() => {
    if (!activeSessionId) {
      loadMessages([]);
      return;
    }
    const key = MSG_PREFIX + activeSessionId;
    try {
      chrome.storage.local.get(key).then((result) => {
        const saved: Message[] = result[key] ?? [];
        if (saved.length > 0) {
          loadMessages(saved);
        } else {
          // No persisted messages — check if this is a history session
          const session = useSessionStore
            .getState()
            .sessions.find((s) => s.id === activeSessionId);
          if (
            session?.source === "history" &&
            !loadedHistoryRef.current.has(activeSessionId)
          ) {
            loadedHistoryRef.current.add(activeSessionId);
            // Load messages from history
            const encodedPath = session.workspaceId
              ?.replace("ws_history_", "");
            if (encodedPath) {
              useHistoryStore
                .getState()
                .loadSession(encodedPath, activeSessionId)
                .then((msgs) => {
                  if (msgs.length > 0) loadMessages(msgs);
                });
            }
          } else {
            loadMessages([]);
          }
        }
      });
    } catch {
      loadMessages([]);
    }
  }, [activeSessionId, loadMessages]);
}
