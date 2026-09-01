import {
  appointmentNotificationTarget,
  notificationTargetFromData,
} from "./appointmentNotificationTarget";

describe("appointmentNotificationTarget", () => {
  it("routes single-use appointment notifications to the normal tab", () => {
    expect(appointmentNotificationTarget({ _id: "normal-1", qrMode: "single-use" })).toEqual({
      appointmentId: "normal-1",
      tab: "normal",
    });
  });

  it("routes long-term appointment notifications to the long-term tab", () => {
    expect(appointmentNotificationTarget({ _id: "long-1", qrMode: "long-term" })).toEqual({
      appointmentId: "long-1",
      tab: "longTerm",
    });
  });
});

describe("notificationTargetFromData", () => {
  it("reads a tappable notification target from stored notification data", () => {
    expect(notificationTargetFromData({ appointmentId: "long-1", tab: "longTerm" })).toEqual({
      appointmentId: "long-1",
      tab: "longTerm",
    });
  });

  it("ignores invalid notification data", () => {
    expect(notificationTargetFromData({ appointmentId: "long-1", tab: "history" })).toBeNull();
    expect(notificationTargetFromData({ tab: "longTerm" })).toBeNull();
  });
});
