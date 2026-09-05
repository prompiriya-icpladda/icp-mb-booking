import type { PdpaSignaturePayload } from "../utils/pdpaConsent";

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
  entryStatus?: "pending" | "approval-requested" | "approved" | "rejected";
  entryApprovalRequestedAt?: string | null;
  entryApprovedAt?: string | null;
  entryRejectedAt?: string | null;
  entryRejectReason?: string;
  visitorName?: string;
  visitorType?: string;
  visitorTypeValue?: VisitorType;
  canCheckout?: boolean;
  checkedInAt?: string | null;
  completionRequestedAt?: string | null;
  completedAt?: string | null;
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

export function visitorAppointmentQrImageUrl(id: string): string {
  return `${API_URL}/visitor-appointments/${encodeURIComponent(id)}/qr`;
}

// สแกนซ้ำรายการเดิมที่ยัง "มาแล้ว" (ยังเช็คเอาท์ได้) → ต้องทำขั้นตอนออกต่อ
export function shouldRouteToCheckout(res: CheckinResult): boolean {
  return !!(res.success && res.alreadyCheckedIn && res.canCheckout && !res.completedAt);
}

export type ScannerPostCheckinAction = "checkout" | "result";

export function scannerPostCheckinAction(res: CheckinResult): ScannerPostCheckinAction {
  return res.qrMode === "long-term" && shouldRouteToCheckout(res) ? "checkout" : "result";
}

export function checkinResultPresentation(res: CheckinResult): {
  icon: string;
  title: string;
  color: string;
} {
  if (res.completedAt) {
    return { icon: "✅", title: "เสร็จสิ้นสำเร็จ", color: "#16a34a" };
  }
  if (res.entryStatus === "rejected" || res.entryRejectedAt) {
    return { icon: "⛔", title: "ไม่อนุญาตให้เข้า", color: "#dc2626" };
  }
  if (res.entryStatus === "approval-requested" || res.entryApprovalRequestedAt) {
    return { icon: "⏳", title: "รออนุมัติ", color: "#d97706" };
  }
  return res.alreadyCheckedIn
    ? { icon: "⚠️", title: "เช็คอินซ้ำ", color: "#d97706" }
    : { icon: "✅", title: "เช็คอินสำเร็จ", color: "#16a34a" };
}

export type ScanResultPrimaryAction = {
  label: string;
  action: "scan" | "back" | "done";
};

export function scanResultPrimaryAction(
  res: CheckinResult | null | undefined,
  hasBackToNotification: boolean,
): ScanResultPrimaryAction {
  if (res?.success && (res.completedAt || res.qrMode === "long-term")) {
    return { label: "เรียบร้อย", action: "done" };
  }
  if (hasBackToNotification) {
    return { label: "กลับไปหน้าแจ้งเตือน", action: "back" };
  }
  return { label: "สแกนต่อ", action: "scan" };
}

// สแกนออก — ทำเครื่องหมายว่าแม่ค้า/รายการเดิม "ไปแล้ว" (รองรับเฉพาะกลุ่มไม่มี host ฝั่ง backend)
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
  completionRequestedAt?: string | null;
  visitorCount: number;
  createdByName: string;
  createdAt?: string;
  source?: "advance" | "walk-in";
  qrMode?: VisitorQrMode;
  completedAt?: string | null;
  entryApprovalRequestedAt?: string | null;
  entryApprovedAt?: string | null;
  entryRejectedAt?: string | null;
  entryRejectReason?: string;
  visitorType?: VisitorType;
}

export type LongTermStatus = "registered" | "approval-requested" | "rejected" | "arrived" | "completion-requested" | "checked-out";

// อนุมานสถานะ long-term จาก timestamp ที่ server คืนมา (completedAt ชนะ checkedInAt)
export function longTermStatus(
  a: Pick<TodayAppointment, "checkedInAt" | "entryApprovalRequestedAt" | "entryApprovedAt" | "entryRejectedAt" | "completionRequestedAt" | "completedAt">,
): LongTermStatus {
  if (a.completedAt) return "checked-out";
  if (a.completionRequestedAt) return "completion-requested";
  if (a.entryRejectedAt) return "rejected";
  if (!a.checkedInAt && a.entryApprovalRequestedAt) return "approval-requested";
  if (a.checkedInAt) return "arrived";
  return "registered";
}

