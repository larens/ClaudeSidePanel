import { access, realpath, stat } from "node:fs/promises";
import { basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { WorkspaceInfo } from "./protocol.js";

const execFileAsync = promisify(execFile);

function buildWorkspaceInfo(path: string, status: WorkspaceInfo["status"]): WorkspaceInfo {
  return {
    name: basename(path),
    path,
    status,
  };
}

export async function pickWorkspace(): Promise<WorkspaceInfo> {
  if (process.platform !== "darwin") {
    throw new Error("Native folder picker is only supported on macOS for now.");
  }

  const { stdout } = await execFileAsync("osascript", [
    "-e",
    'POSIX path of (choose folder with prompt "Select Workspace")',
  ]);

  const selectedPath = stdout.trim();
  if (!selectedPath) {
    throw new Error("No workspace was selected.");
  }

  return getWorkspaceMeta(selectedPath);
}

export async function getWorkspaceMeta(path: string): Promise<WorkspaceInfo> {
  const normalizedPath = await realpath(path);
  const entry = await stat(normalizedPath);

  if (!entry.isDirectory()) {
    throw new Error("Selected path is not a directory.");
  }

  await access(normalizedPath);
  return buildWorkspaceInfo(normalizedPath, "ready");
}

export async function validateWorkspace(path: string): Promise<WorkspaceInfo> {
  try {
    return await getWorkspaceMeta(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /ENOENT|not exist/i.test(message) ? "missing" : "error";
    return buildWorkspaceInfo(path, status);
  }
}
