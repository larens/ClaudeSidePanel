import { useConnectionStore } from "@/sidepanel/stores/connectionStore";
import { useWorkspaceStore } from "@/sidepanel/stores/workspaceStore";

export function StatusBar() {
  const { state, port, error } = useConnectionStore();
  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;

  const statusText =
    state === "connected"
      ? "Connected"
      : state === "connecting"
      ? "Connecting..."
      : error ?? "Disconnected";

  const statusColor =
    state === "connected"
      ? "text-claude-success"
      : state === "connecting"
      ? "text-claude-warning"
      : "text-claude-error";

  return (
    <footer className="flex items-center justify-between px-3 py-1.5 border-t border-claude-border bg-claude-surface/30 text-[10px] shrink-0">
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${statusColor.replace("text-", "bg-")}`} />
        <span className={statusColor}>{statusText}</span>
        {state === "connected" && (
          <span className="text-claude-muted">
            :{port}
          </span>
        )}
      </div>
      <span className="text-claude-muted truncate max-w-[50%] text-right">
        {activeWorkspace ? `Workspace: ${activeWorkspace.name}` : "ClaudeSidePanel v0.1.0"}
      </span>
    </footer>
  );
}
