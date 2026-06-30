# Expiry-Date Preset Chips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มปุ่มลัด (chips) เลือกวันหมดอายุ QR ระยะยาว — 1 อาทิตย์ / 1 / 3 / 6 เดือน / 1 ปี / กำหนดเอง — ในหน้าลงทะเบียนบุคคลภายนอก

**Architecture:** logic บริสุทธิ์ (type + helper คำนวณวันที่ + ตัวเลือก) อยู่ใน `src/services/api.ts` ทดสอบได้ใน node-jest ตามแพทเทิร์น `maskIdNumber`/`VISITOR_TYPE_OPTIONS` เดิม; ส่วน UI (chips + การแสดงวันที่ + handler) อยู่ใน `src/screens/WalkInScreen.tsx` ใช้ style chip เดิม กด "กำหนดเอง" คง date picker เดิมไว้ทั้งบล็อก

**Tech Stack:** React Native (Expo), TypeScript, Jest + ts-jest (node-only pure-fn tests)

## Global Constraints

- ส่งค่าไป server เป็น `expiryDate: "YYYY-MM-DD"` รูปแบบเดิม ไม่เพิ่ม field ใหม่ — ไม่แก้ฝั่ง server / route
- การคำนวณเดือนใช้ `Date.prototype.setMonth` (ยอมรับ JS month roll-over) — พฤติกรรมเดียวกับ `defaultExpiryDate()` เดิม
- ไม่เพิ่ม dependency ใหม่
- ภาษา label ทั้งหมดเป็นไทยตามที่ระบุใน spec verbatim: `1 อาทิตย์` `1 เดือน` `3 เดือน` `6 เดือน` `1 ปี` `กำหนดเอง`
- คำสั่งเทสต์: `npx jest` (รันเฉพาะไฟล์: `npx jest src/services/api.test.ts`)
- baseline `npx tsc --noEmit` มี error ~8 ตัวจาก expo-* scaffold ใน `app/` อยู่ก่อนแล้ว — งานนี้ต้อง **ไม่เพิ่ม** error ใหม่

---

## File Structure

- `src/services/api.ts` — **Modify:** เพิ่ม `ExpiryPreset` type, `EXPIRY_PRESET_OPTIONS`, `presetExpiryDate()` (วางถัดจาก `VisitorQrMode`/`VISITOR_TYPE_OPTIONS`)
- `src/services/api.test.ts` — **Modify:** เพิ่ม `describe("presetExpiryDate", ...)`
- `src/screens/WalkInScreen.tsx` — **Modify:** import เพิ่ม, state `expiryPreset`, handler `handleExpiryPreset`, UI chips + บรรทัดวันที่ในฟิลด์ "วันหมดอายุ", ลบ `defaultExpiryDate()` เดิมแล้วชี้มาที่ `presetExpiryDate("1m")!`, อัปเดต `resetForm`

---

## Task 1: Pure logic — `presetExpiryDate` + options ใน api.ts

**Files:**
- Modify: `src/services/api.ts` (เพิ่มหลังบรรทัด `export const VISITOR_TYPE_OPTIONS = [...]` block ~line 341 / ใกล้ `VisitorQrMode` line 332)
- Test: `src/services/api.test.ts`

**Interfaces:**
- Consumes: ไม่มี (logic บริสุทธิ์ ไม่พึ่ง task อื่น)
- Produces:
  - `export type ExpiryPreset = "1w" | "1m" | "3m" | "6m" | "1y" | "custom"`
  - `export const EXPIRY_PRESET_OPTIONS: { value: ExpiryPreset; label: string }[]`
  - `export function presetExpiryDate(preset: ExpiryPreset, now?: Date): Date | null`
    — คืน `Date` ที่คำนวณจาก `now` (default `new Date()`); คืน `null` เมื่อ `preset === "custom"`; ไม่ mutate `now`

- [ ] **Step 1: เขียน failing test**

