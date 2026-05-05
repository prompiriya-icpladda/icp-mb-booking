import * as BackgroundTask from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { getTodayAppointments, TodayAppointment } from "../services/api";

export const BACKGROUND_TASK = "check-today-appointments";
const SEEN_KEY = "notified_appointment_ids";
const CHANNEL_ID = "appointments";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function setupAndroidChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "นัดหมาย",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#16a34a",
    enableVibrate: true,
  });
}

export async function requestPermissions(): Promise<boolean> {
  await setupAndroidChannel();
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
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
  await SecureStore.setItemAsync(SEEN_KEY, JSON.stringify({ date: today, ids: [...ids] }));
}

export async function checkAndNotify(): Promise<TodayAppointment[]> {
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
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: CHANNEL_ID },
    });
  } else if (newOnes.length > 1) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔔 นัดหมายใหม่วันนี้",
        body: `มีนัดหมายใหม่ ${newOnes.length} รายการ`,
        sound: "default",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: CHANNEL_ID },
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

export async function registerBackgroundTask() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (
      status === BackgroundTask.BackgroundFetchStatus.Restricted ||
      status === BackgroundTask.BackgroundFetchStatus.Denied
    ) return;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_TASK, {
        minimumInterval: 10 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch (e) {
    console.log("Background task registration failed:", e);
  }
}
