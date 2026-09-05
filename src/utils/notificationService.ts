import * as BackgroundTask from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { getTodayAppointments, registerMobilePushToken, TodayAppointment } from "../services/api";
import { kioskModule } from "./kioskModule";
import { addHistoryEntry } from "./notificationHistory";
import type { NotificationKind, NotificationHistoryEntry } from "./notificationHistory.logic";

export const BACKGROUND_TASK = "check-today-appointments";
const SEEN_KEY = "notified_appointment_ids";
const DEVICE_ID_KEY = "mobile_push_device_id";
const CHANNEL_ID = "appointments-v3";
const EAS_PROJECT_ID = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "";

const NOTIFICATION_DEDUPE_MS = 60 * 1000;
const NATIVE_SOUND_THROTTLE_MS = 5 * 1000;
const recentNotificationKeys = new Map<string, number>();
let lastNativeSoundAt = 0;

function shouldPlayNotificationSound(notification?: Notifications.Notification): boolean {
  return notification?.request?.content?.data?.suppressSound !== true;
}

function notificationKey(opts: {
  title: string;
  body: string;
  kind: NotificationKind;
  appointmentId?: string;
  tab?: NotificationHistoryEntry["tab"];
}): string {
  return [
    opts.kind,
    opts.appointmentId || "",
    opts.tab || "",
    opts.title,
    opts.body,
  ].join("\u001f");
}

function shouldSuppressDuplicateNotification(
  opts: Parameters<typeof notificationKey>[0],
  now = Date.now(),
): boolean {
  for (const [key, timestamp] of recentNotificationKeys) {
    if (now - timestamp >= NOTIFICATION_DEDUPE_MS) {
      recentNotificationKeys.delete(key);
    }
  }

  const key = notificationKey(opts);
  const previous = recentNotificationKeys.get(key);
  if (previous !== undefined && now - previous < NOTIFICATION_DEDUPE_MS) {
    return true;
  }

  recentNotificationKeys.set(key, now);
  return false;
}

function shouldPlayNativeSound(now = Date.now()): boolean {
  if (now - lastNativeSoundAt < NATIVE_SOUND_THROTTLE_MS) return false;
  lastNativeSoundAt = now;
  return true;
}

export function __resetNotificationDedupeForTests() {
  recentNotificationKeys.clear();
  lastNativeSoundAt = 0;
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldPlaySound: shouldPlayNotificationSound(notification),
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldVibrate: true,
  }),
});

async function setupAndroidChannel() {
  if (Platform.OS !== "android") return;
  // Delete old channel so Android picks up new sound settings
  await Notifications.deleteNotificationChannelAsync("appointments").catch(
    () => {},
  );
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "นัดหมาย",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250, 250, 250],
    lightColor: "#16a34a",
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

async function setupIOSNotifications() {
  if (Platform.OS !== "ios") return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    const result = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowCriticalAlerts: true,
        allowProvisional: true,
      },
    });
    return result.status === "granted";
  }
  return true;
}

