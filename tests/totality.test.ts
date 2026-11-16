import { describe, expect, it } from "vitest";

import { applyEvent, CORE_EVENT_TYPES, emptyThreadState, type ChatEvent, type ThreadState } from "../src/index";

/*
 * applyEvent is total: a malformed event is counted illegal and the cursor moves
 * past it. It never throws. A throw escapes into the client's transport, which
 * reads it as a failed request and retries the SAME batch, so one bad event
 * stalled an open thread for good while every poll "received" it. A null plan
 * step did exactly that.
 */

const SHAPES: unknown[] = [
  undefined,
  null,
  {},
  "x",
  { message: null },
  { message: { id: "m_1" } },
  { message: { id: "m_1", parts: null } },
  { message: { id: "m_1", parts: "x" } },
  { message: { id: "m_1", parts: [null] } },
  { message: { id: "m_1", parts: [{}] } },
  { messageId: "m_1", partId: "p", text: 5 },
  { messageId: "m_1", part: null },
  { messageId: "m_1", part: { id: "p" } },
  { messageId: "m_1", part: { id: "p", kind: "text", text: null } },
  { messageId: "m_1", partId: ["x"], text: "a" },
  { approval: { approvalId: "a", options: null } },
  { approval: { approvalId: "a", options: "x" } },
  { approval: { approvalId: "a", preview: "x" } },
  { question: { questionId: "q", fields: null } },
  { question: { questionId: "q", fields: [null] } },
  { toolCallId: "tc", args: undefined },
  { toolCallId: ["x"] },
  { steps: null },
  { steps: [null] },
  { steps: [undefined] },
  { steps: ["x", 5] },
  { turnId: "u", action: null },
  { turnId: ["x"], action: "start" },
  { snapshot: { messages: null } },
  { snapshot: { order: "x" } },
  { actionId: "x", window: null },
  { approvalId: "a", decidedBy: null, decision: "approve" },
  { approvalId: ["x"] },
  { questionId: ["x"] },
  { text: ["x"] },
];
const ACTORS: unknown[] = [{ kind: "agent", id: "a" }, null, undefined, "x"];

/** A thread with a message, an open part, a turn and a pending approval. */
function seeded(): ThreadState {
  const s = emptyThreadState();
  const pre: Partial<ChatEvent>[] = [
    { type: "message.created", data: { message: { id: "m_1", role: "assistant", parts: [] } } },
    { type: "part.started", data: { messageId: "m_1", part: { id: "p", kind: "text", text: "" } } },
    { type: "turn.started", data: { turnId: "u" } },
    { type: "plan.updated", runId: "r", data: { steps: [{ id: "s", title: "Pay", status: "held", owner: "human", approvalId: "a" }] } },
    { type: "approval.requested", data: { approval: { approvalId: "a", title: "", options: [{ id: "o", kind: "allow-once", label: "x" }], state: "pending" } } },
  ];
  pre.forEach((p, i) => applyEvent(s, { v: 1, seq: i + 1, threadId: "t", at: "2026-11-15T10:00:00.000Z", actor: { kind: "system", id: "s" }, data: {}, ...p } as ChatEvent));
  return s;
}

describe("applyEvent never throws", () => {
  it.each(CORE_EVENT_TYPES.map((t) => [t]))("on any malformed %s, and advances the cursor", (type) => {
    for (const data of SHAPES) {
      for (const actor of ACTORS) {
        const s = seeded();
        const seq = s.lastSeq + 1;
        const event = { v: 1, seq, threadId: "t", at: "2026-11-15T10:00:00.000Z", type, actor, data, runId: "r", turnId: "u" } as unknown as ChatEvent;
        expect(() => applyEvent(s, event), `${type} ${JSON.stringify(data)} actor=${JSON.stringify(actor)}`).not.toThrow();
        expect(s.lastSeq).toBe(seq);
      }
    }
  });

  it("an event whose fields throw when read is counted illegal, and the cursor still moves", () => {
    const s = seeded();
    const before = s.illegal;
    const hostile = new Proxy({}, { get: () => { throw new Error("boom"); }, ownKeys: () => { throw new Error("boom"); } });
    const event = { v: 1, seq: s.lastSeq + 1, threadId: "t", at: "2026-11-15T10:00:00.000Z", type: "plan.updated", actor: { kind: "agent", id: "a" }, runId: "r", data: { steps: [hostile] } } as unknown as ChatEvent;
    expect(() => applyEvent(s, event)).not.toThrow();
    expect(s.illegal).toBe(before + 1);
    expect(s.lastSeq).toBe(event.seq);
  });
});
