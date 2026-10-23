import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireCompany } from "@/lib/session";
import { formatCoNumber } from "@/lib/jobMath";
import { newSignToken } from "@/lib/signing";
import { money2 } from "@/lib/format";
import { CoStatus } from "@/components/StateChip";
import { CopyLink } from "@/components/CopyLink";

async function sendForSignature(formData: FormData) {
  "use server";
  const { supabase } = await requireCompany();
  const id = String(formData.get("id"));
  await supabase
    .from("change_orders")
    .update({ status: "sent", sign_token: newSignToken(), sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft");
  redirect(`/change-orders/${id}`);
}

async function voidChangeOrder(formData: FormData) {
  "use server";
  const { supabase } = await requireCompany();
  const id = String(formData.get("id"));
  await supabase.from("change_orders").update({ status: "void", sign_token: null }).eq("id", id).neq("status", "void");
  redirect(`/change-orders/${id}`);
}

export default async function ChangeOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, company } = await requireCompany();
  const { data: co } = await supabase
    .from("change_orders")
    .select("*, jobs(id, name, tenant_name), change_order_photos(storage_path)")
    .eq("id", id)
    .maybeSingle();
  if (!co) notFound();

  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${h.get("host")}`;
  const signUrl = co.sign_token ? `${origin}/sign/${co.sign_token}` : null;

  const photos: string[] = [];
  for (const p of co.change_order_photos ?? []) {
    const { data } = await supabase.storage.from("co-photos").createSignedUrl(p.storage_path, 3600);
    if (data?.signedUrl) photos.push(data.signedUrl);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href={`/jobs/${co.jobs.id}`} className="text-sm underline">← {co.jobs.name}</Link>
      <div className="card flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-stone-600">{formatCoNumber(company.co_prefix, co.number)}</p>
            <h1 className="text-xl font-bold">{co.title}</h1>
          </div>
          <CoStatus status={co.status} />
        </div>
        {co.description && <p className="whitespace-pre-wrap text-sm">{co.description}</p>}
        <dl className="grid grid-cols-2 gap-y-1 text-sm tabular-nums">
          <dt>Price to client</dt><dd className="text-right font-semibold">{money2(co.price)}</dd>
          <dt>Your cost + markup</dt><dd className="text-right">{money2(co.cost)} + {co.markup_pct}%</dd>
          <dt>Schedule impact</dt><dd className="text-right">{co.schedule_days} day{co.schedule_days === 1 ? "" : "s"}</dd>
          <dt>Bill to</dt><dd className="text-right">{co.bill_to === "tenant" ? "Tenant" : "TI allowance"}</dd>
          {co.requested_by && (<><dt>Requested by</dt><dd className="text-right">{co.requested_by}</dd></>)}
        </dl>
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="Change order photo" className="aspect-square w-full rounded object-cover" />
            ))}
          </div>
        )}

        {co.status === "draft" && (
          <form action={sendForSignature}>
            <input type="hidden" name="id" value={co.id} />
            <button className="btn-primary">Get signature</button>
            <p className="mt-2 text-xs text-stone-600">Creates a signing link. Hand your phone to the tenant, or text or email them the link.</p>
          </form>
        )}

        {co.status === "sent" && signUrl && (
          <div className="flex flex-col gap-2 rounded border border-amber-300 bg-amber-50 p-3">
            <p className="text-sm font-semibold">Waiting for signature</p>
            <CopyLink url={signUrl} />
            <a href={signUrl} className="text-sm underline">Open signing page on this device</a>
          </div>
        )}

        {co.status === "signed" && (
          <div className="rounded border border-green-300 bg-green-50 p-3 text-sm">
            <p className="font-semibold">Signed by {co.signer_name}{co.signer_email ? ` (${co.signer_email})` : ""}</p>
            <p>{new Date(co.signed_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · IP {co.signer_ip ?? "unknown"}</p>
            <p className="mt-1 break-all font-mono text-xs text-stone-600">Record fingerprint (SHA-256): {co.snapshot_sha256}</p>
          </div>
        )}

        {co.status === "declined" && <p className="text-sm text-red-800">The signer declined this change order.</p>}

        {co.status !== "void" && (
          <form action={voidChangeOrder}>
            <input type="hidden" name="id" value={co.id} />
            <button className="text-sm text-red-800 underline">Void this change order</button>
          </form>
        )}
      </div>
    </div>
  );
}
