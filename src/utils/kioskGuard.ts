export interface KioskControls {
  isDeviceOwner: () => Promise<boolean>;
  isInKioskMode: () => Promise<boolean>;
  startKiosk: () => Promise<boolean>;
}

export async function startKioskWhenNeeded(kiosk: KioskControls): Promise<boolean> {
  const alreadyLocked = await kiosk.isInKioskMode();
  if (alreadyLocked) return true;

  const isOwner = await kiosk.isDeviceOwner();
  if (!isOwner) return false;

  return kiosk.startKiosk();
}
