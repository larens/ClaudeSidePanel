import { useState } from "react";
import type { ToolCallInfo } from "@/lib/protocol";
import { ToolOutput } from "./ToolOutput";

interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

interface Props {
  toolCall: ToolCallInfo;
  onRetry?: () => void;
}

function ToolIcon({ name, className }: { name: string; className?: string }) {
  const cls = className ?? "";
  switch (name) {
    case "Read":
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "Edit":
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case "Write":
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
          <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
        </svg>
      );
    case "Bash":
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      );
    case "Grep":
    case "Glob":
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case "Agent":
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v4" />
          <circle cx="8" cy="16" r="1" />
          <circle cx="16" cy="16" r="1" />
        </svg>
      );
    case "TodoWrite":
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M9 9l2 2 4-4" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      );
    default:
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      );
  }
}

export function ToolCallCard({ toolCall, onRetry }: Props) {
  const [expanded, setExpanded] = useState(false);
  const name = toolCall.name || "Tool";
  const statusColor =
    toolCall.status === "completed"
      ? "text-claude-success"
      : toolCall.status === "error"
      ? "text-claude-error"
      : "text-claude-accent";

  const summary = getToolSummary(toolCall);
  const hasOutput = Boolean(toolCall.output);
  const hasError = toolCall.status === "error";
  const hasInput = Object.keys(toolCall.input).length > 0;
  const isTodoWrite = name === "TodoWrite" && Array.isArray(toolCall.input.todos);
  const showExpandToggle = hasInput || isTodoWrite;

  return (
    <div
      className={`bg-claude-surface rounded-lg overflow-hidden text-xs border border-claude-border/10 ${
        hasError ? "!border-claude-error/20" : ""
      }`}
    >
      {/* Header */}
      <button
        onClick={() => showExpandToggle && setExpanded(!expanded)}
        className={`flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-claude-border/20 transition-colors text-left ${
          !showExpandToggle ? "cursor-default" : ""
        }`}
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
          ) : toolCall.status === "completed" ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <ToolIcon name={name} />
          )}
        </span>
        <span className="font-medium text-claude-text">{name}</span>
        <span className="text-claude-muted truncate flex-1">{summary}</span>
        {showExpandToggle && (
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

      {/* Tool output — always visible when available (matches VSCode inline display) */}
      {hasOutput && !expanded && (
        <div className="border-t border-claude-border/10 p-2">
          <ToolOutput toolCall={toolCall} />
        </div>
      )}

      {/* Error — always visible */}
      {hasError && toolCall.output && !expanded && (
        <div className="border-t border-claude-border/10 p-2">
          <div className="flex items-start gap-2">
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
        </div>
      )}

      {/* Expanded details (input params, TodoWrite list) */}
      {expanded && (
        <div className="border-t border-claude-border/10 space-y-2 p-2">
          {/* TodoWrite: show todo list */}
          {isTodoWrite ? (
            <TodoList todos={toolCall.input.todos as TodoItem[]} />
          ) : name === "Edit" ? null : hasInput ? (
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
          ) : null}

          {/* Tool-specific output (in expanded view) */}
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
    case "TodoWrite": {
      const todos = input.todos;
      if (Array.isArray(todos)) {
        const done = todos.filter((t: TodoItem) => t.status === "completed").length;
        return `${done}/${todos.length} tasks`;
      }
      return "";
    }
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

function TodoList({ todos }: { todos: TodoItem[] }) {
  return (
    <div className="space-y-1 px-1">
      {todos.map((todo, i) => (
        <div key={i} className="flex items-start gap-2 py-0.5">
          <span className="shrink-0 mt-0.5">
            {todo.status === "completed" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-claude-success">
                <circle cx="12" cy="12" r="10" />
                <polyline points="9 12 11.5 14.5 16 9.5" />
              </svg>
            ) : todo.status === "in_progress" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-claude-accent">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-claude-muted/50">
                <circle cx="12" cy="12" r="10" />
              </svg>
            )}
          </span>
          <span className={`text-xs leading-relaxed ${
            todo.status === "completed"
              ? "text-claude-muted line-through"
              : todo.status === "in_progress"
              ? "text-claude-text"
              : "text-claude-muted"
          }`}>
            {todo.content}
            {todo.status === "in_progress" && todo.activeForm && (
              <span className="text-claude-accent ml-1">({todo.activeForm})</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
