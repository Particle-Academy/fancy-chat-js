/** The contract major. A reader refuses any other and ignores unknown fields. */
declare const CONTRACT_VERSION: 1;
type ActorKind = "agent" | "human" | "system";
interface Actor {
    kind: ActorKind;
    id: string;
    label?: string;
}
/**
 * One event in a thread's append-only log. `seq` is per thread, monotonic and
 * gapless, assigned by the server; it is the only ordering.
 */
interface ChatEvent<TData = Record<string, unknown>> {
    v: 1;
    seq: number;
    threadId: string;
    runId?: string | null;
    turnId?: string | null;
    parentRunId?: string | null;
    rootRunId?: string | null;
    at: string;
    type: string;
    actor: Actor;
    data: TData;
}
type TurnState = "pending" | "running" | "awaiting-human" | "cancelling" | "settled";
type TurnOutcome = "completed" | "failed" | "refused" | "cancelled" | "interrupted";
/** `decided`: the server took the message as a typed decision; it was never delivered to the agent. */
type DeliveryState = "sending" | "sent" | "queued" | "steered" | "delivered" | "decided" | "failed" | "dropped" | "unsent";
type ApprovalState = "pending" | "deciding" | "approved" | "rejected" | "edited" | "applied" | "apply-failed" | "withdrawn" | "expired";
type OptionKind = "allow-once" | "allow-always" | "reject-once" | "reject-always" | "edit";
type OptionTone = "positive" | "negative" | "neutral";
type Decision = "approve" | "reject" | "edit";
/** A message part. Core kinds are a closed set; apps add `x-<app>.<name>`. */
interface Part {
    id: string;
    kind: string;
    [field: string]: unknown;
}
interface TextPart extends Part {
    kind: "text";
    format: "markdown" | "plain";
    text: string;
    interim?: boolean;
}
interface ApprovalOption {
    id: string;
    kind: OptionKind;
    label: string;
}
interface ApprovalRecord {
    approvalId: string;
    runId?: string | null;
    /** The turn the approval parked, when the server knows it. */
    turnId?: string | null;
    toolCallId?: string | null;
    title: string;
    summary: string;
    preview: Part[];
    options: ApprovalOption[];
    state: ApprovalState;
    decidedBy?: Actor | null;
    decision?: Decision | null;
    optionId?: string | null;
    note?: string | null;
    expiresAt?: string | null;
    error?: string | null;
}
type QuestionFieldType = "single" | "multi" | "text";
interface QuestionField {
    id: string;
    type: QuestionFieldType;
    label?: string;
    options?: {
        id: string;
        label: string;
    }[];
    required: boolean;
}
interface QuestionRecord {
    questionId: string;
    prompt: string;
    fields: QuestionField[];
    allowNote: boolean;
    state?: "open" | "answered" | "dismissed";
    answeredBy?: Actor | null;
    values?: Record<string, unknown> | null;
    notes?: Record<string, string> | null;
}
interface AnswerDraft {
    values: Record<string, unknown>;
    notes: Record<string, string>;
}
type Result<T = Record<never, never>> = ({
    ok: true;
} & T) | {
    ok: false;
    error: string;
};

/** The closed set of core event types. Anything else must be `x-<app>.<name>`. */
declare const CORE_EVENT_TYPES: readonly ["thread.snapshot", "thread.reset", "run.started", "run.finished", "run.failed", "run.cancelled", "turn.started", "turn.transition", "turn.settled", "message.created", "message.updated", "message.retracted", "delivery.changed", "part.started", "part.delta", "part.completed", "thinking.started", "thinking.delta", "thinking.completed", "tool.called", "tool.progress", "tool.result", "plan.updated", "approval.requested", "approval.decided", "approval.applied", "approval.withdrawn", "question.asked", "question.answered", "undo.opened", "undo.committed", "undo.reverted", "agent.status", "usage", "provider.fallback", "control.handoff"];
type CoreEventType = (typeof CORE_EVENT_TYPES)[number];
/** An ISO 8601 timestamp with a zone, as every `at` and deadline carries. */
declare function isTimestamp(value: unknown): value is string;
declare function isEventType(type: unknown): boolean;
declare function isPlainObject(value: unknown): value is Record<string, unknown>;
/**
 * Checks an event envelope. Refuses an unknown major (`contract.version`) and
 * ignores unknown fields; never guesses. Errors name the field, never a value.
 */
