// ปรับ API_URL ให้ตรงกับ IP และ port ของ server จริง (ไม่ใช่ localhost เมื่อรันบนมือถือ)
export const API_URL = "https://app-plant.icpladda.com/ICPBooking/api";

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

export async function searchHrEmployees(
  keyword: string,
): Promise<HrEmployee[]> {
  const query = keyword.trim();
  if (query.length < 2) return [];

  const res = await fetch(
    `${API_URL}/hr/employees?keyword=${encodeURIComponent(query)}`,
  );
  const data = await parseJsonResponse<
    RawHrEmployee[] | { data?: RawHrEmployee[]; employees?: RawHrEmployee[] }
  >(res);
  const items = Array.isArray(data) ? data : data.data ?? data.employees ?? [];
  return items
    .map((item) => normalizeHrEmployee(item))
    .filter((item): item is HrEmployee => !!item);
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
