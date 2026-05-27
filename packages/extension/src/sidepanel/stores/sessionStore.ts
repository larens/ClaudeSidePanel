import { create } from "zustand";
import { bridgeClient } from "@/lib/bridge-client";
import { useChatStore } from "./chatStore";
import type {
  SessionInfo,
  HistorySessionMeta,
  SessionLoadHistoryPayload,
  HistoryMessage,
} from "@/lib/protocol";

interface WorkspaceSessionState {
  sessionIds: string[];
  activeSessionId: string | null;
}

interface SessionStore {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  isLoading: boolean;
  workspaceSessions: Record<string, WorkspaceSessionState>;
  hiddenSessionIds: string[];

  // Actions
  loadState: () => Promise<void>;
  fetchSessions: () => Promise<SessionInfo[]>;
  createSession: (options?: {
    cwd?: string;
    workspaceId?: string;
  }) => Promise<string | null>;
  ensureWorkspaceSession: (
    workspaceId: string,
    cwd: string
  ) => Promise<string | null>;
  setActiveWorkspaceSession: (workspaceId: string) => void;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  removeWorkspaceSessions: (workspaceId: string) => Promise<void>;
  setActiveSession: (sessionId: string | null) => void;
  hideSession: (sessionId: string) => Promise<void>;
  loadHistoryProject: (encodedPath: string, projectName: string) => Promise<void>;
  activateHistorySession: (sessionId: string, cwd: string, projectPath: string) => Promise<void>;
}