เพิ่ม `presetExpiryDate` เข้า import แถวบนสุดของ `src/services/api.test.ts`:
```ts
import { visitorTypeNeedsIdCard, visitorTypeNeedsCompany, maskIdNumber, longTermStatus, isLongTermCheckoutable, longTermCardAction, shouldRouteToCheckout, presetExpiryDate } from "./api";
```

ต่อท้ายไฟล์ `src/services/api.test.ts`:
```ts
describe("presetExpiryDate", () => {
  const now = new Date("2026-06-30T00:00:00");
  const ymd = (d: Date | null) =>
    d ? [d.getFullYear(), d.getMonth(), d.getDate()] : null;

  it("adds 7 days for 1w", () => {
    expect(ymd(presetExpiryDate("1w", now))).toEqual([2026, 6, 7]); // 2026-07-07
  });
  it("adds 1/3/6 months for month presets", () => {
    expect(ymd(presetExpiryDate("1m", now))).toEqual([2026, 6, 30]);  // 2026-07-30
    expect(ymd(presetExpiryDate("3m", now))).toEqual([2026, 8, 30]);  // 2026-09-30
    expect(ymd(presetExpiryDate("6m", now))).toEqual([2026, 11, 30]); // 2026-12-30
  });
  it("adds 1 year for 1y", () => {
    expect(ymd(presetExpiryDate("1y", now))).toEqual([2027, 5, 30]); // 2027-06-30
  });
  it("returns null for custom", () => {
    expect(presetExpiryDate("custom", now)).toBeNull();
  });
  it("does not mutate the passed-in now", () => {
    const ref = new Date("2026-06-30T00:00:00");
    presetExpiryDate("1y", ref);
    expect(ymd(ref)).toEqual([2026, 5, 30]); // เดิมไม่เปลี่ยน
  });
});
```

- [ ] **Step 2: รันเทสต์ ดูว่า fail**

Run: `npx jest src/services/api.test.ts -t "presetExpiryDate"`
Expected: FAIL — `presetExpiryDate is not a function` / TypeScript error ว่า export ไม่มี

- [ ] **Step 3: เขียน implementation ขั้นต่ำใน api.ts**

แทรกถัดจาก `export type VisitorQrMode = "single-use" | "long-term";` (line ~332) — วางก่อนหรือหลัง `VISITOR_TYPE_OPTIONS` block ก็ได้ ขอให้อยู่กลุ่ม type/options เดียวกัน:
```ts
// ช่วงวันหมดอายุสำหรับ QR ระยะยาว — preset ลัด + "กำหนดเอง" (เลือกวันเองผ่าน date picker)
export type ExpiryPreset = "1w" | "1m" | "3m" | "6m" | "1y" | "custom";

export const EXPIRY_PRESET_OPTIONS: { value: ExpiryPreset; label: string }[] = [
  { value: "1w", label: "1 อาทิตย์" },
  { value: "1m", label: "1 เดือน" },
  { value: "3m", label: "3 เดือน" },
  { value: "6m", label: "6 เดือน" },
  { value: "1y", label: "1 ปี" },
  { value: "custom", label: "กำหนดเอง" },
];

// คำนวณวันหมดอายุจาก now ตาม preset; "custom" คืน null (ให้ caller ใช้ค่าที่ผู้ใช้เลือกเอง)
// รับ now เป็น param (default = new Date()) เพื่อให้เทสต์ deterministic และไม่ mutate ตัวที่ส่งเข้ามา
export function presetExpiryDate(
  preset: ExpiryPreset,
  now: Date = new Date(),
): Date | null {
  if (preset === "custom") return null;
  const d = new Date(now.getTime());
  if (preset === "1w") d.setDate(d.getDate() + 7);
  else if (preset === "1m") d.setMonth(d.getMonth() + 1);
  else if (preset === "3m") d.setMonth(d.getMonth() + 3);
  else if (preset === "6m") d.setMonth(d.getMonth() + 6);
  else if (preset === "1y") d.setFullYear(d.getFullYear() + 1);
  return d;
}
```

- [ ] **Step 4: รันเทสต์ ดูว่า pass**

