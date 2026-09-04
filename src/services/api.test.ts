import { visitorTypeNeedsCompany, longTermStatus, normalStatus, normalStatusLabel, longTermStatusLabel, isLongTermCheckoutable, isLongTermOnSite, longTermCardAction, shouldRouteToCheckout, scannerPostCheckinAction, checkinResultPresentation, scanResultPrimaryAction, appointmentTimeMinutes, sortAppointmentsByLatest, VISITOR_TYPE_OPTIONS, registerMobilePushToken, createWalkInVisit, searchHrEmployees, fetchRecentCompanyNames, canShowWalkInQrForPhoto, visitorAppointmentQrImageUrl } from "./api";

describe("VISITOR_TYPE_OPTIONS", () => {
  it("does not offer rider for new walk-in registrations", () => {
    expect(VISITOR_TYPE_OPTIONS.map((option) => option.value)).not.toContain("rider");
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

describe("searchHrEmployees", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns only monthly employees from HR emp_type", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => [
        { employeeCode: "M001", employeeName: "สมชาย รายเดือน", emp_type: "รายเดือน" },
        { employeeCode: "D001", employeeName: "สมหญิง รายวัน", emp_type: "รายวัน" },
        { employeeCode: "U001", employeeName: "สมปอง ไม่ระบุ" },
      ],
    }));
    (global as any).fetch = fetchMock;

    const employees = await searchHrEmployees("สม");

    expect(employees.map((employee) => employee.employeeCode)).toEqual(["M001"]);
    expect(employees[0]).toMatchObject({
      employeeCode: "M001",
      name: "สมชาย รายเดือน",
      empType: "รายเดือน",
    });
  });

  it("finds monthly employees when searching by department", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => [
        { employeeCode: "A001", employeeName: "สมชาย บัญชี", department: "บัญชี", emp_type: "รายเดือน" },
        { employeeCode: "I001", employeeName: "สมหญิง IT", department: "IT", emp_type: "รายเดือน" },
      ],
    }));
    (global as any).fetch = fetchMock;

    const employees = await searchHrEmployees("แผนกบัญชี");

    expect(employees.map((employee) => employee.employeeCode)).toEqual(["A001"]);
  });

  it("normalizes department aliases from the HR API", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => [
        { employeeCode: "P001", employeeName: "สมชาย จัดซื้อ", department_name: "จัดซื้อ", emp_type: "รายเดือน" },
      ],
    }));
    (global as any).fetch = fetchMock;

    const employees = await searchHrEmployees("จัดซื้อ");

    expect(employees[0]).toMatchObject({ employeeCode: "P001", department: "จัดซื้อ" });
  });
});

describe("fetchRecentCompanyNames", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("loads recent saved company names for dropdown suggestions", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ companies: ["บริษัท ข", "บริษัท ก"] }),
    }));
    (global as any).fetch = fetchMock;

    await expect(fetchRecentCompanyNames("ก+", 99)).resolves.toEqual(["บริษัท ข", "บริษัท ก"]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/walk-in-visitors/company-names?q=%E0%B8%81%2B&limit=50"),
    );
  });

  it("ignores non-string company names from the API", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ companies: ["บริษัท ข", null, 12, ""] }),
    }));
    (global as any).fetch = fetchMock;

    await expect(fetchRecentCompanyNames()).resolves.toEqual(["บริษัท ข"]);
  });
});

