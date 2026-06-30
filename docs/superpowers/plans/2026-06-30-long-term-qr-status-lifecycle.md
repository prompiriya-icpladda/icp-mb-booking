# Long-term QR Status Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give long-term visitor QRs a forward-only status lifecycle — ลงทะเบียน (registered) → มาแล้ว (arrived, on scan) → เช็คเอาท์ (checked out) — surfaced in the mobile app, with in-app multi-select checkout for rider/merchant.

**Architecture:** Status is *derived* from the two timestamps the `VisitorAppointment` model already has (`checkedInAt`, `completedAt`) — no new DB fields. The server stops auto-checking-in long-term walk-ins (so they start "registered") and stops sending the host LINE flex at registration (the existing scan endpoint already notifies the host on arrival). The mobile app renders a 3-state badge and adds a select-mode that calls the existing `checkout` endpoint per selected record.

**Tech Stack:** Node/Express + Mongoose + Vitest (server, repo `ICPBooking`); React Native / Expo + TypeScript + Jest/ts-jest (mobile, repo `icp-mb-booking`).

**Spec:** `docs/superpowers/specs/2026-06-30-long-term-qr-status-lifecycle-design.md`

## Global Constraints

- **Two separate git repos.** Server = `C:/Project/ICPBooking/ICPBooking` (server code under `server/`). Mobile = `C:/Project/ICPBooking/icp-mb-booking`. Commit in each repo independently.
- **Concurrent workstream on the ICPBooking branch:** stage **exact files only** (never `git add -A` / `git add .`); review `git diff` before each server commit.
- **No new DB fields** — status is derived from `checkedInAt` + `completedAt`.
- **Status precedence:** `completedAt` set ⇒ "checked-out"; else `checkedInAt` set ⇒ "arrived"; else "registered".
- **Single-use behavior must stay identical** — only long-term registration changes.
- **In-app checkout is rider/merchant only**, and only when status is "arrived". Host-type long-term still checks out via the host's "เสร็จสิ้น" LINE button.
- **UI copy is Thai:** badges = `ลงทะเบียน` / `มาแล้ว` / `เช็คเอาท์`.
- **Deploy order:** server first, then mobile (mobile degrades gracefully if `completedAt` is absent).
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: Server — `registerCheckinState` helper (decides registration check-in + host-notify)

**Repo / working dir for tests:** `C:/Project/ICPBooking/ICPBooking/server`

**Files:**
- Modify: `server/utils/visitor-appointment-core.js`
- Test: `server/utils/visitor-appointment-core.test.js`

**Interfaces:**
- Produces: `registerCheckinState(qrMode: string, now: Date) => { checkedInAt: Date | null, notifyHost: boolean }` — used by Task 2.

- [ ] **Step 1: Write the failing test**

Add `registerCheckinState` to the destructured `require(...)` at the top of `server/utils/visitor-appointment-core.test.js`, then append this block at the end of the file:

```js
describe("registerCheckinState", () => {
  const now = new Date("2026-06-30T08:00:00.000Z");

  it("checks in single-use immediately and notifies the host", () => {
    expect(registerCheckinState("single-use", now)).toEqual({
      checkedInAt: now,
      notifyHost: true,
    });
  });

  it("leaves long-term as 'registered' (no check-in) and skips the host notify", () => {
    expect(registerCheckinState("long-term", now)).toEqual({
      checkedInAt: null,
      notifyHost: false,
    });
  });

  it("treats an unknown qrMode as single-use", () => {
    expect(registerCheckinState("legacy", now)).toEqual({
      checkedInAt: now,
      notifyHost: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Project/ICPBooking/ICPBooking/server && npx vitest run utils/visitor-appointment-core.test.js`
Expected: FAIL — `registerCheckinState is not a function` (or `not defined`).

- [ ] **Step 3: Write minimal implementation**

In `server/utils/visitor-appointment-core.js`, add this function just before the `module.exports = {` block (it reuses the existing `normalizeQrMode`):

