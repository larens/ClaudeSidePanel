import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

// ── Claude CLI stream-json event types ────────────────────

export interface CLIEvent {
  type: "system" | "assistant" | "user" | "result";
  subtype?: string;
  session_id?: string;
  // system/init fields
  tools?: string[];
  model?: string;
  // assistant fields
  message?: AssistantMessage;
  // result fields
  result?: string;
  is_error?: boolean;
  duration_ms?: number;
  usage?: TokenUsage;
  stop_reason?: string;
  [key: string]: unknown;
}

export interface AssistantMessage {
  id: string;
  type: "message";
  role: "assistant" | "user";
  model: string;
  content: ContentBlock[];
  usage?: TokenUsage;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature?: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string | Array<{ type: string; text?: string }>;
      is_error?: boolean;
    };

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
}

function normalizeToolContent(content: string | Array<{ type: string; text?: string }> | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n");
  }
  return String(content);
}

// ── CLISession ────────────────────────────────────────────

export class CLISession extends EventEmitter {
  private process: ChildProcess | null = null;
  readonly id: string;
  readonly cwd: string;
  private buffer = "";
  private cliSessionId: string | null = null;
  private messageCount = 0;
  // Track emitted text/thinking per message ID to prevent duplicate content
  private emittedTextIds = new Set<string>();
  private emittedThinkingIds = new Set<string>();

  constructor(id: string, cwd: string) {
    super();
    this.id = id;
    this.cwd = cwd;
  }

  /**
   * Send a message to Claude CLI.
   * Spawns `claude --print --verbose --output-format stream-json`.
   * For follow-up messages, uses --resume to continue the session.
   */
  async sendMessage(message: string, contextPrefix?: string): Promise<void> {
    // Kill any running process
    this.kill();
    this.buffer = "";
    this.emittedTextIds.clear();
    this.emittedThinkingIds.clear();
    const args = [
      "--print",
      "--verbose",
      "--output-format",
      "stream-json",
    ];

    // Resume existing CLI session for multi-turn
    if (this.cliSessionId) {
      args.push("--resume", this.cliSessionId);
    }

    // Prepend context if provided
    const fullMessage = contextPrefix
      ? `${contextPrefix}\n\n---\n\n${message}`
      : message;

    args.push(fullMessage);

    this.messageCount++;

    this.process = spawn("claude", args, {
      cwd: this.cwd,
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.emit(
          "error",
          new Error(
            "Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code"
          )
        );
      } else {
        this.emit("error", err);
      }
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event: CLIEvent = JSON.parse(line);
          this.processEvent(event);
        } catch {
          // Non-JSON line, ignore stderr leaks
          console.warn("[CLI] Non-JSON output:", line.slice(0, 100));
        }
      }
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        this.emit("stderr", text);
      }
    });

    this.process.on("close", (code) => {
      // Flush remaining buffer
      if (this.buffer.trim()) {
        try {
          const event: CLIEvent = JSON.parse(this.buffer);
          this.processEvent(event);
        } catch {
          // ignore
        }
        this.buffer = "";
      }
      this.emit("done", { exitCode: code, sessionId: this.id });
      this.process = null;
    });
  }

  private processEvent(event: CLIEvent): void {
    switch (event.type) {
      case "system":
        if (event.subtype === "init" && event.session_id) {
          this.cliSessionId = event.session_id;
          this.emit("init", {
            sessionId: event.session_id,
            model: event.model,
            tools: event.tools,
          });
        }
        // Ignore hook_started, hook_response events
        break;

      case "assistant": {
        const msg = event.message;
        if (!msg) return;

        // Claude Code's stream-json sends multiple assistant events with the
        // same message.id, each containing DIFFERENT content block types
        // (e.g. event1 has thinking, event2 has text, event3 has tool_use).
        // Deduplicate text/thinking per message.id to prevent duplicate emission,
        // but always allow tool_use/tool_result through (they have unique IDs).
        for (const block of msg.content) {
          switch (block.type) {
            case "text": {
              const textKey = `${msg.id}:text`;
              if (!this.emittedTextIds.has(textKey)) {
                this.emittedTextIds.add(textKey);
                const textPreview = block.text?.slice(0, 80) ?? "";
                console.log(`[CLI] Emitting text for ${msg.id}: "${textPreview}..."`);
                this.emit("text", {
                  messageId: msg.id,
                  text: block.text,
                });
              } else {
                console.log(`[CLI] Skipping duplicate text for ${msg.id}`);
              }
              break;
            }
            case "thinking": {
              const thinkKey = `${msg.id}:thinking`;
              if (!this.emittedThinkingIds.has(thinkKey)) {
                this.emittedThinkingIds.add(thinkKey);
                this.emit("thinking", {
                  messageId: msg.id,
                  thinking: block.thinking,
                });
              }
              break;
            }
            case "tool_use":
              this.emit("tool_use", {
                messageId: msg.id,
                toolId: block.id,
                name: block.name,
                input: block.input,
              });
              break;
            case "tool_result":
              this.emit("tool_result", {
                messageId: msg.id,
                toolUseId: block.tool_use_id,
                content: normalizeToolContent(block.content),
                isError: block.is_error,
              });
              break;
          }
        }
        break;
      }

      case "user": {
        const msg = event.message;
        if (!msg) return;
        for (const block of msg.content) {
          if (block.type === "tool_result") {
            const content = normalizeToolContent(block.content);
            this.emit("tool_result", {
              messageId: msg.id,
              toolUseId: block.tool_use_id,
              content,
              isError: block.is_error,
            });
          }
        }
        break;
      }

      case "result":
        this.emit("result", {
          text: event.result,
          isError: event.is_error,
          durationMs: event.duration_ms,
          usage: event.usage,
          stopReason: event.stop_reason,
          sessionId: event.session_id,
        });
        break;
    }
  }

  setResumeId(id: string): void {
    this.cliSessionId = id;
  }

  kill(): void {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  get isRunning(): boolean {
    return this.process !== null;
  }
}