declare function validateEvent(input: unknown): Result<{
    event: ChatEvent;
}>;

/**
 * Typed approval: a human typing "approve" while an approval is actionable.
 * OPT-IN PER APP (owner, 2026-11-15): off by default and no phrases until the
 * host sets them. Deterministic, never an LLM. A match takes the same decide
 * path, with the same checks, as pressing the button, and is consumed as the
 * decision rather than sent to the agent.
 */
interface TypedApprovalConfig {
    enabled: boolean;
    /** Which phrase list applies. */
    locale: string;
    /** Per locale, the exact phrases (after normalisation) that approve or reject. */
    phrases: Record<string, {
        approve?: string[];
        reject?: string[];
    }>;
}
declare const DEFAULT_TYPED_APPROVAL: TypedApprovalConfig;
/** English phrases a host may opt into. Never applied unless passed in `phrases`. */
declare const ENGLISH_TYPED_APPROVAL_PHRASES: {
    approve: string[];
    reject: string[];
};
/**
 * NFKC, lower case, trimmed, trailing `.`/`!`/`?` dropped, inner white space
 * collapsed to one space. Scans, never a backtracking regex.
 */
declare function normalizePhrase(text: string): string;
/**
 * The decision a typed message makes on a pending approval, or null. Only an
 * exact phrase matches; "please approve it" is a message, not a decision. Edit
 * is never typed.
 */
declare function matchTypedApproval(text: string, approval: Pick<ApprovalRecord, "state" | "options"> | null, config?: Partial<TypedApprovalConfig>): {
    optionId: string;
    decision: Decision;
} | null;

