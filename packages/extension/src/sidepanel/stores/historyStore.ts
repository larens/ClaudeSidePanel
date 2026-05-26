import { create } from "zustand";
import { bridgeClient } from "@/lib/bridge-client";
import type {
  HistoryProject,
  HistorySessionMeta,
  HistorySessionDetail,
  HistoryMessage,
  Message,
  ToolCallInfo,
} from "@/lib/protocol";

interface HistoryStore {
  // State
  projects: HistoryProject[];
  isLoadingProjects: boolean;
  hiddenProjectPaths: string[];

  // Actions
  loadProjects: () => Promise<void>;
  loadSession: (projectPath: string, sessionId: string) => Promise<Message[]>;
  hideProject: (encodedPath: string) => Promise<void>;
}

const HIDDEN_KEY = "claudeweb_hidden_projects";

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  projects: [],
  isLoadingProjects: false,
  hiddenProjectPaths: [],

  loadProjects: async () => {
    set({ isLoadingProjects: true });
    try {
      const [projects, hiddenResult] = await Promise.all([
        bridgeClient.send<HistoryProject[]>("history", "history.list-projects", {}),
        chrome.storage.local.get(HIDDEN_KEY).catch(() => ({ [HIDDEN_KEY]: [] })),
      ]);
      const hiddenProjectPaths: string[] = (hiddenResult as Record<string, string[]>)[HIDDEN_KEY] ?? [];
      set({ projects, hiddenProjectPaths, isLoadingProjects: false });
    } catch {
      set({ isLoadingProjects: false });
    }
  },

  hideProject: async (encodedPath) => {
    const next = [...get().hiddenProjectPaths, encodedPath];
    set({ hiddenProjectPaths: next });
    try {
      await chrome.storage.local.set({ [HIDDEN_KEY]: next });
    } catch {
      // chrome.storage not available in dev
    }
  },

  loadSession: async (projectPath: string, sessionId: string) => {
    try {
      const detail = await bridgeClient.send<HistorySessionDetail>(
        "history",
        "history.get-session",
        { projectPath, sessionId }
      );
      return convertToMessages(detail.messages);
    } catch {
      return [];
    }
  },
}));

function convertToMessages(historyMessages: HistoryMessage[]): Message[] {
  return historyMessages.map((hm) => {
    const msg: Message = {
      id: `hist_${hm.uuid}`,
      role: hm.role,
      content: hm.content,
      timestamp: new Date(hm.timestamp).getTime() || Date.now(),
    };
    if (hm.thinking) msg.thinking = hm.thinking;
    if (hm.toolCalls && hm.toolCalls.length > 0) {
      msg.toolCalls = hm.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        input: tc.input,
        output: tc.output,
        status: tc.status as ToolCallInfo["status"],
      }));
    }
    return msg;
  });
}
