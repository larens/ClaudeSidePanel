import { useState } from "react";

interface Props {
  content: string;
  filePath: string;
  language?: string;
  maxLines?: number;
}

const LANG_EXTENSIONS: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  css: "css",
  html: "html",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  sh: "bash",
  bash: "bash",
  sql: "sql",
  xml: "xml",
  toml: "toml",
  dockerfile: "dockerfile",
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANG_EXTENSIONS[ext] ?? "text";
}

export function FileView({ content, filePath, language, maxLines = 50 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const lang = language ?? detectLanguage(filePath);
  const lines = content.split("\n");
  const isTruncated = lines.length > maxLines;
  const displayContent = expanded ? content : lines.slice(0, maxLines).join("\n");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-claude-border/50 overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-claude-surface/80 border-b border-claude-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-claude-accent shrink-0"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="font-mono text-claude-text truncate">{filePath}</span>
          <span className="text-claude-muted shrink-0">{lines.length} lines</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-claude-muted">{lang}</span>
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-claude-border/50 text-claude-muted hover:text-claude-text transition-colors"
            title="Copy content"
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
        </div>
      </div>

      {/* Content */}
      <div className="relative">
        <pre className="p-3 overflow-x-auto max-h-80 overflow-y-auto">
          <code className={`language-${lang}`}>{displayContent}</code>
        </pre>

        {/* Show more/less */}
        {isTruncated && !expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-claude-bg to-transparent flex items-end justify-center pb-1">
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-claude-accent hover:text-claude-accent-hover bg-claude-surface px-3 py-1 rounded-full border border-claude-border/50 transition-colors"
            >
              Show all {lines.length} lines
            </button>
          </div>
        )}
        {isTruncated && expanded && (
          <div className="flex justify-center py-1 border-t border-claude-border/30">
            <button
              onClick={() => setExpanded(false)}
              className="text-xs text-claude-muted hover:text-claude-text transition-colors"
            >
              Collapse
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
