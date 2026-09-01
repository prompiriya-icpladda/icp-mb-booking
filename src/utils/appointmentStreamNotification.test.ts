import {
  appointmentStreamNotificationCopy,
  type AppointmentStreamPayload,
} from "./appointmentStreamNotification";

const baseAppointment = {
  _id: "a1",
  visitorName: "สมชาย",
  visitorOrganization: "บริษัท A",
  appointmentDate: "2026-09-01",
  appointmentTime: "09:30",
  purpose: "ประชุม",
  hasVehicle: false,
  licensePlate: "",
  checkedInAt: null,
  completionRequestedAt: null,
  completedAt: null,
  visitorCount: 1,
  createdByName: "ผู้สร้าง",
};

function payload(overrides: Partial<AppointmentStreamPayload> = {}): AppointmentStreamPayload {
  return { ...baseAppointment, ...overrides };
}

describe("appointmentStreamNotificationCopy", () => {
  it("returns different titles for new, edit, check-in, completion request, checkout, and delete events", () => {
    const previous = [payload()];
    const titles = [
      appointmentStreamNotificationCopy(payload({ _id: "new1" }), previous).title,
      appointmentStreamNotificationCopy(payload({ visitorOrganization: "บริษัท B" }), previous).title,
      appointmentStreamNotificationCopy(payload({ checkedInAt: "2026-09-01T02:30:00.000Z" }), previous).title,
      appointmentStreamNotificationCopy(payload({ completionRequestedAt: "2026-09-01T03:00:00.000Z" }), previous).title,
      appointmentStreamNotificationCopy(payload({ completedAt: "2026-09-01T03:30:00.000Z" }), previous).title,
      appointmentStreamNotificationCopy({ _id: "a1", deleted: true }, previous).title,
    ];

    expect(titles).toEqual([
      "🔔 นัดหมายใหม่",
      "✏️ แก้ไขนัดหมาย",
      "✅ เช็คอินแล้ว",
      "📷 รอสแกนออก",
      "✅ เช็คเอาท์แล้ว",
      "🗑️ ลบนัดหมาย",
    ]);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("uses visitor details in the body instead of a generic update message", () => {
    expect(
      appointmentStreamNotificationCopy(payload({ _id: "new1" }), []),
    ).toEqual({
      title: "🔔 นัดหมายใหม่",
      body: "สมชาย (บริษัท A) วันที่ 2026-09-01 เวลา 09:30",
    });
  });

  it("uses a date range without time for new long-term appointment history", () => {
    const copy = appointmentStreamNotificationCopy(
      payload({
        _id: "long-term-1",
        qrMode: "long-term",
        appointmentDate: "",
        appointmentTime: "",
        createdAt: "2026-09-01T02:30:00.000Z",
        expiryDate: "2026-12-31",
      }),
      [],
    );

    expect(copy).toEqual({
      title: "🔔 ระยะยาวใหม่",
      body: "สมชาย (บริษัท A) วันที่ 01/09/2026 - 31/12/2026",
    });
    expect(copy.body).not.toContain("เวลา");
  });

  it("uses the previous appointment details when a delete payload only has an id", () => {
    expect(appointmentStreamNotificationCopy({ _id: "a1", deleted: true }, [payload()])).toEqual({
      title: "🗑️ ลบนัดหมาย",
      body: "ลบนัดหมายของ สมชาย (บริษัท A) แล้ว",
    });
  });
});
