jest.mock("expo-background-fetch", () => ({
  BackgroundFetchResult: { NewData: "NewData", Failed: "Failed" },
  BackgroundFetchStatus: { Restricted: "Restricted", Denied: "Denied" },
  getStatusAsync: jest.fn(async () => "Available"),
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-notifications", () => ({
  AndroidImportance: { MAX: "MAX" },
  AndroidNotificationVisibility: { PUBLIC: "PUBLIC" },
  setNotificationHandler: jest.fn(),
  deleteNotificationChannelAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExpoPushToken[token]" })),
  scheduleNotificationAsync: jest.fn(async () => "notification-id"),
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

jest.mock("../services/api", () => ({
  getTodayAppointments: jest.fn(async () => []),
  registerMobilePushToken: jest.fn(async () => undefined),
}));

jest.mock("./notificationHistory", () => ({
  addHistoryEntry: jest.fn(async () => undefined),
}));

jest.mock("./kioskModule", () => ({
  kioskModule: {
    playNotificationSound: jest.fn(async () => true),
  },
}));

import * as Notifications from "expo-notifications";
import { addHistoryEntry } from "./notificationHistory";
import { kioskModule } from "./kioskModule";
import { notifyNow } from "./notificationService";

describe("notificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("schedules Android update notifications on the appointment channel so sound can play", async () => {
    await notifyNow("หัวข้อ", "รายละเอียด");

    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    expect(schedule).toHaveBeenCalledTimes(1);
    const request = schedule.mock.calls[0][0];
    expect(request.trigger).toEqual({ channelId: "appointments-v3" });
    expect(request.content).toEqual(
      expect.objectContaining({
        title: "หัวข้อ",
        body: "รายละเอียด",
        sound: "default",
        badge: 1,
      }),
    );
    expect(request.content).not.toHaveProperty("channelId");
  });

  it("plays a native notification sound on Android kiosk because lock task can suppress notification effects", async () => {
    await notifyNow("หัวข้อ", "รายละเอียด");

    expect(kioskModule.playNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("stores appointment target metadata for history rows and notification taps", async () => {
    await notifyNow("หัวข้อ", "รายละเอียด", { appointmentId: "long-1", tab: "longTerm" });

    const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
    expect(schedule.mock.calls[0][0].content.data).toEqual({
      appointmentId: "long-1",
      tab: "longTerm",
    });
    expect(addHistoryEntry).toHaveBeenCalledWith({
      title: "หัวข้อ",
      body: "รายละเอียด",
      kind: "update",
      appointmentId: "long-1",
      tab: "longTerm",
    });
  });
});
