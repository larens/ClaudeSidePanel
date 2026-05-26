import { useState } from "react";
import { useConnectionStore } from "@/sidepanel/stores/connectionStore";
import { useSessionStore } from "@/sidepanel/stores/sessionStore";
import { useChatStore } from "@/sidepanel/stores/chatStore";
import { useWorkspaceStore } from "@/sidepanel/stores/workspaceStore";
import { Sidebar } from "./Sidebar";
import { SettingsPanel } from "../Settings/SettingsPanel";

export function Header() {
  const isZh = navigator.language?.toLowerCase().startsWith("zh");
  const t = (zh: string, en: string) => (isZh ? zh : en);

  const { state } = useConnectionStore();
  const {
    setActiveWorkspaceSession,
    removeWorkspaceSessions,
    setActiveSession,
    ensureWorkspaceSession,
  } = useSessionStore();
  const { messages, clearMessages } = useChatStore();
  const {
    workspaces,
    activeWorkspaceId,
    recentWorkspaceIds,
    isPicking,
    pickWorkspace,
    setActiveWorkspace,
    refreshWorkspace,
    removeWorkspace,
  } = useWorkspaceStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(false);

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const recentWorkspaces = recentWorkspaceIds
    .map((id) => workspaces.find((workspace) => workspace.id === id) ?? null)
    .filter((workspace): workspace is NonNullable<typeof workspace> => Boolean(workspace));

  const handlePickWorkspace = async () => {
    const workspace = await pickWorkspace();
    if (!workspace) return;
    await ensureWorkspaceSession(workspace.id, workspace.path);
    setWorkspacePanelOpen(false);
  };

  const handleSwitchWorkspace = async (workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    await setActiveWorkspace(workspaceId);
    if (workspace?.status === "ready") {
      await ensureWorkspaceSession(workspace.id, workspace.path);
    } else {
      setActiveWorkspaceSession(workspaceId);
    }
    setWorkspacePanelOpen(false);
  };

  const handleNewSession = async () => {
    if (!activeWorkspace) return;
    clearMessages();
    await useSessionStore.getState().createSession({
      cwd: activeWorkspace.path,
      workspaceId: activeWorkspace.id,
    });
    setWorkspacePanelOpen(false);
  };

  const handleRefreshWorkspace = async () => {
    if (!activeWorkspace) return;
    await refreshWorkspace(activeWorkspace.id);
  };

  const handleRemoveWorkspace = async () => {
    if (!activeWorkspace) return;
    await removeWorkspaceSessions(activeWorkspace.id);
    await removeWorkspace(activeWorkspace.id);
    const nextWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId;
    if (nextWorkspaceId) {
      setActiveWorkspaceSession(nextWorkspaceId);
    } else {
      clearMessages();
      setActiveSession(null);
    }
    setWorkspacePanelOpen(false);
  };

  return (
    <>
      <header className="relative flex items-center justify-between px-3 py-2 border-b border-claude-border bg-claude-surface/50 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded hover:bg-claude-border/50 text-claude-muted hover:text-claude-text transition-colors"
            title={t("会话", "Sessions")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-claude-text truncate">
            {activeWorkspace?.name ?? t("选择工作区", "Select Workspace")}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="p-1.5 rounded hover:bg-claude-border/50 text-claude-muted hover:text-claude-text transition-colors"
              title={t("清空对话", "Clear chat")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
          <button
            onClick={() => setWorkspacePanelOpen((open) => !open)}
            className="p-1.5 rounded hover:bg-claude-border/50 text-claude-muted hover:text-claude-text transition-colors"
            title={t("工作区", "Workspace")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded hover:bg-claude-border/50 text-claude-muted hover:text-claude-text transition-colors"
            title={t("设置", "Settings")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <div
            className={`w-2 h-2 rounded-full ml-1 ${
              state === "connected"
                ? "bg-claude-success"
                : state === "connecting"
                ? "bg-claude-warning animate-pulse"
                : "bg-claude-error"
            }`}
            title={
              state === "connected"
                ? t("已连接", "Connected")
                : state === "connecting"
                ? t("连接中…", "Connecting...")
                : t("未连接", "Disconnected")
            }
          />
        </div>
        {workspacePanelOpen && (
          <div className="absolute top-[calc(100%+6px)] left-3 right-3 z-30 rounded-xl border border-claude-border bg-claude-surface shadow-xl p-2 space-y-2">
            <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-claude-bg/60">
              <div className="min-w-0">
                <div className="text-xs font-medium text-claude-text truncate">
                  {activeWorkspace?.name ??
                    t("尚未选择工作区", "No workspace selected")}
                </div>
              </div>
              {activeWorkspace && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    activeWorkspace.status === "ready"
                      ? "bg-claude-success/15 text-claude-success"
                      : activeWorkspace.status === "missing"
                      ? "bg-claude-warning/15 text-claude-warning"
                      : "bg-claude-error/15 text-claude-error"
                  }`}
                >
                  {activeWorkspace.status}
                </span>
              )}
            </div>

            {recentWorkspaces.length > 0 && (
              <div className="space-y-1">
                <div className="px-2 text-[10px] uppercase tracking-wide text-claude-muted">
                  {t("最近", "Recent")}
                </div>
                {recentWorkspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => handleSwitchWorkspace(workspace.id)}
                    className={`w-full text-left px-2 py-2 rounded-lg transition-colors ${
                      workspace.id === activeWorkspaceId
                        ? "bg-claude-accent/15 text-claude-text"
                        : "hover:bg-claude-border/30 text-claude-muted"
                    }`}
                  >
                    <div className="text-xs font-medium truncate">
                      {workspace.name}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handlePickWorkspace}
                disabled={state !== "connected" || isPicking}
                className="px-3 py-2 rounded-lg bg-claude-accent text-claude-bg text-xs font-medium hover:bg-claude-accent-hover disabled:opacity-40 transition-colors"
              >
                {isPicking
                  ? t("选择中…", "Picking...")
                  : t("选择文件夹", "Select Folder")}
              </button>
              <button
                onClick={handleNewSession}
                disabled={!activeWorkspace || activeWorkspace.status !== "ready"}
                className="px-3 py-2 rounded-lg border border-claude-border text-xs text-claude-text hover:bg-claude-border/20 disabled:opacity-40 transition-colors"
              >
                {t("新建会话", "New Session")}
              </button>
              <button
                onClick={handleRefreshWorkspace}
                disabled={!activeWorkspace || state !== "connected"}
                className="px-3 py-2 rounded-lg border border-claude-border text-xs text-claude-text hover:bg-claude-border/20 disabled:opacity-40 transition-colors"
              >
                {t("刷新状态", "Refresh Status")}
              </button>
              <button
                onClick={handleRemoveWorkspace}
                disabled={!activeWorkspace}
                className="px-3 py-2 rounded-lg border border-claude-border text-xs text-claude-error hover:bg-claude-error/10 disabled:opacity-40 transition-colors"
              >
                {t("移除工作区", "Remove Workspace")}
              </button>
            </div>
          </div>
        )}
      </header>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
