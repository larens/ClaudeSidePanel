# Message Stream Style Alignment with VSCode Claude Code Extension

Date: 2026-05-26
Status: Approved
Scope: Message stream components only (ChatView, MessageBubble, ToolCallCard, Thinking, Timeline, Streaming, CodeBlocks)

## Goal

Match the visual style of the official VSCode Claude Code extension's message stream 1:1 in the Chrome Side Panel browser extension, with allowances for browser sidebar adaptation.

## Approach

Incremental restyling of existing components (Approach A). The current architecture already has the correct building blocks (timeline dots, collapsible cards, thinking blocks). Changes are primarily CSS/Tailwind class adjustments with minor structural tweaks.

## Files to Modify

1. `packages/extension/src/sidepanel/styles/globals.css` — Color tokens
2. `packages/extension/tailwind.config.ts` — Tailwind theme extensions
3. `packages/extension/src/sidepanel/components/Chat/MessageBubble.tsx` — User message + thinking block + streaming indicator
4. `packages/extension/src/sidepanel/components/Chat/ToolCallCard.tsx` — Tool call cards + SVG icons
5. `packages/extension/src/sidepanel/components/Chat/ChatView.tsx` — Timeline line + message grouping spacing
6. `packages/extension/src/sidepanel/components/shared/Markdown.tsx` — Code block styling
7. `packages/extension/src/sidepanel/components/Chat/DiffView.tsx` — Border radius + header consistency
8. `packages/extension/src/sidepanel/components/Chat/FileView.tsx` — Border radius + header consistency
9. `packages/extension/src/sidepanel/components/Chat/TerminalOutput.tsx` — Border radius + header consistency

## Design Specifications

### 1. Color & Typography Tokens

Update CSS variables in `globals.css`:

**Dark theme:**
| Token | Current | New |
|---|---|---|
| `--color-bg` | `#1a1a1a` | `#1e1e1e` |
| `--color-surface` | `#242424` | `#252526` |
| `--color-surface-raised` | `#2e2e2e` | `#2d2d2d` |
| `--color-border` | `#333333` | `#3c3c3c` |
| `--color-text` | `#e5e5e5` | `#cccccc` |
| `--color-muted` | `#888888` | `#808080` |
| `--color-accent` | `#d4a574` | `#d4a574` (unchanged) |
| `--color-accent-hover` | `#e0b88a` | `#e0b88a` (unchanged) |
| `--color-success` | `#4ade80` | `#4ade80` (unchanged) |
| `--color-error` | `#f87171` | `#f87171` (unchanged) |
| `--color-warning` | `#fbbf24` | `#fbbf24` (unchanged) |

**Light theme:**
| Token | Current | New |
|---|---|---|
| `--color-surface` | `#f5f5f5` | `#f3f3f3` |
| `--color-text` | `#1a1a1a` | `#1e1e1e` |
| `--color-muted` | `#666666` | `#616161` |

Typography: Inter + JetBrains Mono (unchanged).

### 2. User Messages

Transform from chat bubbles to flat cards:

**Before:**
```
className="bg-claude-surface-raised text-claude-text rounded-2xl rounded-br-md px-3.5 py-2.5 border border-claude-border/10"
```

**After:**
```
className="bg-claude-surface text-claude-text rounded-lg px-3 py-2 border border-claude-border/30"
```

Changes:
- Border radius: `rounded-2xl` (16px) → `rounded-lg` (8px)
- Remove asymmetric `rounded-br-md` bubble tail
- Background: `surface-raised` → `surface` (more subtle)
- Border opacity: `/10` → `/30` (more visible but not heavy)
- Padding: `px-3.5 py-2.5` → `px-3 py-2` (slightly tighter)
- Max width: `max-w-[85%]` → `max-w-[80%]`
- Text: keep `text-sm`

### 3. Assistant Messages & Timeline

**Timeline vertical line:**
```
Current: width 1.5px, rgba(136,136,136,0.25)
New:     width 1px,   rgba(128,128,128,0.3)
```

**Timeline dots:**
```
Current: w-[7px] h-[7px] (7px)
New:     w-[6px] h-[6px] (6px)
```

