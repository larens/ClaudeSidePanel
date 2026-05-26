import { useState } from "react";
import type { ToolCallInfo } from "@/lib/protocol";
import { ToolOutput } from "./ToolOutput";

interface Props {
  toolCall: ToolCallInfo;
  onRetry?: () => void;
}

const TOOL_ICONS: Record<string, string> = {
  Read: "📄",
  Edit: "✏️",
  Write: "📝",
  Bash: "💻",
  Search: "🔍",
  Glob: "📁",
  Grep: "🔎",
  WebFetch: "🌐",
  WebSearch: "🔎",
  Agent: "🤖",
  TodoWrite: "📋",
  Task: "📦",
};

export function ToolCallCard({ toolCall, onRetry }: Props) {
  const [expanded, setExpanded] = useState(false);
  const name = toolCall.name || "Tool";
  const icon = TOOL_ICONS[name] ?? "🔧";
  const statusColor =
    toolCall.status === "completed"
      ? "text-claude-success"
      : toolCall.status === "error"
      ? "text-claude-error"
      : "text-claude-warning";

  const summary = getToolSummary(toolCall);
  const hasOutput = Boolean(toolCall.output);
  const hasError = toolCall.status === "error";

  return (
    <div
      className={`bg-claude-surface/80 border rounded-lg overflow-hidden text-xs ${
        hasError ? "border-claude-error/30" : "border-claude-border/50"
      }`}
    >
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-claude-border/30 transition-colors text-left"
      >
        <span className={statusColor}>
          {toolCall.status === "running" ? (
            <svg
              className="animate-spin w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray="31.4 31.4"
              />
            </svg>
          ) : hasError ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          ) : (
            <span>{icon}</span>
          )}
        </span>
        <span className="font-medium text-claude-text">{name}</span>
        <span className="text-claude-muted truncate flex-1">{summary}</span>
        {(hasOutput || hasError || Object.keys(toolCall.input).length > 0) && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-claude-muted transition-transform shrink-0 ${
              expanded ? "rotate-180" : ""
            }`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-claude-border/50 space-y-2 p-2">
          {/* Input parameters */}
          {Object.keys(toolCall.input).length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-claude-muted/60 px-1">
                Input
              </div>
              {Object.entries(toolCall.input).map(([key, value]) => (
                <div key={key} className="flex gap-2 px-1">
                  <span className="text-claude-muted shrink-0">{key}:</span>
                  <span className="text-claude-text font-mono break-all">
                    {formatValue(value)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Tool-specific output */}
          {hasOutput && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-claude-muted/60 px-1 mb-1">
                Output
              </div>
              <ToolOutput toolCall={toolCall} />
            </div>
          )}

          {/* Error + retry */}
          {hasError && toolCall.output && (
            <div className="flex items-start gap-2 px-1">
              <div className="flex-1 text-claude-error bg-claude-error/10 rounded px-2 py-1.5">
                {toolCall.output}
              </div>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-claude-accent hover:text-claude-accent-hover bg-claude-accent/10 hover:bg-claude-accent/20 rounded transition-colors"
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
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getToolSummary(tc: ToolCallInfo): string {
  const input = tc.input;
  if (!input || Object.keys(input).length === 0) return "";

  switch (tc.name) {
    case "Read":
      return truncate(String(input.file_path ?? input.path ?? ""), 50);
    case "Edit":
      return truncate(String(input.file_path ?? ""), 50);
    case "Write":
      return truncate(String(input.file_path ?? input.filename ?? ""), 50);
    case "Bash":
      return truncate(String(input.command ?? ""), 60);
    case "Grep":
      return truncate(String(input.pattern ?? input.query ?? ""), 40);
    case "Glob":
      return truncate(String(input.pattern ?? ""), 40);
    case "WebFetch":
      return truncate(String(input.url ?? ""), 50);
    case "WebSearch":
      return truncate(String(input.query ?? ""), 40);
    case "Agent":
      return truncate(String(input.prompt ?? ""), 40);
    default:
      return truncate(JSON.stringify(input), 50);
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value.length > 300 ? value.slice(0, 300) + "..." : value;
  }
  const json = JSON.stringify(value, null, 2);
  return json.length > 300 ? json.slice(0, 300) + "..." : json;
}
