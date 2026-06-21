import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { SessionManager } from "./session.js";
import {
  createResponse,
  type BrowserPageContextOptions,
  type BrowserPageContextResultPayload,
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
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private sessions = new SessionManager();
  private port: number;
  private pageContextRequests = new Map<
    string,
    {
      resolve: (payload: BrowserPageContextResultPayload) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(options: BridgeServerOptions) {
    this.port = options.port;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = createServer((req, res) => {
        void this.handleHttpRequest(req, res);
      });
      this.wss = new WebSocketServer({ server: this.httpServer });

      this.httpServer.on("listening", () => {
        console.log(
          `[Bridge] WebSocket server listening on ws://127.0.0.1:${this.port}`
        );
        resolve();
      });

      this.httpServer.on("error", (err) => {
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

      this.httpServer.listen(this.port, "127.0.0.1");
    });
  }

  stop(): void {
    this.sessions.destroy();
    for (const { timer } of this.pageContextRequests.values()) {
      clearTimeout(timer);
    }
    this.pageContextRequests.clear();
    this.wss?.close();
    this.httpServer?.close();
    console.log("[Bridge] Server stopped");
  }

  private async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== "GET") {
      this.sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname !== "/browser/page-context") {
      this.sendJson(res, 404, { error: "Not found" });
      return;
    }

    const options = parsePageContextOptions(url.searchParams);
    const result = await this.requestBrowserPageContext(options);
    if (!result.ok) {
      this.sendJson(res, 503, { error: result.error ?? "Page context unavailable" });
      return;
    }

    this.sendJson(res, 200, result.context ?? null);
  }

  private sendJson(
    res: ServerResponse,
    statusCode: number,
    payload: unknown
  ): void {
    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
  }

  private requestBrowserPageContext(
    options: BrowserPageContextOptions
  ): Promise<BrowserPageContextResultPayload> {
    const client = this.findOpenClient();
    if (!client) {
      return Promise.resolve({
        requestId: "",
        ok: false,
        error: "No browser extension client is connected.",
      });
    }

    const requestId = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pageContextRequests.delete(requestId);
        resolve({
          requestId,
          ok: false,
          error: "Timed out waiting for browser page context.",
        });
      }, 5000);

      this.pageContextRequests.set(requestId, { resolve, timer });
      client.send(
        JSON.stringify(
          createResponse(requestId, "event", "browser.pageContext.request", {
            requestId,
            options,
          })
        )
      );
    });
  }

  private findOpenClient(): WebSocket | null {
    for (const client of this.wss?.clients ?? []) {
      if (client.readyState === client.OPEN) {
        return client;
      }
    }
    return null;
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
      case "browser.pageContext.result": {
        const payload = msg.payload as BrowserPageContextResultPayload;
        const pending = this.pageContextRequests.get(payload.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pageContextRequests.delete(payload.requestId);
          pending.resolve(payload);
        }
        ws.send(
          JSON.stringify(
            createResponse(msg.id, "complete", msg.action, { received: true })
          )
        );
        break;
      }
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

function parsePageContextOptions(
  searchParams: URLSearchParams
): BrowserPageContextOptions {
  const maxLength = Number(searchParams.get("maxLength") ?? "10000");
  return {
    maxLength: Number.isFinite(maxLength) ? Math.max(0, maxLength) : 10000,
    includeLinks: searchParams.get("includeLinks") !== "false",
  };
}
