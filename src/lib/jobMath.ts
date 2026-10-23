// Pure job math: TI allowance tracking and margin fade. No I/O, fully unit-tested.

export type ChangeOrderStatus = "draft" | "sent" | "signed" | "declined" | "void";
export type BillTo = "tenant" | "landlord_allowance";

export interface JobNumbers {
  contract_value: number; // base build-out price
  ti_allowance: number; // landlord's allowance toward the build-out
  budget_cost: number; // estimated cost to build the base contract
}

export interface ChangeOrderNumbers {
  status: ChangeOrderStatus;
  bill_to: BillTo;
  cost: number;
  price: number;
}

export interface CostEntry {
  kind: "committed" | "spent";
  amount: number;
}

export type AllowanceState = "ok" | "warn" | "over";

export interface AllowanceSummary {
  allowance: number;
  used: number; // base contract + signed COs charged to the allowance
  pending: number; // sent-but-unsigned COs that would hit the allowance
  remaining: number; // allowance - used (negative = over)
  pctUsed: number; // 0..n (1 = 100%)
  tenantOverage: number; // amount the tenant owes above the allowance
  state: AllowanceState;
}

export interface MarginSummary {
  revenue: number; // contract + signed CO prices
  plannedCost: number; // budget + signed CO costs
  committed: number;
  spent: number;
  projectedCost: number; // the worse of plan vs. what's committed/spent
  bidMarginPct: number;
  projectedMarginPct: number;
  fadePts: number; // percentage points lost since the bid (positive = fade)
  unsignedWork: number; // price of COs sent but not signed yet
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (num: number, den: number) => (den > 0 ? num / den : 0);

export const WARN_AT = 0.9;

export function allowanceSummary(job: JobNumbers, cos: ChangeOrderNumbers[]): AllowanceSummary {
  const toAllowance = cos.filter((c) => c.bill_to === "landlord_allowance");
  const signed = sum(toAllowance.filter((c) => c.status === "signed").map((c) => c.price));
  const pending = sum(toAllowance.filter((c) => c.status === "sent").map((c) => c.price));
  const used = round2(job.contract_value + signed);
  const remaining = round2(job.ti_allowance - used);
  const pctUsed = job.ti_allowance > 0 ? used / job.ti_allowance : used > 0 ? Infinity : 0;
  const state: AllowanceState = remaining < 0 ? "over" : pctUsed >= WARN_AT ? "warn" : "ok";
  return {
    allowance: job.ti_allowance,
    used,
    pending: round2(pending),
    remaining,
    pctUsed,
    tenantOverage: round2(Math.max(0, -remaining)),
    state,
  };
}

export function marginSummary(job: JobNumbers, cos: ChangeOrderNumbers[], costs: CostEntry[]): MarginSummary {
  const signed = cos.filter((c) => c.status === "signed");
  const revenue = round2(job.contract_value + sum(signed.map((c) => c.price)));
  const plannedCost = round2(job.budget_cost + sum(signed.map((c) => c.cost)));
  const committed = round2(sum(costs.filter((c) => c.kind === "committed").map((c) => c.amount)));
  const spent = round2(sum(costs.filter((c) => c.kind === "spent").map((c) => c.amount)));
  const projectedCost = Math.max(plannedCost, committed, spent);
  const bidMarginPct = pct(job.contract_value - job.budget_cost, job.contract_value);
  const projectedMarginPct = pct(revenue - projectedCost, revenue);
  const unsignedWork = round2(sum(cos.filter((c) => c.status === "sent").map((c) => c.price)));
  return {
    revenue,
    plannedCost,
    committed,
    spent,
    projectedCost,
    bidMarginPct,
    projectedMarginPct,
    fadePts: round2((bidMarginPct - projectedMarginPct) * 100),
    unsignedWork,
  };
}

export function priceFromCost(cost: number, markupPct: number): number {
  if (!(cost >= 0) || !(markupPct >= 0)) throw new Error("Cost and markup must be zero or more");
  return round2(cost * (1 + markupPct / 100));
}

export function formatCoNumber(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}
