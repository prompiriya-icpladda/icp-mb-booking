# Visit History (ประวัติการเข้า) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มแท็บล่างที่ 4 "ประวัติการเข้า" ให้ รปภ. ดูรายการผู้มาติดต่อย้อนหลังทั้งหมด (walk-in/ล่วงหน้า/ระยะยาว) พร้อมค้นหา, dropdown ประเภท, กรองมีรถ/ไม่มีรถ และเลือกช่วงเวลา (ค่าเริ่มต้น 90 วัน)

**Architecture:** เพิ่ม endpoint `GET /history?days=N` แบบ no-auth ฝั่ง server (mirror `/long-term`) คืนใบนัดย้อนหลังตามช่วงวัน → mobile ดึงมาทั้งชุดแล้วกรอง/ค้นหาในเครื่องด้วย pure logic → แสดงในหน้าจอ read-only ใหม่ เข้าถึงจากแท็บล่างที่ 4

**Tech Stack:** React Native (Expo) + TypeScript (Jest) ฝั่ง mobile; Express + Mongoose (Vitest) ฝั่ง server

## Global Constraints

- **สอง repo:** mobile = `C:\Project\ICPBooking\icp-mb-booking` (git root เดียวกัน); server = `C:\Project\ICPBooking\ICPBooking` (โฟลเดอร์ `server/`)
- **⚠️ repo `ICPBooking` ใช้ branch ร่วมกับ workstream อื่น** — ก่อน commit ให้ `git -C C:/Project/ICPBooking/ICPBooking status` ตรวจว่าไม่มีไฟล์คนอื่นค้าง และ `git add` เฉพาะไฟล์ที่ระบุในแต่ละ task เท่านั้น (ห้าม `git add -A` / `git add .`)
- **Mobile test:** `npm test` = `jest`; ไฟล์เทสต์ `*.test.ts` วางข้างไฟล์จริง; ทดสอบเฉพาะ pure function (ไม่ mock fetch/RN)
- **Server test:** `npm test` = `vitest run` (globals: true — `describe/it/expect` ใช้ได้เลย ไม่ต้อง import)
- **tsc baseline:** `npx tsc --noEmit` ฝั่ง mobile มี error เดิม ~8 อัน (expo-* ใน `app/` scaffold) — ห้ามเพิ่ม error ใหม่นอกเหนือจากนี้
- **PII:** endpoint ห้าม select/ส่ง `visitorCitizenId`
- **Route ordering:** route ใหม่ต้องอยู่ **ก่อน** `router.get("/:id", ...)` มิฉะนั้น Express จับ "history" เป็น `:id`
- **วันที่ทั้งหมดเป็น UTC date-part** (`toISOString().slice(0,10)` / `addDays`) ให้ตรงกับ route เดิม

---

### Task 1: Server — `historyCutoffDate` helper (pure, TDD)

**Files:**
- Modify: `C:\Project\ICPBooking\ICPBooking\server\utils\visitor-appointment-core.js` (เพิ่มฟังก์ชัน + ใส่ใน `module.exports`)
- Test: `C:\Project\ICPBooking\ICPBooking\server\utils\visitor-appointment-core.test.js` (เพิ่ม describe block)

**Interfaces:**
- Consumes: `addDays(dateStr, days)` เดิม (คืน `yyyy-MM-dd`)
- Produces: `historyCutoffDate(days: number|string, now?: Date): string | null` — คืนวันตัด (`yyyy-MM-dd`) = วันนี้ − days; คืน `null` เมื่อ days ≤ 0 / ว่าง / NaN (= ไม่จำกัดช่วง)

- [ ] **Step 1: Write the failing test** — เพิ่มท้ายไฟล์ `visitor-appointment-core.test.js`

```js
describe("historyCutoffDate", () => {
  const NOW = new Date("2026-07-01T08:00:00.000Z");
  it("returns date N days before now for positive days", () => {
    expect(historyCutoffDate(90, NOW)).toBe("2026-04-02");
    expect(historyCutoffDate(7, NOW)).toBe("2026-06-24");
  });
  it("returns null for 0 / negative / NaN / empty (unbounded)", () => {
    expect(historyCutoffDate(0, NOW)).toBe(null);
    expect(historyCutoffDate(-5, NOW)).toBe(null);
    expect(historyCutoffDate(NaN, NOW)).toBe(null);
    expect(historyCutoffDate("", NOW)).toBe(null);
  });
  it("parses numeric strings", () => {
    expect(historyCutoffDate("30", NOW)).toBe("2026-06-01");
  });
  it("crosses year boundary correctly", () => {
    expect(historyCutoffDate(1, new Date("2026-01-01T00:00:00.000Z"))).toBe("2025-12-31");
  });
});
```

