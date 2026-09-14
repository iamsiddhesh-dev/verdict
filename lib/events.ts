// In-process event bus between the worker and the WebSocket server.
//
// An accelerator, not a source of truth: every event describes a change that
// has already been written to the run row. A client that misses events (a
// dropped socket, a sleeping laptop) refetches the run and sees the same state.

import { EventEmitter } from "node:events";

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

/** Lets route handlers wake the worker right away instead of on its next poll. */
export function nudgeWorker() {
  bus().emit("work-available");
}
