import { BOTTOM_NAV_TABS, SCANNER_ACTION_PLACEMENT, shouldShowNavScannerButton } from "./mainNav";

describe("main nav", () => {
  it("ไม่แสดงสแกน QR เป็น tab หลัก", () => {
    expect(BOTTOM_NAV_TABS.map((tab) => tab.key)).toEqual(["notification", "walkIn"]);
    expect(BOTTOM_NAV_TABS).not.toContainEqual(expect.objectContaining({ key: "scanner" }));
    expect(SCANNER_ACTION_PLACEMENT).toBe("floating");
  });

  it("แสดงปุ่มกล้องเฉพาะใน tab แจ้งเตือน", () => {
    expect(shouldShowNavScannerButton("notification")).toBe(true);
    expect(shouldShowNavScannerButton("walkIn")).toBe(false);
    expect(shouldShowNavScannerButton("scanner")).toBe(false);
  });
});