describe("longTermStatus", () => {
  it("returns 'registered' when never checked in", () => {
    expect(longTermStatus({ checkedInAt: null, completedAt: null })).toBe("registered");
  });
  it("returns 'arrived' when checked in but not completed", () => {
    expect(longTermStatus({ checkedInAt: "2026-06-30T01:00:00Z", completedAt: null })).toBe("arrived");
  });
  it("returns 'completion-requested' while waiting for AP scanner to scan out", () => {
    expect(
      longTermStatus({
        checkedInAt: "2026-06-30T01:00:00Z",
        completionRequestedAt: "2026-06-30T04:00:00Z",
        completedAt: null,
      }),
    ).toBe("completion-requested");
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

describe("normalStatus", () => {
  it("returns 'approval-requested' while waiting for host permission", () => {
    expect(
      normalStatus({
        checkedInAt: null,
        entryApprovalRequestedAt: "2026-09-01T02:00:00Z",
        entryApprovedAt: null,
        entryRejectedAt: null,
        completedAt: null,
      }),
    ).toBe("approval-requested");
  });

  it("returns 'rejected' when host does not allow entry", () => {
    expect(
      normalStatus({
        checkedInAt: null,
        entryRejectedAt: "2026-09-01T02:10:00Z",
        completedAt: null,
      }),
    ).toBe("rejected");
  });

  it("returns 'pending' when never checked in", () => {
    expect(normalStatus({ checkedInAt: null, completedAt: null })).toBe("pending");
  });
  it("returns 'checked-in' when checked in but the host has not finished", () => {
    expect(normalStatus({ checkedInAt: "2026-08-07T02:00:00Z", completedAt: null })).toBe("checked-in");
  });
  it("returns 'completed' once the host presses เสร็จสิ้น", () => {
    expect(
      normalStatus({ checkedInAt: "2026-08-07T02:00:00Z", completedAt: "2026-08-07T04:00:00Z" }),
    ).toBe("completed");
  });
  it("returns 'completion-requested' while waiting for AP scanner to scan out", () => {
    expect(
      normalStatus({
        checkedInAt: "2026-08-07T02:00:00Z",
        completionRequestedAt: "2026-08-07T03:00:00Z",
        completedAt: null,
      }),
    ).toBe("completion-requested");
  });
  it("returns 'completed' even when the check-in scan was missed", () => {
    expect(normalStatus({ checkedInAt: null, completedAt: "2026-08-07T04:00:00Z" })).toBe("completed");
  });
  it("treats a missing completedAt as not completed", () => {
    expect(normalStatus({ checkedInAt: "2026-08-07T02:00:00Z" })).toBe("checked-in");
  });
});

describe("isLongTermCheckoutable", () => {
  it("allows a merchant waiting for AP scanner completion", () => {
    expect(
      isLongTermCheckoutable({
        visitorType: "merchant",
        checkedInAt: "2026-06-30T01:00:00Z",
        completionRequestedAt: "2026-06-30T04:00:00Z",
        completedAt: null,
      }),
    ).toBe(true);
  });
  it("allows a rider waiting for AP scanner completion", () => {
    expect(
      isLongTermCheckoutable({
        visitorType: "rider",
        checkedInAt: "2026-06-30T01:00:00Z",
        completionRequestedAt: "2026-06-30T04:00:00Z",
        completedAt: null,
      }),
    ).toBe(true);
  });
  it("keeps the old rider/merchant arrived checkout behavior", () => {
    expect(
      isLongTermCheckoutable({ visitorType: "merchant", checkedInAt: "2026-06-30T01:00:00Z", completedAt: null }),
    ).toBe(true);
    expect(
      isLongTermCheckoutable({ visitorType: "rider", checkedInAt: "2026-06-30T01:00:00Z", completedAt: null }),
    ).toBe(true);
  });
  it("allows a long-term visitor waiting for AP scanner completion", () => {
    expect(
      isLongTermCheckoutable({
        visitorType: "visitor",
        checkedInAt: "2026-06-30T01:00:00Z",
        completionRequestedAt: "2026-06-30T04:00:00Z",
        completedAt: null,
      }),
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

describe("isLongTermOnSite", () => {
  it("shows an arrived visitor (checked in, not checked out)", () => {
    expect(isLongTermOnSite({ checkedInAt: "2026-06-30T01:00:00Z", completedAt: null })).toBe(true);
  });
  it("keeps a completion-requested visitor visible for scan-out", () => {
    expect(
      isLongTermOnSite({
        checkedInAt: "2026-06-30T01:00:00Z",
        completionRequestedAt: "2026-06-30T04:00:00Z",
        completedAt: null,
      }),
    ).toBe(true);
  });
  it("shows a registered visitor waiting to check in", () => {
    expect(isLongTermOnSite({ checkedInAt: null, completedAt: null })).toBe(true);
  });
  it("hides a checked-out visitor (already left)", () => {
    expect(
      isLongTermOnSite({ checkedInAt: "2026-06-30T01:00:00Z", completedAt: "2026-06-30T05:00:00Z" }),
    ).toBe(false);
  });
  it("treats a missing completedAt with a check-in as on-site", () => {
    expect(isLongTermOnSite({ checkedInAt: "2026-06-30T01:00:00Z" })).toBe(true);
  });
});

describe("longTermCardAction", () => {
  const arrivedRider = { visitorType: "rider" as const, checkedInAt: "2026-06-30T01:00:00Z", completedAt: null };
  const arrivedMerchant = { visitorType: "merchant" as const, checkedInAt: "2026-06-30T01:00:00Z", completedAt: null };
  const completionRequestedMerchant = {
    visitorType: "merchant" as const,
    checkedInAt: "2026-06-30T01:00:00Z",
    completionRequestedAt: "2026-06-30T04:00:00Z",
    completedAt: null,
  };

  it("returns 'select' in select mode regardless of type/status", () => {
    expect(longTermCardAction(arrivedRider, true)).toBe("select");
    expect(longTermCardAction({ visitorType: "visitor", checkedInAt: null, completedAt: null }, true)).toBe("select");
  });

  it("returns 'detail' for old rider/merchant arrived behavior", () => {
    expect(longTermCardAction(arrivedRider, false)).toBe("detail");
    expect(longTermCardAction(arrivedMerchant, false)).toBe("detail");
  });

  it("returns 'detail' when long-term QR waits for AP scanner completion", () => {
    expect(longTermCardAction(completionRequestedMerchant, false)).toBe("detail");
    expect(
      longTermCardAction(
        {
          visitorType: "visitor",
          checkedInAt: "2026-06-30T01:00:00Z",
          completionRequestedAt: "2026-06-30T04:00:00Z",
          completedAt: null,
        },
        false,
      ),
    ).toBe("detail");
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

describe("shouldRouteToCheckout", () => {
  it("returns true for a re-scanned rider/merchant that can still check out", () => {
    expect(
      shouldRouteToCheckout({ success: true, alreadyCheckedIn: true, canCheckout: true }),
    ).toBe(true);
  });
  it("returns false after AP scanner already completed the scan-out", () => {
    expect(
      shouldRouteToCheckout({
        success: true,
        alreadyCheckedIn: true,
        canCheckout: true,
        completedAt: "2026-08-30T04:00:00Z",
      }),
    ).toBe(false);
  });
  it("returns false on first check-in (not a re-scan)", () => {
    expect(
      shouldRouteToCheckout({ success: true, alreadyCheckedIn: false, canCheckout: true }),
    ).toBe(false);
  });
  it("returns false when the visitor cannot be checked out (e.g. host re-scan)", () => {
    expect(
      shouldRouteToCheckout({ success: true, alreadyCheckedIn: true, canCheckout: false }),
    ).toBe(false);
  });
  it("returns false when the check-in was not successful", () => {
    expect(
      shouldRouteToCheckout({ success: false, alreadyCheckedIn: true, canCheckout: true }),
    ).toBe(false);
  });
  it("returns false for an empty result", () => {
    expect(shouldRouteToCheckout({})).toBe(false);
  });
});

describe("visitor appointment status labels", () => {
  it("shows walk-in approval requests as waiting for approval, not completed", () => {
    expect(normalStatusLabel("approval-requested")).toBe("รออนุมัติ");
    expect(longTermStatusLabel("approval-requested")).toBe("รออนุมัติ");
  });

  it("keeps completed and rejected labels explicit", () => {
    expect(normalStatusLabel("completed")).toBe("เสร็จสิ้น");
    expect(normalStatusLabel("rejected")).toBe("ไม่อนุมัติ");
  });
});

describe("scannerPostCheckinAction", () => {
  it("auto-checks out a long-term QR that is already on site", () => {
    expect(
      scannerPostCheckinAction({
        success: true,
        qrMode: "long-term",
        alreadyCheckedIn: true,
        canCheckout: true,
        completedAt: null,
      }),
    ).toBe("checkout");
  });

  it("shows the normal result on the first long-term scan-in", () => {
    expect(
      scannerPostCheckinAction({
        success: true,
        qrMode: "long-term",
        alreadyCheckedIn: false,
        canCheckout: true,
        completedAt: null,
      }),
    ).toBe("result");
  });

  it("shows the normal result after a completion scan already checked out", () => {
    expect(
      scannerPostCheckinAction({
        success: true,
        qrMode: "long-term",
        alreadyCheckedIn: true,
        canCheckout: true,
        completedAt: "2026-08-30T04:00:00Z",
      }),
    ).toBe("result");
  });
});

describe("checkinResultPresentation", () => {
  it("shows waiting for permission after first QR scan", () => {
    expect(
      checkinResultPresentation({
        success: true,
        entryStatus: "approval-requested",
        entryApprovalRequestedAt: "2026-09-01T02:00:00Z",
      }),
    ).toEqual({ icon: "⏳", title: "รออนุมัติ", color: "#d97706" });
  });

  it("shows rejected entry with red state", () => {
    expect(
      checkinResultPresentation({
        success: true,
        entryStatus: "rejected",
        entryRejectReason: "เอกสารไม่ครบ",
      }),
    ).toEqual({ icon: "⛔", title: "ไม่อนุญาตให้เข้า", color: "#dc2626" });
  });

  it("shows a successful completion when AP scanner scans after host requested completion", () => {
    expect(
      checkinResultPresentation({
        success: true,
        alreadyCheckedIn: true,
        completedAt: "2026-08-07T04:00:00Z",
      }),
    ).toEqual({ icon: "✅", title: "เสร็จสิ้นสำเร็จ", color: "#16a34a" });
  });

  it("shows completion even when entry approval timestamp remains on the record", () => {
    expect(
      checkinResultPresentation({
        success: true,
        alreadyCheckedIn: true,
        entryStatus: "approved",
        entryApprovalRequestedAt: "2026-09-01T02:00:00Z",
        entryApprovedAt: "2026-09-01T02:05:00Z",
        completedAt: "2026-09-01T03:00:00Z",
      }),
    ).toEqual({ icon: "✅", title: "เสร็จสิ้นสำเร็จ", color: "#16a34a" });
  });
});

describe("canShowWalkInQrForPhoto", () => {
  it("allows QR photo only after walk-in entry is approved", () => {
    expect(
      canShowWalkInQrForPhoto({
        source: "walk-in",
        qrMode: "single-use",
        checkedInAt: "2026-09-01T02:10:00Z",
        entryApprovedAt: "2026-09-01T02:10:00Z",
        completedAt: null,
      }),
    ).toBe(true);
  });

  it("does not allow QR photo while still waiting for approval", () => {
    expect(
      canShowWalkInQrForPhoto({
        source: "walk-in",
        qrMode: "single-use",
        checkedInAt: null,
        entryApprovalRequestedAt: "2026-09-01T02:00:00Z",
        completedAt: null,
      }),
    ).toBe(false);
  });
});

describe("visitorAppointmentQrImageUrl", () => {
  it("points to the visitor QR PNG endpoint", () => {
    expect(visitorAppointmentQrImageUrl("visitor1")).toBe(
      "https://app-plant.icpladda.com/ICPBooking/api/visitor-appointments/visitor1/qr",
    );
  });
});

describe("scanResultPrimaryAction", () => {
  it("uses เรียบร้อย and returns to notification after a completion scan", () => {
    expect(
      scanResultPrimaryAction({
        success: true,
        alreadyCheckedIn: true,
        completedAt: "2026-08-07T04:00:00Z",
      }, false),
    ).toEqual({ label: "เรียบร้อย", action: "done" });
  });

  it("uses เรียบร้อย and returns to notification after a long-term QR check-in", () => {
    expect(
      scanResultPrimaryAction({ success: true, qrMode: "long-term", checkedInAt: "2026-08-31T02:00:00Z" }, false),
    ).toEqual({ label: "เรียบร้อย", action: "done" });
  });

  it("keeps scan again for a normal scan opened from the scanner tab", () => {
    expect(scanResultPrimaryAction({ success: true, alreadyCheckedIn: false }, false)).toEqual({
      label: "สแกนต่อ",
      action: "scan",
    });
  });

  it("keeps back-to-notifications for non-completion scans opened from notification tab", () => {
    expect(scanResultPrimaryAction({ success: true, alreadyCheckedIn: false }, true)).toEqual({
      label: "กลับไปหน้าแจ้งเตือน",
      action: "back",
    });
  });
});

describe("registerMobilePushToken", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("posts Expo token registration to the server", async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    (global as any).fetch = fetchMock;

    await registerMobilePushToken({
      token: "ExpoPushToken[abc123]",
      deviceId: "kiosk-1",
      platform: "android",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app-plant.icpladda.com/ICPBooking/api/mobile-push/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "ExpoPushToken[abc123]",
          deviceId: "kiosk-1",
          platform: "android",
        }),
      },
    );
  });
});

describe("createWalkInVisit", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("forces mobile walk-in registrations to single-use QR", async () => {
    const fetchMock = jest.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      text: async () => JSON.stringify({ _id: "visit-1" }),
    }));
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    (global as any).fetch = fetchMock;

    await createWalkInVisit({
      visitorName: "สมชาย ใจดี",
      hostEmployeeCode: "EMP001",
      hostName: "Host User",
      companyName: "บริษัท ก",
      hasVehicle: false,
      source: "mobile-walk-in",
      qrMode: "long-term",
      expiryDate: "2026-09-30",
    } as any);

    const requestInit = fetchMock.mock.calls[0]![1];
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody.qrMode).toBe("single-use");
    expect(requestBody.expiryDate).toBe("");
    expect(requestBody.includeDepartmentRelatedEmployees).toBe(true);
  });

  it("sends PDPA consent evidence with walk-in registrations", async () => {
    const fetchMock = jest.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      text: async () => JSON.stringify({ _id: "visit-1" }),
    }));
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    (global as any).fetch = fetchMock;

    const signature = {
      version: 1 as const,
      width: 320,
      height: 160,
      strokes: [[{ x: 10, y: 20 }]],
    };

    await createWalkInVisit({
      visitorName: "สมชาย ใจดี",
      hostEmployeeCode: "EMP001",
      hostName: "Host User",
      companyName: "บริษัท ก",
      hasVehicle: false,
      source: "mobile-walk-in",
      pdpaConsentAccepted: true,
      pdpaConsentedAt: "2026-08-28T02:00:00.000Z",
      pdpaConsentVersion: "visitor-walk-in-2026-08-28",
      pdpaSignature: signature,
    });

    const requestInit = fetchMock.mock.calls[0]![1];
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody).toEqual(
      expect.objectContaining({
        pdpaConsentAccepted: true,
        pdpaConsentedAt: "2026-08-28T02:00:00.000Z",
        pdpaConsentVersion: "visitor-walk-in-2026-08-28",
        pdpaSignature: signature,
      }),
    );
  });

  it("can disable department related employee notifications", async () => {
    const fetchMock = jest.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      text: async () => JSON.stringify({ _id: "visit-1" }),
    }));
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    (global as any).fetch = fetchMock;

    await createWalkInVisit({
      visitorName: "สมชาย ใจดี",
      hostEmployeeCode: "EMP001",
      hostName: "Host User",
      companyName: "บริษัท ก",
      hasVehicle: false,
      source: "mobile-walk-in",
      includeDepartmentRelatedEmployees: false,
    });

    const requestInit = fetchMock.mock.calls[0]![1];
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody.includeDepartmentRelatedEmployees).toBe(false);
  });

  it("sends department target details for walk-in department selection", async () => {
    const fetchMock = jest.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      text: async () => JSON.stringify({ _id: "visit-1" }),
    }));
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    (global as any).fetch = fetchMock;

    await createWalkInVisit({
      visitorName: "สมชาย ใจดี",
      targetDepartment: "IT",
      hostEmployeeCode: "",
      hostName: "เจ้าหน้าที่แผนก IT",
      visittingUserId: "",
      visittingUserName: "เจ้าหน้าที่แผนก IT",
      visitingUserId: "",
      visitingUserName: "เจ้าหน้าที่แผนก IT",
      companyName: "บริษัท ก",
      hasVehicle: false,
      source: "mobile-walk-in",
      includeDepartmentRelatedEmployees: true,
    });

    const requestInit = fetchMock.mock.calls[0]![1];
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody).toEqual(
      expect.objectContaining({
        targetDepartment: "IT",
        hostEmployeeCode: "",
        hostName: "เจ้าหน้าที่แผนก IT",
        visittingUserId: "",
        visittingUserName: "เจ้าหน้าที่แผนก IT",
        visitingUserId: "",
        visitingUserName: "เจ้าหน้าที่แผนก IT",
        includeDepartmentRelatedEmployees: true,
      }),
    );
  });

  it("does not send or log national ID numbers", async () => {
    const fetchMock = jest.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      text: async () => JSON.stringify({ _id: "visit-1" }),
    }));
    const logMock = jest.spyOn(console, "log").mockImplementation(() => undefined);
    (global as any).fetch = fetchMock;

    await createWalkInVisit({
      visitorName: "สมชาย ใจดี",
      hostEmployeeCode: "EMP001",
      hostName: "Host User",
      idCardNumber: "1234567890123",
      companyName: "บริษัท ก",
      hasVehicle: false,
      source: "mobile-walk-in",
    } as any);

    const requestInit = fetchMock.mock.calls[0]![1];
    const requestBody = JSON.parse(String(requestInit.body));
    expect(requestBody).not.toHaveProperty("idCardNumber");
    expect(logMock).toHaveBeenCalledWith(
      "createWalkInVisit payload",
      expect.not.objectContaining({ idCardNumberMasked: expect.any(String) }),
    );
  });
});

