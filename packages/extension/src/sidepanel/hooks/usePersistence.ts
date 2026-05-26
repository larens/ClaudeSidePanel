import { useEffect } from "react";
import { useChatStore } from "@/sidepanel/stores/chatStore";
import { useSessionStore } from "@/sidepanel/stores/sessionStore";
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

  // Persist messages whenever they change
  useEffect(() => {
    if (!activeSessionId || messages.length === 0) return;
    const key = MSG_PREFIX + activeSessionId;
    try {
      chrome.storage.local.set({ [key]: messages });
    } catch {
      // chrome.storage not available in dev
    }
  }, [messages, activeSessionId]);

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
        loadMessages(saved);
      });
    } catch {
      loadMessages([]);
    }
  }, [activeSessionId, loadMessages]);
}
