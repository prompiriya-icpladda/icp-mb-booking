import { visitorTypeNeedsIdCard, visitorTypeNeedsCompany, maskIdNumber } from "./api";

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
});
