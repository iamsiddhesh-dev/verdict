"use client";

import { useEffect, useRef, useState } from "react";

export interface LiveEvent {
  type: "run-event";
  runId: string;
  kind: "run" | "artifact";
  stage?: string;
  status?: string;
  detail?: string;
}

/**
 * One WebSocket per tab, reconnecting with backoff. The socket only says that
 * something changed; callers refetch from the API, which is the source of truth.
 * `connected` lets callers fall back to polling while the socket is down.
 */
/** False on serverless builds (set in next.config.ts), where there is no /ws to connect to. */
export const liveSocketEnabled = process.env.NEXT_PUBLIC_LIVE_SOCKET !== "off";

export function useLiveEvents(onEvent: (e: LiveEvent) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Serverless hosts have no WebSocket server; callers poll instead.
    if (!liveSocketEnabled) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(String(msg.data));
          if (data.type === "run-event") handler.current(data as LiveEvent);
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        attempt += 1;
        timer = setTimeout(connect, Math.min(15_000, 500 * 2 ** attempt));
      };
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, []);

  return connected;
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json", ...(init?.headers ?? {}) } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}
