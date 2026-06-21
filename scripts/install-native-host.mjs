#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const hostName = "com.claudesidepanel.bridge";
const defaultExtensionId = "jnbmilnhcipmgeakjeoenjagfjpfpmbe";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostPath = resolve(repoRoot, "packages/bridge/bin/claudesidepanel-native-host");
const nodePath = process.execPath;
const nativeHostSourcePath = resolve(repoRoot, "packages/bridge/dist/native-host.js");
const claudePath =
  process.env.CLAUDE_CLI_PATH ??
  execFileSync("sh", ["-lc", "command -v claude"], { encoding: "utf8" }).trim();
const extensionId =
  process.argv.find((arg) => arg.startsWith("--extension-id="))?.split("=")[1] ??
  defaultExtensionId;

const allowedOrigins = [`chrome-extension://${extensionId}/`];

const manifest = {
  name: hostName,
  description: "ClaudeSidePanel local bridge launcher",
  path: hostPath,
  type: "stdio",
  allowed_origins: allowedOrigins,
};

const home = homedir();
const targets = [
  `${home}/Library/Application Support/Google/Chrome/NativeMessagingHosts/${hostName}.json`,
  `${home}/Library/Application Support/Chromium/NativeMessagingHosts/${hostName}.json`,
  `${home}/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/${hostName}.json`,
  `${home}/Library/Application Support/Microsoft Edge/NativeMessagingHosts/${hostName}.json`,
];

await Promise.all(
  [
    readFile(hostPath, "utf8").then((content) =>
      writeFile(hostPath, content.replace(/__NODE_BIN__/g, nodePath), "utf8")
    ),
    readFile(nativeHostSourcePath, "utf8").then((content) =>
      writeFile(
        nativeHostSourcePath,
        content.replace(/__CLAUDE_CLI_PATH__/g, claudePath),
        "utf8"
      )
    ),
  ].concat(
  targets.map(async (target) => {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  })
  )
);

console.log(`Installed native messaging host: ${hostName}`);
console.log(`Allowed extension id: ${extensionId}`);
console.log(`Node executable: ${nodePath}`);
console.log(`Claude executable: ${claudePath}`);
for (const target of targets) console.log(`- ${target}`);
