# Long-term Visitor Detail Screen + Per-card Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen detail page for long-term "arrived" rider/merchant visitors, opened by tapping their card, with a single "เช็คเอาท์" button that checks them out and returns to the notification list.

**Architecture:** Mobile-only (`icp-mb-booking`). A new isolated screen component (`LongTermDetailScreen`) is rendered inside a full-screen `Modal` owned by `NotificationScreen` (which already owns the long-term data + refresh). Tap routing is decided by a new pure helper `longTermCardAction` (unit-tested). No server changes — the existing `checkin` endpoint already clears `completedAt`, so re-scanning a checked-out QR returns it to "arrived".

**Tech Stack:** React Native / Expo + TypeScript; Jest + ts-jest (node env, `*.test.ts` only — no component-render testing library).

**Spec:** `docs/superpowers/specs/2026-06-30-longterm-visitor-detail-checkout-design.md`

## Global Constraints

- **Single repo:** `C:/Project/ICPBooking/icp-mb-booking`. **Do NOT touch** the `ICPBooking` server repo — re-check-in already works server-side.
- **Coexist, don't replace:** the existing multi-select "เลือกเช็คเอาท์" mode stays fully intact.
- **Detail opens only for** long-term cards where `isLongTermCheckoutable(item)` is true (status "arrived" AND `visitorType` rider/merchant). All other cards (host-type, registered, checked-out, single-use) keep their current tap behavior (scan).
- **In select mode**, tapping a card still toggles selection (detail never opens).
- **UI copy is Thai.** Status badge label = `มาแล้ว`; checkout button = `เช็คเอาท์`; detail card tap hint = `› ดูรายละเอียด` (scan hint stays `📷 แตะเพื่อสแกน`).
- **Test setup:** `jest.config.js` uses `testEnvironment: "node"`, `testMatch: ["**/*.test.ts"]`. Only pure functions are unit-tested. Component + integration changes are verified with `npx tsc --noEmit` plus manual device checks.
- **Style:** match existing screens — dark header `#1f2937`, accent green `#16a34a`, white cards, muted text `#6b7280`.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

### Task 1: `longTermCardAction` pure helper (decides tap routing)

**Working dir:** `C:/Project/ICPBooking/icp-mb-booking`

**Files:**
- Modify: `src/services/api.ts` (add after `isLongTermCheckoutable`, ~line 109)
- Test: `src/services/api.test.ts` (append)

**Interfaces:**
- Consumes: `isLongTermCheckoutable`, `TodayAppointment` (already in `api.ts`).
- Produces: `type LongTermCardAction = "detail" | "scan" | "select"` and
  `longTermCardAction(a: Pick<TodayAppointment, "checkedInAt" | "completedAt" | "visitorType">, selectMode: boolean) => LongTermCardAction` — used by Task 3.

- [ ] **Step 1: Write the failing test**

Add `longTermCardAction` to the import on line 1 of `src/services/api.test.ts` so it reads:

```ts
import { visitorTypeNeedsIdCard, visitorTypeNeedsCompany, maskIdNumber, longTermStatus, isLongTermCheckoutable, longTermCardAction } from "./api";
```

Then append this block to the end of `src/services/api.test.ts`:

```ts
describe("longTermCardAction", () => {
  const arrivedRider = { visitorType: "rider" as const, checkedInAt: "2026-06-30T01:00:00Z", completedAt: null };
  const arrivedMerchant = { visitorType: "merchant" as const, checkedInAt: "2026-06-30T01:00:00Z", completedAt: null };

  it("returns 'select' in select mode regardless of type/status", () => {
    expect(longTermCardAction(arrivedRider, true)).toBe("select");
    expect(longTermCardAction({ visitorType: "visitor", checkedInAt: null, completedAt: null }, true)).toBe("select");
  });

  it("returns 'detail' for an arrived rider/merchant when not in select mode", () => {
    expect(longTermCardAction(arrivedRider, false)).toBe("detail");
    expect(longTermCardAction(arrivedMerchant, false)).toBe("detail");
  });

  it("returns 'scan' for a rider/merchant that only registered (not arrived)", () => {
    expect(longTermCardAction({ visitorType: "merchant", checkedInAt: null, completedAt: null }, false)).toBe("scan");
  });

  it("returns 'scan' for a rider/merchant already checked out", () => {
    expect(longTermCardAction({ visitorType: "rider", checkedInAt: "2026-06-30T01:00:00Z", completedAt: "2026-06-30T05:00:00Z" }, false)).toBe("scan");
  });

  it("returns 'scan' for a host-type visitor even when arrived", () => {
    expect(longTermCardAction({ visitorType: "visitor", checkedInAt: "2026-06-30T01:00:00Z", completedAt: null }, false)).toBe("scan");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/services/api.test.ts -t longTermCardAction`
