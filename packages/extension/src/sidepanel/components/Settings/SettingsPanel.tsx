import { useSettingsStore, type Theme } from "@/sidepanel/stores/settingsStore";
import { useConnectionStore } from "@/sidepanel/stores/connectionStore";
import { bridgeClient } from "@/lib/bridge-client";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: Props) {
  const isZh = navigator.language?.toLowerCase().startsWith("zh");
  const t = (zh: string, en: string) => (isZh ? zh : en);

  const {
    theme,
    setTheme,
    bridgePort,
    setBridgePort,
    showThinking,
    setShowThinking,
    compactMode,
    setCompactMode,
  } = useSettingsStore();
  const connectionState = useConnectionStore((s) => s.state);

  if (!open) return null;

  const handleReconnect = () => {
    bridgeClient.disconnect();
    bridgeClient.connect();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-fade-in"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed left-0 top-0 bottom-0 w-72 bg-claude-surface border-r border-claude-border z-50 flex flex-col animate-slide-up">
        <div className="flex items-center justify-between px-4 py-3 border-b border-claude-border">
          <span className="text-sm font-semibold text-claude-text">
            {t("设置", "Settings")}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-claude-border/50 text-claude-muted"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Theme */}
          <Section title={t("外观", "Appearance")}>
            <SettingRow label={t("主题", "Theme")}>
              <SegmentedControl
                value={theme}
                options={[
                  { value: "dark", label: t("深色", "Dark") },
                  { value: "light", label: t("浅色", "Light") },
                  { value: "system", label: t("跟随系统", "System") },
                ]}
                onChange={(v) => setTheme(v as Theme)}
              />
            </SettingRow>
            <SettingRow label={t("显示思考过程", "Show thinking")}>
              <Toggle value={showThinking} onChange={setShowThinking} />
            </SettingRow>
            <SettingRow label={t("紧凑模式", "Compact mode")}>
              <Toggle value={compactMode} onChange={setCompactMode} />
            </SettingRow>
          </Section>

          {/* Connection */}
          <Section title={t("连接", "Connection")}>
            <SettingRow label={t("本地端口", "Bridge port")}>
              <input
                type="number"
                value={bridgePort}
                onChange={(e) => setBridgePort(Number(e.target.value))}
                className="w-20 px-2 py-1 text-sm bg-claude-bg border border-claude-border rounded text-claude-text text-center focus:outline-none focus:border-claude-accent/50"
              />
            </SettingRow>
            <SettingRow label={t("状态", "Status")}>
              <span
                className={`text-xs ${
                  connectionState === "connected"
                    ? "text-claude-success"
                    : connectionState === "connecting"
                    ? "text-claude-warning"
                    : "text-claude-error"
                }`}
              >
                {connectionState === "connected"
                  ? t("已连接", "Connected")
                  : connectionState === "connecting"
                  ? t("连接中…", "Connecting...")
                  : t("未连接", "Disconnected")}
              </span>
            </SettingRow>
            <div className="pt-2">
              <button
                onClick={handleReconnect}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm bg-claude-bg border border-claude-border rounded-lg text-claude-text hover:bg-claude-border/30 transition-colors"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {t("重新连接", "Reconnect")}
              </button>
            </div>
          </Section>

          {/* About */}
          <Section title={t("关于", "About")}>
            <div className="space-y-2 text-xs text-claude-muted">
              <p>
                <span className="text-claude-text font-medium">
                  ClaudeSidePanel
                </span>{" "}
                v0.1.0
              </p>
              <p>
                {t(
                  "基于本地 Claude CLI 的浏览器侧边栏助手。",
                  "Browser sidebar AI assistant powered by the local Claude CLI."
                )}
              </p>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-claude-muted">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-claude-text">{label}</span>
      {children}
    </div>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex bg-claude-bg rounded-lg border border-claude-border overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 text-xs transition-colors ${
            opt.value === value
              ? "bg-claude-accent text-claude-bg font-medium"
              : "text-claude-muted hover:text-claude-text"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-9 h-5 rounded-full transition-colors relative ${
        value ? "bg-claude-accent" : "bg-claude-border"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          value ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
