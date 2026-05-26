import { useState } from "react";
import type { Message } from "@/lib/protocol";
import { Markdown } from "../shared/Markdown";
import { ToolCallCard } from "./ToolCallCard";

interface Props {
  message: Message;
  onRetry?: (messageId: string) => void;
}

export function MessageBubble({ message, onRetry }: Props) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center animate-fade-in">
        <span className="text-xs text-claude-muted bg-claude-surface px-3 py-1 rounded-full border border-claude-border/50">
          {message.content}
        </span>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div
      className={`animate-slide-up group flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] relative ${
          isUser
            ? "bg-claude-accent/15 text-claude-text rounded-2xl rounded-br-md px-3.5 py-2.5"
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
            {/* Thinking block */}
            {message.thinking && <ThinkingBlock text={message.thinking} />}

            {/* Tool calls */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="space-y-1.5">
                {message.toolCalls.map((tc) => (
                  <ToolCallCard key={tc.id} toolCall={tc} />
                ))}
              </div>
            )}

            {/* Text content */}
            {message.content && <Markdown content={message.content} />}

            {/* Streaming indicator */}
            {message.isStreaming && !message.content && !message.thinking && (
              <div className="flex items-center gap-1.5 text-claude-muted">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-claude-accent animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-claude-accent animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-claude-accent animate-bounce [animation-delay:300ms]" />
                </div>
                <span className="text-xs">Thinking...</span>
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
    <div className="bg-claude-surface/50 border border-claude-border/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-claude-muted hover:bg-claude-border/20 transition-colors"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
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
        <div className="px-3 pb-2 text-xs text-claude-muted italic leading-relaxed max-h-48 overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  );
}