export function longTermStatusLabel(status: LongTermStatus): string {
  switch (status) {
    case "registered":
      return "ลงทะเบียน";
    case "approval-requested":
      return "รออนุมัติ";
    case "rejected":
      return "ไม่อนุมัติ";
    case "arrived":
      return "มาแล้ว";
    case "completion-requested":
      return "รอสแกนเสร็จสิ้น";
    case "checked-out":
      return "เช็คเอาท์";
  }
}

export type NormalStatus = "pending" | "approval-requested" | "rejected" | "checked-in" | "completion-requested" | "completed";

// อนุมานสถานะนัดหมายปกติ (single-use) — completedAt มาจาก host กด "เสร็จสิ้น" ใน LINE
// (completedAt ชนะ checkedInAt เผื่อกรณีไม่ได้สแกนเช็คอินแต่ host ปิดงานแล้ว)
export function normalStatus(
  a: Pick<TodayAppointment, "checkedInAt" | "entryApprovalRequestedAt" | "entryApprovedAt" | "entryRejectedAt" | "completionRequestedAt" | "completedAt">,
): NormalStatus {
  if (a.completedAt) return "completed";
  if (a.completionRequestedAt) return "completion-requested";
  if (a.entryRejectedAt) return "rejected";
  if (!a.checkedInAt && a.entryApprovalRequestedAt) return "approval-requested";
  if (a.checkedInAt) return "checked-in";
  return "pending";
}

export function normalStatusLabel(status: NormalStatus): string {
  switch (status) {
    case "pending":
      return "รอเช็คอิน";
    case "approval-requested":
      return "รออนุมัติ";
    case "rejected":
      return "ไม่อนุมัติ";
    case "checked-in":
      return "เช็คอินแล้ว";
    case "completion-requested":
      return "รอสแกนเสร็จสิ้น";
    case "completed":
      return "เสร็จสิ้น";
  }
}

export function canShowWalkInQrForPhoto(
  a: Pick<TodayAppointment, "source" | "qrMode" | "checkedInAt" | "entryApprovalRequestedAt" | "entryApprovedAt" | "completedAt">,
): boolean {
  // QR สำหรับ walk-in ที่อนุมัติแล้วต้องแสดงผ่าน modal 30 วินาทีเท่านั้น ไม่ฝังไว้บน card
  void a;
  return false;
}

// เลือกเช็คเอาท์ในแอป: คง rider/แม่ค้าที่มาแล้วแบบเดิม + เพิ่ม QR ระยะยาวที่ "รอสแกนเสร็จสิ้น"
export function isLongTermCheckoutable(
  a: Pick<TodayAppointment, "checkedInAt" | "completionRequestedAt" | "completedAt" | "visitorType">,
): boolean {
  const status = longTermStatus(a);
  if (status === "completion-requested") return true;
  return (a.visitorType === "rider" || a.visitorType === "merchant") && status === "arrived";
}

// แท็บ "ระยะยาว" โชว์คนที่ลงทะเบียนแล้วยังใช้ QR ได้ รวมถึงยังไม่เช็คอิน
// ซ่อนเฉพาะ "เช็คเอาท์" (ไปแล้ว)
export function isLongTermOnSite(
  a: Pick<TodayAppointment, "checkedInAt" | "completionRequestedAt" | "completedAt">,
): boolean {
  const status = longTermStatus(a);
  return status !== "checked-out";
}

export type LongTermCardAction = "detail" | "scan" | "select";

// ตัดสินว่าแตะการ์ด long-term แล้วทำอะไร (pure → unit test ได้)
//  - select mode: เลือก
//  - rider/แม่ค้าที่มาแล้ว หรือ QR ระยะยาวที่รอสแกนเสร็จสิ้น: เปิดหน้ารายละเอียด
//  - อื่นๆ: ไปสแกน (เหมือนเดิม)
export function longTermCardAction(
  a: Pick<TodayAppointment, "checkedInAt" | "completionRequestedAt" | "completedAt" | "visitorType">,
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
  empType?: string;
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
  departmentName?: string;
  department_name?: string;
  dept?: string;
  deptName?: string;
  dept_name?: string;
  emp_type?: string;
};

