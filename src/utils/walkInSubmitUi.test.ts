import {
  WALK_IN_QR_MODAL_AUTO_CLOSE_MS,
  formatWalkInDepartmentTargetName,
  shouldNotifyDepartmentRelatedEmployees,
  walkInPendingApprovalFromResult,
  walkInQrModalFromApprovedStream,
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

  it("does not open a QR popup immediately when host approval is required", () => {
    expect(
      walkInQrModalFromResult(
        { success: true, id: "visit-1" },
        "สมชาย ใจดี",
        { waitForApproval: true },
      ),
    ).toBeNull();
  });

  it("keeps pending approval details so SSE approval can open QR later", () => {
    expect(
      walkInPendingApprovalFromResult(
        { success: true, id: "visit-1" },
        "สมชาย ใจดี",
        true,
      ),
    ).toEqual({
      id: "visit-1",
      visitorName: "สมชาย ใจดี",
    });
  });

  it("opens a QR popup for pending walk-in only after matching SSE approval", () => {
    const pending = { id: "visit-1", visitorName: "สมชาย ใจดี" };

    expect(
      walkInQrModalFromApprovedStream(
        { _id: "visit-1", entryApprovedAt: "2026-09-05T03:00:00.000Z" },
        pending,
      ),
    ).toEqual(pending);
    expect(
      walkInQrModalFromApprovedStream(
        { _id: "visit-2", entryApprovedAt: "2026-09-05T03:00:00.000Z" },
        pending,
      ),
    ).toBeNull();
    expect(walkInQrModalFromApprovedStream({ _id: "visit-1" }, pending)).toBeNull();
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