Run: `npx jest src/services/api.test.ts -t "presetExpiryDate"`
Expected: PASS (6 assertions ใน 5 it)

- [ ] **Step 5: รันเทสต์ทั้งไฟล์ กันของเดิมพัง**

Run: `npx jest src/services/api.test.ts`
Expected: PASS ทั้งหมด (ของเดิม + presetExpiryDate ใหม่)

- [ ] **Step 6: Commit**

```bash
git add src/services/api.ts src/services/api.test.ts
git commit -m "feat: add presetExpiryDate helper and expiry preset options"
```

---

## Task 2: UI — chips เลือกวันหมดอายุใน WalkInScreen

**Files:**
- Modify: `src/screens/WalkInScreen.tsx`

**Interfaces:**
- Consumes (จาก Task 1): `ExpiryPreset`, `EXPIRY_PRESET_OPTIONS`, `presetExpiryDate` จาก `../services/api`
- Produces: UI เท่านั้น (ไม่มี export ใหม่ให้ task อื่นใช้)

> ไม่มี node-jest test สำหรับ task นี้ (เป็น component RN ที่ import expo/datetimepicker — ทดสอบใน node ไม่ได้ ตาม baseline เดิมของโปรเจกต์) verification = `npx tsc --noEmit` + ตรวจด้วยตาบนเครื่องจริง

- [ ] **Step 1: เพิ่ม import จาก api**

แก้ import block (`src/screens/WalkInScreen.tsx` line 19-32) เพิ่ม 3 ชื่อ — ใส่เรียงตามลำดับเดิม:
```ts
import {
  createWalkInVisit,
  EXPIRY_PRESET_OPTIONS,
  ExpiryPreset,
  HrEmployee,
  maskIdNumber,
  ocrLicensePlate,
  presetExpiryDate,
  searchHrEmployees,
  visitorQrUrl,
  VISITOR_TYPE_OPTIONS,
  visitorTypeNeedsCompany,
  visitorTypeNeedsHost,
  visitorTypeNeedsIdCard,
  VisitorQrMode,
  VisitorType,
} from "../services/api";
```

- [ ] **Step 2: เพิ่ม state `expiryPreset`**

หลังบรรทัด `const [showExpiryPicker, setShowExpiryPicker] = useState(false);` (line ~47) เพิ่ม:
```ts
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("1m");
```

- [ ] **Step 3: ลบ `defaultExpiryDate()` เดิม แล้วชี้ callers มาที่ `presetExpiryDate("1m")!`**

3a. ลบฟังก์ชันนี้ทั้งบล็อก (line ~786-790):
```ts
function defaultExpiryDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}
```

3b. ปุ่ม segment "ระยะยาว" `onPress` (line ~506-510) — เปลี่ยน `defaultExpiryDate()` → `presetExpiryDate("1m")!`:
```ts
              onPress={() => {
                setQrMode("long-term");
                setExpiryDate((prev) => prev ?? presetExpiryDate("1m")!);
              }}
```

3c. `value` ของ `DateTimePicker` (line ~530) — เปลี่ยน `defaultExpiryDate()` → `presetExpiryDate("1m")!`:
```ts
                value={expiryDate ?? presetExpiryDate("1m")!}
```

- [ ] **Step 4: เพิ่ม handler `handleExpiryPreset`**

วางใกล้ฟังก์ชัน handler อื่นๆ ใน component เช่นหลัง `handleVisitorTypeChange` (line ~143):
```ts
  function handleExpiryPreset(preset: ExpiryPreset) {
    setExpiryPreset(preset);
    if (preset === "custom") {
      setShowExpiryPicker(true);
    } else {
      setShowExpiryPicker(false);
      setExpiryDate(presetExpiryDate(preset));
    }
  }
```

- [ ] **Step 5: อัปเดต `resetForm` ให้รีเซ็ต preset**

