# Notification History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มประวัติการแจ้งเตือนบนเครื่อง (log ทุก push ที่แอปเด้ง) ดูได้ในแท็บย่อยใหม่ พร้อม read/unread, badge, ปุ่มล้าง และแตะ→ไปนัดที่เกี่ยว

**Architecture:** แยก pure logic (`notificationHistory.logic.ts`) ออกจาก storage shell (`notificationHistory.ts`) — logic ทดสอบด้วย jest (node), shell ใช้ AsyncStorage + pub/sub. การยิง push ทุกจุดรวมเป็น chokepoint เดียวใน `notificationService.ts` ที่ทั้งเด้ง push และบันทึก log. UI (NotificationScreen sub-tab + App.tsx badge) subscribe store เพื่ออัปเดตทันที

**Tech Stack:** React Native 0.81 / Expo SDK 54, TypeScript strict, `@react-native-async-storage/async-storage`, jest + ts-jest (node env)

## Global Constraints

- ที่เก็บข้อมูล: AsyncStorage เท่านั้น (dep ใหม่ตัวเดียว `@react-native-async-storage/async-storage`) — ต้อง native rebuild (gradlew) 1 ครั้งหลังเพิ่ม dep
- เก็บย้อนหลัง 7 วัน: `MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000`
- dedupe update ภายใน: `UPDATE_DEDUPE_MS = 60 * 1000`
- AsyncStorage key: `"notification_history"`
- pure logic ห้าม import native module ใดๆ (jest testEnvironment = "node")
- jest: ทดสอบเฉพาะ pure functions; ไฟล์ UI/shell ตรวจด้วย `npx tsc --noEmit` + manual device test
- tsc baseline: มี ~8 expo-* errors เดิมใน `app/` scaffold อยู่แล้ว — งานนี้ต้องไม่เพิ่ม error ใหม่จากไฟล์ของเรา
- เพิ่มอย่างเดียว ห้ามแก้พฤติกรรมเดิมของ scan / checkout / walk-in
- UI copy เป็นภาษาไทย

---

### Task 1: เพิ่ม dependency AsyncStorage

**Files:**
- Modify: `package.json` (ผ่าน expo install)

**Interfaces:**
- Consumes: —
- Produces: module `@react-native-async-storage/async-storage` (default export `AsyncStorage` พร้อม `getItem`/`setItem`)

- [ ] **Step 1: ติดตั้ง dep แบบ SDK-correct**

Run: `npx expo install @react-native-async-storage/async-storage`
Expected: package.json ได้บรรทัด `"@react-native-async-storage/async-storage": "<version>"` (Expo เลือกเวอร์ชันให้ตรง SDK 54)

- [ ] **Step 2: ยืนยันว่าเพิ่มแล้ว**

Run: `grep async-storage package.json`
Expected: เจอ 1 บรรทัดใน dependencies

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add @react-native-async-storage/async-storage for notification history"
```

> หมายเหตุ: dep นี้เป็น native module → ต้อง build APK ใหม่ (gradlew) 1 ครั้งก่อนฟีเจอร์ทำงานบนเครื่องจริง. งาน JS/jest ใน task ถัดไปไม่ต้อง rebuild ก็รัน/เทสต์ได้ (jest ไม่ import shell ที่ใช้ AsyncStorage)

---

### Task 2: pure logic + tests (`notificationHistory.logic.ts`)

**Files:**
- Create: `src/utils/notificationHistory.logic.ts`
- Test: `src/utils/notificationHistory.logic.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type NotificationKind = "new-appointment" | "update"`
  - `interface NotificationHistoryEntry { id: string; timestamp: number; kind: NotificationKind; title: string; body: string; read: boolean; appointmentId?: string; tab?: "normal" | "longTerm" }`
  - `interface AddEntryInput { kind: NotificationKind; title: string; body: string; appointmentId?: string; tab?: "normal" | "longTerm" }`
  - `const MAX_AGE_MS: number`, `const UPDATE_DEDUPE_MS: number`
  - `createEntry(input: AddEntryInput, now: number, idSuffix: string): NotificationHistoryEntry`
  - `pruneEntries(entries: NotificationHistoryEntry[], now: number, maxAgeMs?: number): NotificationHistoryEntry[]`
  - `addEntryToList(list: NotificationHistoryEntry[], entry: NotificationHistoryEntry, now: number, dedupeMs?: number, maxAgeMs?: number): NotificationHistoryEntry[]`
  - `countUnread(entries: NotificationHistoryEntry[]): number`
  - `markAllReadInList(entries: NotificationHistoryEntry[]): NotificationHistoryEntry[]`
  - `formatRelativeTime(timestamp: number, now: number): string`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน**

สร้าง `src/utils/notificationHistory.logic.test.ts`:

```ts
import {
  addEntryToList,
  countUnread,
  createEntry,
  formatRelativeTime,
  markAllReadInList,
  MAX_AGE_MS,
  NotificationHistoryEntry,
  pruneEntries,
} from "./notificationHistory.logic";

