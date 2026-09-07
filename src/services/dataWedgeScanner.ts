import { DeviceEventEmitter, NativeModules, Platform } from "react-native";

export const DATA_WEDGE_SCAN_EVENT = "DataWedgeScan";

type DataWedgeNativeModule = {
  configureProfile?: () => Promise<boolean>;
};

type DataWedgeScanEvent = {
  data?: string;
};

function nativeModule(): DataWedgeNativeModule | undefined {
  return Platform.OS === "android"
    ? NativeModules.DataWedgeModule as DataWedgeNativeModule | undefined
    : undefined;
}

export async function configureDataWedgeScanner(): Promise<boolean> {
  const module = nativeModule();
  if (!module?.configureProfile) return false;
  return module.configureProfile();
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
