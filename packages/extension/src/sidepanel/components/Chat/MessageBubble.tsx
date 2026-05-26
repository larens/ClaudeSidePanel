import { useState } from "react";
import type { Message } from "@/lib/protocol";
import { Markdown } from "../shared/Markdown";
import { ToolCallCard } from "./ToolCallCard";

interface Props {
  message: Message;
  onRetry?: (messageId: string) => void;
  /** When true, only render dots (no vertical line) — line is provided by parent timeline */
  timelineDotsOnly?: boolean;
}

export function MessageBubble({ message, onRetry, timelineDotsOnly }: Props) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center animate-fade-in">
        <span className="text-xs text-claude-muted bg-claude-surface px-3 py-1 rounded-full border border-claude-border/10">
          {message.content}
        </span>
      </div>
    );
  }

  const isUser = message.role === "user";
  const hasTimelineItems =
    !isUser &&
    (message.thinking || (message.toolCalls && message.toolCalls.length > 0));

  return (
    <div
      className={`animate-slide-up group flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] relative ${
          isUser
            ? "bg-claude-surface text-claude-text rounded-lg px-3 py-2 border border-claude-border/15"
            : "text-claude-text"
        }`}
      >
        {isUser ? (
          <>
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
            <MessageActions
              content={message.content}
              isUser
              onRetry={() => onRetry?.(message.id)}
            />
          </>
        ) : (
          <div className="space-y-2">
            {/* Timeline items — dots only when parent provides the line */}
            {hasTimelineItems && (
              <div className="relative">
                {!timelineDotsOnly && (
                  <div
                    className="absolute left-[3px] top-0 bottom-0 w-px rounded-full"
                    style={{ backgroundColor: "rgba(128,128,128,0.3)" }}
                  />
                )}

                {/* Thinking block */}
                {message.thinking && (
                  <div className="relative flex gap-2.5 pb-2">
                    <span className="relative z-10 w-[6px] h-[6px] rounded-full bg-claude-muted shrink-0 mt-[11px]" />
                    <div className="flex-1 min-w-0">
                      <ThinkingBlock text={message.thinking} />
                    </div>
                  </div>
                )}

                {/* Tool calls */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <div className="space-y-1.5">
                    {message.toolCalls.map((tc) => (
                      <div key={tc.id} className="relative flex gap-2.5">
                        <span className="relative z-10 w-[6px] h-[6px] rounded-full bg-claude-success shrink-0 mt-[11px]" />
                        <div className="flex-1 min-w-0">
                          <ToolCallCard toolCall={tc} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Text content */}
            {message.content && <Markdown content={message.content} />}

            {/* Streaming indicator */}
            {message.isStreaming && !message.content && !message.thinking && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-claude-accent animate-pulse" />
              </div>
            )}

            {/* Assistant message actions */}
            {!message.isStreaming && message.content && (
              <MessageActions content={message.content} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageActions({
  content,
  isUser,
  onRetry,
}: {
  content: string;
  isUser?: boolean;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <button
        onClick={handleCopy}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-claude-muted hover:text-claude-text hover:bg-claude-border/30 transition-colors"
        title="Copy"
      >
        {copied ? (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
        {copied ? "Copied" : "Copy"}
      </button>
      {isUser && onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-claude-muted hover:text-claude-text hover:bg-claude-border/30 transition-colors"
          title="Retry"
        >
          <svg
            width="10"
            height="10"
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
  );
}

function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-claude-surface rounded-lg overflow-hidden border border-claude-border/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-claude-muted hover:bg-claude-border/20 transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
        </svg>
        <span>Thinking</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`ml-auto transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="px-3 pb-2 text-xs text-claude-muted leading-relaxed max-h-48 overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  );
}
