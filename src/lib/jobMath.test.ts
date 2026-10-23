import { describe, expect, it } from "vitest";
import { allowanceSummary, formatCoNumber, marginSummary, priceFromCost, type ChangeOrderNumbers } from "./jobMath";

const job = { contract_value: 160_000, ti_allowance: 200_000, budget_cost: 136_000 };

const co = (p: Partial<ChangeOrderNumbers>): ChangeOrderNumbers => ({
  status: "signed",
  bill_to: "landlord_allowance",
  cost: 0,
  price: 0,
  ...p,
});

describe("allowanceSummary", () => {
  it("counts the base contract plus signed allowance COs", () => {
    const s = allowanceSummary(job, [co({ price: 5_000 }), co({ price: 2_000, bill_to: "tenant" })]);
    expect(s.used).toBe(165_000);
    expect(s.remaining).toBe(35_000);
    expect(s.state).toBe("ok");
  });

  it("warns at 90% used and keeps sent COs as pending", () => {
    const s = allowanceSummary(job, [co({ price: 20_000 }), co({ price: 9_000, status: "sent" })]);
    expect(s.used).toBe(180_000);
    expect(s.pctUsed).toBeCloseTo(0.9);
    expect(s.pending).toBe(9_000);
    expect(s.state).toBe("warn");
  });

  it("flags the overage the tenant owes", () => {
    const s = allowanceSummary(job, [co({ price: 46_500 })]);
    expect(s.remaining).toBe(-6_500);
    expect(s.tenantOverage).toBe(6_500);
    expect(s.state).toBe("over");
  });

  it("ignores draft, declined and void COs", () => {
    const s = allowanceSummary(job, [
      co({ price: 50_000, status: "draft" }),
      co({ price: 50_000, status: "declined" }),
      co({ price: 50_000, status: "void" }),
    ]);
    expect(s.used).toBe(160_000);
  });

  it("handles a job with no allowance", () => {
    const s = allowanceSummary({ ...job, ti_allowance: 0 }, []);
    expect(s.state).toBe("over");
    expect(s.tenantOverage).toBe(160_000);
  });
});

describe("marginSummary", () => {
  it("computes bid margin and no fade when on plan", () => {
    const m = marginSummary(job, [], []);
    expect(m.bidMarginPct).toBeCloseTo(0.15);
    expect(m.fadePts).toBe(0);
  });

  it("adds signed CO revenue and cost", () => {
    const m = marginSummary(job, [co({ cost: 8_000, price: 10_000 })], []);
    expect(m.revenue).toBe(170_000);
    expect(m.plannedCost).toBe(144_000);
  });

  it("shows fade when committed cost passes the plan", () => {
    const m = marginSummary(job, [], [
      { kind: "committed", amount: 148_000 },
      { kind: "spent", amount: 90_000 },
    ]);
    expect(m.projectedCost).toBe(148_000);
    expect(m.projectedMarginPct).toBeCloseTo(12_000 / 160_000);
    expect(m.fadePts).toBeCloseTo(7.5, 2);
  });

  it("totals work sent but not signed", () => {
    const m = marginSummary(job, [co({ status: "sent", price: 4_200 }), co({ status: "sent", price: 800 })], []);
    expect(m.unsignedWork).toBe(5_000);
  });
});

describe("pricing helpers", () => {
  it("applies markup and rounds to cents", () => {
    expect(priceFromCost(1_234.56, 15)).toBe(1_419.74);
    expect(priceFromCost(0, 20)).toBe(0);
  });
  it("rejects negative input", () => {
    expect(() => priceFromCost(-1, 10)).toThrow();
  });
  it("formats CO numbers", () => {
    expect(formatCoNumber("CO", 12)).toBe("CO-0012");
  });
});
