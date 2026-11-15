import { describe, expect, it } from "vitest";

import { createPartRegistry, partToText, validatePart, validateParts, DEFAULT_PART_LIMITS } from "../src/index";

describe("the part registry", () => {
  const registry = createPartRegistry([
    {
      kind: "x-moic.deal",
      validate: (p) => (typeof p.dealId === "number" ? true : "part.x-moic.deal.id"),
      toText: (p) => `Deal #${String(p.dealId)}`,
    },
  ]);

  it("uses the app's validator and its plain-text form", () => {
    expect(validatePart({ id: "p", kind: "x-moic.deal", dealId: 7 }, { origin: "agent", registry })).toEqual({ ok: true });
    expect(validatePart({ id: "p", kind: "x-moic.deal", dealId: "7" }, { origin: "agent", registry })).toEqual({ ok: false, error: "part.x-moic.deal.id" });
    expect(partToText({ id: "p", kind: "x-moic.deal", dealId: 7 }, registry)).toBe("Deal #7");
  });

  it("an unregistered extension still renders as text, never dropped", () => {
    expect(partToText({ id: "p", kind: "x-other.thing" })).toBe("[x-other.thing]");
  });

  it("refuses to redefine a core kind, an unnamespaced kind, or a duplicate", () => {
    expect(() => createPartRegistry().register({ kind: "text" })).toThrow(/Core part kind/);
    expect(() => createPartRegistry().register({ kind: "deal" })).toThrow(/x-<app>/);
    expect(() => registry.register({ kind: "x-moic.deal" })).toThrow(/already registered/);
  });

  it("validator verdict false maps to a kind-named error", () => {
    const r = createPartRegistry([{ kind: "x-a.b", validate: () => false }]);
    expect(validatePart({ id: "p", kind: "x-a.b" }, { origin: "agent", registry: r })).toEqual({ ok: false, error: "part.x-a.b" });
  });
});

describe("limits are configurable", () => {
  it("has the documented defaults", () => {
    expect(DEFAULT_PART_LIMITS).toEqual({ maxPartBytes: 65536, maxDepth: 3, maxParts: 64 });
  });

  it("caps the part count per message", () => {
    const parts = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, kind: "text", format: "plain", text: "x" }));
    expect(validateParts(parts, { origin: "agent", limits: { maxParts: 2 } })).toEqual({ ok: false, error: "message.parts.count" });
    expect(validateParts(parts, { origin: "agent", limits: { maxParts: 3 } })).toEqual({ ok: true });
  });

  it("the size cap is inclusive of exactly the limit", () => {
    const part = { id: "p", kind: "text", format: "plain", text: "abc" };
    const bytes = new TextEncoder().encode(JSON.stringify(part)).length;
    expect(validatePart(part, { origin: "agent", limits: { maxPartBytes: bytes } })).toEqual({ ok: true });
    expect(validatePart(part, { origin: "agent", limits: { maxPartBytes: bytes - 1 } })).toEqual({ ok: false, error: "part.size" });
  });

  it("raising the depth cap admits deeper cards", () => {
    const deep = { id: "a", kind: "card", cardType: "x", body: [{ id: "b", kind: "card", cardType: "x", body: [{ id: "c", kind: "card", cardType: "x", body: [{ id: "d", kind: "card", cardType: "x", body: [] }] }] }] };
    expect(validatePart(deep, { origin: "agent" })).toEqual({ ok: false, error: "part.depth" });
    expect(validatePart(deep, { origin: "agent", limits: { maxDepth: 4 } })).toEqual({ ok: true });
  });
});

describe("typed approval defaults (owner: opt-in per app)", () => {
  it("is off, with no phrases, until the host turns it on", async () => {
    const { DEFAULT_TYPED_APPROVAL, matchTypedApproval } = await import("../src/index");
    expect(DEFAULT_TYPED_APPROVAL).toEqual({ enabled: false, locale: "en", phrases: {} });
    const approval = { state: "pending" as const, options: [{ id: "o", kind: "allow-once" as const, label: "Go" }] };
    expect(matchTypedApproval("approve", approval, { phrases: { en: { approve: ["approve"] } } })).toBeNull();
    expect(matchTypedApproval("approve", approval, { enabled: true })).toBeNull();
    expect(matchTypedApproval("approve", approval, { enabled: true, phrases: { en: { approve: ["approve"] } } })).toEqual({ optionId: "o", decision: "approve" });
  });
});