const NOW = 1_700_000_000_000;

function entry(over: Partial<NotificationHistoryEntry> = {}): NotificationHistoryEntry {
  return { id: "x", timestamp: NOW, kind: "update", title: "t", body: "b", read: false, ...over };
}

describe("createEntry", () => {
  it("สร้าง entry read=false พร้อม id ที่รวม now กับ suffix", () => {
    const e = createEntry({ kind: "update", title: "ก", body: "ข" }, NOW, "3");
    expect(e.id).toBe(`${NOW}-3`);
    expect(e.timestamp).toBe(NOW);
    expect(e.read).toBe(false);
    expect(e.kind).toBe("update");
  });
  it("ใส่ appointmentId/tab เฉพาะเมื่อมีค่า", () => {
    const a = createEntry({ kind: "new-appointment", title: "ก", body: "ข" }, NOW, "1");
    expect("appointmentId" in a).toBe(false);
    expect("tab" in a).toBe(false);
    const b = createEntry({ kind: "new-appointment", title: "ก", body: "ข", appointmentId: "id1", tab: "normal" }, NOW, "2");
    expect(b.appointmentId).toBe("id1");
    expect(b.tab).toBe("normal");
  });
});

describe("pruneEntries", () => {
  it("ตัดรายการที่เก่ากว่า 7 วัน", () => {
    const old = entry({ id: "old", timestamp: NOW - MAX_AGE_MS - 1 });
    const fresh = entry({ id: "fresh", timestamp: NOW });
    const out = pruneEntries([fresh, old], NOW);
    expect(out.map((e) => e.id)).toEqual(["fresh"]);
  });
  it("เก็บรายการที่อยู่พอดีขอบเขต (timestamp === cutoff)", () => {
    const edge = entry({ id: "edge", timestamp: NOW - MAX_AGE_MS });
    expect(pruneEntries([edge], NOW).map((e) => e.id)).toEqual(["edge"]);
  });
});

