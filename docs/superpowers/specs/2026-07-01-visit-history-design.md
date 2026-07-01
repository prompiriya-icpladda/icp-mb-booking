# Visit History (ประวัติการเข้า) — Design Spec

วันที่: 2026-07-01
สถานะ: อนุมัติดีไซน์แล้ว (รอตรวจ spec)

## เป้าหมาย

เพิ่มแท็บล่างใหม่ "ประวัติการเข้า" ให้ รปภ. ดูรายการผู้มาติดต่อ**ย้อนหลังทั้งหมด**ในที่เดียว
โดยแต่ละรายการบอก: ผู้มาชื่ออะไร มาหาใคร วัตถุประสงค์อะไร วันที่เท่าไร พร้อม
- **ค้นหา** (search) ครอบคลุมทั้งหมด
- **Dropdown ประเภท**: ทั้งหมด / walk-in / ล่วงหน้า / ระยะยาว
- **ตัวกรองรถ**: ทั้งหมด / มีรถ / ไม่มีรถ
- **ช่วงเวลา**: 7 / 30 / 90 (ค่าเริ่มต้น) / ทั้งหมด

## ขอบเขต (ตกลงกับผู้ใช้)

- **แหล่งข้อมูล**: เพิ่ม endpoint ใหม่ฝั่ง server (repo ICPBooking) ดึงย้อนหลังตามจำนวนวันที่เลือก (default 90)
- **ตำแหน่ง UI**: แท็บล่าง**ใหม่ตัวที่ 4** "ประวัติการเข้า" (📖) — แยกจากแท็บย่อย "ประวัติ" (การแจ้งเตือน) ในหน้าแจ้งเตือน ซึ่งเป็นคนละอัน
- **ประเภท (dropdown เดียว 4 ตัวเลือก)**: `all` / `walk-in` / `advance` / `long-term`
  - `walk-in` = `source === "walk-in"`
  - `advance` (ล่วงหน้า) = `source === "advance"`
  - `long-term` (ระยะยาว) = `qrMode === "long-term"` (ครอบทั้ง walk-in และ advance ที่เป็น QR ระยะยาว)
- **การตีความ "ประวัติการเข้า"**: แสดง**ทุกใบนัด**ในช่วงเวลา (ไม่กรองเฉพาะที่เช็คอินจริง) พร้อม badge สถานะ — ยืนยันกับผู้ใช้แล้ว

## Non-goals (YAGNI)

- ไม่ทำ pagination / infinite scroll (ใช้ limit เพดานเดียวฝั่ง server)
- ไม่ค้นหา/กรองฝั่ง server (ดึงตามช่วงเวลาแล้วกรอง+ค้นหาในเครื่อง)
- ไม่ export / พิมพ์รายงาน
- ไม่แตะ auth (endpoint เปิดแบบ no-auth เหมือน `/today`, `/long-term` ที่ kiosk ใช้อยู่)
- ไม่ทำ date range แบบเลือกวันเอง (ใช้ preset ช่วงวันพอ)

---

## สถาปัตยกรรม (units)

### Unit 1 — Server: pure helper คำนวณ cutoff
**ไฟล์**: `ICPBooking/server/utils/visitor-appointment-core.js` (เพิ่มฟังก์ชัน + export)

```js
// คืน cutoff string (yyyy-MM-dd) = วันนี้ − days; days<=0 หรือไม่ใช่ตัวเลข → null (= ไม่จำกัด)
function historyCutoffDate(days, now = new Date()) { ... }
```

- pure, deterministic (รับ `now` เป็น param) → unit test ได้
- คืน `null` เมื่อ `days` = 0 / ว่าง / NaN / ติดลบ → route จะข้ามการกรองวันที่ (= ทั้งหมด)
- ใช้ UTC date-part เดียวกับที่ route อื่นใช้ (`toISOString().split("T")[0]`) เพื่อความสอดคล้อง

**Test**: `ICPBooking/server/utils/visitor-appointment-core.test.js` (ไฟล์เดิม เพิ่มเคส) — days=90 → 90 วันก่อน, days=0/ค่าผิด → null, ข้ามเดือน/ปี

### Unit 2 — Server: route `GET /history`
**ไฟล์**: `ICPBooking/server/routes/visitor-appointments.js`

