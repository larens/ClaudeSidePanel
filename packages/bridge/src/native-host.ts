import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";

const port = Number.parseInt(process.env.CLAUDE_WEB_PORT ?? "18765", 10);
let bridgeProcess: ChildProcess | null = null;
let inputBuffer = Buffer.alloc(0);

function sendNativeMessage(payload: unknown): void {
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(header);
  process.stdout.write(json);
}

function isBridgeListening(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function ensureBridge(): Promise<void> {
  if (await isBridgeListening()) {
    sendNativeMessage({ ok: true, status: "already-running", port });
    return;
  }

  if (bridgeProcess && bridgeProcess.exitCode === null) {
    sendNativeMessage({ ok: true, status: "starting", port });
    return;
  }

  bridgeProcess = spawn(process.execPath, [new URL("./index.js", import.meta.url).pathname], {
    detached: true,
    env: {
      ...process.env,
      CLAUDE_WEB_PORT: String(port),
      CLAUDE_CLI_PATH: process.env.CLAUDE_CLI_PATH ?? "__CLAUDE_CLI_PATH__",
    },
    stdio: "ignore",
  });
  bridgeProcess.unref();
  sendNativeMessage({ ok: true, status: "started", port });
}

function consumeNativeMessages(): void {
  while (inputBuffer.length >= 4) {
    const messageLength = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length < 4 + messageLength) return;
    inputBuffer = inputBuffer.subarray(4 + messageLength);
    void ensureBridge();
  }
}

process.stdin.on("data", (chunk: Buffer) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  consumeNativeMessages();
});

process.stdin.on("end", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
