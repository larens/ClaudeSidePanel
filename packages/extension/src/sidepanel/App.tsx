import { useEffect } from "react";
import { Header } from "./components/Layout/Header";
import { ChatView } from "./components/Chat/ChatView";
import { ChatInput } from "./components/Input/ChatInput";
import { bridgeClient } from "@/lib/bridge-client";
import { useConnectionStore } from "./stores/connectionStore";
import { useSessionStore } from "./stores/sessionStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useWorkspaceStore } from "./stores/workspaceStore";
import { usePersistence } from "./hooks/usePersistence";

export default function App() {
  const connectionState = useConnectionStore((s) => s.state);
  const { loadState: loadSessionState, setActiveWorkspaceSession, setActiveSession } =
    useSessionStore();
  const { loadSettings } = useSettingsStore();
  const {
    loadState: loadWorkspaceState,
    activeWorkspaceId,
    refreshWorkspace,
  } = useWorkspaceStore();

  // Wire up persistence and load settings
  usePersistence();

  // Load settings (theme, etc.)
  useEffect(() => {
    loadSettings();
    void loadSessionState();
    void loadWorkspaceState();
  }, [loadSettings, loadSessionState, loadWorkspaceState]);

  // Connect to bridge on mount
  useEffect(() => {
    bridgeClient.connect();
    return () => bridgeClient.disconnect();
  }, []);

  // Restore the active session when the active workspace changes
  useEffect(() => {
    if (!activeWorkspaceId) {
      setActiveSession(null);
      return;
    }

    setActiveWorkspaceSession(activeWorkspaceId);
  }, [activeWorkspaceId, setActiveSession, setActiveWorkspaceSession]);

  // Refresh current workspace status after the bridge is connected
  useEffect(() => {
    if (connectionState !== "connected" || !activeWorkspaceId) return;
    void refreshWorkspace(activeWorkspaceId);
  }, [connectionState, activeWorkspaceId, refreshWorkspace]);

  // Listen for context menu actions from background service worker
  useEffect(() => {
    const handler = (message: {
      type: string;
      action?: string;
      text?: string;
      url?: string;
      title?: string;
    }) => {
      if (message.type !== "context-action") return;

      const { action, text, url, title } = message;

      if (action === "summarize") {
        window.dispatchEvent(
          new CustomEvent("claude-web-auto-send", {
            detail: {
              prompt: `Please summarize the content of this web page.\n\nURL: ${url}\nTitle: ${title}`,
            },
          })
        );
      } else if (action === "ask" && text) {
        window.dispatchEvent(
          new CustomEvent("claude-web-auto-send", {
            detail: {
              prompt: `Regarding the following selected text from "${title}" (${url}):\n\n> ${text}\n\nPlease explain or help with this.`,
            },
          })
        );
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  return (
    <div className="flex flex-col h-full bg-claude-bg">
      <Header />
      <ChatView />
      <ChatInput />
    </div>
  );
}