Expected: FAIL — `longTermCardAction is not a function` (or TS import error).

- [ ] **Step 3: Write minimal implementation**

In `src/services/api.ts`, immediately after the `isLongTermCheckoutable` function (ends ~line 109), add:

```ts
export type LongTermCardAction = "detail" | "scan" | "select";

// ตัดสินว่าแตะการ์ด long-term แล้วทำอะไร (pure → unit test ได้)
//  - select mode: เลือก
//  - มาแล้ว + rider/แม่ค้า: เปิดหน้ารายละเอียด
//  - อื่นๆ: ไปสแกน (เหมือนเดิม)
export function longTermCardAction(
  a: Pick<TodayAppointment, "checkedInAt" | "completedAt" | "visitorType">,
  selectMode: boolean,
): LongTermCardAction {
  if (selectMode) return "select";
  return isLongTermCheckoutable(a) ? "detail" : "scan";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/services/api.test.ts -t longTermCardAction`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full test file + typecheck**

Run: `npx jest src/services/api.test.ts` → Expected: all existing + new tests PASS.
Run: `npx tsc --noEmit` → Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/api.ts src/services/api.test.ts
git commit -m "feat: longTermCardAction helper for card tap routing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `LongTermDetailScreen` component

**Working dir:** `C:/Project/ICPBooking/icp-mb-booking`

**Files:**
- Create: `src/screens/LongTermDetailScreen.tsx`

**Interfaces:**
- Consumes: `checkoutAppointment`, `TodayAppointment`, `VisitorType` from `../services/api`.
- Produces: default export
  `LongTermDetailScreen(props: { appointment: TodayAppointment; onBack: () => void; onCheckedOut: () => void })` — used by Task 3. `onCheckedOut` is called only on a successful checkout.

**Note:** No component-render test (no RN testing lib). Verification is `npx tsc --noEmit` + manual.

- [ ] **Step 1: Create the component file**

Create `src/screens/LongTermDetailScreen.tsx` with exactly:

