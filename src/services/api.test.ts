import { visitorTypeNeedsIdCard, visitorTypeNeedsCompany } from "./api";

describe("visitorTypeNeedsIdCard", () => {
  it("returns false for rider and merchant", () => {
    expect(visitorTypeNeedsIdCard("rider")).toBe(false);
    expect(visitorTypeNeedsIdCard("merchant")).toBe(false);
  });
  it("returns true for the other visitor types", () => {
    expect(visitorTypeNeedsIdCard("visitor")).toBe(true);
    expect(visitorTypeNeedsIdCard("customer")).toBe(true);
    expect(visitorTypeNeedsIdCard("vendor")).toBe(true);
    expect(visitorTypeNeedsIdCard("supplier")).toBe(true);
  });
});

describe("visitorTypeNeedsCompany", () => {
  it("returns false only for merchant", () => {
    expect(visitorTypeNeedsCompany("merchant")).toBe(false);
  });
  it("returns true for rider and the other visitor types", () => {
    expect(visitorTypeNeedsCompany("rider")).toBe(true);
    expect(visitorTypeNeedsCompany("visitor")).toBe(true);
    expect(visitorTypeNeedsCompany("supplier")).toBe(true);
  });
});
