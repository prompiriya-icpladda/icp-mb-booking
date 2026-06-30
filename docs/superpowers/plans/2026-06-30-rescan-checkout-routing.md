# Re-scan Checkout Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a guard re-scans an already-arrived rider/merchant QR, skip the "duplicate check-in" modal and route to the notification screen with that visitor's long-term detail/checkout card opened automatically.

**Architecture:** Mobile-only (`icp-mb-booking`). A pure decision helper (`shouldRouteToCheckout`) gates the behavior in `ScannerScreen`. The scanned appointment `_id` flows `ScannerScreen → App → NotificationScreen` via optional callback/props. `NotificationScreen` resolves the id to a card with two effects so it survives the fetch-after-remount delay (App renders screens conditionally, so `NotificationScreen` re-mounts and re-fetches each time the guard returns to it).

**Tech Stack:** React Native 0.81 / Expo 54, TypeScript, Jest + ts-jest (node-only, pure-function tests).

## Global Constraints

- No server changes — mobile only.
- New component props are **optional** so each task compiles independently (`npx tsc --noEmit` stays green at every commit).
- `npx tsc --noEmit` baseline = ~8 pre-existing `expo-*` / `react-native-reanimated` "Cannot find module" errors in the dead `app/` scaffold. "Clean" means **no new errors outside `app/`, `components/`** — i.e. nothing under `src/` or `App.tsx`.
- Routing condition (verbatim): route to checkout only when `res.success && res.alreadyCheckedIn && res.canCheckout`.
- Card lookup key: appointment `_id` (scan id === `TodayAppointment._id`).
- Thai UI copy and comments to match surrounding code.

---

### Task 1: `shouldRouteToCheckout` pure helper

**Files:**
- Modify: `src/services/api.ts` (add helper after `checkinAppointment`, ends line 56)
- Test: `src/services/api.test.ts` (append new `describe` block; extend import on line 1)

**Interfaces:**
- Consumes: `CheckinResult` (existing interface, `src/services/api.ts:13-28` — fields `success?`, `alreadyCheckedIn?`, `canCheckout?` all optional booleans)
- Produces: `shouldRouteToCheckout(res: CheckinResult): boolean` — used by Task 2.

- [ ] **Step 1: Write the failing test**

Append to `src/services/api.test.ts`:

```ts
describe("shouldRouteToCheckout", () => {
  it("returns true for a re-scanned rider/merchant that can still check out", () => {
    expect(
      shouldRouteToCheckout({ success: true, alreadyCheckedIn: true, canCheckout: true }),
    ).toBe(true);
  });
  it("returns false on first check-in (not a re-scan)", () => {
    expect(
      shouldRouteToCheckout({ success: true, alreadyCheckedIn: false, canCheckout: true }),
    ).toBe(false);
  });
  it("returns false when the visitor cannot be checked out (e.g. host re-scan)", () => {
    expect(
      shouldRouteToCheckout({ success: true, alreadyCheckedIn: true, canCheckout: false }),
    ).toBe(false);
  });
  it("returns false when the check-in was not successful", () => {
    expect(
      shouldRouteToCheckout({ success: false, alreadyCheckedIn: true, canCheckout: true }),
    ).toBe(false);
  });
  it("returns false for an empty result", () => {
    expect(shouldRouteToCheckout({})).toBe(false);
  });
});
```

Extend the import on line 1 of `src/services/api.test.ts` to add `shouldRouteToCheckout`:

```ts
import { visitorTypeNeedsIdCard, visitorTypeNeedsCompany, maskIdNumber, longTermStatus, isLongTermCheckoutable, longTermCardAction, shouldRouteToCheckout } from "./api";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/api.test.ts -t "shouldRouteToCheckout"`
Expected: FAIL — TypeScript/Jest error that `shouldRouteToCheckout` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

In `src/services/api.ts`, immediately after the `checkinAppointment` function (after line 56), add:

```ts
// สแกนซ้ำ rider/แม่ค้า ที่ยัง "มาแล้ว" (ยังเช็คเอาท์ได้) → ให้เด้งไปหน้าเช็คเอาท์
export function shouldRouteToCheckout(res: CheckinResult): boolean {
  return !!(res.success && res.alreadyCheckedIn && res.canCheckout);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/api.test.ts -t "shouldRouteToCheckout"`
