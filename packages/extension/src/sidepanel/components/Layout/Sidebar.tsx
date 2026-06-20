import { useSessionStore } from "@/sidepanel/stores/sessionStore";
import { useChatStore } from "@/sidepanel/stores/chatStore";
import { useWorkspaceStore } from "@/sidepanel/stores/workspaceStore";
import { useConnectionStore } from "@/sidepanel/stores/connectionStore";
import type { SessionInfo } from "@/lib/protocol";

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: Props) {
  const isZh = navigator.language?.toLowerCase().startsWith("zh");
  const t = (zh: string, en: string) => (isZh ? zh : en);

  const {
    sessions,
    activeSessionId,
    hiddenSessionIds,
    createSession,
    switchSession,
    deleteSession,
    hideSession,
    activateHistorySession,
    loadHistoryProject,
  } = useSessionStore();
  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  const connectionState = useConnectionStore((s) => s.state);
  const clearMessages = useChatStore((s) => s.clearMessages);

  if (!open) return null;

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const visibleSessions = activeWorkspace
    ? sessions.filter(
        (session) =>
          session.workspaceId === activeWorkspace.id &&
          !hiddenSessionIds.includes(session.id)
      )
    : [];

  const handleNew = async () => {
    if (!activeWorkspace || activeWorkspace.status !== "ready" || connectionState !== "connected") return;
    clearMessages();
    try {
      await createSession({
        cwd: activeWorkspace.path,
        workspaceId: activeWorkspace.id,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      useChatStore.getState().addSystemMessage(
        t(`创建会话失败：${msg}`, `Failed to create session: ${msg}`)
      );
    }
  };

  const handleSelect = async (session: SessionInfo) => {
    if (session.source === "history" && session.workspaceId?.startsWith("ws_history_")) {
      const encodedPath = session.workspaceId.replace("ws_history_", "");
      await activateHistorySession(session.id, session.cwd, encodedPath);
    } else {
      switchSession(session.id);
    }
    onClose();
  };

  const handleRefreshHistory = async (e: React.MouseEvent, session: SessionInfo) => {
    e.stopPropagation();
    if (!session.workspaceId?.startsWith("ws_history_")) return;
    const encodedPath = session.workspaceId.replace("ws_history_", "");
    await loadHistoryProject(encodedPath, activeWorkspace?.name ?? "");
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteSession(id);
  };

  const handleHide = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await hideSession(id);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-fade-in"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed left-0 top-0 bottom-0 w-64 bg-claude-surface border-r border-claude-border z-50 flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-claude-border">
          <span className="text-sm font-semibold text-claude-text">
            {activeWorkspace
              ? t(`${activeWorkspace.name} · 会话`, `${activeWorkspace.name} Sessions`)
              : t("会话", "Sessions")}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-claude-border/50 text-claude-muted"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {!activeWorkspace ? (
            <p className="text-xs text-claude-muted text-center py-8">
              {t("请先选择工作区", "Select a workspace first")}
            </p>
          ) : visibleSessions.length === 0 ? (
            <p className="text-xs text-claude-muted text-center py-8">
              {t("暂无会话", "No sessions yet")}
            </p>
          ) : (
            visibleSessions.map((session) => {
              const isHistory = session.source === "history";
              return (
                <div
                  key={session.id}
                  className={`group flex items-center gap-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                    session.id === activeSessionId
                      ? "bg-claude-accent/15 text-claude-text"
                      : "hover:bg-claude-border/30 text-claude-muted"
                  }`}
                >
                  <button
                    onClick={() => handleSelect(session)}
                    className="flex-1 min-w-0 text-left flex items-center gap-1.5"
                  >
                    {isHistory && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="shrink-0 opacity-40"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    )}
                    <span className="truncate text-xs font-medium flex-1">
                      {session.title || `${t("会话", "Session")} ${session.id.slice(0, 6)}`}
                    </span>
                    <span className="text-[10px] opacity-40 shrink-0">
                      {relativeTime(session.createdAt)}
                    </span>
                  </button>
                  {isHistory && (
                    <button
                      onClick={(e) => handleRefreshHistory(e, session)}
                      className="p-1 opacity-0 group-hover:opacity-100 hover:text-claude-accent transition-all"
                      title={t("刷新", "Refresh")}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={(e) =>
                      isHistory ? handleHide(e, session.id) : handleDelete(e, session.id)
                    }
                    className="p-1 opacity-0 group-hover:opacity-100 hover:text-claude-error transition-all"
                    title={isHistory ? t("隐藏", "Hide") : t("删除", "Delete")}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="p-3 border-t border-claude-border">
          <button
            onClick={handleNew}
            disabled={!activeWorkspace || activeWorkspace.status !== "ready" || connectionState !== "connected"}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-claude-accent text-claude-bg rounded-lg hover:bg-claude-accent-hover disabled:opacity-40 disabled:hover:bg-claude-accent transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t("新建会话", "New Session")}
          </button>
        </div>
      </div>
    </>
  );
}
