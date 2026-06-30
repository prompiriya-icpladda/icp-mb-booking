# Walk-in Registration Fields + ID Mask Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide ID-card field for rider/merchant and company field for merchant, and mask the ID-card input (`17xxxxxxxxx39`) while still sending the full 13 digits to the backend.

**Architecture:** Add three pure helper functions to `src/services/api.ts` (`visitorTypeNeedsIdCard`, `visitorTypeNeedsCompany`, `maskIdNumber`) next to the existing `visitorTypeNeedsHost`. Unit-test the pure helpers with a new minimal Jest + ts-jest setup. Wire field visibility, validation, and the masked input into `src/screens/WalkInScreen.tsx`; type-check RN changes with `tsc --noEmit` and verify behavior manually.

**Tech Stack:** React Native / Expo (SDK 54), TypeScript 5.9, Jest 29 + ts-jest (new, dev-only).

## Global Constraints

- ID-card raw value stays full 13 digits in state and is sent to backend unchanged; masking is display-only.
- `maskIdNumber` display length always equals the raw length (1 digit ↔ 1 char), so `maxLength={13}` still bounds the raw value.
- ID field hidden for `rider` and `merchant`; company field hidden for `merchant`; both keep existing host rule (`visitorTypeNeedsHost`).
- Hidden fields are sent to backend as empty string `""`.
- ID input edits supported: append at end / backspace at end (numeric pad entry). Mid-string edits are out of scope.
- Visitor types: `visitor`, `customer`, `vendor`, `supplier`, `rider`, `merchant` (from `VISITOR_TYPE_OPTIONS`).
- Jest is dev-only; it must not change Expo runtime/build. Tests use `ts-jest` transpile-only (`isolatedModules`), `testEnvironment: node`, no `jest-expo`/RN.

---

### Task 1: Jest setup + visitor-type field helpers (TDD)

**Files:**
- Create: `jest.config.js`
- Create: `tsconfig.jest.json`
- Create: `src/services/api.test.ts`
- Modify: `package.json` (add devDeps + `test` script)
- Modify: `src/services/api.ts` (add two helpers near `visitorTypeNeedsHost`, ~line 304)

**Interfaces:**
- Consumes: existing `VisitorType` type exported from `src/services/api.ts`.
- Produces:
  - `visitorTypeNeedsIdCard(visitorType: VisitorType): boolean` — `false` for `rider`/`merchant`, else `true`.
  - `visitorTypeNeedsCompany(visitorType: VisitorType): boolean` — `false` for `merchant`, else `true`.

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install --save-dev jest@^29 ts-jest@^29 @types/jest@^29 @types/node@^20
```
Expected: installs without error; `package.json` gains the four `devDependencies`. (Requires network. `postinstall` runs `patch-package` — harmless.)

- [ ] **Step 2: Create `tsconfig.jest.json`**

Create `tsconfig.jest.json`:
```json
{
  "compilerOptions": {
    "target": "ES2019",
    "module": "CommonJS",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "lib": ["ES2019", "DOM"],
    "types": ["jest", "node"]
  }
}
```

- [ ] **Step 3: Create `jest.config.js`**

Create `jest.config.js`:
```js
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: "tsconfig.jest.json", isolatedModules: true },
    ],
  },
};
```
(node_modules is ignored by Jest's default `testPathIgnorePatterns`.)

- [ ] **Step 4: Add `test` script to `package.json`**

In `package.json` `"scripts"`, add:
```json
    "test": "jest"
```

- [ ] **Step 5: Write the failing test**

Create `src/services/api.test.ts`:
```ts
import { visitorTypeNeedsIdCard, visitorTypeNeedsCompany } from "./api";

describe("visitorTypeNeedsIdCard", () => {
  it("returns false for rider and merchant", () => {
    expect(visitorTypeNeedsIdCard("rider")).toBe(false);
    expect(visitorTypeNeedsIdCard("merchant")).toBe(false);
  });
  it("returns true for the other visitor types", () => {
    expect(visitorTypeNeedsIdCard("visitor")).toBe(true);
    expect(visitorTypeNeedsIdCard("customer")).toBe(true);
    expect(visitorTypeNeedsIdCard("vendor")).toBe(true);
    expect(visitorTypeNeedsIdCard("supplier")).toBe(true);
  });
});

