import { create } from "zustand";
import { bridgeClient } from "@/lib/bridge-client";
import type { WorkspaceInfo, WorkspaceStatus } from "@/lib/protocol";

export interface Workspace {
  id: string;
  name: string;
  path: string;
  addedAt: number;
  lastUsedAt: number;
  status: WorkspaceStatus;
}

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  recentWorkspaceIds: string[];
  isPicking: boolean;

  loadState: () => Promise<void>;
  pickWorkspace: () => Promise<Workspace | null>;
  setActiveWorkspace: (workspaceId: string | null) => Promise<void>;
  refreshWorkspace: (workspaceId: string) => Promise<void>;
  removeWorkspace: (workspaceId: string) => Promise<void>;
}

const STORAGE_KEY = "claudeweb_workspaces";

interface PersistedWorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  recentWorkspaceIds: string[];
}

function createWorkspaceId(path: string) {
  return `ws_${path}`;
}

function upsertRecent(ids: string[], workspaceId: string) {
  return [workspaceId, ...ids.filter((id) => id !== workspaceId)].slice(0, 10);
}

function persistState(state: PersistedWorkspaceState) {
  return chrome.storage.local.set({ [STORAGE_KEY]: state }).catch(() => {});
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  recentWorkspaceIds: [],
  isPicking: false,

  loadState: async () => {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const saved = result[STORAGE_KEY] as PersistedWorkspaceState | undefined;
      if (!saved) return;
      set({
        workspaces: saved.workspaces ?? [],
        activeWorkspaceId: saved.activeWorkspaceId ?? null,
        recentWorkspaceIds: saved.recentWorkspaceIds ?? [],
      });
    } catch {
      // chrome.storage not available in dev
    }
  },

  pickWorkspace: async () => {
    set({ isPicking: true });
    try {
      const picked = await bridgeClient.send<WorkspaceInfo>(
        "workspace",
        "workspace.pick",
        {}
      );
      const now = Date.now();
      const workspaceId = createWorkspaceId(picked.path);
      const existing = get().workspaces.find((item) => item.id === workspaceId);
      const workspace: Workspace = {
        id: workspaceId,
        name: picked.name,
        path: picked.path,
        status: picked.status,
        addedAt: existing?.addedAt ?? now,
        lastUsedAt: now,
      };

      const workspaces = existing
        ? get().workspaces.map((item) =>
            item.id === workspaceId ? workspace : item
          )
        : [...get().workspaces, workspace];
      const recentWorkspaceIds = upsertRecent(get().recentWorkspaceIds, workspaceId);

      set({
        workspaces,
        activeWorkspaceId: workspaceId,
        recentWorkspaceIds,
        isPicking: false,
      });

      await persistState({
        workspaces,
        activeWorkspaceId: workspaceId,
        recentWorkspaceIds,
      });

      return workspace;
    } catch {
      set({ isPicking: false });
      return null;
    }
  },

  setActiveWorkspace: async (workspaceId) => {
    const now = Date.now();
    const workspaces = get().workspaces.map((item) =>
      item.id === workspaceId ? { ...item, lastUsedAt: now } : item
    );
    const recentWorkspaceIds = workspaceId
      ? upsertRecent(get().recentWorkspaceIds, workspaceId)
      : get().recentWorkspaceIds;

    set({
      workspaces,
      activeWorkspaceId: workspaceId,
      recentWorkspaceIds,
    });

    await persistState({
      workspaces,
      activeWorkspaceId: workspaceId,
      recentWorkspaceIds,
    });
  },

  refreshWorkspace: async (workspaceId) => {
    const workspace = get().workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;

    try {
      const validated = await bridgeClient.send<WorkspaceInfo>(
        "workspace",
        "workspace.validate",
        { path: workspace.path }
      );
      const workspaces = get().workspaces.map((item) =>
        item.id === workspaceId
          ? { ...item, name: validated.name, path: validated.path, status: validated.status }
          : item
      );
      set({ workspaces });
      await persistState({
        workspaces,
        activeWorkspaceId: get().activeWorkspaceId,
        recentWorkspaceIds: get().recentWorkspaceIds,
      });
    } catch {
      const workspaces = get().workspaces.map((item) =>
        item.id === workspaceId ? { ...item, status: "error" as const } : item
      );
      set({ workspaces });
      await persistState({
        workspaces,
        activeWorkspaceId: get().activeWorkspaceId,
        recentWorkspaceIds: get().recentWorkspaceIds,
      });
    }
  },

  removeWorkspace: async (workspaceId) => {
    const workspaces = get().workspaces.filter((item) => item.id !== workspaceId);
    const recentWorkspaceIds = get().recentWorkspaceIds.filter((id) => id !== workspaceId);
    const activeWorkspaceId =
      get().activeWorkspaceId === workspaceId
        ? recentWorkspaceIds[0] ?? null
        : get().activeWorkspaceId;

    set({ workspaces, recentWorkspaceIds, activeWorkspaceId });
    await persistState({ workspaces, recentWorkspaceIds, activeWorkspaceId });
  },
}));
