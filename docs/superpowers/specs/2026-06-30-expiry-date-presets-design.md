# ปุ่มลัดเลือกวันหมดอายุ QR ระยะยาว (1 อาทิตย์ / 1 / 3 / 6 เดือน / 1 ปี / กำหนดเอง)

วันที่: 2026-06-30
ขอบเขต: mobile เท่านั้น (`icp-mb-booking`) — `src/services/api.ts` (type + helper + options) และ
`src/screens/WalkInScreen.tsx` (UI) ไม่แก้ฝั่ง server

## เป้าหมาย

ฟิลด์ "วันหมดอายุ" (โผล่เมื่อเลือก QR แบบ "ระยะยาว") ปัจจุบันเป็นปุ่มเดียวที่กดแล้วเปิด
date picker ให้เลือกวันเอง เพิ่มปุ่มลัด (chips) ให้เลือกช่วงเวลายอดนิยมได้เร็วขึ้น:

`1 อาทิตย์` `1 เดือน` `3 เดือน` `6 เดือน` `1 ปี` `กำหนดเอง`

## พฤติกรรมที่ต้องการ

1. กดชิปช่วงเวลา → คำนวณวันหมดอายุจาก "วันนี้" ตั้ง `expiryDate` ทันที + แสดงบรรทัด
   "หมดอายุ YYYY-MM-DD" ใต้แถวชิป
2. กด "กำหนดเอง" → เปิด date picker เดิม เลือกวันได้อิสระ (โค้ด picker เดิมคงไว้ทั้งหมด)
3. ค่าเริ่มต้นเมื่อกด "ระยะยาว" → ชิป "1 เดือน" ถูกเลือกไว้ (+1 เดือน เหมือนพฤติกรรมเดิม)

## การคำนวณวันที่ (จากวันนี้)

| preset | วิธีคำนวณ |
|--------|-----------|
| `1w` | `+7 วัน` (`setDate(getDate()+7)`) |
| `1m` | `+1 เดือน` (`setMonth(getMonth()+1)`) |
| `3m` | `+3 เดือน` |
| `6m` | `+6 เดือน` |
| `1y` | `+1 ปี` (`setFullYear(getFullYear()+1)`) |
| `custom` | ผู้ใช้เลือกเองผ่าน date picker |

เลขเดือนใช้ `setMonth` แบบเดียวกับ `defaultExpiryDate()` เดิม (ยอมรับ roll-over ของ JS
เช่น 31 ม.ค. +1 เดือน = 3 มี.ค. — เป็นพฤติกรรมเดิมอยู่แล้ว ไม่เปลี่ยน)

## หน่วยงาน (units)

### 1. `src/services/api.ts` — type + helper + options (pure, ทดสอบได้ใน node-jest)

วางถัดจาก `VisitorQrMode` / `VISITOR_TYPE_OPTIONS` (แพทเทิร์นเดียวกับ pure helper เดิม
`maskIdNumber` / `visitorTypeNeeds*` ที่อยู่ใน api.ts และเทสต์ใน api.test.ts)

```ts
export type ExpiryPreset = "1w" | "1m" | "3m" | "6m" | "1y" | "custom";

export const EXPIRY_PRESET_OPTIONS: { value: ExpiryPreset; label: string }[] = [
  { value: "1w", label: "1 อาทิตย์" },
  { value: "1m", label: "1 เดือน" },
  { value: "3m", label: "3 เดือน" },
  { value: "6m", label: "6 เดือน" },
  { value: "1y", label: "1 ปี" },
  { value: "custom", label: "กำหนดเอง" },
];

// คำนวณวันหมดอายุจากวันนี้ตาม preset; "custom" ไม่คำนวณ (คืน null ให้ caller ใช้ค่าที่ผู้ใช้เลือก)
// รับ now เป็น param (default = new Date()) เพื่อให้เทสต์ deterministic
export function presetExpiryDate(
  preset: ExpiryPreset,
  now: Date = new Date(),
): Date | null {
  if (preset === "custom") return null;
  const d = new Date(now.getTime()); // copy ไม่ mutate now
  if (preset === "1w") d.setDate(d.getDate() + 7);
  else if (preset === "1m") d.setMonth(d.getMonth() + 1);
  else if (preset === "3m") d.setMonth(d.getMonth() + 3);
  else if (preset === "6m") d.setMonth(d.getMonth() + 6);
  else if (preset === "1y") d.setFullYear(d.getFullYear() + 1);
  return d;
}
```

WalkInScreen import เพิ่ม: `ExpiryPreset`, `EXPIRY_PRESET_OPTIONS`, `presetExpiryDate`