```tsx
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { checkoutAppointment, TodayAppointment, VisitorType } from "../services/api";

function visitorTypeLabel(t?: VisitorType): string {
  if (t === "rider") return "Rider";
  if (t === "merchant") return "แม่ค้า";
  return t ?? "-";
}

function formatCheckedInAt(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LongTermDetailScreen({
  appointment,
  onBack,
  onCheckedOut,
}: {
  appointment: TodayAppointment;
  onBack: () => void;
  onCheckedOut: () => void;
}) {
  const [checkingOut, setCheckingOut] = useState(false);

  async function handleCheckout() {
    if (checkingOut) return;
    setCheckingOut(true);
    try {
      const res = await checkoutAppointment(appointment._id);
      if (res.success) {
        onCheckedOut();
      } else {
        Alert.alert("ไม่สำเร็จ", res.error || "บันทึกการเช็คเอาท์ไม่สำเร็จ");
      }
    } catch (e) {
      Alert.alert(
        "ไม่สำเร็จ",
        e instanceof Error ? e.message : "บันทึกการเช็คเอาท์ไม่สำเร็จ",
      );
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={styles.backText}>‹ กลับ</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>รายละเอียดผู้มาเยือน</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>มาแล้ว</Text>
        </View>

        <Text style={styles.name}>{appointment.visitorName}</Text>
        {appointment.visitorOrganization ? (
          <Text style={styles.org}>{appointment.visitorOrganization}</Text>
        ) : null}

        <View style={styles.infoCard}>
          <InfoRow label="ประเภท" value={visitorTypeLabel(appointment.visitorType)} />
          <InfoRow label="ถึงวันที่" value={appointment.expiryDate || "ไม่จำกัด"} />
          <InfoRow label="จุดประสงค์" value={appointment.purpose} />
          {appointment.visitorCount > 1 ? (
            <InfoRow label="จำนวน" value={`${appointment.visitorCount} คน`} />
          ) : null}
          {appointment.hasVehicle && appointment.licensePlate ? (
            <InfoRow label="ทะเบียนรถ" value={appointment.licensePlate} />
          ) : null}
          <InfoRow label="ลงทะเบียนโดย" value={appointment.createdByName} />
          <InfoRow label="เข้าเมื่อ" value={formatCheckedInAt(appointment.checkedInAt)} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.checkoutBtn, checkingOut && styles.btnDisabled]}
          onPress={handleCheckout}
          disabled={checkingOut}
          activeOpacity={0.85}
        >
          {checkingOut ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.checkoutText}>เช็คเอาท์</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "-"}</Text>
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
  backBtn: { paddingVertical: 4, marginBottom: 4, alignSelf: "flex-start" },
  backText: { color: "#9ca3af", fontSize: 15, fontWeight: "600" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  body: { padding: 16 },
  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#dcfce7",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 99,
    marginBottom: 12,
  },
  statusText: { color: "#16a34a", fontSize: 13, fontWeight: "700" },
  name: { fontSize: 22, fontWeight: "700", color: "#111827" },
  org: { fontSize: 14, color: "#6b7280", marginTop: 2 },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  infoLabel: { flex: 2, color: "#6b7280", fontSize: 14 },
  infoValue: { flex: 3, color: "#111827", fontSize: 14, fontWeight: "500" },
  footer: {
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  checkoutBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  checkoutText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/LongTermDetailScreen.tsx
git commit -m "feat: LongTermDetailScreen for per-visitor long-term checkout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire detail screen into `NotificationScreen`

**Working dir:** `C:/Project/ICPBooking/icp-mb-booking`

**Files:**
- Modify: `src/screens/NotificationScreen.tsx`

**Interfaces:**
- Consumes: `longTermCardAction` (Task 1), `LongTermDetailScreen` (Task 2).
- Produces: nothing new for later tasks (terminal integration).

**Note:** No unit test (component integration). Verify with `npx tsc --noEmit` + manual checks.

- [ ] **Step 1: Update imports**

In `src/screens/NotificationScreen.tsx`:

1a. Add `Modal` to the `react-native` import block (lines 2–11). It must end up containing `Modal` alongside the existing names, e.g. change `ActivityIndicator,` region to include `Modal,`:

```tsx
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
```

1b. Add `longTermCardAction` to the `../services/api` import (line 12):

```tsx
import { checkoutAppointment, getActiveLongTermAppointments, isLongTermCheckoutable, longTermCardAction, longTermStatus, LongTermStatus, TodayAppointment } from "../services/api";
```

1c. Add a new import line directly below the `useAppointmentStream` import (after line 14):

```tsx
import LongTermDetailScreen from "./LongTermDetailScreen";
```

- [ ] **Step 2: Add detail state**

In the `NotificationScreen` component, directly after the `checkingOut` state (line 32: `const [checkingOut, setCheckingOut] = useState(false);`), add:

```tsx
  const [detailItem, setDetailItem] = useState<TodayAppointment | null>(null);
```

- [ ] **Step 3: Pass `onOpenDetail` to the card**

In the `FlatList` `renderItem` (lines 215–224), add the `onOpenDetail` prop so the block reads:

```tsx
          renderItem={({ item }) => (
            <AppointmentCard
              item={item}
              onScanRequest={onScanRequest}
              onOpenDetail={setDetailItem}
              selectMode={isLongTerm && selectMode}
              selected={selectedIds.has(item._id)}
              selectable={isLongTermCheckoutable(item)}
              onToggleSelect={toggleSelect}
            />
          )}
```

- [ ] **Step 4: Render the detail Modal**

Insert this block immediately AFTER the `{isLongTerm && selectMode && ( ... </View> )}` action-bar block (after line 248) and BEFORE the component's closing `</View>` (line 249):

```tsx
      <Modal
        visible={!!detailItem}
        animationType="slide"
        onRequestClose={() => setDetailItem(null)}
      >
        {detailItem && (
          <LongTermDetailScreen
            appointment={detailItem}
            onBack={() => setDetailItem(null)}
            onCheckedOut={() => {
              setDetailItem(null);
              fetchAppointments();
            }}
          />
        )}
      </Modal>
