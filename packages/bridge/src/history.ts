import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";

// ── Types ──────────────────────────────────────────────────

export interface HistoryProject {
  encodedPath: string;
  decodedPath: string;
  name: string;
  sessionCount: number;
}

export interface HistorySessionMeta {
  sessionId: string;
  title: string;
  lastPrompt: string;
  leafUuid: string | null;
  timestamp: string;
  cwd: string;
  gitBranch: string;
  messageCount: number;
}

export interface HistoryMessage {
  uuid: string;
  parentUuid: string | null;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  thinking?: string;
  toolCalls?: HistoryToolCall[];
}

export interface HistoryToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: "completed" | "error";
}

export interface HistorySessionDetail extends HistorySessionMeta {
  messages: HistoryMessage[];
}

// ── Internal JSONL entry types ─────────────────────────────

interface JsonlEntry {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  message?: {
    id?: string;
    role?: string;
    content?: string | ContentBlock[];
    usage?: Record<string, unknown>;
  };
  aiTitle?: string;
  lastPrompt?: string;
  leafUuid?: string;
  [key: string]: unknown;
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

// ── Helpers ────────────────────────────────────────────────

const CLAUDE_DIR = join(homedir(), ".claude");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

export function decodePath(encoded: string): string {
  // "-Users-larens-workspace-X" -> "/Users/larens/workspace/X"
  return "/" + encoded.slice(1).replace(/-/g, "/");
}

// ── Public API ─────────────────────────────────────────────

export async function listProjects(): Promise<HistoryProject[]> {
  let entries: string[];
  try {
    entries = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }

  const projects: HistoryProject[] = [];

  for (const encoded of entries) {
    const dirPath = join(PROJECTS_DIR, encoded);
    const s = await stat(dirPath).catch(() => null);
    if (!s?.isDirectory()) continue;

    const files = await readdir(dirPath).catch(() => []);
    const sessionCount = files.filter((f) => f.endsWith(".jsonl")).length;
    if (sessionCount === 0) continue;

    const decodedPath = decodePath(encoded);
    projects.push({
      encodedPath: encoded,
      decodedPath,
      name: basename(decodedPath),
      sessionCount,
    });
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listSessions(
  projectPath: string
): Promise<HistorySessionMeta[]> {
  const dirPath = join(PROJECTS_DIR, projectPath);
  let files: string[];
  try {
    files = await readdir(dirPath);
  } catch {
    return [];
  }

  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
  const sessions: HistorySessionMeta[] = [];

  for (const file of jsonlFiles) {
    const sessionId = file.replace(".jsonl", "");
    const filePath = join(dirPath, file);

    // Scan for ai-title and last-prompt entries (stop early)
    let title = "";
    let lastPrompt = "";
    let leafUuid: string | null = null;
    let timestamp = "";
    let cwd = "";
    let gitBranch = "";

    const content = await readFile(filePath, "utf-8").catch(() => "");
    if (!content) continue;

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry: JsonlEntry = JSON.parse(line);

        if (entry.type === "ai-title" && entry.aiTitle) {
          title = entry.aiTitle;
        }

        if (entry.type === "last-prompt") {
          lastPrompt = entry.lastPrompt ?? "";
          leafUuid = entry.leafUuid ?? null;
        }

        // Grab metadata from any message entry
        if (!cwd && entry.cwd) cwd = entry.cwd;
        if (!gitBranch && entry.gitBranch) gitBranch = entry.gitBranch;
        if (!timestamp && entry.timestamp) timestamp = entry.timestamp;

        // Stop once we have both title hints
        if (title && lastPrompt && cwd) break;
      } catch {
        // skip malformed lines
      }
    }

    // Get file mtime as fallback timestamp
    if (!timestamp) {
      const s = await stat(filePath).catch(() => null);
      timestamp = s?.mtime.toISOString() ?? new Date().toISOString();
    }

    sessions.push({
      sessionId,
      title: title || lastPrompt || "Untitled Session",
      lastPrompt,
      leafUuid,
      timestamp,
      cwd,
      gitBranch,
      messageCount: 0, // computed on detail load
    });
  }

  return sessions.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export async function getSessionDetail(
  projectPath: string,
  sessionId: string
): Promise<HistorySessionDetail> {
  const filePath = join(PROJECTS_DIR, projectPath, `${sessionId}.jsonl`);
  const content = await readFile(filePath, "utf-8");

  // Parse all entries
  const entries: JsonlEntry[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }

  // Build uuid -> entry map
  const entryMap = new Map<string, JsonlEntry>();
  for (const entry of entries) {
    if (entry.uuid) entryMap.set(entry.uuid, entry);
  }

  // Find metadata
  let title = "";
  let lastPrompt = "";
  let leafUuid: string | null = null;
  let cwd = "";
  let gitBranch = "";
  let timestamp = "";

  for (const entry of entries) {
    if (entry.type === "ai-title" && entry.aiTitle) title = entry.aiTitle;
    if (entry.type === "last-prompt") {
      lastPrompt = entry.lastPrompt ?? "";
      leafUuid = entry.leafUuid ?? null;
    }
    if (!cwd && entry.cwd) cwd = entry.cwd;
    if (!gitBranch && entry.gitBranch) gitBranch = entry.gitBranch;
    if (!timestamp && entry.timestamp) timestamp = entry.timestamp;
  }

  // Walk the message tree from leafUuid back to root
  const mainPath: JsonlEntry[] = [];
  let current = leafUuid;

  if (!current) {
    // Fallback: find the last user/assistant entry with no children
    const childUuids = new Set<string>();
    for (const e of entries) {
      if (e.parentUuid) childUuids.add(e.parentUuid);
    }
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (
        e.uuid &&
        (e.type === "user" || e.type === "assistant") &&
        !childUuids.has(e.uuid)
      ) {
        current = e.uuid;
        break;
      }
    }
  }

  while (current) {
    const entry = entryMap.get(current);
    if (!entry) break;
    if (
      (entry.type === "user" || entry.type === "assistant") &&
      !entry.isSidechain
    ) {
      mainPath.push(entry);
    }
    current = entry.parentUuid ?? null;
  }

  mainPath.reverse();

  // Convert to HistoryMessage[]
  // Strategy: process entries in order. User entries with only tool_result
  // blocks are matched to the preceding assistant's tool_use. User entries
  // with text content become user messages. Consecutive assistant entries
  // with the same message.id are merged.
  const messages: HistoryMessage[] = [];
  let i = 0;

  while (i < mainPath.length) {
    const entry = mainPath[i];

    if (entry.type === "user") {
      // Check if this user entry is purely tool_results
      const hasToolResults = isToolResultEntry(entry);
      const hasText = hasTextContent(entry);

      if (hasToolResults && !hasText) {
        // Match tool results to the last assistant message's tool calls
        attachToolResults(entry, messages);
        i++;
      } else {
        // Regular user message (may also have tool_results mixed in)
        const content = extractUserContent(entry);
        if (content.trim()) {
          messages.push({
            uuid: entry.uuid!,
            parentUuid: entry.parentUuid ?? null,
            role: "user",
            content,
            timestamp: entry.timestamp ?? "",
          });
        }
        // Also attach any tool_results if present
        if (hasToolResults) {
          attachToolResults(entry, messages);
        }
        i++;
      }
    } else if (entry.type === "assistant") {
      // Merge consecutive assistant entries with the same message.id
      const msgId = entry.message?.id;
      const textParts: string[] = [];
      const thinkingParts: string[] = [];
      const toolCalls: HistoryToolCall[] = [];

      let j = i;
      while (j < mainPath.length) {
        const e = mainPath[j];
        if (e.type !== "assistant") break;
        if (msgId && e.message?.id && e.message.id !== msgId && j > i) break;

        extractAssistantContent(e, textParts, thinkingParts, toolCalls);
        j++;
      }

      const text = textParts.join("");
      const thinking = thinkingParts.join("");

      // Only add if there's actual content
      if (text || thinking || toolCalls.length > 0) {
        messages.push({
          uuid: entry.uuid!,
          parentUuid: entry.parentUuid ?? null,
          role: "assistant",
          content: text,
          timestamp: entry.timestamp ?? "",
          thinking: thinking || undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        });
      }
      i = j;
    } else {
      i++;
    }
  }

  return {
    sessionId,
    title: title || lastPrompt || "Untitled Session",
    lastPrompt,
    leafUuid,
    timestamp,
    cwd,
    gitBranch,
    messageCount: messages.length,
    messages,
  };
}

export async function searchSessions(
  query: string
): Promise<(HistorySessionMeta & { projectName: string })[]> {
  const projects = await listProjects();
  const results: (HistorySessionMeta & { projectName: string })[] = [];
  const lowerQuery = query.toLowerCase();

  for (const project of projects) {
    const sessions = await listSessions(project.encodedPath);
    for (const session of sessions) {
      if (
        session.title.toLowerCase().includes(lowerQuery) ||
        session.lastPrompt.toLowerCase().includes(lowerQuery)
      ) {
        results.push({ ...session, projectName: project.name });
        if (results.length >= 50) return results;
      }
    }
  }

  return results;
}

// ── Internal helpers ───────────────────────────────────────

function isToolResultEntry(entry: JsonlEntry): boolean {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some((b: ContentBlock) => b.type === "tool_result");
}

function hasTextContent(entry: JsonlEntry): boolean {
  const content = entry.message?.content;
  if (typeof content === "string") return content.trim().length > 0;
  if (Array.isArray(content)) {
    return content.some(
      (b: ContentBlock) => b.type === "text" && b.text?.trim()
    );
  }
  return false;
}

function extractUserContent(entry: JsonlEntry): string {
  const content = entry.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: ContentBlock) => b.type === "text")
      .map((b: ContentBlock) => b.text ?? "")
      .join("");
  }
  return "";
}

