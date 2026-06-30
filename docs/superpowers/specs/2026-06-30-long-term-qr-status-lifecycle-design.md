# Long-term QR status lifecycle: ลงทะเบียน → มาแล้ว → เช็คเอาท์

- **Date:** 2026-06-30
- **Status:** Approved design — ready for implementation plan
- **Repos touched:** `ICPBooking` (server) + `icp-mb-booking` (mobile)

## สรุป (Thai)

QR ระยะยาว (long-term) วันนี้ พอลงทะเบียน walk-in จากมือถือ server จะเซ็ต `checkedInAt: now`
ทันที (= "มาแล้ว") และส่ง LINE แจ้ง host ทันทีตอนลงทะเบียน ส่วนการ์ดในแอป (แท็บ "ระยะยาว")
โชว์แค่ badge "ระยะยาว" นิ่งๆ ไม่มีสถานะ

ต้องการ: ให้ QR ระยะยาวมี **วงจรสถานะเดินหน้าทางเดียว**
1. **ลงทะเบียนครั้งแรก → "ลงทะเบียน"** (ยังไม่ใช่ "มาแล้ว")
2. **สแกน → "มาแล้ว"** + ถ้ามี host ส่ง LINE หา host (คนที่มาหา)
3. **ออก → "เช็คเอาท์"** — สำหรับ rider/แม่ค้า (ไม่มี host) กดเช็คเอาท์ในแอปได้เลย
   ไม่ต้องสแกน และเลือกได้หลายรายการพร้อมกัน

"ลงทะเบียน" ไม่ย้อนกลับ: ตอนมา = สแกนเสมอ (ทั้งมี/ไม่มี host), ตอนออก = เช็คเอาท์

## โมเดลสถานะ (derive จาก timestamp เดิม — ไม่เพิ่ม field ใน DB)

`VisitorAppointment` มี `checkedInAt: Date|null` และ `completedAt: Date|null` อยู่แล้ว
สถานะ long-term ทั้งหมด derive จากสองค่านี้:

| สถานะ | เงื่อนไข | badge |
|---|---|---|
| **ลงทะเบียน** (registered) | `checkedInAt == null` | เทา |
| **มาแล้ว** (arrived) | `checkedInAt != null` && `completedAt == null` | เขียว |
| **เช็คเอาท์** (checked out) | `completedAt != null` | เทาเข้ม |

ลำดับ derive: ดู `completedAt` ก่อน → ถ้ามีคือ "เช็คเอาท์"; ไม่งั้นดู `checkedInAt` →
มีคือ "มาแล้ว", ไม่มีคือ "ลงทะเบียน"

**Reuse / สแกนซ้ำ:** endpoint `POST /:id/checkin` ปัจจุบันล้าง `completedAt = null` ทุกครั้งที่
สแกน long-term (โค้ดเดิม "มาใหม่ = เริ่มรอบใหม่") → หลังเช็คเอาท์แล้วสแกนอีก จะกลับเป็น
"มาแล้ว" รอบใหม่ ไม่กลับไป "ลงทะเบียน" — สอดคล้องกับ "ลงทะเบียนไม่กลับมา"

## Existing building blocks ที่ reuse (ไม่สร้างใหม่)

- `POST /api/visitor-appointments/:id/checkin` — สแกนแล้วเซ็ต `checkedInAt = now`,
  ล้าง `completedAt` (long-term), เรียก `notifyCreator(record)`. **ใช้ได้เลย ไม่แก้**
- `notifyCreator(record)` — ส่ง flex "🔔 ผู้มาเยือนมาถึงแล้ว" ไปที่ `createdByUserId`.
  สำหรับ walk-in `createdByUserId` คือ host → **host ได้ LINE ตอนสแกนอยู่แล้ว** (ข้อ 2)
- `POST /api/visitor-appointments/:id/checkout` — เซ็ต `completedAt = now`,
  จำกัดเฉพาะ `rider`/`merchant` (คืน 400 ถ้าเป็นชนิดอื่น). **ใช้ได้เลย ไม่แก้**
- `checkoutAppointment(id)` ใน `src/services/api.ts` — เรียก endpoint ข้างบนอยู่แล้ว
- การออก QR ในแอป + ส่ง QR เข้า LINE dev (`sendLongTermQrToDevs`) — ไม่ขึ้นกับ `checkedInAt`
  จึงไม่กระทบ

## รายละเอียดการเปลี่ยนแปลง

### A) Server — `ICPBooking/server` (แก้ 2 จุดเล็ก)

**A1. `routes/walk-in-visitors.js`** — long-term ลงทะเบียนเป็น "ลงทะเบียน" ไม่ใช่ "มาแล้ว"

