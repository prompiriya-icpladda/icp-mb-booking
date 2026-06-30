# ปรับฟอร์มลงทะเบียนบุคคลภายนอก: ช่องตามประเภท + ปิดบังเลขบัตรประชาชน

วันที่: 2026-06-30
สถานะ: อนุมัติดีไซน์แล้ว (รอ review spec)
ไฟล์หลัก: `src/screens/WalkInScreen.tsx`, `src/services/api.ts`

## เป้าหมาย

ปรับฟอร์ม "ลงทะเบียนบุคคลภายนอก" (WalkInScreen) ตามความต้องการ 3 ข้อ:

1. **แม่ค้า (merchant)** — ไม่ต้องมีช่อง "ชื่อบริษัท" และ "บัตรประชาชน"
2. **ไรเดอร์ (rider)** — ไม่ต้องมีช่อง "บัตรประชาชน" (ยังคงมีชื่อบริษัท)
3. **ประเภทอื่น** (visitor / customer / vendor / supplier) — ช่องบัตรประชาชนปิดบังตอนแสดงผล:
   2 หลักหน้าโชว์ + 9 หลักกลางเป็น `x` + 2 หลักท้ายโชว์ → `17xxxxxxxxx39`

## บริบทโค้ดปัจจุบัน

- ประเภทผู้มาติดต่อมี 6 แบบ ใน `VISITOR_TYPE_OPTIONS` (`api.ts`): `visitor, customer, vendor, supplier, rider, merchant`
- `visitorTypeNeedsHost(type)` คืน `false` สำหรับ `rider`/`merchant` (ซ่อนช่อง host อยู่แล้ว)
- `validate()` ใน `WalkInScreen.tsx` **บังคับกรอก** `idCardNumber` และ `companyName` ทุกประเภท (บรรทัด ~175-176)
- ช่องบัตรประชาชนเป็น `TextInput` number-pad, `maxLength={13}`, ไม่มีการปิดบัง
- `createWalkInVisit()` ส่ง `idCardNumber`/`companyName` ไป backend ที่ **remote (Render endpoint)** — แก้ฝั่ง server ที่เครื่องนี้ไม่ได้

## ดีไซน์

### 1) การแสดงช่องฟอร์มตามประเภท

| ประเภท | host | บัตรประชาชน | ชื่อบริษัท |
|---|---|---|---|
| visitor / customer / vendor / supplier | แสดง | แสดง (ปิดบัง) | แสดง |
| rider | ซ่อน (เดิม) | **ซ่อน (ใหม่)** | แสดง |
| merchant | ซ่อน (เดิม) | **ซ่อน (ใหม่)** | **ซ่อน (ใหม่)** |

เพิ่ม helper ใน `api.ts` (แนวเดียวกับ `visitorTypeNeedsHost`):

```ts
// บัตรประชาชน: ไม่ต้องใช้สำหรับ rider / merchant
export function visitorTypeNeedsIdCard(visitorType: VisitorType): boolean {
  return visitorType !== "rider" && visitorType !== "merchant";
}

// ชื่อบริษัท: ไม่ต้องใช้สำหรับ merchant (แม่ค้า)
export function visitorTypeNeedsCompany(visitorType: VisitorType): boolean {
  return visitorType !== "merchant";
}
```

ใน `WalkInScreen.tsx`:
- คำนวณ `idVisible = visitorTypeNeedsIdCard(visitorType)`, `companyVisible = visitorTypeNeedsCompany(visitorType)`
- ห่อ `<Field label="รหัสบัตรประชาชน">` ด้วย `{idVisible && (...)}`
- ห่อ `<Field label="ชื่อบริษัท">` ด้วย `{companyVisible && (...)}`
- เมื่อสลับประเภทไปเป็นแบบที่ซ่อนช่อง ให้เคลียร์ค่าในช่องที่ซ่อน (เช่น set `idCardNumber("")` / `companyName("")`) เพื่อไม่ให้ค่าค้างจากการพิมพ์ก่อนสลับ

### 2) Validation

แก้ `validate()`:
- บังคับ `idCardNumber` **เฉพาะเมื่อ** `idVisible`
- บังคับ `companyName` **เฉพาะเมื่อ** `companyVisible`

แก้ตอนสร้าง payload ใน `submit()`:
- `idCardNumber: idVisible ? idCardNumber.trim() : ""`
- `companyName: companyVisible ? companyName.trim() : ""`

(กันเหนียวแม้ state จะถูกเคลียร์ตอนสลับประเภทแล้ว)

### 3) ปิดบังเลขบัตรประชาชน

