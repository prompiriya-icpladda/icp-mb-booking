import type { TodayAppointment } from "../services/api";
import type { NotificationHistoryEntry } from "./notificationHistory.logic";

export type AppointmentListTab = NonNullable<NotificationHistoryEntry["tab"]>;

export interface HistoryFocusResult {
  targetTab: AppointmentListTab;
  appointmentId?: string;
  index: number;
  found: boolean;
}

export function resolveHistoryFocus(
  item: NotificationHistoryEntry,
  todayAppointments: Pick<TodayAppointment, "_id">[],
  longTermAppointments: Pick<TodayAppointment, "_id">[],
): HistoryFocusResult {
  const targetTab: AppointmentListTab = item.tab ?? "normal";
  const pool = targetTab === "longTerm" ? longTermAppointments : todayAppointments;
  const appointmentId = item.appointmentId;
  if (!appointmentId) return { targetTab, index: -1, found: false };

  const index = pool.findIndex((appointment) => appointment._id === appointmentId);
  return { targetTab, appointmentId, index, found: index >= 0 };
}
