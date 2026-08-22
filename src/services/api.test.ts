import { visitorTypeNeedsCompany, longTermStatus, normalStatus, isLongTermCheckoutable, isLongTermOnSite, longTermCardAction, shouldRouteToCheckout, checkinResultPresentation, presetExpiryDate, appointmentTimeMinutes, sortAppointmentsByLatest, EXPIRY_PRESET_OPTIONS, VISITOR_TYPE_OPTIONS, registerMobilePushToken, createWalkInVisit, searchHrEmployees } from "./api";

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

describe("normalStatus", () => {
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

describe("isLongTermOnSite", () => {
  it("shows an arrived visitor (checked in, not checked out)", () => {
    expect(isLongTermOnSite({ checkedInAt: "2026-06-30T01:00:00Z", completedAt: null })).toBe(true);
  });
  it("hides a registered visitor (not yet arrived)", () => {
    expect(isLongTermOnSite({ checkedInAt: null, completedAt: null })).toBe(false);
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

describe("shouldRouteToCheckout", () => {
  it("returns true for a re-scanned rider/merchant that can still check out", () => {
    expect(
      shouldRouteToCheckout({ success: true, alreadyCheckedIn: true, canCheckout: true }),
    ).toBe(true);
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

describe("checkinResultPresentation", () => {
  it("shows a successful completion when AP scanner scans after host requested completion", () => {
    expect(
      checkinResultPresentation({
        success: true,
        alreadyCheckedIn: true,
        completedAt: "2026-08-07T04:00:00Z",
      }),
    ).toEqual({ icon: "✅", title: "เสร็จสิ้นสำเร็จ", color: "#16a34a" });
  });
});

describe("presetExpiryDate", () => {
  const now = new Date("2026-06-30T00:00:00");
  const ymd = (d: Date | null) =>
    d ? [d.getFullYear(), d.getMonth(), d.getDate()] : null;

  it("adds 7 days for 1w", () => {
    expect(ymd(presetExpiryDate("1w", now))).toEqual([2026, 6, 7]); // 2026-07-07
  });
  it("adds 1/3/6 months for month presets", () => {
    expect(ymd(presetExpiryDate("1m", now))).toEqual([2026, 6, 30]);  // 2026-07-30
    expect(ymd(presetExpiryDate("3m", now))).toEqual([2026, 8, 30]);  // 2026-09-30
    expect(ymd(presetExpiryDate("6m", now))).toEqual([2026, 11, 30]); // 2026-12-30
  });
  it("adds 1 year for 1y", () => {
    expect(ymd(presetExpiryDate("1y", now))).toEqual([2027, 5, 30]); // 2027-06-30
  });
  it("returns null for custom", () => {
    expect(presetExpiryDate("custom", now)).toBeNull();
  });
  it("does not mutate the passed-in now", () => {
    const ref = new Date("2026-06-30T00:00:00");
    presetExpiryDate("1y", ref);
    expect(ymd(ref)).toEqual([2026, 5, 30]); // เดิมไม่เปลี่ยน
  });
});

describe("EXPIRY_PRESET_OPTIONS", () => {
  it("exposes the preset values and Thai labels exactly", () => {
    expect(EXPIRY_PRESET_OPTIONS).toEqual([
      { value: "1w", label: "1 อาทิตย์" },
      { value: "1m", label: "1 เดือน" },
      { value: "3m", label: "3 เดือน" },
      { value: "6m", label: "6 เดือน" },
      { value: "1y", label: "1 ปี" },
      { value: "custom", label: "กำหนดเอง" },
    ]);
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
