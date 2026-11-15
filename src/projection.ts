import { isPlainObject } from "./events";
import { canDecide } from "./hitl";
import { isSettlingTurnAction, transitionApproval, transitionDelivery, transitionTurn } from "./machines";
import type { Actor, ApprovalRecord, ChatEvent, DeliveryState, Part, QuestionRecord, TurnOutcome, TurnState } from "./types";

export interface MessageEntry {
  id: string;
  role: string;
  author: Actor | null;
  turnId: string | null;
  parts: Part[];
  /** Ids of parts still streaming. */
  open: string[];
  delivery: DeliveryState | null;
  supersedes: string | null;
  retracted: boolean;
  superseded: boolean;
}

export interface TurnEntry {
  turnId: string;
  state: TurnState;
  outcome: TurnOutcome | null;
  reason: string | null;
}

export interface ThinkingEntry {
  runId: string;
  text: string;
  live: boolean;
}

export interface ToolEntry {
  toolCallId: string;
  runId: string | null;
  name: string;
  args: Record<string, unknown>;
  startedAt: string | null;
  progress: { fraction: number | null; text: string | null } | null;
  outcome: "ok" | "failure" | "refusal" | null;
  durationMs: number | null;
  outputRef: string | null;
  truncated: boolean;
}

export interface PlanStep {
  id: string;
  title: string;
  status: "pending" | "running" | "held" | "done" | "failed" | "skipped";
  owner: "agent" | "human";
  approvalId?: string;
}

export interface PlanEntry {
  runId: string;
  steps: PlanStep[];
}

export type RowKind = "message" | "thinking" | "tool" | "plan" | "approval" | "question";

/**
 * The whole projected thread as plain JSON. This IS the snapshot format: a
 * `thread.reset` carries one, and the PHP twin produces the same shape.
 */
export interface ThreadState {
  lastSeq: number;
  /** Events refused by the machines or the human-only rule. Diagnostics, never state. */
  illegal: number;
  order: { kind: RowKind; id: string }[];
  messages: MessageEntry[];
  turns: TurnEntry[];
  thinking: ThinkingEntry[];
  tools: ToolEntry[];
  plans: PlanEntry[];
  approvals: ApprovalRecord[];
  questions: QuestionRecord[];
}

export type Row =
  | ({ kind: "message" } & MessageEntry)
  | ({ kind: "thinking"; id: string } & ThinkingEntry)
  | ({ kind: "tool"; id: string } & ToolEntry)
  | ({ kind: "plan"; id: string } & PlanEntry)
  | { kind: "approval"; id: string; approvalId: string; state: ApprovalRecord["state"] }
  | { kind: "question"; id: string; questionId: string; state: NonNullable<QuestionRecord["state"]> };

export function emptyThreadState(): ThreadState {
  return { lastSeq: 0, illegal: 0, order: [], messages: [], turns: [], thinking: [], tools: [], plans: [], approvals: [], questions: [] };
}

const NO_RUN = "_";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * A decision or answer counts only when the event's actor is a human AND the
 * recorded decider is that same human. A body naming a human, carried by an
 * agent's event, is a forgery and is refused.
 */
function decidedByActor(event: ChatEvent, claimed: unknown): boolean {
  return canDecide(event.actor) && isPlainObject(claimed) && claimed.kind === event.actor.kind && claimed.id === event.actor.id;
}

const byId = <T>(list: T[], key: keyof T, id: unknown): T | undefined => list.find((x) => x[key] === id);

/**
 * Applies one event to the state, in place. Idempotent: an event at or below
 * `lastSeq` changes nothing. Returns whether the event was applied (legal or
 * not). An illegal event bumps `illegal` and leaves every entry untouched.
 */