จากนั้นเพิ่ม `historyCutoffDate` ในรายการ destructure บนสุดของไฟล์เทสต์ (ต่อจาก `closeLastOpenCheckin,`):

```js
  closeLastOpenCheckin,
  historyCutoffDate,
} = require("./visitor-appointment-core");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- visitor-appointment-core` (cwd = `C:\Project\ICPBooking\ICPBooking\server`)
Expected: FAIL — `historyCutoffDate is not a function`

- [ ] **Step 3: Write minimal implementation** — ใน `visitor-appointment-core.js` เพิ่มฟังก์ชัน (วางถัดจาก `addMonths` ~บรรทัด 77)

```js
// วันตัดสำหรับประวัติย้อนหลัง = วันนี้ − days (UTC). days<=0/ว่าง/NaN → null (= ไม่จำกัดช่วง)
function historyCutoffDate(days, now = new Date()) {
  const n = parseInt(days, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const today = now.toISOString().slice(0, 10);
  return addDays(today, -n);
}
```

แล้วเพิ่มใน `module.exports` (ต่อจาก `addDays,`):

```js
  addDays,
  addMonths,
  historyCutoffDate,
```
(เพิ่มเฉพาะบรรทัด `historyCutoffDate,` ให้ครบ ถ้า `addDays,`/`addMonths,` มีอยู่แล้ว)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- visitor-appointment-core`
Expected: PASS ทุกเคส (รวมของเดิม)

- [ ] **Step 5: Commit** (repo ICPBooking — stage เฉพาะ 2 ไฟล์นี้)

```bash
git -C C:/Project/ICPBooking/ICPBooking status
git -C C:/Project/ICPBooking/ICPBooking add server/utils/visitor-appointment-core.js server/utils/visitor-appointment-core.test.js
git -C C:/Project/ICPBooking/ICPBooking commit -m "feat(visitor): add historyCutoffDate helper for visit history range"
```

---

### Task 2: Server — `GET /history` route

**Files:**
- Modify: `C:\Project\ICPBooking\ICPBooking\server\routes\visitor-appointments.js` (เพิ่ม route ระหว่าง `/long-term` (จบ ~บรรทัด 243) และ `/stream` (~245) — คือ **ก่อน** `/:id` ~269)

**Interfaces:**
- Consumes: `historyCutoffDate` (Task 1), `VisitorAppointment` model (import อยู่แล้ว)
- Produces: `GET /api/visitor-appointments/history?days=90` → `TodayAppointment[]`-shaped JSON (รวม `source`, `completedAt`, `createdAt`)

- [ ] **Step 1: เพิ่ม import helper** — แก้บล็อก destructure จาก `require("../utils/visitor-appointment-core")` (บรรทัด ~10-22) เพิ่ม `historyCutoffDate` เข้าไปในลิสต์:

```js
  appendCheckin,
  closeLastOpenCheckin,
  historyCutoffDate,
} = require("../utils/visitor-appointment-core");
```

- [ ] **Step 2: เพิ่ม route** — วางถัดจากบล็อก `router.get("/long-term", ...)` (หลังบรรทัด ~243) ก่อน comment ของ `/stream`

```js
// GET /api/visitor-appointments/history?days=90 — ประวัติผู้มาติดต่อย้อนหลัง (no auth เหมือน /today, /long-term)
// days=0 หรือค่าผิด(ที่ไม่ใช่จำนวนบวก) → ทั้งหมด; default 90 เมื่อไม่ส่ง param
router.get("/history", async (req, res) => {
  try {
    const raw = req.query.days;
    const days = raw === undefined ? 90 : parseInt(raw, 10);
    const cutoff = historyCutoffDate(Number.isNaN(days) ? 90 : days);
    const filter = { deletedAt: null };
    if (cutoff) filter.appointmentDate = { $gte: cutoff };
    const records = await VisitorAppointment.find(filter)
      .sort({ appointmentDate: -1, appointmentTime: -1 })
      .limit(2000)
      .select("_id visitorName visitorType visitorOrganization appointmentDate appointmentTime expiryDate purpose hasVehicle vehicleCount licensePlates licensePlate checkedInAt completedAt visitorCount createdByName source qrMode createdAt")
      .lean();
    res.json(records);
  } catch (err) {
    console.error("GET /api/visitor-appointments/history error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 3: Syntax/load check** — ยืนยันไฟล์ route โหลดได้ไม่มี error และ route ก่อน `/:id`

Run: `node -e "require('./routes/visitor-appointments.js'); console.log('route module loaded OK')"` (cwd = `C:\Project\ICPBooking\ICPBooking\server`)
Expected: พิมพ์ `route module loaded OK` (ไม่มี SyntaxError)

ตรวจด้วยตา: บรรทัด `router.get("/history"` อยู่ **เหนือ** `router.get("/:id"` ในไฟล์

- [ ] **Step 4: Run full server test suite (ไม่ regress)**

Run: `npm test` (cwd = `C:\Project\ICPBooking\ICPBooking\server`)
Expected: PASS ทั้งหมด (route ใหม่ไม่มี unit test — ตามแพทเทิร์น repo ที่ไม่มี route test; ครอบด้วย device test ภายหลัง)

- [ ] **Step 5: Commit** (stage เฉพาะไฟล์ route)

```bash
git -C C:/Project/ICPBooking/ICPBooking status
git -C C:/Project/ICPBooking/ICPBooking add server/routes/visitor-appointments.js
git -C C:/Project/ICPBooking/ICPBooking commit -m "feat(visitor): add GET /history endpoint for visit history"
```

---

### Task 3: Mobile — filter logic (pure, TDD)

**Files:**
- Create: `C:\Project\ICPBooking\icp-mb-booking\src\utils\visitHistory.logic.ts`
- Test: `C:\Project\ICPBooking\icp-mb-booking\src\utils\visitHistory.logic.test.ts`

**Interfaces:**
- Consumes: `TodayAppointment` จาก `../services/api` (จะเพิ่ม `source`/`createdAt` ใน Task 4 — Task นี้ใช้เฉพาะฟิลด์เดิม + `source`, ซึ่งจะ compile ผ่านหลัง Task 4; ถ้าทำ Task 3 ก่อน 4 ให้ทำ Task 4 ให้เสร็จก่อนรัน tsc รวม)
- Produces:
  - `type HistoryTypeFilter = "all" | "walk-in" | "advance" | "long-term"`
  - `type VehicleFilter = "all" | "with" | "without"`
  - `interface HistoryFilterState { search: string; type: HistoryTypeFilter; vehicle: VehicleFilter }`
  - `matchesType(item, type): boolean`, `matchesVehicle(item, vehicle): boolean`, `matchesSearch(item, query): boolean`
  - `filterHistory(items: TodayAppointment[], state: HistoryFilterState): TodayAppointment[]`

> **หมายเหตุลำดับ:** ทำ **Task 4 ก่อน Task 3** ได้ (Task 4 เพิ่ม `source` เข้า type ที่ Task 3 ใช้). ถ้า subagent ทำ Task 3 ก่อน ให้เพิ่ม `source?: "walk-in" | "advance"` ชั่วคราวไม่ได้ — ให้ทำ Task 4 เสร็จก่อนค่อยรัน `tsc`. เทสต์ Jest ของ Task 3 รันได้เลยเพราะ ts-jest คอมไพล์เฉพาะไฟล์ที่แตะ.

- [ ] **Step 1: Write the failing test** — `visitHistory.logic.test.ts`

```ts
import {
  filterHistory,
  matchesSearch,
  matchesType,
  matchesVehicle,
} from "./visitHistory.logic";
import { TodayAppointment } from "../services/api";

function appt(over: Partial<TodayAppointment> = {}): TodayAppointment {
  return {
    _id: "1",
    visitorName: "สมชาย ใจดี",
    visitorOrganization: "บริษัท เอ",
    appointmentDate: "2026-07-01",
    appointmentTime: "09:00",
    purpose: "ประชุม",
    hasVehicle: false,
    licensePlate: "",
    checkedInAt: null,
    visitorCount: 1,
    createdByName: "คุณเอ",
    source: "advance",
    qrMode: "single-use",
    ...over,
  };
}

describe("matchesType", () => {
  it("all → true เสมอ", () => {
    expect(matchesType(appt({ source: "walk-in" }), "all")).toBe(true);
  });
  it("walk-in / advance ดูจาก source", () => {
    expect(matchesType(appt({ source: "walk-in" }), "walk-in")).toBe(true);
    expect(matchesType(appt({ source: "advance" }), "walk-in")).toBe(false);
    expect(matchesType(appt({ source: "advance" }), "advance")).toBe(true);
  });
  it("long-term ดูจาก qrMode (ครอบทั้ง walk-in และ advance)", () => {
    expect(matchesType(appt({ source: "walk-in", qrMode: "long-term" }), "long-term")).toBe(true);
    expect(matchesType(appt({ source: "advance", qrMode: "long-term" }), "long-term")).toBe(true);
    expect(matchesType(appt({ qrMode: "single-use" }), "long-term")).toBe(false);
  });
});

describe("matchesVehicle", () => {
  it("all → true เสมอ", () => {
    expect(matchesVehicle(appt({ hasVehicle: true }), "all")).toBe(true);
    expect(matchesVehicle(appt({ hasVehicle: false }), "all")).toBe(true);
  });
  it("with → เฉพาะมีรถ, without → เฉพาะไม่มีรถ", () => {
    expect(matchesVehicle(appt({ hasVehicle: true }), "with")).toBe(true);
    expect(matchesVehicle(appt({ hasVehicle: false }), "with")).toBe(false);
    expect(matchesVehicle(appt({ hasVehicle: false }), "without")).toBe(true);
    expect(matchesVehicle(appt({ hasVehicle: true }), "without")).toBe(false);
  });
});

describe("matchesSearch", () => {
  it("ว่าง/ช่องว่าง → true", () => {
    expect(matchesSearch(appt(), "")).toBe(true);
    expect(matchesSearch(appt(), "   ")).toBe(true);
  });
  it("ค้นชื่อผู้มา / คนที่มาหา / วัตถุประสงค์ / องค์กร / ทะเบียน", () => {
    expect(matchesSearch(appt({ visitorName: "สมชาย" }), "สมชาย")).toBe(true);
    expect(matchesSearch(appt({ createdByName: "คุณบี" }), "บี")).toBe(true);
    expect(matchesSearch(appt({ purpose: "ส่งของ" }), "ส่งของ")).toBe(true);
    expect(matchesSearch(appt({ visitorOrganization: "ไอซีพี" }), "ไอซีพี")).toBe(true);
    expect(matchesSearch(appt({ licensePlate: "1กก1234" }), "1234")).toBe(true);
  });
  it("ไม่สนตัวพิมพ์ใหญ่เล็ก และไม่พบ → false", () => {
    expect(matchesSearch(appt({ visitorName: "John Doe" }), "john")).toBe(true);
    expect(matchesSearch(appt({ visitorName: "สมชาย" }), "xyz")).toBe(false);
  });
});

describe("filterHistory", () => {
  const items = [
    appt({ _id: "a", source: "walk-in", qrMode: "single-use", hasVehicle: true, licensePlate: "1กก1", visitorName: "แดง" }),
    appt({ _id: "b", source: "advance", qrMode: "single-use", hasVehicle: false, visitorName: "ดำ" }),
    appt({ _id: "c", source: "walk-in", qrMode: "long-term", hasVehicle: true, licensePlate: "2ขข2", visitorName: "เขียว" }),
  ];
  it("รวม 3 เงื่อนไขแบบ AND", () => {
    const out = filterHistory(items, { search: "", type: "walk-in", vehicle: "with" });
    expect(out.map((i) => i._id)).toEqual(["a", "c"]);
  });
  it("type long-term + search ทะเบียน", () => {
    const out = filterHistory(items, { search: "2ขข", type: "long-term", vehicle: "all" });
    expect(out.map((i) => i._id)).toEqual(["c"]);
  });
  it("ไม่มีตัวกรอง → คืนทุกอัน", () => {
    expect(filterHistory(items, { search: "", type: "all", vehicle: "all" })).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- visitHistory.logic` (cwd = `C:\Project\ICPBooking\icp-mb-booking`)
Expected: FAIL — Cannot find module `./visitHistory.logic`

- [ ] **Step 3: Write minimal implementation** — `visitHistory.logic.ts`

```ts
import { TodayAppointment } from "../services/api";

export type HistoryTypeFilter = "all" | "walk-in" | "advance" | "long-term";
export type VehicleFilter = "all" | "with" | "without";

export interface HistoryFilterState {
  search: string;
  type: HistoryTypeFilter;
  vehicle: VehicleFilter;
}

// long-term ดูจาก qrMode (ครอบทั้ง walk-in/advance ที่เป็น QR ระยะยาว); walk-in/advance ดูจาก source
export function matchesType(item: TodayAppointment, type: HistoryTypeFilter): boolean {
  if (type === "all") return true;
  if (type === "long-term") return item.qrMode === "long-term";
  return item.source === type;
}

export function matchesVehicle(item: TodayAppointment, vehicle: VehicleFilter): boolean {
  if (vehicle === "all") return true;
  return vehicle === "with" ? !!item.hasVehicle : !item.hasVehicle;
}

// ค้นหาแบบไม่สนตัวพิมพ์: ชื่อผู้มา + คนที่มาหา + วัตถุประสงค์ + องค์กร + ทะเบียนรถ
export function matchesSearch(item: TodayAppointment, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    item.visitorName,
    item.createdByName,
    item.purpose,
    item.visitorOrganization,
    item.licensePlate,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function filterHistory(
  items: TodayAppointment[],
  state: HistoryFilterState,
): TodayAppointment[] {
  return items.filter(
    (item) =>
      matchesType(item, state.type) &&
      matchesVehicle(item, state.vehicle) &&
      matchesSearch(item, state.search),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- visitHistory.logic`
Expected: PASS ทุกเคส

- [ ] **Step 5: Commit** (repo mobile)

```bash
git -C C:/Project/ICPBooking/icp-mb-booking add src/utils/visitHistory.logic.ts src/utils/visitHistory.logic.test.ts
git -C C:/Project/ICPBooking/icp-mb-booking commit -m "feat: add visit history filter logic (search/type/vehicle)"
```

---

### Task 4: Mobile — API client (`getVisitorHistory` + type fields)

**Files:**
- Modify: `C:\Project\ICPBooking\icp-mb-booking\src\services\api.ts` (interface `TodayAppointment` ~บรรทัด 77-93; เพิ่มฟังก์ชันถัดจาก `getActiveLongTermAppointments` ~บรรทัด 149)

**Interfaces:**
- Produces:
  - `TodayAppointment` เพิ่ม `source?: "walk-in" | "advance"` และ `createdAt?: string`
  - `getVisitorHistory(days: number): Promise<TodayAppointment[]>`

- [ ] **Step 1: เพิ่มฟิลด์ใน `TodayAppointment`** — ต่อท้ายก่อนปิด `}` ของ interface (หลัง `visitorType?: VisitorType;`)

```ts
  visitorType?: VisitorType;
  source?: "walk-in" | "advance";
  createdAt?: string;
}
```

- [ ] **Step 2: เพิ่มฟังก์ชัน `getVisitorHistory`** — วางถัดจาก `getActiveLongTermAppointments` (หลังบรรทัด ~149)

```ts
// ประวัติผู้มาติดต่อย้อนหลังตามจำนวนวัน (days=0 = ทั้งหมด) — ใช้กับแท็บ "ประวัติการเข้า"
export async function getVisitorHistory(days: number): Promise<TodayAppointment[]> {
  const res = await fetch(`${API_URL}/visitor-appointments/history?days=${days}`);
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}
```

- [ ] **Step 3: ตรวจ type + เทสต์เดิมไม่พัง**

Run: `npx tsc --noEmit` (cwd = mobile) → ต้องไม่มี error ใหม่นอกจาก baseline ~8 expo-* เดิม
Run: `npm test -- api.test` → PASS (เทสต์เดิมยังผ่าน)

- [ ] **Step 4: Commit**

```bash
git -C C:/Project/ICPBooking/icp-mb-booking add src/services/api.ts
git -C C:/Project/ICPBooking/icp-mb-booking commit -m "feat: add getVisitorHistory API + source/createdAt fields"
```

---

### Task 5: Mobile — `VisitHistoryScreen.tsx`

**Files:**
- Create: `C:\Project\ICPBooking\icp-mb-booking\src\screens\VisitHistoryScreen.tsx`

**Interfaces:**
- Consumes: `getVisitorHistory`, `longTermStatus`, `LongTermStatus`, `TodayAppointment` (api.ts); `filterHistory`, `HistoryTypeFilter`, `VehicleFilter` (visitHistory.logic.ts)
- Produces: `export default function VisitHistoryScreen()` — ใช้ใน App.tsx (Task 6)

- [ ] **Step 1: เขียนไฟล์เต็ม** — `VisitHistoryScreen.tsx`

```tsx
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  getVisitorHistory,
  longTermStatus,
  LongTermStatus,
  TodayAppointment,
} from "../services/api";
import {
  filterHistory,
  HistoryTypeFilter,
  VehicleFilter,
} from "../utils/visitHistory.logic";

const RANGE_OPTIONS: { days: number; label: string }[] = [
  { days: 7, label: "7 วัน" },
  { days: 30, label: "30 วัน" },
  { days: 90, label: "90 วัน" },
  { days: 0, label: "ทั้งหมด" },
];

const TYPE_OPTIONS: { value: HistoryTypeFilter; label: string }[] = [
  { value: "all", label: "ทุกประเภท" },
  { value: "walk-in", label: "Walk-in" },
  { value: "advance", label: "ล่วงหน้า" },
  { value: "long-term", label: "ระยะยาว" },
];

const VEHICLE_OPTIONS: { value: VehicleFilter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "with", label: "มีรถ" },
  { value: "without", label: "ไม่มีรถ" },
];

export default function VisitHistoryScreen() {
  const [items, setItems] = useState<TodayAppointment[]>([]);
  const [days, setDays] = useState(90);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<HistoryTypeFilter>("all");
  const [vehicle, setVehicle] = useState<VehicleFilter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await getVisitorHistory(days);
      setItems(data);
      setError(null);
    } catch {
      setError("ไม่สามารถโหลดประวัติได้");
    }
  }, [days]);

  useEffect(() => {
    setLoading(true);
    fetchHistory().finally(() => setLoading(false));
  }, [fetchHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  }, [fetchHistory]);

  const filtered = filterHistory(items, { search, type, vehicle });
  const typeLabel =
    TYPE_OPTIONS.find((o) => o.value === type)?.label ?? "ทุกประเภท";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ประวัติการเข้า</Text>
        <Text style={styles.headerDate}>ผู้มาติดต่อย้อนหลัง</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filtered.length} รายการ</Text>
        </View>
      </View>

      {/* ช่วงเวลา */}
      <View style={styles.rangeRow}>
        {RANGE_OPTIONS.map((o) => (
          <TouchableOpacity
            key={o.days}
            style={[styles.rangeChip, days === o.days && styles.rangeChipActive]}
            onPress={() => setDays(o.days)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.rangeChipText,
                days === o.days && styles.rangeChipTextActive,
              ]}
            >
              {o.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ค้นหา */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="ค้นหา ชื่อ / คนที่มาหา / วัตถุประสงค์ / ทะเบียน"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ตัวกรอง: dropdown ประเภท + ชิปรถ */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setTypePickerOpen(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.dropdownText}>{typeLabel}</Text>
          <Text style={styles.dropdownCaret}>▾</Text>
        </TouchableOpacity>
        <View style={styles.vehicleChips}>
          {VEHICLE_OPTIONS.map((o) => (
            <TouchableOpacity
              key={o.value}
              style={[styles.vChip, vehicle === o.value && styles.vChipActive]}
              onPress={() => setVehicle(o.value)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.vChipText,
                  vehicle === o.value && styles.vChipTextActive,
                ]}
              >
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
            <Text style={styles.retryText}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#16a34a"]}
              tintColor="#16a34a"
            />
          }
          contentContainerStyle={
            filtered.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>📖</Text>
              <Text style={styles.emptyText}>ไม่พบประวัติ</Text>
            </View>
          }
          renderItem={({ item }) => <HistoryCard item={item} />}
        />
      )}

      {/* Modal เลือกประเภท */}
      <Modal
        visible={typePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTypePickerOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setTypePickerOpen(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>เลือกประเภท</Text>
            {TYPE_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.value}
                style={[
                  styles.modalOption,
                  type === o.value && styles.modalOptionActive,
                ]}
                onPress={() => {
                  setType(o.value);
                  setTypePickerOpen(false);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    type === o.value && styles.modalOptionTextActive,
                  ]}
                >
                  {o.label}
                </Text>
                {type === o.value && <Text style={styles.modalCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function statusLabel(s: LongTermStatus): string {
  return s === "registered"
    ? "ยังไม่เข้า"
    : s === "arrived"
      ? "เข้าแล้ว"
      : "เช็คเอาท์แล้ว";
}

function typeBadge(item: TodayAppointment): string {
  if (item.qrMode === "long-term") return "ระยะยาว";
  return item.source === "walk-in" ? "Walk-in" : "ล่วงหน้า";
}

function HistoryCard({ item }: { item: TodayAppointment }) {
  const s = longTermStatus(item);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.visitorName}>{item.visitorName}</Text>
          {!!item.visitorOrganization && (
            <Text style={styles.organization}>{item.visitorOrganization}</Text>
          )}
        </View>
        <View style={styles.badgeCol}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{typeBadge(item)}</Text>
          </View>
          <Text style={styles.statusText}>{statusLabel(s)}</Text>
        </View>
      </View>
      <View style={styles.pillRow}>
        <Pill
          icon="📅"
          text={`${item.appointmentDate}${item.appointmentTime ? ` ${item.appointmentTime}` : ""}`}
        />
        {!!item.purpose && <Pill icon="📌" text={item.purpose} />}
        {item.visitorCount > 1 && <Pill icon="👥" text={`${item.visitorCount} คน`} />}
        {item.hasVehicle ? (
          <Pill icon="🚗" text={item.licensePlate || "มีรถ"} />
        ) : null}
      </View>
      <Text style={styles.host}>มาหา: {item.createdByName || "-"}</Text>
    </View>
  );
}

function Pill({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillIcon}>{icon}</Text>
      <Text style={styles.pillText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    backgroundColor: "#1f2937",
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  headerDate: { color: "#9ca3af", fontSize: 12, marginTop: 2 },
  countBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#16a34a",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 99,
    marginTop: 10,
  },
  countText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  rangeRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#fff",
  },
  rangeChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  rangeChipActive: { backgroundColor: "#16a34a" },
  rangeChipText: { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  rangeChipTextActive: { color: "#fff" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: "#111827" },
  searchClear: { fontSize: 14, color: "#9ca3af", paddingHorizontal: 4 },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
    minWidth: 120,
  },
  dropdownText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  dropdownCaret: { fontSize: 12, color: "#6b7280" },
  vehicleChips: { flexDirection: "row", gap: 6, flex: 1, justifyContent: "flex-end" },
  vChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  vChipActive: { backgroundColor: "#1f2937" },
  vChipText: { fontSize: 12, fontWeight: "600", color: "#6b7280" },
  vChipTextActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyContainer: { flexGrow: 1 },
  listContent: { padding: 16, gap: 12 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: "#6b7280", fontSize: 15 },
  errorText: { color: "#dc2626", fontSize: 14, marginBottom: 12, textAlign: "center" },
  retryBtn: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  cardLeft: { flex: 1, marginRight: 8 },
  visitorName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  organization: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  badgeCol: { alignItems: "flex-end", gap: 4 },
  typeBadge: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  typeBadgeText: { fontSize: 11, fontWeight: "700", color: "#2563eb" },
  statusText: { fontSize: 11, color: "#6b7280" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  pillIcon: { fontSize: 11 },
  pillText: { fontSize: 12, color: "#374151" },
  host: { fontSize: 11, color: "#9ca3af" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    width: "100%",
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    padding: 8,
    marginBottom: 4,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
  },
  modalOptionActive: { backgroundColor: "#f0fdf4" },
  modalOptionText: { fontSize: 14, color: "#374151" },
  modalOptionTextActive: { color: "#16a34a", fontWeight: "700" },
  modalCheck: { fontSize: 14, color: "#16a34a", fontWeight: "700" },
});
```

- [ ] **Step 2: ตรวจ type**

Run: `npx tsc --noEmit` (cwd = mobile)
Expected: ไม่มี error ใหม่ (นอกจาก baseline ~8 expo-* เดิม)

- [ ] **Step 3: Commit**

```bash
git -C C:/Project/ICPBooking/icp-mb-booking add src/screens/VisitHistoryScreen.tsx
git -C C:/Project/ICPBooking/icp-mb-booking commit -m "feat: add VisitHistoryScreen (history list + filters)"
```

---

### Task 6: Mobile — เพิ่มแท็บล่างที่ 4 ใน `App.tsx`

**Files:**
- Modify: `C:\Project\ICPBooking\icp-mb-booking\App.tsx`

**Interfaces:**
- Consumes: `VisitHistoryScreen` (Task 5)

- [ ] **Step 1: import หน้าจอ** — เพิ่มบรรทัด import (ต่อจาก import `ScannerScreen`)

```tsx
import ScannerScreen from "./src/screens/ScannerScreen";
import VisitHistoryScreen from "./src/screens/VisitHistoryScreen";
import WalkInScreen from "./src/screens/WalkInScreen";
```

- [ ] **Step 2: ขยาย type `Tab`** — บรรทัด 20

```tsx
type Tab = "notification" | "scanner" | "walkIn" | "history";
```

- [ ] **Step 3: เพิ่มปุ่มแท็บใน `TabBar`** — วางถัดจาก TouchableOpacity ของ "walkIn" (ก่อนปิด `</View>` ของ `styles.tabBar`)

```tsx
      <TouchableOpacity
        style={[styles.tab, active === "history" && styles.tabActive]}
        onPress={() => onSelect("history")}
        activeOpacity={0.7}
      >
        <Text style={styles.tabIcon}>📖</Text>
        <Text
          style={[
            styles.tabLabel,
            active === "history" && styles.tabLabelActive,
          ]}
        >
          ประวัติการเข้า
        </Text>
      </TouchableOpacity>
```

- [ ] **Step 4: เพิ่ม branch การ render ใน `MainApp`** — แก้ปลายโซ่ ternary (ปัจจุบันจบด้วย `<WalkInScreen />`) ให้เป็น

```tsx
        ) : activeTab === "walkIn" ? (
          <WalkInScreen />
        ) : (
          <VisitHistoryScreen />
        )}
```

- [ ] **Step 5: ตรวจ type**

Run: `npx tsc --noEmit` (cwd = mobile)
Expected: ไม่มี error ใหม่ (นอกจาก baseline ~8 expo-* เดิม)

- [ ] **Step 6: Commit**

```bash
git -C C:/Project/ICPBooking/icp-mb-booking add App.tsx
git -C C:/Project/ICPBooking/icp-mb-booking commit -m "feat: add visit history bottom tab (4th tab)"
```

---

## Final verification (หลังครบทุก task)

- [ ] Mobile: `npm test` → เทสต์ทั้งหมดผ่าน (รวม `visitHistory.logic` + เดิม)
- [ ] Mobile: `npx tsc --noEmit` → ไม่มี error ใหม่นอกจาก baseline
- [ ] Server: `npm test` (cwd server) → ผ่านทั้งหมด (รวม `historyCutoffDate`)
- [ ] Server: ยืนยัน route `/history` อยู่ก่อน `/:id`
- [ ] Code review (superpowers:requesting-code-review) + security review (/security-review) โฟกัส: no-auth endpoint คืนข้อมูลอะไรบ้าง (PII), limit 2000, การ escape ค้นหา
- [ ] Rebuild apk + ทดสอบเครื่องจริงยิง endpoint จริง: เปลี่ยนช่วงเวลา (7/30/90/ทั้งหมด), ค้นหา, dropdown 4 แบบ, ชิปมีรถ/ไม่มีรถ, pull-to-refresh, empty/error state

## Self-Review (ผู้เขียนแผนตรวจกับ spec)

- **Spec coverage:** Unit 1→Task 1, Unit 2→Task 2, Unit 3→Task 4, Unit 4→Task 3, Unit 5→Task 5, Unit 6→Task 6. ครบทุก unit ✓
- **Type consistency:** `HistoryTypeFilter`/`VehicleFilter`/`HistoryFilterState`/`filterHistory` ตรงกันระหว่าง Task 3 (นิยาม) กับ Task 5 (ใช้); `getVisitorHistory(days:number)` ตรงกัน Task 4↔5; `TodayAppointment.source/createdAt` เพิ่มใน Task 4 ใช้ใน Task 3/5 ✓
- **Placeholder scan:** ไม่มี TBD/TODO — โค้ดครบทุก step ✓
- **ลำดับพึ่งพา:** แนะนำทำ Task 4 ก่อน 3 (หรือทำ 3 แล้วรัน tsc หลัง 4); 5 ต้องหลัง 3+4; 6 ต้องหลัง 5 — ระบุไว้ในหมายเหตุ Task 3 ✓
