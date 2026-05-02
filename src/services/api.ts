// ปรับ API_URL ให้ตรงกับ IP และ port ของ server จริง (ไม่ใช่ localhost เมื่อรันบนมือถือ)
export const API_URL = "https://hr-wheel-deal-server.onrender.com/api";

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
  password: string
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
