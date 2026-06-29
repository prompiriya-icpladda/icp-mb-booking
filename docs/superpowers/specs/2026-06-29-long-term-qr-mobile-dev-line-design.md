# Long-term walk-in QR: show in app + send to dev via LINE

- **Date:** 2026-06-29
- **Status:** Approved design — ready for implementation plan
- **Repos touched:** `ICPBooking` (server) + `icp-mb-booking` (mobile)

## สรุป (Thai)

ตอนนี้ฟอร์ม walk-in บนมือถือ (`icp-mb-booking`) พอบันทึก "นัดหมายระยะยาว" (long-term)
จะขึ้นแค่ข้อความ "บันทึกเรียบร้อย" — **ไม่มีการออก/แสดง QR และไม่ส่งให้ใคร**

ต้องการ: เมื่อสร้าง **long-term จากมือถือ** ให้
1. **แสดง QR ในแอป** (โชว์บนจอพอ ไม่ต้องมีปุ่มเซฟ/แชร์)
2. **ส่ง QR เข้า LINE ของผู้ใช้ role `dev`** (ตอนนี้เอาแค่ dev) เพื่อให้คนที่มีสิทธิ์หลังบ้าน
   เก็บ QR ระยะยาวไว้ใช้กับการนัดหมายในอนาคต

ฝั่งเว็บ/advance **ไม่แตะ** (แสดง QR และส่ง LINE ให้ creator อยู่แล้ว และไม่เพิ่ม dev-send ที่นั่น)

## Problem / Gap

| Surface | long-term today | desired |
|---|---|---|
| Web (`ICPBooking` `VisitorAppointmentForm`) | shows QR ✓, sends QR to creator's LINE ✓ | **no change** |
| Mobile walk-in (`icp-mb-booking` `WalkInScreen`) | shows only "บันทึกข้อมูลเรียบร้อย", no QR, no LINE | **show QR in app + send QR to dev via LINE** |
| Server | advance route sends QR to creator; walk-in route sends only an "arrived" flex to host (no QR) | walk-in long-term also sends QR flex to dev users |

The genuine gap is the **mobile walk-in long-term** path (server `walk-in-visitors.js` + mobile `WalkInScreen`).

## Decisions (confirmed with user)

1. **Recipient of the dev LINE message:** users with `role: "dev"` only (for now; expandable later).
2. **Trigger scope:** only when a long-term appointment is **created from mobile** (the
   `walk-in-visitors` route). The advance/web route (`visitor-appointments` POST) is **not** changed
   to add a dev-send.
3. **Mobile QR view:** **display on screen only** — no share/save button, no new Expo dependency.
4. **single-use on mobile:** unchanged (visitor is already present + checked in; no future-use QR).
5. **Spec location:** this repo (`icp-mb-booking`).

## Existing building blocks reused (no reinvention)

- `GET /api/visitor-appointments/:id/qr` — public endpoint returning a PNG QR (encodes the check-in
  URL). Mobile shows this directly with `<Image>`.
- `buildVisitorQrFlex(...)` in `server/routes/visitor-appointments.js` — already renders a QR Flex
  bubble and already handles long-term (replaces date/time rows with `วันหมดอายุ`).
- `pushMessage(lineId, payload)` in `server/utils/line.js`.
- `User` model has `role` (enum incl. `dev`), `lineId`, `lineNotifyEnabled`.
- `walk-in-visitors.js` POST already creates the `VisitorAppointment` and returns the full record
  (status 201, includes `_id`).

## Architecture / cross-repo note

`ICPBooking` (server) and `icp-mb-booking` (mobile) are **separate git repos**, deployed on
different schedules. The mobile QR view depends on the record `_id` already returned by the server
today, and on the existing `/qr` endpoint — so **no hard ordering** is required, but **deploy the
server first** so the dev-LINE send is live before mobile starts producing long-term walk-ins that
expect it. Mobile must **degrade gracefully** if `id` is absent.

## Detailed changes

### A) Server — `ICPBooking/server`

**A1. New unit `server/utils/visitor-qr-notify.js`**

Export two functions; isolates "build + deliver the visitor QR flex" so both routes share one copy.

- `buildVisitorQrFlex(args)` — **moved verbatim** from `visitor-appointments.js` (behavior identical).
- `sendLongTermQrToDevs(record)`:
  - Guard: return immediately unless `record.qrMode === "long-term"`.
  - `const devs = await User.find({ role: "dev", lineId: { $ne: "" }, lineNotifyEnabled: { $ne: false } }).select("lineId").lean();`
  - If none → `console.warn` + return (no-op).
  - Build the QR image URL the same way `sendQrToCreator` does (api.qrserver.com with the check-in
    URL) and the bubble via `buildVisitorQrFlex(...)` from the record.
  - `pushMessage` to each dev's `lineId`. Wrap the whole thing so a failure never throws to the caller
    (fire-and-forget, `try/catch` + `console.error`), matching the existing `sendQrToCreator` pattern.
  - `altText`: e.g. `QR ระยะยาว (walk-in): ${record.visitorName}` (Thai preserved).

