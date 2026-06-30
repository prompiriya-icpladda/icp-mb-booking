import { visitorTypeNeedsIdCard, visitorTypeNeedsCompany, maskIdNumber, longTermStatus, isLongTermCheckoutable, longTermCardAction } from "./api";

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
    expect(visitorTypeNeedsCompany("customer")).toBe(true);
    expect(visitorTypeNeedsCompany("vendor")).toBe(true);
  });
});

describe("maskIdNumber - while typing (focused)", () => {
  it("shows the first two digits as typed", () => {
    expect(maskIdNumber("1", true)).toBe("1");
    expect(maskIdNumber("17", true)).toBe("17");
  });
  it("reveals only the latest digit and masks earlier middle digits", () => {
    expect(maskIdNumber("173", true)).toBe("173");
    expect(maskIdNumber("1734", true)).toBe("17x4");
    expect(maskIdNumber("17345", true)).toBe("17xx5");
    expect(maskIdNumber("173456", true)).toBe("17xxx6");
  });
  it("masks all middle digits when full and focused (only last digit shown)", () => {
    expect(maskIdNumber("1734567890139", true)).toBe("17xxxxxxxxxx9");
  });
});

describe("maskIdNumber - at rest (blurred)", () => {
  it("shows first two and last two digits", () => {
    expect(maskIdNumber("1734567890139", false)).toBe("17xxxxxxxxx39");
  });
  it("shows everything when four digits or fewer", () => {
    expect(maskIdNumber("1734", false)).toBe("1734");
  });
  it("masks the middle once longer than four", () => {
    expect(maskIdNumber("17345", false)).toBe("17x45");
  });
  it("returns empty string for empty input", () => {
    expect(maskIdNumber("", false)).toBe("");
    expect(maskIdNumber("", true)).toBe("");
  });
  it("shows everything for raw lengths 1 to 3 (nothing to mask)", () => {
    expect(maskIdNumber("1", false)).toBe("1");
    expect(maskIdNumber("17", false)).toBe("17");
    expect(maskIdNumber("173", false)).toBe("173");
  });
});

describe("longTermStatus", () => {
  it("returns 'registered' when never checked in", () => {
    expect(longTermStatus({ checkedInAt: null, completedAt: null })).toBe("registered");
  });
  it("returns 'arrived' when checked in but not completed", () => {
    expect(longTermStatus({ checkedInAt: "2026-06-30T01:00:00Z", completedAt: null })).toBe("arrived");
  });
  it("returns 'checked-out' when completed (even if checkedInAt is set)", () => {
    expect(
      longTermStatus({ checkedInAt: "2026-06-30T01:00:00Z", completedAt: "2026-06-30T05:00:00Z" }),
    ).toBe("checked-out");
  });
  it("treats a missing completedAt as not checked out", () => {
    expect(longTermStatus({ checkedInAt: "2026-06-30T01:00:00Z" })).toBe("arrived");
  });
});

describe("isLongTermCheckoutable", () => {
  it("allows a merchant who has arrived", () => {
    expect(
      isLongTermCheckoutable({ visitorType: "merchant", checkedInAt: "2026-06-30T01:00:00Z", completedAt: null }),
    ).toBe(true);
  });
  it("allows a rider who has arrived", () => {
    expect(
      isLongTermCheckoutable({ visitorType: "rider", checkedInAt: "2026-06-30T01:00:00Z", completedAt: null }),
    ).toBe(true);
  });
  it("rejects a merchant who only registered (not arrived)", () => {
    expect(
      isLongTermCheckoutable({ visitorType: "merchant", checkedInAt: null, completedAt: null }),
    ).toBe(false);
  });
  it("rejects a merchant already checked out", () => {
    expect(
      isLongTermCheckoutable({ visitorType: "merchant", checkedInAt: "2026-06-30T01:00:00Z", completedAt: "2026-06-30T05:00:00Z" }),
    ).toBe(false);
  });
  it("rejects a host-type visitor even when arrived", () => {
    expect(
      isLongTermCheckoutable({ visitorType: "visitor", checkedInAt: "2026-06-30T01:00:00Z", completedAt: null }),
    ).toBe(false);
  });
  it("rejects when visitorType is missing", () => {
    expect(
      isLongTermCheckoutable({ checkedInAt: "2026-06-30T01:00:00Z", completedAt: null }),
    ).toBe(false);
  });
});

describe("longTermCardAction", () => {
  const arrivedRider = { visitorType: "rider" as const, checkedInAt: "2026-06-30T01:00:00Z", completedAt: null };
  const arrivedMerchant = { visitorType: "merchant" as const, checkedInAt: "2026-06-30T01:00:00Z", completedAt: null };

  it("returns 'select' in select mode regardless of type/status", () => {
    expect(longTermCardAction(arrivedRider, true)).toBe("select");
    expect(longTermCardAction({ visitorType: "visitor", checkedInAt: null, completedAt: null }, true)).toBe("select");
  });

  it("returns 'detail' for an arrived rider/merchant when not in select mode", () => {
    expect(longTermCardAction(arrivedRider, false)).toBe("detail");
    expect(longTermCardAction(arrivedMerchant, false)).toBe("detail");
  });

  it("returns 'scan' for a rider/merchant that only registered (not arrived)", () => {
    expect(longTermCardAction({ visitorType: "merchant", checkedInAt: null, completedAt: null }, false)).toBe("scan");
  });

  it("returns 'scan' for a rider/merchant already checked out", () => {
    expect(longTermCardAction({ visitorType: "rider", checkedInAt: "2026-06-30T01:00:00Z", completedAt: "2026-06-30T05:00:00Z" }, false)).toBe("scan");
  });

  it("returns 'scan' for a host-type visitor even when arrived", () => {
    expect(longTermCardAction({ visitorType: "visitor", checkedInAt: "2026-06-30T01:00:00Z", completedAt: null }, false)).toBe("scan");
  });
});
