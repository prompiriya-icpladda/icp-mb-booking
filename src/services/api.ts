// ปรับ API_URL ให้ตรงกับ IP และ port ของ server จริง (ไม่ใช่ localhost เมื่อรันบนมือถือ)
export const API_URL = "https://app-plant.icpladda.com/ICPBooking/api";
export const HR_API_URL =
  process.env.EXPO_PUBLIC_HR_API_URL ||
  "https://n8n-plant.icpladda.com/webhook/api/employee";

export interface LoginResult {
  token?: string;
  user?: { name: string; role: string; employeeCode: string };
  error?: string;
}
console.log("HR_API_URL =", HR_API_URL);

export interface MobilePushRegistration {
  token: string;
  deviceId: string;
  platform: "android" | "ios" | "unknown";
}

export async function registerMobilePushToken(
  registration: MobilePushRegistration,
): Promise<void> {
  const res = await fetch(`${API_URL}/mobile-push/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registration),
  });
  if (!res.ok) throw new Error("register mobile push failed");
}

export interface CheckinResult {
  success?: boolean;
  alreadyCheckedIn?: boolean;
  visitorName?: string;
  visitorType?: string;
  visitorTypeValue?: VisitorType;
  canCheckout?: boolean;
  qrMode?: VisitorQrMode;
  createdByName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  purpose?: string;
  hasVehicle?: boolean;
  licensePlate?: string;
  error?: string;
}

export interface CheckoutResult {
  success?: boolean;
  departed?: boolean;
  visitorName?: string;
  visitorType?: string;
  error?: string;
}

export async function loginEmployee(
  employeeCode: string,
  password: string,
): Promise<LoginResult> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employeeCode, password }),
  });
  return res.json();
}

export async function checkinAppointment(id: string): Promise<CheckinResult> {
  const res = await fetch(`${API_URL}/visitor-appointments/${id}/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

// สแกนซ้ำ rider/แม่ค้า ที่ยัง "มาแล้ว" (ยังเช็คเอาท์ได้) → ให้เด้งไปหน้าเช็คเอาท์
export function shouldRouteToCheckout(res: CheckinResult): boolean {
  return !!(res.success && res.alreadyCheckedIn && res.canCheckout);
}

// URL ของรูป QR (PNG) ที่ server สร้างให้ — ใช้แสดงในแอปหลังบันทึกนัดหมายระยะยาว
export function visitorQrUrl(id: string): string {
  return `${API_URL}/visitor-appointments/${id}/qr`;
}

// สแกนออก — ทำเครื่องหมายว่า rider/แม่ค้า "ไปแล้ว" (รองรับเฉพาะ rider/merchant ฝั่ง backend)
export async function checkoutAppointment(id: string): Promise<CheckoutResult> {
  const res = await fetch(`${API_URL}/visitor-appointments/${id}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return parseJsonResponse<CheckoutResult>(res);
}

export interface TodayAppointment {
  _id: string;
  visitorName: string;
  visitorOrganization: string;
  appointmentDate: string;
  appointmentTime: string;
  expiryDate?: string;
  purpose: string;
  hasVehicle: boolean;
  licensePlate: string;
  checkedInAt: string | null;
  visitorCount: number;
  createdByName: string;
  qrMode?: VisitorQrMode;
  completedAt?: string | null;
  visitorType?: VisitorType;
}

export type LongTermStatus = "registered" | "arrived" | "checked-out";

// อนุมานสถานะ long-term จาก timestamp ที่ server คืนมา (completedAt ชนะ checkedInAt)
export function longTermStatus(
  a: Pick<TodayAppointment, "checkedInAt" | "completedAt">,
): LongTermStatus {
  if (a.completedAt) return "checked-out";
  if (a.checkedInAt) return "arrived";
  return "registered";
}

export type NormalStatus = "pending" | "checked-in" | "completed";

// อนุมานสถานะนัดหมายปกติ (single-use) — completedAt มาจาก host กด "เสร็จสิ้น" ใน LINE
// (completedAt ชนะ checkedInAt เผื่อกรณีไม่ได้สแกนเช็คอินแต่ host ปิดงานแล้ว)
export function normalStatus(
  a: Pick<TodayAppointment, "checkedInAt" | "completedAt">,
): NormalStatus {
  if (a.completedAt) return "completed";
  if (a.checkedInAt) return "checked-in";
  return "pending";
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

// แท็บ "ระยะยาว" โชว์เฉพาะคนที่อยู่ในพื้นที่ตอนนี้ = "มาแล้ว" (เช็คอินแล้ว ยังไม่เช็คเอาท์)
// ซ่อน "ลงทะเบียน" (ยังไม่มา) และ "เช็คเอาท์" (ไปแล้ว)
export function isLongTermOnSite(
  a: Pick<TodayAppointment, "checkedInAt" | "completedAt">,
): boolean {
  return longTermStatus(a) === "arrived";
}

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

// แปลงเวลานัด "HH:mm" เป็นนาทีนับจากเที่ยงคืน — กันรูปแบบไม่ zero-pad ("9:30") และจุด ("9.30")
// คืน -1 เมื่ออ่านไม่ออก/ไม่มีค่า เพื่อให้ตกไปท้ายลิสต์แทนที่จะไปแทรกด้านบน
export function appointmentTimeMinutes(time?: string | null): number {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec((time ?? "").trim());
  if (!match) return -1;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return -1;
  return hour * 60 + minute;
}

// เรียงนัดหมาย "ล่าสุดขึ้นก่อน" — เวลานัดมากไปน้อย (10:01 มาก่อน 10:00)
// เวลาซ้ำกันตัดสินด้วย _id จากมากไปน้อย (ObjectId เรียงตามเวลาที่สร้าง = ใบใหม่ขึ้นก่อน)
// เรียงฝั่งแอปเองแทนที่จะพึ่ง sort ของ server (server sort เป็น string จึงพลาดกรณี "9:30" > "10:00")
export function sortAppointmentsByLatest<
  T extends Pick<TodayAppointment, "_id" | "appointmentTime">,
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const diff =
      appointmentTimeMinutes(b.appointmentTime) -
      appointmentTimeMinutes(a.appointmentTime);
    if (diff !== 0) return diff;
    return b._id.localeCompare(a._id);
  });
}

export async function getTodayAppointments(): Promise<TodayAppointment[]> {
  const res = await fetch(`${API_URL}/visitor-appointments/today`);
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

// นัดหมายระยะยาวที่ยังไม่หมดอายุทั้งหมด (ไม่ผูกกับวันนี้) — ใช้กับแท็บ "ระยะยาว"
export async function getActiveLongTermAppointments(): Promise<TodayAppointment[]> {
  const res = await fetch(`${API_URL}/visitor-appointments/long-term`);
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const rawText = await res.text().catch(() => "");
  let data: any = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText };
    }
  }

  if (!res.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : typeof data?.message === "string"
          ? data.message
          : typeof data?.raw === "string" && data.raw.trim()
            ? data.raw.trim()
            : "request failed";
    throw new Error(`HTTP ${res.status}: ${message}`);
  }
  return data as T;
}

export interface HrEmployee {
  employeeCode: string;
  name: string;
  nickname?: string;
  department?: string;
  position?: string;
  userId?: string;
  employeeId?: string;
  code?: string;
}

type RawHrEmployee = Partial<HrEmployee> & {
  code?: string;
  empCode?: string;
  userId?: string;
  user_id?: string;
  userid?: string;
  employeeId?: string;
  employee_id?: string;
  employeeCode?: string;
  employeeName?: string;
  employee_name?: string;
  fullName?: string;
  full_name?: string;
  nickName?: string;
  nick_name?: string;
};

function normalizeHrEmployee(item: RawHrEmployee): HrEmployee | null {
  const employeeCode =
    item.employeeCode ??
    item.empCode ??
    item.employeeId ??
    item.employee_id ??
    item.code;
  const name =
    item.name ??
    item.employeeName ??
    item.employee_name ??
    item.fullName ??
    item.full_name;
  if (!employeeCode || !name) return null;

  return {
    employeeCode,
    name,
    nickname: item.nickname ?? item.nickName ?? item.nick_name,
    department: item.department,
    position: item.position,
    userId: item.userId ?? item.user_id ?? item.userid,
    employeeId: item.employeeId ?? item.employee_id,
    code: item.code,
  };
}

function buildHrSearchRequests(keyword: string): Array<{
  url: string;
  init?: RequestInit;
}> {
  const base = HR_API_URL.replace(/\/$/, "");
  const encoded = encodeURIComponent(keyword.trim());
  return [
    { url: base },
    { url: `${base}?keyword=${encoded}` },
    { url: `${base}?q=${encoded}` },
    { url: `${base}?search=${encoded}` },
    { url: `${base}?name=${encoded}` },
    {
      url: base,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          keyword,
          q: keyword,
          search: keyword,
          name: keyword,
        }),
      },
    },
  ];
}

function normalizeHrResponse(data: unknown, keyword: string): HrEmployee[] {
  const items = Array.isArray(data)
    ? data
    : Array.isArray((data as { data?: unknown })?.data)
      ? (data as { data: unknown[] }).data
      : Array.isArray((data as { employees?: unknown })?.employees)
        ? (data as { employees: unknown[] }).employees
        : Array.isArray((data as { result?: unknown })?.result)
          ? (data as { result: unknown[] }).result
          : [];

  const normalized = items
    .map((item) => normalizeHrEmployee(item as RawHrEmployee))
    .filter((item): item is HrEmployee => !!item);

  if (!keyword.trim()) return normalized;

  const q = keyword.trim().toLowerCase();
  return normalized.filter((item) => {
    const haystack = [
      item.employeeCode,
      item.name,
      item.nickname ?? "",
      item.department ?? "",
      item.position ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export async function searchHrEmployees(
  keyword: string,
): Promise<HrEmployee[]> {
  const query = keyword.trim();
  if (query.length < 2) return [];

  const requests = buildHrSearchRequests(query);
  let lastError: unknown = null;

  for (const request of requests) {
    try {
      const res = await fetch(request.url, {
        headers: { Accept: "application/json" },
        ...request.init,
      });
      if (!res.ok) {
        lastError = new Error(`HR API returned ${res.status}`);
        continue;
      }

      const data = await res.json().catch(() => null);
      const normalized = normalizeHrResponse(data, query);
      if (normalized.length > 0) {
        return normalized;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("ไม่สามารถดึงข้อมูลจาก HR API ได้");
}

// ประเภทผู้มาติดต่อ — ใช้ value/label ชุดเดียวกับฟอร์มเว็บ ICPBooking
// (เว็บตัด rider/merchant ออกแล้วให้มาเลือกใน MB ตัวนี้ จึงรวมครบทั้ง 6)
export type VisitorType =
  | "visitor"
  | "customer"
  | "vendor"
  | "supplier"
  | "rider"
  | "merchant";

export type VisitorQrMode = "single-use" | "long-term";

export const VISITOR_TYPE_OPTIONS: { value: VisitorType; label: string }[] = [
  { value: "visitor", label: "visitor ผู้เยี่ยมชม" },
  { value: "customer", label: "customer ลูกค้า" },
  { value: "vendor", label: "vendor ผู้รับเหมา/ช่าง" },
  { value: "supplier", label: "supplier คนส่งของ" },
  { value: "rider", label: "rider" },
  { value: "merchant", label: "แม่ค้า" },
];

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

// rider / แม่ค้า มาขายของ ไม่ได้มาพบใคร จึงไม่ต้องระบุผู้ที่ต้องการพบ (host)
export function visitorTypeNeedsHost(visitorType: VisitorType): boolean {
  return visitorType !== "rider" && visitorType !== "merchant";
}

// บัตรประชาชน: ไม่ต้องใช้สำหรับ rider / merchant (แม่ค้า)
export function visitorTypeNeedsIdCard(visitorType: VisitorType): boolean {
  return visitorType !== "rider" && visitorType !== "merchant";
}

// ชื่อบริษัท: ไม่ต้องใช้สำหรับ merchant (แม่ค้า)
export function visitorTypeNeedsCompany(visitorType: VisitorType): boolean {
  return visitorType !== "merchant";
}

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

export interface CreateWalkInVisitPayload {
  visitorName: string;
  hostEmployeeCode: string;
  hostName: string;
  hostNickname?: string;
  visittingUserId?: string;
  visittingUserName?: string;
  visittingUserNickname?: string;
  visitingUserId?: string;
  visitingUserName?: string;
  visitingUserNickname?: string;
  idCardNumber: string;
  companyName: string;
  purpose?: string;
  visitorType?: VisitorType;
  visitorCount?: number;
  qrMode?: VisitorQrMode;
  expiryDate?: string;
  hasVehicle: boolean;
  vehicleCount?: number;
  licensePlate?: string;
  licensePlates?: string[];
  source: "mobile-walk-in";
}

export interface CreateWalkInVisitResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface LicensePlateOcrResult {
  licensePlate?: string;
}

export async function createWalkInVisit(
  payload: CreateWalkInVisitPayload,
): Promise<CreateWalkInVisitResult> {
  const requestBody = {
    ...payload,
    // ให้ค่า default ตรงกับฟอร์มเว็บ เผื่อ caller ไม่ได้ส่งมา
    purpose: payload.purpose?.trim() || "",
    visitorType: payload.visitorType ?? "visitor",
    qrMode: payload.qrMode ?? "single-use",
    expiryDate: payload.qrMode === "long-term" ? payload.expiryDate ?? "" : "",
    visitorCount:
      payload.visitorCount && payload.visitorCount > 0 ? payload.visitorCount : 1,
    // Backend validation currently expects these legacy field names.
    visittingUserId: payload.visittingUserId ?? payload.hostEmployeeCode,
    visittingUserName: payload.visittingUserName ?? payload.hostName,
    visittingUserNickname:
      payload.visittingUserNickname ?? payload.hostNickname,
    visitingUserId:
      payload.visitingUserId ??
      payload.visittingUserId ??
      payload.hostEmployeeCode,
    visitingUserName:
      payload.visitingUserName ??
      payload.visittingUserName ??
      payload.hostName,
    visitingUserNickname:
      payload.visitingUserNickname ??
      payload.visittingUserNickname ??
      payload.hostNickname,
  };

  console.log("createWalkInVisit payload", {
    visitorName: requestBody.visitorName,
    hostEmployeeCode: requestBody.hostEmployeeCode,
    hostName: requestBody.hostName,
    visittingUserId: requestBody.visittingUserId,
    visitingUserId: requestBody.visitingUserId,
    companyName: requestBody.companyName,
    visitorType: requestBody.visitorType,
    visitorCount: requestBody.visitorCount,
    qrMode: requestBody.qrMode,
    hasVehicle: requestBody.hasVehicle,
    licensePlate: requestBody.licensePlate,
    idCardNumberMasked: requestBody.idCardNumber
      ? `***${requestBody.idCardNumber.slice(-4)}`
      : "",
  });

  const res = await fetch(`${API_URL}/walk-in-visitors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const data = await parseJsonResponse<{ _id?: string; id?: string; error?: string }>(res);
  return { success: true, id: data._id ?? data.id, error: data.error };
}

export async function ocrLicensePlate(
  imageUri: string,
): Promise<LicensePlateOcrResult> {
  const form = new FormData();
  form.append("image", {
    uri: imageUri,
    name: "license-plate.jpg",
    type: "image/jpeg",
  } as any);

  const res = await fetch(`${API_URL}/walk-in-visitors/license-plate-ocr`, {
    method: "POST",
    body: form,
  });
  return parseJsonResponse<LicensePlateOcrResult>(res);
}