ปัจจุบัน (≈ บรรทัด 208–245):
- บรรทัด ~232 `checkedInAt: now` ในการ `VisitorAppointment.create({...})` — เซ็ตทันทีทุกชนิด
- บรรทัด ~235–245 `if (resolved.host?.lineId) { pushMessage(...) }` — ส่ง host "arrived" flex
  ทันทีตอนลงทะเบียน

เปลี่ยนเป็น (เฉพาะ long-term; single-use คงเดิมทุกอย่าง):
- คำนวณค่าเริ่มต้น: `const initialCheckedInAt = normalizedQrMode === "long-term" ? null : now;`
  แล้วใช้ `checkedInAt: initialCheckedInAt` ใน create
- ส่ง host flex ตอนลงทะเบียน **เฉพาะ single-use**:
  เปลี่ยนเงื่อนไขเป็น `if (resolved.host?.lineId && normalizedQrMode !== "long-term") { ... }`
  → long-term host จะได้รับ flex ตอนสแกน (ผ่าน `notifyCreator`) แทน
- `sendLongTermQrToDevs(record)` คงเดิม (ยังส่ง QR ให้ dev ตอนลงทะเบียน)

**A2. `routes/visitor-appointments.js`** — long-term list ต้องคืน `completedAt`

GET `/long-term` (≈ บรรทัด 231) `.select(...)` ปัจจุบันมี `checkedInAt` แต่ไม่มี `completedAt`
→ เพิ่ม `completedAt` เข้าไปใน select string เพื่อให้ mobile derive 3 สถานะได้

**ไม่แก้:** endpoint `checkin`, `checkout`, model `VisitorAppointment`

### B) Mobile — `icp-mb-booking`

**B1. `src/services/api.ts`**

- `interface TodayAppointment`: เพิ่ม
  - `completedAt: string | null;`
  - `visitorType?: VisitorType;` (long-term list คืนค่านี้อยู่แล้ว แต่ interface ยังไม่ประกาศ —
    ใช้ตัดสินว่าเลือกเช็คเอาท์ได้ไหม)
- เพิ่ม helper อนุมานสถานะ (export):
  ```ts
  export type LongTermStatus = "registered" | "arrived" | "checked-out";
  export function longTermStatus(a: Pick<TodayAppointment, "checkedInAt" | "completedAt">): LongTermStatus {
    if (a.completedAt) return "checked-out";
    if (a.checkedInAt) return "arrived";
    return "registered";
  }
  ```
- `checkoutAppointment(id)` มีอยู่แล้ว — ใช้ตามเดิม

**B2. `src/screens/NotificationScreen.tsx`** (แท็บ "ระยะยาว")

สถานะ badge:
- การ์ด long-term โชว์ badge ตาม `longTermStatus(item)`:
  - registered → "ลงทะเบียน" (เทา)
  - arrived → "มาแล้ว" (เขียว)
  - checked-out → "เช็คเอาท์" (เทาเข้ม)
- แทน badge "ระยะยาว" นิ่งๆ เดิม (label "ระยะยาว" ย้ายไปเป็น pill/ข้อความรองได้ถ้าต้องการ)

โหมดเลือกเช็คเอาท์หลายรายการ (เฉพาะแท็บระยะยาว):
- state ใหม่ใน `NotificationScreen`: `selectMode: boolean`, `selectedIds: Set<string>`
- ปุ่ม "เลือกเช็คเอาท์" ในส่วนหัวของแท็บระยะยาว → เข้า `selectMode`
- ใน `selectMode`:
  - แตะการ์ด = toggle เลือก (แทนการสแกน)
  - **เลือกได้เฉพาะ** การ์ดที่ `visitorType` เป็น `rider`/`merchant` **และ** สถานะ = "มาแล้ว"
    (การ์ดอื่น disabled/กดไม่ติด)
  - แถบล่าง (action bar): ปุ่ม "เช็คเอาท์ที่เลือก (n)" + ปุ่ม "ยกเลิก"
  - กดยืนยัน → `Promise.allSettled(selected.map(id => checkoutAppointment(id)))` →
    `fetchAppointments()` refresh → ออกจาก `selectMode`, ล้าง `selectedIds`
- โหมดปกติ (ไม่ใช่ selectMode): แตะการ์ด = สแกน (`onScanRequest`) เหมือนเดิม

หมายเหตุ UI: badge เลือก (checkmark) แสดงเฉพาะการ์ดที่เลือกได้; การ์ดที่เลือกไม่ได้ทำให้จาง
หรือซ่อน checkmark เพื่อให้ รปภ. เห็นว่ากดไม่ได้