```js
// GET /api/visitor-appointments/history?days=90 — ประวัติผู้มาติดต่อย้อนหลัง (no auth เหมือน /today, /long-term)
router.get("/history", async (req, res) => {
  const days = parseInt(req.query.days, 10);
  const cutoff = historyCutoffDate(Number.isNaN(days) ? 90 : days);
  const filter = { deletedAt: null };
  if (cutoff) filter.appointmentDate = { $gte: cutoff };
  const records = await VisitorAppointment.find(filter)
    .sort({ appointmentDate: -1, appointmentTime: -1 })
    .limit(2000)
    .select("_id visitorName visitorType visitorOrganization appointmentDate appointmentTime expiryDate purpose hasVehicle vehicleCount licensePlates licensePlate checkedInAt completedAt visitorCount createdByName source qrMode createdAt")
    .lean();
  res.json(records);
});
```

- **ตำแหน่ง**: วาง**ก่อน** `router.get("/:id", ...)` (บรรทัด ~269) — วางถัดจาก `/long-term` เพื่อไม่ให้ `/:id` จับคำว่า "history"
- **ไม่ส่ง** `visitorCitizenId` (PII) — select เฉพาะฟิลด์ที่จำเป็น
- default `days=90` เมื่อไม่ส่ง param หรือ parse ไม่ได้
- `.limit(2000)` เป็นเพดานกันข้อมูลล้น (log ไว้ว่าเป็น cap แข็ง)

⚠️ **repo ICPBooking ใช้ branch ร่วมกับ workstream อื่น** → ตรวจ `git diff`/`git log` ช่วงที่แตะ และ `git add` เฉพาะ 2 ไฟล์นี้เท่านั้น (core + route) ห้าม stage รวด

### Unit 3 — Mobile: API client
**ไฟล์**: `icp-mb-booking/src/services/api.ts`

```ts
// TodayAppointment เพิ่ม 2 ฟิลด์ (optional — ไม่กระทบ caller เดิม)
export interface TodayAppointment {
  ...
  source?: "walk-in" | "advance";
  createdAt?: string;
}

// ดึงประวัติผู้มาติดต่อย้อนหลังตามจำนวนวัน (0 = ทั้งหมด)
export async function getVisitorHistory(days: number): Promise<TodayAppointment[]> {
  const res = await fetch(`${API_URL}/visitor-appointments/history?days=${days}`);
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}
```

- ใช้ type `TodayAppointment` เดิม (โครงเดียวกัน) แค่เติม `source`, `createdAt`

### Unit 4 — Mobile: logic กรอง/ค้นหา (pure, TDD)
**ไฟล์ใหม่**: `icp-mb-booking/src/utils/visitHistory.logic.ts`

```ts
export type HistoryTypeFilter = "all" | "walk-in" | "advance" | "long-term";
export type VehicleFilter = "all" | "with" | "without";

export interface HistoryFilterState {
  search: string;
  type: HistoryTypeFilter;
  vehicle: VehicleFilter;
}

export function matchesType(item, type): boolean       // long-term→qrMode; อื่น→source
export function matchesVehicle(item, vehicle): boolean  // with→hasVehicle true, without→false
export function matchesSearch(item, query): boolean     // ชื่อผู้มา+createdByName+purpose+ทะเบียน+องค์กร (case-insensitive, trim)
export function filterHistory(items, state): TodayAppointment[]  // รวม 3 เงื่อนไข (AND)
```

- pure ล้วน → เขียน Jest ก่อน (node-only เหมือน `notificationHistory.logic.test.ts`, `api.test.ts`)
- search ว่าง/ช่องว่าง → ผ่านทุกอัน; ค้นหาไม่สนตัวพิมพ์ใหญ่เล็ก

**Test**: `icp-mb-booking/src/utils/visitHistory.logic.test.ts` — เคสครบ: type แต่ละแบบ (รวม long-term ที่ทับ source), vehicle 3 แบบ, search หลายฟิลด์/ว่าง, รวมหลายเงื่อนไข

### Unit 5 — Mobile: หน้าจอ `VisitHistoryScreen.tsx`
**ไฟล์ใหม่**: `icp-mb-booking/src/screens/VisitHistoryScreen.tsx`

State: `items` (จาก server), `days` (default 90), `search`, `type`, `vehicle`, `loading`, `refreshing`, `error`, `typePickerOpen`

