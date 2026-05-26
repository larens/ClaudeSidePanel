# Workspace Context Design

## Summary

ClaudeSidePanel should behave more like entering a local project in Claude Code rather than opening a generic browser chat. The plugin will support explicit workspace selection, bind each chat session to a selected local directory, and keep workspace-specific history and session state. The local bridge will provide the system folder picker and directory validation, while the extension will own UI state and persistence.

## Goals

- Let the user manually choose the local workspace used by Claude Code.
- Make workspace switching obvious and fast inside the browser side panel.
- Bind Claude sessions to a workspace `cwd` so each project has independent context.
- Preserve recent workspaces and workspace-specific chat state across reloads.
- Keep the first version focused on macOS and the current extension + bridge architecture.

## Non-Goals

- Automatic workspace detection from the current web page.
- Full multi-platform native picker support in the first iteration.
- Rich IDE-style workspace metadata such as git branch, recent files, or diagnostics.
- A complete multi-session manager UI beyond the minimum actions needed for workspace usage.

## Product Scope

The user chooses a local folder from the plugin. The bridge opens the native folder picker, validates the path, and returns normalized directory metadata. The extension stores that workspace, marks it active, and creates or restores a Claude session for that workspace. Every message sent afterward runs Claude Code in that workspace directory.

## User Experience

### First Use

- The side panel shows an empty workspace state with a primary action: `Select Folder`.
- Clicking the action sends a `workspace.pick` request to the local bridge.
- The bridge opens the macOS folder picker and returns the selected directory path and name.
- The extension stores the workspace, marks it active, and creates the first session in that `cwd`.
- The chat area switches to the workspace-scoped session and shows an empty-state hint that the user can now ask Claude Code about that local project.

### Normal Use

- The top workspace bar shows the current workspace name and a truncated path.
- The user can open a workspace panel to switch to a recent workspace, create a new session, refresh workspace status, or remove the current workspace from the plugin.
- Switching workspace immediately switches the visible chat session to that workspace's active session.
- If the target workspace has no existing session, the extension creates one automatically.

### Error Handling

- If the bridge is disconnected, the workspace picker action is disabled and the UI explains that the local bridge must be started.
- If the user cancels the native picker, nothing changes.
- If a stored workspace path no longer exists or is not accessible, the workspace is marked as `missing` or `error` and the user sees a retry action.
- If session creation fails after selecting a workspace, the workspace remains active but the UI shows a recoverable error with retry.

## Architecture

### Responsibility Split

- The extension owns workspace UI, active workspace state, recent workspaces, workspace-to-session mapping, and chat restoration.
- The bridge owns native folder picking, path normalization, directory validation, and running Claude Code in the requested `cwd`.

### Core Flow

1. User clicks `Select Folder` in the extension.
2. Extension sends `workspace.pick` over the bridge WebSocket.
3. Bridge opens the native picker, normalizes the selected path, validates access, and returns workspace metadata.
4. Extension upserts the workspace in local storage and marks it active.
5. Extension creates or restores a session bound to that workspace `cwd`.
6. `chat.send` continues to use the existing streaming pipeline, but the active session is already bound to the workspace path.

## UI Design

### Workspace Bar

- Place the workspace bar directly below or inside the existing header.
- Show current workspace name as the primary label.
- Show the absolute path as a secondary, truncated label or tooltip.
- Provide actions for `Switch`, `New Session`, and an overflow menu.
- When no workspace is selected, replace the bar with a clear empty-state button.

### Workspace Panel

- Show the current workspace summary at the top, including path and status.
- Show a recent workspace list for quick switching.
- Provide actions for `Select Folder`, `New Session`, `Refresh Status`, and `Remove Workspace`.
- Keep the panel lightweight rather than building a full settings page workflow.

### Chat and Status Integration

- Switching workspace immediately changes the visible message list to the active session for that workspace.
- The empty state should mention the current workspace by name.
- The status bar should surface the active workspace name so the execution context is always visible.

