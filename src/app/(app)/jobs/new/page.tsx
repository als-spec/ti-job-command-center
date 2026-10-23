import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { num } from "@/lib/format";

async function createJob(formData: FormData) {
  "use server";
  const { supabase, company } = await requireCompany();
  const name = String(formData.get("name") ?? "").trim();
  const contract = num(formData.get("contract_value"));
  const allowance = num(formData.get("ti_allowance"));
  const budget = num(formData.get("budget_cost"));
  const sqft = num(formData.get("square_feet"));
  if (!name || !(contract >= 0) || !(allowance >= 0) || !(budget >= 0)) redirect("/jobs/new?error=1");

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      company_id: company.id,
      name,
      tenant_name: String(formData.get("tenant_name") ?? "").trim() || null,
      landlord_name: String(formData.get("landlord_name") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      space_type: String(formData.get("space_type") ?? "other"),
      square_feet: sqft > 0 ? Math.round(sqft) : null,
      contract_value: contract,
      ti_allowance: allowance,
      budget_cost: budget,
    })
    .select("id")
    .single();
  if (error || !data) redirect("/jobs/new?error=save");
  redirect(`/jobs/${data.id}`);
}

export default async function NewJob({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <form action={createJob} className="card mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-bold">New job</h1>
      {sp.error && <p className="text-sm text-red-700">Fill in the job name, contract value, TI allowance and budgeted cost (use 0 if unknown).</p>}
      <Field id="name" label="Job name" placeholder="Suite 210 dental build-out" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="tenant_name" label="Tenant" />
        <Field id="landlord_name" label="Landlord / property manager" />
      </div>
      <Field id="address" label="Address" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="space_type" className="text-sm font-semibold">Space type</label>
          <select id="space_type" name="space_type" className="input" defaultValue="office">
            <option value="office">Office</option>
            <option value="medical">Medical / dental</option>
            <option value="restaurant">Restaurant</option>
            <option value="retail">Retail</option>
            <option value="other">Other</option>
          </select>
        </div>
        <Field id="square_feet" label="Square feet" inputMode="numeric" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="contract_value" label="Contract value ($)" inputMode="decimal" required />
        <Field id="ti_allowance" label="TI allowance ($)" inputMode="decimal" required />
        <Field id="budget_cost" label="Budgeted cost ($)" inputMode="decimal" required />
      </div>
      <p className="text-xs text-stone-600">Budgeted cost is what you expect the base job to cost you. It sets the bid margin we watch for fade.</p>
      <button className="btn-primary self-start">Create job</button>
    </form>
  );
}

function Field(props: { id: string; label: string; placeholder?: string; required?: boolean; inputMode?: "numeric" | "decimal" }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="text-sm font-semibold">{props.label}</label>
      <input id={props.id} name={props.id} className="input" placeholder={props.placeholder} required={props.required} inputMode={props.inputMode} />
    </div>
  );
}
