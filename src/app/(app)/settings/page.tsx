import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { num } from "@/lib/format";

async function saveCompany(formData: FormData) {
  "use server";
  const { supabase, company, role } = await requireCompany();
  if (role === "member") redirect("/settings?error=role");
  const name = String(formData.get("name") ?? "").trim();
  const prefix = String(formData.get("co_prefix") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const markup = num(formData.get("default_markup_pct"));
  if (!name || !prefix || !(markup >= 0 && markup <= 100)) redirect("/settings?error=values");
  await supabase.from("companies").update({ name, co_prefix: prefix, default_markup_pct: markup }).eq("id", company.id);
  redirect("/settings?saved=1");
}

async function invite(formData: FormData) {
  "use server";
  const { supabase, company, role } = await requireCompany();
  if (role === "member") redirect("/settings?error=role");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/settings?error=email");
  await supabase.from("invites").upsert({ company_id: company.id, email, role: "member" }, { onConflict: "company_id,email" });
  redirect("/settings?invited=1");
}

const ERR: Record<string, string> = {
  role: "Only the account owner or an admin can change settings.",
  values: "Fill in a company name, a short prefix, and a markup between 0 and 100.",
  email: "Enter a valid email address.",
};

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { supabase, company } = await requireCompany();
  const { data: invites } = await supabase.from("invites").select("email, claimed_at").eq("company_id", company.id).order("created_at");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      {sp.error && <p className="text-sm text-red-700">{ERR[sp.error]}</p>}
      {sp.saved && <p className="text-sm text-green-800">Settings saved.</p>}
      {sp.invited && <p className="text-sm text-green-800">Invite saved. They can sign in with that email now.</p>}

      <form action={saveCompany} className="card flex flex-col gap-3">
        <h1 className="text-xl font-bold">Company settings</h1>
        <label htmlFor="name" className="text-sm font-semibold">Company name</label>
        <input id="name" name="name" defaultValue={company.name} className="input" required />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="co_prefix" className="text-sm font-semibold">Change order prefix</label>
            <input id="co_prefix" name="co_prefix" defaultValue={company.co_prefix} className="input" required />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="default_markup_pct" className="text-sm font-semibold">Default markup (%)</label>
            <input id="default_markup_pct" name="default_markup_pct" defaultValue={company.default_markup_pct} className="input" inputMode="decimal" required />
          </div>
        </div>
        <button className="btn-primary self-start">Save</button>
      </form>

      <form action={invite} className="card flex flex-col gap-3">
        <h2 className="font-semibold">Invite a teammate</h2>
        <p className="text-sm text-stone-600">Supers, PMs and office staff sign in with their own email.</p>
        <div className="flex gap-2">
          <label htmlFor="email" className="sr-only">Email</label>
          <input id="email" name="email" type="email" className="input min-w-0 flex-1" placeholder="super@yourcompany.com" required />
          <button className="btn-secondary">Invite</button>
        </div>
        {!!invites?.length && (
          <ul className="text-sm">
            {invites.map((i) => (
              <li key={i.email} className="flex justify-between border-t border-stone-200 py-1.5">
                <span>{i.email}</span>
                <span className="text-stone-600">{i.claimed_at ? "Joined" : "Invited"}</span>
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