`defaultExpiryDate()` เดิมใน WalkInScreen (+1 เดือน) = `presetExpiryDate("1m")!` — ลบ helper เดิม
แล้วเปลี่ยนทุกที่ที่เรียก `defaultExpiryDate()` (ปุ่ม segment "ระยะยาว" และ `value` ของ DateTimePicker)
ให้ใช้ `presetExpiryDate("1m")!`

### 2. `WalkInScreen.tsx` — state ใหม่: `expiryPreset`

```ts
const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("1m");
```

### 3. `WalkInScreen.tsx` — handler เลือก preset

```ts
function handleExpiryPreset(preset: ExpiryPreset) {
  setExpiryPreset(preset);
  if (preset === "custom") {
    setShowExpiryPicker(true);          // เปิด date picker ให้เลือกเอง
  } else {
    setShowExpiryPicker(false);
    setExpiryDate(presetExpiryDate(preset));
  }
}
```

### 4. `WalkInScreen.tsx` — UI ในฟิลด์ "วันหมดอายุ"

- เพิ่มแถวชิป (ใช้ `styles.typeRow` / `typeChip` เดิมที่มีอยู่ ไม่เพิ่ม style ใหม่ถ้าไม่จำเป็น)
  วน `EXPIRY_PRESET_OPTIONS`, active = `expiryPreset === option.value`, `onPress={() => handleExpiryPreset(option.value)}`
- เมื่อ `expiryPreset === "custom"`: แสดง touchable date input + `DateTimePicker` เดิม (โค้ดปัจจุบันทั้งบล็อก)
- เมื่อ preset อื่น: แสดงบรรทัดข้อความ `หมดอายุ {formatDateLocal(expiryDate)}` (อ่านอย่างเดียว)

### 5. ปรับ flow ที่เกี่ยวข้อง

- ปุ่ม segment "ระยะยาว" `onPress`: เดิม `setExpiryDate(prev => prev ?? defaultExpiryDate())`
  → เปลี่ยนเป็น `setExpiryDate(prev => prev ?? presetExpiryDate("1m")!)` (default ยัง +1 เดือน)
  ไม่ต้องแตะ `expiryPreset` เพราะ default state = `"1m"` อยู่แล้ว
- `resetForm()`: เพิ่ม `setExpiryPreset("1m")` (และคง`setExpiryDate(null)` เดิม)

## Validation (คงเดิม)

`if (qrMode === "long-term" && !expiryDate) return "กรุณาเลือกวันหมดอายุ";`
- preset ที่ไม่ใช่ custom จะตั้ง `expiryDate` ทันที → ผ่าน
- "กำหนดเอง" ถ้าผู้ใช้ปิด picker โดยไม่เลือก → `expiryDate` อาจเป็น null → โดน validation จับเหมือนเดิม

## ส่งค่าไป server (คงเดิม)

`submit()` ยังส่ง `expiryDate: formatDateLocal(expiryDate)` รูปแบบ `YYYY-MM-DD` ไม่เปลี่ยน
(server ไม่รับรู้ว่ามาจาก preset หรือเลือกเอง)

## ไม่ทำ (YAGNI)

- ไม่เก็บ preset ไป server / ไม่ส่ง field ใหม่
- ไม่ทำ preset แบบกรอกตัวเลขเอง (เช่น "N วัน")
- ไม่แตะ ScannerScreen / NotificationScreen / server (api.ts แก้เฉพาะเพิ่ม type+helper+options ใหม่)

## เทสต์

- หน่วย (pure fn) ใน `src/services/api.test.ts` (ที่เดียวกับ maskIdNumber / shouldRouteToCheckout):
  `presetExpiryDate` โดยส่ง `now` คงที่ (เช่น `new Date("2026-06-30T00:00:00")`) ให้ deterministic
  - `1w` = `now + 7 วัน` (2026-07-07)
  - `1m` = เดือน +1 (2026-07-30)
  - `3m` = เดือน +3 (2026-09-30)
  - `6m` = เดือน +6 (2026-12-30)
  - `1y` = ปี +1 (2027-06-30)
  - `custom` = `null`
  - ตรวจว่าไม่ mutate `now` ที่ส่งเข้าไป (argument เดิมไม่เปลี่ยน)
- บนเครื่องจริง: กดแต่ละชิป → เห็นวันที่อัปเดต; กด "กำหนดเอง" → เปิด picker เลือกเอง;
  สลับ single-use ↔ long-term → reset ถูกต้อง; บันทึก long-term → modal QR โชว์วันหมดอายุตรง
