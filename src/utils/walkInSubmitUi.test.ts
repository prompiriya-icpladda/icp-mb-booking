import {
  WALK_IN_QR_MODAL_AUTO_CLOSE_MS,
  formatWalkInDepartmentTargetName,
  shouldNotifyDepartmentRelatedEmployees,
  walkInQrModalFromResult,
  walkInDepartmentOptionsFromEmployees,
} from "./walkInSubmitUi";

describe("walk-in submit UI helpers", () => {
  it("opens a QR popup from a created walk-in id", () => {
    expect(walkInQrModalFromResult({ success: true, id: "visit-1" }, "สมชาย ใจดี")).toEqual({
      id: "visit-1",
      visitorName: "สมชาย ใจดี",
    });
  });

  it("auto-closes the QR popup after 30 seconds", () => {
    expect(WALK_IN_QR_MODAL_AUTO_CLOSE_MS).toBe(30_000);
  });

  it("does not open a QR popup without a created id", () => {
    expect(walkInQrModalFromResult({ success: true }, "สมชาย ใจดี")).toBeNull();
  });

  it("skips same-department notifications for Operation", () => {
    expect(
      shouldNotifyDepartmentRelatedEmployees({
        hostRequired: true,
        hostDepartment: "Operation",
        selected: true,
      }),
    ).toBe(false);
  });

  it("keeps same-department notifications for non-Operation departments", () => {
    expect(
      shouldNotifyDepartmentRelatedEmployees({
        hostRequired: true,
        hostDepartment: "IT",
        selected: true,
      }),
    ).toBe(true);
  });

  it("formats department target as department staff", () => {
    expect(formatWalkInDepartmentTargetName(" IT ")).toBe("เจ้าหน้าที่แผนก IT");
  });

  it("builds unique non-Operation department options from HR results", () => {
    expect(
      walkInDepartmentOptionsFromEmployees([
        { employeeCode: "1001", name: "A", department: "IT", empType: "รายเดือน" },
        { employeeCode: "1002", name: "B", department: "IT", empType: "รายเดือน" },
        { employeeCode: "2001", name: "C", department: "บัญชี", empType: "รายเดือน" },
        { employeeCode: "3001", name: "D", department: "Operation", empType: "รายเดือน" },
      ]),
    ).toEqual(["IT", "บัญชี"]);
  });
});
