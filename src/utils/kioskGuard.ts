export interface KioskControls {
  isDeviceOwner: () => Promise<boolean>;
  isInKioskMode: () => Promise<boolean>;
  startKiosk: () => Promise<boolean>;
}

export async function startKioskWhenNeeded(kiosk: KioskControls): Promise<boolean> {
  const alreadyLocked = await kiosk.isInKioskMode();
  const isOwner = await kiosk.isDeviceOwner();
  if (!isOwner) return alreadyLocked;

  const refreshed = await kiosk.startKiosk();
  return refreshed || alreadyLocked;
}
