import type { VisitorQrMode } from "../services/api";
import type { NotificationHistoryEntry } from "./notificationHistory.logic";

export type AppointmentNotificationTab = NonNullable<NotificationHistoryEntry["tab"]>;

export interface AppointmentNotificationTarget {
  appointmentId: string;
  tab: AppointmentNotificationTab;
}

function isAppointmentNotificationTab(value: unknown): value is AppointmentNotificationTab {
  return value === "normal" || value === "longTerm";
}

export function appointmentNotificationTarget(appointment: {
  _id?: string | null;
  qrMode?: VisitorQrMode | null;
}): AppointmentNotificationTarget | null {
  if (!appointment._id) return null;
  return {
    appointmentId: appointment._id,
    tab: appointment.qrMode === "long-term" ? "longTerm" : "normal",
  };
}

export function notificationTargetFromData(
  data?: Record<string, unknown> | null,
): AppointmentNotificationTarget | null {
  if (!data || typeof data.appointmentId !== "string") return null;
  if (!isAppointmentNotificationTab(data.tab)) return null;
  return { appointmentId: data.appointmentId, tab: data.tab };
}
