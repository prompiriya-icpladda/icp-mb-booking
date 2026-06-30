# นัดหมายปกติ: เสร็จสิ้นในแอป + หายเองอัตโนมัติหลัง 1 ชม.

- **Date:** 2026-06-30
- **Status:** Approved design — ready for implementation plan
- **Repos touched:** `ICPBooking` (server) **และ** `icp-mb-booking` (mobile)

## สรุป (Thai)

ต่อยอดจากฝั่ง long-term ([detail + per-card checkout](2026-06-30-longterm-visitor-detail-checkout-design.md))
มาทำให้ **"นัดหมายปกติ" (single-use)** มี lifecycle ปิดงานครบวงจรในแอป รปภ.

flow ที่ต้องการ:
1. รปภ. สแกน QR → `checkedInAt` ถูกตั้ง → การ์ด "เช็คอินแล้ว"
2. **host กด "เสร็จสิ้น" ใน LINE** → `completedAt` ถูกตั้ง → ยิง SSE → แอปเด้งแจ้งเตือน
   (ทำงานอยู่แล้ว) → การ์ดเปลี่ยนเป็นสถานะ **"เสร็จสิ้น"**
3. **รปภ. แตะการ์ด "เสร็จสิ้น" → เปิดหน้ารายละเอียด → กด "เสร็จสิ้น"** → รายการ**หายจากแอป**
4. ถ้า รปภ. **ไม่กด** → ครบ **1 ชม. นับจาก `completedAt`** → job ฝั่ง server เคลียร์ให้เอง
   (`clearedAt` ถูกตั้ง อัตโนมัติ) → ยิง SSE → รายการหายจากแอป

ปัจจุบันฝั่งนัดหมายปกติ **ยังไม่มี** พฤติกรรมนี้: การ์ดปกติแตะแล้วไปสแกน, ไม่มีหน้ารายละเอียด/
ปุ่มเสร็จสิ้นในแอป, `/today` คืนทุกรายการของวันโดยไม่กรอง `completedAt` ออก → รายการที่เสร็จแล้ว
ค้างในลิสต์ ไม่หายเอง

## Decisions ที่อนุมัติแล้ว

| ประเด็น | ผล |
|---|---|
| ทำฟีเจอร์นี้กับนัดหมายปกติ | **ใช่** — build |
| ตัวจับเวลา 1 ชม. นับจาก | **`completedAt`** (host กดเสร็จสิ้นใน LINE) |
| ปุ่ม "เสร็จสิ้น" ในแอป โผล่เมื่อ | **เฉพาะหลัง host กด** (มี `completedAt` แล้วเท่านั้น) |
| รายการที่ host ไม่เคยกดเสร็จสิ้น | **ค้างไว้** เป็น "เช็คอินแล้ว" (ยอมรับได้ — ไม่มี fallback) |
| กลไก "หายเองหลัง 1 ชม." | **ทาง B — job ตั้งเวลา** (`setInterval` 60 วิ ตามแบบ `scanHrDelivered`) |
| countdown บนการ์ด | **ไม่ต้อง** — แค่ badge "เสร็จสิ้น" |
| หน้า detail | **ไฟล์ใหม่** `NormalDetailScreen.tsx` (ไม่ generalize รวม long-term) |

## สถาปัตยกรรม (บริบทปัจจุบัน)

- **Mobile** `NotificationScreen` แท็บ "นัดหมายปกติ" ดึงผ่าน `checkAndNotify()` →
  `getTodayAppointments()` → `GET /today` แล้วกรอง `qrMode !== "long-term"` ฝั่ง client
- การแจ้งเตือนเมื่อ host กดเสร็จสิ้น **ทำงานอยู่แล้ว**: server `POST /:id/complete` →
  `broadcastAppointment` (SSE) → mobile `useAppointmentStream` → `notifyNow("🔔 มีการอัปเดต…")`
  + `fetchAppointments()` → ไม่ต้องแก้ส่วนนี้
