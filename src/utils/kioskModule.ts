import { NativeModules, Platform } from 'react-native';

const { KioskModule } = NativeModules;

console.log('[KIOSK] Module loaded:', !!KioskModule, 'platform:', Platform.OS);

const noop = () => Promise.resolve(false);

const safe = (label: string, fn: () => Promise<boolean>): Promise<boolean> => {
  if (Platform.OS !== 'android' || !KioskModule) {
    console.log(`[KIOSK] ${label} skipped — module=${!!KioskModule}`);
    return noop();
  }
  return fn()
    .then((r) => { console.log(`[KIOSK] ${label} result:`, r); return r; })
    .catch((e) => { console.log(`[KIOSK] ${label} error:`, e); return false; });
};

export const kioskModule = {
  isDeviceOwner: () => safe('isDeviceOwner', () => KioskModule.isDeviceOwner()),
  startKiosk:    () => safe('startKiosk', () => KioskModule.startKiosk()),
  stopKiosk:     () => safe('stopKiosk', () => KioskModule.stopKiosk()),
  isInKioskMode: () => safe('isInKioskMode', () => KioskModule.isInKioskMode()),
};
