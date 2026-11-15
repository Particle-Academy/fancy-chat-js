/** The contract major. A reader refuses any other and ignores unknown fields. */
export const CONTRACT_VERSION = 1 as const;

export type ActorKind = "agent" | "human" | "system";

export interface Actor {
  kind: ActorKind;
  id: string;
  label?: string;
}

/**
 * One event in a thread's append-only log. `seq` is per thread, monotonic and
 * gapless, assigned by the server; it is the only ordering.
 */
export interface ChatEvent<TData = Record<string, unknown>> {
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

export type TurnState = "pending" | "running" | "awaiting-human" | "cancelling" | "settled";
export type TurnOutcome = "completed" | "failed" | "refused" | "cancelled" | "interrupted";

/** `decided`: the server took the message as a typed decision; it was never delivered to the agent. */
export type DeliveryState = "sending" | "sent" | "queued" | "steered" | "delivered" | "decided" | "failed" | "dropped" | "unsent";

export type ApprovalState =
  | "pending"
  | "deciding"
  | "approved"
  | "rejected"
  | "edited"
  | "applied"
  | "apply-failed"
  | "withdrawn"
  | "expired";

export type OptionKind = "allow-once" | "allow-always" | "reject-once" | "reject-always" | "edit";
export type OptionTone = "positive" | "negative" | "neutral";
export type Decision = "approve" | "reject" | "edit";

/** A message part. Core kinds are a closed set; apps add `x-<app>.<name>`. */
export interface Part {
  id: string;
  kind: string;
  [field: string]: unknown;
}

export interface TextPart extends Part {
  kind: "text";
  format: "markdown" | "plain";
  text: string;
  interim?: boolean;
}

export interface ApprovalOption {
  id: string;
  kind: OptionKind;
  label: string;
}

export interface ApprovalRecord {
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

export type QuestionFieldType = "single" | "multi" | "text";

export interface QuestionField {
  id: string;
  type: QuestionFieldType;
  label?: string;
  options?: { id: string; label: string }[];
  required: boolean;
}

export interface QuestionRecord {
  questionId: string;
  prompt: string;
  fields: QuestionField[];
  allowNote: boolean;
  state?: "open" | "answered" | "dismissed";
  answeredBy?: Actor | null;
  values?: Record<string, unknown> | null;
  notes?: Record<string, string> | null;
}

export interface AnswerDraft {
  values: Record<string, unknown>;
  notes: Record<string, string>;
}

export type Result<T = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };
