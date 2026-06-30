# Long-term Walk-in QR (show in app + send dev via LINE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a long-term visitor appointment is created from the mobile walk-in form, push its QR Code to every `dev`-role user via LINE and display the QR in the app.

**Architecture:** A new shared server util (`visitor-qr-notify.js`) owns the QR Flex builder and a `sendLongTermQrToDevs(record)` function; the walk-in route calls it (fire-and-forget) on long-term creation, while the advance route is only refactored to import the shared builder (no behavior change). The mobile `WalkInScreen` reads the created record `_id` from the API response and shows a QR modal sourced from the existing public `/qr` PNG endpoint.

**Tech Stack:** Node + Express 5 + Mongoose + Vitest (server, CommonJS); Expo React Native 0.81 + TypeScript (mobile, no test runner).

**Spec:** `icp-mb-booking/docs/superpowers/specs/2026-06-29-long-term-qr-mobile-dev-line-design.md`

## Global Constraints

- **Two repos, two cwds.** Server tasks (1–3) run in `C:/Project/ICPBooking/ICPBooking`. Mobile tasks (4–5) run in `C:/Project/ICPBooking/icp-mb-booking`. Commit in the repo where the change lives.
- **Deploy order:** server first, then mobile (mobile must degrade gracefully when the response has no `id`).
- **Recipient scope:** LINE QR goes to `role: "dev"` users only (for now). Do not add admin/host/group.
- **Trigger scope:** dev-send fires only from the walk-in route (`walk-in-visitors.js`). Do NOT add it to the advance route (`visitor-appointments.js`).
- **Preserve Thai** UI/domain strings exactly (CLAUDE.md rule).
- **LINE sends are fire-and-forget** — wrap so they never block or throw into the request handler (match the existing `sendQrToCreator` pattern).
- **Mobile:** display QR on screen only — no share/save, no new Expo dependency. `single-use` mobile behavior is unchanged.
- **Server module format is CommonJS** (`require`/`module.exports`), `"type": "commonjs"`.

---

### Task 1: Server — shared `visitor-qr-notify.js` util + unit tests

Creates the new util with the QR Flex builder (copied from `visitor-appointments.js` — the dedup happens in Task 2), a pure `selectDevLineIds` filter, and `sendLongTermQrToDevs`. This is the only task that needs real tests; all notification logic lives here.

**Files:**
- Create: `server/utils/visitor-qr-notify.js`
- Test: `server/utils/visitor-qr-notify.test.js`

**Interfaces:**
- Consumes: `User` model (`../model/User`, static `find`), `pushMessage` (`./line`), `visitorTypeLabel` (`./visitor-appointment-core`).
- Produces:
  - `buildVisitorQrFlex(args) -> object` — args: `{ visitorName, visitorType, visitorOrganization, visitorCount, appointmentDate, appointmentTime, expiryDate, purpose, hasVehicle, licensePlate, qrImageUrl, creatorName, qrMode }`. Returns a LINE Flex bubble.
  - `selectDevLineIds(devUsers: Array<{lineId, lineNotifyEnabled}>) -> string[]`
  - `sendLongTermQrToDevs(record) -> Promise<void>` — no-op unless `record.qrMode === "long-term"`.

- [ ] **Step 0: Create the server feature branch**

```bash
cd "C:/Project/ICPBooking/ICPBooking" && git checkout -b feat/long-term-walkin-qr-dev-line
```

- [ ] **Step 1: Write the failing tests**

Create `server/utils/visitor-qr-notify.test.js`:

