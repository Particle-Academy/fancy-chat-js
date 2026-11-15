import { isPlainObject } from "./events";
import { machines } from "./machines";
import type { Actor, AnswerDraft, QuestionRecord, Result } from "./types";

/**
 * Only a human may decide an approval or answer a question. The kind must be
 * exactly `human` and the id non-empty; the host's authenticated resolver is
 * what produces this actor, never the request body.
 */
export function canDecide(actor: unknown): actor is Actor & { kind: "human" } {
  return isPlainObject(actor) && actor.kind === "human" && typeof actor.id === "string" && actor.id !== "";
}

/** A tool name in the human's confirmation channel. Never offered to an agent. */
export function isReservedToolName(name: string): boolean {
  const lower = name.toLowerCase();
  const reserved = machines.reservedTools;
  return reserved.exact.includes(lower) || reserved.contains.some((needle) => lower.includes(needle));
}

function hasValue(type: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (type === "multi") return Array.isArray(value) && value.length > 0;
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Whether an answer draft may be submitted. Each required field needs a value,
 * or (when the question allows notes) a non-blank note. Values must be of the
 * field's type and options must be offered ones.
 */
export function canSubmitAnswer(question: QuestionRecord, draft: AnswerDraft): Result {
  const fields = new Map(question.fields.map((f) => [f.id, f]));
  const values = isPlainObject(draft.values) ? draft.values : {};
  const notes = isPlainObject(draft.notes) ? (draft.notes as Record<string, unknown>) : {};

  for (const [id, value] of Object.entries(values)) {
    const field = fields.get(id);
    if (!field) return { ok: false, error: "question.field" };
    if (value === undefined || value === null) continue;
    if (field.type === "multi") {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) return { ok: false, error: "question.value" };
    } else if (typeof value !== "string") {
      return { ok: false, error: "question.value" };
    }
    if (field.type !== "text") {
      const offered = new Set((field.options ?? []).map((o) => o.id));
      const chosen = Array.isArray(value) ? (value as string[]) : [value as string];
      if (chosen.some((v) => !offered.has(v))) return { ok: false, error: "question.option" };
    }
  }

  for (const field of question.fields) {
    if (!field.required) continue;
    if (hasValue(field.type, values[field.id])) continue;
    const note = notes[field.id];
    if (question.allowNote && typeof note === "string" && note.trim() !== "") continue;
    return { ok: false, error: "question.required" };
  }
  return { ok: true };
}

export interface HitlItem {
  id: string;
  kind: "approval" | "question" | string;
  state: string;
  seq: number;
}

const ACTIONABLE: Record<string, string> = { approval: "pending", question: "open" };
const IN_FLIGHT: Record<string, string> = { approval: "deciding", question: "answering" };

/**
 * Exactly one HITL item is actionable within a coordination scope: the oldest
 * by seq. While any decision is in flight, none is.
 */
export function pickActionable(items: readonly HitlItem[], kinds?: readonly string[]): string | null {
  const scoped = kinds ? items.filter((i) => kinds.includes(i.kind)) : items;
  if (scoped.some((i) => IN_FLIGHT[i.kind] === i.state)) return null;
  let best: HitlItem | null = null;
  for (const item of scoped) {
    if (ACTIONABLE[item.kind] !== item.state) continue;
    if (!best || item.seq < best.seq) best = item;
  }
  return best ? best.id : null;
}
