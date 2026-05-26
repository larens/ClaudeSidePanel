// Shared protocol types — mirrors extension/src/lib/protocol.ts

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 18765;

export interface RequestMessage {
  id: string;
  version: number;
  type: string;
  action: string;
  payload: unknown;
}

export interface ResponseMessage {
  id: string;
  type: "chunk" | "complete" | "error" | "event";
  action: string;
  payload: unknown;
}

export interface ChatSendPayload {
  sessionId: string;
  message: string;
  context?: {
    url: string;
    title: string;
    selectedText?: string;
    bodyText?: string;
  };
  contextPrefix?: string;
  cwd?: string;
  workspaceId?: string;
}

export interface SessionCreatePayload {
  cwd: string;
  workspaceId?: string;
}

export interface ChatInterruptPayload {
  sessionId: string;
}

export type WorkspaceStatus = "ready" | "missing" | "error";

export interface WorkspaceInfo {
  name: string;
  path: string;
  status: WorkspaceStatus;
}

export interface WorkspaceValidatePayload {
  path: string;
}

export interface FileWritePayload {
  cwd: string;
  relativePath: string;
  dataBase64: string;
}

export function createResponse(
  id: string,
  type: ResponseMessage["type"],
  action: string,
  payload: unknown
): ResponseMessage {
  return { id, type, action, payload };
}