```javascript
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";

// line.js reads LINE_MESSAGING_TOKEN at load — set it before each require, and
// reset the module registry so User + the util share one fresh instance per test.
beforeEach(() => {
  process.env.LINE_MESSAGING_TOKEN = "tok-test";
  vi.resetModules();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const longTermRecord = {
  _id: "rec123",
  qrMode: "long-term",
  visitorName: "สมชาย ใจดี",
  visitorType: "vendor",
  visitorOrganization: "บริษัท เอบีซี",
  visitorCount: 1,
  appointmentDate: "2026-06-30",
  appointmentTime: "10:00",
  expiryDate: "2026-12-31",
  purpose: "ซ่อมแอร์",
  hasVehicle: false,
  licensePlate: "",
  createdByName: "ผู้ดูแล",
};

describe("selectDevLineIds", () => {
  it("keeps only devs with a lineId and notifications not disabled", () => {
    const { selectDevLineIds } = require("./visitor-qr-notify");
    const result = selectDevLineIds([
      { lineId: "U_a", lineNotifyEnabled: true },
      { lineId: "", lineNotifyEnabled: true },
      { lineId: "U_b", lineNotifyEnabled: false },
      { lineId: "U_c" }, // undefined → treated as enabled
    ]);
    expect(result).toEqual(["U_a", "U_c"]);
  });
});

describe("buildVisitorQrFlex", () => {
  it("shows an expiry row (not date/time) for long-term", () => {
    const { buildVisitorQrFlex } = require("./visitor-qr-notify");
    const bubble = buildVisitorQrFlex({ ...longTermRecord, qrImageUrl: "https://img/x.png" });
    const json = JSON.stringify(bubble);
    expect(json).toContain("วันหมดอายุ");
    expect(json).toContain("2026-12-31");
    expect(json).not.toContain("เวลา");
  });
});

describe("sendLongTermQrToDevs", () => {
  it("does nothing (no DB query, no push) when qrMode is not long-term", async () => {
    const User = require("../model/User");
    const findSpy = vi.spyOn(User, "find");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { sendLongTermQrToDevs } = require("./visitor-qr-notify");

    await sendLongTermQrToDevs({ _id: "x", qrMode: "single-use" });

    expect(findSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("pushes a QR flex to each dev that has a lineId, for long-term", async () => {
    const User = require("../model/User");
    vi.spyOn(User, "find").mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve([
            { lineId: "U_dev1", lineNotifyEnabled: true },
            { lineId: "U_dev2", lineNotifyEnabled: true },
            { lineId: "", lineNotifyEnabled: true },
            { lineId: "U_dev4", lineNotifyEnabled: false },
          ]),
      }),
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const { sendLongTermQrToDevs } = require("./visitor-qr-notify");

    await sendLongTermQrToDevs(longTermRecord);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const recipients = fetchSpy.mock.calls.map(([, opts]) => JSON.parse(opts.body).to);
    expect(recipients).toEqual(["U_dev1", "U_dev2"]);
    const firstBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(firstBody.messages[0].type).toBe("flex");
    expect(firstBody.messages[0].altText).toContain("สมชาย ใจดี");
  });

  it("warns and sends nothing when no dev has a lineId", async () => {
    const User = require("../model/User");
    vi.spyOn(User, "find").mockReturnValue({
      select: () => ({ lean: () => Promise.resolve([{ lineId: "", lineNotifyEnabled: true }]) }),
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { sendLongTermQrToDevs } = require("./visitor-qr-notify");

    await sendLongTermQrToDevs(longTermRecord);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "C:/Project/ICPBooking/ICPBooking/server" && npx vitest run utils/visitor-qr-notify.test.js
```

Expected: FAIL — `Cannot find module './visitor-qr-notify'`.

- [ ] **Step 3: Create the util to make the tests pass**

Create `server/utils/visitor-qr-notify.js`:

