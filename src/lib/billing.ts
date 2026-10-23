// Turns a Systeme.io webhook payload into an account action. Pure, unit-tested.
// Systeme.io's exact payload fields must be confirmed against a real test webhook
// (developer.systeme.io/docs/webhooks); this reader accepts the common shapes.

export type Plan = "starter" | "pro" | "team";
export type BillingAction =
  | { kind: "activate"; email: string; plan: Plan; companyName: string }
  | { kind: "cancel"; email: string }
  | { kind: "ignore"; reason: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function dig(o: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, k) => (isObj(acc) ? acc[k] : undefined), o);
}

function firstString(o: unknown, paths: string[][]): string | undefined {
  for (const p of paths) {
    const v = dig(o, p);
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

export function planFromName(name: string | undefined): Plan | null {
  const n = (name ?? "").toLowerCase();
  if (n.includes("team")) return "team";
  if (n.includes("pro")) return "pro";
  if (n.includes("starter")) return "starter";
  return null;
}

export function readSystemeEvent(eventHeader: string | null, body: unknown): BillingAction {
  const type = (eventHeader ?? firstString(body, [["type"], ["event"], ["event_type"]]) ?? "").toUpperCase();
  const email = firstString(body, [
    ["data", "customer", "email"],
    ["data", "contact", "email"],
    ["customer", "email"],
    ["contact", "email"],
    ["email"],
  ])?.toLowerCase();
  if (!email) return { kind: "ignore", reason: "no email in payload" };

  if (type.includes("CANCEL")) return { kind: "cancel", email };
  if (!type.includes("SALE")) return { kind: "ignore", reason: `unhandled event ${type || "(none)"}` };

  const planName = firstString(body, [
    ["data", "offer_price_plan", "name"],
    ["data", "price_plan", "name"],
    ["data", "offerPricePlan", "name"],
    ["data", "product", "name"],
    ["price_plan", "name"],
    ["product", "name"],
  ]);
  const plan = planFromName(planName);
  if (!plan) return { kind: "ignore", reason: `not a subscription plan (${planName ?? "unknown"})` };

  const company =
    firstString(body, [["data", "customer", "company"], ["data", "contact", "fields", "company_name"], ["data", "contact", "company"]]) ??
    `${email.split("@")[1] ?? "New"} account`;
  return { kind: "activate", email, plan, companyName: company };
}