describe("addEntryToList", () => {
  it("ใส่ entry ใหม่ไว้หัวลิสต์", () => {
    // new entry เป็น new-appointment เพื่อทดสอบ prepend โดยไม่ชน dedupe (head เป็น update)
    const list = [entry({ id: "a", timestamp: NOW - 1000 })];
    const out = addEntryToList(list, entry({ id: "b", kind: "new-appointment", timestamp: NOW }), NOW);
    expect(out.map((e) => e.id)).toEqual(["b", "a"]);
  });
  it("dedupe update ที่ติดกันภายใน 60 วิ (ไม่เพิ่ม)", () => {
    const head = entry({ id: "u1", kind: "update", timestamp: NOW });
    const next = entry({ id: "u2", kind: "update", timestamp: NOW + 30_000 });
    const out = addEntryToList([head], next, NOW + 30_000);
    expect(out.map((e) => e.id)).toEqual(["u1"]);
  });
  it("ไม่ dedupe update ที่ห่างเกิน 60 วิ", () => {
    const head = entry({ id: "u1", kind: "update", timestamp: NOW });
    const next = entry({ id: "u2", kind: "update", timestamp: NOW + 61_000 });
    const out = addEntryToList([head], next, NOW + 61_000);
    expect(out.map((e) => e.id)).toEqual(["u2", "u1"]);
  });
  it("ไม่ dedupe new-appointment แม้หัวลิสต์เป็น update", () => {
    const head = entry({ id: "u1", kind: "update", timestamp: NOW });
    const next = entry({ id: "n1", kind: "new-appointment", timestamp: NOW + 1000 });
    const out = addEntryToList([head], next, NOW + 1000);
    expect(out.map((e) => e.id)).toEqual(["n1", "u1"]);
  });
  it("prune ของเก่าทิ้งระหว่างเพิ่ม", () => {
    const old = entry({ id: "old", kind: "new-appointment", timestamp: NOW - MAX_AGE_MS - 1 });
    const next = entry({ id: "new", kind: "new-appointment", timestamp: NOW });
    const out = addEntryToList([old], next, NOW);
    expect(out.map((e) => e.id)).toEqual(["new"]);
  });
});

describe("countUnread", () => {
  it("นับเฉพาะ read=false", () => {
    expect(countUnread([entry({ read: false }), entry({ read: true }), entry({ read: false })])).toBe(2);
  });
});

describe("markAllReadInList", () => {
  it("ตั้ง read=true ทุกตัว", () => {
    const out = markAllReadInList([entry({ read: false }), entry({ read: true })]);
    expect(out.every((e) => e.read)).toBe(true);
  });
});

describe("formatRelativeTime", () => {
  it("< 1 นาที = เมื่อสักครู่", () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe("เมื่อสักครู่");
  });
  it("เป็นนาที", () => {
    expect(formatRelativeTime(NOW - 10 * 60_000, NOW)).toBe("10 นาทีที่แล้ว");
  });
  it("เป็นชั่วโมง", () => {
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3 ชั่วโมงที่แล้ว");
  });
  it("เป็นวัน", () => {
    expect(formatRelativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2 วันที่แล้ว");
  });
});
```

- [ ] **Step 2: รัน test ให้เห็นว่า fail**

Run: `npx jest notificationHistory.logic`
Expected: FAIL — "Cannot find module './notificationHistory.logic'"

- [ ] **Step 3: เขียน implementation ขั้นต่ำ**

สร้าง `src/utils/notificationHistory.logic.ts`:

```ts
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
  const isDuplicateUpdate =
    entry.kind === "update" &&
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
```

- [ ] **Step 4: รัน test ให้ผ่าน**

Run: `npx jest notificationHistory.logic`
Expected: PASS ทุกเคส

- [ ] **Step 5: Commit**

```bash
git add src/utils/notificationHistory.logic.ts src/utils/notificationHistory.logic.test.ts
git commit -m "feat: pure logic for notification history (prune/dedupe/unread)"
```

---

### Task 3: storage shell (`notificationHistory.ts`)

**Files:**
- Create: `src/utils/notificationHistory.ts`

**Interfaces:**
- Consumes: ทุก export จาก `./notificationHistory.logic`
- Produces:
  - `subscribe(listener: () => void): () => void`
  - `getUnreadCount(): number` (sync, อ่านจาก in-memory cache)
  - `getHistory(): Promise<NotificationHistoryEntry[]>` (newest first)
  - `addHistoryEntry(input: AddEntryInput): Promise<void>`
  - `markAllRead(): Promise<void>`
  - `clearHistory(): Promise<void>`

- [ ] **Step 1: เขียน shell**

สร้าง `src/utils/notificationHistory.ts`:

```ts
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
```

- [ ] **Step 2: ตรวจ type**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่จาก `notificationHistory.ts` (ยอมรับ ~8 expo-* errors เดิมใน `app/`)

- [ ] **Step 3: Commit**

```bash
git add src/utils/notificationHistory.ts
git commit -m "feat: notification history store (AsyncStorage + pub/sub)"
```

---

### Task 4: chokepoint ใน `notificationService.ts`

**Files:**
- Modify: `src/utils/notificationService.ts`

**Interfaces:**
- Consumes: `addHistoryEntry` จาก `./notificationHistory`, `NotificationKind` จาก `./notificationHistory.logic`
- Produces: refactor ภายใน — `notifyNow`/`checkAndNotify` ยังคง signature เดิม แต่บันทึก history ทุกครั้งที่เด้ง push

- [ ] **Step 1: เพิ่ม import (ใต้บรรทัด import เดิมราวบรรทัด 6)**

แก้ส่วน import ด้านบนไฟล์ ให้เพิ่ม 2 บรรทัดนี้ต่อท้าย import ที่มีอยู่:

```ts
import { addHistoryEntry } from "./notificationHistory";
import type { NotificationKind } from "./notificationHistory.logic";
```

- [ ] **Step 2: เพิ่ม chokepoint `fireNotification` และให้ `notifyNow` เรียกผ่านมัน**

แทนที่ฟังก์ชัน `notifyNow` เดิม (บรรทัด ~64-76):

```ts
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
```

ด้วยโค้ดนี้:

```ts
async function fireNotification(opts: {
  title: string;
  body: string;
  kind: NotificationKind;
  badge?: number;
  appointmentId?: string;
  tab?: "normal" | "longTerm";
}) {
  const { title, body, kind, badge = 1, appointmentId, tab } = opts;
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default",
      badge,
      ...(Platform.OS === "android" && { channelId: CHANNEL_ID }),
    },
    trigger: null,
  });
  // บันทึกประวัติแบบ best-effort — push ต้องเด้งได้เสมอแม้ log fail
  addHistoryEntry({ title, body, kind, appointmentId, tab }).catch(() => {});
}

