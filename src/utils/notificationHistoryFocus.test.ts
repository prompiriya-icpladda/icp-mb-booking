import { resolveHistoryFocus } from "./notificationHistoryFocus";
import type { NotificationHistoryEntry } from "./notificationHistory.logic";
import type { TodayAppointment } from "../services/api";

function appointment(_id: string): TodayAppointment {
  return {
    _id,
    visitorName: "สมชาย",
    visitorOrganization: "บริษัท A",
    appointmentDate: "2026-09-01",
    appointmentTime: "09:30",
    purpose: "ประชุม",
    hasVehicle: false,
    licensePlate: "",
    checkedInAt: null,
    visitorCount: 1,
    createdByName: "ผู้สร้าง",
  };
}

function history(overrides: Partial<NotificationHistoryEntry>): NotificationHistoryEntry {
  return {
    id: "h1",
    timestamp: 1,
    kind: "update",
    title: "หัวข้อ",
    body: "รายละเอียด",
    read: false,
    ...overrides,
  };
}

describe("resolveHistoryFocus", () => {
  it("targets the normal tab and matching row index", () => {
    expect(resolveHistoryFocus(
      history({ appointmentId: "n2", tab: "normal" }),
      [appointment("n1"), appointment("n2")],
      [appointment("l1")],
    )).toEqual({ targetTab: "normal", appointmentId: "n2", index: 1, found: true });
  });

  it("targets the long-term tab and matching row index", () => {
    expect(resolveHistoryFocus(
      history({ appointmentId: "l1", tab: "longTerm" }),
      [appointment("n1")],
      [appointment("l1"), appointment("l2")],
    )).toEqual({ targetTab: "longTerm", appointmentId: "l1", index: 0, found: true });
  });
});
