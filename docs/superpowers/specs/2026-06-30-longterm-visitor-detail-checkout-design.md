# หน้ารายละเอียดผู้มาเยือนระยะยาว + เช็คเอาท์ทีละคน

- **Date:** 2026-06-30
- **Status:** Approved design — ready for implementation plan
- **Repos touched:** `icp-mb-booking` (mobile) เท่านั้น — **ไม่แตะ server**

## สรุป (Thai)

ต่อยอดจาก [long-term QR status lifecycle](2026-06-30-long-term-qr-status-lifecycle-design.md)
(ลงทะเบียน → มาแล้ว → เช็คเอาท์). ตอนนี้แท็บ "ระยะยาว" เช็คเอาท์ได้ทาง **multi-select**
("เลือกเช็คเอาท์" หลายรายการ) เท่านั้น

ต้องการเพิ่ม **หน้ารายละเอียดใหม่** สำหรับเช็คเอาท์ทีละคน:
1. รปภ. สแกน QR ระยะยาว → การ์ดเป็น "มาแล้ว"
2. ในแอป แตะการ์ด "มาแล้ว" (rider/แม่ค้า) → เปิด **หน้ารายละเอียด**
3. ในหน้ารายละเอียด กด "เช็คเอาท์" → สำเร็จ → **กลับหน้าแจ้งเตือน** การ์ดขึ้น "เช็คเอาท์"
4. ภายหลังสแกน QR เดิมอีกรอบ → กลับเป็น "มาแล้ว" รอบใหม่ (เช็คอินใหม่)

หน้ารายละเอียดใหม่ **อยู่ร่วมกับ** โหมด multi-select เดิม (ไม่แทนที่)

## ขอบเขต (จาก decision ที่อนุมัติ)

- **เปิดหน้ารายละเอียดได้เฉพาะ** การ์ดระยะยาวที่สถานะ "มาแล้ว" **และ** เป็น rider/แม่ค้า
  → ตรงกับเงื่อนไข `isLongTermCheckoutable(item)` ที่มีอยู่แล้วพอดี
- การ์ดแบบมี host (visitor/customer/vendor/supplier), การ์ดสถานะ "ลงทะเบียน"/"เช็คเอาท์",
  และการ์ดปกติ (single-use): **คงพฤติกรรมเดิมทุกอย่าง** (ไม่เปิดหน้ารายละเอียด)
- multi-select "เลือกเช็คเอาท์": **คงเดิมทั้งหมด** อยู่ร่วมกัน

## ส่วน #4 (สแกนซ้ำหลังเช็คเอาท์ = เช็คอินใหม่) — ทำงานอยู่แล้ว ไม่ต้องแก้

ยืนยันจากโค้ด server `ICPBooking/server/routes/visitor-appointments.js` (POST `/:id/checkin`,
≈ บรรทัด 378–381):

```js
const alreadyCheckedIn = !isLongTermQr && !!record.checkedInAt;
record.checkedInAt = new Date();
...
if (isLongTermQr) record.completedAt = null;   // สแกน long-term ล้าง completedAt เสมอ
```

→ หลังเช็คเอาท์ (`completedAt` ถูกตั้ง) สแกนอีกรอบ จะ `checkedInAt = now` + ล้าง `completedAt`
→ `longTermStatus` derive กลับเป็น "arrived" (มาแล้ว) รอบใหม่ **โดยไม่ต้องแก้อะไร**

## สถาปัตยกรรม (ปัจจุบัน)

- `App.tsx` → `MainApp`: navigation แบบ state (3 แท็บ: notification / scanner / walkIn)
  ไม่มี router; เปลี่ยนหน้าด้วย `activeTab`
- `NotificationScreen` เป็นเจ้าของข้อมูล (`longTermAppointments`) + การรีเฟรช
  (`fetchAppointments` ผ่าน interval/SSE/pull-to-refresh) + โหมด multi-select
- ตัดสินใจ: **หน้ารายละเอียด render เป็น full-screen `Modal` จากใน `NotificationScreen`**
  (ไม่ยกขึ้น `App.tsx`) เพื่อให้ — (ก) state แท็บ/scroll ของ NotificationScreen ไม่หาย,
  (ข) รีเฟรชหลังเช็คเอาท์ทำได้ตรงๆ ผ่าน `fetchAppointments()` ที่เป็นเจ้าของข้อมูลอยู่แล้ว

## Building blocks ที่ reuse (ไม่สร้างใหม่)

- `checkoutAppointment(id)` ใน `src/services/api.ts` — POST `/:id/checkout`, set `completedAt`,
  จำกัด rider/merchant ฝั่ง server (คืน error ถ้าชนิดอื่น) **ใช้ได้เลย**
