import { isTimestamp } from "./events";

export type UndoState = "open" | "committed" | "reverted";

export interface UndoEntry {
  actionId: string;
  label: string;
  /** ISO 8601. The host commits at this instant; a revert must arrive before it. */
  deadline: string;
  state: UndoState;
}

/**
 * Time left to revert, from a clock the caller supplies (it never reads one).
 * At the deadline the window is shut, and an unreadable deadline is shut
 * rather than open, so a malformed record can never be reverted late.
 */
export function undoWindow(entry: Pick<UndoEntry, "deadline" | "state">, now: number): { remainingMs: number; canRevert: boolean } {
  if (entry.state !== "open") return { remainingMs: 0, canRevert: false };
  const deadline = isTimestamp(entry.deadline) ? Date.parse(entry.deadline) : Number.NaN;
  if (!Number.isFinite(deadline)) return { remainingMs: 0, canRevert: false };
  const remainingMs = Math.max(0, deadline - now);
  return { remainingMs, canRevert: remainingMs > 0 };
}