type UndoState = "open" | "committed" | "reverted";
interface UndoEntry {
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
declare function undoWindow(entry: Pick<UndoEntry, "deadline" | "state">, now: number): {
    remainingMs: number;
    canRevert: boolean;
};

declare const PLAN_STEP_STATUSES: readonly ["pending", "running", "held", "done", "failed", "skipped"];
type PlanStepStatus = (typeof PLAN_STEP_STATUSES)[number];
interface PlanStepLike {
    id: string;
    title: string;
    status: PlanStepStatus | string;
    owner: "agent" | "human" | string;
    approvalId?: string;
}
/**
 * A held step releases ONLY through the approval path: it may leave `held`
 * once its approval (the one it was held on) is approved, edited or applied,
 * and may only go to `skipped` or `failed` once that approval was refused. A
 * step cannot be released by dropping it, or by swapping its approval id.
 */
declare function checkPlanUpdate(prev: readonly PlanStepLike[], next: readonly PlanStepLike[], approvals: readonly {
    approvalId: string;
    state: ApprovalState | string;
}[]): Result;

/**
 * The one transition table, shared with fancy-chat-php (which vendors the same
 * file and pins its hash). Nothing here may encode a transition the JSON does
 * not hold.
 */
declare const machines: {
    v: number;
    turn: {
        initial: string;
        states: string[];
        outcomes: string[];
        transitions: ({
            from: string;
            action: string;
            to: string;
            outcome?: undefined;
            reason?: undefined;
        } | {
            from: string;
            action: string;
            to: string;
            outcome: string;
            reason?: undefined;
        } | {
            from: string;
            action: string;
            to: string;
            outcome: string;
            reason: string;
        })[];
    };
    delivery: {
        initial: string;
        states: string[];
        final: string[];
        transitions: {
            from: string;
            action: string;
            to: string;
        }[];
    };
    approval: {
        initial: string;
        states: string[];
        final: string[];
        actionable: string[];
        transitions: {
            from: string;
            action: string;
            to: string;
        }[];
    };
    reservedTools: {
        about: string;
        exact: string[];
        contains: string[];
    };
    optionKinds: {
        "allow-once": {
            tone: string;
            decision: string;
        };
        "allow-always": {
            tone: string;
            decision: string;
        };
        "reject-once": {
            tone: string;
            decision: string;
        };
        "reject-always": {
            tone: string;
            decision: string;
        };
        edit: {
            tone: string;
            decision: string;
        };
    };
};
type TurnTransition = {
    ok: true;
    to: TurnState;
    outcome: TurnOutcome | null;
    reason: string | null;
} | {
    ok: false;
    error: "turn.illegal";
};
declare function transitionTurn(from: string, action: string): TurnTransition;
/** True when `action` moves a turn to `settled`. Only `turn.settled` may carry one. */
declare function isSettlingTurnAction(action: string): boolean;
type SimpleTransition<S> = {
    ok: true;
    to: S;
} | {
    ok: false;
    error: string;
};
declare function transitionDelivery(from: string, action: string): SimpleTransition<DeliveryState>;
declare function transitionApproval(from: string, action: string): SimpleTransition<ApprovalState>;
/** Button tone and decision come from the option KIND, never its label. */
declare function optionTone(kind: string): {
    tone: OptionTone | null;
    decision: Decision | null;
};

declare const CORE_PART_KINDS: readonly ["text", "code", "table", "chart", "file", "image", "tool-call", "tool-result", "card", "question", "approval"];
declare const CHART_TYPES: readonly ["line", "bar", "area", "pie", "scatter"];
interface PartLimits {
    /** JSON byte size of one part, nested parts included. Default 65536. */
    maxPartBytes: number;
    /** Card nesting depth, the outermost part being 1. Default 3. */
    maxDepth: number;
    /** Parts in one message. Default 64. */
    maxParts: number;
}
declare const DEFAULT_PART_LIMITS: PartLimits;
/** Who authored the part. Only server code may place HITL parts or raw ECharts options. */
type PartOrigin = "agent" | "server";
interface PartDefinition<P extends Part = Part> {
    /** `x-<app>.<name>`. Core kinds cannot be redefined. */
    kind: string;
    validate?: (part: P) => boolean | string;
    toText?: (part: P) => string;
}
interface PartRegistry {
    register<P extends Part>(definition: PartDefinition<P>): PartRegistry;
    get(kind: string): PartDefinition | undefined;
    kinds(): string[];
}
declare function createPartRegistry(definitions?: PartDefinition[]): PartRegistry;
interface PartContext {
    origin: PartOrigin;
    limits?: Partial<PartLimits>;
    registry?: PartRegistry;
}
/** JSON byte size, the same measure fancy-chat-php uses (unescaped slashes and unicode). */
declare function jsonBytes(value: unknown): number;
/** Validates one part. Unknown core kinds fail; `x-*` kinds pass unless their registered validator refuses. */
declare function validatePart(part: unknown, context: PartContext): Result;
/** Validates a message's parts: the count cap, then each part. */
declare function validateParts(parts: unknown, context: PartContext): Result;
/**
 * Plain text for a part: copy, notifications, storage, and the fallback render
 * of a kind the client does not know. Never empty-drops a part.
 */
declare function partToText(part: Part, registry?: PartRegistry): string;

/**
 * Only a human may decide an approval or answer a question. The kind must be
 * exactly `human` and the id non-empty; the host's authenticated resolver is
 * what produces this actor, never the request body.
 */
declare function canDecide(actor: unknown): actor is Actor & {
    kind: "human";
};
/** A tool name in the human's confirmation channel. Never offered to an agent. */
declare function isReservedToolName(name: string): boolean;
/**
 * Whether an answer draft may be submitted. Each required field needs a value,
 * or (when the question allows notes) a non-blank note. Values must be of the
 * field's type and options must be offered ones.
 */
declare function canSubmitAnswer(question: QuestionRecord, draft: AnswerDraft): Result;
interface HitlItem {
    id: string;
    kind: "approval" | "question" | string;
    state: string;
    seq: number;
}
/**
 * Exactly one HITL item is actionable within a coordination scope: the oldest
 * by seq. While any decision is in flight, none is.
 */
declare function pickActionable(items: readonly HitlItem[], kinds?: readonly string[]): string | null;

/** The agent status vocabulary. One derivation, used by both servers and the client. */
declare const AGENT_STATUSES: readonly ["not-started", "starting", "working", "cooling", "idle", "sleeping", "parked", "paused-limit", "signed-out", "broken"];
type AgentStatusName = (typeof AGENT_STATUSES)[number];
interface AgentSnapshot {
    /** Milliseconds since the epoch. The derivation is pure: it never reads a clock. */
    now: number;
    signedIn?: boolean;
    broken?: string | null;
    limit?: {
        until: number;
    } | null;
    everStarted?: boolean;
    turn?: {
        state: TurnState;
        since: number;
    } | null;
    lastSettledAt?: number | null;
    background?: number;
    plan?: {
        n: number;
        m: number;
        doing: string | null;
    } | null;
    pendingHitl?: number;
}
interface StatusConfig {
    /** How long after a turn settles the agent reads as cooling. Default 15000. */
    coolingMs: number;
    /** Idle time after which the agent reads as sleeping. Default 600000. */
    sleepAfterMs: number;
    /** Recovery action ids per status; the host's map replaces the default for each status it names. */
    recovery?: Partial<Record<AgentStatusName, string[]>>;
}
declare const DEFAULT_STATUS_CONFIG: StatusConfig;
declare const DEFAULT_RECOVERY: Record<AgentStatusName, string[]>;
interface AgentStatus {
    status: AgentStatusName;
    detail: Record<string, unknown> | null;
    since: number | null;
    recovery: string[];
}
declare function deriveAgentStatus(snapshot: AgentSnapshot, config?: Partial<StatusConfig>): AgentStatus;

/**
 * The client side of resumable replay. Events are applied strictly in seq
 * order: duplicates are dropped, events past a gap are held until the gap
 * fills, and the gap is reported so the transport can re-request
 * `after = lastSeq`. A `thread.reset` jumps the cursor to its own seq.
 */
interface SeqLog {
    readonly lastSeq: number;
    readonly held: ReadonlyMap<number, ChatEvent>;
}
interface Gap {
    /** The last seq applied. Re-request with `after = gap.after`. */
    after: number;
    /** The first seq held past the gap. */
    before: number;
}
interface IngestResult {
    log: SeqLog;
    /** Events now safe to reduce, in seq order. */
    applied: ChatEvent[];
    missing: Gap | null;
}
declare function createSeqLog(after?: number): SeqLog;
declare function ingestEvents(log: SeqLog, events: readonly ChatEvent[]): IngestResult;

interface MessageEntry {
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
interface TurnEntry {
    turnId: string;
    state: TurnState;
    outcome: TurnOutcome | null;
    reason: string | null;
    /**
     * The human message that started this turn (`turn.started` `data.messageId`,
     * when that message is in the log), so a host can retry a failed turn with its
     * original input. Null for a turn no message started.
     */
    messageId: string | null;
}
interface ThinkingEntry {
    /**
     * One run may think several times, between tool calls. Each block has its own id:
     * the event's `data.thinkingId` when it sends one, else the run id for the run's
     * first block and `<runId>#2`, `#3`... for the next.
     */
    thinkingId: string;
    runId: string;
    text: string;
    live: boolean;
}
interface ToolEntry {
    toolCallId: string;
    runId: string | null;
    name: string;
    args: Record<string, unknown>;
    startedAt: string | null;
    progress: {
        fraction: number | null;
        text: string | null;
    } | null;
    outcome: "ok" | "failure" | "refusal" | null;
    durationMs: number | null;
    /**
     * False when the backend could only bound the duration, not measure it (e.g. a
     * Prism Harness step timed across a process hop): render it as "at most".
     */
    durationExact: boolean;
    outputRef: string | null;
    truncated: boolean;
    /**
     * The result's text inline, as the tool or its failure wrote it (a failure's own
     * words, not a generic "failed"). Plain text: render it as text or code, NEVER as
     * HTML. The server bounds it and sets `truncated`; `outputRef` points at the rest.
     */
    output: string | null;
    /** Set when the output is code (e.g. "json"), for a code view; null means plain text. */
    outputLanguage: string | null;
}
interface PlanStep {
    id: string;
    title: string;
    status: "pending" | "running" | "held" | "done" | "failed" | "skipped";
    owner: "agent" | "human";
    approvalId?: string;
}
interface PlanEntry {
    runId: string;
    steps: PlanStep[];
}
type RowKind = "message" | "thinking" | "tool" | "plan" | "approval" | "question" | "undo";
/**
 * Edit-and-resend: the rows between a superseded message and the one that
 * replaced it. The projection records the branch; the HOST's policy decides
 * what happens to it (branch, the default: keep it, shown on demand; truncate:
 * the server retracts its messages).
 */
interface BranchEntry {
    supersededId: string;
    byId: string;
    rowIds: string[];
}
/**
 * The whole projected thread as plain JSON. This IS the snapshot format: a
 * `thread.reset` carries one, and the PHP twin produces the same shape.
 */
interface ThreadState {
    lastSeq: number;
    /** Events refused by the machines or the human-only rule. Diagnostics, never state. */
    illegal: number;
    order: {
        kind: RowKind;
        id: string;
    }[];
    messages: MessageEntry[];
    turns: TurnEntry[];
    thinking: ThinkingEntry[];
    tools: ToolEntry[];
    plans: PlanEntry[];
    approvals: ApprovalRecord[];
    questions: QuestionRecord[];
    undos: UndoEntry[];
    branches: BranchEntry[];
}
type Row = ({
    kind: "message";
} & MessageEntry) | ({
    kind: "thinking";
    id: string;
} & ThinkingEntry) | ({
    kind: "tool";
    id: string;
} & ToolEntry) | ({
    kind: "plan";
    id: string;
} & PlanEntry) | {
    kind: "approval";
    id: string;
    approvalId: string;
    state: ApprovalRecord["state"];
} | {
    kind: "question";
    id: string;
    questionId: string;
    state: NonNullable<QuestionRecord["state"]>;
} | ({
    kind: "undo";
    id: string;
} & UndoEntry);
declare function emptyThreadState(): ThreadState;
/**
 * Applies one event to the state, in place. Idempotent: an event at or below
 * `lastSeq` changes nothing. Returns whether the event was applied (legal or
 * not). An illegal event bumps `illegal` and leaves every entry untouched.
 *
 * Total: it never throws. A malformed event the checks below do not anticipate
 * is counted illegal and the cursor moves past it, exactly as for an illegal
 * transition. A throw would escape into the client's transport, which reads it
 * as a failed request and retries the same batch forever.
 */
declare function applyEvent(state: ThreadState, event: ChatEvent): boolean;
/**
 * Under the truncate policy, the turns a removed branch must cancel: every
 * UNSETTLED turn the branch references, through a message in it (the
 * superseded message included) or an approval placed in it. In `state.turns`
 * order. Settled turns and turns outside the branch are never touched.
 */
declare function turnsToCancelForBranch(state: ThreadState, supersededId: string): string[];
/** The rows a thread renders, in order of first appearance. */
declare function rowsOf(state: ThreadState): Row[];
interface ThreadProjection {
    lastSeq: number;
    illegal: number;
    rows: Row[];
    turns: TurnEntry[];
    approvals: ApprovalRecord[];
    questions: QuestionRecord[];
    state: ThreadState;
}
/** Pure: folds events, in the order given, into the projected thread. */
declare function projectThread(events: readonly ChatEvent[], initial?: ThreadState): ThreadProjection;

export { AGENT_STATUSES, type Actor, type ActorKind, type AgentSnapshot, type AgentStatus, type AgentStatusName, type AnswerDraft, type ApprovalOption, type ApprovalRecord, type ApprovalState, type BranchEntry, CHART_TYPES, CONTRACT_VERSION, CORE_EVENT_TYPES, CORE_PART_KINDS, type ChatEvent, type CoreEventType, DEFAULT_PART_LIMITS, DEFAULT_RECOVERY, DEFAULT_STATUS_CONFIG, DEFAULT_TYPED_APPROVAL, type Decision, type DeliveryState, ENGLISH_TYPED_APPROVAL_PHRASES, type Gap, type HitlItem, type IngestResult, type MessageEntry, type OptionKind, type OptionTone, PLAN_STEP_STATUSES, type Part, type PartContext, type PartDefinition, type PartLimits, type PartOrigin, type PartRegistry, type PlanEntry, type PlanStep, type PlanStepLike, type PlanStepStatus, type QuestionField, type QuestionFieldType, type QuestionRecord, type Result, type Row, type RowKind, type SeqLog, type SimpleTransition, type StatusConfig, type TextPart, type ThinkingEntry, type ThreadProjection, type ThreadState, type ToolEntry, type TurnEntry, type TurnOutcome, type TurnState, type TurnTransition, type TypedApprovalConfig, type UndoEntry, type UndoState, applyEvent, canDecide, canSubmitAnswer, checkPlanUpdate, createPartRegistry, createSeqLog, deriveAgentStatus, emptyThreadState, ingestEvents, isEventType, isPlainObject, isReservedToolName, isSettlingTurnAction, isTimestamp, jsonBytes, machines, matchTypedApproval, normalizePhrase, optionTone, partToText, pickActionable, projectThread, rowsOf, transitionApproval, transitionDelivery, transitionTurn, turnsToCancelForBranch, undoWindow, validateEvent, validatePart, validateParts };
