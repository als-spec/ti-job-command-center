import Link from "next/link";
import { requireCompany } from "@/lib/session";
import { allowanceSummary, type ChangeOrderNumbers } from "@/lib/jobMath";
import { money, pctText } from "@/lib/format";
import { StateChip } from "@/components/StateChip";

export default async function Jobs() {
  const { supabase, company } = await requireCompany();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, name, tenant_name, status, contract_value, ti_allowance, budget_cost, change_orders(status, bill_to, cost, price)")
    .eq("company_id", company.id)
    .neq("status", "closed")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">Active jobs</h1>
        <Link href="/jobs/new" className="btn-primary">New job</Link>
      </div>
      {!jobs?.length ? (
        <div className="card text-sm text-stone-600">
          No jobs yet. Add your current build-out with its contract value and TI allowance to start tracking change orders.
        </div>
      ) : (
        <ul className="grid gap-3">
          {jobs.map((j) => {
            const cos = (j.change_orders ?? []) as ChangeOrderNumbers[];
            const a = allowanceSummary(j, cos);
            const unsigned = cos.filter((c) => c.status === "sent").length;
            return (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`} className="card flex flex-wrap items-center justify-between gap-3 hover:border-stone-400">
                  <div className="min-w-0">
                    <p className="font-semibold">{j.name}</p>
                    <p className="text-sm text-stone-600">{j.tenant_name ?? "No tenant set"}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm tabular-nums">
                    {unsigned > 0 && <span className="text-amber-800">{unsigned} awaiting signature</span>}
                    <span>Allowance {pctText(a.pctUsed)} used · {money(a.remaining)} left</span>
                    <StateChip state={a.state} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
