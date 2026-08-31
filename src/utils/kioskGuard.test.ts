import { startKioskWhenNeeded, type KioskControls } from "./kioskGuard";

function makeKiosk(overrides: Partial<jest.Mocked<KioskControls>> = {}): jest.Mocked<KioskControls> {
  return {
    isDeviceOwner: jest.fn(async () => true),
    isInKioskMode: jest.fn(async () => false),
    startKiosk: jest.fn(async () => true),
    ...overrides,
  };
}

describe("startKioskWhenNeeded", () => {
  it("ไม่เรียก startKiosk ซ้ำเมื่อเครื่องอยู่ใน kiosk mode แล้ว", async () => {
    const kiosk = makeKiosk({ isInKioskMode: jest.fn(async () => true) });

    await expect(startKioskWhenNeeded(kiosk)).resolves.toBe(true);

    expect(kiosk.startKiosk).not.toHaveBeenCalled();
    expect(kiosk.isDeviceOwner).not.toHaveBeenCalled();
  });

  it("ไม่เรียก screen pinning fallback ถ้าแอปไม่ใช่ Device Owner", async () => {
    const kiosk = makeKiosk({ isDeviceOwner: jest.fn(async () => false) });

    await expect(startKioskWhenNeeded(kiosk)).resolves.toBe(false);

    expect(kiosk.startKiosk).not.toHaveBeenCalled();
  });

  it("เริ่ม kiosk เมื่อยังไม่ล็อกและเป็น Device Owner", async () => {
    const kiosk = makeKiosk();

    await expect(startKioskWhenNeeded(kiosk)).resolves.toBe(true);

    expect(kiosk.startKiosk).toHaveBeenCalledTimes(1);
  });
});
