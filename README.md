# ClaudeSidePanel

ClaudeSidePanel 是一个 Chrome Side Panel 扩展，将本地 Claude Code CLI 的完整能力带入浏览器侧栏——文件读写、终端执行、代码搜索、页面交互，一站式完成。

- **对话 & 工具**：通过 WebSocket 桥接调用本机 Claude Code CLI
- **本地优先**：所有数据保留在本机，扩展状态存储在 `chrome.storage.local`

## 仓库结构

- `packages/extension/`：Chrome 扩展与 Side Panel UI（React 18 + TypeScript + Tailwind CSS）
- `packages/bridge/`：Node.js WebSocket 桥接服务，管理 Claude CLI 进程
- `docs/`：设计文档与规范

## 功能概览

- **完整 Claude Code 能力** — 文件读写、终端执行、代码搜索，覆盖所有 CLI 工具
- **流式响应** — 实时文本与工具调用可视化
- **会话管理** — 创建、切换、删除对话会话，历史记录持久化
- **网页上下文** — 总结页面、解释选中文本、注入页面内容到提示词
- **右键菜单** — 选中文字提问 Claude，或总结当前页面
- **工具可视化** — Diff 视图、文件预览、终端输出、搜索结果
- **深色/浅色主题** — 跟随系统偏好或手动切换
- **安全** — 仅 localhost 通信，Token 认证

## 架构

```text
┌──────────────────┐      WebSocket (localhost)     ┌─────────────────────┐
│  Side Panel UI   │  ──────────────────────────▶  │  Bridge Server      │
│  extension/      │   JSON-RPC over WS            │  packages/bridge/   │
│  React + TS      │                               │  Node.js            │
└──────┬───────────┘                               └──────────┬──────────┘
       │                                                      │
       │ chrome.runtime                                       │ spawn
       │                                                      │
┌──────▼────────────────┐                          ┌──────────▼──────────┐
│  Background Worker    │                          │  Claude Code CLI    │
│  service-worker.js    │                          │  (本地进程)          │
└──────┬────────────────┘                          └─────────────────────┘
       │
       │ Fetch (页面内容抓取)
       ▼
  目标网页 DOM
```

## 快速开始

### 前置条件

- Node.js `>=18`
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) 已安装并完成认证（`npm install -g @anthropic-ai/claude-code`）
- Chrome / Edge / Brave / Arc 等 Chromium 浏览器

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动桥接服务

```bash
pnpm dev:bridge
```

### 3. 构建扩展

```bash
pnpm build
```

### 4. 加载扩展

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `packages/extension/dist`

### 5. 打开侧栏

点击浏览器工具栏中的扩展图标，打开 Side Panel。

## 开发模式

```bash
# 终端 1：启动桥接服务（热重载）
pnpm dev:bridge

# 终端 2：构建扩展（监听变更自动重建）
pnpm --filter @claudeweb/extension dev

# 在 Chrome 中加载 packages/extension/dist
```

## 设置

点击侧栏右上角齿轮图标打开设置面板：

| 设置项 | 说明 |
|--------|------|
| 主题 | 浅色 / 深色 / 跟随系统 |
| Claude CLI 路径 | 自定义 CLI 可执行文件路径 |
| 桥接服务地址 | WebSocket 连接地址，默认 `ws://localhost:3000` |

## Troubleshooting

- **桥接服务连接失败**
  - 确认 `pnpm dev:bridge` 正在运行
  - 检查端口 3000 是否被占用
  - 查看终端日志输出

- **Claude CLI 找不到**
  - 确认 `claude` 命令在 PATH 中可用
  - 或在设置中指定 CLI 可执行文件的绝对路径

- **扩展加载失败**
  - 确认已执行 `pnpm build`
  - 检查 `packages/extension/dist` 目录是否存在

- **工具调用无响应**
  - 确认 Claude Code CLI 已认证（`claude` 命令可正常对话）
  - 重启桥接服务后重试

## License

MIT
