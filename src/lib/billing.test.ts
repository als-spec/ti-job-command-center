import { describe, expect, it } from "vitest";
import { planFromName, readSystemeEvent } from "./billing";

describe("readSystemeEvent", () => {
  it("activates a Pro subscription from a new-sale payload", () => {
    const a = readSystemeEvent("NEW_SALE", {
      data: { customer: { email: "Owner@AcmeBuild.com", company: "Acme Build" }, offer_price_plan: { name: "TI Job Command Center Pro (monthly)" } },
    });
    expect(a).toEqual({ kind: "activate", email: "owner@acmebuild.com", plan: "pro", companyName: "Acme Build" });
  });

  it("reads the event type from the body when there's no header", () => {
    const a = readSystemeEvent(null, { type: "sale_canceled", data: { contact: { email: "a@b.co" } } });
    expect(a).toEqual({ kind: "cancel", email: "a@b.co" });
  });

  it("ignores sales of non-subscription products like the founding deposit", () => {
    const a = readSystemeEvent("NEW_SALE", { data: { customer: { email: "a@b.co" }, product: { name: "Founding Builder Deposit" } } });
    expect(a.kind).toBe("ignore");
  });

  it("ignores payloads without an email", () => {
    expect(readSystemeEvent("NEW_SALE", { data: {} }).kind).toBe("ignore");
  });

  it("falls back to a company name from the email domain", () => {
    const a = readSystemeEvent("NEW_SALE", { data: { customer: { email: "x@ridgeline.com" }, price_plan: { name: "Starter" } } });
    expect(a).toMatchObject({ kind: "activate", companyName: "ridgeline.com account", plan: "starter" });
  });
});

describe("planFromName", () => {
  it("matches tiers in any order of words", () => {
    expect(planFromName("Team - annual")).toBe("team");
    expect(planFromName("pro")).toBe("pro");
    expect(planFromName("Jumpstart Setup")).toBeNull();
  });
});
