import { useState, useMemo } from "react";

interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLine?: number;
  newLine?: number;
}

interface Props {
  oldString: string;
  newString: string;
  filePath?: string;
  expanded?: boolean;
  maxHeight?: string;
}

export function DiffView({ oldString, newString, filePath, expanded: initialExpanded = true, maxHeight }: Props) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const lines = useMemo(() => computeDiff(oldString, newString), [oldString, newString]);

  const stats = useMemo(() => {
    let adds = 0;
    let removes = 0;
    for (const line of lines) {
      if (line.type === "add") adds++;
      if (line.type === "remove") removes++;
    }
    return { adds, removes };
  }, [lines]);

  return (
    <div className="rounded-md border border-claude-border/15 overflow-hidden text-xs">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-claude-surface hover:bg-claude-border/20 transition-colors text-left"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-claude-accent shrink-0"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        {filePath && (
          <span className="font-mono text-claude-text truncate">{filePath}</span>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {stats.adds > 0 && (
            <span className="text-claude-success">+{stats.adds}</span>
          )}
          {stats.removes > 0 && (
            <span className="text-claude-error">-{stats.removes}</span>
          )}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-claude-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* Diff content */}
      {expanded && (
        <div className={`${maxHeight ?? "max-h-80"} overflow-y-auto`}>
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, i) => (
                <tr
                  key={i}
                  className={
                    line.type === "add"
                      ? "bg-claude-success/8"
                      : line.type === "remove"
                      ? "bg-claude-error/8"
                      : ""
                  }
                >
                  <td className="w-8 px-1 py-0 text-right text-claude-muted/50 select-none border-r border-claude-border/15">
                    {line.oldLine ?? ""}
                  </td>
                  <td className="w-8 px-1 py-0 text-right text-claude-muted/50 select-none border-r border-claude-border/15">
                    {line.newLine ?? ""}
                  </td>
                  <td className="w-5 px-0.5 py-0 text-center select-none">
                    <span
                      className={
                        line.type === "add"
                          ? "text-claude-success"
                          : line.type === "remove"
                          ? "text-claude-error"
                          : "text-transparent"
                      }
                    >
                      {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                    </span>
                  </td>
                  <td className="px-2 py-0 font-mono whitespace-pre">
                    <span
                      className={
                        line.type === "add"
                          ? "text-claude-success"
                          : line.type === "remove"
                          ? "text-claude-error"
                          : "text-claude-text"
                      }
                    >
                      {line.content}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Simple line-based diff computation.
 * Splits both strings into lines and produces a diff using LCS.
 */
function computeDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  // LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  const raw: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      raw.unshift({ type: "context", content: oldLines[i - 1], oldLine: i, newLine: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.unshift({ type: "add", content: newLines[j - 1], newLine: j });
      j--;
    } else {
      raw.unshift({ type: "remove", content: oldLines[i - 1], oldLine: i });
      i--;
    }
  }

  // Add context lines (limited) around changes
  const CONTEXT_LINES = 3;
  const changedIndices = new Set<number>();
  for (let idx = 0; idx < raw.length; idx++) {
    if (raw[idx].type !== "context") {
      for (let k = Math.max(0, idx - CONTEXT_LINES); k <= Math.min(raw.length - 1, idx + CONTEXT_LINES); k++) {
        changedIndices.add(k);
      }
    }
  }

  let lastIncluded = -1;
  for (let idx = 0; idx < raw.length; idx++) {
    if (changedIndices.has(idx)) {
      if (lastIncluded >= 0 && idx - lastIncluded > 1) {
        result.push({ type: "context", content: `@@ ${raw.length - idx} more lines @@` });
      }
      result.push(raw[idx]);
      lastIncluded = idx;
    }
  }

  // If very short, just return everything
  if (raw.length <= 20) return raw;

  return result;
}
