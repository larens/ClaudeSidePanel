import { randomBytes } from "node:crypto";
import { CLISession } from "./cli.js";
import type { WebSocket } from "ws";
import { createResponse } from "./protocol.js";

export interface SessionInfo {
  id: string;
  cwd: string;
  workspaceId?: string;
  createdAt: string;
  messageCount: number;
}

interface ToolContext {
  name: string;
  input: Record<string, unknown>;
}

export class SessionManager {
  private sessions = new Map<string, CLISession>();
  private meta = new Map<string, { createdAt: Date; workspaceId?: string }>();

  create(cwd: string, workspaceId?: string, preferredId?: string): SessionInfo {
    const id = preferredId ?? randomBytes(8).toString("hex");
    const session = new CLISession(id, cwd);
    this.sessions.set(id, session);
    this.meta.set(id, { createdAt: new Date(), workspaceId });
    return {
      id,
      cwd,
      workspaceId,
      createdAt: new Date().toISOString(),
      messageCount: session["messageCount"],
    };
  }

  createWithSessionId(sessionId: string, cwd: string): SessionInfo {
    const session = new CLISession(sessionId, cwd);
    session.setResumeId(sessionId);
    this.sessions.set(sessionId, session);
    this.meta.set(sessionId, { createdAt: new Date() });
    return {
      id: sessionId,
      cwd,
      createdAt: new Date().toISOString(),
      messageCount: 0,
    };
  }

  get(id: string): CLISession | undefined {
    return this.sessions.get(id);
  }

  interrupt(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.kill();
    return true;
  }

  delete(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.kill();
      this.sessions.delete(id);
      this.meta.delete(id);
      return true;
    }
    return false;
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.entries()).map(([id, s]) => ({
      id,
      cwd: s.cwd,
      workspaceId: this.meta.get(id)?.workspaceId,
      createdAt:
        this.meta.get(id)?.createdAt.toISOString() ?? new Date().toISOString(),
      messageCount: s["messageCount"],
    }));
  }

  async sendMessage(
    sessionId: string,
    message: string,
    requestId: string,
    ws: WebSocket,
    contextPrefix?: string,
    fallbackCwd?: string,
    workspaceId?: string
  ): Promise<string> {
    let session = this.sessions.get(sessionId);

    if (!session) {
      if (!fallbackCwd) {
        throw new Error("Session not found and no workspace context was provided.");
      }
      const info = this.create(fallbackCwd, workspaceId, sessionId);
      sessionId = info.id;
      session = this.sessions.get(sessionId)!;
    }

    // Track tool context so tool_result can reference tool_use info
    const toolContextMap = new Map<string, ToolContext>();

    const sendChunk = (payload: unknown) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify(createResponse(requestId, "chunk", "chat.send", payload))
        );
      }
    };

    const sendComplete = (payload: unknown) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify(
            createResponse(requestId, "complete", "chat.send", payload)
          )
        );
      }
    };

    const sendError = (message: string) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify(
            createResponse(requestId, "error", "chat.send", message)
          )
        );
      }
    };

    session.on("text", ({ messageId, text }) => {
      sendChunk({
        sessionId,
        messageId,
        delta: text,
        blockType: "text",
      });
    });

    session.on("thinking", ({ messageId, thinking }) => {
      sendChunk({
        sessionId,
        messageId,
        delta: thinking,
        blockType: "thinking",
      });
    });

    session.on("tool_use", ({ messageId, toolId, name, input }) => {
      // Track tool context for when tool_result arrives
      toolContextMap.set(toolId, { name, input });
      sendChunk({
        sessionId,
        messageId,
        toolCall: {
          id: toolId,
          name,
          input,
          status: "running",
        },
      });
    });

    session.on("tool_result", ({ messageId, toolUseId, content, isError }) => {
      // Enrich with context from the original tool_use
      const ctx = toolContextMap.get(toolUseId);
      sendChunk({
        sessionId,
        messageId,
        toolCall: {
          id: toolUseId,
          name: ctx?.name ?? "",
          input: ctx?.input ?? {},
          output: content,
          status: isError ? "error" : "completed",
        },
      });
    });

    session.on("result", ({ text, usage, durationMs }) => {
      sendComplete({
        sessionId,
        text,
        usage: usage
          ? {
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
            }
          : undefined,
        durationMs,
      });
    });

    session.on("error", (err: Error) => {
      sendError(err.message);
    });

    session.on("done", () => {
      toolContextMap.clear();
      session!.removeAllListeners("text");
      session!.removeAllListeners("thinking");
      session!.removeAllListeners("tool_use");
      session!.removeAllListeners("tool_result");
      session!.removeAllListeners("result");
      session!.removeAllListeners("error");
      session!.removeAllListeners("done");
    });

    await session.sendMessage(message, contextPrefix);
    return sessionId;
  }

  destroy(): void {
    for (const session of this.sessions.values()) {
      session.kill();
    }
    this.sessions.clear();
    this.meta.clear();
  }
}