- **Server** มี idiom สำหรับ background scan อยู่แล้ว: route module export ฟังก์ชัน `scan…()` →
  `server.js` เรียกตอน boot + `setInterval(fn, 60*1000)` + ผูกเข้า `POST /api/scan`
  (ป้องกัน Render free tier หลับ). precedent ที่ใกล้ที่สุด:
  `hrRequestRoutes.scanHrDelivered` — "คำขอที่อนุมัติผ่านมา ≥ 1 ชม. → เปลี่ยน label อัตโนมัติ"
- หน้า detail เดิม render เป็น full-screen `Modal` จาก `NotificationScreen`
  (เจ้าของข้อมูล + refresh) — ใช้ pattern เดียวกัน สลับ component ตาม `qrMode`

## Data model — `ICPBooking/server/model/VisitorAppointment.js`

เพิ่ม 2 ฟิลด์:

```js
clearedAt: { type: Date, default: null },   // เวลาที่เอารายการออกจากลิสต์แอป
clearedBy: { type: String, default: "" },   // "guard" (รปภ.กด) | "auto" (job 1 ชม.)
```

- `completedAt` คงเดิม (host กดเสร็จสิ้นใน LINE = ปิดงาน)
- `clearedBy` ไว้แยกเคส manual vs auto เผื่อหน้าประวัติในอนาคต (ต้นทุนต่ำ)
- เรกคอร์ดเก่าไม่มีฟิลด์นี้ → query `{ clearedAt: null }` ของ MongoDB **match ทั้ง null และ
  field ที่หายไป** → ปลอดภัยกับข้อมูลเดิม

## Server — รายละเอียดการเปลี่ยนแปลง (`ICPBooking`)

### A) `GET /today` — กรอง cleared ออก + ส่ง field สถานะมาด้วย
`routes/visitor-appointments.js` (≈ บรรทัด 205–217)

- เพิ่ม `clearedAt: null` ใน filter:
  ```js
  VisitorAppointment.find({ appointmentDate: today, deletedAt: null, clearedAt: null })
  ```
- เพิ่ม `completedAt clearedAt` ใน `.select(...)` → mobile รู้ว่าการ์ดไหน "เสร็จสิ้น"
  และกดเคลียร์ได้
- ผล: รายการ completed-แต่ยังไม่ครบ-1ชม. **ยังโชว์** (ให้ รปภ. กดเคลียร์ได้);
  ที่ `clearedAt` ถูกตั้งแล้ว (manual หรือ auto) **หลุดออก**

### B) `POST /:id/clear` — รปภ. กดเสร็จสิ้นในแอป (endpoint ใหม่)

```
POST /api/visitor-appointments/:id/clear
```
ลำดับ:
1. หา record (`deletedAt: null`) — ไม่เจอ → 404
2. ต้องเป็น `qrMode === "single-use"` — ไม่ใช่ → 400 ("รองรับเฉพาะนัดหมายปกติ")
   (กันเผลอ clear long-term ซึ่งใช้ lifecycle คนละแบบ)
3. ต้องมี `completedAt` — ไม่มี → 400 ("ยังไม่เสร็จสิ้น เคลียร์ไม่ได้")
   → บังคับกติกา "เฉพาะหลัง host กด"
4. ถ้ายังไม่มี `clearedAt`: ตั้ง `clearedAt = new Date()`, `clearedBy = "guard"`,
   `save()`, `broadcastAppointment(record)` (idempotent — กดซ้ำ/ชนกับ job ไม่พัง)
5. คืน `{ success: true, cleared: true, visitorName }`

### C) `scanVisitorAppointmentsAutoClear()` — job 1 ชม. (export ใหม่)

ใน `routes/visitor-appointments.js` ทำตามแบบ `scanHrDelivered`:

```js
const AUTO_CLEAR_AFTER_MS = require("../utils/visitor-appointment-core").AUTO_CLEAR_AFTER_MS;

async function scanVisitorAppointmentsAutoClear() {
  const cutoff = new Date(Date.now() - AUTO_CLEAR_AFTER_MS);
  const candidates = await VisitorAppointment.find({
    qrMode: "single-use",
    deletedAt: null,
    clearedAt: null,
    completedAt: { $ne: null, $lte: cutoff },   // $ne:null สำคัญ — กัน BSON null <= date
  });
  let count = 0;
  for (const record of candidates) {
    record.clearedAt = new Date();
    record.clearedBy = "auto";
    await record.save();
    broadcastAppointment(record);               // ให้แอปเอาออกแบบสดๆ
    count++;
  }
  return count;
}

module.exports = router;
module.exports.scanVisitorAppointmentsAutoClear = scanVisitorAppointmentsAutoClear;
```