โครงหน้า (บนลงล่าง):
1. **Header** (โทนเดียวกับ NotificationScreen): หัวข้อ "ประวัติการเข้า" + badge นับ (จำนวนหลังกรอง)
2. **แถบช่วงเวลา** (chips): 7 วัน / 30 วัน / 90 วัน / ทั้งหมด — เลือกแล้ว `setDays` → refetch
3. **ช่องค้นหา** (`TextInput` + ไอคอน 🔍) — อัปเดต `search` (กรองในเครื่อง realtime)
4. **แถวตัวกรอง**:
   - **Dropdown ประเภท**: ปุ่มแสดงค่าปัจจุบัน แตะเปิด `Modal` เลือก (ทั้งหมด/walk-in/ล่วงหน้า/ระยะยาว) — แพทเทิร์นเดียวกับ picker ใน WalkInScreen
   - **ชิปรถ**: ทั้งหมด / มีรถ / ไม่มีรถ
5. **FlatList** ของ `filterHistory(items, {search,type,vehicle})`:
   - pull-to-refresh (`RefreshControl` สีเขียว `#16a34a`)
   - loading (spinner) / error (ปุ่มลองใหม่) / empty ("ไม่พบประวัติ")
   - แต่ละ **การ์ด**: ชื่อผู้มา + องค์กร, badge ประเภท (walk-in/ล่วงหน้า) + badge สถานะ (รอ/มาแล้ว/เช็คเอาท์ ตาม long-term status หรือ เช็คอินแล้ว/รอ), pills: 🕐 วันที่+เวลา, 📌 วัตถุประสงค์, 👥 จำนวน (>1), 🚗 ทะเบียน (ถ้ามีรถ); footer "มาหา: {createdByName}"

การ์ดนี้เป็น **read-only** (ไม่แตะเพื่อสแกน/เช็คเอาท์ — ต่างจาก NotificationScreen) เพื่อความง่ายและปลอดภัย

### Unit 6 — Mobile: เพิ่มแท็บล่างที่ 4
**ไฟล์**: `icp-mb-booking/App.tsx`

- `type Tab` เพิ่ม `"history"`
- `TabBar` เพิ่มปุ่ม 📖 "ประวัติการเข้า" (ต่อจาก "ลงทะเบียน")
- `MainApp` render `<VisitHistoryScreen />` เมื่อ `activeTab === "history"`
- แท็บนี้ไม่มี badge unread (ต่างจากแท็บแจ้งเตือน)

---

## Data flow

```
[แท็บ ประวัติการเข้า]
   └ mount / เปลี่ยน days → getVisitorHistory(days) ──HTTP──> GET /history?days=N (server)
                                                                └ VisitorAppointment.find(deletedAt+cutoff).sort.limit.select
   └ items (ทั้งหมดในช่วง) ──filterHistory(search,type,vehicle)──> รายการที่แสดง
   └ search/type/vehicle เปลี่ยน → กรองในเครื่อง (ไม่ยิง server ซ้ำ)
```

## Error handling

- Server ล้ม → catch → 500 `{ error }` (เหมือน route อื่น)
- Mobile fetch ล้ม → แสดง error + ปุ่ม "ลองใหม่"; ข้อมูลเดิมคงไว้ถ้า refetch ล้ม
- List ว่างหลังกรอง → empty state "ไม่พบประวัติ"

## Testing

| Unit | ชนิดเทส | ที่ |
|---|---|---|
| 1 historyCutoffDate | Jest (server) | `server/utils/visitor-appointment-core.test.js` |
| 4 filterHistory ฯลฯ | Jest (mobile, node-only) | `src/utils/visitHistory.logic.test.ts` |
| 2,3,5,6 | ตรวจด้วยตา + `tsc --noEmit` (baseline ~8 expo errors) | — |

หลังรวม: `npm test` ผ่านทั้งสองฝั่ง, `npx tsc --noEmit` ไม่เพิ่ม error ใหม่, rebuild apk + ทดสอบบนเครื่องจริง (ยิง endpoint จริง)

## ลำดับงาน (สรุป)

1. Server: `historyCutoffDate` + test (TDD) → route `/history`
2. Mobile: `visitHistory.logic.ts` + test (TDD)
3. Mobile: `api.ts` (`getVisitorHistory` + ฟิลด์)
4. Mobile: `VisitHistoryScreen.tsx`
5. Mobile: `App.tsx` แท็บที่ 4
6. รีวิว + security review + rebuild/ทดสอบเครื่องจริง
