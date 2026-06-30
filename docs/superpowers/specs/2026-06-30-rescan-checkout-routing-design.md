# สแกนซ้ำ rider/แม่ค้า ที่ยังไม่เช็คเอาท์ → เด้งเปิดการ์ดเช็คเอาท์

วันที่: 2026-06-30
ขอบเขต: mobile เท่านั้น (`icp-mb-booking`) — ไม่มีการแก้ฝั่ง server

## เป้าหมาย

หลังจากเอาปุ่ม "🚪 ไปแล้ว (สแกนออก)" ออกจากหน้าสแกน การเช็คเอาท์ของ rider/แม่ค้า
ย้ายไปอยู่ที่การ์ด long-term ใน `NotificationScreen` แล้ว (แตะการ์ด "มาแล้ว" → `LongTermDetailScreen` → ปุ่มเช็คเอาท์)

ฟีเจอร์นี้สร้าง "สะพาน" ให้เจ้าหน้าที่: เมื่อ **สแกน QR ซ้ำ** ของ rider/แม่ค้า ที่
**ยังไม่เช็คเอาท์** (สถานะ "มาแล้ว") แทนที่จะเด้ง modal "เช็คอินซ้ำ" ให้พาไปหน้าแจ้งเตือน
และ **เปิดการ์ด detail/checkout ของคนนั้นให้อัตโนมัติ**

## เงื่อนไขที่จะเด้ง (ตกลงแล้ว)

เด้งเฉพาะการสแกนที่ผลเช็คอินเป็น `success && alreadyCheckedIn && canCheckout`
- `alreadyCheckedIn` = สแกนซ้ำ (เคยเช็คอิน/มาแล้ว)
- `canCheckout` = เป็น rider/แม่ค้า ที่ยังเช็คเอาท์ได้ (server ตอบมา; รองรับเฉพาะ rider/merchant)

กรณีอื่น (เช็คอินครั้งแรก, host re-scan ที่ `canCheckout=false`, เช็คเอาท์ไปแล้ว, error)
→ แสดง result modal เหมือนเดิม

## พฤติกรรมที่ต้องการ

1. เจ้าหน้าที่สแกน QR ของ rider/แม่ค้า ครั้งที่สอง (ตอนจะออก)
2. ระบบไม่โชว์ modal "เช็คอินซ้ำ" — สลับไปแท็บ "แจ้งเตือน" ทันที
3. หน้าแจ้งเตือนเปิด sub-tab "ระยะยาว" และเปิด `LongTermDetailScreen` ของคนที่เพิ่งสแกน
4. เจ้าหน้าที่กด "เช็คเอาท์" → สำเร็จ → ปิด modal + รีเฟรชลิสต์ (พฤติกรรมเดิมของ detail screen)

## สถาปัตยกรรม / Data flow

id ของนัดหมายเดินทาง: `ScannerScreen → App → NotificationScreen → เปิด detail ตาม id`

```
สแกนซ้ำ (rider/แม่ค้า)
  → ScannerScreen.onCheckout(id)
    → App.handleGoCheckout(id): setCheckoutTargetId(id); สลับไปแท็บ notification
      → NotificationScreen(openCheckoutId=id)
        → Effect 1: สลับ sub-tab longTerm; setPendingCheckoutId(id); onCheckoutConsumed()
        → Effect 2 (รอ fetch): หา item ตาม _id เจอ → setDetailItem(item)
```

### ข้อจำกัดของ navigation ที่ต้องรองรับ

`App.tsx` เรนเดอร์แบบ conditional (`activeTab === ... ? <A/> : <B/>`) ดังนั้น
`NotificationScreen` จะ **unmount เมื่อสลับไปแท็บสแกน** และ **mount ใหม่ + fetch ใหม่**
เมื่อกลับมา → ตอน deep-link เข้ามา `longTermAppointments` อาจยังว่าง/กำลังโหลด

ดีไซน์จึงต้อง "รอข้อมูล" ด้วย 2 effect แยกกัน (ไม่เปิด detail ทันทีใน effect เดียว)

## หน่วยงาน (units)

### 1. `shouldRouteToCheckout(res: CheckinResult): boolean` — ฟังก์ชันบริสุทธิ์ (`src/services/api.ts`)

```ts
// สแกนซ้ำ rider/แม่ค้า ที่ยัง "มาแล้ว" (ยังเช็คเอาท์ได้) → ให้เด้งไปหน้าเช็คเอาท์
export function shouldRouteToCheckout(res: CheckinResult): boolean {
  return !!(res.success && res.alreadyCheckedIn && res.canCheckout);
}
```

