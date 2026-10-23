import { notFound, redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { priceFromCost } from "@/lib/jobMath";
import { num } from "@/lib/format";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

async function createChangeOrder(formData: FormData) {
  "use server";
  const { supabase, company, user } = await requireCompany();
  const jobId = String(formData.get("job_id"));
  const title = String(formData.get("title") ?? "").trim();
  const cost = num(formData.get("cost"));
  const markup = num(formData.get("markup_pct"));
  const days = num(formData.get("schedule_days"));
  if (!title || !(cost >= 0) || !(markup >= 0)) redirect(`/jobs/${jobId}/change-orders/new?error=1`);

  // Retry once if two people grab the same number at the same moment.
  let created: { id: string } | null = null;
  for (let attempt = 0; attempt < 2 && !created; attempt++) {
    const { data: next } = await supabase.rpc("next_co_number", { p_job: jobId });
    const { data, error } = await supabase
      .from("change_orders")
      .insert({
        company_id: company.id,
        job_id: jobId,
        number: next ?? 1,
        title,
        description: String(formData.get("description") ?? "").trim() || null,
        requested_by: String(formData.get("requested_by") ?? "").trim() || null,
        cost,
        markup_pct: markup,
        price: priceFromCost(cost, markup),
        schedule_days: Number.isFinite(days) ? Math.round(days) : 0,
        bill_to: formData.get("bill_to") === "landlord_allowance" ? "landlord_allowance" : "tenant",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (!error) created = data;
    else if (error.code !== "23505") break; // only retry on a duplicate number
  }
  if (!created) redirect(`/jobs/${jobId}/change-orders/new?error=save`);

  const photos = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  for (const photo of photos.slice(0, 6)) {
    if (photo.size > MAX_PHOTO_BYTES || !photo.type.startsWith("image/")) continue;
    const ext = photo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${company.id}/${created.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("co-photos").upload(path, photo, { contentType: photo.type });
    if (!error) {
      await supabase.from("change_order_photos").insert({ company_id: company.id, change_order_id: created.id, storage_path: path });
    }
  }
  redirect(`/change-orders/${created.id}`);
}

export default async function NewChangeOrder({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, company } = await requireCompany();
  const { data: job } = await supabase.from("jobs").select("id, name, tenant_name").eq("id", id).maybeSingle();
  if (!job) notFound();

  return (
    <form action={createChangeOrder} className="card mx-auto flex max-w-xl flex-col gap-4">
      <input type="hidden" name="job_id" value={job.id} />
      <div>
        <p className="text-sm text-stone-600">{job.name}</p>
        <h1 className="text-xl font-bold">New change order</h1>
      </div>
      {sp.error && <p className="text-sm text-red-700">Add a title and a cost (0 is fine), then try again.</p>}

      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm font-semibold">What changed</label>
        <input id="title" name="title" className="input" placeholder="Add duplex outlet at reception desk" required />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="description" className="text-sm font-semibold">Details</label>
        <textarea id="description" name="description" rows={3} className="input" placeholder="Scope, materials, anything the signer should see" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="requested_by" className="text-sm font-semibold">Requested by</label>
          <input id="requested_by" name="requested_by" className="input" placeholder={job.tenant_name ?? "Tenant"} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="bill_to" className="text-sm font-semibold">Bill to</label>
          <select id="bill_to" name="bill_to" className="input" defaultValue="tenant">
            <option value="tenant">Tenant (outside the allowance)</option>
            <option value="landlord_allowance">TI allowance</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="cost" className="text-sm font-semibold">Your cost ($)</label>
          <input id="cost" name="cost" className="input" inputMode="decimal" required />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="markup_pct" className="text-sm font-semibold">Markup (%)</label>
          <input id="markup_pct" name="markup_pct" className="input" inputMode="decimal" defaultValue={company.default_markup_pct} required />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="schedule_days" className="text-sm font-semibold">Added days</label>
          <input id="schedule_days" name="schedule_days" className="input" inputMode="numeric" defaultValue={0} />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="photos" className="text-sm font-semibold">Photos (up to 6)</label>
        <input id="photos" name="photos" type="file" accept="image/*" capture="environment" multiple className="text-sm" />
      </div>
      <button className="btn-primary self-start">Save change order</button>
    </form>
  );
}