export async function notifyNow(title: string, body: string) {
  await fireNotification({ title, body, kind: "update" });
}
```

- [ ] **Step 3: เปลี่ยน `checkAndNotify` ให้ใช้ `fireNotification`**

แทนที่บล็อก `if (newOnes.length === 1) {...} else if (newOnes.length > 1) {...}` เดิม (บรรทัด ~105-128):

```ts
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
```

ด้วยโค้ดนี้:

```ts
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
```

- [ ] **Step 4: ตรวจ type + เทสต์เดิมไม่พัง**

Run: `npx tsc --noEmit && npx jest`
Expected: ไม่มี error ใหม่; jest ผ่านทั้งหมด (รวม logic ใหม่)

- [ ] **Step 5: Commit**

```bash
git add src/utils/notificationService.ts
git commit -m "feat: route all local pushes through chokepoint that logs history"
```

---

### Task 5: แท็บย่อย "ประวัติ" ใน NotificationScreen

**Files:**
- Modify: `src/screens/NotificationScreen.tsx`

**Interfaces:**
- Consumes: `subscribe`, `getHistory`, `getUnreadCount`, `markAllRead`, `clearHistory` จาก `../utils/notificationHistory`; `NotificationHistoryEntry`, `formatRelativeTime` จาก `../utils/notificationHistory.logic`
- Produces: แท็บที่ 3 ("ประวัติ") แสดง log + unread dot + ปุ่มล้าง; mark read เมื่อเปิดแท็บ

- [ ] **Step 1: เพิ่ม import**

แก้บรรทัด import (บรรทัด 13-16) เพิ่ม 2 บรรทัด:

```ts
import { clearHistory, getHistory, getUnreadCount, markAllRead, subscribe } from "../utils/notificationHistory";
import { formatRelativeTime, NotificationHistoryEntry } from "../utils/notificationHistory.logic";
```

- [ ] **Step 2: ขยาย type แท็บ + เพิ่ม state ประวัติ**

แทนที่บรรทัด `type AppointmentTab = "normal" | "longTerm";` ด้วย:

```ts
type AppointmentTab = "normal" | "longTerm" | "history";
```

หลังบรรทัด `const [detailItem, setDetailItem] = useState<TodayAppointment | null>(null);` เพิ่ม:

```ts
  const [history, setHistory] = useState<NotificationHistoryEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
