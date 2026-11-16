'use strict';

// src/types.ts
var CONTRACT_VERSION = 1;

// src/events.ts
var CORE_EVENT_TYPES = [
  "thread.snapshot",
  "thread.reset",
  "run.started",
  "run.finished",
  "run.failed",
  "run.cancelled",
  "turn.started",
  "turn.transition",
  "turn.settled",
  "message.created",
  "message.updated",
  "message.retracted",
  "delivery.changed",
  "part.started",
  "part.delta",
  "part.completed",
  "thinking.started",
  "thinking.delta",
  "thinking.completed",
  "tool.called",
  "tool.progress",
  "tool.result",
  "plan.updated",
  "approval.requested",
  "approval.decided",
  "approval.applied",
  "approval.withdrawn",
  "question.asked",
  "question.answered",
  "undo.opened",
  "undo.committed",
  "undo.reverted",
  "agent.status",
  "usage",
  "provider.fallback",
  "control.handoff"
];
var CORE = new Set(CORE_EVENT_TYPES);
var EXTENSION = /^x-[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9._-]*$/;
var TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
var ACTOR_KINDS = /* @__PURE__ */ new Set(["agent", "human", "system"]);
var OPTIONAL_IDS = ["runId", "turnId", "parentRunId", "rootRunId"];
function isTimestamp(value) {
  return typeof value === "string" && TIMESTAMP.test(value);
}
function isEventType(type) {
  return typeof type === "string" && (CORE.has(type) || EXTENSION.test(type));
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateEvent(input) {
  if (!isPlainObject(input)) return { ok: false, error: "event.shape" };
  const e = input;
  if (e.v !== 1) return { ok: false, error: "contract.version" };
  if (typeof e.seq !== "number" || !Number.isInteger(e.seq) || e.seq < 1) return { ok: false, error: "event.seq" };
  if (typeof e.threadId !== "string" || e.threadId === "") return { ok: false, error: "event.threadId" };
  if (!isEventType(e.type)) return { ok: false, error: "event.type" };
  if (typeof e.at !== "string" || !TIMESTAMP.test(e.at)) return { ok: false, error: "event.at" };
  const actor = e.actor;
  if (!isPlainObject(actor) || typeof actor.kind !== "string" || !ACTOR_KINDS.has(actor.kind) || typeof actor.id !== "string") {
    return { ok: false, error: "event.actor" };
  }
  if (!isPlainObject(e.data)) return { ok: false, error: "event.data" };
  for (const key of OPTIONAL_IDS) {
    const value = e[key];
    if (value !== void 0 && value !== null && typeof value !== "string") return { ok: false, error: `event.${key}` };
  }
  return { ok: true, event: e };
}

// contract/machines.json
var machines_default = {
  v: 1,
  turn: {
    initial: "pending",
    states: ["pending", "running", "awaiting-human", "cancelling", "settled"],
    outcomes: ["completed", "failed", "refused", "cancelled", "interrupted"],
    transitions: [
      { from: "pending", action: "start", to: "running" },
      { from: "running", action: "park", to: "awaiting-human" },
      { from: "awaiting-human", action: "resume", to: "running" },
      { from: "pending", action: "cancel", to: "cancelling" },
      { from: "running", action: "cancel", to: "cancelling" },
      { from: "awaiting-human", action: "cancel", to: "cancelling" },
      { from: "cancelling", action: "cancelled", to: "settled", outcome: "cancelled" },
      { from: "cancelling", action: "interrupted", to: "settled", outcome: "interrupted" },
      { from: "running", action: "finish", to: "settled", outcome: "completed" },
      { from: "running", action: "fail", to: "settled", outcome: "failed" },
      { from: "running", action: "refuse", to: "settled", outcome: "refused" },
      { from: "pending", action: "fail", to: "settled", outcome: "failed" },
      { from: "pending", action: "reap", to: "settled", outcome: "failed", reason: "stalled" },
      { from: "running", action: "reap", to: "settled", outcome: "failed", reason: "stalled" },
      { from: "awaiting-human", action: "reap", to: "settled", outcome: "failed", reason: "stalled" },
      { from: "cancelling", action: "reap", to: "settled", outcome: "failed", reason: "stalled" }
    ]
  },
  delivery: {
    initial: "sending",
    states: ["sending", "sent", "queued", "steered", "delivered", "decided", "failed", "dropped", "unsent"],
    final: ["steered", "delivered", "decided", "failed", "dropped", "unsent"],
    transitions: [
      { from: "sending", action: "ack", to: "sent" },
      { from: "sending", action: "fail", to: "failed" },
      { from: "sent", action: "queue", to: "queued" },
      { from: "sent", action: "steer", to: "steered" },
      { from: "sent", action: "deliver", to: "delivered" },
      { from: "sent", action: "drop", to: "dropped" },
      { from: "queued", action: "steer", to: "steered" },
      { from: "queued", action: "deliver", to: "delivered" },
      { from: "queued", action: "drop", to: "dropped" },
      { from: "queued", action: "unsend", to: "unsent" },
      { from: "sent", action: "decide", to: "decided" },
      { from: "queued", action: "decide", to: "decided" }
    ]
  },
  approval: {
    initial: "pending",
    states: ["pending", "deciding", "approved", "rejected", "edited", "applied", "apply-failed", "withdrawn", "expired"],
    final: ["rejected", "applied", "apply-failed", "withdrawn", "expired"],
    actionable: ["pending"],
    transitions: [
      { from: "pending", action: "begin-decision", to: "deciding" },
      { from: "deciding", action: "decision-failed", to: "pending" },
      { from: "deciding", action: "approve", to: "approved" },
      { from: "deciding", action: "reject", to: "rejected" },
      { from: "deciding", action: "edit", to: "edited" },
      { from: "approved", action: "apply", to: "applied" },
      { from: "edited", action: "apply", to: "applied" },
      { from: "approved", action: "apply-fail", to: "apply-failed" },
      { from: "edited", action: "apply-fail", to: "apply-failed" },
      { from: "pending", action: "withdraw", to: "withdrawn" },
      { from: "pending", action: "expire", to: "expired" }
    ]
  },
  reservedTools: {
    about: "Tool names an agent may never be offered or call: they are the human's confirmation channel. Matched case-insensitively.",
    exact: ["question_answer", "send_as_human"],
    contains: ["approv", "confirm", "permission", "decide"]
  },
  optionKinds: {
    "allow-once": { tone: "positive", decision: "approve" },
    "allow-always": { tone: "positive", decision: "approve" },
    "reject-once": { tone: "negative", decision: "reject" },
    "reject-always": { tone: "negative", decision: "reject" },
    edit: { tone: "neutral", decision: "edit" }
  }
};

// src/machines.ts
var machines = machines_default;
function find(rows, from, action) {
  return rows.find((r) => r.from === from && r.action === action);
}
function transitionTurn(from, action) {
  const row = find(machines_default.turn.transitions, from, action);
  if (!row) return { ok: false, error: "turn.illegal" };
  return { ok: true, to: row.to, outcome: row.outcome ?? null, reason: row.reason ?? null };
}
function isSettlingTurnAction(action) {
  return machines_default.turn.transitions.some((r) => r.action === action && r.to === "settled");
}
function transitionDelivery(from, action) {
  const row = find(machines_default.delivery.transitions, from, action);
  return row ? { ok: true, to: row.to } : { ok: false, error: "delivery.illegal" };
}
function transitionApproval(from, action) {
  const row = find(machines_default.approval.transitions, from, action);
  return row ? { ok: true, to: row.to } : { ok: false, error: "approval.illegal" };
}
function optionTone(kind) {
  const kinds = machines_default.optionKinds;
  const hit = Object.prototype.hasOwnProperty.call(kinds, kind) ? kinds[kind] : void 0;
  return hit ? { tone: hit.tone, decision: hit.decision } : { tone: null, decision: null };
}

// src/typed-approval.ts
var DEFAULT_TYPED_APPROVAL = { enabled: false, locale: "en", phrases: {} };
var ENGLISH_TYPED_APPROVAL_PHRASES = { approve: ["approve", "yes, approve"], reject: ["reject", "no, reject"] };
var TRAILING_PUNCTUATION = /* @__PURE__ */ new Set([".", "!", "?", "\u3002", "\uFF01", "\uFF1F"]);
function normalizePhrase(text) {
  let s = text.normalize("NFKC").toLowerCase().trim();
  let end = s.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(s[end - 1])) end -= 1;
  s = s.slice(0, end).trim();
  let out = "";
  let space = false;
  for (const ch of s) {
    if (ch === " " || ch === "	" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v") {
      space = true;
      continue;
    }
    if (space && out !== "") out += " ";
    space = false;
    out += ch;
  }
  return out;
}
function pick(options, decision) {
  const once = decision === "approve" ? "allow-once" : "reject-once";
  return options.find((o) => o.kind === once && optionTone(o.kind).decision === decision) ?? null;
}
function matchTypedApproval(text, approval, config = {}) {
  const cfg = { ...DEFAULT_TYPED_APPROVAL, ...config };
  if (!cfg.enabled || !approval || approval.state !== "pending") return null;
  const lists = cfg.phrases[cfg.locale];
  if (!lists) return null;
  const typed = normalizePhrase(text);
  if (typed === "") return null;
  let decision = null;
  if ((lists.approve ?? []).some((p) => normalizePhrase(p) === typed)) decision = "approve";
  else if ((lists.reject ?? []).some((p) => normalizePhrase(p) === typed)) decision = "reject";
  if (!decision) return null;
  const option = pick(approval.options ?? [], decision);
  return option ? { optionId: option.id, decision } : null;
}

