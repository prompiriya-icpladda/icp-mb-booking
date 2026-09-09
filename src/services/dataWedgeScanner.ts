import { DeviceEventEmitter, NativeModules, Platform } from "react-native";

export const DATA_WEDGE_SCAN_EVENT = "DataWedgeScan";

type DataWedgeNativeModule = {
  configureProfile?: () => Promise<boolean>;
};

type DataWedgeScanEvent = {
  data?: string;
};

const CONFIG_RETRY_DELAYS_MS = [0, 500, 1000, 2000, 4000];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nativeModule(): DataWedgeNativeModule | undefined {
  return Platform.OS === "android"
    ? NativeModules.DataWedgeModule as DataWedgeNativeModule | undefined
    : undefined;
}

export async function configureDataWedgeScanner(): Promise<boolean> {
  const module = nativeModule();
  if (!module?.configureProfile) return false;
  for (let attempt = 0; attempt < CONFIG_RETRY_DELAYS_MS.length; attempt += 1) {
    const waitMs = CONFIG_RETRY_DELAYS_MS[attempt];
    if (waitMs > 0) await delay(waitMs);
    try {
      if (await module.configureProfile()) return true;
    } catch {}
  }
  return false;
}

export function addDataWedgeScanListener(handler: (data: string) => void): { remove: () => void } {
  if (!nativeModule()) return { remove: () => undefined };

  return DeviceEventEmitter.addListener(DATA_WEDGE_SCAN_EVENT, (event: DataWedgeScanEvent) => {
    const data = String(event?.data || "").trim();
    if (data) handler(data);
  });
}

export async function startDataWedgeScanner(handler: (data: string) => void): Promise<{ remove: () => void }> {
  await configureDataWedgeScanner();
  return addDataWedgeScanListener(handler);
}
