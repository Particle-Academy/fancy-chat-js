import { isPlainObject } from "./events";
import { normalizePhrase } from "./typed-approval";
import type { Result } from "./types";

/**
 * Quick replies: short, plain-text next messages offered under the agent's
 * settled reply. Model output shown to a person, so the contract holds them to
 * plain text with stable ids, and a pick is only ever an ordinary human message
 * (or a composer fill): nothing here can decide, answer or call a tool.
 */
export interface Suggestion {
  /** Stable within the list: `s1`, `s2`... in order. */
  id: string;
  /** One line of plain text. Render it as text, never as markdown or HTML. */
  text: string;
}

/** The thread's current quick replies, scoped to the ONE settled turn they follow. */
export interface SuggestionsEntry {
  turnId: string;
  items: Suggestion[];
}

export interface SuggestionLimits {
  /** Suggestions kept. Default 3. */
  maxCount: number;
  /** Characters (code points) in one suggestion. Longer ones are dropped, never cut. Default 80. */
  maxChars: number;
}

export const DEFAULT_SUGGESTION_LIMITS: SuggestionLimits = { maxCount: 3, maxChars: 80 };

const CONTROL = /\p{Cc}/gu;
const FORMAT = /\p{Cf}/gu;
const SPACES = /\p{Z}+/gu;
const UNCLEAN = /[\p{Cc}\p{Cf}]/u;

/** One clean line: a non-empty string with no control or format characters and no padding. */
export function isSuggestionText(text: unknown): text is string {
  return typeof text === "string" && text !== "" && !UNCLEAN.test(text) && text === text.replace(/^ +| +$/g, "");
}

function limit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function clean(text: string): string {
  return text.replace(CONTROL, " ").replace(FORMAT, "").replace(SPACES, " ").replace(/^ | $/g, "");
}

/**
 * What a server runs on the model's output before appending anything: strings
 * only; control characters become spaces, format characters (zero-width, bidi
 * overrides) are removed, white space collapses and the ends are trimmed; empty
 * and duplicate items are dropped; one longer than `maxChars` is dropped, never
 * cut; at most `maxCount` are kept; and a `refuse`d phrase (normalised as typed
 * approval normalises, so "Approve." matches "approve") is dropped, so a pick can
 * never read as a typed decision.
 */
export function sanitizeSuggestions(raw: unknown, limits: Partial<SuggestionLimits> = {}, refuse: readonly string[] = []): Suggestion[] {
  if (!Array.isArray(raw)) return [];
  const maxCount = limit(limits.maxCount, DEFAULT_SUGGESTION_LIMITS.maxCount);
  const maxChars = limit(limits.maxChars, DEFAULT_SUGGESTION_LIMITS.maxChars);
  const refused = new Set(refuse.filter((p): p is string => typeof p === "string").map(normalizePhrase).filter((p) => p !== ""));
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const item of raw) {
    if (out.length >= maxCount) break;
    if (typeof item !== "string") continue;
    const text = clean(item);
    if (text === "" || [...text].length > maxChars || seen.has(text) || refused.has(normalizePhrase(text))) continue;
    seen.add(text);
    out.push({ id: `s${out.length + 1}`, text });
  }
  return out;
}

/** Checks a `suggestions.updated` item list: plain objects, unique non-empty ids, clean text. */
export function checkSuggestionItems(items: unknown): Result<{ items: Suggestion[] }> {
  if (!Array.isArray(items)) return { ok: false, error: "suggestions.items" };
  const ids = new Set<string>();
  const out: Suggestion[] = [];
  for (const item of items) {
    if (!isPlainObject(item) || typeof item.id !== "string" || item.id === "" || ids.has(item.id)) return { ok: false, error: "suggestions.id" };
    if (!isSuggestionText(item.text)) return { ok: false, error: "suggestions.text" };
    ids.add(item.id);
    out.push({ id: item.id, text: item.text });
  }
  return { ok: true, items: out };
}
