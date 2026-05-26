// ClaudeSidePanel — Extension ↔ Bridge communication protocol

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 18765;

// ── Message Envelope ──────────────────────────────────────

export interface RequestMessage {
  id: string;
  version: typeof PROTOCOL_VERSION;
  type: RequestType;
  action: string;
  payload: unknown;
}

export type RequestType =
  | "chat"
  | "session"
  | "file"
  | "terminal"
  | "system"
  | "workspace"
  | "history";

export interface ResponseMessage {
  id: string;
  type: ResponseType;
  action: string;
  payload: unknown;
}

export type ResponseType = "chunk" | "complete" | "error" | "event";

// ── Chat Messages ─────────────────────────────────────────

export interface ChatSendPayload {
  sessionId: string;
  message: string;
  context?: PageContext;
  contextPrefix?: string;
  cwd?: string;
  workspaceId?: string;
}

export interface ChatInterruptPayload {
  sessionId: string;
}

export interface ChatChunkPayload {
  sessionId: string;
  delta: string;
  toolCall?: ToolCallInfo;
}

export interface ChatCompletePayload {
  sessionId: string;
  messageId: string;
  usage?: TokenUsage;
}

export interface PageContext {
  url: string;
  title: string;
  selectedText?: string;
  bodyText?: string;
}

export interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: "running" | "completed" | "error";
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// ── Session Messages ──────────────────────────────────────

export interface SessionCreatePayload {
  cwd: string;
  workspaceId?: string;
}

export interface SessionInfo {
  id: string;
  cwd: string;
  workspaceId?: string;
  createdAt: string;
  messageCount: number;
  source?: "live" | "history";
  title?: string;
}

// ── Workspace Messages ────────────────────────────────────

export type WorkspaceStatus = "ready" | "missing" | "error";

export interface WorkspaceInfo {
  name: string;
  path: string;
  status: WorkspaceStatus;
}

export interface WorkspacePickResult extends WorkspaceInfo {}

export interface WorkspaceValidatePayload {
  path: string;
}

// ── File Messages ─────────────────────────────────────────

export interface FileWritePayload {
  cwd: string;
  relativePath: string;
  dataBase64: string;
}

// ── History Messages ───────────────────────────────────────

export interface SessionLoadHistoryPayload {
  sessionId: string;
  cwd: string;
  projectPath: string;
}

export interface HistoryListSessionsPayload {
  projectPath: string;
}

export interface HistoryGetSessionPayload {
  projectPath: string;
  sessionId: string;
}

export interface HistorySearchPayload {
  query: string;
}

export interface HistoryProject {
  encodedPath: string;
  decodedPath: string;
  name: string;
  sessionCount: number;
}

export interface HistorySessionMeta {
  sessionId: string;
  title: string;
  lastPrompt: string;
  leafUuid: string | null;
  timestamp: string;
  cwd: string;
  gitBranch: string;
  messageCount: number;
}

export interface HistorySessionDetail extends HistorySessionMeta {
  messages: HistoryMessage[];
}

export interface HistoryMessage {
  uuid: string;
  parentUuid: string | null;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  thinking?: string;
  toolCalls?: ToolCallInfo[];
}

// ── System Messages ───────────────────────────────────────

export interface SystemStatusPayload {
  connected: boolean;
  version: string;
  port: number;
  activeSessions: number;
}

export interface SystemAuthPayload {
  token: string;
}

// ── Message Types ─────────────────────────────────────────

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  thinking?: string;
  isStreaming?: boolean;
}

// ── Helper: create request ────────────────────────────────

let requestCounter = 0;

export function createRequest(
  type: RequestType,
  action: string,
  payload: unknown
): RequestMessage {
  return {
    id: `req_${Date.now()}_${++requestCounter}`,
    version: PROTOCOL_VERSION,
    type,
    action,
    payload,
  };
}
