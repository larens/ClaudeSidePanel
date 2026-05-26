import type { ToolCallInfo } from "@/lib/protocol";
import { DiffView } from "./DiffView";
import { FileView } from "./FileView";
import { TerminalOutput } from "./TerminalOutput";

interface Props {
  toolCall: ToolCallInfo;
}

/**
 * Renders tool-specific output based on the tool name.
 * Routes to DiffView for edits, FileView for reads, TerminalOutput for bash.
 */
export function ToolOutput({ toolCall }: Props) {
  const { name, input, output } = toolCall;

  if (!output) return null;

  switch (name) {
    case "Edit":
      return <EditOutput input={input} output={output} />;
    case "Read":
      return <ReadOutput input={input} output={output} />;
    case "Write":
      return <WriteOutput input={input} output={output} />;
    case "Bash":
      return <BashOutput input={input} output={output} />;
    case "Grep":
    case "Glob":
      return <SearchOutput output={output} toolName={name} />;
    default:
      return <GenericOutput output={output} />;
  }
}

function EditOutput({
  input,
  output,
}: {
  input: Record<string, unknown>;
  output: string;
}) {
  const filePath = String(input.file_path ?? input.path ?? "");
  const oldStr = String(input.old_string ?? input.oldString ?? "");
  const newStr = String(input.new_string ?? input.newString ?? "");

  return (
    <div className="space-y-1.5">
      {/* Diff view — fixed height, scrollable */}
      {oldStr && newStr && (
        <DiffView oldString={oldStr} newString={newStr} filePath={filePath} maxHeight="max-h-60" />
      )}
      {/* Result summary */}
      {output && (
        <div className="text-xs text-claude-muted bg-claude-bg/50 rounded px-2.5 py-1.5">
          {output}
        </div>
      )}
      {/* Fallback: no diff, just raw output */}
      {!oldStr && !newStr && output && (
        <pre className="p-2 bg-claude-bg rounded text-claude-muted text-xs overflow-x-auto max-h-40 overflow-y-auto">
          {output}
        </pre>
      )}
    </div>
  );
}

function ReadOutput({
  input,
  output,
}: {
  input: Record<string, unknown>;
  output: string;
}) {
  const filePath = String(input.file_path ?? input.path ?? "");

  // Check if output looks like an error
  if (output.startsWith("Error") || output.includes("not found")) {
    return (
      <div className="text-xs text-claude-error bg-claude-error/10 rounded px-3 py-2">
        {output}
      </div>
    );
  }

  return <FileView content={output} filePath={filePath} />;
}

function WriteOutput({
  input,
  output,
}: {
  input: Record<string, unknown>;
  output: string;
}) {
  const filePath = String(input.file_path ?? input.path ?? input.filename ?? "");
  const content = String(input.content ?? "");

  if (content) {
    return <FileView content={content} filePath={filePath} language="text" />;
  }

  return (
    <div className="text-xs text-claude-success bg-claude-success/10 rounded px-3 py-2">
      {output || "File written successfully"}
    </div>
  );
}

function BashOutput({
  input,
  output,
}: {
  input: Record<string, unknown>;
  output: string;
}) {
  const command = String(input.command ?? "");
  return <TerminalOutput command={command} output={output} />;
}

function SearchOutput({
  output,
  toolName,
}: {
  output: string;
  toolName: string;
}) {
  return (
    <div className="rounded-md border border-claude-border/30 overflow-hidden text-xs">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-claude-surface border-b border-claude-border/30">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-claude-accent"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="text-claude-text font-medium">{toolName} results</span>
      </div>
      <pre className="p-3 overflow-x-auto max-h-60 overflow-y-auto font-mono text-claude-muted">
        {output}
      </pre>
    </div>
  );
}

function GenericOutput({ output }: { output: string }) {
  return (
    <pre className="p-2 bg-claude-bg rounded text-claude-muted text-xs overflow-x-auto max-h-40 overflow-y-auto">
      {output}
    </pre>
  );
}