ใน `resetForm` (line ~117-133) มี `setExpiryDate(null);` ตามด้วย `setShowExpiryPicker(false);` อยู่แล้ว
แทรก **บรรทัดเดียว** `setExpiryPreset("1m");` คั่นระหว่างสองบรรทัดนั้น โดยแก้:
```ts
    setExpiryDate(null);
    setShowExpiryPicker(false);
```
เป็น:
```ts
    setExpiryDate(null);
    setExpiryPreset("1m");
    setShowExpiryPicker(false);
```

- [ ] **Step 6: เพิ่ม chips + บรรทัดวันที่ในฟิลด์ "วันหมดอายุ"**

แทนที่ทั้งบล็อก `{qrMode === "long-term" && ( ... )}` (line ~517-553) ด้วย:
```tsx
        {qrMode === "long-term" && (
          <Field label="วันหมดอายุ">
            <View style={styles.typeRow}>
              {EXPIRY_PRESET_OPTIONS.map((option) => {
                const active = expiryPreset === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => handleExpiryPreset(option.value)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.typeChipText,
                        active && styles.typeChipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {expiryPreset === "custom" ? (
              <>
                <TouchableOpacity
                  style={[styles.input, styles.dateInput]}
                  onPress={() => setShowExpiryPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={expiryDate ? styles.dateText : styles.datePlaceholder}
                  >
                    {expiryDate ? formatDateLocal(expiryDate) : "เลือกวันหมดอายุ"}
                  </Text>
                </TouchableOpacity>
                {showExpiryPicker && (
                  <DateTimePicker
                    value={expiryDate ?? presetExpiryDate("1m")!}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    minimumDate={new Date()}
                    onChange={(event, selected) => {
                      if (Platform.OS !== "ios") setShowExpiryPicker(false);
                      if (event.type === "set" && selected) {
                        setExpiryDate(selected);
                      } else if (event.type === "dismissed") {
                        setShowExpiryPicker(false);
                      }
                    }}
                  />
                )}
                {Platform.OS === "ios" && showExpiryPicker && (
                  <TouchableOpacity
                    style={styles.dateDoneBtn}
                    onPress={() => setShowExpiryPicker(false)}
                  >
                    <Text style={styles.dateDoneText}>เสร็จ</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              expiryDate && (
                <Text style={styles.helperText}>
                  หมดอายุ {formatDateLocal(expiryDate)}
                </Text>
              )
            )}
          </Field>
        )}
```

- [ ] **Step 7: ตรวจ type ทั้งโปรเจกต์ ว่าไม่มี error ใหม่**

Run: `npx tsc --noEmit`
Expected: error เท่ากับ baseline เดิม (~8 ตัวจาก expo-* ใน `app/`) — **ต้องไม่มี** error ใหม่ที่ชี้มาที่ `WalkInScreen.tsx` หรือ `api.ts`
(ถ้าจำนวน/ตำแหน่ง error ไม่ตรง baseline ให้ย้อนดู diff ของ task นี้)

- [ ] **Step 8: รันเทสต์ทั้งชุด กันพังข้ามไฟล์**

Run: `npx jest`
Expected: PASS ทั้งหมด

- [ ] **Step 9: Commit**

```bash
git add src/screens/WalkInScreen.tsx
git commit -m "feat: expiry-date preset chips on walk-in long-term QR"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 ครอบ unit `1` (api.ts type+helper+options) + เทสต์ทั้ง 6 เคสในส่วน "เทสต์"; Task 2 ครอบ units `2`-`5` (state, handler, UI, flow, resetForm) ของ spec
- **Validation คงเดิม:** ไม่มี task แตะ `validate()` — spec ระบุคงเดิม ✓
- **ส่งค่า server คงเดิม:** ไม่มี task แตะ `submit()` payload ✓
- **Type consistency:** `ExpiryPreset` / `presetExpiryDate` / `EXPIRY_PRESET_OPTIONS` ใช้ชื่อตรงกันทั้ง Task 1 (นิยาม) และ Task 2 (import+ใช้) ✓
- **defaultExpiryDate:** ลบใน Task 2 Step 3a และแทน caller 2 จุด (3b, 3c) — ไม่มีการอ้าง `defaultExpiryDate` หลงเหลือ ✓