export function applyEvent(state: ThreadState, event: ChatEvent): boolean {
  if (event.seq <= state.lastSeq) return false;
  const data = (isPlainObject(event.data) ? event.data : {}) as Record<string, unknown>;
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
        author: isPlainObject(m.author) ? (clone(m.author) as unknown as Actor) : clone(event.actor),
        turnId: typeof data.turnId === "string" ? data.turnId : (event.turnId ?? null),
        parts: Array.isArray(m.parts) ? (clone(m.parts) as Part[]) : [],
        open: [],
        delivery: typeof m.delivery === "string" ? (m.delivery as DeliveryState) : null,
        supersedes,
        retracted: false,
        superseded: false,
      });
      if (supersedes) {
        const target = byId(state.messages, "id", supersedes);
        if (target) target.superseded = true;
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
      msg.parts = clone(data.parts) as Part[];
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
      msg.parts.push(clone(part) as Part);
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
      const current = msg.parts[index] as Part;
      if (current.kind === "text" && typeof data.text === "string") {
        current.text = String(current.text ?? "") + data.text;
      } else if (isPlainObject(data.part)) {
        msg.parts[index] = { ...(clone(data.part) as Part), id: current.id };
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
      let entry = byId(state.thinking, "runId", runId);
      if (!entry) {
        if (event.type === "thinking.completed") {
          illegal();
          break;
        }
        entry = { runId, text: "", live: true };
        state.thinking.push(entry);
        state.order.push({ kind: "thinking", id: runId });
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
        outputRef: null,
        truncated: false,
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
        text: typeof data.text === "string" ? data.text : null,
      };
      break;
    }

    case "tool.result": {
      const tool = byId(state.tools, "toolCallId", data.toolCallId);
      if (!tool || (data.outcome !== "ok" && data.outcome !== "failure" && data.outcome !== "refusal")) {
        illegal();
        break;
      }
      tool.outcome = data.outcome;
      tool.durationMs = typeof data.durationMs === "number" ? data.durationMs : null;
      tool.outputRef = typeof data.outputRef === "string" ? data.outputRef : null;
      tool.truncated = data.truncated === true;
      break;
    }

    case "plan.updated": {
      if (!Array.isArray(data.steps)) {
        illegal();
        break;
      }
      const runId = event.runId ?? NO_RUN;
      let plan = byId(state.plans, "runId", runId);
      if (!plan) {
        plan = { runId, steps: [] };
        state.plans.push(plan);
        state.order.push({ kind: "plan", id: runId });
      }
      plan.steps = clone(data.steps) as PlanStep[];
      break;
    }

    case "turn.started": {
      if (typeof data.turnId !== "string" || byId(state.turns, "turnId", data.turnId)) {
        illegal();
        break;
      }
      state.turns.push({ turnId: data.turnId, state: "pending", outcome: null, reason: null });
      break;
    }

    case "turn.transition":
    case "turn.settled": {
      const turn = byId(state.turns, "turnId", data.turnId);
      const action = typeof data.action === "string" ? data.action : "";
      // Only turn.settled settles a turn; a transition never may.
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
      state.approvals.push({ ...(clone(a) as unknown as ApprovalRecord), state: "pending" });
      state.order.push({ kind: "approval", id: a.approvalId });
      break;
    }

    case "approval.decided": {
      const record = byId(state.approvals, "approvalId", data.approvalId);
      if (!record || !decidedByActor(event, data.decidedBy) || typeof data.decision !== "string") {
        illegal();
        break;
      }
      const from = record.state === "pending" ? transitionApproval("pending", "begin-decision") : { ok: true as const, to: record.state };
      const next = from.ok ? transitionApproval(from.to, data.decision) : from;
      if (!next.ok) {
        illegal();
        break;
      }
      record.state = next.to;
      record.decision = data.decision as ApprovalRecord["decision"];
      record.decidedBy = clone(data.decidedBy) as Actor;
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
      state.questions.push({ ...(clone(q) as unknown as QuestionRecord), state: "open" });
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
      q.answeredBy = clone(data.answeredBy) as Actor;
      q.values = isPlainObject(data.values) ? clone(data.values) : {};
      q.notes = isPlainObject(data.notes) ? (clone(data.notes) as Record<string, string>) : {};
      break;
    }

    default:
      // Runs, usage, agent status, undo, handoff and x-* events carry no row.
      break;
  }

  state.lastSeq = event.seq;
  return true;
}

/** The rows a thread renders, in order of first appearance. */
export function rowsOf(state: ThreadState): Row[] {
  const rows: Row[] = [];
  for (const { kind, id } of state.order) {
    if (kind === "message") {
      const m = byId(state.messages, "id", id);
      if (m) rows.push({ kind, ...m });
    } else if (kind === "thinking") {
      const t = byId(state.thinking, "runId", id);
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
    }
  }
  return rows;
}

export interface ThreadProjection {
  lastSeq: number;
  illegal: number;
  rows: Row[];
  turns: TurnEntry[];
  approvals: ApprovalRecord[];
  questions: QuestionRecord[];
  state: ThreadState;
}

/** Pure: folds events, in the order given, into the projected thread. */
export function projectThread(events: readonly ChatEvent[], initial?: ThreadState): ThreadProjection {
  const state = initial ? clone(initial) : emptyThreadState();
  for (const event of events) applyEvent(state, event);
  return { lastSeq: state.lastSeq, illegal: state.illegal, rows: rowsOf(state), turns: state.turns, approvals: state.approvals, questions: state.questions, state };
}