const STORAGE_KEY = "claudeweb_sessions";
const ACTIVE_KEY = "claudeweb_active_session";
const WORKSPACE_KEY = "claudeweb_workspace_sessions";
const HIDDEN_SESSIONS_KEY = "claudeweb_hidden_sessions";

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isLoading: false,
  workspaceSessions: {},
  hiddenSessionIds: [],

  loadState: async () => {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEY,
        ACTIVE_KEY,
        WORKSPACE_KEY,
        HIDDEN_SESSIONS_KEY,
      ]);
      set({
        hiddenSessionIds: result[HIDDEN_SESSIONS_KEY] ?? [],
      });
      set({
        sessions: result[STORAGE_KEY] ?? [],
        activeSessionId: result[ACTIVE_KEY] ?? null,
        workspaceSessions: result[WORKSPACE_KEY] ?? {},
      });
    } catch {
      // chrome.storage might not be available in dev
    }
  },

  fetchSessions: async () => {
    set({ isLoading: true });
    try {
      const sessions = await bridgeClient.send<SessionInfo[]>(
        "session",
        "session.list",
        {}
      );
      set({ isLoading: false });
      return sessions;
    } catch {
      set({ isLoading: false });
      return [];
    }
  },

  createSession: async (options) => {
    const session = await bridgeClient.send<SessionInfo>(
      "session",
      "session.create",
      {
        cwd: options?.cwd ?? "~",
        workspaceId: options?.workspaceId,
      }
    );
    const nextSessions = [...get().sessions.filter((item) => item.id !== session.id), session];
    const nextWorkspaceSessions = { ...get().workspaceSessions };

    if (options?.workspaceId) {
      const existing = nextWorkspaceSessions[options.workspaceId] ?? {
        sessionIds: [],
        activeSessionId: null,
      };
      nextWorkspaceSessions[options.workspaceId] = {
        sessionIds: [...existing.sessionIds.filter((id) => id !== session.id), session.id],
        activeSessionId: session.id,
      };
    }

    set({
      sessions: nextSessions,
      activeSessionId: session.id,
      workspaceSessions: nextWorkspaceSessions,
    });
    await saveToStorage(nextSessions, session.id, nextWorkspaceSessions);
    return session.id;
  },

  ensureWorkspaceSession: async (workspaceId, cwd) => {
    const mapping = get().workspaceSessions[workspaceId];
    const activeSessionId = mapping?.activeSessionId ?? null;
    const existingSession = activeSessionId
      ? get().sessions.find((item) => item.id === activeSessionId)
      : null;

    if (existingSession) {
      set({ activeSessionId: existingSession.id });
      await saveToStorage(
        get().sessions,
        existingSession.id,
        get().workspaceSessions
      );
      return existingSession.id;
    }

    return get().createSession({ cwd, workspaceId });
  },

  setActiveWorkspaceSession: (workspaceId) => {
    const sessionId = get().workspaceSessions[workspaceId]?.activeSessionId ?? null;
    set({ activeSessionId: sessionId });
  },

  switchSession: (sessionId) => {
    const session = get().sessions.find((item) => item.id === sessionId);
    const nextWorkspaceSessions = { ...get().workspaceSessions };

    if (session?.workspaceId) {
      const existing = nextWorkspaceSessions[session.workspaceId] ?? {
        sessionIds: [],
        activeSessionId: null,
      };
      nextWorkspaceSessions[session.workspaceId] = {
        sessionIds: [...existing.sessionIds.filter((id) => id !== sessionId), sessionId],
        activeSessionId: sessionId,
      };
    }

    // Persist current session's messages before switching
    const prevId = get().activeSessionId;
    if (prevId) {
      try {
        const msgs = useChatStore.getState().messages;
        if (msgs.length > 0) {
          chrome.storage.local.set({ [`claudeweb_messages_${prevId}`]: msgs });
        }
      } catch {
        // ignore
      }
    }

    set({ activeSessionId: sessionId, workspaceSessions: nextWorkspaceSessions });
    void saveToStorage(get().sessions, sessionId, nextWorkspaceSessions);
  },

  deleteSession: async (sessionId) => {
    try {
      await bridgeClient.send("session", "session.delete", { sessionId });
    } catch {
      // Continue even if bridge delete fails
    }
    const remaining = get().sessions.filter((s) => s.id !== sessionId);
    const newActive =
      get().activeSessionId === sessionId
        ? remaining[0]?.id ?? null
        : get().activeSessionId;
    const nextWorkspaceSessions = { ...get().workspaceSessions };

    for (const [workspaceId, state] of Object.entries(nextWorkspaceSessions)) {
      if (!state.sessionIds.includes(sessionId)) continue;
      const sessionIds = state.sessionIds.filter((id) => id !== sessionId);
      nextWorkspaceSessions[workspaceId] = {
        sessionIds,
        activeSessionId:
          state.activeSessionId === sessionId ? sessionIds[0] ?? null : state.activeSessionId,
      };
    }

    set({
      sessions: remaining,
      activeSessionId: newActive,
      workspaceSessions: nextWorkspaceSessions,
    });
    await saveToStorage(remaining, newActive, nextWorkspaceSessions);
  },

  removeWorkspaceSessions: async (workspaceId) => {
    const mapping = get().workspaceSessions[workspaceId];
    if (!mapping) return;

    const sessionIds = new Set(mapping.sessionIds);
    const remainingSessions = get().sessions.filter((session) => !sessionIds.has(session.id));
    const nextWorkspaceSessions = { ...get().workspaceSessions };
    delete nextWorkspaceSessions[workspaceId];

    const activeSessionId = sessionIds.has(get().activeSessionId ?? "")
      ? null
      : get().activeSessionId;

    set({
      sessions: remainingSessions,
      activeSessionId,
      workspaceSessions: nextWorkspaceSessions,
    });
    await saveToStorage(remainingSessions, activeSessionId, nextWorkspaceSessions);
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId });
  },

  hideSession: async (sessionId) => {
    const next = [...get().hiddenSessionIds, sessionId];
    set({ hiddenSessionIds: next });
    try {
      await chrome.storage.local.set({ [HIDDEN_SESSIONS_KEY]: next });
    } catch {
      // chrome.storage not available in dev
    }
  },

  loadHistoryProject: async (encodedPath, projectName) => {
    const workspaceId = `ws_history_${encodedPath}`;
    try {
      const historySessions = await bridgeClient.send<HistorySessionMeta[]>(
        "history",
        "history.list-sessions",
        { projectPath: encodedPath }
      );

      // Convert history sessions to SessionInfo
      const decodedPath = "/" + encodedPath.slice(1).replace(/-/g, "/");
      const sessions: SessionInfo[] = historySessions.map((hs) => ({
        id: hs.sessionId,
        cwd: decodedPath,
        workspaceId,
        createdAt: hs.timestamp,
        messageCount: hs.messageCount,
        source: "history" as const,
        title: hs.title,
      }));

      // Upsert into session store
      const existing = get().sessions.filter((s) => s.workspaceId !== workspaceId);
      const nextSessions = [...existing, ...sessions];

      const nextWorkspaceSessions = { ...get().workspaceSessions };
      nextWorkspaceSessions[workspaceId] = {
        sessionIds: sessions.map((s) => s.id),
        activeSessionId: sessions[0]?.id ?? null,
      };

      set({
        sessions: nextSessions,
        activeSessionId: sessions[0]?.id ?? null,
        workspaceSessions: nextWorkspaceSessions,
      });

      // Persist the workspace entry
      const { workspaces, recentWorkspaceIds } = await chrome.storage.local
        .get("claudeweb_workspaces")
        .then((r) => r["claudeweb_workspaces"] ?? { workspaces: [], recentWorkspaceIds: [] })
        .catch(() => ({ workspaces: [], recentWorkspaceIds: [] }));

      const wsExists = workspaces.some((w: { id: string }) => w.id === workspaceId);
      const newWorkspace = {
        id: workspaceId,
        name: projectName,
        path: decodedPath,
        addedAt: Date.now(),
        lastUsedAt: Date.now(),
        status: "ready" as const,
      };

      const updatedWorkspaces = wsExists
        ? workspaces.map((w: { id: string }) => w.id === workspaceId ? { ...w, lastUsedAt: Date.now() } : w)
        : [...workspaces, newWorkspace];

      const updatedRecent = [
        workspaceId,
        ...recentWorkspaceIds.filter((id: string) => id !== workspaceId),
      ].slice(0, 10);

      await chrome.storage.local.set({
        claudeweb_workspaces: {
          workspaces: updatedWorkspaces,
          activeWorkspaceId: workspaceId,
          recentWorkspaceIds: updatedRecent,
        },
      });

      // Sync workspaceStore in-memory state
      const { useWorkspaceStore } = await import("./workspaceStore");
      useWorkspaceStore.setState({
        workspaces: updatedWorkspaces,
        activeWorkspaceId: workspaceId,
        recentWorkspaceIds: updatedRecent,
      });

      await saveToStorage(nextSessions, sessions[0]?.id ?? null, nextWorkspaceSessions);
    } catch (err) {
      console.error("Failed to load history project:", err);
    }
  },

  activateHistorySession: async (sessionId, cwd, projectPath) => {
    try {
      // Create a live CLISession on the bridge pre-seeded with --resume
      await bridgeClient.send("session", "session.load-history", {
        sessionId,
        cwd,
        projectPath,
      } as SessionLoadHistoryPayload);

      // Load messages from history
      const detail = await bridgeClient.send<{ messages: HistoryMessage[] }>(
        "history",
        "history.get-session",
        { projectPath, sessionId }
      );

      // Convert and load into chat store
      const { useChatStore } = await import("./chatStore");
      const messages = detail.messages.map((hm) => ({
        id: `hist_${hm.uuid}`,
        role: hm.role,
        content: hm.content,
        timestamp: new Date(hm.timestamp).getTime() || Date.now(),
        thinking: hm.thinking,
        toolCalls: hm.toolCalls,
      }));
      useChatStore.getState().loadMessages(messages);

      // Set as active session
      set({ activeSessionId: sessionId });
      const nextWorkspaceSessions = { ...get().workspaceSessions };
      for (const [wsId, state] of Object.entries(nextWorkspaceSessions)) {
        if (state.sessionIds.includes(sessionId)) {
          nextWorkspaceSessions[wsId] = { ...state, activeSessionId: sessionId };
        }
      }
      set({ workspaceSessions: nextWorkspaceSessions });
      await saveToStorage(get().sessions, sessionId, nextWorkspaceSessions);
    } catch (err) {
      console.error("Failed to activate history session:", err);
    }
  },
}));

// ── Storage helpers ───────────────────────────────────────

async function saveToStorage(
  sessions: SessionInfo[],
  activeId: string | null,
  workspaceSessions: Record<string, WorkspaceSessionState>
) {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: sessions,
      [ACTIVE_KEY]: activeId,
      [WORKSPACE_KEY]: workspaceSessions,
    });
  } catch {
    // chrome.storage might not be available in dev
  }
}