// src/undo.ts
function undoWindow(entry, now) {
  if (entry.state !== "open") return { remainingMs: 0, canRevert: false };
  const deadline = isTimestamp(entry.deadline) ? Date.parse(entry.deadline) : Number.NaN;
  if (!Number.isFinite(deadline)) return { remainingMs: 0, canRevert: false };
  const remainingMs = Math.max(0, deadline - now);
  return { remainingMs, canRevert: remainingMs > 0 };
}

// src/plan.ts
var PLAN_STEP_STATUSES = ["pending", "running", "held", "done", "failed", "skipped"];
var RELEASED_BY = /* @__PURE__ */ new Set(["approved", "edited", "applied"]);
var REFUSED_BY = /* @__PURE__ */ new Set(["rejected", "withdrawn", "expired", "apply-failed"]);
function checkPlanUpdate(prev, next, approvals) {
  for (const step of next) {
    if (typeof step !== "object" || step === null || Array.isArray(step)) return { ok: false, error: "plan.step" };
    if (!PLAN_STEP_STATUSES.includes(step.status) || step.owner !== "agent" && step.owner !== "human") {
      return { ok: false, error: "plan.step" };
    }
  }
  for (const before of prev) {
    if (before.status !== "held") continue;
    const after = next.find((s) => s.id === before.id);
    if (!after) return { ok: false, error: "plan.held" };
    if (after.status === "held") continue;
    const approval = before.approvalId ? approvals.find((a) => a.approvalId === before.approvalId) : void 0;
    if (!approval) return { ok: false, error: "plan.held" };
    if (RELEASED_BY.has(approval.state)) continue;
    if (REFUSED_BY.has(approval.state) && (after.status === "skipped" || after.status === "failed")) continue;
    return { ok: false, error: "plan.held" };
  }
  return { ok: true };
}