describe("appointmentTimeMinutes", () => {
  it("parses HH:mm into minutes since midnight", () => {
    expect(appointmentTimeMinutes("10:00")).toBe(600);
    expect(appointmentTimeMinutes("10:01")).toBe(601);
    expect(appointmentTimeMinutes("00:00")).toBe(0);
    expect(appointmentTimeMinutes("23:59")).toBe(1439);
  });
  it("accepts non-padded hours and a dot separator", () => {
    expect(appointmentTimeMinutes("9:30")).toBe(570);
    expect(appointmentTimeMinutes("9.30")).toBe(570);
    expect(appointmentTimeMinutes(" 10:05 ")).toBe(605);
  });
  it("returns -1 for missing or unparsable values", () => {
    expect(appointmentTimeMinutes(undefined)).toBe(-1);
    expect(appointmentTimeMinutes("")).toBe(-1);
    expect(appointmentTimeMinutes("บ่ายโมง")).toBe(-1);
    expect(appointmentTimeMinutes("25:00")).toBe(-1);
    expect(appointmentTimeMinutes("10:75")).toBe(-1);
  });
});

describe("sortAppointmentsByLatest", () => {
  const at = (_id: string, appointmentTime: string) => ({ _id, appointmentTime });

  it("puts the later appointment time first", () => {
    const sorted = sortAppointmentsByLatest([at("a", "10:00"), at("b", "10:01")]);
    expect(sorted.map((x) => x._id)).toEqual(["b", "a"]);
  });
  it("sorts by clock time, not by string order", () => {
    const sorted = sortAppointmentsByLatest([
      at("a", "9:30"),
      at("b", "10:00"),
      at("c", "13:45"),
    ]);
    expect(sorted.map((x) => x._id)).toEqual(["c", "b", "a"]);
  });
  it("breaks ties on _id so the newest record wins", () => {
    const sorted = sortAppointmentsByLatest([at("aaa1", "10:00"), at("aaa2", "10:00")]);
    expect(sorted.map((x) => x._id)).toEqual(["aaa2", "aaa1"]);
  });
  it("sinks entries without a usable time to the bottom", () => {
    const sorted = sortAppointmentsByLatest([at("a", ""), at("b", "08:00")]);
    expect(sorted.map((x) => x._id)).toEqual(["b", "a"]);
  });
  it("does not mutate the input array", () => {
    const input = [at("a", "10:00"), at("b", "10:01")];
    sortAppointmentsByLatest(input);
    expect(input.map((x) => x._id)).toEqual(["a", "b"]);
  });
});