**Message spacing:**
```
Current: mb-4 between messages
New:     mb-3 between messages (tighter grouping)
```

**Assistant message container:**
- No background (unchanged)
- `text-claude-text` (unchanged)
- Markdown area: `text-sm leading-relaxed` (unchanged)

### 4. Tool Call Cards

**Icon system — replace Emoji with SVG:**
| Tool | SVG Description |
|---|---|
| Read | File/document icon |
| Edit | Pencil/pen icon |
| Write | Document with line icon |
| Bash | Terminal prompt icon |
| Grep | Search/magnifying glass icon |
| Glob | Folder/search icon |
| Agent | Robot/bot icon |
| Default | Wrench icon |

All SVGs: 12x12, stroke-based, `currentColor`.

**Card styling:**
```
Current: bg-claude-surface/80 rounded-lg px-3 py-2
New:     bg-claude-surface rounded-lg px-2.5 py-1.5 border border-claude-border/20
```

**Status indicators:**
| Status | Current | New |
|---|---|---|
| Running | `animate-spin` circle | `animate-spin` circle, `text-claude-accent` |
| Completed | Emoji icon | SVG checkmark, `text-claude-success` |
| Error | SVG X icon | SVG X icon (unchanged), `text-claude-error` |

**Header layout:**
```
[status-icon] [tool-name: font-medium] [summary: text-muted truncate] [expand-arrow]
```
- Tool name: `text-xs font-medium text-claude-text`
- Summary: `text-xs text-claude-muted truncate`
- Expand arrow: `text-claude-muted`, rotates on expand

**Expanded content:**
- Input/Output labels: `text-[10px] uppercase tracking-wider text-claude-muted/60`
- Error retry button: keep current styling

### 5. Thinking Block

**Icon:** Replace `circle + i` info icon with a sparkle/lightbulb SVG icon (12x12, stroke-based, `currentColor`). Use the VSCode-style lightbulb outline icon (a simple bulb shape with rays).

**Collapsed header:**
```
Current: bg-claude-surface/50 rounded-lg px-3 py-1.5
New:     bg-claude-surface rounded-lg px-2.5 py-1.5 border border-claude-border/20
```

**Expanded content:**
```
Current: text-xs italic text-claude-muted max-h-48
New:     text-xs text-claude-muted max-h-48 (remove italic)
```

**Label:** "Thinking" (keep English, matches VSCode).

### 6. Streaming Indicator

**Before:**
```
Three 6px dots with animate-bounce + staggered delays + "Thinking..." text
```

**After:**
```
Single 8px dot with animate-pulse (soft glow), bg-claude-accent, no text label
```

Rationale:
- Simpler, less visual noise
- Matches VSCode Claude extension's waiting state
- Saves space in narrow sidebar

### 7. Code Blocks & System Messages

**CodeBlock (Markdown.tsx):**
```
Border radius: rounded-lg → rounded-md (6px)
Header bg: bg-claude-surface/80 → bg-claude-surface
Content padding: p-3 → p-2.5
```

**System messages:**
```
Border: add border-claude-border/30
Background: bg-claude-surface (unchanged)
```

**DiffView / FileView / TerminalOutput:**
```
Border radius: unified to rounded-md
Header bg: unified to bg-claude-surface
Border opacity: unified to border-claude-border/30
```

**MessageActions (Copy/Retry):**
No changes — hover reveal pattern is already correct.

## Implementation Order

1. Color tokens (globals.css)
2. User messages (MessageBubble.tsx)
3. Timeline + assistant messages (ChatView.tsx + MessageBubble.tsx)
4. Tool call cards (ToolCallCard.tsx)
5. Thinking block (MessageBubble.tsx)
6. Streaming indicator (MessageBubble.tsx)
7. Code blocks & system messages (Markdown.tsx, DiffView.tsx, FileView.tsx, TerminalOutput.tsx)

## Success Criteria

- Message stream visually matches VSCode Claude Code extension's style
- All existing functionality preserved (retry, copy, expand/collapse, streaming)
- Dark and light themes both updated
- No regressions in tool call visualization or markdown rendering