```js
// ตอนลงทะเบียน walk-in:
//  - single-use → เช็คอินทันที (checkedInAt = now) + แจ้ง host
//  - long-term  → เป็นแค่ "ลงทะเบียน" (checkedInAt = null) รอสแกนค่อยเป็น "มาแล้ว", ยังไม่แจ้ง host
function registerCheckinState(qrMode, now) {
  const isLongTerm = normalizeQrMode(qrMode) === "long-term";
  return {
    checkedInAt: isLongTerm ? null : now,
    notifyHost: !isLongTerm,
  };
}
```

Then add `registerCheckinState,` to the `module.exports = { ... }` list.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/Project/ICPBooking/ICPBooking/server && npx vitest run utils/visitor-appointment-core.test.js`
Expected: PASS (all `registerCheckinState` cases green, existing cases still green).

- [ ] **Step 5: Commit**

```bash
git -C C:/Project/ICPBooking/ICPBooking diff -- server/utils/visitor-appointment-core.js server/utils/visitor-appointment-core.test.js
git -C C:/Project/ICPBooking/ICPBooking add server/utils/visitor-appointment-core.js server/utils/visitor-appointment-core.test.js
git -C C:/Project/ICPBooking/ICPBooking commit -m "feat: registerCheckinState — long-term registers as 'registered', skips host notify

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Server — wire `registerCheckinState` into the walk-in route

**Repo / working dir for tests:** `C:/Project/ICPBooking/ICPBooking/server`

**Files:**
- Modify: `server/routes/walk-in-visitors.js` (import line ~8-11; create block ~208-233; host pushMessage ~235)

**Interfaces:**
- Consumes: `registerCheckinState(qrMode, now)` from Task 1.

- [ ] **Step 1: Import the helper**

Change the existing import in `server/routes/walk-in-visitors.js`:

```js
const {
  normalizeVisitorType,
  normalizeQrMode,
} = require("../utils/visitor-appointment-core");
```

to:

```js
const {
  normalizeVisitorType,
  normalizeQrMode,
  registerCheckinState,
} = require("../utils/visitor-appointment-core");
```

- [ ] **Step 2: Compute the registration check-in state**

Immediately after these existing lines:

```js
    const now = new Date();
    const appointmentDate = now.toISOString().split("T")[0];
    const appointmentTime = now.toTimeString().slice(0, 5);
```

add:

```js
    // long-term เริ่มที่ "ลงทะเบียน" (ยังไม่เช็คอิน, ยังไม่แจ้ง host); single-use เช็คอินทันที + แจ้ง host
    const { checkedInAt: initialCheckedInAt, notifyHost } = registerCheckinState(
      normalizedQrMode,
      now,
    );
```

- [ ] **Step 3: Use the computed check-in time in the create call**

In the `VisitorAppointment.create({ ... })` object, change:

```js
      checkedInAt: now,
```

to:

```js
      checkedInAt: initialCheckedInAt,
```

- [ ] **Step 4: Gate the registration-time host flex on `notifyHost`**

Change the host notification guard from:

```js
    if (resolved.host?.lineId) {
```

to:

```js
    if (resolved.host?.lineId && notifyHost) {
```

(Leave the body of that `if` and the `sendLongTermQrToDevs(record)` call below it unchanged.)

- [ ] **Step 5: Verify wiring + no regressions**

Run:
```bash
cd C:/Project/ICPBooking/ICPBooking/server && npx vitest run
grep -nE "initialCheckedInAt|notifyHost" routes/walk-in-visitors.js
```
Expected: full server suite PASS; grep shows `initialCheckedInAt` used in the create block and `notifyHost` in the host guard. (No route-level test harness exists in this repo — Task 1 covers the decision logic; this step confirms the route compiles/loads via the suite and that the wiring is present.)

- [ ] **Step 6: Commit**

