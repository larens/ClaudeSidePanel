import { create } from "zustand";

export type ConnectionState = "disconnected" | "connecting" | "connected";

interface ConnectionStore {
  state: ConnectionState;
  port: number;
  error: string | null;
  setActive: () => void;
  setConnecting: () => void;
  setDisconnected: (error?: string) => void;
  setPort: (port: number) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  state: "disconnected",
  port: 18765,
  error: null,

  setActive: () => set({ state: "connected", error: null }),
  setConnecting: () => set({ state: "connecting", error: null }),
  setDisconnected: (error) =>
    set({ state: "disconnected", error: error ?? null }),
  setPort: (port) => set({ port }),
}));