- `isLongTermCheckoutable(item)` — (rider|merchant) && status "arrived" **ใช้เป็นเงื่อนไขแตะ**
- `longTermStatus(item)` — derive registered/arrived/checked-out
- `TodayAppointment` มี field ครบ: `checkedInAt`, `completedAt`, `visitorType`, `expiryDate`,
  `purpose`, `visitorCount`, `hasVehicle`, `licensePlate`, `createdByName`, `visitorOrganization`

## รายละเอียดการเปลี่ยนแปลง

### A) Component ใหม่ — `src/screens/LongTermDetailScreen.tsx`

หน้าจอเต็ม เป็น unit แยก (เทสง่าย ไม่ผูกกับ data fetching)

**Props**
```ts
{
  appointment: TodayAppointment;
  onBack: () => void;        // ปิดหน้า (กดกลับ / Android back)
  onCheckedOut: () => void;  // เช็คเอาท์สำเร็จ → ให้ parent รีเฟรช + ปิดหน้า
}
```

**โครงสร้าง UI** (สไตล์เดิม: header เข้ม `#1f2937`, accent เขียว `#16a34a`, การ์ดขาว)
- Header: ปุ่ม `‹ กลับ` (เรียก `onBack`) + หัวข้อ "รายละเอียดผู้มาเยือน"
- Body (ScrollView):
  - badge สถานะ "มาแล้ว" (เขียว) เด่น
  - ชื่อผู้มาเยือน (ใหญ่) + องค์กร (`visitorOrganization`)
  - แถวข้อมูล (แสดงเฉพาะที่มีค่า):
    - ประเภท: rider / แม่ค้า (map จาก `visitorType` ผ่าน label เดิม)
    - ถึงวันที่: `expiryDate` (ถ้าไม่มี = "ไม่จำกัด")
    - จุดประสงค์: `purpose`
    - จำนวน: `visitorCount` คน (แสดงเมื่อ > 1)
    - ทะเบียนรถ: `licensePlate` (เมื่อ `hasVehicle`)
    - ลงทะเบียนโดย: `createdByName`
    - เข้าเมื่อ: เวลา format จาก `checkedInAt`
- ปุ่มล่าง "เช็คเอาท์":
  - กด → `setLoading(true)` → `await checkoutAppointment(appointment._id)`
  - สำเร็จ (`res.success`) → `onCheckedOut()`
  - ไม่สำเร็จ → `Alert.alert("ไม่สำเร็จ", res.error || ...)`, ยังอยู่หน้าเดิม
  - error (throw) → `Alert.alert("ไม่สำเร็จ", e.message)`
  - ระหว่างทำงานปุ่ม disabled + แสดง `ActivityIndicator`

### B) `src/services/api.ts` — เพิ่ม pure helper (เทสได้)

เพื่อให้ตรรกะแตะการ์ดเทสได้ในชุดเทสปัจจุบัน (node + ts-jest, ไฟล์ `*.test.ts`)
แยกการตัดสินใจออกเป็น pure function:

```ts
export type LongTermCardAction = "detail" | "scan" | "select";

// ตัดสินว่าแตะการ์ด long-term แล้วทำอะไร (pure → unit test ได้)
export function longTermCardAction(
  a: Pick<TodayAppointment, "checkedInAt" | "completedAt" | "visitorType">,
  selectMode: boolean,
): LongTermCardAction {
  if (selectMode) return "select";
  return isLongTermCheckoutable(a) ? "detail" : "scan";
}
```

(optional) helper label ประเภทสำหรับโชว์: reuse `VISITOR_TYPE_OPTIONS` หรือ map ตรงๆ
ในหน้ารายละเอียด — ไม่จำเป็นต้องเพิ่ม export ถ้า map ใน component ได้สั้นๆ

### C) แก้ `src/screens/NotificationScreen.tsx`

- เพิ่ม state: `const [detailItem, setDetailItem] = useState<TodayAppointment | null>(null);`
- `AppointmentCard` รับ prop ใหม่ `onOpenDetail?: (item: TodayAppointment) => void`
- ตรรกะแตะการ์ดระยะยาว: ใช้ `longTermCardAction(item, selectMode)` →
  - `"detail"` → `onOpenDetail(item)`, hint การ์ด `› ดูรายละเอียด`
  - `"scan"` → `onScanRequest()` (เดิม), hint `📷 แตะเพื่อสแกน`
  - `"select"` → toggle เลือก (เดิม)
  - (การ์ดปกติ single-use ที่ยังไม่เช็คอิน: ยังใช้ `onScanRequest` เดิม ไม่ผ่าน helper นี้)
- ส่ง `onOpenDetail={setDetailItem}` ให้การ์ด (ผ่าน renderItem)
- Render ท้าย component:
  ```tsx
  <Modal visible={!!detailItem} animationType="slide" onRequestClose={() => setDetailItem(null)}>
    {detailItem && (
      <LongTermDetailScreen
        appointment={detailItem}
        onBack={() => setDetailItem(null)}
        onCheckedOut={() => { setDetailItem(null); fetchAppointments(); }}
      />
    )}
  </Modal>
  ```
