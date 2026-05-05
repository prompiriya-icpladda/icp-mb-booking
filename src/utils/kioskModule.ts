import { NativeModules, Platform } from 'react-native';

const { KioskModule } = NativeModules;

const noop = () => Promise.resolve(false);

export const kioskModule = {
  isDeviceOwner: (): Promise<boolean> =>
    Platform.OS === 'android' ? KioskModule.isDeviceOwner() : noop(),

  startKiosk: (): Promise<boolean> =>
    Platform.OS === 'android' ? KioskModule.startKiosk() : noop(),

  stopKiosk: (): Promise<boolean> =>
    Platform.OS === 'android' ? KioskModule.stopKiosk() : noop(),

  isInKioskMode: (): Promise<boolean> =>
    Platform.OS === 'android' ? KioskModule.isInKioskMode() : noop(),
};
