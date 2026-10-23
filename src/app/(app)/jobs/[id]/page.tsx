import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/session";
import { allowanceSummary, formatCoNumber, marginSummary, type ChangeOrderNumbers, type CostEntry } from "@/lib/jobMath";
import { money, money2, num, pctText } from "@/lib/format";
import { CoStatus, StateChip } from "@/components/StateChip";

async function addCost(formData: FormData) {
  "use server";
  const { supabase, company } = await requireCompany();
  const jobId = String(formData.get("job_id"));
  const amount = num(formData.get("amount"));
  const description = String(formData.get("description") ?? "").trim();
  const kind = formData.get("kind") === "spent" ? "spent" : "committed";
  if (description && amount >= 0) {
    await supabase.from("cost_entries").insert({ company_id: company.id, job_id: jobId, description, kind, amount });
  }
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, company } = await requireCompany();
  const { data: job } = await supabase
    .from("jobs")
    .select("*, change_orders(id, number, title, status, bill_to, cost, price, created_at), cost_entries(id, description, kind, amount, created_at)")
    .eq("id", id)
    .maybeSingle();
  if (!job) notFound();

  const cos = (job.change_orders ?? []).sort((a: { number: number }, b: { number: number }) => b.number - a.number);
  const costs = job.cost_entries ?? [];
  const a = allowanceSummary(job, cos as ChangeOrderNumbers[]);
  const m = marginSummary(job, cos as ChangeOrderNumbers[], costs as CostEntry[]);
  const barPct = Math.min(100, (isFinite(a.pctUsed) ? a.pctUsed : 1) * 100);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{job.name}</h1>
          <p className="text-sm text-stone-600">
            {[job.tenant_name, job.address].filter(Boolean).join(" · ") || "No tenant or address set"}
          </p>
        </div>
        <Link href={`/jobs/${job.id}/change-orders/new`} className="btn-primary">New change order</Link>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">TI allowance</h2>
            <StateChip state={a.state} />
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-stone-200" aria-hidden>
            <div className={`h-full ${a.state === "over" ? "bg-red-600" : a.state === "warn" ? "bg-amber-500" : "bg-green-600"}`} style={{ width: `${barPct}%` }} />
          </div>
          <dl className="grid grid-cols-2 gap-y-1 text-sm tabular-nums">
            <dt>Allowance</dt><dd className="text-right">{money(a.allowance)}</dd>
            <dt>Used (base + signed)</dt><dd className="text-right">{money(a.used)} · {pctText(a.pctUsed)}</dd>
            <dt>Awaiting signature</dt><dd className="text-right">{money(a.pending)}</dd>
            <dt className="font-semibold">{a.remaining < 0 ? "Tenant owes over allowance" : "Remaining"}</dt>
            <dd className="text-right font-semibold">{money(Math.abs(a.remaining))}</dd>
          </dl>
        </div>

        <div className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Margin</h2>
            {m.fadePts > 0.5 ? (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-900">Down {m.fadePts.toFixed(1)} pts since bid</span>
            ) : (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-900">Holding</span>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-y-1 text-sm tabular-nums">
            <dt>Bid margin</dt><dd className="text-right">{pctText(m.bidMarginPct)}</dd>
            <dt>Projected margin</dt><dd className="text-right">{pctText(m.projectedMarginPct)}</dd>
            <dt>Revenue (contract + signed COs)</dt><dd className="text-right">{money(m.revenue)}</dd>
            <dt>Committed / spent</dt><dd className="text-right">{money(m.committed)} / {money(m.spent)}</dd>
            <dt>Work not yet signed</dt><dd className="text-right">{money(m.unsignedWork)}</dd>
          </dl>
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-semibold">Change orders</h2>
        {cos.length === 0 ? (
          <p className="text-sm text-stone-600">No change orders yet. Create one the moment a tenant asks for something new.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-stone-600">
                <tr><th className="py-1">#</th><th>Title</th><th>Bill to</th><th className="text-right">Price</th><th className="text-right">Status</th></tr>
              </thead>
              <tbody>
                {cos.map((c: { id: string; number: number; title: string; bill_to: string; price: number; status: string }) => (
                  <tr key={c.id} className="border-t border-stone-200">
                    <td className="py-2"><Link className="underline" href={`/change-orders/${c.id}`}>{formatCoNumber(company.co_prefix, c.number)}</Link></td>
                    <td>{c.title}</td>
                    <td>{c.bill_to === "tenant" ? "Tenant" : "Allowance"}</td>
                    <td className="text-right">{money2(c.price)}</td>
                    <td className="text-right"><CoStatus status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-semibold">Costs</h2>
        <form action={addCost} className="grid gap-2 sm:grid-cols-[1fr_9rem_8rem_auto]">
          <input type="hidden" name="job_id" value={job.id} />
          <label className="sr-only" htmlFor="description">Description</label>
          <input id="description" name="description" className="input" placeholder="Drywall sub PO, electrical rough-in invoice…" required />
          <label className="sr-only" htmlFor="amount">Amount</label>
          <input id="amount" name="amount" className="input" placeholder="Amount ($)" inputMode="decimal" required />
          <label className="sr-only" htmlFor="kind">Type</label>
          <select id="kind" name="kind" className="input" defaultValue="committed">
            <option value="committed">Committed</option>
            <option value="spent">Spent</option>
          </select>
          <button className="btn-secondary">Add</button>
        </form>
        {costs.length > 0 && (
          <ul className="text-sm tabular-nums">
            {costs.map((c: { id: string; description: string; kind: string; amount: number }) => (
              <li key={c.id} className="flex justify-between border-t border-stone-200 py-1.5">
                <span>{c.description} <span className="text-stone-500">({c.kind})</span></span>
                <span>{money2(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