## Data flow

**ลงทะเบียน (mobile walk-in, long-term):**
1. WalkInScreen → `POST /api/walk-in-visitors` (`qrMode: "long-term"`)
2. Server สร้าง record ด้วย `checkedInAt: null` (status = "ลงทะเบียน"), **ไม่ส่ง** host flex,
   ส่ง QR ให้ dev (`sendLongTermQrToDevs`)
3. แอปโชว์ QR modal + การ์ดในแท็บระยะยาวขึ้นสถานะ "ลงทะเบียน"

**มาถึง (สแกน — ทุกชนิด มี/ไม่มี host):**
1. รปภ. สแกน QR → `POST /api/visitor-appointments/:id/checkin`
2. Server เซ็ต `checkedInAt = now`, ล้าง `completedAt`, `notifyCreator` → ถ้ามี host
   (walk-in: host = creator) → host ได้ LINE "มาแล้ว"
3. การ์ดเปลี่ยนเป็น "มาแล้ว" (เขียว)

**ออก (rider/แม่ค้า, ในแอป):**
1. แท็บระยะยาว → "เลือกเช็คเอาท์" → เลือกหลายใบ (rider/merchant ที่ "มาแล้ว") → ยืนยัน
2. แอปเรียก `checkoutAppointment(id)` ต่อใบ → server เซ็ต `completedAt = now`
3. การ์ดเปลี่ยนเป็น "เช็คเอาท์"; แบบมี host ใช้ host กด "เสร็จสิ้น" ใน LINE เหมือนเดิม

## Error handling / edge cases

- `checkout` กับ record ที่ไม่ใช่ rider/merchant → server คืน 400 (มีอยู่แล้ว); UI กันไว้ตั้งแต่
  ตอนเลือก จึงไม่ควรไปถึง
- เช็คเอาท์หลายใบ: ใช้ `Promise.allSettled` — ใบที่ fail ไม่ทำให้ทั้งชุดล้ม; refresh แล้วสถานะจริง
  สะท้อนผลเอง
- field `completedAt` ไม่มา (server build เก่ายังไม่ deploy) → `longTermStatus` ตกเป็น
  "registered"/"arrived" ตาม `checkedInAt` → degrade ได้ ไม่พัง
- สแกน long-term ที่หมดอายุ → `checkin` คืน 410 (มีอยู่แล้ว)
- single-use: ไม่กระทบ — ยัง `checkedInAt: now` + ส่ง host flex ตอนลงทะเบียนเหมือนเดิม

## Testing

**Server (Vitest):**
- walk-in long-term → record `checkedInAt === null` และ **ไม่** เรียก `pushMessage` (host flex)
  ตอนลงทะเบียน; `sendLongTermQrToDevs` ยังถูกเรียก
- walk-in single-use → คงเดิม: `checkedInAt` เป็น Date และส่ง host flex (ถ้ามี host lineId)
- GET `/long-term` response มี field `completedAt`

**Mobile:**
- `longTermStatus` คืนค่าถูกต้องครบ 3 เคส (registered/arrived/checked-out) + ลำดับ
  completedAt ชนะ checkedInAt
- selectMode: เลือกได้เฉพาะ rider/merchant ที่ "มาแล้ว"; การ์ดอื่นเลือกไม่ได้
- หลังเช็คเอาท์ → refresh แล้วการ์ดขึ้น "เช็คเอาท์"
- โหมดปกติ: แตะการ์ด = สแกน เหมือนเดิม

## Deployment order

Deploy **`ICPBooking` server ก่อน** (long-term เริ่มที่ "ลงทะเบียน" + ส่ง `completedAt`)
แล้วค่อย `icp-mb-booking`. Mobile degrade ได้ถ้า deploy ก่อน

## Cross-repo coordination

`ICPBooking` มี workstream/session อื่น commit branch เดียวกัน — stage **เฉพาะ 2 ไฟล์** ที่แก้
(`routes/walk-in-visitors.js`, `routes/visitor-appointments.js`), ตรวจ `git diff` ช่วงบรรทัดให้ตรง
ก่อน commit; อย่า `git add -A`

## Out of scope / future

- หน้า browser checkin (GET `/:id/checkin` HTML) ไม่ปรับเป็น 3 สถานะ (ใช้ flow สแกนผ่านแอป)
- เช็คเอาท์แบบมี host ในแอป — ยังให้ host กด "เสร็จสิ้น" ใน LINE เหมือนเดิม
- Bulk checkout endpoint ฝั่ง server (ตอนนี้แอปเรียกทีละใบ; ปริมาณน้อย ยอมรับได้)
- การ reset สถานะอัตโนมัติรายวัน
