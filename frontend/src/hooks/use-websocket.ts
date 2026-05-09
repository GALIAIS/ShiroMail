import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/auth-store";

export type WebSocketStatus = "connecting" | "connected" | "disconnected";

export type WebSocketMessage = {
  type: string;
  payload: unknown;
};

type UseWebSocketOptions = {
  onMessage?: (message: WebSocketMessage) => void;
  enabled?: boolean;
};

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

function buildWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/ws`;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { onMessage, enabled = true } = options;
  const [status, setStatus] = useState<WebSocketStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let disposed = false;

    function connect() {
      const token = useAuthStore.getState().accessToken;
      if (!token) {
        setStatus("disconnected");
        return;
      }

      setStatus("connecting");
      const url = `${buildWsUrl()}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (disposed) return;
        reconnectAttemptRef.current = 0;
        setStatus("connected");
      });

      ws.addEventListener("message", (event) => {
        if (disposed) return;
        try {
          const data = JSON.parse(event.data as string) as WebSocketMessage;
          onMessageRef.current?.(data);
        } catch {
          // ignore malformed messages
        }
      });

      ws.addEventListener("close", () => {
        if (disposed) return;
        setStatus("disconnected");
        scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        if (disposed) return;
        ws.close();
      });
    }

    function scheduleReconnect() {
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** reconnectAttemptRef.current,
        RECONNECT_MAX_MS,
      );
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        if (!disposed) connect();
      }, delay);
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setStatus("disconnected");
    };
  }, [enabled]);

  return { status };
}
