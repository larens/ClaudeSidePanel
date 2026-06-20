#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const hostName = "com.claudesidepanel.bridge";
const defaultExtensionId = "jnbmilnhcipmgeakjeoenjagfjpfpmbe";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hostPath = resolve(repoRoot, "packages/bridge/bin/claudesidepanel-native-host");
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
  targets.map(async (target) => {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  })
);

console.log(`Installed native messaging host: ${hostName}`);
console.log(`Allowed extension id: ${extensionId}`);
for (const target of targets) console.log(`- ${target}`);
