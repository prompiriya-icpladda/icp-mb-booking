import { scanResultDateText } from "./visitorAppointmentDisplay";

describe("scanResultDateText", () => {
  it("uses the check-in date and time for a long-term check-in result", () => {
    expect(
      scanResultDateText({
        success: true,
        qrMode: "long-term",
        checkedInAt: "2026-09-01T02:30:00.000Z",
        appointmentDate: "",
        appointmentTime: "",
      }),
    ).toBe("01/09/2026 09:30");
  });

  it("keeps the appointment date and time for normal check-in results", () => {
    expect(
      scanResultDateText({
        success: true,
        qrMode: "single-use",
        appointmentDate: "2026-09-01",
        appointmentTime: "09:30",
      }),
    ).toBe("2026-09-01 09:30");
  });
});
