import { create } from "zustand";
import { bridgeClient } from "@/lib/bridge-client";
import type { SessionInfo } from "@/lib/protocol";

interface WorkspaceSessionState {
  sessionIds: string[];
  activeSessionId: string | null;
}

interface SessionStore {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  isLoading: boolean;
  workspaceSessions: Record<string, WorkspaceSessionState>;

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
}

const STORAGE_KEY = "claudeweb_sessions";
const ACTIVE_KEY = "claudeweb_active_session";
const WORKSPACE_KEY = "claudeweb_workspace_sessions";

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isLoading: false,
  workspaceSessions: {},

  loadState: async () => {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEY,
        ACTIVE_KEY,
        WORKSPACE_KEY,
      ]);
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
    try {
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
    } catch (err) {
      console.error("Failed to create session:", err);
      return null;
    }
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
