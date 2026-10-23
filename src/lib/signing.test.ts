import { describe, expect, it } from "vitest";
import { newSignToken, snapshotHash, stableStringify, validSignerName, type SignedSnapshot } from "./signing";

const snap: SignedSnapshot = {
  company: { name: "Acme Interiors" },
  job: { name: "Suite 210 dental", address: "100 Main St", tenant_name: "Bright Smiles" },
  co: { number: "CO-0003", title: "Add sink in op 4", description: null, price: 2450, schedule_days: 2, bill_to: "tenant" },
  signer: { name: "Dana Lee", email: null },
  signed_at: "2026-10-23T15:00:00.000Z",
  ip: "203.0.113.5",
};

describe("signing", () => {
  it("makes unique url-safe tokens", () => {
    const a = newSignToken();
    const b = newSignToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("hashes the same terms identically regardless of key order", () => {
    const reordered = { ...snap, co: { ...snap.co }, signer: { email: null, name: "Dana Lee" } } as SignedSnapshot;
    expect(snapshotHash(reordered)).toBe(snapshotHash(snap));
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });

  it("changes the hash when the price changes", () => {
    expect(snapshotHash({ ...snap, co: { ...snap.co, price: 2451 } })).not.toBe(snapshotHash(snap));
  });

  it("validates signer names", () => {
    expect(validSignerName("Dana Lee")).toBe(true);
    expect(validSignerName(" ")).toBe(false);
    expect(validSignerName(undefined)).toBe(false);
  });
});