// src/parts.ts
var CORE_PART_KINDS = [
  "text",
  "code",
  "table",
  "chart",
  "file",
  "image",
  "tool-call",
  "tool-result",
  "card",
  "question",
  "approval"
];
var CHART_TYPES = ["line", "bar", "area", "pie", "scatter"];
var CORE2 = new Set(CORE_PART_KINDS);
var EXTENSION_KIND = /^x-[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9._-]*$/;
var DEFAULT_PART_LIMITS = { maxPartBytes: 65536, maxDepth: 3, maxParts: 64 };
function createPartRegistry(definitions = []) {
  const map = /* @__PURE__ */ new Map();
  const registry = {
    register(definition) {
      if (CORE2.has(definition.kind)) throw new TypeError(`Core part kind "${definition.kind}" cannot be redefined.`);
      if (!EXTENSION_KIND.test(definition.kind)) throw new TypeError("An app part kind must be named x-<app>.<name>.");
      if (map.has(definition.kind)) throw new TypeError(`Part kind "${definition.kind}" is already registered.`);
      map.set(definition.kind, definition);
      return registry;
    },
    get: (kind) => map.get(kind),
    kinds: () => [...map.keys()]
  };
  for (const d of definitions) registry.register(d);
  return registry;
}
var str = (v) => typeof v === "string";
var optStr = (v) => v === void 0 || v === null || typeof v === "string";
var optNum = (v) => v === void 0 || v === null || typeof v === "number" && Number.isFinite(v);
function jsonBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
function fail(error) {
  return { ok: false, error };
}
function validateAt(input, ctx, limits, depth) {
  if (depth > limits.maxDepth) return fail("part.depth");
  if (!isPlainObject(input)) return fail("part.shape");
  const p = input;
  if (!str(p.id) || p.id === "") return fail("part.id");
  if (depth === 1 && jsonBytes(p) > limits.maxPartBytes) return fail("part.size");
  if (!str(p.kind)) return fail("part.kind");
  if (!CORE2.has(p.kind)) {
    if (!EXTENSION_KIND.test(p.kind)) return fail("part.kind");
    const def = ctx.registry?.get(p.kind);
    if (def?.validate) {
      const verdict = def.validate(p);
      if (verdict !== true) return fail(typeof verdict === "string" ? verdict : `part.${p.kind}`);
    }
    return { ok: true };
  }
  switch (p.kind) {
    case "text":
      return (p.format === "markdown" || p.format === "plain") && str(p.text) && (p.interim === void 0 || typeof p.interim === "boolean") ? { ok: true } : fail("part.text");
    case "code":
      return str(p.language) && str(p.code) && optStr(p.filename) ? { ok: true } : fail("part.code");
    case "table": {
      const cols = p.columns;
      if (!Array.isArray(cols) || !Array.isArray(p.rows) || !optStr(p.caption)) return fail("part.table");
      const colsOk = cols.every((c) => isPlainObject(c) && str(c.key) && c.key !== "" && str(c.label) && optStr(c.type));
      const rowsOk = p.rows.every(isPlainObject);
      return colsOk && rowsOk ? { ok: true } : fail("part.table");
    }
    case "chart": {
      if (!optStr(p.title)) return fail("part.chart");
      if (p.echarts !== void 0) {
        if (ctx.origin !== "server") return fail("part.chart.raw");
        return isPlainObject(p.echarts) ? { ok: true } : fail("part.chart");
      }
      const spec = p.spec;
      if (!isPlainObject(spec) || !str(spec.type) || !CHART_TYPES.includes(spec.type)) return fail("part.chart");
      if (!Array.isArray(spec.series) || !spec.series.every((s) => isPlainObject(s) && Array.isArray(s.data) && optStr(s.name))) {
        return fail("part.chart");
      }
      return { ok: true };
    }
    case "file":
      return str(p.name) && str(p.mimeType) && typeof p.size === "number" && Number.isInteger(p.size) && p.size >= 0 && str(p.ref) ? { ok: true } : fail("part.file");
    case "image":
      return str(p.ref) && str(p.alt) && optNum(p.width) && optNum(p.height) ? { ok: true } : fail("part.image");
    case "tool-call":
      return str(p.toolCallId) && str(p.name) && isPlainObject(p.args) ? { ok: true } : fail("part.tool-call");
    case "tool-result": {
      const outcomeOk = p.outcome === "ok" || p.outcome === "failure" || p.outcome === "refusal";
      const contentOk = str(p.content) || Array.isArray(p.content);
      return str(p.toolCallId) && outcomeOk && contentOk && optNum(p.durationMs) ? { ok: true } : fail("part.tool-result");
    }
    case "card": {
      if (!str(p.cardType) || !optStr(p.title) || !Array.isArray(p.body)) return fail("part.card");
      if (p.fields !== void 0 && !(Array.isArray(p.fields) && p.fields.every((f) => isPlainObject(f) && str(f.label) && str(f.value)))) {
        return fail("part.card");
      }
      if (p.actions !== void 0) {
        if (!Array.isArray(p.actions)) return fail("part.card.action");
        for (const a of p.actions) {
          if (!isPlainObject(a) || !str(a.id) || !str(a.label)) return fail("part.card.action");
          if (a.kind === "link") {
            if (!str(a.href) || !/^https?:\/\//i.test(a.href)) return fail("part.card.action");
          } else if (a.kind !== "post-back") {
            return fail("part.card.action");
          }
        }
      }
      for (const child of p.body) {
        const r = validateAt(child, ctx, limits, depth + 1);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    case "question":
    case "approval": {
      if (ctx.origin !== "server") return fail("part.hitl.origin");
      const ref = p.kind === "question" ? p.questionId : p.approvalId;
      return str(ref) && ref !== "" ? { ok: true } : fail(`part.${p.kind}`);
    }
  }
  return fail("part.kind");
}
function validatePart(part, context) {
  const limits = { ...DEFAULT_PART_LIMITS, ...context.limits ?? {} };
  return validateAt(part, context, limits, 1);
}
function validateParts(parts, context) {
  const limits = { ...DEFAULT_PART_LIMITS, ...context.limits ?? {} };
  if (!Array.isArray(parts)) return fail("message.parts");
  if (parts.length > limits.maxParts) return fail("message.parts.count");
  for (const part of parts) {
    const r = validateAt(part, context, limits, 1);
    if (!r.ok) return r;
  }
  return { ok: true };
}
var FENCE = "```";
function partToText(part, registry) {
  switch (part.kind) {
    case "text":
      return String(part.text ?? "");
    case "code":
      return `${FENCE}${String(part.language ?? "")}
${String(part.code ?? "")}
${FENCE}`;
    case "table": {
      const cols = part.columns ?? [];
      const cell = (v) => (v === void 0 || v === null ? "" : String(v)).replace(/[\t\n\r]/g, " ");
      const lines = [cols.map((c) => cell(c.label)).join("	")];
      for (const row of part.rows ?? []) lines.push(cols.map((c) => cell(row[c.key])).join("	"));
      return lines.join("\n");
    }
    case "chart":
      return typeof part.title === "string" && part.title !== "" ? `[chart: ${part.title}]` : "[chart]";
    case "file":
      return `[file: ${String(part.name ?? "")}]`;
    case "image":
      return `[image: ${String(part.alt ?? "")}]`;
    case "tool-call":
      return `[tool: ${String(part.name ?? "")}]`;
    case "tool-result":
      return typeof part.content === "string" ? part.content : `[tool result: ${String(part.outcome ?? "")}]`;
    case "card": {
      const lines = [];
      if (typeof part.title === "string" && part.title !== "") lines.push(part.title);
      for (const child of part.body ?? []) {
        const t = partToText(child, registry);
        if (t !== "") lines.push(t);
      }
      return lines.join("\n");
    }
    case "question":
      return "[question]";
    case "approval":
      return "[approval]";
  }
  const def = registry?.get(part.kind);
  return def?.toText ? def.toText(part) : `[${part.kind}]`;
}

// src/hitl.ts
function canDecide(actor) {
  return isPlainObject(actor) && actor.kind === "human" && typeof actor.id === "string" && actor.id !== "";
}
function isReservedToolName(name) {
  const lower = name.toLowerCase();
  const reserved = machines.reservedTools;
  return reserved.exact.includes(lower) || reserved.contains.some((needle) => lower.includes(needle));
}
function hasValue(type, value) {
  if (value === void 0 || value === null) return false;
  if (type === "multi") return Array.isArray(value) && value.length > 0;
  return typeof value === "string" && value.trim() !== "";
}
function canSubmitAnswer(question, draft) {
  const fields = new Map(question.fields.map((f) => [f.id, f]));
  const values = isPlainObject(draft.values) ? draft.values : {};
  const notes = isPlainObject(draft.notes) ? draft.notes : {};
  for (const [id, value] of Object.entries(values)) {
    const field = fields.get(id);
    if (!field) return { ok: false, error: "question.field" };
    if (value === void 0 || value === null) continue;
    if (field.type === "multi") {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) return { ok: false, error: "question.value" };
    } else if (typeof value !== "string") {
      return { ok: false, error: "question.value" };
    }
    if (field.type !== "text") {
      const offered = new Set((field.options ?? []).map((o) => o.id));
      const chosen = Array.isArray(value) ? value : [value];
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
var ACTIONABLE = { approval: "pending", question: "open" };
var IN_FLIGHT = { approval: "deciding", question: "answering" };
function pickActionable(items, kinds) {
  const scoped = kinds ? items.filter((i) => kinds.includes(i.kind)) : items;
  if (scoped.some((i) => IN_FLIGHT[i.kind] === i.state)) return null;
  let best = null;
  for (const item of scoped) {
    if (ACTIONABLE[item.kind] !== item.state) continue;
    if (!best || item.seq < best.seq) best = item;
  }
  return best ? best.id : null;
}

// src/status.ts
var AGENT_STATUSES = [
  "not-started",
  "starting",
  "working",
  "cooling",
  "idle",
  "sleeping",
  "parked",
  "paused-limit",
  "signed-out",
  "broken"
];
var DEFAULT_STATUS_CONFIG = { coolingMs: 15e3, sleepAfterMs: 6e5 };
var DEFAULT_RECOVERY = {
  "not-started": [],
  starting: ["stop"],
  working: ["stop"],
  cooling: [],
  idle: [],
  sleeping: [],
  parked: ["open-hitl"],
  "paused-limit": ["wait"],
  "signed-out": ["sign-in"],
  broken: ["restart"]
};
function deriveAgentStatus(snapshot, config = {}) {
  const cfg = { ...DEFAULT_STATUS_CONFIG, ...config };
  const recovery = (status, fallback) => [...cfg.recovery?.[status] ?? fallback ?? DEFAULT_RECOVERY[status]];
  const out = (status, detail, since, rec) => ({
    status,
    detail,
    since,
    recovery: recovery(status, rec)
  });
  const now = snapshot.now;
  const turn = snapshot.turn ?? null;
  const background = snapshot.background ?? 0;
  const pending = snapshot.pendingHitl ?? 0;
  const lastSettledAt = snapshot.lastSettledAt ?? null;
  if (typeof snapshot.broken === "string" && snapshot.broken !== "") return out("broken", { reason: snapshot.broken }, null);
  if (snapshot.signedIn === false) return out("signed-out", null, null);
  if (snapshot.limit && snapshot.limit.until > now) return out("paused-limit", { until: snapshot.limit.until }, null);
  if (turn && turn.state === "awaiting-human" || pending > 0) {
    return out("parked", { pending }, turn && turn.state === "awaiting-human" ? turn.since : null);
  }
  if (turn && turn.state === "pending") return out("starting", null, turn.since);
  if (turn && (turn.state === "running" || turn.state === "cancelling")) {
    const cancelling = turn.state === "cancelling";
    return out("working", { background, plan: snapshot.plan ?? null, cancelling }, turn.since, cancelling ? [] : void 0);
  }
  if (background > 0) return out("working", { background, plan: snapshot.plan ?? null, cancelling: false }, null, []);
  if (lastSettledAt === null) {
    return snapshot.everStarted ? out("idle", null, null) : out("not-started", null, null);
  }
  const idleFor = now - lastSettledAt;
  if (idleFor < cfg.coolingMs) return out("cooling", null, lastSettledAt);
  if (idleFor >= cfg.sleepAfterMs) return out("sleeping", null, lastSettledAt + cfg.sleepAfterMs);
  return out("idle", null, lastSettledAt + cfg.coolingMs);
}

// src/sequence.ts
var JUMPS = /* @__PURE__ */ new Set(["thread.reset", "thread.snapshot"]);
function createSeqLog(after = 0) {
  return { lastSeq: after, held: /* @__PURE__ */ new Map() };
}
function ingestEvents(log, events) {
  let lastSeq = log.lastSeq;
  const held = new Map(log.held);
  const applied = [];
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
  let missing = null;
  if (held.size > 0) missing = { after: lastSeq, before: Math.min(...held.keys()) };
  return { log: { lastSeq, held }, applied, missing };
}

// src/projection.ts
function emptyThreadState() {
  return { lastSeq: 0, illegal: 0, order: [], messages: [], turns: [], thinking: [], tools: [], plans: [], approvals: [], questions: [], undos: [], branches: [] };
}
var NO_RUN = "_";
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function decidedByActor(event, claimed) {
  return canDecide(event.actor) && isPlainObject(claimed) && claimed.kind === event.actor.kind && claimed.id === event.actor.id;
}
var byId = (list, key, id) => list.find((x) => x[key] === id);
function applyEvent(state, event) {
  if (event.seq <= state.lastSeq) return false;
  try {
    return reduce(state, event);
  } catch {
    state.illegal += 1;
    state.lastSeq = event.seq;
    return true;
  }
}
function reduce(state, event) {
  const data = isPlainObject(event.data) ? event.data : {};
  const illegal = () => {
    state.illegal += 1;
  };
  switch (event.type) {
    case "thread.snapshot":
    case "thread.reset": {
      const snap = data.snapshot;
      if (!isPlainObject(snap)) {
        illegal();
        break;
      }
      Object.assign(state, emptyThreadState(), clone(snap));
      break;
    }
    case "message.created": {
      const m = data.message;
      if (!isPlainObject(m) || typeof m.id !== "string" || byId(state.messages, "id", m.id)) {
        illegal();
        break;
      }
      const supersedes = typeof m.supersedes === "string" ? m.supersedes : null;
      state.messages.push({
        id: m.id,
        role: typeof m.role === "string" ? m.role : "assistant",
        author: isPlainObject(m.author) ? clone(m.author) : clone(event.actor),
        turnId: typeof data.turnId === "string" ? data.turnId : event.turnId ?? null,
        parts: Array.isArray(m.parts) ? clone(m.parts) : [],
        open: [],
        delivery: typeof m.delivery === "string" ? m.delivery : null,
        supersedes,
        retracted: false,
        superseded: false
      });
      const targetAt = supersedes ? state.order.findIndex((o) => o.kind === "message" && o.id === supersedes) : -1;
      if (supersedes) {
        const target = byId(state.messages, "id", supersedes);
        if (target) target.superseded = true;
      }
      if (supersedes && targetAt >= 0) {
        state.branches.push({ supersededId: supersedes, byId: m.id, rowIds: state.order.slice(targetAt + 1).map((o) => o.id) });
      }
      state.order.push({ kind: "message", id: m.id });
      break;
    }
    case "message.updated": {
      const msg = byId(state.messages, "id", data.messageId);
      if (!msg || !Array.isArray(data.parts)) {
        illegal();
        break;
      }
      msg.parts = clone(data.parts);
      msg.open = msg.open.filter((id) => msg.parts.some((p) => p.id === id));
      break;
    }
    case "message.retracted": {
      const msg = byId(state.messages, "id", data.messageId);
      if (!msg) illegal();
      else msg.retracted = true;
      break;
    }
    case "delivery.changed": {
      const msg = byId(state.messages, "id", data.messageId);
      const next = msg && msg.delivery !== null && typeof data.action === "string" ? transitionDelivery(msg.delivery, data.action) : null;
      if (!msg || !next || !next.ok) illegal();
      else msg.delivery = next.to;
      break;
    }
    case "part.started": {
      const msg = byId(state.messages, "id", data.messageId);
      const part = data.part;
      if (!msg || !isPlainObject(part) || typeof part.id !== "string" || msg.parts.some((p) => p.id === part.id)) {
        illegal();
        break;
      }
      msg.parts.push(clone(part));
      msg.open.push(part.id);
      break;
    }
    case "part.delta": {
      const msg = byId(state.messages, "id", data.messageId);
      const index = msg ? msg.parts.findIndex((p) => p.id === data.partId) : -1;
      if (!msg || index < 0) {
        illegal();
        break;
      }
      const current = msg.parts[index];
      if (current.kind === "text" && typeof data.text === "string") {
        current.text = String(current.text ?? "") + data.text;
      } else if (isPlainObject(data.part)) {
        msg.parts[index] = { ...clone(data.part), id: current.id };
      } else {
        illegal();
      }
      break;
    }
    case "part.completed": {
      const msg = byId(state.messages, "id", data.messageId);
      if (!msg || !msg.parts.some((p) => p.id === data.partId)) illegal();
      else msg.open = msg.open.filter((id) => id !== data.partId);
      break;
    }
    case "thinking.started":
    case "thinking.delta":
    case "thinking.completed": {
      const runId = event.runId ?? NO_RUN;
      if (data.thinkingId !== void 0 && typeof data.thinkingId !== "string") {
        illegal();
        break;
      }
      const explicit = typeof data.thinkingId === "string" ? data.thinkingId : null;
      const ofRun = state.thinking.filter((t) => t.runId === runId);
      const latest = ofRun.length > 0 ? ofRun[ofRun.length - 1] : void 0;
      let entry = explicit !== null ? byId(state.thinking, "thinkingId", explicit) : latest && (latest.live || event.type === "thinking.completed") ? latest : void 0;
      if (!entry) {
        if (event.type === "thinking.completed") {
          illegal();
          break;
        }
        const thinkingId = explicit ?? (ofRun.length === 0 ? runId : `${runId}#${ofRun.length + 1}`);
        if (byId(state.thinking, "thinkingId", thinkingId)) {
          illegal();
          break;
        }
        entry = { thinkingId, runId, text: "", live: true };
        state.thinking.push(entry);
        state.order.push({ kind: "thinking", id: thinkingId });
      }
      if (event.type === "thinking.started") entry.live = true;
      else if (event.type === "thinking.delta" && typeof data.text === "string") entry.text += data.text;
      else if (event.type === "thinking.completed") entry.live = false;
      break;
    }
    case "tool.called": {
      if (typeof data.toolCallId !== "string" || typeof data.name !== "string" || byId(state.tools, "toolCallId", data.toolCallId)) {
        illegal();
        break;
      }
      state.tools.push({
        toolCallId: data.toolCallId,
        runId: event.runId ?? null,
        name: data.name,
        args: isPlainObject(data.args) ? clone(data.args) : {},
        startedAt: typeof data.startedAt === "string" ? data.startedAt : null,
        progress: null,
        outcome: null,
        durationMs: null,
        durationExact: true,
        outputRef: null,
        truncated: false,
        output: null,
        outputLanguage: null
      });
      state.order.push({ kind: "tool", id: data.toolCallId });
      break;
    }
    case "tool.progress": {
      const tool = byId(state.tools, "toolCallId", data.toolCallId);
      if (!tool) {
        illegal();
        break;
      }
      tool.progress = {
        fraction: typeof data.fraction === "number" ? data.fraction : null,
        text: typeof data.text === "string" ? data.text : null
      };
      break;
    }
    case "tool.result": {
      const tool = byId(state.tools, "toolCallId", data.toolCallId);
      if (!tool || data.outcome !== "ok" && data.outcome !== "failure" && data.outcome !== "refusal") {
        illegal();
        break;
      }
      tool.outcome = data.outcome;
      tool.durationMs = typeof data.durationMs === "number" ? data.durationMs : null;
      tool.durationExact = data.durationExact !== false;
      tool.outputRef = typeof data.outputRef === "string" ? data.outputRef : null;
      tool.truncated = data.truncated === true;
      tool.output = typeof data.output === "string" ? data.output : null;
      tool.outputLanguage = typeof data.outputLanguage === "string" ? data.outputLanguage : null;
      break;
    }
    case "plan.updated": {
      if (!Array.isArray(data.steps)) {
        illegal();
        break;
      }
      const runId = event.runId ?? NO_RUN;
      let plan = byId(state.plans, "runId", runId);
      if (!checkPlanUpdate(plan?.steps ?? [], data.steps, state.approvals).ok) {
        illegal();
        break;
      }
      if (!plan) {
        plan = { runId, steps: [] };
        state.plans.push(plan);
        state.order.push({ kind: "plan", id: runId });
      }
      plan.steps = clone(data.steps);
      break;
    }
    case "turn.started": {
      if (typeof data.turnId !== "string" || byId(state.turns, "turnId", data.turnId)) {
        illegal();
        break;
      }
      const origin = typeof data.messageId === "string" ? byId(state.messages, "id", data.messageId) : void 0;
      state.turns.push({ turnId: data.turnId, state: "pending", outcome: null, reason: null, messageId: origin ? origin.id : null });
      if (origin && origin.turnId === null) origin.turnId = data.turnId;
      break;
    }
    case "turn.transition":
    case "turn.settled": {
      const turn = byId(state.turns, "turnId", data.turnId);
      const action = typeof data.action === "string" ? data.action : "";
      const settling = isSettlingTurnAction(action);
      if (!turn || settling !== (event.type === "turn.settled")) {
        illegal();
        break;
      }
      const next = transitionTurn(turn.state, action);
      if (!next.ok) {
        illegal();
        break;
      }
      turn.state = next.to;
      turn.outcome = next.outcome;
      turn.reason = typeof data.reason === "string" ? data.reason : next.reason;
      break;
    }
    case "approval.requested": {
      const a = data.approval;
      if (!isPlainObject(a) || typeof a.approvalId !== "string" || byId(state.approvals, "approvalId", a.approvalId)) {
        illegal();
        break;
      }
      state.approvals.push({ ...clone(a), state: "pending" });
      state.order.push({ kind: "approval", id: a.approvalId });
      break;
    }
    case "approval.decided": {
      const record = byId(state.approvals, "approvalId", data.approvalId);
      if (!record || !decidedByActor(event, data.decidedBy) || typeof data.decision !== "string") {
        illegal();
        break;
      }
      const from = record.state === "pending" ? transitionApproval("pending", "begin-decision") : { ok: true, to: record.state };
      const next = from.ok ? transitionApproval(from.to, data.decision) : from;
      if (!next.ok) {
        illegal();
        break;
      }
      record.state = next.to;
      record.decision = data.decision;
      record.decidedBy = clone(data.decidedBy);
      record.optionId = typeof data.optionId === "string" ? data.optionId : null;
      record.note = typeof data.note === "string" ? data.note : null;
      break;
    }
    case "approval.applied": {
      const record = byId(state.approvals, "approvalId", data.approvalId);
      const next = record ? transitionApproval(record.state, data.ok === true ? "apply" : "apply-fail") : null;
      if (!record || !next || !next.ok) {
        illegal();
        break;
      }
      record.state = next.to;
      record.error = typeof data.error === "string" ? data.error : null;
      break;
    }
    case "approval.withdrawn": {
      const record = byId(state.approvals, "approvalId", data.approvalId);
      const next = record ? transitionApproval(record.state, data.expired === true ? "expire" : "withdraw") : null;
      if (!record || !next || !next.ok) illegal();
      else record.state = next.to;
      break;
    }
    case "question.asked": {
      const q = data.question;
      if (!isPlainObject(q) || typeof q.questionId !== "string" || byId(state.questions, "questionId", q.questionId)) {
        illegal();
        break;
      }
      state.questions.push({ ...clone(q), state: "open" });
      state.order.push({ kind: "question", id: q.questionId });
      break;
    }
    case "question.answered": {
      const q = byId(state.questions, "questionId", data.questionId);
      if (!q || q.state !== "open" || !decidedByActor(event, data.answeredBy)) {
        illegal();
        break;
      }
      q.state = "answered";
      q.answeredBy = clone(data.answeredBy);
      q.values = isPlainObject(data.values) ? clone(data.values) : {};
      q.notes = isPlainObject(data.notes) ? clone(data.notes) : {};
      break;
    }
    case "undo.opened": {
      if (typeof data.actionId !== "string" || typeof data.label !== "string" || !isTimestamp(data.deadline) || byId(state.undos, "actionId", data.actionId)) {
        illegal();
        break;
      }
      state.undos.push({ actionId: data.actionId, label: data.label, deadline: data.deadline, state: "open" });
      state.order.push({ kind: "undo", id: data.actionId });
      break;
    }
    case "undo.committed":
    case "undo.reverted": {
      const entry = byId(state.undos, "actionId", data.actionId);
      const allowed = event.type === "undo.committed" || decidedByActor(event, data.revertedBy);
      if (!entry || entry.state !== "open" || !allowed) {
        illegal();
        break;
      }
      entry.state = event.type === "undo.committed" ? "committed" : "reverted";
      break;
    }
  }
  state.lastSeq = event.seq;
  return true;
}
function turnsToCancelForBranch(state, supersededId) {
  const branch = (state.branches ?? []).find((b) => b.supersededId === supersededId);
  if (!branch) return [];
  const ids = /* @__PURE__ */ new Set([supersededId, ...branch.rowIds]);
  const referenced = /* @__PURE__ */ new Set();
  for (const m of state.messages) if (ids.has(m.id) && m.turnId) referenced.add(m.turnId);
  for (const a of state.approvals) if (ids.has(a.approvalId) && typeof a.turnId === "string") referenced.add(a.turnId);
  return state.turns.filter((t) => t.state !== "settled" && referenced.has(t.turnId)).map((t) => t.turnId);
}
function rowsOf(state) {
  const rows = [];
  for (const { kind, id } of state.order) {
    if (kind === "message") {
      const m = byId(state.messages, "id", id);
      if (m) rows.push({ kind, ...m });
    } else if (kind === "thinking") {
      const t = byId(state.thinking, "thinkingId", id);
      if (t) rows.push({ kind, id, ...t });
    } else if (kind === "tool") {
      const t = byId(state.tools, "toolCallId", id);
      if (t) rows.push({ kind, id, ...t });
    } else if (kind === "plan") {
      const p = byId(state.plans, "runId", id);
      if (p) rows.push({ kind, id, ...p });
    } else if (kind === "approval") {
      const a = byId(state.approvals, "approvalId", id);
      if (a) rows.push({ kind, id, approvalId: a.approvalId, state: a.state });
    } else if (kind === "question") {
      const q = byId(state.questions, "questionId", id);
      if (q) rows.push({ kind, id, questionId: q.questionId, state: q.state ?? "open" });
    } else if (kind === "undo") {
      const u = byId(state.undos, "actionId", id);
      if (u) rows.push({ kind, id, ...u });
    }
  }
  return rows;
}
function projectThread(events, initial) {
  const state = initial ? clone(initial) : emptyThreadState();
  for (const event of events) applyEvent(state, event);
  return { lastSeq: state.lastSeq, illegal: state.illegal, rows: rowsOf(state), turns: state.turns, approvals: state.approvals, questions: state.questions, state };
}

exports.AGENT_STATUSES = AGENT_STATUSES;
exports.CHART_TYPES = CHART_TYPES;
exports.CONTRACT_VERSION = CONTRACT_VERSION;
exports.CORE_EVENT_TYPES = CORE_EVENT_TYPES;
exports.CORE_PART_KINDS = CORE_PART_KINDS;
exports.DEFAULT_PART_LIMITS = DEFAULT_PART_LIMITS;
exports.DEFAULT_RECOVERY = DEFAULT_RECOVERY;
exports.DEFAULT_STATUS_CONFIG = DEFAULT_STATUS_CONFIG;
exports.DEFAULT_TYPED_APPROVAL = DEFAULT_TYPED_APPROVAL;
exports.ENGLISH_TYPED_APPROVAL_PHRASES = ENGLISH_TYPED_APPROVAL_PHRASES;
exports.PLAN_STEP_STATUSES = PLAN_STEP_STATUSES;
exports.applyEvent = applyEvent;
exports.canDecide = canDecide;
exports.canSubmitAnswer = canSubmitAnswer;
exports.checkPlanUpdate = checkPlanUpdate;
exports.createPartRegistry = createPartRegistry;
exports.createSeqLog = createSeqLog;
exports.deriveAgentStatus = deriveAgentStatus;
exports.emptyThreadState = emptyThreadState;
exports.ingestEvents = ingestEvents;
exports.isEventType = isEventType;
exports.isPlainObject = isPlainObject;
exports.isReservedToolName = isReservedToolName;
exports.isSettlingTurnAction = isSettlingTurnAction;
exports.isTimestamp = isTimestamp;
exports.jsonBytes = jsonBytes;
exports.machines = machines;
exports.matchTypedApproval = matchTypedApproval;
exports.normalizePhrase = normalizePhrase;
exports.optionTone = optionTone;
exports.partToText = partToText;
exports.pickActionable = pickActionable;
exports.projectThread = projectThread;
exports.rowsOf = rowsOf;
exports.transitionApproval = transitionApproval;
exports.transitionDelivery = transitionDelivery;
exports.transitionTurn = transitionTurn;
exports.turnsToCancelForBranch = turnsToCancelForBranch;
exports.undoWindow = undoWindow;
exports.validateEvent = validateEvent;
exports.validatePart = validatePart;
exports.validateParts = validateParts;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map