> **หมายเหตุ BSON null:** ใน MongoDB การเทียบ `{$lte: someDate}` จะ match ค่า `null` ด้วย
> (null อยู่ก่อน Date ในลำดับ BSON) — จึง **ต้องมี `$ne: null`** ไม่งั้น record ที่ host
> ยังไม่กดเสร็จสิ้นจะโดน auto-clear ผิด

### D) Pure predicate ใน `utils/visitor-appointment-core.js` (เทสได้)

แยกเกณฑ์เวลาออกเป็น pure function + const (ให้ unit test ด้วย vitest):

```js
const AUTO_CLEAR_AFTER_MS = 60 * 60 * 1000; // 1 ชม.

// auto-clear เมื่อ: single-use + completed + ยังไม่ cleared + completedAt ผ่านมา ≥ 1 ชม.
function shouldAutoClear(record, now = Date.now()) {
  if (!record || record.qrMode !== "single-use") return false;
  if (record.clearedAt) return false;
  if (!record.completedAt) return false;
  return now - new Date(record.completedAt).getTime() >= AUTO_CLEAR_AFTER_MS;
}

module.exports = { /* ...ของเดิม..., */ AUTO_CLEAR_AFTER_MS, shouldAutoClear };
```

(job ใน C ใช้ query กรองหยาบ แล้ว/หรือ ตรวจ `shouldAutoClear` ซ้ำได้ — predicate เป็น
แหล่งความจริงของเกณฑ์เวลาและเป็นตัวที่เทส)

### E) Wire ใน `server.js`

ตามบล็อก scan เดิม (≈ บรรทัด 282–292):

```js
// นัดหมายปกติที่ "เสร็จสิ้น" (host กดใน LINE) ผ่านมา ≥ 1 ชม. → เคลียร์ออกจากลิสต์แอปอัตโนมัติ
if (typeof visitorAppointmentRoutes.scanVisitorAppointmentsAutoClear === "function") {
  visitorAppointmentRoutes.scanVisitorAppointmentsAutoClear();
  setInterval(() => visitorAppointmentRoutes.scanVisitorAppointmentsAutoClear(), 60 * 1000);
}
```

และเพิ่มใน `POST /api/scan` (belt-and-suspenders กัน Render หลับ):
```js
if (typeof visitorAppointmentRoutes.scanVisitorAppointmentsAutoClear === "function") {
  results.visitorAutoCleared = await visitorAppointmentRoutes.scanVisitorAppointmentsAutoClear();
}
```
(ต้องมั่นใจว่า `server.js` import router นี้ไว้ในชื่อตัวแปรที่อ้างถึงได้ — ปัจจุบัน mount ที่
`/api/visitor-appointments`; ใช้ตัวแปร require เดิม)

## Mobile — รายละเอียดการเปลี่ยนแปลง (`icp-mb-booking`)

### F) `src/services/api.ts` — field + helper + endpoint

- `TodayAppointment`: เพิ่ม `clearedAt?: string | null;` (`completedAt?` มีแล้ว)
- pure helpers (เทสได้ในชุดเดิม node + ts-jest):
  ```ts
  export type NormalStatus = "pending" | "checked-in" | "completed";

  // สถานะนัดหมายปกติ (cleared แล้วไม่อยู่ในลิสต์ จึงไม่ต้อง derive)
  export function normalStatus(
    a: Pick<TodayAppointment, "checkedInAt" | "completedAt">,
  ): NormalStatus {
    if (a.completedAt) return "completed";
    if (a.checkedInAt) return "checked-in";
    return "pending";
  }

  // กดเคลียร์ในแอปได้เมื่อ: เสร็จสิ้นแล้ว (host กด) และยังไม่ถูกเคลียร์
  export function isNormalClearable(
    a: Pick<TodayAppointment, "completedAt" | "clearedAt" | "qrMode">,
  ): boolean {
    return a.qrMode !== "long-term" && !!a.completedAt && !a.clearedAt;
  }

  export type NormalCardAction = "detail" | "scan";
  // แตะการ์ดปกติ: เสร็จสิ้นแล้ว → เปิดรายละเอียด; ไม่งั้น → สแกน (เดิม)
  export function normalCardAction(
    a: Pick<TodayAppointment, "completedAt" | "clearedAt" | "qrMode">,
  ): NormalCardAction {
    return isNormalClearable(a) ? "detail" : "scan";
  }
  ```