```bash
git -C C:/Project/ICPBooking/ICPBooking diff -- server/routes/walk-in-visitors.js
git -C C:/Project/ICPBooking/ICPBooking add server/routes/walk-in-visitors.js
git -C C:/Project/ICPBooking/ICPBooking commit -m "feat: long-term walk-in registers as 'registered' (no auto check-in / host flex)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Server — return `completedAt` in the long-term list

**Repo / working dir for tests:** `C:/Project/ICPBooking/ICPBooking/server`

**Files:**
- Modify: `server/routes/visitor-appointments.js` (the `GET /long-term` handler `.select(...)`, ~line 231)

- [ ] **Step 1: Add `completedAt` to the projection**

In the `router.get("/long-term", ...)` handler, change the `.select(...)` line from:

```js
      .select("_id visitorName visitorType visitorOrganization appointmentDate appointmentTime expiryDate purpose hasVehicle vehicleCount licensePlates licensePlate checkedInAt visitorCount createdByName source qrMode")
```

to (insert `completedAt` right after `checkedInAt`):

```js
      .select("_id visitorName visitorType visitorOrganization appointmentDate appointmentTime expiryDate purpose hasVehicle vehicleCount licensePlates licensePlate checkedInAt completedAt visitorCount createdByName source qrMode")
```

- [ ] **Step 2: Verify the field is present + no regressions**

Run:
```bash
cd C:/Project/ICPBooking/ICPBooking/server && npx vitest run
grep -n "checkedInAt completedAt" routes/visitor-appointments.js
```
Expected: suite PASS; grep matches the long-term `.select` line (only that one).

- [ ] **Step 3: Commit**

```bash
git -C C:/Project/ICPBooking/ICPBooking diff -- server/routes/visitor-appointments.js
git -C C:/Project/ICPBooking/ICPBooking add server/routes/visitor-appointments.js
git -C C:/Project/ICPBooking/ICPBooking commit -m "feat: include completedAt in long-term visitor list for status derivation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Mobile — status types + `longTermStatus` + `isLongTermCheckoutable`

**Repo / working dir:** `C:/Project/ICPBooking/icp-mb-booking`

**Files:**
- Modify: `src/services/api.ts` (`TodayAppointment` interface; add helpers)
- Test: `src/services/api.test.ts`

**Interfaces:**
- Produces:
  - `type LongTermStatus = "registered" | "arrived" | "checked-out"`
  - `longTermStatus(a: Pick<TodayAppointment, "checkedInAt" | "completedAt">) => LongTermStatus`
  - `isLongTermCheckoutable(a: Pick<TodayAppointment, "checkedInAt" | "completedAt" | "visitorType">) => boolean`
  - `TodayAppointment` gains `completedAt?: string | null` and `visitorType?: VisitorType`
  - (existing) `checkoutAppointment(id: string)` — reused by Task 6.

- [ ] **Step 1: Write the failing test**

In `src/services/api.test.ts`, extend the import on line 1 to include `longTermStatus` and `isLongTermCheckoutable`, then append:

```ts
describe("longTermStatus", () => {
  it("returns 'registered' when never checked in", () => {
    expect(longTermStatus({ checkedInAt: null, completedAt: null })).toBe("registered");
  });
  it("returns 'arrived' when checked in but not completed", () => {
    expect(longTermStatus({ checkedInAt: "2026-06-30T01:00:00Z", completedAt: null })).toBe("arrived");
  });
  it("returns 'checked-out' when completed (even if checkedInAt is set)", () => {
    expect(
      longTermStatus({ checkedInAt: "2026-06-30T01:00:00Z", completedAt: "2026-06-30T05:00:00Z" }),
    ).toBe("checked-out");
  });
  it("treats a missing completedAt as not checked out", () => {
    expect(longTermStatus({ checkedInAt: "2026-06-30T01:00:00Z" })).toBe("arrived");
  });
});

describe("isLongTermCheckoutable", () => {
  it("allows a merchant who has arrived", () => {
    expect(
      isLongTermCheckoutable({ visitorType: "merchant", checkedInAt: "2026-06-30T01:00:00Z", completedAt: null }),
    ).toBe(true);
  });
  it("allows a rider who has arrived", () => {
    expect(
      isLongTermCheckoutable({ visitorType: "rider", checkedInAt: "2026-06-30T01:00:00Z", completedAt: null }),
    ).toBe(true);
  });
  it("rejects a merchant who only registered (not arrived)", () => {
    expect(
      isLongTermCheckoutable({ visitorType: "merchant", checkedInAt: null, completedAt: null }),
    ).toBe(false);
  });
  it("rejects a merchant already checked out", () => {
    expect(
      isLongTermCheckoutable({ visitorType: "merchant", checkedInAt: "2026-06-30T01:00:00Z", completedAt: "2026-06-30T05:00:00Z" }),
    ).toBe(false);
  });
  it("rejects a host-type visitor even when arrived", () => {
    expect(
      isLongTermCheckoutable({ visitorType: "visitor", checkedInAt: "2026-06-30T01:00:00Z", completedAt: null }),
    ).toBe(false);
  });
  it("rejects when visitorType is missing", () => {
    expect(
      isLongTermCheckoutable({ checkedInAt: "2026-06-30T01:00:00Z", completedAt: null }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Project/ICPBooking/icp-mb-booking && npx jest src/services/api.test.ts`