describe("visitorTypeNeedsCompany", () => {
  it("returns false only for merchant", () => {
    expect(visitorTypeNeedsCompany("merchant")).toBe(false);
  });
  it("returns true for rider and the other visitor types", () => {
    expect(visitorTypeNeedsCompany("rider")).toBe(true);
    expect(visitorTypeNeedsCompany("visitor")).toBe(true);
    expect(visitorTypeNeedsCompany("supplier")).toBe(true);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — runtime `TypeError: visitorTypeNeedsIdCard is not a function` (ts-jest runs in transpile-only mode, so the missing export is `undefined` at call time; this proves Jest runs and the functions are missing).

- [ ] **Step 7: Implement the helpers**

In `src/services/api.ts`, immediately after the existing `visitorTypeNeedsHost` function (the block ending ~line 304), add:
```ts
// บัตรประชาชน: ไม่ต้องใช้สำหรับ rider / merchant (แม่ค้า)
export function visitorTypeNeedsIdCard(visitorType: VisitorType): boolean {
  return visitorType !== "rider" && visitorType !== "merchant";
}

// ชื่อบริษัท: ไม่ต้องใช้สำหรับ merchant (แม่ค้า)
export function visitorTypeNeedsCompany(visitorType: VisitorType): boolean {
  return visitorType !== "merchant";
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — both `describe` blocks green.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json jest.config.js tsconfig.jest.json src/services/api.ts src/services/api.test.ts
git commit -m "test: add jest setup + visitorType field helpers"
```

---

### Task 2: `maskIdNumber` util (TDD)

**Files:**
- Modify: `src/services/api.ts` (add `maskIdNumber` after the helpers from Task 1)
- Modify: `src/services/api.test.ts` (append `maskIdNumber` tests)

**Interfaces:**
- Produces: `maskIdNumber(raw: string, focused: boolean): string`
  - First two chars always shown.
  - `focused === true`: also show only the last char (the one being typed); all other middle chars → `"x"`.
  - `focused === false`: also show the last two chars; all other middle chars → `"x"`.
  - Empty input → `""`.

- [ ] **Step 1: Write the failing tests**

Append to `src/services/api.test.ts`:
```ts
import { maskIdNumber } from "./api";

describe("maskIdNumber - while typing (focused)", () => {
  it("shows the first two digits as typed", () => {
    expect(maskIdNumber("1", true)).toBe("1");
    expect(maskIdNumber("17", true)).toBe("17");
  });
  it("reveals only the latest digit and masks earlier middle digits", () => {
    expect(maskIdNumber("173", true)).toBe("173");
    expect(maskIdNumber("1734", true)).toBe("17x4");
    expect(maskIdNumber("17345", true)).toBe("17xx5");
    expect(maskIdNumber("173456", true)).toBe("17xxx6");
  });
  it("masks all middle digits when full and focused (only last digit shown)", () => {
    expect(maskIdNumber("1734567890139", true)).toBe("17xxxxxxxxxx9");
  });
});

describe("maskIdNumber - at rest (blurred)", () => {
  it("shows first two and last two digits", () => {
    expect(maskIdNumber("1734567890139", false)).toBe("17xxxxxxxxx39");
  });
  it("shows everything when four digits or fewer", () => {
    expect(maskIdNumber("1734", false)).toBe("1734");
  });
  it("masks the middle once longer than four", () => {
    expect(maskIdNumber("17345", false)).toBe("17x45");
  });
  it("returns empty string for empty input", () => {
    expect(maskIdNumber("", false)).toBe("");
    expect(maskIdNumber("", true)).toBe("");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — runtime `TypeError: maskIdNumber is not a function` (missing export). Task 1 tests still pass.

- [ ] **Step 3: Implement `maskIdNumber`**

In `src/services/api.ts`, after `visitorTypeNeedsCompany`, add:
```ts
// แสดงผลเลขบัตรประชาชนแบบปิดบัง (เก็บ/ส่งเลขเต็ม ปิดบังเฉพาะตอนแสดง)
//  - 2 หลักหน้าโชว์เสมอ
//  - focused (กำลังพิมพ์): โชว์เฉพาะหลักล่าสุด ที่เหลือกลางเป็น x
//  - blurred (ออกจากช่อง/ครบ): โชว์ 2 หลักหน้า + 2 หลักท้าย
export function maskIdNumber(raw: string, focused: boolean): string {
  const n = raw.length;
  if (n === 0) return "";
  return raw
    .split("")
    .map((char, i) => {
      const isFirstTwo = i < 2;
      const revealLastTyped = focused && i === n - 1;
      const revealLastTwo = !focused && i >= n - 2;
      return isFirstTwo || revealLastTyped || revealLastTwo ? char : "x";
    })
    .join("");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all `maskIdNumber` cases green (plus Task 1 tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/services/api.ts src/services/api.test.ts
git commit -m "feat: add maskIdNumber display helper for ID card"
```

---

### Task 3: Conditional ID/company fields + validation in WalkInScreen

**Files:**
- Modify: `src/screens/WalkInScreen.tsx`

**Interfaces:**
- Consumes: `visitorTypeNeedsIdCard`, `visitorTypeNeedsCompany` from `../services/api` (Task 1).
- Produces: `idVisible` / `companyVisible` derived flags and `handleVisitorTypeChange(next: VisitorType)` used by Task 4 and the type chips.

- [ ] **Step 1: Import the visibility helpers**

In `src/screens/WalkInScreen.tsx`, in the existing import block from `"../services/api"` (~lines 19-29), add `visitorTypeNeedsCompany` and `visitorTypeNeedsIdCard` to the named imports. Resulting block:
```tsx
import {
  createWalkInVisit,
  HrEmployee,
  ocrLicensePlate,
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

- [ ] **Step 2: Derive visibility flags**

Immediately after the existing line `const hostRequired = visitorTypeNeedsHost(visitorType);` (~line 72), add:
```tsx
  const idVisible = visitorTypeNeedsIdCard(visitorType);
  const companyVisible = visitorTypeNeedsCompany(visitorType);
```

- [ ] **Step 3: Add a visitor-type change handler that clears hidden fields**

After the existing `updateVisitorCount` function (~line 131), add:
```tsx
  function handleVisitorTypeChange(next: VisitorType) {
    setVisitorType(next);
    if (!visitorTypeNeedsIdCard(next)) setIdCardNumber("");
    if (!visitorTypeNeedsCompany(next)) setCompanyName("");
  }
```

- [ ] **Step 4: Use the handler from the type chips**

In the `VISITOR_TYPE_OPTIONS.map(...)` block, change the chip `onPress` (~line 424) from:
```tsx
                  onPress={() => setVisitorType(option.value)}
```
to:
```tsx
                  onPress={() => handleVisitorTypeChange(option.value)}
```

- [ ] **Step 5: Make validation conditional**

In `validate()` (~lines 175-176), replace:
```tsx
    if (!idCardNumber.trim()) return "กรุณากรอกรหัสบัตรประชาชน";
    if (!companyName.trim()) return "กรุณากรอกชื่อบริษัท";
```
with:
```tsx
    if (idVisible && !idCardNumber.trim()) return "กรุณากรอกรหัสบัตรประชาชน";
    if (companyVisible && !companyName.trim()) return "กรุณากรอกชื่อบริษัท";
```

- [ ] **Step 6: Wrap the ID and company fields with visibility guards**

Wrap the existing `<Field label="รหัสบัตรประชาชน">…</Field>` block (~lines 381-392) so it only renders when `idVisible`:
```tsx
        {idVisible && (
          <Field label="รหัสบัตรประชาชน">
            <TextInput
              ref={idInputRef}
              style={styles.input}
              value={idCardNumber}
              onChangeText={(v) => setIdCardNumber(v.replace(/[^0-9]/g, ""))}
              placeholder="กรอกรหัสบัตรประชาชน"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              maxLength={13}
            />
          </Field>
        )}
```
Wrap the existing `<Field label="ชื่อบริษัท">…</Field>` block (~lines 394-402) so it only renders when `companyVisible`:
```tsx
        {companyVisible && (
          <Field label="ชื่อบริษัท">
            <TextInput
              style={styles.input}
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="ชื่อบริษัท"
              placeholderTextColor="#9ca3af"
            />
          </Field>
        )}
```
(The ID `TextInput` body is rewritten in Task 4; leave it as-is here.)

- [ ] **Step 7: Send empty strings for hidden fields**

In `submit()`, in the `createWalkInVisit({...})` payload, change `idCardNumber` and `companyName` (~lines 230-231) from:
```tsx
        idCardNumber: idCardNumber.trim(),
        companyName: companyName.trim(),
```
to:
```tsx
        idCardNumber: idVisible ? idCardNumber.trim() : "",
        companyName: companyVisible ? companyName.trim() : "",
```
And in the long-term QR modal payload, change `visitorOrganization` (~line 251) from:
```tsx
          visitorOrganization: companyName.trim(),
```
to:
```tsx
          visitorOrganization: companyVisible ? companyName.trim() : "",
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/screens/WalkInScreen.tsx
git commit -m "feat: hide ID/company fields per visitor type with conditional validation"
```

---

### Task 4: Mask the ID-card input in WalkInScreen

**Files:**
- Modify: `src/screens/WalkInScreen.tsx`

**Interfaces:**
- Consumes: `maskIdNumber` from `../services/api` (Task 2); `idCardNumber` state and the ID `<Field>` rendered under `idVisible` (Task 3).
- Produces: masked display behavior on the ID input (no exported interface).

- [ ] **Step 1: Import `maskIdNumber`**

In the `"../services/api"` import block, add `maskIdNumber` to the named imports.

- [ ] **Step 2: Add focus state**

Next to the existing `const [idCardNumber, setIdCardNumber] = useState("");` (~line 37), add:
```tsx
  const [idFocused, setIdFocused] = useState(false);
```

- [ ] **Step 3: Add the raw-reconstruction change handler**

After `handleVisitorTypeChange` (from Task 3), add:
```tsx
  function handleIdChange(text: string) {
    // display ยาวเท่า raw (1 หลัก = 1 ตัวอักษร) จึง diff ความยาวเพื่อถอดกลับเป็นเลขจริง
    const prevDisplay = maskIdNumber(idCardNumber, true);
    if (text.length > prevDisplay.length) {
      const added = text.slice(prevDisplay.length).replace(/[^0-9]/g, "");
      setIdCardNumber((idCardNumber + added).slice(0, 13));
    } else if (text.length < prevDisplay.length) {
      setIdCardNumber(idCardNumber.slice(0, text.length));
    }
  }
```

- [ ] **Step 4: Wire the masked value, change handler, and focus events into the ID `TextInput`**

In the ID `<Field>` block (inside the `{idVisible && (...)}` wrapper from Task 3), replace the `TextInput` with:
```tsx
            <TextInput
              ref={idInputRef}
              style={styles.input}
              value={maskIdNumber(idCardNumber, idFocused)}
              onChangeText={handleIdChange}
              onFocus={() => setIdFocused(true)}
              onBlur={() => setIdFocused(false)}
              placeholder="กรอกรหัสบัตรประชาชน"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              maxLength={13}
            />
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/WalkInScreen.tsx
git commit -m "feat: mask ID card input (17xxxxxxxxx39) on walk-in form"
```

---

### Task 5: Manual verification + backend empty-field check

**Files:** none (verification; commit only if a fix is needed).

**Interfaces:** none.

- [ ] **Step 1: Static checks**

Run: `npm test` → expected PASS (all api.test.ts cases).
Run: `npx tsc --noEmit` → expected no errors.

- [ ] **Step 2: Launch the app**

Run: `npm start` (Expo). Open the "ลงทะเบียนบุคคลภายนอก" (WalkIn) screen on a device/emulator.

- [ ] **Step 3: Verify field visibility per type**

- `visitor` / `customer` / `vendor` / `supplier`: host field shown, ID field shown, company field shown.
- `rider`: host hidden, **ID hidden**, company shown.
- `merchant`: host hidden, **ID hidden**, **company hidden**.
- Switch from a type with a typed ID/company to `merchant`/`rider` and back: confirm hidden values were cleared (re-showing the field is empty).

- [ ] **Step 4: Verify ID masking**

With `visitor` selected, tap the ID field and type `1734567890139` digit by digit. Confirm while typing: `1` → `17` → `173` → `17x4` → `17xx5` → `17xxx6` → … → `17xxxxxxxxxx9`. Tap away (blur) → confirm `17xxxxxxxxx39`. Tap back in → confirm it returns to editable masked form and backspace removes digits from the end.

- [ ] **Step 5: Verify backend accepts each type (RISK)**

Submit a registration for `visitor` (full ID), then for `rider` (empty ID, has company), then for `merchant` (empty ID + empty company).
- Expected: all three return success.
- **If `rider`/`merchant` is rejected (HTTP 400 about missing idCardNumber/companyName):** the remote backend requires those fields. Mitigation: send a placeholder (e.g. `"-"`) instead of `""` for the hidden field(s) in `submit()` — change `idVisible ? idCardNumber.trim() : ""` to `idVisible ? idCardNumber.trim() : "-"` (and likewise for company), re-test, then commit:
  ```bash
  git add src/screens/WalkInScreen.tsx
  git commit -m "fix: send placeholder for hidden ID/company fields backend requires"
  ```
  Record the decision in this plan file.

- [ ] **Step 6: Record results**

Note pass/fail for each step above (especially Step 5) in this plan or the session log.