- เพิ่ม API call:
  ```ts
  export async function clearAppointment(id: string): Promise<CheckoutResult> {
    const res = await fetch(`${API_URL}/visitor-appointments/${id}/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    return parseJsonResponse<CheckoutResult>(res);
  }
  ```
  (reuse `CheckoutResult` หรือเพิ่ม type เล็กๆ ก็ได้ — มี `success`/`error` พอ)

### G) `src/screens/NormalDetailScreen.tsx` (ไฟล์ใหม่)

mirror โครงของ `LongTermDetailScreen` แต่:
- **Props:** `{ appointment, onBack, onCleared }`
- badge สถานะ "เสร็จสิ้น" (เขียว)
- แถวข้อมูล (เฉพาะที่มีค่า): เวลานัด (`appointmentTime`), จุดประสงค์ (`purpose`),
  จำนวน (`visitorCount` เมื่อ > 1), ทะเบียนรถ (`licensePlate` เมื่อ `hasVehicle`),
  มาพบ (`createdByName`), เช็คอินเมื่อ (`checkedInAt`), เสร็จสิ้นเมื่อ (`completedAt`)
- ปุ่มล่าง **"เสร็จสิ้น (เคลียร์รายการ)"**:
  - กด → disabled + spinner → `await clearAppointment(appointment._id)`
  - `res.success` → `onCleared()` (parent ปิด modal + `fetchAppointments()`)
  - ไม่สำเร็จ/throw → `Alert.alert("ไม่สำเร็จ", …)` คงหน้าเดิม
- ไม่มี confirmation popup (กดปุ่มเดียวจบ ตาม pattern long-term)

### H) `src/screens/NotificationScreen.tsx`

- `AppointmentCard` — การ์ดปกติ (single-use):
  - badge: ใช้ `normalStatus(item)` → `"completed"` โชว์ "เสร็จสิ้น" (สีเทา/เขียว),
    `"checked-in"` → "เช็คอินแล้ว", `"pending"` → "รอเช็คอิน"
  - แตะ: `normalCardAction(item)` → `"detail"` → `onOpenDetail(item)` (hint `› ดูรายละเอียด`);
    `"scan"` → `onScanRequest` เฉพาะตอนยังไม่เช็คอิน (คงพฤติกรรมเดิม)
- Modal detail เดิม: เลือก component ตาม `qrMode`
  ```tsx
  {detailItem && (detailItem.qrMode === "long-term" ? (
    <LongTermDetailScreen appointment={detailItem} onBack={…} onCheckedOut={…} />
  ) : (
    <NormalDetailScreen
      appointment={detailItem}
      onBack={() => setDetailItem(null)}
      onCleared={() => { setDetailItem(null); fetchAppointments(); }}
    />
  ))}
  ```
- ใช้ `setDetailItem` ตัวเดิม (มีอยู่แล้ว) — ส่งให้การ์ดปกติด้วย

## Data flow

**Host เสร็จสิ้น → รปภ. เคลียร์เอง:**
1. host กด "เสร็จสิ้น" ใน LINE → `POST /:id/complete` → `completedAt = now` → SSE
2. แอปเด้งแจ้งเตือน + refetch → การ์ดเป็น "เสร็จสิ้น" แตะได้
3. แตะ → `NormalDetailScreen` → กด "เสร็จสิ้น" → `POST /:id/clear` → `clearedAt = now`,
   `clearedBy = "guard"` → SSE
4. `onCleared` → ปิด modal + refetch → `/today` ไม่คืนแล้ว → การ์ดหาย

**Host เสร็จสิ้น → รปภ. ไม่กด → auto 1 ชม.:**
1–2 เหมือนข้างบน
3. ครบ 1 ชม.: job (`setInterval` 60 วิ) เจอ record → `clearedAt = now`, `clearedBy = "auto"`
   → SSE
4. แอป (SSE/interval 10 นาที/pull-refresh) refetch → `/today` ไม่คืน → การ์ดหายเอง

## Error handling / edge cases

- **host ไม่เคยกดเสร็จสิ้น:** `completedAt` ว่าง → ไม่เข้าเกณฑ์ auto-clear, ปุ่มในแอปไม่โผล่ →
  ค้างเป็น "เช็คอินแล้ว" (ยอมรับได้ตาม decision)
- **กด clear ชนกับ job auto (race):** endpoint idempotent — เช็ค `!clearedAt` ก่อนเขียน;
  ถ้าโดน auto ไปก่อน server ก็คืน success (ไม่ทับ `clearedBy`) ไม่พัง
- **clear record ที่ยังไม่ completed:** server 400 → แต่ UI ไม่เปิดปุ่มให้อยู่แล้ว
- **clear long-term หลุดมา:** server 400 (`qrMode !== "single-use"`)
- **เคลียร์แล้ว/หายระหว่างเปิด modal:** กดแล้ว server คืน success/หรือ error → refetch สะท้อนจริง
- **Android back ใน modal:** `Modal onRequestClose` → ปิดหน้า (เท่ากับ "กลับ")
- **BSON null ใน job query:** ต้องมี `$ne: null` (ดู C) — มี test ครอบ
- **Render หลับ:** `POST /api/scan` ครอบ job ด้วย → GH Actions ping ยังเรียกได้

## Testing

### Server (vitest — `*.test.js` ข้าง core)
- `shouldAutoClear(record, now)`:
  - single-use + completed + completedAt ≥ 1ชม. + ยังไม่ cleared → `true`
  - completedAt < 1ชม. → `false`
  - ไม่มี completedAt → `false` (กัน null-comparison)
  - มี `clearedAt` แล้ว → `false`
  - `qrMode: "long-term"` → `false`
  - boundary: ครบ 1ชม. พอดี (`=== AUTO_CLEAR_AFTER_MS`) → `true`
- (ถ้าเทส route ได้) guard ของ `POST /:id/clear`: ไม่มี completedAt → 400;
  long-term → 400; completed → success + ตั้ง clearedAt/clearedBy

### Mobile (jest, pure-fn — เพิ่มใน `src/services/api.test.ts`)
- `normalStatus`: completed / checked-in / pending ตาม timestamp
- `isNormalClearable`: completed+ยังไม่ cleared → true; ไม่มี completedAt → false;
  มี clearedAt → false; long-term → false
- `normalCardAction`: clearable → "detail"; ไม่งั้น → "scan"

### Manual / device verification
- host กดเสร็จสิ้นใน LINE → แอปเด้งแจ้งเตือน + การ์ดเป็น "เสร็จสิ้น"
- แตะการ์ด "เสร็จสิ้น" → เปิดรายละเอียด ครบ → กด "เสร็จสิ้น" → กลับ การ์ดหาย
- ไม่กด รอ > 1 ชม. (หรือลดค่า const ชั่วคราว) → การ์ดหายเอง
- regression: การ์ด "รอเช็คอิน"/"เช็คอินแล้ว" แตะ = สแกนเหมือนเดิม; long-term ไม่กระทบ
- `npx tsc --noEmit` ผ่าน (baseline expo errors เดิมยอมรับได้)

## Out of scope / future

- ไม่มี fallback auto-clear สำหรับรายการที่ host ไม่กดเสร็จสิ้น (ค้างตามตั้งใจ)
- ไม่มี countdown บนการ์ด
- ไม่ generalize หน้า detail (long-term/normal แยกไฟล์)
- ไม่ทำหน้าประวัติรายการที่เคลียร์แล้ว (เก็บ `clearedBy` ไว้รองรับภายหลัง)
- ข้อความแจ้งเตือน SSE ยังเป็นแบบ generic (ไม่ทำข้อความเฉพาะ "เสร็จสิ้น")
- ค่า 1 ชม. เป็น const ในโค้ด (ยังไม่ทำเป็น env/ตั้งค่าได้)
