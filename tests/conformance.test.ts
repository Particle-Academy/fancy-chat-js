import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  canDecide,
  canSubmitAnswer,
  createSeqLog,
  deriveAgentStatus,
  ingestEvents,
  isReservedToolName,
  optionTone,
  partToText,
  pickActionable,
  projectThread,
  transitionApproval,
  transitionDelivery,
  transitionTurn,
  validateEvent,
  validatePart,
  type ChatEvent,
} from "../src/index";
import { FIXTURES, FIXTURES_PATH, FIXTURES_SHA256, MACHINES_PATH, MACHINES_SHA256, named, sha256, withDefaults } from "./fixtures";

describe("fixture pins", () => {
  // The sabotage sweep mutates machines.json to prove BEHAVIOUR catches it; with
  // the pin on, every such mutation would be "caught" by the hash alone.
  it.skipIf(process.env.FANCY_CHAT_SABOTAGE === "1")("pins the conformance fixture and the machines file byte for byte", () => {
    expect(sha256(readFileSync(FIXTURES_PATH))).toBe(FIXTURES_SHA256);
    expect(sha256(readFileSync(MACHINES_PATH))).toBe(MACHINES_SHA256);
  });

  it("runs every section that names the js leg", () => {
    const sections = Object.entries(FIXTURES).filter(([, v]) => typeof v === "object" && v !== null && "legs" in (v as object));
    const js = sections.filter(([, v]) => (v as { legs: string[] }).legs.includes("js")).map(([k]) => k);
    expect(js.sort()).toEqual(
      ["actionable", "approval", "decide", "delivery", "envelope", "optionTone", "parts", "projection", "question", "reservedTools", "sequence", "status", "turn"].sort(),
    );
  });
});

describe("envelope", () => {
  it.each(named(FIXTURES.envelope.cases, (c) => c.name))("%s", (_name, c) => {
    const result = validateEvent(c.event);
    expect({ ok: result.ok, error: result.ok ? null : result.error }).toEqual({ ok: c.ok, error: c.error });
  });
});

describe("turn machine", () => {
  it.each(named(FIXTURES.turn.cases, (c) => `${c.from} --${c.action}-->`))("%s", (_n, c) => {
    const r = transitionTurn(c.from, c.action);
    expect(r.ok).toBe(c.ok);
    expect(r.ok ? { to: r.to, outcome: r.outcome, reason: r.reason } : { to: null, outcome: null, reason: null }).toEqual({ to: c.to, outcome: c.outcome, reason: c.reason });
  });
});

describe("delivery machine", () => {
  it.each(named(FIXTURES.delivery.cases, (c) => `${c.from} --${c.action}-->`))("%s", (_n, c) => {
    const r = transitionDelivery(c.from, c.action);
    expect({ ok: r.ok, to: r.ok ? r.to : null }).toEqual({ ok: c.ok, to: c.to });
  });
});

describe("approval machine", () => {
  it.each(named(FIXTURES.approval.cases, (c) => `${c.from} --${c.action}-->`))("%s", (_n, c) => {
    const r = transitionApproval(c.from, c.action);
    expect({ ok: r.ok, to: r.ok ? r.to : null }).toEqual({ ok: c.ok, to: c.to });
  });
});

describe("option tone comes from the kind, never the label", () => {
  it.each(named(FIXTURES.optionTone.cases, (c) => c.kind))("%s", (_n, c) => {
    expect(optionTone(c.kind)).toEqual({ tone: c.tone, decision: c.decision });
  });
});

describe("only a human decides", () => {
  it.each(named(FIXTURES.decide.cases, (_c, i) => String(i)))("case %s", (_n, c) => {
    expect(canDecide(c.actor)).toBe(c.allowed);
  });
});

describe("reserved confirmation tools", () => {
  it.each(named(FIXTURES.reservedTools.cases, (c) => c.name))("%s", (_n, c) => {
    expect(isReservedToolName(c.name)).toBe(c.reserved);
  });
});

describe("question answers", () => {
  it.each(named(FIXTURES.question.cases, (c) => c.name))("%s", (_n, c) => {
    const r = canSubmitAnswer({ ...FIXTURES.question.question, allowNote: c.allowNote ?? FIXTURES.question.question.allowNote }, c.draft);
    expect({ ok: r.ok, error: r.ok ? null : r.error }).toEqual({ ok: c.canSubmit, error: c.error });
  });
});

describe("single actionable", () => {
  it.each(named(FIXTURES.actionable.cases, (c) => c.name))("%s", (_n, c) => {
    expect(pickActionable(c.items, c.kinds)).toBe(c.actionable);
  });
});

describe("message parts", () => {
  it.each(named(FIXTURES.parts.cases, (c) => c.name))("%s", (_n, c) => {
    const r = validatePart(c.part, c.context);
    expect({ ok: r.ok, error: r.ok ? null : r.error }).toEqual({ ok: c.ok, error: c.error });
    if (c.ok) expect(partToText(c.part)).toBe(c.text);
  });
});

describe("agent status", () => {
  it.each(named(FIXTURES.status.cases, (c) => c.name))("%s", (_n, c) => {
    const config = { ...FIXTURES.status.config, ...(c.config ?? {}) };
    expect(deriveAgentStatus(c.snapshot, config)).toEqual(c.expect);
  });
});

describe("projection", () => {
  it.each(named(FIXTURES.projection.cases, (c) => c.name))("%s", (_n, c) => {
    const events = c.events.map((e: Record<string, unknown>) => withDefaults(FIXTURES.projection.defaults, e)) as ChatEvent[];
    const p = projectThread(events);
    expect({
      lastSeq: p.lastSeq,
      illegal: p.illegal,
      turns: p.turns,
      approvals: p.approvals.map((a) => ({ approvalId: a.approvalId, state: a.state })),
      questions: p.questions.map((q) => ({ questionId: q.questionId, state: q.state })),
      rows: p.rows,
    }).toEqual(c.expect);
  });
});

describe("sequence log (client leg)", () => {
  const ev = (x: number | { seq: number; type: string }): ChatEvent =>
    ({
      v: 1,
      threadId: "t_1",
      at: "2026-11-15T10:00:00.000Z",
      actor: { kind: "system", id: "server" },
      data: {},
      ...(typeof x === "number" ? { seq: x, type: "usage" } : x),
    }) as ChatEvent;

  it.each(named(FIXTURES.sequence.cases, (c) => c.name))("%s", (_n, c) => {
    let log = createSeqLog(c.start ?? 0);
    const applied: number[] = [];
    let missing: unknown = null;
    for (const batch of c.batches) {
      const r = ingestEvents(log, batch.map(ev));
      log = r.log;
      applied.push(...r.applied.map((e) => e.seq));
      missing = r.missing;
    }
    expect({ lastSeq: log.lastSeq, applied, missing }).toEqual(c.expect);
  });
});
