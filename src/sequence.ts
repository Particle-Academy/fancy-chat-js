import type { ChatEvent } from "./types";

/**
 * The client side of resumable replay. Events are applied strictly in seq
 * order: duplicates are dropped, events past a gap are held until the gap
 * fills, and the gap is reported so the transport can re-request
 * `after = lastSeq`. A `thread.reset` jumps the cursor to its own seq.
 */
export interface SeqLog {
  readonly lastSeq: number;
  readonly held: ReadonlyMap<number, ChatEvent>;
}

export interface Gap {
  /** The last seq applied. Re-request with `after = gap.after`. */
  after: number;
  /** The first seq held past the gap. */
  before: number;
}

export interface IngestResult {
  log: SeqLog;
  /** Events now safe to reduce, in seq order. */
  applied: ChatEvent[];
  missing: Gap | null;
}

const JUMPS = new Set(["thread.reset", "thread.snapshot"]);

export function createSeqLog(after = 0): SeqLog {
  return { lastSeq: after, held: new Map() };
}

export function ingestEvents(log: SeqLog, events: readonly ChatEvent[]): IngestResult {
  let lastSeq = log.lastSeq;
  const held = new Map(log.held);
  const applied: ChatEvent[] = [];

  const drain = () => {
    for (let next = held.get(lastSeq + 1); next; next = held.get(lastSeq + 1)) {
      held.delete(next.seq);
      applied.push(next);
      lastSeq = next.seq;
    }
  };

  for (const event of events) {
    if (event.seq <= lastSeq) continue;
    if (JUMPS.has(event.type)) {
      applied.push(event);
      lastSeq = event.seq;
      for (const seq of [...held.keys()]) if (seq <= lastSeq) held.delete(seq);
    } else if (!held.has(event.seq)) {
      held.set(event.seq, event);
    }
    drain();
  }

  let missing: Gap | null = null;
  if (held.size > 0) missing = { after: lastSeq, before: Math.min(...held.keys()) };
  return { log: { lastSeq, held }, applied, missing };
}
