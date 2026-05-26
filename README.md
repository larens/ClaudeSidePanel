# ClaudeSidePanel

Chrome browser sidebar extension powered by the local Claude CLI. Get the full power of Claude Code directly in your browser — read files, run commands, search code, and interact with web pages.

## Architecture

```
Chrome Side Panel (React)  <──WebSocket──>  Bridge (Node.js)  <──spawn──>  Claude CLI
```

- **Extension**: React 18 + TypeScript + Tailwind CSS, built with Vite + CRXJS
- **Bridge**: Lightweight Node.js WebSocket server that spawns and manages Claude CLI processes
- **Communication**: JSON-RPC style protocol over WebSocket (localhost only)

## Prerequisites

- Node.js >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated (`npm install -g @anthropic-ai/claude-code`)
- Google Chrome (or Chromium-based browser)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the bridge server
pnpm dev:bridge

# In another terminal, build the extension
pnpm build

# Load in Chrome:
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select packages/extension/dist
```

## Development

```bash
# Terminal 1: Run bridge with hot-reload
pnpm dev:bridge

# Terminal 2: Build extension (rebuild on changes)
pnpm --filter @claudeweb/extension dev

# Load packages/extension/dist in Chrome
```

## Features

- **Full Claude Code capabilities** — file read/write, terminal execution, code search, all CLI tools
- **Streaming responses** — real-time text and tool call visualization
- **Session management** — create, switch, delete conversation sessions with persistent history
- **Web page context** — summarize pages, explain selections, inject page content into prompts
- **Right-click menu** — ask Claude about selected text or summarize any page
- **Tool visualization** — diff views for edits, file previews, terminal output, search results
- **Dark/Light themes** — follows system preference or manual selection
- **Secure** — localhost-only WebSocket with token authentication

## Project Structure

```
claudeweb/
├── packages/
│   ├── extension/          # Chrome extension (Side Panel + Content Script + Service Worker)
│   │   ├── src/
│   │   │   ├── sidepanel/  # React app (UI components, stores, hooks)
│   │   │   ├── background/ # Service worker
│   │   │   ├── content/    # Content script (page context extraction)
│   │   │   └── lib/        # Bridge client, protocol types
│   │   ├── manifest.json
│   │   └── vite.config.ts
│   └── bridge/             # Node.js WebSocket bridge
│       └── src/            # Server, session manager, CLI spawner
├── package.json            # Monorepo root
└── pnpm-workspace.yaml
```

## License

MIT