```javascript
const User = require("../model/User");
const { pushMessage } = require("./line");
const { visitorTypeLabel } = require("./visitor-appointment-core");

function checkinUrl(id) {
  const API_URL = process.env.API_URL || "http://localhost:5000";
  return `${API_URL}/api/visitor-appointments/${id}/checkin`;
}

function buildVisitorQrFlex({
  visitorName,
  visitorType,
  visitorOrganization,
  visitorCount,
  appointmentDate,
  appointmentTime,
  expiryDate,
  purpose,
  hasVehicle,
  licensePlate,
  qrImageUrl,
  creatorName,
  qrMode,
}) {
  const rows = [
    { label: "ประเภท", value: visitorTypeLabel(visitorType) },
    { label: "ผู้มาเยือน", value: visitorName },
    { label: "จำนวนบุคคล", value: `${visitorCount || 1} คน` },
    { label: "องค์กร", value: visitorOrganization },
    { label: "วันที่", value: appointmentDate },
    { label: "เวลา", value: appointmentTime },
    { label: "จุดประสงค์", value: purpose },
  ];
  if (qrMode === "long-term") {
    rows.splice(4, 2, { label: "วันหมดอายุ", value: expiryDate || "-" });
  }
  if (hasVehicle && licensePlate) {
    rows.push({ label: "ทะเบียนรถ", value: licensePlate });
  }

  return {
    type: "bubble",
    size: "mega",
    hero: {
      type: "image",
      url: qrImageUrl,
      size: "full",
      aspectRatio: "1:1",
      aspectMode: "fit",
      backgroundColor: "#ffffff",
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "QR Code นัดหมายบุคคลภายนอก",
          weight: "bold",
          size: "md",
          color: "#111827",
          wrap: true,
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          spacing: "sm",
          contents: rows.map((r) => ({
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: r.label, color: "#6b7280", size: "sm", flex: 3 },
              { type: "text", text: r.value || "-", wrap: true, color: "#111827", size: "sm", flex: 5 },
            ],
          })),
        },
        { type: "separator", margin: "md" },
        {
          type: "text",
          text: "ให้ผู้มาเยือนแสดง QR Code นี้ที่จุดรักษาความปลอดภัย เพื่อแจ้งเตือนคุณทาง LINE",
          wrap: true,
          color: "#6b7280",
          size: "xs",
          margin: "md",
        },
      ],
    },
  };
}

function selectDevLineIds(devUsers) {
  return (devUsers || [])
    .filter((u) => u && u.lineId && u.lineNotifyEnabled !== false)
    .map((u) => u.lineId);
}

// ส่ง QR ระยะยาวเข้า LINE ของผู้ใช้ role "dev" (fire-and-forget; caller ไม่ต้อง await)
async function sendLongTermQrToDevs(record) {
  if (!record || record.qrMode !== "long-term") return;

  const devs = await User.find({ role: "dev" })
    .select("lineId lineNotifyEnabled")
    .lean();
  const lineIds = selectDevLineIds(devs);
  if (lineIds.length === 0) {
    console.warn("[visitor-qr-notify] long-term walk-in but no dev with lineId to notify");
    return;
  }

  const url = checkinUrl(record._id);
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=300x300&ecc=M&margin=10`;
  const bubble = buildVisitorQrFlex({
    visitorName: record.visitorName,
    visitorType: record.visitorType,
    visitorOrganization: record.visitorOrganization,
    visitorCount: record.visitorCount,
    appointmentDate: record.appointmentDate,
    appointmentTime: record.appointmentTime,
    expiryDate: record.expiryDate,
    purpose: record.purpose,
    qrMode: record.qrMode,
    hasVehicle: record.hasVehicle,
    licensePlate: record.licensePlate,
    qrImageUrl,
    creatorName: record.createdByName,
  });

  const message = {
    type: "flex",
    altText: `QR ระยะยาว (walk-in): ${record.visitorName}`,
    contents: bubble,
  };

  for (const lineId of lineIds) {
    await pushMessage(lineId, message);
  }
}

module.exports = { buildVisitorQrFlex, selectDevLineIds, sendLongTermQrToDevs };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd "C:/Project/ICPBooking/ICPBooking/server" && npx vitest run utils/visitor-qr-notify.test.js
```

Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
cd "C:/Project/ICPBooking/ICPBooking" && git add server/utils/visitor-qr-notify.js server/utils/visitor-qr-notify.test.js && git commit -m "feat(server): add visitor-qr-notify util (dev LINE QR for long-term)"
```

---

### Task 2: Server — refactor `visitor-appointments.js` to import the shared builder

Removes the now-duplicated `buildVisitorQrFlex` from the advance route and imports it from the util. Behavior must be identical (advance route still only notifies the creator).

**Files:**
- Modify: `server/routes/visitor-appointments.js` (remove local `buildVisitorQrFlex` ~lines 96-164; add a `require`)

**Interfaces:**
- Consumes: `buildVisitorQrFlex` from `../utils/visitor-qr-notify` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Add the import**

In `server/routes/visitor-appointments.js`, just below the existing `const { pushMessage } = require("../utils/line");` line, add:

```javascript
const { buildVisitorQrFlex } = require("../utils/visitor-qr-notify");
```

- [ ] **Step 2: Delete the local `buildVisitorQrFlex` definition**

Remove the entire `function buildVisitorQrFlex({ ... }) { ... }` block (the one starting `function buildVisitorQrFlex({ visitorName, visitorType, ...` and ending at its closing `}` before `// GET /api/visitor-appointments`). `sendQrToCreator` keeps calling `buildVisitorQrFlex(...)` — now resolved from the import. Do not change `checkinUrl` or `sendQrToCreator`.

- [ ] **Step 3: Verify the server test suite is still green**

```bash
cd "C:/Project/ICPBooking/ICPBooking/server" && npx vitest run
```

Expected: PASS — existing suites plus Task 1 all green (no test imports this route, so this confirms no load-time/syntax breakage).

- [ ] **Step 4: Sanity-check the route file loads (no leftover reference)**

