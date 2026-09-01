import type { CheckinResult } from "../services/api";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dateOnlyParts(value?: string | null): { day: number; month: number; year: number } | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    return {
      day: Number(dateOnly[3]),
      month: Number(dateOnly[2]),
      year: Number(dateOnly[1]),
    };
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const bangkok = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return {
    day: bangkok.getUTCDate(),
    month: bangkok.getUTCMonth() + 1,
    year: bangkok.getUTCFullYear(),
  };
}

export function formatVisitorDate(value?: string | null): string {
  const parts = dateOnlyParts(value);
  if (!parts) return "";
  return `${pad2(parts.day)}/${pad2(parts.month)}/${parts.year}`;
}

export function formatVisitorDateTime(value?: string | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const bangkok = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return `${pad2(bangkok.getUTCDate())}/${pad2(bangkok.getUTCMonth() + 1)}/${bangkok.getUTCFullYear()} ${pad2(bangkok.getUTCHours())}:${pad2(bangkok.getUTCMinutes())}`;
}

export function formatVisitorDateRange(
  start?: string | null,
  end?: string | null,
): string {
  const startText = formatVisitorDate(start);
  const endText = formatVisitorDate(end);
  if (startText && endText) return `${startText} - ${endText}`;
  if (startText) return startText;
  if (endText) return `ถึง ${endText}`;
  return "ไม่ระบุวัน";
}

export function scanResultDateText(result: CheckinResult): string {
  if (result.qrMode === "long-term") {
    const dateTime = formatVisitorDateTime(result.completedAt || result.checkedInAt);
    if (dateTime) return dateTime;
  }

  return [result.appointmentDate, result.appointmentTime]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}
