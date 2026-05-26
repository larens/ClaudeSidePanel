import { create } from "zustand";

export type Theme = "dark" | "light" | "system";

interface Settings {
  theme: Theme;
  bridgePort: number;
  showThinking: boolean;
  compactMode: boolean;
}

interface SettingsStore extends Settings {
  setTheme: (theme: Theme) => void;
  setBridgePort: (port: number) => void;
  setShowThinking: (show: boolean) => void;
  setCompactMode: (compact: boolean) => void;
  loadSettings: () => Promise<void>;
}

const STORAGE_KEY = "claudeweb_settings";

const defaults: Settings = {
  theme: "dark",
  bridgePort: 18765,
  showThinking: true,
  compactMode: false,
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...defaults,

  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
    persistSettings(get());
  },

  setBridgePort: (port) => {
    set({ bridgePort: port });
    persistSettings(get());
  },

  setShowThinking: (show) => {
    set({ showThinking: show });
    persistSettings(get());
  },

  setCompactMode: (compact) => {
    set({ compactMode: compact });
    persistSettings(get());
  },

  loadSettings: async () => {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const saved: Partial<Settings> = result[STORAGE_KEY] ?? {};
      set({ ...defaults, ...saved });
      applyTheme(saved.theme ?? defaults.theme);
    } catch {
      applyTheme(defaults.theme);
    }
  },
}));

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");

  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.add(prefersDark ? "dark" : "light");
  } else {
    root.classList.add(theme);
  }
}

async function persistSettings(settings: Settings) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  } catch {
    // chrome.storage not available in dev
  }
}
