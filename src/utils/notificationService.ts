import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { getTodayAppointments, TodayAppointment } from "../services/api";

export const BACKGROUND_TASK = "check-today-appointments";
const SEEN_KEY = "notified_appointment_ids";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissions(): Promise<boolean> {
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
        sound: true,
      },
      trigger: null,
    });
  } else if (newOnes.length > 1) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔔 นัดหมายใหม่วันนี้",
        body: `มีนัดหมายใหม่ ${newOnes.length} รายการ`,
        sound: true,
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
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundTask() {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return;
    }
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK, {
        minimumInterval: 10 * 60, // 10 minutes
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch (e) {
    console.log("Background task registration failed:", e);
  }
}
