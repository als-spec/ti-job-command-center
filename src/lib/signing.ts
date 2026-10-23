// Change order signing: tokens and tamper-evident snapshots. Server-only.
import { createHash, randomBytes } from "node:crypto";

export function newSignToken(): string {
  return randomBytes(24).toString("base64url"); // 32 chars, ~192 bits
}

export interface SnapshotInput {
  company: { name: string };
  job: { name: string; address: string | null; tenant_name: string | null };
  co: {
    number: string;
    title: string;
    description: string | null;
    price: number;
    schedule_days: number;
    bill_to: string;
  };
}

export interface SignedSnapshot extends SnapshotInput {
  signer: { name: string; email: string | null };
  signed_at: string; // ISO timestamp
  ip: string | null;
}

// Stable JSON (sorted keys) so the same terms always produce the same hash.
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function snapshotHash(snapshot: SignedSnapshot): string {
  return createHash("sha256").update(stableStringify(snapshot)).digest("hex");
}

export function validSignerName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length >= 2 && name.trim().length <= 120;
}
