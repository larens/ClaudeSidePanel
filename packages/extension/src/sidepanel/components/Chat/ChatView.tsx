import { useEffect, useRef, useCallback } from "react";
import { useChatStore } from "@/sidepanel/stores/chatStore";
import type { Message } from "@/lib/protocol";
import { MessageBubble } from "./MessageBubble";

export function ChatView() {
  const isZh = navigator.language?.toLowerCase().startsWith("zh");
  const t = (zh: string, en: string) => (isZh ? zh : en);

  const messages = useChatStore((s) => s.messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleRetry = useCallback(
    (messageId: string) => {
      // Find the user message and re-trigger sending
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return;
      const userMsg = messages[idx];
      if (userMsg.role !== "user") return;

      // Remove this message and everything after it
      const remaining = messages.slice(0, idx);
      useChatStore.setState({ messages: remaining });

      // Dispatch auto-send event with the message content
      window.dispatchEvent(
        new CustomEvent("claude-web-auto-send", {
          detail: { prompt: userMsg.content, autoSubmit: true },
        })
      );
    },
    [messages]
  );

  if (messages.length === 0) {
    const hints = isZh
      ? ["解释这段代码", "帮我找一个 bug", "帮我写测试", "帮我重构"]
      : ["Explain this code", "Find a bug", "Write tests", "Refactor"];

    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-claude-surface flex items-center justify-center border border-claude-border">
            <div className="w-10 h-10 rounded-full bg-claude-accent flex items-center justify-center">
              <span className="text-lg font-bold text-claude-bg">C</span>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-claude-text">
              ClaudeSidePanel
            </h2>
            <p className="text-sm text-claude-muted mt-1">
              {t(
                "直接提问。我可以读文件、运行命令并帮你处理代码。",
                "Ask me anything. I can read files, run commands, and help with your code."
              )}
            </p>
          </div>
          <div className="space-y-2 text-xs text-claude-muted">
            <div className="flex flex-wrap justify-center gap-2">
              {hints.map((hint) => (
                <button
                  key={hint}
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("claude-web-auto-send", {
                        detail: { prompt: hint, autoSubmit: true },
                      })
                    )
                  }
                  className="px-2.5 py-1 rounded-full border border-claude-border text-claude-muted hover:text-claude-text hover:border-claude-accent/50 transition-colors"
                >
                  {hint}
                </button>
              ))}
            </div>
            <p className="pt-2">
              {t("请确保本地服务已启动：", "Make sure the bridge is running:")}
            </p>
            <code className="inline-block px-2 py-1 bg-claude-surface rounded text-claude-accent">
              pnpm dev:bridge
            </code>
          </div>
        </div>
      </div>
    );
  }

  // Group consecutive assistant messages for shared timeline
  const groups = groupMessages(messages);

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-3 py-4"
    >
      {groups.map((group) => {
        if (group.role === "user") {
          return (
            <div key={group.key} className="mb-4">
              <MessageBubble
                message={group.messages[0]}
                onRetry={handleRetry}
              />
            </div>
          );
        }

        // Consecutive assistant messages — shared timeline
        return (
          <div key={group.key} className="relative mb-4">
            {/* Continuous vertical line spanning all messages */}
            <div
              className="absolute left-[3px] top-0 bottom-0 w-[1.5px] rounded-full"
              style={{ backgroundColor: "rgba(136,136,136,0.25)" }}
            />
            {group.messages.map((msg) => (
              <div key={msg.id} className="mb-4">
                <MessageBubble
                  message={msg}
                  onRetry={handleRetry}
                  timelineDotsOnly
                />
              </div>
            ))}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

interface MessageGroup {
  key: string;
  role: "user" | "assistant";
  messages: Message[];
}

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (msg.role === "system") {
      groups.push({ key: msg.id, role: "assistant", messages: [msg] });
      i++;
      continue;
    }
    if (msg.role === "user") {
      groups.push({ key: msg.id, role: "user", messages: [msg] });
      i++;
      continue;
    }
    // Collect consecutive assistant messages
    const batch: Message[] = [];
    while (i < messages.length && messages[i].role === "assistant") {
      batch.push(messages[i]);
      i++;
    }
    if (batch.length > 0) {
      groups.push({ key: batch[0].id, role: "assistant", messages: batch });
    }
  }
  return groups;
}
