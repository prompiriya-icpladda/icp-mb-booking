import * as SecureStore from "expo-secure-store";

export const KIOSK_ADMIN_PASSWORD_KEY = "kiosk_admin_password";
export const KIOSK_ADMIN_PIN_KEY = "kiosk_admin_pin";
export const KIOSK_ADMIN_PIN_LENGTH = 6;
export const DEFAULT_KIOSK_ADMIN_PASSWORD = "!CPladda1518";

type StoredCredentialReader = (key?: string) => Promise<string | null>;
type StoredCredentialWriter = (key: string, value: string) => Promise<void>;

export type KioskAdminPinChangeError =
  | "current-invalid"
  | "pin-format"
  | "pin-mismatch"
  | "save-failed";

export type KioskAdminPinChangeResult =
  | { ok: true }
  | { ok: false; error: KioskAdminPinChangeError };

function readSecureStore(key?: string) {
  return SecureStore.getItemAsync(key ?? KIOSK_ADMIN_PASSWORD_KEY);
}

function writeSecureStore(key: string, value: string) {
  return SecureStore.setItemAsync(key, value);
}

export function sanitizeKioskPinInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, KIOSK_ADMIN_PIN_LENGTH);
}

export function isValidKioskAdminPin(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export async function getKioskAdminPin(
  readStored: StoredCredentialReader = readSecureStore,
): Promise<string | null> {
  try {
    const stored = await readStored(KIOSK_ADMIN_PIN_KEY);
    return stored && isValidKioskAdminPin(stored) ? stored : null;
  } catch {
    return null;
  }
}

export async function hasKioskAdminPin(
  readStored: StoredCredentialReader = readSecureStore,
): Promise<boolean> {
  return (await getKioskAdminPin(readStored)) !== null;
}

export async function getKioskAdminPassword(
  readStored: StoredCredentialReader = readSecureStore,
): Promise<string> {
  try {
    const stored = await readStored(KIOSK_ADMIN_PASSWORD_KEY);
    return stored && stored.length > 0 ? stored : DEFAULT_KIOSK_ADMIN_PASSWORD;
  } catch {
    return DEFAULT_KIOSK_ADMIN_PASSWORD;
  }
}

async function verifyLegacyKioskAdminPassword(
  password: string,
  readStored: StoredCredentialReader = readSecureStore,
): Promise<boolean> {
  const adminPassword = await getKioskAdminPassword(readStored);
  return password === adminPassword;
}

export async function verifyKioskAdminPassword(
  password: string,
  readStored: StoredCredentialReader = readSecureStore,
): Promise<boolean> {
  const pin = await getKioskAdminPin(readStored);
  if (pin) return password === pin;
  return verifyLegacyKioskAdminPassword(password, readStored);
}

export async function setKioskAdminPin(
  {
    currentCredential,
    pin,
    confirmPin,
    allowDefaultRecovery = false,
  }: { currentCredential: string; pin: string; confirmPin: string; allowDefaultRecovery?: boolean },
  readStored: StoredCredentialReader = readSecureStore,
  writeStored: StoredCredentialWriter = writeSecureStore,
): Promise<KioskAdminPinChangeResult> {
  if (!isValidKioskAdminPin(pin)) return { ok: false, error: "pin-format" };
  if (pin !== confirmPin) return { ok: false, error: "pin-mismatch" };

  const currentPin = await getKioskAdminPin(readStored);
  const currentValid = currentPin
    ? currentCredential === currentPin || (allowDefaultRecovery && currentCredential === DEFAULT_KIOSK_ADMIN_PASSWORD)
    : await verifyLegacyKioskAdminPassword(currentCredential, readStored);

  if (!currentValid) return { ok: false, error: "current-invalid" };

  try {
    await writeStored(KIOSK_ADMIN_PIN_KEY, pin);
    return { ok: true };
  } catch {
    return { ok: false, error: "save-failed" };
  }
}
