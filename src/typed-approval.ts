import { optionTone } from "./machines";
import type { ApprovalOption, ApprovalRecord, Decision } from "./types";

/**
 * Typed approval: a human typing "approve" while an approval is actionable.
 * OPT-IN PER APP (owner, 2026-11-15): off by default and no phrases until the
 * host sets them. Deterministic, never an LLM. A match takes the same decide
 * path, with the same checks, as pressing the button, and is consumed as the
 * decision rather than sent to the agent.
 */
export interface TypedApprovalConfig {
  enabled: boolean;
  /** Which phrase list applies. */
  locale: string;
  /** Per locale, the exact phrases (after normalisation) that approve or reject. */
  phrases: Record<string, { approve?: string[]; reject?: string[] }>;
}

export const DEFAULT_TYPED_APPROVAL: TypedApprovalConfig = { enabled: false, locale: "en", phrases: {} };

/** English phrases a host may opt into. Never applied unless passed in `phrases`. */
export const ENGLISH_TYPED_APPROVAL_PHRASES = { approve: ["approve", "yes, approve"], reject: ["reject", "no, reject"] };

const TRAILING_PUNCTUATION = new Set([".", "!", "?", "。", "！", "？"]);

/**
 * NFKC, lower case, trimmed, trailing `.`/`!`/`?` dropped, inner white space
 * collapsed to one space. Scans, never a backtracking regex.
 */
export function normalizePhrase(text: string): string {
  let s = text.normalize("NFKC").toLowerCase().trim();
  let end = s.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(s[end - 1] as string)) end -= 1;
  s = s.slice(0, end).trim();
  let out = "";
  let space = false;
  for (const ch of s) {
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v") {
      space = true;
      continue;
    }
    if (space && out !== "") out += " ";
    space = false;
    out += ch;
  }
  return out;
}

function pick(options: readonly ApprovalOption[], decision: Decision): ApprovalOption | null {
  // Typing picks a ONE-TIME option only: "approve" must never grant "always".
  const once = decision === "approve" ? "allow-once" : "reject-once";
  return options.find((o) => o.kind === once && optionTone(o.kind).decision === decision) ?? null;
}

/**
 * The decision a typed message makes on a pending approval, or null. Only an
 * exact phrase matches; "please approve it" is a message, not a decision. Edit
 * is never typed.
 */
export function matchTypedApproval(
  text: string,
  approval: Pick<ApprovalRecord, "state" | "options"> | null,
  config: Partial<TypedApprovalConfig> = {},
): { optionId: string; decision: Decision } | null {
  const cfg = { ...DEFAULT_TYPED_APPROVAL, ...config };
  if (!cfg.enabled || !approval || approval.state !== "pending") return null;
  const lists = cfg.phrases[cfg.locale];
  if (!lists) return null;
  const typed = normalizePhrase(text);
  if (typed === "") return null;
  let decision: Decision | null = null;
  if ((lists.approve ?? []).some((p) => normalizePhrase(p) === typed)) decision = "approve";
  else if ((lists.reject ?? []).some((p) => normalizePhrase(p) === typed)) decision = "reject";
  if (!decision) return null;
  const option = pick(approval.options ?? [], decision);
  return option ? { optionId: option.id, decision } : null;
}
