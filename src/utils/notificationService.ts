import * as BackgroundTask from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { getTodayAppointments, TodayAppointment } from "../services/api";

export const BACKGROUND_TASK = "check-today-appointments";
const SEEN_KEY = "notified_appointment_ids";
const CHANNEL_ID = "appointments-v3";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
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

export async function notifyNow(title: string, body: string) {
  console.log("notifyNow:", { title, body });
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      badge: 1,
      ...(Platform.OS === "android" && { channelId: CHANNEL_ID }),
    },
    trigger: null,
  });
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
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔔 นัดหมายใหม่วันนี้",
        body: `${a.visitorName} (${a.visitorOrganization}) เวลา ${a.appointmentTime}`,
        sound: "default",
        badge: 1,
        ...(Platform.OS === "android" && { channelId: CHANNEL_ID }),
      },
      trigger: null,
    });
  } else if (newOnes.length > 1) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔔 นัดหมายใหม่วันนี้",
        body: `มีนัดหมายใหม่ ${newOnes.length} รายการ`,
        sound: "default",
        badge: newOnes.length,
        ...(Platform.OS === "android" && { channelId: CHANNEL_ID }),
      },
      trigger: null,
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
