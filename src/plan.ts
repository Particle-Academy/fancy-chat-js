import type { ApprovalState, Result } from "./types";

export const PLAN_STEP_STATUSES = ["pending", "running", "held", "done", "failed", "skipped"] as const;
export type PlanStepStatus = (typeof PLAN_STEP_STATUSES)[number];

export interface PlanStepLike {
  id: string;
  title: string;
  status: PlanStepStatus | string;
  owner: "agent" | "human" | string;
  approvalId?: string;
}

const RELEASED_BY = new Set<string>(["approved", "edited", "applied"]);
const REFUSED_BY = new Set<string>(["rejected", "withdrawn", "expired", "apply-failed"]);

/**
 * A held step releases ONLY through the approval path: it may leave `held`
 * once its approval (the one it was held on) is approved, edited or applied,
 * and may only go to `skipped` or `failed` once that approval was refused. A
 * step cannot be released by dropping it, or by swapping its approval id.
 */
export function checkPlanUpdate(
  prev: readonly PlanStepLike[],
  next: readonly PlanStepLike[],
  approvals: readonly { approvalId: string; state: ApprovalState | string }[],
): Result {
  for (const step of next) {
    if (!(PLAN_STEP_STATUSES as readonly string[]).includes(step.status) || (step.owner !== "agent" && step.owner !== "human")) {
      return { ok: false, error: "plan.step" };
    }
  }
  for (const before of prev) {
    if (before.status !== "held") continue;
    const after = next.find((s) => s.id === before.id);
    if (!after) return { ok: false, error: "plan.held" };
    if (after.status === "held") continue;
    const approval = before.approvalId ? approvals.find((a) => a.approvalId === before.approvalId) : undefined;
    if (!approval) return { ok: false, error: "plan.held" };
    if (RELEASED_BY.has(approval.state)) continue;
    if (REFUSED_BY.has(approval.state) && (after.status === "skipped" || after.status === "failed")) continue;
    return { ok: false, error: "plan.held" };
  }
  return { ok: true };
}
