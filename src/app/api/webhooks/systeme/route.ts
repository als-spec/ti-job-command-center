import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { readSystemeEvent } from "@/lib/billing";

// Systeme.io -> app. Configure the webhook URL in Systeme.io as:
//   https://<your-app>/api/webhooks/systeme?key=<SYSTEME_WEBHOOK_KEY>
// Events: "New sale" and "Sale canceled".

function keyOk(given: string | null): boolean {
  const expected = process.env.SYSTEME_WEBHOOK_KEY;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!keyOk(request.nextUrl.searchParams.get("key"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const action = readSystemeEvent(request.headers.get("x-webhook-event"), body);
  const db = supabaseAdmin();

  if (action.kind === "ignore") return NextResponse.json({ ok: true, ignored: action.reason });

  if (action.kind === "cancel") {
    await db.from("companies").update({ status: "canceled" }).eq("billing_email", action.email);
    return NextResponse.json({ ok: true, canceled: action.email });
  }

  // activate: reuse the company for this buyer if it exists (renewals, upgrades), else create it
  const { data: existing } = await db.from("companies").select("id").eq("billing_email", action.email).maybeSingle();
  let companyId = existing?.id as string | undefined;
  if (companyId) {
    await db.from("companies").update({ plan: action.plan, status: "active" }).eq("id", companyId);
  } else {
    const { data, error } = await db
      .from("companies")
      .insert({ name: action.companyName, plan: action.plan, billing_email: action.email })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "could not create company" }, { status: 500 });
    companyId = data.id;
  }
  await db.from("invites").upsert({ company_id: companyId, email: action.email, role: "owner" }, { onConflict: "company_id,email", ignoreDuplicates: true });
  return NextResponse.json({ ok: true, company_id: companyId });
}
