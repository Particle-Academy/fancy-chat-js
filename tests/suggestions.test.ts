import { describe, expect, it } from "vitest";

import {
  CORE_EVENT_TYPES,
  DEFAULT_SUGGESTION_LIMITS,
  emptyThreadState,
  isSuggestionText,
  projectThread,
  rowsOf,
  sanitizeSuggestions,
  validateEvent,
  type ChatEvent,
} from "../src/index";

const at = "2026-11-15T10:00:00.000Z";
const ev = (seq: number, type: string, data: Record<string, unknown>, actor = { kind: "system", id: "server" }): ChatEvent =>
  ({ v: 1, seq, threadId: "t_1", at, type, actor, data }) as ChatEvent;

const settled = [
  ev(1, "message.created", { turnId: "u_1", message: { id: "m_1", role: "user", parts: [{ id: "p", kind: "text", format: "plain", text: "Hi" }], delivery: "sent" } }, { kind: "human", id: "u_1" }),
  ev(2, "turn.started", { turnId: "u_1", messageId: "m_1" }),
  ev(3, "turn.transition", { turnId: "u_1", action: "start" }),
  ev(4, "message.created", { turnId: "u_1", message: { id: "m_2", role: "assistant", parts: [{ id: "p", kind: "text", format: "markdown", text: "Hello" }] } }, { kind: "agent", id: "compass" }),
  ev(5, "turn.settled", { turnId: "u_1", action: "finish" }),
];

describe("quick replies in the contract", () => {
  it("is a core event type the envelope accepts", () => {
    expect(CORE_EVENT_TYPES).toContain("suggestions.updated");
    expect(validateEvent(ev(1, "suggestions.updated", { turnId: "u_1", items: [] })).ok).toBe(true);
  });

  it("starts empty as null, a field always present (PHP parity: null rather than absent)", () => {
    const state = emptyThreadState();
    expect(Object.prototype.hasOwnProperty.call(state, "suggestions")).toBe(true);
    expect(state.suggestions).toBeNull();
  });

  it("is thread state, never a row", () => {
    const p = projectThread([...settled, ev(6, "suggestions.updated", { turnId: "u_1", items: [{ id: "s1", text: "Thanks" }] }, { kind: "agent", id: "compass" })]);
    expect(p.suggestions).toEqual({ turnId: "u_1", items: [{ id: "s1", text: "Thanks" }] });
    expect(rowsOf(p.state).map((r) => r.kind)).toEqual(["message", "message"]);
  });

  it("copies the items, so a caller mutating the event cannot reach the state", () => {
    const items = [{ id: "s1", text: "Thanks" }];
    const p = projectThread([...settled, ev(6, "suggestions.updated", { turnId: "u_1", items }, { kind: "agent", id: "compass" })]);
    items[0]!.text = "changed";
    expect(p.suggestions?.items[0]?.text).toBe("Thanks");
  });

  it("stays total on a hostile payload: counted illegal, never a throw", () => {
    const hostile = ev(6, "suggestions.updated", { turnId: "u_1", items: [Object.create(null)] }, { kind: "agent", id: "compass" });
    const p = projectThread([...settled, hostile]);
    expect(p.illegal).toBe(1);
    expect(p.lastSeq).toBe(6);
  });

  it("names its default limits, and they are small", () => {
    expect(DEFAULT_SUGGESTION_LIMITS).toEqual({ maxCount: 3, maxChars: 80 });
    expect(sanitizeSuggestions(["a", "b", "c", "d"])).toHaveLength(3);
    expect(sanitizeSuggestions(["x".repeat(81)])).toEqual([]);
  });

  it("isSuggestionText accepts one clean line only", () => {
    expect(isSuggestionText("Show me")).toBe(true);
    expect(isSuggestionText("")).toBe(false);
    expect(isSuggestionText(" padded")).toBe(false);
    expect(isSuggestionText("two" + String.fromCodePoint(10) + "lines")).toBe(false);
    expect(isSuggestionText(7)).toBe(false);
  });
});
