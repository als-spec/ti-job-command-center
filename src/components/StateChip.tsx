import type { AllowanceState } from "@/lib/jobMath";

const LOOK: Record<AllowanceState, [string, string]> = {
  ok: ["On track", "bg-green-100 text-green-900"],
  warn: ["Near limit", "bg-amber-100 text-amber-900"],
  over: ["Over allowance", "bg-red-100 text-red-900"],
};

export function StateChip({ state }: { state: AllowanceState }) {
  const [label, cls] = LOOK[state];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

const CO: Record<string, string> = {
  draft: "bg-stone-100 text-stone-800",
  sent: "bg-amber-100 text-amber-900",
  signed: "bg-green-100 text-green-900",
  declined: "bg-red-100 text-red-900",
  void: "bg-stone-200 text-stone-600 line-through",
};

export function CoStatus({ status }: { status: string }) {
  const label = status === "sent" ? "Awaiting signature" : status[0].toUpperCase() + status.slice(1);
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${CO[status] ?? CO.draft}`}>{label}</span>;
}
