import * as SecureStore from "expo-secure-store";

export const KIOSK_ADMIN_PASSWORD_KEY = "kiosk_admin_password";
export const DEFAULT_KIOSK_ADMIN_PASSWORD = "!CPladda1518";

type StoredPasswordReader = () => Promise<string | null>;

export async function getKioskAdminPassword(
  readStored: StoredPasswordReader = () => SecureStore.getItemAsync(KIOSK_ADMIN_PASSWORD_KEY),
): Promise<string> {
  try {
    const stored = await readStored();
    return stored && stored.length > 0 ? stored : DEFAULT_KIOSK_ADMIN_PASSWORD;
  } catch {
    return DEFAULT_KIOSK_ADMIN_PASSWORD;
  }
}

export async function verifyKioskAdminPassword(
  password: string,
  readStored?: StoredPasswordReader,
): Promise<boolean> {
  const adminPassword = await getKioskAdminPassword(readStored);
  return password === adminPassword;
}