```bash
cd "C:/Project/ICPBooking/ICPBooking/server" && node -e "require('./routes/visitor-appointments'); console.log('route loads OK')"
```

Expected: prints `route loads OK` (a stray `buildVisitorQrFlex` reference or syntax error would throw here).

- [ ] **Step 5: Commit**

```bash
cd "C:/Project/ICPBooking/ICPBooking" && git add server/routes/visitor-appointments.js && git commit -m "refactor(server): import buildVisitorQrFlex from shared util"
```

---

### Task 3: Server — wire `sendLongTermQrToDevs` into the walk-in route

The walk-in route already creates the record and notifies the host of arrival. Add the long-term dev QR send after that, fire-and-forget.

**Files:**
- Modify: `server/routes/walk-in-visitors.js` (add `require`; add one call before `res.status(201)`)

**Interfaces:**
- Consumes: `sendLongTermQrToDevs` from `../utils/visitor-qr-notify` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Add the import**

In `server/routes/walk-in-visitors.js`, just below `const { pushMessage } = require("../utils/line");`, add:

```javascript
const { sendLongTermQrToDevs } = require("../utils/visitor-qr-notify");
```

- [ ] **Step 2: Call it after the host "arrived" push**

In the `POST /` handler, locate the block that pushes the arrival flex to the host:

```javascript
    if (resolved.host?.lineId) {
      try {
        await pushMessage(resolved.host.lineId, {
          type: "flex",
          altText: `${record.visitorName} arrived. Please come to receive the visitor`,
          contents: buildCheckinFlex(record),
        });
      } catch (err) {
        console.error("[walk-in-visitors] pushMessage error:", err);
      }
    }

    res.status(201).json(record);
```

Insert the dev-send between the host block and `res.status(201)`:

```javascript
    if (resolved.host?.lineId) {
      try {
        await pushMessage(resolved.host.lineId, {
          type: "flex",
          altText: `${record.visitorName} arrived. Please come to receive the visitor`,
          contents: buildCheckinFlex(record),
        });
      } catch (err) {
        console.error("[walk-in-visitors] pushMessage error:", err);
      }
    }

    // QR ระยะยาวจากมือถือ → ส่ง QR เข้า LINE ของ dev เพื่อใช้กับนัดหมายในอนาคต
    // (util ตรวจ qrMode==="long-term" เองแล้ว, fire-and-forget ไม่ block response)
    sendLongTermQrToDevs(record).catch((err) =>
      console.error("[walk-in-visitors] sendLongTermQrToDevs error:", err),
    );

    res.status(201).json(record);
```

- [ ] **Step 3: Sanity-check the route file loads**

```bash
cd "C:/Project/ICPBooking/ICPBooking/server" && node -e "require('./routes/walk-in-visitors'); console.log('route loads OK')"
```

Expected: prints `route loads OK`.

- [ ] **Step 4: Run the full server suite (still green)**

```bash
cd "C:/Project/ICPBooking/ICPBooking/server" && npx vitest run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:/Project/ICPBooking/ICPBooking" && git add server/routes/walk-in-visitors.js && git commit -m "feat(server): send long-term walk-in QR to dev users via LINE"
```

---

### Task 4: Mobile — `api.ts` returns the new `id` and adds `visitorQrUrl`

The server already returns the created record (with `_id`); surface it so the screen can build the QR URL.

**Files:**
- Modify: `src/services/api.ts` (`createWalkInVisit` return mapping; add `visitorQrUrl`)

**Interfaces:**
- Consumes: existing `API_URL`, `parseJsonResponse`, `CreateWalkInVisitResult` (`{ success: boolean; id?: string; error?: string }`).
- Produces:
  - `createWalkInVisit(...)` now resolves `{ success: true, id?: string, error?: string }` where `id` is the record `_id`.
  - `visitorQrUrl(id: string) -> string`.

- [ ] **Step 1: Map the created record's `_id` into the result**

In `src/services/api.ts`, find the end of `createWalkInVisit`:

