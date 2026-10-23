import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

export interface Company {
  id: string;
  name: string;
  plan: string;
  status: string;
  co_prefix: string;
  default_markup_pct: number;
}

/** Signed-in user plus their company. Redirects to /login or /no-access as needed. */
export async function requireCompany() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("role, companies(id, name, plan, status, co_prefix, default_markup_pct)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const company = membership?.companies as unknown as Company | null;
  if (!company) redirect("/login?error=no-company");
  return { supabase, user, company, role: membership!.role as "owner" | "admin" | "member" };
}
