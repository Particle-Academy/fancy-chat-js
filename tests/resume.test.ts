import { describe, expect, it } from "vitest";

import { createSeqLog, emptyThreadState, ingestEvents, applyEvent, projectThread, rowsOf, type ChatEvent } from "../src/index";
import { FIXTURES, withDefaults } from "./fixtures";

// A seeded PRNG, so a failure names a seed that reproduces it.
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const source: ChatEvent[] = FIXTURES.projection.cases[0].events.map((e: Record<string, unknown>) =>
  withDefaults(FIXTURES.projection.defaults, e),
);

/**
 * A lossy network: each delivery drops, duplicates and reorders events at
 * random. The client re-requests `after = lastSeq` whenever the log reports a
 * gap or the stream ends short, exactly as the transport does.
 */
function runLossy(seed: number) {
  const rand = prng(seed);
  let log = createSeqLog();
  const state = emptyThreadState();
  let reconnects = 0;
  while (log.lastSeq < source.length && reconnects < 500) {
    reconnects += 1;
    const replay = source.filter((e) => e.seq > log.lastSeq);
    const batch: ChatEvent[] = [];
    for (const e of replay) {
      if (rand() < 0.3) continue; // dropped
      batch.push(e);
      if (rand() < 0.2) batch.push(e); // duplicated
    }
    for (let i = batch.length - 1; i > 0; i -= 1) {
      if (rand() < 0.3) {
        const j = Math.floor(rand() * (i + 1));
        [batch[i], batch[j]] = [batch[j] as ChatEvent, batch[i] as ChatEvent];
      }
    }
    const r = ingestEvents(log, batch);
    log = r.log;
    for (const e of r.applied) applyEvent(state, e);
  }
  return { state, reconnects };
}

describe("resumable replay", () => {
  const clean = projectThread(source);

  it.each(Array.from({ length: 40 }, (_, i) => [i + 1]))("seed %i: a lossy, duplicated, reordered stream projects the same thread", (seed) => {
    const { state } = runLossy(seed);
    expect(state.lastSeq).toBe(source.length);
    expect(rowsOf(state)).toEqual(clean.rows);
    expect(state.turns).toEqual(clean.turns);
    expect(state.illegal).toBe(0);
  });

  it("a reconnect from a cursor yields exactly the uninterrupted projection", () => {
    const head = projectThread(source.slice(0, 9));
    const resumed = projectThread(source.slice(9), head.state);
    expect(resumed.rows).toEqual(clean.rows);
  });

  it("re-applying the whole log is a no-op", () => {
    const again = projectThread([...source, ...source]);
    expect(again.rows).toEqual(clean.rows);
    expect(again.illegal).toBe(0);
  });

  it("a snapshot taken mid-stream and sent as thread.reset continues to the same end", () => {
    const head = projectThread(source.slice(0, 12));
    const reset: ChatEvent = {
      ...(source[11] as ChatEvent),
      type: "thread.reset",
      data: { snapshot: head.state as unknown as Record<string, unknown> },
    };
    const fresh = projectThread([reset, ...source.slice(12)]);
    expect(fresh.rows).toEqual(clean.rows);
  });
});
