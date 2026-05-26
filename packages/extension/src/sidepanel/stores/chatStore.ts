import { create } from "zustand";
import type { Message, ToolCallInfo } from "@/lib/protocol";

interface ChatStore {
  messages: Message[];
  isStreaming: boolean;
  currentAssistantId: string | null;

  addUserMessage: (content: string) => void;
  startAssistantMessage: () => string;
  appendText: (messageId: string, text: string) => void;
  appendThinking: (messageId: string, thinking: string) => void;
  upsertToolCall: (messageId: string, toolCall: Partial<ToolCallInfo> & { id: string }) => void;
  completeMessage: (messageId: string) => void;
  addSystemMessage: (content: string) => void;
  clearMessages: () => void;
  loadMessages: (messages: Message[]) => void;
}

let messageCounter = 0;

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isStreaming: false,
  currentAssistantId: null,

  addUserMessage: (content) => {
    const message: Message = {
      id: `msg_${Date.now()}_${++messageCounter}`,
      role: "user",
      content,
      timestamp: Date.now(),
    };
    set((state) => ({ messages: [...state.messages, message] }));
  },

  startAssistantMessage: () => {
    const id = `msg_${Date.now()}_${++messageCounter}`;
    const message: Message = {
      id,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
      toolCalls: [],
      thinking: "",
    };
    set((state) => ({
      messages: [...state.messages, message],
      currentAssistantId: id,
      isStreaming: true,
    }));
    return id;
  },

  appendText: (messageId, text) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, content: m.content + text } : m
      ),
    }));
  },

  appendThinking: (messageId, thinking) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId
          ? { ...m, thinking: (m.thinking ?? "") + thinking }
          : m
      ),
    }));
  },

  upsertToolCall: (messageId, toolCall) => {
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
        const existing = m.toolCalls ?? [];
        const idx = existing.findIndex((tc) => tc.id === toolCall.id);
        if (idx >= 0) {
          // Update existing tool call
          const updated = [...existing];
          updated[idx] = { ...updated[idx], ...toolCall };
          return { ...m, toolCalls: updated };
        }
        // Add new tool call
        return {
          ...m,
          toolCalls: [
            ...existing,
            {
              id: toolCall.id,
              name: toolCall.name ?? "",
              input: toolCall.input ?? {},
              output: toolCall.output,
              status: toolCall.status ?? "running",
            },
          ],
        };
      }),
    }));
  },

  completeMessage: (messageId) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, isStreaming: false } : m
      ),
      isStreaming: false,
      currentAssistantId: null,
    }));
  },

  addSystemMessage: (content) => {
    const message: Message = {
      id: `msg_${Date.now()}_${++messageCounter}`,
      role: "system",
      content,
      timestamp: Date.now(),
    };
    set((state) => ({ messages: [...state.messages, message] }));
  },

  clearMessages: () =>
    set({ messages: [], isStreaming: false, currentAssistantId: null }),

  loadMessages: (messages) => set({ messages }),
}));
