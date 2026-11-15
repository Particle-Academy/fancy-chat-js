import type { TurnState } from "./types";

/** The agent status vocabulary. One derivation, used by both servers and the client. */
export const AGENT_STATUSES = [
  "not-started",
  "starting",
  "working",
  "cooling",
  "idle",
  "sleeping",
  "parked",
  "paused-limit",
  "signed-out",
  "broken",
] as const;

export type AgentStatusName = (typeof AGENT_STATUSES)[number];

export interface AgentSnapshot {
  /** Milliseconds since the epoch. The derivation is pure: it never reads a clock. */
  now: number;
  signedIn?: boolean;
  broken?: string | null;
  limit?: { until: number } | null;
  everStarted?: boolean;
  turn?: { state: TurnState; since: number } | null;
  lastSettledAt?: number | null;
  background?: number;
  plan?: { n: number; m: number; doing: string | null } | null;
  pendingHitl?: number;
}

export interface StatusConfig {
  /** How long after a turn settles the agent reads as cooling. Default 15000. */
  coolingMs: number;
  /** Idle time after which the agent reads as sleeping. Default 600000. */
  sleepAfterMs: number;
  /** Recovery action ids per status; the host's map replaces the default for each status it names. */
  recovery?: Partial<Record<AgentStatusName, string[]>>;
}

export const DEFAULT_STATUS_CONFIG: StatusConfig = { coolingMs: 15000, sleepAfterMs: 600000 };

export const DEFAULT_RECOVERY: Record<AgentStatusName, string[]> = {
  "not-started": [],
  starting: ["stop"],
  working: ["stop"],
  cooling: [],
  idle: [],
  sleeping: [],
  parked: ["open-hitl"],
  "paused-limit": ["wait"],
  "signed-out": ["sign-in"],
  broken: ["restart"],
};

export interface AgentStatus {
  status: AgentStatusName;
  detail: Record<string, unknown> | null;
  since: number | null;
  recovery: string[];
}

export function deriveAgentStatus(snapshot: AgentSnapshot, config: Partial<StatusConfig> = {}): AgentStatus {
  const cfg = { ...DEFAULT_STATUS_CONFIG, ...config };
  const recovery = (status: AgentStatusName, fallback?: string[]) => [...(cfg.recovery?.[status] ?? fallback ?? DEFAULT_RECOVERY[status])];
  const out = (status: AgentStatusName, detail: Record<string, unknown> | null, since: number | null, rec?: string[]): AgentStatus => ({
    status,
    detail,
    since,
    recovery: recovery(status, rec),
  });

  const now = snapshot.now;
  const turn = snapshot.turn ?? null;
  const background = snapshot.background ?? 0;
  const pending = snapshot.pendingHitl ?? 0;
  const lastSettledAt = snapshot.lastSettledAt ?? null;

  if (typeof snapshot.broken === "string" && snapshot.broken !== "") return out("broken", { reason: snapshot.broken }, null);
  if (snapshot.signedIn === false) return out("signed-out", null, null);
  if (snapshot.limit && snapshot.limit.until > now) return out("paused-limit", { until: snapshot.limit.until }, null);
  if ((turn && turn.state === "awaiting-human") || pending > 0) {
    return out("parked", { pending }, turn && turn.state === "awaiting-human" ? turn.since : null);
  }
  if (turn && turn.state === "pending") return out("starting", null, turn.since);
  if (turn && (turn.state === "running" || turn.state === "cancelling")) {
    const cancelling = turn.state === "cancelling";
    return out("working", { background, plan: snapshot.plan ?? null, cancelling }, turn.since, cancelling ? [] : undefined);
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
