import chalk from "chalk";
import { getOrCreateToken } from "./auth.js";
import { BridgeServer } from "./server.js";
import { DEFAULT_PORT } from "./protocol.js";

const port = parseInt(process.env.CLAUDE_WEB_PORT ?? String(DEFAULT_PORT), 10);
const token = getOrCreateToken();

console.log(chalk.bold.hex("#d4a574")("\n  ClaudeSidePanel Bridge\n"));
console.log(chalk.dim("  Starting WebSocket server..."));

const server = new BridgeServer({ port, token });

server
  .start()
  .then(() => {
    console.log(chalk.green(`  ✓ Listening on ws://127.0.0.1:${port}`));
    console.log(chalk.dim(`  Auth token: ${token.slice(0, 8)}...`));
    console.log(
      chalk.dim("  Waiting for Chrome extension connections...\n")
    );
  })
  .catch((err) => {
    console.error(chalk.red(`  ✗ Failed to start: ${err.message}`));
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGINT", () => {
  console.log(chalk.dim("\n  Shutting down..."));
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  server.stop();
  process.exit(0);
});
