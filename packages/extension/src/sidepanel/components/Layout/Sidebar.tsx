import { useSessionStore } from "@/sidepanel/stores/sessionStore";
import { useChatStore } from "@/sidepanel/stores/chatStore";
import { useWorkspaceStore } from "@/sidepanel/stores/workspaceStore";

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
    createSession,
    switchSession,
    deleteSession,
  } = useSessionStore();
  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  const clearMessages = useChatStore((s) => s.clearMessages);

  if (!open) return null;

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const visibleSessions = activeWorkspace
    ? sessions.filter((session) => session.workspaceId === activeWorkspace.id)
    : [];

  const handleNew = async () => {
    if (!activeWorkspace || activeWorkspace.status !== "ready") return;
    clearMessages();
    await createSession({
      cwd: activeWorkspace.path,
      workspaceId: activeWorkspace.id,
    });
    onClose();
  };

  const handleSelect = (id: string) => {
    switchSession(id);
    onClose();
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteSession(id);
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
            visibleSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleSelect(session.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors group flex items-start justify-between ${
                  session.id === activeSessionId
                    ? "bg-claude-accent/15 text-claude-text"
                    : "hover:bg-claude-border/30 text-claude-muted"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs font-medium">
                    {t("会话", "Session")} {session.id.slice(0, 6)}
                  </div>
                  <div className="text-[10px] mt-0.5 opacity-40">
                    {t(`${session.messageCount} 条消息`, `${session.messageCount} messages`)}
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:text-claude-error transition-all"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </button>
            ))
          )}
        </div>

        <div className="p-3 border-t border-claude-border">
          <button
            onClick={handleNew}
            disabled={!activeWorkspace || activeWorkspace.status !== "ready"}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-claude-accent text-claude-bg rounded-lg hover:bg-claude-accent-hover transition-colors"
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
