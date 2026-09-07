import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "mobile_push_device_id";

export async function getScannerDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = `ap-scanner-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
}