function extractAssistantContent(
  entry: JsonlEntry,
  textParts: string[],
  thinkingParts: string[],
  toolCalls: HistoryToolCall[]
): void {
  const content = entry.message?.content;
  if (!content || !Array.isArray(content)) return;

  for (const block of content as ContentBlock[]) {
    switch (block.type) {
      case "text":
        if (block.text) textParts.push(block.text);
        break;
      case "thinking":
        if (block.thinking) thinkingParts.push(block.thinking);
        break;
      case "tool_use":
        toolCalls.push({
          id: block.id ?? "",
          name: block.name ?? "",
          input: block.input ?? {},
          status: "completed",
        });
        break;
    }
  }
}

function attachToolResults(
  entry: JsonlEntry,
  messages: HistoryMessage[]
): void {
  const content = entry.message?.content;
  if (!Array.isArray(content)) return;

  // Find the last assistant message with tool calls
  let lastAssistant: HistoryMessage | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].toolCalls?.length) {
      lastAssistant = messages[i];
      break;
    }
  }
  if (!lastAssistant?.toolCalls) return;

  // Build tool_use_id -> tool call map
  const toolCallMap = new Map<string, HistoryToolCall>();
  for (const tc of lastAssistant.toolCalls) {
    toolCallMap.set(tc.id, tc);
  }

  // Attach results
  for (const block of content as ContentBlock[]) {
    if (block.type === "tool_result" && block.tool_use_id) {
      const tc = toolCallMap.get(block.tool_use_id);
      if (tc) {
        tc.output = block.content ?? "";
        tc.status = block.is_error ? "error" : "completed";
      }
    }
  }
}
