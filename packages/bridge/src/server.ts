import { WebSocketServer, type WebSocket } from "ws";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { SessionManager } from "./session.js";
import {
  createResponse,
  type ChatInterruptPayload,
  type FileWritePayload,
  type RequestMessage,
  type SessionCreatePayload,
  type WorkspaceValidatePayload,
} from "./protocol.js";
import {
  getWorkspaceMeta,
  pickWorkspace,
  validateWorkspace,
} from "./workspace.js";
import {
  listProjects,
  listSessions,
  getSessionDetail,
  searchSessions,
} from "./history.js";
import type {
  HistoryListSessionsPayload,
  HistoryGetSessionPayload,
  HistorySearchPayload,
  SessionLoadHistoryPayload,
} from "./protocol.js";

export interface BridgeServerOptions {
  port: number;
  token: string;
}

export class BridgeServer {
  private wss: WebSocketServer | null = null;
  private sessions = new SessionManager();
  private port: number;

  constructor(options: BridgeServerOptions) {
    this.port = options.port;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({
        host: "127.0.0.1",
        port: this.port,
      });

      this.wss.on("listening", () => {
        console.log(
          `[Bridge] WebSocket server listening on ws://127.0.0.1:${this.port}`
        );
        resolve();
      });

      this.wss.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
          reject(
            new Error(
              `Port ${this.port} is already in use. Is another bridge instance running?`
            )
          );
        } else {
          reject(err);
        }
      });

      this.wss.on("connection", (ws) => {
        console.log("[Bridge] Client connected");

        ws.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString());
            this.handleMessage(ws, msg);
          } catch {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: "Invalid JSON message",
              })
            );
          }
        });

        ws.on("close", () => {
          console.log("[Bridge] Client disconnected");
        });
      });
    });
  }

  stop(): void {
    this.sessions.destroy();
    this.wss?.close();
    console.log("[Bridge] Server stopped");
  }

  private handleMessage(ws: WebSocket, msg: RequestMessage): void {
    switch (msg.type) {
      case "chat":
        this.handleChat(ws, msg);
        break;
      case "session":
        this.handleSession(ws, msg);
        break;
      case "workspace":
        this.handleWorkspace(ws, msg);
        break;
      case "file":
        this.handleFile(ws, msg);
        break;
      case "system":
        this.handleSystem(ws, msg);
        break;
      case "history":
        this.handleHistory(ws, msg);
        break;
      default:
        ws.send(
          JSON.stringify(
            createResponse(
              msg.id,
              "error",
              msg.action,
              `Unknown message type: ${msg.type}`
            )
          )
        );
    }
  }

  private handleChat(ws: WebSocket, msg: RequestMessage): void {
    if (msg.action === "chat.interrupt") {
      const { sessionId } = msg.payload as ChatInterruptPayload;
      const success = this.sessions.interrupt(sessionId);
      ws.send(
        JSON.stringify(
          createResponse(msg.id, "complete", "chat.interrupt", { success })
        )
      );
      return;
    }

    const {
      sessionId,
      message,
      context,
      contextPrefix: rawPrefix,
      cwd,
      workspaceId,
    } = msg.payload as {
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
    };

    // Use pre-built contextPrefix if provided, otherwise build from context object
    let contextPrefix: string | undefined = rawPrefix;
    if (!contextPrefix && context) {
      const parts = [`[Current Web Page]`, `URL: ${context.url}`, `Title: ${context.title}`];
      if (context.selectedText) {
        parts.push(`Selected text: "${context.selectedText}"`);
      }
      if (context.bodyText) {
        parts.push(`Page content:\n${context.bodyText}`);
      }
      contextPrefix = parts.join("\n");
    }

    this.sessions
      .sendMessage(
        sessionId,
        message,
        msg.id,
        ws,
        contextPrefix,
        cwd,
        workspaceId
      )
      .catch((err) => {
        ws.send(
          JSON.stringify(
            createResponse(
              msg.id,
              "error",
              "chat.send",
              err instanceof Error ? err.message : String(err)
            )
          )
        );
      });
  }

  private handleFile(ws: WebSocket, msg: RequestMessage): void {
    const sendSuccess = (payload: unknown) => {
      ws.send(JSON.stringify(createResponse(msg.id, "complete", msg.action, payload)));
    };

    const sendError = (error: unknown) => {
      ws.send(
        JSON.stringify(
          createResponse(
            msg.id,
            "error",
            msg.action,
            error instanceof Error ? error.message : String(error)
          )
        )
      );
    };

    const safeResolve = (cwd: string, relativePath: string) => {
      const base = resolve(cwd);
      const full = resolve(base, relativePath);
      if (full === base || !full.startsWith(base + sep)) {
        throw new Error("Invalid path");
      }
      return full;
    };

    switch (msg.action) {
      case "file.write": {
        const { cwd, relativePath, dataBase64 } = msg.payload as FileWritePayload;
        const fullPath = safeResolve(cwd, relativePath);
        const dir = fullPath.split(sep).slice(0, -1).join(sep) || cwd;
        mkdir(dir, { recursive: true })
          .then(() => writeFile(fullPath, Buffer.from(dataBase64, "base64")))
          .then(() => sendSuccess({ path: relativePath }))
          .catch(sendError);
        break;
      }
      default:
        sendError(`Unknown file action: ${msg.action}`);
    }
  }

  private handleSession(ws: WebSocket, msg: RequestMessage): void {
    switch (msg.action) {
      case "session.create": {
        const { cwd, workspaceId } = msg.payload as SessionCreatePayload;
        const session = this.sessions.create(cwd || process.cwd(), workspaceId);
        ws.send(
          JSON.stringify(
            createResponse(msg.id, "complete", "session.create", session)
          )
        );
        break;
      }
      case "session.list": {
        ws.send(
          JSON.stringify(
            createResponse(
              msg.id,
              "complete",
              "session.list",
              this.sessions.list()
            )
          )
        );
        break;
      }
      case "session.delete": {
        const { sessionId } = msg.payload as { sessionId: string };
        this.sessions.delete(sessionId);
        ws.send(
          JSON.stringify(
            createResponse(msg.id, "complete", "session.delete", { success: true })
          )
        );
        break;
      }
      case "session.load-history": {
        const { sessionId, cwd } = msg.payload as SessionLoadHistoryPayload;
        const session = this.sessions.createWithSessionId(sessionId, cwd);
        ws.send(
          JSON.stringify(
            createResponse(msg.id, "complete", "session.load-history", {
              ...session,
              source: "history",
            })
          )
        );
        break;
      }
    }
  }

  private handleWorkspace(ws: WebSocket, msg: RequestMessage): void {
    const sendSuccess = (payload: unknown) => {
      ws.send(JSON.stringify(createResponse(msg.id, "complete", msg.action, payload)));
    };

    const sendError = (error: unknown) => {
      ws.send(
        JSON.stringify(
          createResponse(
            msg.id,
            "error",
            msg.action,
            error instanceof Error ? error.message : String(error)
          )
        )
      );
    };

    switch (msg.action) {
      case "workspace.pick":
        pickWorkspace().then(sendSuccess).catch(sendError);
        break;
      case "workspace.validate": {
        const { path } = msg.payload as WorkspaceValidatePayload;
        validateWorkspace(path).then(sendSuccess).catch(sendError);
        break;
      }
      case "workspace.meta": {
        const { path } = msg.payload as WorkspaceValidatePayload;
        getWorkspaceMeta(path).then(sendSuccess).catch(sendError);
        break;
      }
      default:
        sendError(`Unknown workspace action: ${msg.action}`);
    }
  }

  private handleHistory(ws: WebSocket, msg: RequestMessage): void {
    const sendSuccess = (payload: unknown) => {
      ws.send(JSON.stringify(createResponse(msg.id, "complete", msg.action, payload)));
    };
    const sendError = (error: unknown) => {
      ws.send(
        JSON.stringify(
          createResponse(
            msg.id,
            "error",
            msg.action,
            error instanceof Error ? error.message : String(error)
          )
        )
      );
    };

    switch (msg.action) {
      case "history.list-projects":
        listProjects().then(sendSuccess).catch(sendError);
        break;
      case "history.list-sessions": {
        const { projectPath } = msg.payload as HistoryListSessionsPayload;
        listSessions(projectPath).then(sendSuccess).catch(sendError);
        break;
      }
      case "history.get-session": {
        const { projectPath, sessionId } = msg.payload as HistoryGetSessionPayload;
        getSessionDetail(projectPath, sessionId).then(sendSuccess).catch(sendError);
        break;
      }
      case "history.search": {
        const { query } = msg.payload as HistorySearchPayload;
        searchSessions(query).then(sendSuccess).catch(sendError);
        break;
      }
      default:
        sendError(`Unknown history action: ${msg.action}`);
    }
  }

  private handleSystem(ws: WebSocket, msg: RequestMessage): void {
    switch (msg.action) {
      case "auth": {
        ws.send(
          JSON.stringify(
            createResponse(msg.id, "complete", "system.auth", {
              authenticated: true,
            })
          )
        );
        break;
      }
      case "system.status": {
        ws.send(
          JSON.stringify(
            createResponse(msg.id, "complete", "system.status", {
              connected: true,
              version: "0.1.0",
              port: this.port,
              activeSessions: this.sessions.list().length,
            })
          )
        );
        break;
      }
      case "system.ping": {
        ws.send(
          JSON.stringify(
            createResponse(msg.id, "complete", "system.ping", { pong: true })
          )
        );
        break;
      }
    }
  }
}
