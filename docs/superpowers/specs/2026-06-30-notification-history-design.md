# Notification History — Design Spec

วันที่: 2026-06-30
สถานะ: อนุมัติดีไซน์แล้ว (รอตรวจ spec)

## เป้าหมาย

เพิ่ม "ประวัติการแจ้งเตือน" — บันทึกทุก push ที่แอปเด้งจริง (นัดหมายใหม่วันนี้ + SSE update)
ลงเครื่อง เก็บย้อนหลัง 7 วัน ดูได้ในแท็บย่อยใหม่ในหน้าแจ้งเตือน พร้อมสถานะอ่าน/ยังไม่อ่าน,
badge นับจำนวน, ปุ่มล้างประวัติ, และแตะรายการเพื่อกระโดดไปนัดที่เกี่ยวข้อง

## ขอบเขต (ตกลงกับผู้ใช้)

- **เนื้อหา**: log push ที่แอปเด้ง (local, on-device) — ไม่แตะ server
- **ที่เก็บ**: AsyncStorage (`@react-native-async-storage/async-storage`) — dep ใหม่ ต้อง native rebuild 1 ครั้ง
- **ตำแหน่ง UI**: แท็บย่อยที่ 3 ในหน้าแจ้งเตือน ต่อจาก "ปกติ / ระยะยาว"
- **เก็บย้อนหลัง**: 7 วัน (prune ของเก่าทิ้งอัตโนมัติ)
- **ฟีเจอร์เสริม**: สถานะอ่าน/ยังไม่อ่าน + badge, ปุ่ม "ล้างประวัติทั้งหมด", แตะรายการ → ไปนัดที่เกี่ยว

## Non-goals (YAGNI)

- ไม่ดึงประวัติ/audit จาก server
- ไม่ sync ข้ามเครื่อง (เป็น local ต่อเครื่อง)
- ไม่มีการ filter/search ในเวอร์ชันนี้

---

## สถาปัตยกรรม (units)

### Unit 1 — `src/utils/notificationHistory.ts` (store ใหม่)

หัวใจของฟีเจอร์ จัดเก็บและจัดการ state ประวัติ

**Type**
```ts
type NotificationKind = "new-appointment" | "update";

interface NotificationHistoryEntry {
  id: string;            // unique (timestamp + counter/random)
  timestamp: number;     // epoch ms
  kind: NotificationKind;
  title: string;
  body: string;
  read: boolean;
  appointmentId?: string; // ใส่เมื่อ map ไปนัดเดียวได้
  tab?: "normal" | "longTerm"; // แท็บปลายทางเวลาแตะ
}
```

**API (impure shell)**
- `addHistoryEntry(input): Promise<void>` — สร้าง entry (read=false), dedupe, prune, persist, notify
- `getHistory(): Promise<NotificationHistoryEntry[]>` — newest first, prune > 7 วันก่อนคืน
- `markAllRead(): Promise<void>`
- `clearHistory(): Promise<void>`
- `getUnreadCount(): number` — อ่านจาก cache ใน memory (sync, ให้ badge เร็ว)
- `subscribe(listener: () => void): () => void` — คืน unsubscribe

**Pure helpers (แยกเทสต์ด้วย jest, node-only)**
- `pruneEntries(entries, now, maxAgeMs)` → ตัด entry ที่ `timestamp < now - maxAgeMs`
- `addEntryToList(list, entry, now)` → ใส่ entry ใหม่หัวลิสต์ + ใช้กฎ dedupe + prune
- `countUnread(entries)` → จำนวน `read === false`

**กฎ dedupe**: ถ้า entry หัวลิสต์เป็น `kind === "update"` และห่างจาก entry ใหม่ (ก็ update) ภายใน 60 วินาที
→ ไม่เพิ่มซ้ำ (กัน SSE ยิงรัว) `new-appointment` ไม่ dedupe

**Persistence**: AsyncStorage คีย์เดียว `notification_history` เก็บ JSON array
- มี in-memory cache + listener set → UI อัปเดตทันที, เขียน disk แบบ async
- โหลด cache ครั้งแรกแบบ lazy (hydrate) ตอน import/เรียกครั้งแรก

**Constant**: `MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000`, `UPDATE_DEDUPE_MS = 60 * 1000`

### Unit 2 — แก้ `src/utils/notificationService.ts` ให้มี chokepoint เดียว

- เพิ่ม internal `fireNotification({ title, body, kind, appointmentId, tab, badge })`
  - เรียก `Notifications.scheduleNotificationAsync(...)` (เด้ง push เหมือนเดิม)
  - เรียก `addHistoryEntry({ title, body, kind, appointmentId, tab })` (best-effort, catch เงียบ)
- `notifyNow(title, body)` → ผ่าน `fireNotification` ด้วย `kind: "update"`
- `checkAndNotify()`:
  - 1 รายการใหม่ → `fireNotification({ kind: "new-appointment", appointmentId: a._id, tab: "normal", ... })`
  - >1 รายการ → `fireNotification({ kind: "new-appointment", tab: "normal", ... })` (ไม่มี appointmentId เดียว)
