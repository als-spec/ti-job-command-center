import Link from "next/link";
import { requireCompany } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { company } = await requireCompany();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/jobs" className="font-bold">
            {company.name}
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/jobs">Jobs</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </div>
      </header>
      {company.status !== "active" && (
        <p className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          This account&apos;s subscription has ended. You can still view your jobs, but not add new ones.
        </p>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