หลักการ: **เก็บเลข 13 หลักเต็มไว้ใน state และส่งเต็มไป backend** ปิดบังเฉพาะตอนแสดงผลบนหน้าจอ มี 2 สถานะตาม focus

ฟังก์ชัน util ใน `api.ts` (แยกออกมาเทสต์ได้):

```ts
// แสดงผลเลขบัตร: 2 หลักหน้าโชว์เสมอ
//  - focused (กำลังพิมพ์): โชว์เฉพาะหลักล่าสุดที่พิมพ์ ที่เหลือกลางเป็น x
//  - blurred (ออกจากช่อง/ครบ): โชว์ 2 หลักหน้า + 2 หลักท้าย
export function maskIdNumber(raw: string, focused: boolean): string {
  const n = raw.length;
  if (n === 0) return "";
  return raw
    .split("")
    .map((c, i) => {
      const isFirstTwo = i < 2;
      const revealLastTyped = focused && i === n - 1;
      const revealLastTwo = !focused && i >= n - 2;
      return isFirstTwo || revealLastTyped || revealLastTwo ? c : "x";
    })
    .join("");
}
```

พฤติกรรมที่ได้ (ตัวอย่างพิมพ์ `1 7 3 4 5 6 … 3 9`):

```
กำลังพิมพ์ (focus):
  1            → 1
  17           → 17
  173          → 173
  1734         → 17x4
  17345        → 17xx5
  173456       → 17xxx6
  … ครบ 13     → 17xxxxxxxxxx9   (focus: โชว์หลักล่าสุดตัวเดียว → x 10 ตัว)
ออกจากช่อง (blur) / ครบ:
  1734…39      → 17xxxxxxxxx39   (blur: โชว์ 2 หน้า + 2 ท้าย → x 9 ตัว)
```

การต่อ display เข้ากับ TextInput (เก็บ raw แยกจาก display):
- state เดิม `idCardNumber` = เลขจริง (raw digits, ส่ง backend)
- เพิ่ม state `idFocused` (จาก `onFocus`/`onBlur`)
- `TextInput value={maskIdNumber(idCardNumber, idFocused)}`
- `onChangeText(text)`: ถอดกลับเป็น raw โดยอาศัยว่า **ความยาว display = ความยาว raw** (1 หลัก ↔ 1 ตัวอักษร ตำแหน่งตรงกัน):
  - ถ้า `text.length > displayPrev.length` → พิมพ์ต่อท้าย: เอาตัวที่เพิ่ม (`text.slice(displayPrev.length)`) กรองเฉพาะตัวเลข ต่อท้าย raw (จำกัด 13 หลัก)
  - ถ้า `text.length < displayPrev.length` → ลบท้าย: `raw = raw.slice(0, text.length)`
  - รองรับพฤติกรรมปกติของการกรอกเลขบัตร (พิมพ์ต่อท้าย / backspace ท้าย); ไม่รองรับการแก้กลางสตริงซึ่งไม่ใช่เคสปกติ
- คง `keyboardType="number-pad"`, `maxLength={13}` (display ยาวเท่า raw จึงใช้ 13 ได้)

### 4) ความเสี่ยงฝั่ง backend (ต้องยืนยันตอนทดสอบ)

backend อยู่ remote — ถ้า server บังคับ `idCardNumber`/`companyName` ไม่ให้ว่าง การลงทะเบียน merchant/rider อาจถูก reject (HTTP 400)

- แผนหลัก: ส่งค่าว่าง `""` แล้วทดสอบ register merchant/rider จริง
- ถ้าเจอ reject: ทางออกคือส่ง placeholder (เช่น `"-"`) สำหรับช่องที่ซ่อน หรือต้องแก้ validation ฝั่ง server แยก (คนละ repo)

### 5) ไฟล์ที่แก้

- `src/services/api.ts` — เพิ่ม `visitorTypeNeedsIdCard`, `visitorTypeNeedsCompany`, `maskIdNumber`
- `src/screens/WalkInScreen.tsx` — เงื่อนไขแสดงช่อง ID/บริษัท, validation, masking + focus state, เคลียร์ค่าตอนสลับประเภท
- เพิ่ม unit test: `maskIdNumber` (focus/blur หลายความยาว), `visitorTypeNeedsIdCard`, `visitorTypeNeedsCompany`

## นอกขอบเขต (Out of scope)

- การปิดบังเลขบัตรในหน้าจออื่น (Scanner / Notification) — เฉพาะฟอร์มลงทะเบียนนี้เท่านั้น
- การเปลี่ยนวิธีเก็บ ID ฝั่ง backend (ยังส่งเลขเต็ม 13 หลัก)
- การแก้ฟอร์มฝั่งเว็บ ICPBooking