- **ทำอะไร:** ตัดสินจากผลเช็คอินว่าควร route ไปเช็คเอาท์ไหม
- **ใช้ยังไง:** เรียกใน `ScannerScreen.handleBarcodeScan` หลังได้ `CheckinResult`
- **ขึ้นกับ:** `CheckinResult` (type เดิม) เท่านั้น
- **ทดสอบ (api.test.ts):**
  - `true` เมื่อ `success && alreadyCheckedIn && canCheckout`
  - `false` เมื่อ `alreadyCheckedIn=false` (เช็คอินครั้งแรก)
  - `false` เมื่อ `canCheckout=false` (host re-scan)
  - `false` เมื่อ `success=false`
  - `false` เมื่อ object ว่าง/field หาย

### 2. `ScannerScreen` — เพิ่ม prop `onCheckout?(appointmentId: string)`

ใน `handleBarcodeScan` หลัง `checkinAppointment`:
```ts
if (onCheckout && shouldRouteToCheckout(res)) {
  onCheckout(id);
  return; // ข้าม modal — กำลังเด้งไปหน้าแจ้งเตือน (อย่า setState ต่อหลัง onCheckout เพราะ component กำลังจะ unmount)
}
```
- ไม่ผูกกับ `fromNotification` → ทำงานไม่ว่าจะเปิดสแกนจากแท็บไหน
- import `shouldRouteToCheckout` เพิ่ม

### 3. `App.tsx` — ตัวกลางส่ง id

- state ใหม่: `const [checkoutTargetId, setCheckoutTargetId] = useState<string | null>(null)`
- `handleGoCheckout(id: string)`: `setCheckoutTargetId(id); setFromNotification(false); setActiveTab("notification")`
- `<ScannerScreen onBack={...} onCheckout={handleGoCheckout} />`
- `<NotificationScreen onScanRequest={...} openCheckoutId={checkoutTargetId} onCheckoutConsumed={() => setCheckoutTargetId(null)} />`

### 4. `NotificationScreen` — รับ id แล้วเปิดการ์ด

props ใหม่: `openCheckoutId?: string | null`, `onCheckoutConsumed?: () => void`
state ใหม่: `const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null)`

```ts
// Effect 1: รับ id จากการสแกนซ้ำ → สลับแท็บ ตั้ง pending แล้วเคลียร์ฝั่ง App (กัน re-trigger ตอน remount)
useEffect(() => {
  if (!openCheckoutId) return;
  setActiveTab("longTerm");
  setPendingCheckoutId(openCheckoutId);
  onCheckoutConsumed?.();
}, [openCheckoutId, onCheckoutConsumed]);

// Effect 2: เมื่อมี pending และข้อมูลพร้อม → เปิด detail ของคนนั้น (re-run เองเมื่อ list มาทีหลัง)
useEffect(() => {
  if (!pendingCheckoutId) return;
  const item = longTermAppointments.find((a) => a._id === pendingCheckoutId);
  if (item) {
    setDetailItem(item);
    setPendingCheckoutId(null);
  }
}, [pendingCheckoutId, longTermAppointments]);
```

- ใช้ `_id` จับคู่ (scan id = appointment `_id` = `TodayAppointment._id`)
- effect เดิม `exitSelectMode()` ตอน `activeTab` เปลี่ยน ยังทำงานปกติ (ไม่ชน)

## Edge cases / error handling

- **หา item ไม่เจอในลิสต์** → `pendingCheckoutId` ค้างไว้ ลงเอยที่แท็บระยะยาว เจ้าหน้าที่หาการ์ดเองได้ ไม่ crash
- **`onCheckout` ไม่ถูกส่ง** (ป้องกันไว้) → ตกไปแสดง modal ตามเดิม
- **item stale** (local status ยังไม่ทันอัปเดต) → `LongTermDetailScreen` โชว์ปุ่มเช็คเอาท์เสมอ (ไม่ gate ตาม local status) → เช็คเอาท์ได้ปกติ; ฝั่ง server เป็นผู้ตัดสินจริง

## ไม่ทำ (YAGNI)

- ไม่ทำ timeout/แจ้งเตือน เมื่อหา item ไม่เจอ
- ไม่ force-refresh เพิ่ม (mount ใหม่ fetch อยู่แล้ว)
- ไม่แก้ฝั่ง server

## สมมติฐานที่ต้องยืนยันบนเครื่องจริง

ฝั่ง server ตอบ `alreadyCheckedIn=true` + `canCheckout=true` เมื่อสแกนซ้ำ QR ของ
rider/แม่ค้า ที่สถานะ "มาแล้ว" (ตามที่ใช้ในฟีเจอร์ checkout เดิม)

## เทสต์

- หน่วย: `shouldRouteToCheckout` (5 เคสด้านบน) ใน `src/services/api.test.ts`
- บนเครื่องจริง: สแกนครั้งแรก = เช็คอิน; สแกนซ้ำ = เด้งไปเปิดการ์ดเช็คเอาท์; host/normal re-scan = modal เดิม
