import { useState, useCallback } from "react";
import type { PageContext } from "@/lib/protocol";

interface PageContextResult {
  context: PageContext | null;
  loading: boolean;
  error: string | null;
  fetchContext: () => Promise<PageContext | null>;
  fetchSelection: () => Promise<{ text: string; url: string; title: string } | null>;
}

export function usePageContext(): PageContextResult {
  const [context, setContext] = useState<PageContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async (): Promise<PageContext | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await chrome.runtime.sendMessage({
        type: "get-page-context",
        options: { maxLength: 10000 },
      });

      if (!result) {
        setError("Could not access page content");
        return null;
      }

      const ctx: PageContext = {
        url: result.url,
        title: result.title,
        selectedText: result.selectedText || undefined,
        bodyText: result.bodyText || undefined,
      };

      setContext(ctx);
      return ctx;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to get page context";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSelection = useCallback(async () => {
    try {
      const result = await chrome.runtime.sendMessage({
        type: "get-page-context",
        options: { maxLength: 0 },
      });
      if (!result?.selectedText) return null;
      return {
        text: result.selectedText,
        url: result.url,
        title: result.title,
      };
    } catch {
      return null;
    }
  }, []);

  return { context, loading, error, fetchContext, fetchSelection };
}

/**
 * Build a context prefix string from page context for injection into prompts.
 */
export function buildContextPrefix(ctx: PageContext): string {
  const parts: string[] = [];

  parts.push("[Current Web Page]");
  parts.push(`URL: ${ctx.url}`);
  parts.push(`Title: ${ctx.title}`);

  if (ctx.selectedText) {
    parts.push(`\nSelected text:\n"${ctx.selectedText}"`);
  }

  if (ctx.bodyText) {
    parts.push(`\nPage content:\n${ctx.bodyText}`);
  }

  return parts.join("\n");
}
