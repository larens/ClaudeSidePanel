import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Component, useDeferredValue, useState, type ReactNode } from "react";

interface Props {
  content: string;
  streaming?: boolean;
}

export function Markdown({ content, streaming }: Props) {
  const displayContent = streaming ? useDeferredValue(content) : content;

  return (
    <div
      data-streaming={streaming || undefined}
      className="prose-claude text-sm leading-relaxed streaming-cursor"
    >
      <MarkdownErrorBoundary content={content}>
        <ReactMarkdown
          children={displayContent}
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            code({ className, children, ...props }) {
              const isBlock = Boolean(className);
              const text = String(children).replace(/\n$/, "");

              if (isBlock) {
                return <CodeBlock className={className} text={text} />;
              }
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            pre({ children }) {
              return <>{children}</>;
            },
            a({ href, children, ...props }) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...props}
                >
                  {children}
                </a>
              );
            },
            table({ children }) {
              return (
                <div className="overflow-x-auto my-2">
                  <table className="border-collapse text-xs">
                    {children}
                  </table>
                </div>
              );
            },
            th({ children }) {
              return (
                <th className="border border-claude-border px-2 py-1 bg-claude-surface text-left font-medium">
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td className="border border-claude-border px-2 py-1">
                  {children}
                </td>
              );
            },
            ul({ children }) {
              return (
                <ul className="list-disc list-outside ml-4 space-y-0.5">
                  {children}
                </ul>
              );
            },
            ol({ children }) {
              return (
                <ol className="list-decimal list-outside ml-4 space-y-0.5">
                  {children}
                </ol>
              );
            },
            blockquote({ children }) {
              return (
                <blockquote className="border-l-2 border-claude-accent/50 pl-3 text-claude-muted italic">
                  {children}
                </blockquote>
              );
            },
          }}
        />
      </MarkdownErrorBoundary>
    </div>
  );
}

class MarkdownErrorBoundary extends Component<
  { content: string; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <p className="text-sm whitespace-pre-wrap break-words">
          {this.props.content}
        </p>
      );
    }
    return this.props.children;
  }
}

function CodeBlock({
  className,
  text,
}: {
  className?: string;
  text: string;
}) {
  const [copied, setCopied] = useState(false);
  const lang = className?.replace("language-", "") ?? "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2 rounded-md overflow-hidden border border-claude-border/15">
      <div className="flex items-center justify-between px-3 py-1.5 bg-claude-surface border-b border-claude-border/15">
        <span className="text-xs text-claude-muted font-mono">{lang}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-claude-muted hover:text-claude-text transition-colors flex items-center gap-1"
        >
          {copied ? (
            <>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className={`${className} !p-2.5`}>
        <code>{text}</code>
      </pre>
    </div>
  );
}
