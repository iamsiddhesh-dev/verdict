// In-process event bus between the worker and the WebSocket server.
//
// An accelerator, not a source of truth: every event describes a change that
// has already been written to the run row. A client that misses events (a
// dropped socket, a sleeping laptop) refetches the run and sees the same state.

import { EventEmitter } from "node:events";
import { waitUntil } from "@vercel/functions";

export interface RunEvent {
  userId: string;
  runId: string;
  kind: "run" | "artifact";
  stage?: string;
  status?: string;
  detail?: string;
}

const g = globalThis as typeof globalThis & { __jobAgentBus?: EventEmitter };

export function bus(): EventEmitter {
  if (!g.__jobAgentBus) {
    g.__jobAgentBus = new EventEmitter();
    g.__jobAgentBus.setMaxListeners(0);
  }
  return g.__jobAgentBus;
}

export function publish(event: RunEvent) {
  bus().emit("run-event", event);
}

/**
 * Serverless hosts (Vercel) have no long-lived process for the worker loop or
 * the WebSocket server. There, requests drive the queue instead: every request
 * that adds work, and every status poll from an open tab, drains the queue in
 * the background after its response is sent. The run row stays the source of
 * truth, and its lease means a function killed mid-stage is picked up again.
 */
export function serverlessWorker(): boolean {
  return process.env.VERCEL === "1" || process.env.SERVERLESS_WORKER === "1";
}

/** Lets route handlers wake the worker right away instead of on its next poll. */
export function nudgeWorker() {
  if (!serverlessWorker()) {
    bus().emit("work-available");
    return;
  }
  // On Vercel, waitUntil keeps the function alive after the response until the
  // drain settles (bounded by the route's maxDuration). Elsewhere it is a no-op
  // and the promise simply runs in the long-lived process.
  const work = import("@/lib/pipeline/worker")
    .then(({ drain }) => drain())
    .catch((err) => console.error("[worker] drain failed:", err));
  waitUntil(work);
}
