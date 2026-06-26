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

export interface CheckinResult {
  success?: boolean;
  alreadyCheckedIn?: boolean;
  visitorName?: string;
  createdByName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  purpose?: string;
  hasVehicle?: boolean;
  licensePlate?: string;
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

export interface TodayAppointment {
  _id: string;
  visitorName: string;
  visitorOrganization: string;
  appointmentDate: string;
  appointmentTime: string;
  purpose: string;
  hasVehicle: boolean;
  licensePlate: string;
  checkedInAt: string | null;
  visitorCount: number;
  createdByName: string;
}

export async function getTodayAppointments(): Promise<TodayAppointment[]> {
  const res = await fetch(`${API_URL}/visitor-appointments/today`);
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : typeof data?.message === "string"
          ? data.message
          : "request failed";
    throw new Error(message);
  }
  return data as T;
}

export interface HrEmployee {
  employeeCode: string;
  name: string;
  nickname?: string;
  department?: string;
  position?: string;
}

type RawHrEmployee = Partial<HrEmployee> & {
  code?: string;
  empCode?: string;
  employeeId?: string;
  employeeName?: string;
  fullName?: string;
  nickName?: string;
};

function normalizeHrEmployee(item: RawHrEmployee): HrEmployee | null {
  const employeeCode =
    item.employeeCode ?? item.empCode ?? item.employeeId ?? item.code;
  const name = item.name ?? item.employeeName ?? item.fullName;
  if (!employeeCode || !name) return null;

  return {
    employeeCode,
    name,
    nickname: item.nickname ?? item.nickName,
    department: item.department,
    position: item.position,
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
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ keyword, q: keyword, search: keyword, name: keyword }),
      },
    },
  ];
}

function normalizeHrResponse(
  data: unknown,
  keyword: string,
): HrEmployee[] {
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

export interface CreateWalkInVisitPayload {
  visitorName: string;
  hostEmployeeCode: string;
  hostName: string;
  hostNickname?: string;
  idCardNumber: string;
  companyName: string;
  hasVehicle: boolean;
  licensePlate?: string;
  source: "mobile-walk-in";
}

export interface CreateWalkInVisitResult {
  success: boolean;
  id?: string;
  error?: string;
}

export async function createWalkInVisit(
  payload: CreateWalkInVisitPayload,
): Promise<CreateWalkInVisitResult> {
  const res = await fetch(`${API_URL}/walk-in-visitors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<CreateWalkInVisitResult>(res);
}

export interface LicensePlateOcrResult {
  licensePlate?: string;
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
