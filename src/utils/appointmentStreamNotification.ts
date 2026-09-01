import type { TodayAppointment } from "../services/api";
import { formatVisitorDateRange } from "./visitorAppointmentDisplay";

export type AppointmentStreamPayload = Partial<TodayAppointment> & {
  _id?: string;
  deleted?: boolean;
  createdAt?: string | null;
};

export interface AppointmentStreamNotificationCopy {
  title: string;
  body: string;
}

function summaryOf(appointment: AppointmentStreamPayload): string {
  const visitorName = String(appointment.visitorName || "ไม่ระบุชื่อ");
  const organization = String(appointment.visitorOrganization || "ไม่ระบุบริษัท");
  if (appointment.qrMode === "long-term") {
    const range = formatVisitorDateRange(
      appointment.appointmentDate || appointment.createdAt,
      appointment.expiryDate,
    );
    return `${visitorName} (${organization}) วันที่ ${range}`;
  }
  const date = String(appointment.appointmentDate || "ไม่ระบุวัน");
  const time = String(appointment.appointmentTime || "ไม่ระบุเวลา");
  return `${visitorName} (${organization}) วันที่ ${date} เวลา ${time}`;
}

function personOf(appointment: AppointmentStreamPayload): string {
  const visitorName = String(appointment.visitorName || "ไม่ระบุชื่อ");
  const organization = String(appointment.visitorOrganization || "ไม่ระบุบริษัท");
  return `${visitorName} (${organization})`;
}

export function appointmentStreamNotificationCopy(
  payload: AppointmentStreamPayload,
  previousAppointments: AppointmentStreamPayload[] = [],
): AppointmentStreamNotificationCopy {
  const previous = previousAppointments.find((item) => item._id === payload._id);
  const appointment = { ...previous, ...payload };

  if (payload.deleted) {
    return {
      title: "🗑️ ลบนัดหมาย",
      body: `ลบนัดหมายของ ${personOf(appointment)} แล้ว`,
    };
  }

  if (payload.completedAt && !previous?.completedAt) {
    return {
      title: "✅ เช็คเอาท์แล้ว",
      body: `${personOf(appointment)} เช็คเอาท์แล้ว`,
    };
  }

  if (payload.completionRequestedAt && !previous?.completionRequestedAt) {
    return {
      title: "📷 รอสแกนออก",
      body: `${personOf(appointment)} เสร็จสิ้นแล้ว กรุณาสแกนออก`,
    };
  }

  if (payload.checkedInAt && !previous?.checkedInAt) {
    return {
      title: "✅ เช็คอินแล้ว",
      body: `${personOf(appointment)} เช็คอินแล้ว`,
    };
  }

  if (!previous) {
    return {
      title: appointment.qrMode === "long-term" ? "🔔 ระยะยาวใหม่" : "🔔 นัดหมายใหม่",
      body: summaryOf(appointment),
    };
  }

  return {
    title: "✏️ แก้ไขนัดหมาย",
    body: `อัปเดตข้อมูลของ ${summaryOf(appointment)}`,
  };
}