export async function requestPermissions(): Promise<boolean> {
  await setupAndroidChannel();
  await setupIOSNotifications();
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = `ap-scanner-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
}

export async function registerRemotePushToken(): Promise<string | null> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return null;

  try {
    const expoToken = await Notifications.getExpoPushTokenAsync(
      EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : undefined,
    );
    const token = expoToken.data;
    if (!token) return null;
    await registerMobilePushToken({
      token,
      deviceId: await getDeviceId(),
      platform: Platform.OS,
    });
    return token;
  } catch (err) {
    console.log("Remote push registration failed:", err);
    return null;
  }
}

async function fireNotification(opts: {
  title: string;
  body: string;
  kind: NotificationKind;
  badge?: number;
  appointmentId?: string;
  tab?: NotificationHistoryEntry["tab"];
}) {
  const { title, body, kind, badge = 1, appointmentId, tab } = opts;
  if (shouldSuppressDuplicateNotification({ title, body, kind, appointmentId, tab })) {
    return;
  }
  const shouldPlaySound = Platform.OS !== "android" || shouldPlayNativeSound();
  const data = {
    ...(appointmentId ? { appointmentId } : {}),
    ...(tab ? { tab } : {}),
    ...(!shouldPlaySound ? { suppressSound: true } : {}),
  };
  await setupAndroidChannel();
  const trigger = Platform.OS === "android" ? { channelId: CHANNEL_ID } : null;
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      badge,
      data,
      ...(shouldPlaySound ? { sound: "default" } : {}),
    },
    trigger,
  });
  if (Platform.OS === "android" && shouldPlaySound) {
    kioskModule.playNotificationSound().catch(() => {});
  }
  // บันทึกประวัติแบบ best-effort — push ต้องเด้งได้เสมอแม้ log fail
  addHistoryEntry({ title, body, kind, appointmentId, tab }).catch(() => {});
}

export async function notifyNow(
  title: string,
  body: string,
  target: Pick<Parameters<typeof fireNotification>[0], "appointmentId" | "tab"> = {},
) {
  await fireNotification({ title, body, kind: "update", ...target });
}

async function getSeenIds(): Promise<Set<string>> {
  try {
    const raw = await SecureStore.getItemAsync(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { date: string; ids: string[] };
    const today = new Date().toISOString().split("T")[0];
    if (parsed.date !== today) return new Set();
    return new Set(parsed.ids);
  } catch {
    return new Set();
  }
}

async function saveSeenIds(ids: Set<string>) {
  const today = new Date().toISOString().split("T")[0];
  await SecureStore.setItemAsync(
    SEEN_KEY,
    JSON.stringify({ date: today, ids: [...ids] }),
  );
}

export async function checkAndNotify(): Promise<TodayAppointment[]> {
  if (Platform.OS === "android") await setupAndroidChannel();
  const appointments = await getTodayAppointments();
  const seenIds = await getSeenIds();
  const newOnes = appointments.filter((a) => !seenIds.has(a._id));

  if (newOnes.length === 1) {
    const a = newOnes[0];
    await fireNotification({
      title: "🔔 นัดหมายใหม่วันนี้",
      body: `${a.visitorName} (${a.visitorOrganization}) เวลา ${a.appointmentTime}`,
      kind: "new-appointment",
      appointmentId: a._id,
      tab: "normal",
    });
  } else if (newOnes.length > 1) {
    await fireNotification({
      title: "🔔 นัดหมายใหม่วันนี้",
      body: `มีนัดหมายใหม่ ${newOnes.length} รายการ`,
      kind: "new-appointment",
      badge: newOnes.length,
      tab: "normal",
    });
  }

  if (newOnes.length > 0) {
    newOnes.forEach((a) => seenIds.add(a._id));
    await saveSeenIds(seenIds);
  }

  return appointments;
}

// Define background task (must be called at module level, outside any component)
TaskManager.defineTask(BACKGROUND_TASK, async () => {
  try {
    await checkAndNotify();
    return BackgroundTask.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundTask.BackgroundFetchResult.Failed;
  }
});

// Start foreground polling (ทำงานเมื่อแอปเปิด)
let foregroundPollingInterval: ReturnType<typeof setInterval> | null = null;

export function startForegroundPolling() {
  if (foregroundPollingInterval) return;

  // Check immediately
  checkAndNotify().catch(() => {});

  // Check every 30 seconds
  foregroundPollingInterval = setInterval(() => {
    checkAndNotify().catch(() => {});
  }, 30 * 1000);
}

export function stopForegroundPolling() {
  if (foregroundPollingInterval) {
    clearInterval(foregroundPollingInterval);
    foregroundPollingInterval = null;
  }
}

export async function registerBackgroundTask() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (
      status === BackgroundTask.BackgroundFetchStatus.Restricted ||
      status === BackgroundTask.BackgroundFetchStatus.Denied
    )
      return;

    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK);
    if (isRegistered) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK);
    }
    await BackgroundTask.registerTaskAsync(BACKGROUND_TASK, {
      minimumInterval: 1 * 60, // 1 นาที (ทุกนาที)
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (e) {
    console.log("Background task registration failed:", e);
  }
}
