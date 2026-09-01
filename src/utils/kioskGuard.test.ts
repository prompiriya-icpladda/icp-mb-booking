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
  it("refresh kiosk policy แม้เครื่องอยู่ใน kiosk mode แล้ว", async () => {
    const kiosk = makeKiosk({ isInKioskMode: jest.fn(async () => true) });

    await expect(startKioskWhenNeeded(kiosk)).resolves.toBe(true);

    expect(kiosk.isDeviceOwner).toHaveBeenCalledTimes(1);
    expect(kiosk.startKiosk).toHaveBeenCalledTimes(1);
  });

  it("คืน true ถ้า locked อยู่แล้วแต่ refresh policy ไม่สำเร็จ", async () => {
    const kiosk = makeKiosk({
      isInKioskMode: jest.fn(async () => true),
      startKiosk: jest.fn(async () => false),
    });

    await expect(startKioskWhenNeeded(kiosk)).resolves.toBe(true);

    expect(kiosk.startKiosk).toHaveBeenCalledTimes(1);
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
