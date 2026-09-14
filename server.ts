// One process: Next.js, the WebSocket server and the run worker.
//
// A custom server is what makes a single free container enough. The worker needs
// a long-lived process (serverless functions are killed mid-run), and the
// WebSocket needs a real HTTP server to upgrade from.

import { createServer, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import { userIdFromCookieHeader } from "@/lib/auth-claims";
import { getDb } from "@/lib/db";
import { authConfigured } from "@/lib/supabase/config";
import { bus, type RunEvent } from "@/lib/events";
import { startWorker } from "@/lib/pipeline/worker";
import { newSessionValue, readCookie, SESSION_COOKIE, sessionCookieHeader, verifySessionValue } from "@/lib/session";

const dev = process.env.NODE_ENV !== "production" && !process.argv.includes("--prod");
if (!dev) (process.env as Record<string, string>).NODE_ENV = "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? (dev ? "localhost" : "0.0.0.0");

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();
await getDb();

// Accounts come from Supabase Auth. Only local development without Supabase keys
// hands out the signed anonymous cookie, so the app runs with zero setup.
const localSessions = !authConfigured() && dev;
if (!authConfigured() && !dev) throw new Error("Sign-in is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");

const server = createServer((req, res) => {
  const current = localSessions ? verifySessionValue(readCookie(req.headers.cookie, SESSION_COOKIE)) : "account";
  if (!current && !req.url?.startsWith("/_next/")) {
    const { value } = newSessionValue();
    res.setHeader("Set-Cookie", sessionCookieHeader(value));
    req.headers.cookie = [req.headers.cookie, `${SESSION_COOKIE}=${value}`].filter(Boolean).join("; ");
  }
  void handle(req, res);
});

const wss = new WebSocketServer({ noServer: true });
const socketsByUser = new Map<string, Set<WebSocket>>();

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/ws") {
    // Next's dev server uses its own upgrade path for hot reload.
    if (dev) {
      const upgrade = app.getUpgradeHandler();
      void upgrade(req, socket, head);
    } else socket.destroy();
    return;
  }
  void userIdFromCookieHeader(req.headers.cookie)
    .catch(() => null)
    .then((userId) => {
      if (!userId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      acceptSocket(req, socket, head, userId);
    });
});

function acceptSocket(req: IncomingMessage, socket: Duplex, head: Buffer, userId: string) {
  wss.handleUpgrade(req, socket, head, (ws) => {
    let set = socketsByUser.get(userId);
    if (!set) socketsByUser.set(userId, (set = new Set()));
    set.add(ws);
    const ping = setInterval(() => ws.readyState === ws.OPEN && ws.ping(), 25_000);
    ws.on("close", () => {
      clearInterval(ping);
      set!.delete(ws);
      if (set!.size === 0) socketsByUser.delete(userId);
    });
    ws.send(JSON.stringify({ type: "hello" }));
  });
}

bus().on("run-event", (event: RunEvent) => {
  const sockets = socketsByUser.get(event.userId);
  if (!sockets) return;
  const { userId: _omit, ...payload } = event;
  const message = JSON.stringify({ type: "run-event", ...payload });
  for (const ws of sockets) if (ws.readyState === ws.OPEN) ws.send(message);
});

startWorker();

server.listen(port, hostname, () => {
  console.log(`> Ready on http://${hostname}:${port} (${dev ? "development" : "production"})`);
});