```

- [ ] **Step 5: Add `onOpenDetail` to `AppointmentCard` props**

In the `AppointmentCard` function signature (lines 253–267), add the prop and its type. The destructure and type block become:

```tsx
function AppointmentCard({
  item,
  onScanRequest,
  onOpenDetail,
  selectMode = false,
  selected = false,
  selectable = false,
  onToggleSelect,
}: {
  item: TodayAppointment;
  onScanRequest?: () => void;
  onOpenDetail?: (item: TodayAppointment) => void;
  selectMode?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
```

- [ ] **Step 6: Route the tap via `longTermCardAction`**

Replace the existing `tappable` / `Wrapper` / `handlePress` block (lines 272–277):

```tsx
  // โหมดเลือก: แตะเพื่อเลือก (เฉพาะใบที่เลือกได้); โหมดปกติ: แตะเพื่อสแกน
  const tappable = selectMode
    ? selectable
    : !!onScanRequest && (isLongTerm || !checkedIn);
  const Wrapper = tappable ? TouchableOpacity : View;
  const handlePress = selectMode ? () => onToggleSelect?.(item._id) : onScanRequest;
```

with:

```tsx
  // long-term: longTermCardAction ตัดสิน select/detail/scan; การ์ดปกติ: สแกนเหมือนเดิม
  const wantsDetail = isLongTerm && longTermCardAction(item, selectMode) === "detail";

  // โหมดเลือก: แตะเพื่อเลือก; "มาแล้ว" rider/แม่ค้า: เปิดรายละเอียด; อื่นๆ: สแกน
  const tappable = selectMode
    ? selectable
    : wantsDetail
      ? !!onOpenDetail
      : !!onScanRequest && (isLongTerm || !checkedIn);
  const Wrapper = tappable ? TouchableOpacity : View;
  const handlePress = selectMode
    ? () => onToggleSelect?.(item._id)
    : wantsDetail
      ? () => onOpenDetail?.(item)
      : onScanRequest;
```

- [ ] **Step 7: Update the tap hint label**

Replace the scan-hint block in the card footer (lines 327–331):

```tsx
        {!selectMode && tappable && (
          <View style={styles.scanHint}>
            <Text style={styles.scanHintText}>📷 แตะเพื่อสแกน</Text>
          </View>
        )}
```

with:

```tsx
        {!selectMode && tappable && (
          <View style={styles.scanHint}>
            <Text style={styles.scanHintText}>
              {wantsDetail ? "› ดูรายละเอียด" : "📷 แตะเพื่อสแกน"}
            </Text>
          </View>
        )}
```

- [ ] **Step 8: Typecheck + full test suite**

Run: `npx tsc --noEmit` → Expected: no errors.
Run: `npx jest` → Expected: all tests PASS (Task 1 tests included; nothing broken).

- [ ] **Step 9: Commit**

```bash
git add src/screens/NotificationScreen.tsx
git commit -m "feat: tap arrived long-term card to open detail + checkout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual / device verification (after all tasks)

Run the app (`npm start`) and on the **ระยะยาว** tab:

1. A long-term **rider/แม่ค้า** card showing **มาแล้ว** displays hint `› ดูรายละเอียด`; tapping it opens the detail screen with name, org, type, expiry, purpose, count, plate, registered-by, and check-in time.
2. Tap **เช็คเอาท์** → returns to the notification list; the card now shows **เช็คเอาท์** (list refreshed).
3. With network off, tap **เช็คเอาท์** → an Alert appears and the detail screen stays open.
4. Re-scan that visitor's QR on the **สแกน QR** tab → card returns to **มาแล้ว** (re-check-in).
5. Regression — a **ลงทะเบียน** card, a host-type card, a **เช็คเอาท์** card, and a normal/single-use card all still tap straight to the scanner (hint `📷 แตะเพื่อสแกน` where shown).
6. Regression — **เลือกเช็คเอาท์** multi-select still works: entering select mode, tapping selects (does not open detail), batch checkout succeeds.

## Self-Review notes

- **Spec coverage:** detail component (Task 2 ↔ spec A), pure helper (Task 1 ↔ spec B), NotificationScreen wiring incl. Modal + tap routing + hint (Task 3 ↔ spec C); re-check-in is server-side no-op (verified, no task); testing approach matches spec (helper unit-tested, UI manual).
- **No new server work** — confirmed `completedAt = null` on long-term checkin.
- **Type consistency:** `longTermCardAction` signature identical in Task 1 (definition), spec, and Task 3 (call). `onOpenDetail: (item: TodayAppointment) => void` identical in card props (Task 3) and `setDetailItem` state setter type (Task 3 Step 2). `onCheckedOut` / `onBack` signatures identical in Task 2 (definition) and Task 3 (usage).