## Data Model

### Workspace

```ts
type Workspace = {
  id: string;
  name: string;
  path: string;
  addedAt: number;
  lastUsedAt: number;
  status: "ready" | "missing" | "error";
};
```

### Workspace Store

```ts
type WorkspaceStore = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  recentWorkspaceIds: string[];
};
```

### Session Extension

```ts
type SessionInfo = {
  id: string;
  cwd: string;
  workspaceId?: string;
  createdAt: string;
  messageCount: number;
};
```

### Persistence

- `claudeweb_workspaces`: workspace list, active workspace, recent workspace order.
- `claudeweb_workspace_sessions`: mapping of `workspaceId -> { sessionIds[], activeSessionId }`.
- Existing `claudeweb_messages_<sessionId>` stays unchanged for message persistence.

## Protocol Changes

### Request Type

```ts
type RequestType =
  | "chat"
  | "session"
  | "file"
  | "terminal"
  | "system"
  | "workspace";
```

### New Bridge Actions

- `workspace.pick`: open the native folder picker and return the chosen folder metadata.
- `workspace.validate`: confirm that a stored path still exists and is accessible.
- `workspace.meta`: return normalized metadata for a path, including display name.

### Session Payload

```ts
type SessionCreatePayload = {
  cwd: string;
  workspaceId?: string;
};
```

### Picker Result

```ts
type WorkspacePickResult = {
  path: string;
  name: string;
};
```

## Bridge Implementation

### Native Picker

The first version targets macOS. The bridge will open a folder chooser using AppleScript:

```bash
osascript -e 'POSIX path of (choose folder with prompt "Select Workspace")'
```

### Validation

After selection, the bridge will:

- Normalize the path via `realpath`.
- Verify accessibility with filesystem checks such as `stat` and `access`.
- Return an error if the path is missing, unreadable, or otherwise unusable.

### Claude Session Binding

- `session.create` must accept explicit `cwd` and optional `workspaceId`.
- Session creation from the extension should always use the active workspace path.
- The bridge should not silently fall back to a global or process-default directory once workspace mode is enabled.

## State Rules

- A workspace must be selected before the plugin allows normal chat sends.
- Each workspace has one active session at a time in the MVP.
- Creating a new session in a workspace replaces the visible active session for that workspace but does not affect other workspaces.
- Removing a workspace deletes only extension-side records and cached chat state references, never the disk directory itself.

## Implementation Phases

### Phase 1: Capability

- Add `workspace` bridge actions.
- Add extension workspace store and persistence.
- Allow `session.create` with explicit `cwd`.
- Gate chat on active workspace selection.

### Phase 2: Experience

- Add recent workspaces.
- Add workspace validation and status rendering.
- Bind session restoration to workspace switching.

### Phase 3: Terminal-Like Context

- Add clearer workspace presence in the UI.
- Add workspace-scoped new session action.
- Polish switching and empty-state feedback so the product feels like entering a project context.

## Risks

### Native Picker Portability

The macOS picker approach is suitable for the first iteration but must be abstracted so Windows and Linux support can be added later without changing the extension protocol.

### Path Drift

Stored paths may be moved, deleted, or permission-restricted after being added. The extension must treat stored workspaces as soft references and revalidate on switch.

### Session Misbinding

If chat is allowed without a selected workspace, sessions can become associated with the wrong project directory. The MVP avoids this by making workspace selection a prerequisite for normal chat.

### Migration Complexity

The current session store is global. The implementation must introduce workspace-to-session mapping without breaking existing message persistence.

## Recommended MVP

The first implementation should intentionally stay small:

- Require selecting a workspace before normal chat.
- Support one active workspace at a time.
- Maintain one default active session per workspace.
- Support recent workspace switching.
- Use the bridge-native folder picker on macOS.
- Support creating a new session in the current workspace.

This MVP is enough to make the plugin feel like a project-scoped Claude Code entry point while avoiding premature complexity.