function normalizeHrSearchText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function hrSearchTerms(keyword: string) {
  const query = normalizeHrSearchText(keyword);
  const withoutDepartmentPrefix = query.replace(/^(แผนก|ฝ่าย|dept\.?|department)\s*/i, "").trim();
  return Array.from(new Set([query, withoutDepartmentPrefix].filter(Boolean)));
}

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
    department:
      item.department ??
      item.departmentName ??
      item.department_name ??
      item.dept ??
      item.deptName ??
      item.dept_name,
    position: item.position,
    userId: item.userId ?? item.user_id ?? item.userid,
    employeeId: item.employeeId ?? item.employee_id,
    code: item.code,
    empType: item.emp_type,
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

function isMonthlyHrEmployee(item: HrEmployee): boolean {
  return item.empType?.trim() === "รายเดือน";
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
    .filter((item): item is HrEmployee => !!item)
    .filter(isMonthlyHrEmployee);

  if (!keyword.trim()) return normalized;

  const terms = hrSearchTerms(keyword);
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
    return terms.some((term) => haystack.includes(term));
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
// rider ถูกถอดจากตัวเลือกใหม่แล้ว แต่ยังคง type ไว้เพื่อรองรับรายการเดิมที่ API อาจส่งกลับมา
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
  { value: "merchant", label: "แม่ค้า" },
];

// แม่ค้า/รายการ rider เดิม ไม่ได้มาพบใคร จึงไม่ต้องระบุผู้ที่ต้องการพบ (host)
export function visitorTypeNeedsHost(visitorType: VisitorType): boolean {
  return visitorType !== "rider" && visitorType !== "merchant";
}


// ชื่อบริษัท: ไม่ต้องใช้สำหรับ merchant (แม่ค้า)
export function visitorTypeNeedsCompany(visitorType: VisitorType): boolean {
  return visitorType !== "merchant";
}


export interface CreateWalkInVisitPayload {
  visitorName: string;
  targetDepartment?: string;
  hostEmployeeCode: string;
  hostName: string;
  hostNickname?: string;
  visittingUserId?: string;
  visittingUserName?: string;
  visittingUserNickname?: string;
  visitingUserId?: string;
  visitingUserName?: string;
  visitingUserNickname?: string;
  companyName: string;
  purpose?: string;
  visitorType?: VisitorType;
  visitorCount?: number;
  hasVehicle: boolean;
  vehicleCount?: number;
  licensePlate?: string;
  licensePlates?: string[];
  includeDepartmentRelatedEmployees?: boolean;
  pdpaConsentAccepted?: boolean;
  pdpaConsentedAt?: string;
  pdpaConsentVersion?: string;
  pdpaSignature?: PdpaSignaturePayload;
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

function normalizeRecentCompanyLimit(limit: number) {
  if (!Number.isFinite(limit)) return 30;
  return Math.max(1, Math.min(50, Math.floor(limit)));
}

export async function fetchRecentCompanyNames(
  query = "",
  limit = 30,
): Promise<string[]> {
  const params = new URLSearchParams();
  const normalizedQuery = query.trim();
  if (normalizedQuery) params.set("q", normalizedQuery);
  params.set("limit", String(normalizeRecentCompanyLimit(limit)));

  const res = await fetch(`${API_URL}/walk-in-visitors/company-names?${params.toString()}`);
  const data = await parseJsonResponse<{ companies?: unknown }>(res);
  if (!Array.isArray(data.companies)) return [];
  return data.companies
    .filter((company): company is string => typeof company === "string" && company.trim().length > 0)
    .map((company) => company.trim());
}

export async function createWalkInVisit(
  payload: CreateWalkInVisitPayload,
): Promise<CreateWalkInVisitResult> {
  const payloadWithoutId = { ...payload } as CreateWalkInVisitPayload & {
    idCardNumber?: string;
  };
  delete payloadWithoutId.idCardNumber;

  const requestBody = {
    ...payloadWithoutId,
    // แอปมือถือสร้างเฉพาะ QR ครั้งเดียว — บังคับ single-use เพื่อกัน caller เก่าหลุด long-term
    purpose: payload.purpose?.trim() || "",
    visitorType: payload.visitorType ?? "visitor",
    qrMode: "single-use",
    expiryDate: "",
    includeDepartmentRelatedEmployees:
      payload.includeDepartmentRelatedEmployees !== false,
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
    targetDepartment: requestBody.targetDepartment,
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
