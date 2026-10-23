import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { formatCoNumber } from "@/lib/jobMath";
import { snapshotHash, validSignerName, type SignedSnapshot } from "@/lib/signing";
import { money2 } from "@/lib/format";

// Public page: anyone with the unguessable link can view and sign this one change order.
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

async function load(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const { data } = await supabaseAdmin()
    .from("change_orders")
    .select("id, number, title, description, price, schedule_days, bill_to, status, signer_name, signed_at, jobs(name, address, tenant_name), companies(name, co_prefix)")
    .eq("sign_token", token)
    .maybeSingle();
  return data as unknown as {
    id: string; number: number; title: string; description: string | null; price: number; schedule_days: number;
    bill_to: string; status: string; signer_name: string | null; signed_at: string | null;
    jobs: { name: string; address: string | null; tenant_name: string | null };
    companies: { name: string; co_prefix: string };
  } | null;
}

async function respond(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const decision = formData.get("decision") === "decline" ? "decline" : "sign";
  const co = await load(token);
  if (!co || co.status !== "sent") redirect(`/sign/${token}`);

  if (decision === "decline") {
    await supabaseAdmin().from("change_orders").update({ status: "declined" }).eq("id", co.id).eq("status", "sent");
    redirect(`/sign/${token}`);
  }

  const name = formData.get("name");
  const emailRaw = String(formData.get("email") ?? "").trim();
  const agreed = formData.get("agree") === "yes";
  if (!validSignerName(name) || !agreed) redirect(`/sign/${token}?error=1`);

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const snapshot: SignedSnapshot = {
    company: { name: co.companies.name },
    job: { name: co.jobs.name, address: co.jobs.address, tenant_name: co.jobs.tenant_name },
    co: {
      number: formatCoNumber(co.companies.co_prefix, co.number),
      title: co.title,
      description: co.description,
      price: Number(co.price),
      schedule_days: co.schedule_days,
      bill_to: co.bill_to,
    },
    signer: { name: (name as string).trim(), email: emailRaw || null },
    signed_at: new Date().toISOString(),
    ip,
  };

  // Only flips sent -> signed once; a second submit does nothing.
  await supabaseAdmin()
    .from("change_orders")
    .update({
      status: "signed",
      signer_name: snapshot.signer.name,
      signer_email: snapshot.signer.email,
      signed_at: snapshot.signed_at,
      signer_ip: ip,
      signer_user_agent: h.get("user-agent")?.slice(0, 300) ?? null,
      signed_snapshot: snapshot,
      snapshot_sha256: snapshotHash(snapshot),
    })
    .eq("id", co.id)
    .eq("status", "sent");
  redirect(`/sign/${token}`);
}

export default async function SignPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const co = await load(token);
  if (!co || co.status === "void" || co.status === "draft") notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-4 py-8">
      <div>
        <p className="text-sm text-stone-600">{co.companies.name} · {co.jobs.name}</p>
        <h1 className="text-2xl font-bold">Change order {formatCoNumber(co.companies.co_prefix, co.number)}</h1>
      </div>

      <section className="card flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{co.title}</h2>
        {co.description && <p className="whitespace-pre-wrap text-sm">{co.description}</p>}
        <dl className="grid grid-cols-2 gap-y-1 text-sm tabular-nums">
          <dt>Price</dt><dd className="text-right text-lg font-bold">{money2(Number(co.price))}</dd>
          <dt>Schedule impact</dt><dd className="text-right">{co.schedule_days} day{co.schedule_days === 1 ? "" : "s"}</dd>
          <dt>Paid from</dt><dd className="text-right">{co.bill_to === "tenant" ? "Tenant, outside the TI allowance" : "TI allowance"}</dd>
          {co.jobs.address && (<><dt>Location</dt><dd className="text-right">{co.jobs.address}</dd></>)}
        </dl>
      </section>

      {co.status === "signed" && (
        <p className="rounded border border-green-300 bg-green-50 p-3 text-sm">
          Signed by {co.signer_name} on {new Date(co.signed_at!).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}. You can close this page.
        </p>
      )}
      {co.status === "declined" && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm">This change order was declined. The contractor will follow up.</p>
      )}

      {co.status === "sent" && (
        <form action={respond} className="card flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          {sp.error && <p className="text-sm text-red-700">Type your full name and check the box to sign.</p>}
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-semibold">Full name</label>
            <input id="name" name="name" className="input" autoComplete="name" required minLength={2} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-semibold">Email (for your copy)</label>
            <input id="email" name="email" type="email" className="input" autoComplete="email" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="agree" value="yes" required className="mt-1" />
            <span>I approve this change to the scope, price and schedule, and agree to sign electronically. Typing my name has the same effect as a handwritten signature.</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <button name="decision" value="sign" className="btn-primary">Sign and approve</button>
            <button name="decision" value="decline" formNoValidate className="btn-secondary">Decline</button>
          </div>
        </form>
      )}
    </main>
  );
}
