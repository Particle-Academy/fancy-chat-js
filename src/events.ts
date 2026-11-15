import type { ChatEvent, Result } from "./types";

/** The closed set of core event types. Anything else must be `x-<app>.<name>`. */
export const CORE_EVENT_TYPES = [
  "thread.snapshot",
  "thread.reset",
  "run.started",
  "run.finished",
  "run.failed",
  "run.cancelled",
  "turn.started",
  "turn.transition",
  "turn.settled",
  "message.created",
  "message.updated",
  "message.retracted",
  "delivery.changed",
  "part.started",
  "part.delta",
  "part.completed",
  "thinking.started",
  "thinking.delta",
  "thinking.completed",
  "tool.called",
  "tool.progress",
  "tool.result",
  "plan.updated",
  "approval.requested",
  "approval.decided",
  "approval.applied",
  "approval.withdrawn",
  "question.asked",
  "question.answered",
  "undo.opened",
  "undo.committed",
  "undo.reverted",
  "agent.status",
  "usage",
  "provider.fallback",
  "control.handoff",
] as const;

export type CoreEventType = (typeof CORE_EVENT_TYPES)[number];

const CORE = new Set<string>(CORE_EVENT_TYPES);
const EXTENSION = /^x-[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9._-]*$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const ACTOR_KINDS = new Set(["agent", "human", "system"]);
const OPTIONAL_IDS = ["runId", "turnId", "parentRunId", "rootRunId"] as const;

/** An ISO 8601 timestamp with a zone, as every `at` and deadline carries. */
export function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && TIMESTAMP.test(value);
}

export function isEventType(type: unknown): boolean {
  return typeof type === "string" && (CORE.has(type) || EXTENSION.test(type));
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks an event envelope. Refuses an unknown major (`contract.version`) and
 * ignores unknown fields; never guesses. Errors name the field, never a value.
 */
export function validateEvent(input: unknown): Result<{ event: ChatEvent }> {
  if (!isPlainObject(input)) return { ok: false, error: "event.shape" };
  const e = input;
  if (e.v !== 1) return { ok: false, error: "contract.version" };
  if (typeof e.seq !== "number" || !Number.isInteger(e.seq) || e.seq < 1) return { ok: false, error: "event.seq" };
  if (typeof e.threadId !== "string" || e.threadId === "") return { ok: false, error: "event.threadId" };
  if (!isEventType(e.type)) return { ok: false, error: "event.type" };
  if (typeof e.at !== "string" || !TIMESTAMP.test(e.at)) return { ok: false, error: "event.at" };
  const actor = e.actor;
  if (!isPlainObject(actor) || typeof actor.kind !== "string" || !ACTOR_KINDS.has(actor.kind) || typeof actor.id !== "string") {
    return { ok: false, error: "event.actor" };
  }
  if (!isPlainObject(e.data)) return { ok: false, error: "event.data" };
  for (const key of OPTIONAL_IDS) {
    const value = e[key];
    if (value !== undefined && value !== null && typeof value !== "string") return { ok: false, error: `event.${key}` };
  }
  return { ok: true, event: e as unknown as ChatEvent };
}
