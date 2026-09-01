export type NotificationKind = "new-appointment" | "update";

export interface NotificationHistoryEntry {
  id: string;
  timestamp: number;
  kind: NotificationKind;
  title: string;
  body: string;
  read: boolean;
  appointmentId?: string;
  tab?: "normal" | "longTerm";
}

export interface AddEntryInput {
  kind: NotificationKind;
  title: string;
  body: string;
  appointmentId?: string;
  tab?: "normal" | "longTerm";
}

export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 วัน
export const UPDATE_DEDUPE_MS = 60 * 1000; // 60 วินาที
const DISTINCT_UPDATE_TITLES = new Set(["✅ เช็คอินแล้ว"]);

export function createEntry(
  input: AddEntryInput,
  now: number,
  idSuffix: string,
): NotificationHistoryEntry {
  return {
    id: `${now}-${idSuffix}`,
    timestamp: now,
    kind: input.kind,
    title: input.title,
    body: input.body,
    read: false,
    ...(input.appointmentId ? { appointmentId: input.appointmentId } : {}),
    ...(input.tab ? { tab: input.tab } : {}),
  };
}

export function pruneEntries(
  entries: NotificationHistoryEntry[],
  now: number,
  maxAgeMs: number = MAX_AGE_MS,
): NotificationHistoryEntry[] {
  const cutoff = now - maxAgeMs;
  return entries.filter((e) => e.timestamp >= cutoff);
}

export function addEntryToList(
  list: NotificationHistoryEntry[],
  entry: NotificationHistoryEntry,
  now: number,
  dedupeMs: number = UPDATE_DEDUPE_MS,
  maxAgeMs: number = MAX_AGE_MS,
): NotificationHistoryEntry[] {
  const head = list[0];
  const shouldKeepDistinctUpdate =
    entry.kind === "update" && DISTINCT_UPDATE_TITLES.has(entry.title);
  const isDuplicateUpdate =
    entry.kind === "update" &&
    !shouldKeepDistinctUpdate &&
    head?.kind === "update" &&
    entry.timestamp - head.timestamp < dedupeMs;
  const next = isDuplicateUpdate ? list : [entry, ...list];
  return pruneEntries(next, now, maxAgeMs);
}

export function countUnread(entries: NotificationHistoryEntry[]): number {
  return entries.reduce((n, e) => (e.read ? n : n + 1), 0);
}

export function markAllReadInList(
  entries: NotificationHistoryEntry[],
): NotificationHistoryEntry[] {
  return entries.map((e) => (e.read ? e : { ...e, read: true }));
}

export function formatRelativeTime(timestamp: number, now: number): string {
  const diff = now - timestamp;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "เมื่อสักครู่";
  if (diff < hour) return `${Math.floor(diff / min)} นาทีที่แล้ว`;
  if (diff < day) return `${Math.floor(diff / hour)} ชั่วโมงที่แล้ว`;
  return `${Math.floor(diff / day)} วันที่แล้ว`;
}