```

- [ ] **Step 3: subscribe store + โหลดประวัติ**

หลัง `useEffect` ก้อนแรก (ที่ตั้ง interval, จบราวบรรทัด 65) เพิ่ม useEffect ใหม่:

```ts
  useEffect(() => {
    const refresh = () => {
      getHistory().then(setHistory);
      setUnreadCount(getUnreadCount());
    };
    refresh();
    const unsub = subscribe(refresh);
    return unsub;
  }, []);
```

- [ ] **Step 4: mark read เมื่อเปิดแท็บประวัติ**

แทนที่ useEffect `useEffect(() => { exitSelectMode(); }, [activeTab]);` ด้วย:

```ts
  useEffect(() => {
    exitSelectMode();
    if (activeTab === "history") {
      markAllRead();
    }
  }, [activeTab]);
```

- [ ] **Step 5: เพิ่มปุ่มแท็บ "ประวัติ" (มี badge)**

ในบล็อก `<View style={styles.tabRow}>` หลังปุ่ม TouchableOpacity ของ "ระยะยาว" (ปิดราวบรรทัด 167) เพิ่มปุ่มที่ 3:

```tsx
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "history" && styles.tabBtnActive]}
          onPress={() => setActiveTab("history")}
          activeOpacity={0.8}
        >
          <View style={styles.tabLabelWrap}>
            <Text style={[styles.tabBtnText, activeTab === "history" && styles.tabBtnTextActive]}>
              ประวัติ
            </Text>
            {unreadCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
```

- [ ] **Step 6: render เนื้อหาแท็บประวัติ (แยกจาก list นัดหมาย)**

หา `const isLongTerm = activeTab === "longTerm";` แล้วเพิ่มบรรทัดถัดไป:

```ts
  const isHistory = activeTab === "history";
```

ครอบส่วน render หลัก: หาบล็อกที่ขึ้นต้นด้วย `{loading ? (` (ราวบรรทัด 186) แล้วแทรก **ก่อนหน้า** มันด้วย early branch สำหรับประวัติ — เปลี่ยน `{loading ? (` เป็น:

```tsx
      {isHistory ? (
        <HistoryList
          history={history}
          onClear={() => {
            Alert.alert("ล้างประวัติทั้งหมด", "ต้องการลบประวัติการแจ้งเตือนทั้งหมดหรือไม่?", [
              { text: "ยกเลิก", style: "cancel" },
              { text: "ล้าง", style: "destructive", onPress: () => clearHistory() },
            ]);
          }}
        />
      ) : loading ? (
```

> ผลคือ chain เป็น `isHistory ? (...) : loading ? (...) : error ? (...) : (FlatList)` — แท็บประวัติไม่ยุ่งกับ loading/error ของนัดหมาย

- [ ] **Step 7: ซ่อน select bar / action bar ตอนอยู่แท็บประวัติ**

เงื่อนไข select bar กับ action bar ใช้ `isLongTerm` อยู่แล้ว → ไม่ต้องแก้ (แท็บ history ไม่เข้าเงื่อนไข). ยืนยันว่า `{isLongTerm && (...)}` ทั้งสองจุดยังเป็น `isLongTerm` ไม่ใช่ `!isHistory`

- [ ] **Step 8: เพิ่มคอมโพเนนต์ `HistoryList` + `HistoryRow`**

ก่อน `function Pill(...)` (ราวบรรทัด 371) เพิ่ม:

```tsx
function HistoryList({
  history,
  onClear,
}: {
  history: NotificationHistoryEntry[];
  onClear: () => void;
}) {
  const now = Date.now();
  return (
    <View style={styles.historyWrap}>
      {history.length > 0 && (
        <View style={styles.historyBar}>
          <TouchableOpacity style={styles.clearBtn} onPress={onClear} activeOpacity={0.8}>
            <Text style={styles.clearBtnText}>ล้างประวัติทั้งหมด</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={history.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>🔕</Text>
            <Text style={styles.emptyText}>ยังไม่มีประวัติการแจ้งเตือน</Text>
          </View>
        }
        renderItem={({ item }) => <HistoryRow item={item} now={now} />}
      />
    </View>
  );
}

function HistoryRow({ item, now }: { item: NotificationHistoryEntry; now: number }) {
  const icon = item.kind === "new-appointment" ? "🆕" : "🔄";
  return (
    <View style={[styles.historyCard, !item.read && styles.historyCardUnread]}>
      <Text style={styles.historyIcon}>{icon}</Text>
      <View style={styles.historyBody}>
        <Text style={styles.historyTitle}>{item.title}</Text>
        <Text style={styles.historyText}>{item.body}</Text>
        <Text style={styles.historyTime}>{formatRelativeTime(item.timestamp, now)}</Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </View>
  );
}
```

- [ ] **Step 9: เพิ่ม styles**

ใน `StyleSheet.create({...})` (ก่อนปิด `});` บรรทัดสุดท้าย) เพิ่ม:

```ts
  tabLabelWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  tabBadge: { backgroundColor: "#dc2626", borderRadius: 99, minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, alignItems: "center" },
  tabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  historyWrap: { flex: 1 },
  historyBar: { paddingHorizontal: 16, paddingTop: 12, alignItems: "flex-end" },
  clearBtn: { backgroundColor: "#fee2e2", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  clearBtnText: { color: "#dc2626", fontSize: 12, fontWeight: "700" },
  historyCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#fff", borderRadius: 12, padding: 14, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  historyCardUnread: { backgroundColor: "#f0fdf4" },
  historyIcon: { fontSize: 18 },
  historyBody: { flex: 1 },
  historyTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  historyText: { fontSize: 13, color: "#374151", marginTop: 2 },
  historyTime: { fontSize: 11, color: "#9ca3af", marginTop: 6 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#16a34a", marginTop: 4 },
```

- [ ] **Step 10: ตรวจ type**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่จาก `NotificationScreen.tsx`

- [ ] **Step 11: Commit**

```bash
git add src/screens/NotificationScreen.tsx
git commit -m "feat: notification history sub-tab with unread badge and clear"
```

---

### Task 6: แตะรายการประวัติ → ไปนัดที่เกี่ยว (+ ไฮไลต์)

**Files:**
- Modify: `src/screens/NotificationScreen.tsx`

**Interfaces:**
- Consumes: state `todayAppointments`, `longTermAppointments`, `history` ที่มีอยู่แล้ว
- Produces: tap handler บน HistoryRow ที่สลับแท็บ + ไฮไลต์การ์ดเป้าหมาย ~2.5 วิ

- [ ] **Step 1: เพิ่ม state highlight + ref ของ FlatList**

หลัง `const [unreadCount, setUnreadCount] = useState(0);` (จาก Task 5) เพิ่ม:

```ts
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const listRef = useRef<FlatList<TodayAppointment>>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 2: เพิ่ม handler แตะรายการประวัติ**

หลังฟังก์ชัน `checkoutSelected` (ราวบรรทัด 116) เพิ่ม:

```ts
  function handleHistoryPress(item: NotificationHistoryEntry) {
    const targetTab: AppointmentTab = item.tab ?? "normal";
    const pool = targetTab === "longTerm" ? longTermAppointments : todayAppointments;
    const found = item.appointmentId
      ? pool.find((a) => a._id === item.appointmentId)
      : undefined;

    setActiveTab(targetTab);

    if (item.appointmentId && !found) {
      Alert.alert("ไม่พบนัดหมาย", "นัดหมายนี้ไม่อยู่ในรายการแล้ว");
      return;
    }
    if (!found) return; // entry แบบ update ไม่มี id → แค่สลับไปแท็บปกติ

    setHighlightId(found._id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2500);

    // best-effort scroll ไปการ์ดเป้าหมายหลังแท็บ render
    setTimeout(() => {
      try {
        const index = pool.findIndex((a) => a._id === found._id);
        if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
      } catch {
        // เลื่อนไม่ได้ก็ไม่เป็นไร
      }
    }, 200);
  }
```

- [ ] **Step 3: ผูก ref + กัน scrollToIndex error เข้ากับ FlatList ของนัดหมาย**

ที่ `<FlatList` หลัก (ของ list นัดหมาย ราวบรรทัด 198) เพิ่ม props:

```tsx
          ref={listRef}
          onScrollToIndexFailed={() => {}}
```

- [ ] **Step 4: ส่ง highlight ลง AppointmentCard**

ที่ `renderItem` ของ FlatList นัดหมาย เพิ่ม prop `highlighted`:

```tsx
            <AppointmentCard
              item={item}
              onScanRequest={onScanRequest}
              onOpenDetail={setDetailItem}
              selectMode={isLongTerm && selectMode}
              selected={selectedIds.has(item._id)}
              selectable={isLongTermCheckoutable(item)}
              onToggleSelect={toggleSelect}
              highlighted={item._id === highlightId}
            />
```

- [ ] **Step 5: รับ prop `highlighted` ใน AppointmentCard**

เพิ่ม `highlighted` ใน props ของ `AppointmentCard` (signature + type) และใส่ style:

ใน destructure props เพิ่ม `highlighted = false,` และใน type เพิ่ม `highlighted?: boolean;`

ที่ `<Wrapper style={[styles.card, ...]}>` เพิ่ม `highlighted && styles.cardHighlight,` เข้าไปใน array:

```tsx
      style={[
        styles.card,
        selectMode && !selectable && styles.cardDisabled,
        selected && styles.cardSelected,
        highlighted && styles.cardHighlight,
      ]}
```

- [ ] **Step 6: เชื่อม tap เข้ากับ HistoryRow**

แก้ `HistoryList` ให้รับ `onPressRow` แล้วส่งต่อ HistoryRow:
- ใน props ของ `HistoryList` เพิ่ม `onPressRow: (item: NotificationHistoryEntry) => void;`
- เปลี่ยน `renderItem` เป็น `<HistoryRow item={item} now={now} onPress={onPressRow} />`
- ใน `HistoryRow` เพิ่ม prop `onPress: (item: NotificationHistoryEntry) => void;` แล้วครอบด้วย TouchableOpacity:

เปลี่ยน root ของ `HistoryRow` จาก `<View style={[styles.historyCard, ...]}>` เป็น:

```tsx
    <TouchableOpacity
      style={[styles.historyCard, !item.read && styles.historyCardUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
```
และปิดท้ายด้วย `</TouchableOpacity>` แทน `</View>`

- ที่จุดเรียก `<HistoryList ... />` (Step 6 ของ Task 5) เพิ่ม prop `onPressRow={handleHistoryPress}`

- [ ] **Step 7: เพิ่ม style `cardHighlight`**

ใน StyleSheet เพิ่ม:

```ts
  cardHighlight: { borderWidth: 2, borderColor: "#f59e0b", backgroundColor: "#fffbeb" },
```

- [ ] **Step 8: ตรวจ type**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่

- [ ] **Step 9: Commit**

```bash
git add src/screens/NotificationScreen.tsx
git commit -m "feat: tap history entry to jump to and highlight related appointment"
```

---

### Task 7: badge ที่ bottom tab 🔔 (`App.tsx`)

**Files:**
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `subscribe`, `getUnreadCount` จาก `./src/utils/notificationHistory`
- Produces: จุดแดง + ตัวเลข unread มุมขวาบนแท็บ "แจ้งเตือน"

- [ ] **Step 1: เพิ่ม import**

เพิ่มหลัง import services อื่น (ราวบรรทัด 17):

```ts
import { getUnreadCount, subscribe } from "./src/utils/notificationHistory";
```

- [ ] **Step 2: ส่ง unreadCount เข้า TabBar**

ใน `MainApp` หลัง `const [fromNotification, setFromNotification] = useState(false);` เพิ่ม:

```ts
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const refresh = () => setUnread(getUnreadCount());
    refresh();
    return subscribe(refresh);
  }, []);
```

แก้ `<TabBar active={activeTab} onSelect={handleTabSelect} />` เป็น:

```tsx
      <TabBar active={activeTab} onSelect={handleTabSelect} unread={unread} />
```

> ต้อง import `useEffect`, `useState` — `App.tsx` import `useEffect, useState` อยู่แล้ว

- [ ] **Step 3: รับ `unread` ใน TabBar + แสดง badge**

แก้ signature ของ `TabBar`:

```tsx
function TabBar({
  active,
  onSelect,
  unread,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
  unread: number;
}) {
```

ในปุ่มแท็บ "notification" ครอบ icon ด้วย View relative แล้วเพิ่ม badge — แทนที่ `<Text style={styles.tabIcon}>🔔</Text>` ด้วย:

```tsx
        <View>
          <Text style={styles.tabIcon}>🔔</Text>
          {unread > 0 && (
            <View style={styles.tabBarBadge}>
              <Text style={styles.tabBarBadgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </View>
```

- [ ] **Step 4: เพิ่ม style badge**

ใน `StyleSheet.create({...})` เพิ่ม:

```ts
  tabBarBadge: {
    position: "absolute",
    top: -4,
    right: -10,
    backgroundColor: "#dc2626",
    borderRadius: 99,
    minWidth: 16,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignItems: "center",
  },
  tabBarBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
```

- [ ] **Step 5: ตรวจ type**

Run: `npx tsc --noEmit`
Expected: ไม่มี error ใหม่

- [ ] **Step 6: Commit**

```bash
git add App.tsx
git commit -m "feat: unread notification badge on bottom tab bar"
```

---

### Task 8: rebuild + manual verification บนเครื่อง

**Files:** — (ไม่มีไฟล์ใหม่ เป็นการ build + ทดสอบจริง)

- [ ] **Step 1: build APK ใหม่ (จำเป็นเพราะมี native dep ใหม่)**

Run: `npm run build:android`
Expected: build สำเร็จ ได้ APK

- [ ] **Step 2: ติดตั้งบนเครื่องแล้วทดสอบตามเช็คลิสต์**

- [ ] สร้างนัดหมายใหม่ของวันนี้ → push เด้ง → แท็บ "ประวัติ" มีรายการ 🆕 พร้อมจุดแดง
- [ ] badge ตัวเลขขึ้นที่แท็บ "ประวัติ" และที่ bottom tab 🔔
- [ ] เปิดแท็บ "ประวัติ" → badge ทั้งสองหายไป (mark read)
- [ ] แตะรายการที่มีนัดอยู่ในลิสต์ → สลับไปแท็บนั้น + การ์ดไฮไลต์สีเหลืองแวบ ~2.5 วิ
- [ ] แตะรายการที่นัดถูกเช็คเอาท์/หายแล้ว → ขึ้น Alert "ไม่พบนัดหมาย"
- [ ] ทำให้เกิด SSE update รัวๆ → รายการ 🔄 ไม่ซ้ำถี่ (dedupe 60 วิ)
- [ ] กด "ล้างประวัติทั้งหมด" → ยืนยัน → ลิสต์ว่าง + empty state
- [ ] ปิด-เปิดแอปใหม่ → ประวัติยังอยู่ (persist), รายการเก่าเกิน 7 วันหาย (prune)
- [ ] flow เดิม (สแกน/เช็คอิน/เช็คเอาท์/ลงทะเบียน) ยังทำงานปกติ

- [ ] **Step 3: (ถ้าทุกข้อผ่าน) Tag/บันทึกว่าพร้อม OTA งานต่อไป**

ไม่มี commit โค้ดเพิ่มใน task นี้ — เป็น gate ยืนยันก่อนปล่อยจริง
```
