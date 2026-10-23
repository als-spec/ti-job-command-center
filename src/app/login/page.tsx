import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/login?error=email");
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `https://${h.get("host")}`;
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
  });
  redirect(error ? "/login?error=send" : "/login?sent=1");
}

const MESSAGES: Record<string, string> = {
  email: "Enter a valid email address.",
  send: "We couldn't send the link. Try again in a minute.",
  "no-company": "This email isn't on an account yet. Use the email you purchased with, or ask your owner to invite you.",
  link: "That sign-in link expired. Send a new one.",
};

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-700">TI Job Command Center</p>
        <h1 className="mt-2 text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-stone-600">We&apos;ll email you a one-time sign-in link. No password.</p>
      </div>
      {sp.sent ? (
        <p className="rounded border border-green-700/30 bg-green-50 p-3 text-sm text-green-900">
          Check your email for the sign-in link.
        </p>
      ) : (
        <form action={sendLink} className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-semibold">Work email</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          <button className="btn-primary">Email me a sign-in link</button>
        </form>
      )}
      {sp.error && <p className="text-sm text-red-700">{MESSAGES[sp.error] ?? "Something went wrong."}</p>}
    </main>
  );
}