- ทำงานใน background task ได้ (AsyncStorage ใช้ headless ได้)

> หมายเหตุ: นัดระยะยาวยังไม่มี push เฉพาะของตัวเอง (เด้งผ่าน SSE update รวม) จึง map tab="normal"
> เป็นค่าเริ่มต้นของ new-appointment; entry แบบ update ไม่มี appointmentId/tab → แตะแล้วไปแท็บปกติ

### Unit 3 — UI sub-tab "ประวัติ" ใน `NotificationScreen.tsx`

- เพิ่ม `AppointmentTab` ค่าใหม่ `"history"` → แท็บที่ 3 "ประวัติ"
- subscribe `notificationHistory` → state `history` + `unreadCount`
- เปิดแท็บประวัติ → `markAllRead()` (เคลียร์ badge ทั้ง sub-tab และ bottom tab)
- label แท็บโชว์ count ยังไม่อ่าน เช่น "ประวัติ (3)" / จุดแดงเมื่อ > 0
- รายการแต่ละอัน: icon ตาม kind (🆕 / 🔄), title, body, เวลาแบบ relative ("เมื่อสักครู่", "10 นาทีที่แล้ว", หรือ วัน/เวลา), จุดแดงถ้า `!read`
- ปุ่ม "ล้างประวัติทั้งหมด" บน select bar ของแท็บประวัติ → `Alert.alert` ยืนยัน → `clearHistory()`
- empty state: "ยังไม่มีประวัติการแจ้งเตือน"

**แตะรายการ (navigate to related)**
- ถ้า `appointmentId` มี และเจอใน `todayAppointments`/`longTermAppointments` (ตาม `tab` หรือค้นทั้งคู่):
  - `setActiveTab(tab)` แล้วตั้ง `highlightId` → การ์ดเป้าหมายไฮไลต์ (border เหลืองอำพัน `#f59e0b` — แยกจากสีเขียวของการ์ดที่ถูกเลือก) ~2.5 วินาที แล้วล้าง
  - best-effort scroll ไปการ์ดนั้น (FlatList ref + scrollToIndex; ล้มเหลวก็ไม่เป็นไร)
- ถ้าไม่พบ (เช็คเอาท์ไป/คนละวันแล้ว): `setActiveTab(tab ?? "normal")` + `Alert` "ไม่พบนัดหมายนี้ในรายการแล้ว"
- entry แบบ update (ไม่มี id): สลับไปแท็บ "ปกติ" เฉยๆ

### Unit 4 — badge ที่ bottom tab 🔔 ใน `App.tsx`

- subscribe `notificationHistory` ใน `MainApp` → state `unreadCount`
- โชว์จุดแดง + ตัวเลขมุมขวาบนของแท็บ 🔔 เมื่อ `unreadCount > 0`

---

## Data flow

```
push (นัดใหม่ / SSE update)
  └─ fireNotification()
       ├─ scheduleNotificationAsync()       // เด้ง push
       └─ addHistoryEntry()                 // dedupe + prune + persist + notify
            ├─ NotificationScreen  (แท็บประวัติ + count)
            └─ App.tsx             (badge bottom tab)

เปิดแท็บประวัติ → markAllRead() → badge หาย
แตะรายการ → หา appointmentId → สลับแท็บ + ไฮไลต์ / หรือแจ้งไม่พบ
ปุ่มล้าง → clearHistory()
ทุกการอ่าน/เขียน → prune > 7 วัน
```

## Error handling

- AsyncStorage อ่าน/เขียน fail → catch เงียบ; history เป็น best-effort ไม่ทำให้ push พัง
- JSON parse เสีย → คืน `[]` (แนวเดียวกับ `getSeenIds` เดิม)
- `addHistoryEntry` ที่เรียกจาก `fireNotification` ครอบ try/catch — push ต้องเด้งได้เสมอแม้ log fail

## Testing

jest (node-only, pure functions):
- `pruneEntries`: ตัด > 7 วัน, เก็บ ≤ 7 วัน, ขอบเขตพอดี
- `addEntryToList`: ใส่หัวลิสต์, dedupe update ภายใน 60 วิ, ไม่ dedupe new-appointment, ไม่ dedupe update เกิน 60 วิ
- `countUnread`: นับ read=false ถูกต้อง

## ผลกระทบ / ขั้นตอน deploy

- เพิ่ม dep `@react-native-async-storage/async-storage` → **ต้อง native rebuild (gradlew) 1 ครั้ง**
- หลังจากนั้นแก้ logic ประวัติเป็น JS ล้วน → ส่งผ่าน OTA (`expo-updates`) ได้
- ไม่กระทบ flow เดิม (scan/checkout/walk-in) — เพิ่มอย่างเดียว ไม่แก้พฤติกรรมเก่า

## ไฟล์ที่เกี่ยวข้อง

- ใหม่: `src/utils/notificationHistory.ts`, `src/utils/notificationHistory.test.ts`
- แก้: `src/utils/notificationService.ts`, `src/screens/NotificationScreen.tsx`, `App.tsx`, `package.json`
