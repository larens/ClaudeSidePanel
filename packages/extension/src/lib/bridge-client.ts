import type {
  RequestMessage,
  ResponseMessage,
  RequestType,
  SystemAuthPayload,
} from "./protocol";
import { createRequest, DEFAULT_PORT, PROTOCOL_VERSION } from "./protocol";
import { useConnectionStore } from "@/sidepanel/stores/connectionStore";

type ResponseHandler = (msg: ResponseMessage) => void;

export class BridgeClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, ResponseHandler[]>();
  private globalHandlers: ResponseHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string | null = null;
  private port: number = DEFAULT_PORT;

  constructor(port?: number) {
    if (port) this.port = port;
  }

  setToken(token: string) {
    this.token = token;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const store = useConnectionStore.getState();
    store.setConnecting();

    try {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
    } catch {
      store.setDisconnected("Failed to create WebSocket connection");
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log("[BridgeClient] Connected");
      // Authenticate
      if (this.token) {
        this.ws!.send(
          JSON.stringify({
            type: "auth",
            token: this.token,
          })
        );
      }
      store.setActive();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: ResponseMessage = JSON.parse(event.data);
        this.dispatch(msg);
      } catch (e) {
        console.error("[BridgeClient] Failed to parse message:", e);
      }
    };

    this.ws.onclose = (event) => {
      console.log("[BridgeClient] Disconnected:", event.code, event.reason);
      store.setDisconnected(
        event.code !== 1000 ? "Connection closed" : undefined
      );
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error("[BridgeClient] Error:", error);
      store.setDisconnected("Connection error");
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close(1000, "Client disconnect");
    this.ws = null;
  }

  send<T = unknown>(
    type: RequestType,
    action: string,
    payload: unknown
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected to bridge"));
        return;
      }

      const request = createRequest(type, action, payload);

      const handler = (msg: ResponseMessage) => {
        if (msg.id !== request.id) return;
        if (msg.type === "error") {
          reject(new Error(String(msg.payload)));
        } else {
          resolve(msg.payload as T);
        }
        this.off(request.id, handler);
      };

      this.on(request.id, handler);
      this.ws.send(JSON.stringify(request));
    });
  }

  sendStream(
    type: RequestType,
    action: string,
    payload: unknown,
    onChunk: (msg: ResponseMessage) => void,
    onComplete: (msg: ResponseMessage) => void,
    onError: (error: Error) => void
  ): string {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      onError(new Error("Not connected to bridge"));
      return "";
    }

    const request = createRequest(type, action, payload);

    const handler = (msg: ResponseMessage) => {
      if (msg.id !== request.id) return;
      switch (msg.type) {
        case "chunk":
          onChunk(msg);
          break;
        case "complete":
          onComplete(msg);
          this.off(request.id, handler);
          break;
        case "error":
          onError(new Error(String(msg.payload)));
          this.off(request.id, handler);
          break;
      }
    };

    this.on(request.id, handler);
    this.ws.send(JSON.stringify(request));
    return request.id;
  }

  // Global event listener (for system events like status updates)
  onGlobal(handler: ResponseHandler) {
    this.globalHandlers.push(handler);
    return () => {
      this.globalHandlers = this.globalHandlers.filter((h) => h !== handler);
    };
  }

  private on(id: string, handler: ResponseHandler) {
    const existing = this.handlers.get(id) ?? [];
    existing.push(handler);
    this.handlers.set(id, existing);
  }

  private off(id: string, handler: ResponseHandler) {
    const existing = this.handlers.get(id);
    if (!existing) return;
    const filtered = existing.filter((h) => h !== handler);
    if (filtered.length === 0) {
      this.handlers.delete(id);
    } else {
      this.handlers.set(id, filtered);
    }
  }

  private dispatch(msg: ResponseMessage) {
    // Request-specific handlers
    const handlers = this.handlers.get(msg.id);
    if (handlers) {
      for (const handler of handlers) handler(msg);
    }
    // Global handlers
    for (const handler of this.globalHandlers) handler(msg);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }
}

// Singleton
export const bridgeClient = new BridgeClient();