Expected: PASS — 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/services/api.ts src/services/api.test.ts
git commit -m "feat: shouldRouteToCheckout helper for re-scan routing"
```

---

### Task 2: `ScannerScreen` routes re-scans to checkout

**Files:**
- Modify: `src/screens/ScannerScreen.tsx` (api import; component signature; `handleBarcodeScan`)

**Interfaces:**
- Consumes: `shouldRouteToCheckout(res)` from Task 1.
- Produces: new optional prop `onCheckout?: (appointmentId: string) => void` — wired by Task 4.

- [ ] **Step 1: Add `shouldRouteToCheckout` to the api import**

Change the api import (currently `import { checkinAppointment, CheckinResult } from "../services/api";`) to:

```ts
import {
  checkinAppointment,
  CheckinResult,
  shouldRouteToCheckout,
} from "../services/api";
```

- [ ] **Step 2: Add the `onCheckout` prop to the component signature**

Change `export default function ScannerScreen({ onBack }: { onBack?: () => void }) {` to:

```ts
export default function ScannerScreen({
  onBack,
  onCheckout,
}: {
  onBack?: () => void;
  onCheckout?: (appointmentId: string) => void;
}) {
```

- [ ] **Step 3: Route re-scans in `handleBarcodeScan`**

Inside `handleBarcodeScan`, find:

```ts
      const res = await checkinAppointment(id);
      if (res.success) {
```

and insert the routing check between those two lines so it reads:

```ts
      const res = await checkinAppointment(id);
      if (onCheckout && shouldRouteToCheckout(res)) {
        onCheckout(id);
        return; // ข้าม modal — กำลังเด้งไปหน้าแจ้งเตือนเพื่อเช็คเอาท์ (อย่า setState ต่อ: หน้านี้กำลังจะ unmount)
      }
      if (res.success) {
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors under `src/` or `App.tsx` (only the baseline `app/`/`components/` expo errors). `onCheckout` is optional, so `App.tsx` still compiles without passing it.

- [ ] **Step 5: Commit**

```bash
git add src/screens/ScannerScreen.tsx
git commit -m "feat: ScannerScreen routes re-scanned checkoutable QR to onCheckout"
```

---

### Task 3: `NotificationScreen` opens the scanned visitor's card

**Files:**
- Modify: `src/screens/NotificationScreen.tsx` (component signature; add state; add two effects)

**Interfaces:**
- Consumes: `longTermAppointments: TodayAppointment[]` (existing state), `setActiveTab`, `setDetailItem` (existing setters).
- Produces: new optional props `openCheckoutId?: string | null`, `onCheckoutConsumed?: () => void` — wired by Task 4.

- [ ] **Step 1: Add the new props to the component signature**

Change `export default function NotificationScreen({ onScanRequest }: { onScanRequest?: () => void }) {` to:

```ts
export default function NotificationScreen({
  onScanRequest,
  openCheckoutId,
  onCheckoutConsumed,
}: {
  onScanRequest?: () => void;
  openCheckoutId?: string | null;
  onCheckoutConsumed?: () => void;
}) {
```

- [ ] **Step 2: Add `pendingCheckoutId` state**

Immediately after the existing `const [detailItem, setDetailItem] = useState<TodayAppointment | null>(null);` line, add:

```ts
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null);
```

- [ ] **Step 3: Add the two routing effects**

Immediately after the existing `useEffect(() => { exitSelectMode(); }, [activeTab]);` block, add:

```ts
  // รับ id จากการสแกนซ้ำ → สลับไปแท็บระยะยาว ตั้ง pending แล้วเคลียร์ฝั่ง App (กัน re-trigger ตอน remount)
  useEffect(() => {
    if (!openCheckoutId) return;
    setActiveTab("longTerm");
    setPendingCheckoutId(openCheckoutId);
    onCheckoutConsumed?.();
  }, [openCheckoutId, onCheckoutConsumed]);

  // เมื่อมี pending และข้อมูลระยะยาวพร้อม → เปิด detail/checkout ของคนนั้น (re-run เองเมื่อ list มาทีหลัง)
  useEffect(() => {
    if (!pendingCheckoutId) return;
    const item = longTermAppointments.find((a) => a._id === pendingCheckoutId);
    if (item) {
      setDetailItem(item);
      setPendingCheckoutId(null);
    }
  }, [pendingCheckoutId, longTermAppointments]);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors under `src/` or `App.tsx`. New props are optional, so `App.tsx` still compiles without passing them.

- [ ] **Step 5: Commit**

```bash
git add src/screens/NotificationScreen.tsx
git commit -m "feat: NotificationScreen opens scanned visitor's checkout card"
```

---

### Task 4: Wire it together in `App.tsx`

**Files:**
- Modify: `App.tsx` (`MainApp`: add state + handler; pass props to both screens)

**Interfaces:**
- Consumes: `ScannerScreen` prop `onCheckout` (Task 2); `NotificationScreen` props `openCheckoutId`, `onCheckoutConsumed` (Task 3).
- Produces: end-to-end behavior. No new exports.

- [ ] **Step 1: Add `checkoutTargetId` state**

In `MainApp`, after `const [fromNotification, setFromNotification] = useState(false);`, add:

```ts
  const [checkoutTargetId, setCheckoutTargetId] = useState<string | null>(null);
```

- [ ] **Step 2: Add the `handleGoCheckout` handler**

After the existing `handleBackToNotification` function, add:

```ts
  function handleGoCheckout(id: string) {
    setCheckoutTargetId(id);
    setFromNotification(false);
    setActiveTab("notification");
  }
```

- [ ] **Step 3: Pass props to both screens**

Replace the screen-switch block in `MainApp`'s return:

```tsx
        {activeTab === "notification" ? (
          <NotificationScreen onScanRequest={handleScanRequest} />
        ) : activeTab === "scanner" ? (
          <ScannerScreen
            onBack={fromNotification ? handleBackToNotification : undefined}
          />
        ) : (
          <WalkInScreen />
        )}
```

with:

```tsx
        {activeTab === "notification" ? (
          <NotificationScreen
            onScanRequest={handleScanRequest}
            openCheckoutId={checkoutTargetId}
            onCheckoutConsumed={() => setCheckoutTargetId(null)}
          />
        ) : activeTab === "scanner" ? (
          <ScannerScreen
            onBack={fromNotification ? handleBackToNotification : undefined}
            onCheckout={handleGoCheckout}
          />
        ) : (
          <WalkInScreen />
        )}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors under `src/` or `App.tsx` (only baseline `app/`/`components/` expo errors).

- [ ] **Step 5: Run the full unit suite**

Run: `npm test`
Expected: all suites pass (including the 5 new `shouldRouteToCheckout` cases). No RN component tests exist — wiring is verified by tsc + on-device.

- [ ] **Step 6: Commit**

```bash
git add App.tsx
git commit -m "feat: route re-scanned checkoutable QR to notification checkout card"
```

---

### Task 5: On-device verification (manual — server behavior gate)

**Files:** none (manual test on a real device/emulator running the app).

This gates the spec's stated assumption: the server returns `alreadyCheckedIn=true` + `canCheckout=true` when a rider/merchant QR is re-scanned in the "arrived" state. Unit tests cannot cover this.

- [ ] **Step 1: First scan = check-in.** Scan a rider/merchant long-term QR that has not arrived yet. Expect the normal result modal ("เช็คอินสำเร็จ"). No navigation.
- [ ] **Step 2: Re-scan = routed checkout.** Scan the same QR again. Expect: no modal; app switches to แจ้งเตือน → ระยะยาว sub-tab; `LongTermDetailScreen` for that visitor opens automatically; tapping "เช็คเอาท์" succeeds and the card returns to the list as "เช็คเอาท์".
- [ ] **Step 3: Host/normal re-scan unaffected.** Re-scan a host-type / normal appointment (where `canCheckout` is false). Expect the existing "เช็คอินซ้ำ" modal — no navigation.
- [ ] **Step 4: Opened from either entry point.** Verify Step 2 works both when the scanner was opened from the แจ้งเตือน scan button and from the สแกน QR tab directly.
- [ ] **Step 5: Card not in list (edge).** If `canCheckout`-true id is somehow absent from the long-term list, confirm the app lands on the ระยะยาว tab without crashing or hanging.

---

## Self-Review

**1. Spec coverage:**
- Routing condition `success && alreadyCheckedIn && canCheckout` → Task 1 helper + Task 2 usage. ✓
- Skip modal, navigate to notification → Task 2 (`return`) + Task 4 (`handleGoCheckout`). ✓
- Open longTerm sub-tab + that visitor's detail card → Task 3 effects. ✓
- Fetch-after-remount delay handled by two effects → Task 3. ✓
- Works regardless of scanner entry point (not tied to `fromNotification`) → Task 4 always passes `onCheckout`. ✓
- Edge: item not found → Task 3 (pending stays, no crash) + Task 5 Step 5. ✓
- `LongTermDetailScreen` always shows checkout button (stale-item tolerant) → existing behavior, verified Task 5 Step 2. ✓
- Server assumption → Task 5 (manual). ✓
- Unit tests for the helper → Task 1. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**3. Type consistency:** `shouldRouteToCheckout(res: CheckinResult): boolean` identical in Task 1 (def), Task 2 (call). `onCheckout?: (appointmentId: string) => void` identical in Task 2 (prop) and Task 4 (`handleGoCheckout(id: string)` passed). `openCheckoutId?: string | null` / `onCheckoutConsumed?: () => void` identical in Task 3 (props) and Task 4 (`checkoutTargetId` state is `string | null`; `() => setCheckoutTargetId(null)`). Lookup key `_id` consistent. ✓
