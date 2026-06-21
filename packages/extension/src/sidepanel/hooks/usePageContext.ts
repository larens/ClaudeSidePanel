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
        options: { maxLength: 12000, includeLinks: true },
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
        meta: result.meta || undefined,
        headings: result.headings || undefined,
        links: result.links || undefined,
        frames: result.frames || undefined,
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

  if (ctx.meta) {
    const metaParts = [
      ctx.meta.description ? `Description: ${ctx.meta.description}` : null,
      ctx.meta.siteName ? `Site: ${ctx.meta.siteName}` : null,
      ctx.meta.author ? `Author: ${ctx.meta.author}` : null,
      ctx.meta.publishDate ? `Published: ${ctx.meta.publishDate}` : null,
      ctx.meta.type ? `Type: ${ctx.meta.type}` : null,
    ].filter(Boolean);
    if (metaParts.length) parts.push(`\nMetadata:\n${metaParts.join("\n")}`);
  }

  if (ctx.headings?.length) {
    parts.push(`\nPage headings:\n${ctx.headings.join("\n")}`);
  }

  if (ctx.frames?.length && ctx.frames.length > 1) {
    parts.push(
      `\nPage frames:\n${ctx.frames
        .slice(0, 10)
        .map((frame) => `- ${frame.title || "Untitled"}: ${frame.url}`)
        .join("\n")}`
    );
  }

  if (ctx.bodyText) {
    parts.push(`\nPage content:\n${ctx.bodyText}`);
  }

  if (ctx.links?.length) {
    parts.push(
      `\nVisible links:\n${ctx.links
        .slice(0, 20)
        .map((link) => `- ${link.text}: ${link.href}`)
        .join("\n")}`
    );
  }

  return parts.join("\n");
}