**A2. `server/routes/visitor-appointments.js`** — refactor only

- Remove the local `buildVisitorQrFlex` definition; `require` it from `utils/visitor-qr-notify.js`.
- `sendQrToCreator` keeps working unchanged. **No dev-send added here.** Runtime behavior identical.

**A3. `server/routes/walk-in-visitors.js`** — add dev-send

- After the record is created (and after the existing host "arrived" `pushMessage`), add:
  `if (record.qrMode === "long-term") sendLongTermQrToDevs(record).catch(err => console.error(...))`.
- The existing host "arrived" flex stays as-is.

### B) Mobile — `icp-mb-booking`

**B1. `src/services/api.ts`**

- Extend `CreateWalkInVisitResult` to surface `id` (read from the server record's `_id`, fall back to
  `id`). Keep `success`/`error` optional for back-compat.
- In `createWalkInVisit`, after `parseJsonResponse`, normalize `id = data._id ?? data.id`.
- Add helper `export const visitorQrUrl = (id: string) => \`${API_URL}/visitor-appointments/${id}/qr\`;`

**B2. `src/screens/WalkInScreen.tsx`**

- On successful submit, capture the returned `id`.
- If `qrMode === "long-term"` **and** an `id` came back → open a **QR result Modal** (same Modal
  pattern as the existing camera modal) containing:
  - `<Image source={{ uri: visitorQrUrl(id) }} />` (square, e.g. 220×220)
  - visitor name, organization, `วันหมดอายุ` (expiry), short note
    `ให้ผู้มาติดต่อแสดง QR นี้ที่จุดรักษาความปลอดภัยในครั้งถัดไป`
  - a single **"เสร็จสิ้น"** button that closes the modal and resets the form.
- Otherwise (single-use, or no `id` returned) → keep the current `"บันทึกข้อมูลเรียบร้อย"` message
  and form reset (graceful degradation).

### C) Web client — `ICPBooking/src`

**No change.** It already renders the QR for long-term and the advance route already sends it to the
creator's LINE.

## Data flow (mobile long-term walk-in)

1. WalkInScreen submits `qrMode: "long-term"` to `POST /api/walk-in-visitors`.
2. Server creates the `VisitorAppointment` (`source: "walk-in"`, `checkedInAt: now`, `expiryDate`).
3. Server fire-and-forget: existing host "arrived" flex **+** `sendLongTermQrToDevs(record)` → QR Flex
   pushed to every `dev` user with a `lineId`.
4. Server responds `201` with the full record (`_id`).
5. Mobile reads `_id`, opens the QR result modal showing `/visitor-appointments/:id/qr`.
6. Later, the visitor scans that long-term QR at security → existing check-in flow re-checks-in
   (long-term QR is reusable; it resets `completedAt`).

## Error handling / edge cases

- `sendLongTermQrToDevs` never blocks the create response (fire-and-forget + `try/catch`).
- No dev has a `lineId` → warn + no-op; the mobile in-app QR still shows.
- `LINE_MESSAGING_TOKEN` unset → `pushMessage` already no-ops silently.
- Server returns no `id` (old build) → mobile falls back to the plain success message.
- rider/merchant long-term (no host) → host "arrived" flex is skipped (already), dev-send still fires.

## Testing

- **Server (Vitest, matching existing `server/utils/*.test.js`):** unit-test `sendLongTermQrToDevs`
  with `User.find` and `pushMessage` mocked:
  - skips entirely when `qrMode !== "long-term"`;
  - pushes once per dev that has a `lineId`;
  - skips devs without a `lineId` / with `lineNotifyEnabled === false`;
  - no-throw when `pushMessage` rejects.
- Confirm `visitor-appointments.js` still builds the same flex after the `buildVisitorQrFlex` extraction
  (no behavior change).
- **Mobile:** verify `createWalkInVisit` returns `id`; manually verify on device that a long-term
  walk-in shows the QR modal and a single-use one does not.

## Deployment order

Deploy `ICPBooking` server first (dev-LINE send), then `icp-mb-booking`. Mobile degrades gracefully if
deployed first.

## Out of scope / future

- Expanding LINE recipients beyond `dev` (e.g. host, admin, a LINE group) — deliberately deferred.
- Adding the dev-send to the web/advance route.
- Share/save of the QR image from the mobile app.