- หมายเหตุ: เมื่ออยู่ใน selectMode ไม่เปิดหน้ารายละเอียด (แตะ = เลือก) — กันสับสนสองโหมด

## Data flow

**เปิดหน้ารายละเอียด + เช็คเอาท์:**
1. แท็บ "ระยะยาว" (โหมดปกติ) → แตะการ์ด "มาแล้ว" rider/แม่ค้า → `setDetailItem(item)` → Modal เปิด
2. หน้ารายละเอียดแสดงข้อมูลจาก `appointment` (ไม่ fetch เพิ่ม)
3. กด "เช็คเอาท์" → `checkoutAppointment(id)` → server set `completedAt = now`
4. สำเร็จ → `onCheckedOut` → ปิด Modal + `fetchAppointments()` → การ์ดขึ้น "เช็คเอาท์"

**สแกนซ้ำ (ภายหลัง):**
1. รปภ. สแกน QR เดิม → POST `/:id/checkin` → `checkedInAt = now`, `completedAt = null`
2. การ์ดกลับเป็น "มาแล้ว" → แตะเปิดรายละเอียด/เช็คเอาท์ได้อีกรอบ

## Error handling / edge cases

- เช็คเอาท์ล้มเหลว (network/server) → `Alert`, คงหน้ารายละเอียดไว้ ผู้ใช้ลองใหม่ได้
- เช็คเอาท์ record ที่ไม่ใช่ rider/merchant → ไปไม่ถึง (UI เปิดหน้าได้เฉพาะ rider/แม่ค้าอยู่แล้ว);
  ถ้าหลุดมา server คืน error → Alert
- Android hardware back → `Modal onRequestClose` → ปิดหน้า (เท่ากับกด "กลับ")
- กดเช็คเอาท์รัวๆ → ปุ่ม disabled ระหว่าง loading กันยิงซ้ำ
- การ์ดเปลี่ยนสถานะระหว่างเปิดหน้า (เช่น host LINE เช็คเอาท์พร้อมกัน) → หลังกดจะ refresh
  สถานะจริงสะท้อนเอง; ถ้า server คืน error เพราะ checkout ซ้ำ → Alert ไม่พัง

## Testing

ชุดเทสปัจจุบัน: **node + ts-jest, `testMatch: ["**/*.test.ts"]`** (ดู `jest.config.js`,
ตัวอย่าง `src/services/api.test.ts`) — **เทสได้เฉพาะ pure function** ไม่มี React Native
testing library / jsdom จึง **ไม่เทส component render**

**Unit (`*.test.ts`) — เพิ่มใน `src/services/api.test.ts`:**
- `longTermCardAction`:
  - selectMode = true → `"select"` เสมอ (ทุกชนิด/สถานะ)
  - selectMode = false, rider/แม่ค้า + "มาแล้ว" → `"detail"`
  - selectMode = false, rider/แม่ค้า + "ลงทะเบียน"/"เช็คเอาท์" → `"scan"`
  - selectMode = false, host-based (visitor/customer/...) + "มาแล้ว" → `"scan"`

**Manual / device verification (ไม่มี component test):**
- แตะการ์ด "มาแล้ว" rider/แม่ค้า → เปิดหน้ารายละเอียด แสดงข้อมูลครบ
- กด "เช็คเอาท์" → กลับหน้าแจ้งเตือน การ์ดขึ้น "เช็คเอาท์" (refresh แล้ว)
- เช็คเอาท์ล้มเหลว (เช่นตัด net) → ขึ้น Alert คงอยู่หน้าเดิม
- สแกน QR เดิมอีกรอบ → การ์ดกลับเป็น "มาแล้ว"
- Regression: multi-select เดิมยังทำงาน; การ์ดปกติ/host/สถานะอื่นแตะ = สแกนเหมือนเดิม

**Static:** `npx tsc --noEmit` ผ่าน

## Out of scope / future

- ไม่แตะ server (re-check-in ทำงานแล้ว, ไม่มี endpoint ใหม่)
- ไม่แตะ multi-select (อยู่ร่วมกัน)
- host-based long-term: เช็คเอาท์ผ่าน host LINE เหมือนเดิม (ไม่มีในแอป)
- การ์ดปกติ (single-use): ไม่มีหน้ารายละเอียด
- ไม่แสดงเลขบัตร ปชช. ในหน้ารายละเอียด (rider/แม่ค้าไม่ได้เก็บบัตรอยู่แล้ว)
- ไม่มี confirmation popup ก่อนเช็คเอาท์ (กดปุ่มเดียวจบ ตามที่ตกลง)
