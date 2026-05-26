import { useState } from "react";

interface Props {
  command: string;
  output: string;
  exitCode?: number;
  duration?: number;
}

export function TerminalOutput({ command, output, exitCode, duration }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const hasError = exitCode !== undefined && exitCode !== 0;
  const lines = output.split("\n");
  const isLong = lines.length > 30;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-md border border-claude-border/15 overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-claude-surface border-b border-claude-border/15">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-claude-accent shrink-0"
        >
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        <span className="font-mono text-claude-muted truncate flex-1">
          $ {command}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {exitCode !== undefined && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                hasError
                  ? "bg-claude-error/15 text-claude-error"
                  : "bg-claude-success/15 text-claude-success"
              }`}
            >
              {exitCode}
            </span>
          )}
          {duration !== undefined && (
            <span className="text-claude-muted">{duration}ms</span>
          )}
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-claude-border/50 text-claude-muted hover:text-claude-text transition-colors"
          >
            {copied ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded hover:bg-claude-border/50 text-claude-muted"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Output */}
      {expanded && (
        <div className="relative">
          <pre
            className={`p-3 overflow-x-auto font-mono leading-relaxed ${
              hasError ? "text-claude-error/80" : "text-claude-muted"
            } ${isLong ? "max-h-60 overflow-y-auto" : ""}`}
          >
            {output || <span className="italic opacity-50">(no output)</span>}
          </pre>
        </div>
      )}
    </div>
  );
}