Expected: FAIL — `longTermStatus`/`isLongTermCheckoutable` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/services/api.ts`, add the two fields to the `TodayAppointment` interface (after `checkedInAt: string | null;`):

```ts
  completedAt?: string | null;
  visitorType?: VisitorType;
```

Then add, right after the `TodayAppointment` interface:

```ts
export type LongTermStatus = "registered" | "arrived" | "checked-out";

// อนุมานสถานะ long-term จาก timestamp ที่ server คืนมา (completedAt ชนะ checkedInAt)
export function longTermStatus(
  a: Pick<TodayAppointment, "checkedInAt" | "completedAt">,
): LongTermStatus {
  if (a.completedAt) return "checked-out";
  if (a.checkedInAt) return "arrived";
  return "registered";
}

// เลือกเช็คเอาท์ในแอปได้เฉพาะ rider/แม่ค้า (ไม่มี host) ที่สถานะ "มาแล้ว"
export function isLongTermCheckoutable(
  a: Pick<TodayAppointment, "checkedInAt" | "completedAt" | "visitorType">,
): boolean {
  return (
    (a.visitorType === "rider" || a.visitorType === "merchant") &&
    longTermStatus(a) === "arrived"
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/Project/ICPBooking/icp-mb-booking && npx jest src/services/api.test.ts`
Expected: PASS (all new + existing cases green).

- [ ] **Step 5: Typecheck the changed file**

Run: `cd C:/Project/ICPBooking/icp-mb-booking && npx tsc --noEmit 2>&1 | grep -E "services/api" || echo "OK: api.ts has no type errors"`
Expected: prints `OK: api.ts has no type errors`.
Note: the repo's full `tsc` reports pre-existing errors in unrelated starter-template files under `app/` and `components/` (missing `expo-image`, `react-native-reanimated`, etc.). Ignore those — only your changed files must be clean. The grep filters to just your file.

- [ ] **Step 6: Commit**

```bash
git -C C:/Project/ICPBooking/icp-mb-booking add src/services/api.ts src/services/api.test.ts
git -C C:/Project/ICPBooking/icp-mb-booking commit -m "feat: longTermStatus + isLongTermCheckoutable helpers and completedAt/visitorType fields

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Mobile — 3-state status badge on long-term cards

**Repo / working dir:** `C:/Project/ICPBooking/icp-mb-booking`

**Files:**
- Modify: `src/screens/NotificationScreen.tsx` (import; `AppointmentCard`; styles; add 3 badge helpers)

**Interfaces:**
- Consumes: `longTermStatus`, `LongTermStatus` from Task 4.

- [ ] **Step 1: Import the status helper**

Change line 11 of `src/screens/NotificationScreen.tsx` from:

```tsx
import { getActiveLongTermAppointments, TodayAppointment } from "../services/api";
```

to:

```tsx
import { getActiveLongTermAppointments, longTermStatus, LongTermStatus, TodayAppointment } from "../services/api";
```

- [ ] **Step 2: Compute the long-term status in `AppointmentCard`**

In `function AppointmentCard(...)`, just after:

```tsx
  const isLongTerm = item.qrMode === "long-term";
  const checkedIn = !!item.checkedInAt;
```

add:

```tsx
  const ltStatus = longTermStatus(item);
```

- [ ] **Step 3: Replace the static long-term badge with the 3-state badge**

Change:

```tsx
        {isLongTerm ? (
          <View style={[styles.statusBadge, styles.statusLongTerm]}>
            <Text style={[styles.statusText, styles.statusLongTermText]}>ระยะยาว</Text>
          </View>
        ) : (
```

to:

```tsx
        {isLongTerm ? (
          <View style={[styles.statusBadge, longTermBadgeStyle(ltStatus)]}>
            <Text style={[styles.statusText, longTermTextStyle(ltStatus)]}>{longTermLabel(ltStatus)}</Text>
          </View>
        ) : (
```

- [ ] **Step 4: Add the badge helper functions**

Immediately after the `function Pill(...) { ... }` definition (before `const styles = StyleSheet.create(`), add:

```tsx
function longTermLabel(s: LongTermStatus) {
  return s === "registered" ? "ลงทะเบียน" : s === "arrived" ? "มาแล้ว" : "เช็คเอาท์";
}

function longTermBadgeStyle(s: LongTermStatus) {
  return s === "registered"
    ? styles.statusPending
    : s === "arrived"
      ? styles.statusChecked
      : styles.statusCheckedOut;
}

function longTermTextStyle(s: LongTermStatus) {
  return s === "registered"
    ? styles.statusPendingText
    : s === "arrived"
      ? styles.statusCheckedText
      : styles.statusCheckedOutText;
}
```

- [ ] **Step 5: Add the checked-out styles**

In `StyleSheet.create({ ... })`, add these two entries next to the existing `statusLongTerm` entries:

```tsx
  statusCheckedOut: { backgroundColor: "#e5e7eb" },
  statusCheckedOutText: { color: "#374151" },
```

- [ ] **Step 6: Typecheck the changed file**

Run: `cd C:/Project/ICPBooking/icp-mb-booking && npx tsc --noEmit 2>&1 | grep -E "NotificationScreen" || echo "OK: NotificationScreen.tsx has no type errors"`
Expected: prints `OK: NotificationScreen.tsx has no type errors`. (Pre-existing errors in `app/`/`components/` starter files are unrelated — the grep filters to your file.)

- [ ] **Step 7: Manual verification**

In the running app, open the ระยะยาว tab. Confirm cards show `ลงทะเบียน` (gray) before any scan, `มาแล้ว` (green) after scanning, and `เช็คเอาท์` (gray) after checkout. (Status logic itself is unit-tested in Task 4.)

- [ ] **Step 8: Commit**

```bash
git -C C:/Project/ICPBooking/icp-mb-booking add src/screens/NotificationScreen.tsx
git -C C:/Project/ICPBooking/icp-mb-booking commit -m "feat: 3-state status badge (ลงทะเบียน/มาแล้ว/เช็คเอาท์) on long-term cards

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Mobile — multi-select checkout mode (rider/merchant)

**Repo / working dir:** `C:/Project/ICPBooking/icp-mb-booking`

**Files:**
- Modify: `src/screens/NotificationScreen.tsx` (import; `NotificationScreen` state/handlers/UI; `AppointmentCard` props; styles)

**Interfaces:**
- Consumes: `isLongTermCheckoutable`, `checkoutAppointment` from `../services/api` (Task 4 + existing); `longTermStatus` (Task 5).

- [ ] **Step 1: Extend the api import**

Change the import line from:

```tsx
import { getActiveLongTermAppointments, longTermStatus, LongTermStatus, TodayAppointment } from "../services/api";
```

to:

```tsx
import { checkoutAppointment, getActiveLongTermAppointments, isLongTermCheckoutable, longTermStatus, LongTermStatus, TodayAppointment } from "../services/api";
```

Also ensure `ActivityIndicator` is imported from `react-native` (it already is, used by the loading state).

- [ ] **Step 2: Add select-mode state to `NotificationScreen`**

After the existing `const [lastUpdated, setLastUpdated] = useState<Date | null>(null);` line, add:

```tsx
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [checkingOut, setCheckingOut] = useState(false);
```

- [ ] **Step 3: Add the select handlers**

Just before the `const today = new Date().toLocaleDateString(...)` line, add:

```tsx
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function checkoutSelected() {
    if (selectedIds.size === 0) return;
    setCheckingOut(true);
    try {
      await Promise.allSettled([...selectedIds].map((id) => checkoutAppointment(id)));
      await fetchAppointments();
    } finally {
      setCheckingOut(false);
      exitSelectMode();
    }
  }
```

- [ ] **Step 4: Add the select toggle bar (long-term tab only)**

Immediately after the closing `</View>` of the tab row (`{/* ── แท็บสลับ ปกติ / ระยะยาว ── */}` block), add:

```tsx
      {isLongTerm && (
        <View style={styles.selectBar}>
          <TouchableOpacity
            style={styles.selectToggle}
            onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            activeOpacity={0.8}
          >
            <Text style={styles.selectToggleText}>
              {selectMode ? "ยกเลิก" : "เลือกเช็คเอาท์"}
            </Text>
          </TouchableOpacity>
          {selectMode && (
            <Text style={styles.selectHint}>เลือก rider/แม่ค้า ที่ "มาแล้ว"</Text>
          )}
        </View>
      )}
```

- [ ] **Step 5: Pass select props into the card**

Change the `renderItem` of the `FlatList` from:

```tsx
          renderItem={({ item }) => <AppointmentCard item={item} onScanRequest={onScanRequest} />}
```

to:

```tsx
          renderItem={({ item }) => (
            <AppointmentCard
              item={item}
              onScanRequest={onScanRequest}
              selectMode={isLongTerm && selectMode}
              selected={selectedIds.has(item._id)}
              selectable={isLongTermCheckoutable(item)}
              onToggleSelect={toggleSelect}
            />
          )}
```

- [ ] **Step 6: Add the bottom action bar**

Immediately before the final closing `</View>` of the component's root container (the `<View style={styles.container}>` opened near the top of the returned JSX), add:

```tsx
      {isLongTerm && selectMode && (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[
              styles.checkoutBtn,
              (selectedIds.size === 0 || checkingOut) && styles.checkoutDisabled,
            ]}
            onPress={checkoutSelected}
            disabled={selectedIds.size === 0 || checkingOut}
            activeOpacity={0.85}
          >
            {checkingOut ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.checkoutBtnText}>
                เช็คเอาท์ที่เลือก ({selectedIds.size})
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
```

- [ ] **Step 7: Replace `AppointmentCard` with the select-aware version**

Replace the entire `function AppointmentCard(...) { ... }` (as left by Task 5) with:

```tsx
function AppointmentCard({
  item,
  onScanRequest,
  selectMode = false,
  selected = false,
  selectable = false,
  onToggleSelect,
}: {
  item: TodayAppointment;
  onScanRequest?: () => void;
  selectMode?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const isLongTerm = item.qrMode === "long-term";
  const checkedIn = !!item.checkedInAt;
  const ltStatus = longTermStatus(item);

  // โหมดเลือก: แตะเพื่อเลือก (เฉพาะใบที่เลือกได้); โหมดปกติ: แตะเพื่อสแกน
  const tappable = selectMode
    ? selectable
    : !!onScanRequest && (isLongTerm || !checkedIn);
  const Wrapper = tappable ? TouchableOpacity : View;
  const handlePress = selectMode ? () => onToggleSelect?.(item._id) : onScanRequest;

  return (
    <Wrapper
      style={[
        styles.card,
        selectMode && !selectable && styles.cardDisabled,
        selected && styles.cardSelected,
      ]}
      {...(tappable ? { onPress: handlePress, activeOpacity: 0.75 } : {})}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.visitorName}>{item.visitorName}</Text>
          <Text style={styles.organization}>{item.visitorOrganization}</Text>
        </View>
        {selectMode && isLongTerm ? (
          <View
            style={[
              styles.checkbox,
              selected && styles.checkboxOn,
              !selectable && styles.checkboxDisabled,
            ]}
          >
            <Text style={styles.checkboxMark}>{selected ? "✓" : ""}</Text>
          </View>
        ) : isLongTerm ? (
          <View style={[styles.statusBadge, longTermBadgeStyle(ltStatus)]}>
            <Text style={[styles.statusText, longTermTextStyle(ltStatus)]}>{longTermLabel(ltStatus)}</Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, checkedIn ? styles.statusChecked : styles.statusPending]}>
            <Text style={[styles.statusText, checkedIn ? styles.statusCheckedText : styles.statusPendingText]}>
              {checkedIn ? "เช็คอินแล้ว" : "รอเช็คอิน"}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.pillRow}>
        {isLongTerm ? (
          <Pill icon="📅" text={item.expiryDate ? `ถึง ${item.expiryDate}` : "ไม่จำกัด"} />
        ) : (
          <Pill icon="🕐" text={item.appointmentTime} />
        )}
        <Pill icon="📌" text={item.purpose} />
        {item.visitorCount > 1 && <Pill icon="👥" text={`${item.visitorCount} คน`} />}
        {item.hasVehicle && item.licensePlate ? <Pill icon="🚗" text={item.licensePlate} /> : null}
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.createdBy}>มาพบ: {item.createdByName}</Text>
        {!selectMode && tappable && (
          <View style={styles.scanHint}>
            <Text style={styles.scanHintText}>📷 แตะเพื่อสแกน</Text>
          </View>
        )}
      </View>
    </Wrapper>
  );
}
```

- [ ] **Step 8: Add the new styles**

In `StyleSheet.create({ ... })`, add:

```tsx
  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  selectToggle: {
    backgroundColor: "#1f2937",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  selectToggleText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  selectHint: { color: "#6b7280", fontSize: 12, flex: 1 },
  cardDisabled: { opacity: 0.45 },
  cardSelected: { borderWidth: 2, borderColor: "#16a34a" },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#9ca3af",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxOn: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  checkboxDisabled: { borderColor: "#e5e7eb", backgroundColor: "#f3f4f6" },
  checkboxMark: { color: "#fff", fontSize: 16, fontWeight: "700" },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  checkoutBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  checkoutDisabled: { opacity: 0.5 },
  checkoutBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
```

- [ ] **Step 9: Typecheck the changed file**

Run: `cd C:/Project/ICPBooking/icp-mb-booking && npx tsc --noEmit 2>&1 | grep -E "NotificationScreen" || echo "OK: NotificationScreen.tsx has no type errors"`
Expected: prints `OK: NotificationScreen.tsx has no type errors`. (Pre-existing errors in `app/`/`components/` starter files are unrelated — the grep filters to your file.)

- [ ] **Step 10: Manual verification**

1. ระยะยาว tab → tap **เลือกเช็คเอาท์**.
2. Only rider/merchant cards with status `มาแล้ว` are tappable (others dimmed, checkbox disabled).
3. Select two, tap **เช็คเอาท์ที่เลือก (2)** → list refreshes, those cards become `เช็คเอาท์`, mode exits.
4. Tap **ยกเลิก** exits without changes. In normal mode, tapping a card still opens the scanner.

- [ ] **Step 11: Commit**

```bash
git -C C:/Project/ICPBooking/icp-mb-booking add src/screens/NotificationScreen.tsx
git -C C:/Project/ICPBooking/icp-mb-booking commit -m "feat: multi-select in-app checkout for rider/merchant long-term visitors

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notes for the executor

- **Server tasks (1-3) and mobile tasks (4-6) are independent** and can be done in either order; within each group, keep the listed order (Task 2 depends on Task 1; Tasks 5-6 depend on Task 4).
- Re-run the relevant suite (`npm test` in each repo) before the final commit of each group.
- Do **not** touch any server files other than the three named here; another workstream shares the ICPBooking branch.
