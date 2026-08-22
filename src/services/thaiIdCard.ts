export interface ThaiIdCardName {
  firstNameTh: string;
  lastNameTh: string;
  fullNameTh: string;
}

export interface ThaiIdCardNativeReader {
  readThaiName(): Promise<unknown>;
}

export interface ThaiIdCardReadOptions {
  timeoutMs?: number;
}

const DEFAULT_READ_TIMEOUT_MS = 15000;
const READ_TIMEOUT_MESSAGE = "อ่านบัตรใช้เวลานานเกินไป กรุณาถอดเสียบเครื่องอ่านแล้วลองใหม่";

function cleanNamePart(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeThaiIdCardName(value: unknown): ThaiIdCardName {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const firstNameTh = cleanNamePart(record.firstNameTh);
  const lastNameTh = cleanNamePart(record.lastNameTh);
  const fullNameTh = [firstNameTh, lastNameTh].filter(Boolean).join(" ");

  if (!firstNameTh || !lastNameTh) {
    throw new Error("อ่านชื่อ-นามสกุลจากบัตรไม่สำเร็จ");
  }

  return { firstNameTh, lastNameTh, fullNameTh };
}

function getNativeReader(): ThaiIdCardNativeReader {
  const { NativeModules, Platform } = require("react-native") as typeof import("react-native");
  if (Platform.OS !== "android") {
    throw new Error("อ่านบัตรประชาชนได้เฉพาะ Android");
  }
  const reader = NativeModules.ThaiIdCardModule as ThaiIdCardNativeReader | undefined;
  if (!reader || typeof reader.readThaiName !== "function") {
    throw new Error("ยังไม่ได้ติดตั้ง Thai ID Card native module");
  }
  return reader;
}

function readNativeNameWithTimeout(
  reader: ThaiIdCardNativeReader,
  timeoutMs: number,
): Promise<unknown> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(READ_TIMEOUT_MESSAGE)), timeoutMs);
  });

  return Promise.race([reader.readThaiName(), timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

export async function readThaiIdCardName(
  reader = getNativeReader(),
  options: ThaiIdCardReadOptions = {},
): Promise<ThaiIdCardName> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_READ_TIMEOUT_MS;
  return normalizeThaiIdCardName(await readNativeNameWithTimeout(reader, timeoutMs));
}