```typescript
  const res = await fetch(`${API_URL}/walk-in-visitors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  return parseJsonResponse<CreateWalkInVisitResult>(res);
}
```

Replace the `return` line with a normalize step (the server responds with the full record):

```typescript
  const res = await fetch(`${API_URL}/walk-in-visitors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const data = await parseJsonResponse<{ _id?: string; id?: string; error?: string }>(res);
  return { success: true, id: data._id ?? data.id, error: data.error };
}
```

- [ ] **Step 2: Add the `visitorQrUrl` helper**

Add near the other appointment helpers (e.g. just after the `checkinAppointment` function):

```typescript
// URL ของรูป QR (PNG) ที่ server สร้างให้ — ใช้แสดงในแอปหลังบันทึกนัดหมายระยะยาว
export function visitorQrUrl(id: string): string {
  return `${API_URL}/visitor-appointments/${id}/qr`;
}
```

- [ ] **Step 3: Typecheck**

```bash
cd "C:/Project/ICPBooking/icp-mb-booking" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "C:/Project/ICPBooking/icp-mb-booking" && git add src/services/api.ts && git commit -m "feat(mobile): return walk-in id and add visitorQrUrl helper"
```

---

### Task 5: Mobile — show the QR modal after a long-term walk-in

After a successful long-term submit, capture the returned `id` (and the submitted details) and present a QR modal. Single-use and the no-`id` fallback keep the current success message.

**Files:**
- Modify: `src/screens/WalkInScreen.tsx`

**Interfaces:**
- Consumes: `visitorQrUrl`, `createWalkInVisit` (Task 4); RN `Image`, `Modal`.
- Produces: nothing new (screen-local).

- [ ] **Step 1: Import `Image` and `visitorQrUrl`**

In the `react-native` import block, add `Image,` (alphabetical, before `Keyboard`):

```typescript
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
```

In the `../services/api` import block, add `visitorQrUrl,`:

```typescript
import {
  createWalkInVisit,
  HrEmployee,
  ocrLicensePlate,
  searchHrEmployees,
  visitorQrUrl,
  VISITOR_TYPE_OPTIONS,
  visitorTypeNeedsHost,
  VisitorQrMode,
  VisitorType,
} from "../services/api";
```

- [ ] **Step 2: Add modal state**

Just after the `const [message, setMessage] = useState<...>(null);` declaration, add:

```typescript
  const [qrModal, setQrModal] = useState<{
    id: string;
    visitorName: string;
    visitorOrganization: string;
    expiryDate: string;
  } | null>(null);
```

- [ ] **Step 3: Branch the success path on long-term + id**

In `submit()`, replace this block:

```typescript
      await createWalkInVisit({
        visitorName: visitorName.trim(),
        hostEmployeeCode: host?.employeeCode ?? "",
        hostName: host?.name ?? "",
        hostNickname: host?.nickname,
        visittingUserId: hostUserId,
        visittingUserName: host?.name ?? "",
        visittingUserNickname: host?.nickname,
        visitingUserId: hostUserId,
        visitingUserName: host?.name ?? "",
        visitingUserNickname: host?.nickname,
        idCardNumber: idCardNumber.trim(),
        companyName: companyName.trim(),
        purpose: purpose.trim(),
        visitorType,
        visitorCount,
        qrMode,
        expiryDate:
          qrMode === "long-term" && expiryDate
            ? formatDateLocal(expiryDate)
            : undefined,
        hasVehicle,
        vehicleCount: hasVehicle ? vehicleCount : 0,
        licensePlate: plates[0],
        licensePlates: plates,
        source: "mobile-walk-in",
      });
      resetForm();
      setMessage({ type: "ok", text: "บันทึกข้อมูลเรียบร้อย" });
```

with (assign the result, then branch — capture the submitted values before `resetForm` clears them):

```typescript
      const result = await createWalkInVisit({
        visitorName: visitorName.trim(),
        hostEmployeeCode: host?.employeeCode ?? "",
        hostName: host?.name ?? "",
        hostNickname: host?.nickname,
        visittingUserId: hostUserId,
        visittingUserName: host?.name ?? "",
        visittingUserNickname: host?.nickname,
        visitingUserId: hostUserId,
        visitingUserName: host?.name ?? "",
        visitingUserNickname: host?.nickname,
        idCardNumber: idCardNumber.trim(),
        companyName: companyName.trim(),
        purpose: purpose.trim(),
        visitorType,
        visitorCount,
        qrMode,
        expiryDate:
          qrMode === "long-term" && expiryDate
            ? formatDateLocal(expiryDate)
            : undefined,
        hasVehicle,
        vehicleCount: hasVehicle ? vehicleCount : 0,
        licensePlate: plates[0],
        licensePlates: plates,
        source: "mobile-walk-in",
      });
      if (qrMode === "long-term" && result.id) {
        setQrModal({
          id: result.id,
          visitorName: visitorName.trim(),
          visitorOrganization: companyName.trim(),
          expiryDate: expiryDate ? formatDateLocal(expiryDate) : "",
        });
        resetForm();
      } else {
        resetForm();
        setMessage({ type: "ok", text: "บันทึกข้อมูลเรียบร้อย" });
      }
```

- [ ] **Step 4: Render the QR modal**

Add this `Modal` immediately after the closing `</Modal>` of the existing camera modal (just before the closing `</KeyboardAvoidingView>`):

```tsx
      <Modal
        visible={!!qrModal}
        animationType="fade"
        transparent
        onRequestClose={() => setQrModal(null)}
      >
        <View style={styles.qrModalBackdrop}>
          <View style={styles.qrModalCard}>
            <Text style={styles.qrModalTitle}>QR Code ระยะยาว</Text>
            {qrModal && (
              <Image
                source={{ uri: visitorQrUrl(qrModal.id) }}
                style={styles.qrImage}
                resizeMode="contain"
              />
            )}
            <Text style={styles.qrName}>{qrModal?.visitorName}</Text>
            {!!qrModal?.visitorOrganization && (
              <Text style={styles.qrMeta}>{qrModal.visitorOrganization}</Text>
            )}
            {!!qrModal?.expiryDate && (
              <Text style={styles.qrMeta}>หมดอายุ {qrModal.expiryDate}</Text>
            )}
            <Text style={styles.qrNote}>
              ให้ผู้มาติดต่อแสดง QR นี้ที่จุดรักษาความปลอดภัยในครั้งถัดไป
            </Text>
            <TouchableOpacity style={styles.qrDoneBtn} onPress={() => setQrModal(null)}>
              <Text style={styles.qrDoneText}>เสร็จสิ้น</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
```

- [ ] **Step 5: Add the modal styles**

Add these keys to the `StyleSheet.create({ ... })` object (e.g. after the `cameraCaptureText` entry):

```typescript
  qrModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  qrModalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  qrModalTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 16 },
  qrImage: { width: 220, height: 220, marginBottom: 16 },
  qrName: { fontSize: 16, fontWeight: "700", color: "#111827", textAlign: "center" },
  qrMeta: { fontSize: 13, color: "#6b7280", marginTop: 4, textAlign: "center" },
  qrNote: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  qrDoneBtn: {
    marginTop: 20,
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
    alignSelf: "stretch",
  },
  qrDoneText: { color: "#fff", fontSize: 15, fontWeight: "700" },
```

- [ ] **Step 6: Typecheck**

```bash
cd "C:/Project/ICPBooking/icp-mb-booking" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Manual device check**

Run the app (`npm start`), open the walk-in form, register a visitor with **รูปแบบ QR Code = ระยะยาว** and an expiry date. Expected: after "บันทึกข้อมูล" the QR modal appears with the QR image, name, expiry, and a เสร็จสิ้น button. Repeat with **ครั้งเดียว**: expected no modal, just the success message. (If a `dev` user has a LINE friend connection, confirm they also receive the QR flex.)

- [ ] **Step 8: Commit**

```bash
cd "C:/Project/ICPBooking/icp-mb-booking" && git add src/screens/WalkInScreen.tsx && git commit -m "feat(mobile): show QR modal after long-term walk-in"
```

---

## Self-Review

**Spec coverage:**
- Spec A1 (new util `visitor-qr-notify.js` with `buildVisitorQrFlex` + `sendLongTermQrToDevs`) → Task 1 ✓
- Spec A2 (`visitor-appointments.js` imports the shared builder, no behavior change) → Task 2 ✓
- Spec A3 (walk-in route fires `sendLongTermQrToDevs` on long-term) → Task 3 ✓
- Spec B1 (`api.ts` returns `id` + `visitorQrUrl`) → Task 4 ✓
- Spec B2 (`WalkInScreen` QR modal, single-use unchanged, fallback when no `id`) → Task 5 ✓
- Spec C (web client unchanged) → intentionally no task ✓
- Spec testing (server unit tests; mobile typecheck + manual) → Task 1 tests, Tasks 4/5 tsc + manual ✓
- Spec error handling (fire-and-forget; graceful degrade) → Task 3 `.catch`, Task 5 `&& result.id` branch ✓
- Spec deploy order (server first) → Global Constraints ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to" — every code step has full content.

**Type consistency:** `sendLongTermQrToDevs`, `selectDevLineIds`, `buildVisitorQrFlex`, `visitorQrUrl`, `qrModal` shape, and `CreateWalkInVisitResult` (`id?`) are named identically across the tasks that define and consume them. The mobile result branch uses `result.id`, matching Task 4's `{ success, id, error }`.
