import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addEntryToList,
  AddEntryInput,
  countUnread,
  createEntry,
  markAllReadInList,
  NotificationHistoryEntry,
  pruneEntries,
} from "./notificationHistory.logic";

const STORAGE_KEY = "notification_history";

let cache: NotificationHistoryEntry[] = [];
let hydrated = false;
let hydrating: Promise<void> | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

async function persist() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // best-effort: history ไม่ critical
  }
}

function hydrate(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as NotificationHistoryEntry[]) : [];
      cache = pruneEntries(Array.isArray(parsed) ? parsed : [], Date.now());
    } catch {
      cache = [];
    } finally {
      hydrated = true;
      hydrating = null;
      notify();
    }
  })();
  return hydrating;
}

// เริ่ม hydrate ตอน import (best-effort) เพื่อให้ badge มีค่าเร็วที่สุด
hydrate();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUnreadCount(): number {
  return countUnread(cache);
}

export async function getHistory(): Promise<NotificationHistoryEntry[]> {
  await hydrate();
  cache = pruneEntries(cache, Date.now());
  return cache;
}

export async function addHistoryEntry(input: AddEntryInput): Promise<void> {
  await hydrate();
  const now = Date.now();
  const entry = createEntry(input, now, String(seq++));
  cache = addEntryToList(cache, entry, now);
  notify();
  await persist();
}

export async function markAllRead(): Promise<void> {
  await hydrate();
  if (countUnread(cache) === 0) return;
  cache = markAllReadInList(cache);
  notify();
  await persist();
}

export async function clearHistory(): Promise<void> {
  cache = [];
  hydrated = true;
  notify();
  await persist();
}
