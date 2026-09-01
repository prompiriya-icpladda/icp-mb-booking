jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));

import {
  DEFAULT_KIOSK_ADMIN_PASSWORD,
  KIOSK_ADMIN_PIN_KEY,
  hasKioskAdminPin,
  sanitizeKioskPinInput,
  setKioskAdminPin,
  verifyKioskAdminPassword,
} from "./kioskAdminPassword";

describe("verifyKioskAdminPassword", () => {
  it("ยอมรับรหัส default เมื่อยังไม่มีรหัสใน SecureStore", async () => {
    const readStored = jest.fn(async () => null);

    await expect(verifyKioskAdminPassword(DEFAULT_KIOSK_ADMIN_PASSWORD, readStored)).resolves.toBe(true);
  });

  it("ยอมรับเฉพาะรหัสที่เก็บไว้เมื่อมีรหัสใน SecureStore", async () => {
    const readStored = jest.fn(async (key?: string) =>
      key === "kiosk_admin_password" ? "secret-123" : null,
    );

    await expect(verifyKioskAdminPassword("secret-123", readStored)).resolves.toBe(true);
    await expect(verifyKioskAdminPassword(DEFAULT_KIOSK_ADMIN_PASSWORD, readStored)).resolves.toBe(false);
  });

  it("ค่าว่างใน SecureStore ไม่ทำให้กด enter เปล่าแล้วออกได้", async () => {
    const readStored = jest.fn(async () => "");

    await expect(verifyKioskAdminPassword("", readStored)).resolves.toBe(false);
    await expect(verifyKioskAdminPassword(DEFAULT_KIOSK_ADMIN_PASSWORD, readStored)).resolves.toBe(true);
  });

  it("ถ้าอ่าน SecureStore ไม่ได้ให้ fallback กลับไปใช้รหัส default", async () => {
    const readStored = jest.fn(async () => {
      throw new Error("SecureStore unavailable");
    });

    await expect(verifyKioskAdminPassword(DEFAULT_KIOSK_ADMIN_PASSWORD, readStored)).resolves.toBe(true);
  });

  it("ยอมรับ PIN 6 ตัวแทนรหัสเดิมเมื่อมี PIN ตั้งไว้", async () => {
    const readStored = jest.fn(async (key?: string) => {
      if (key === KIOSK_ADMIN_PIN_KEY) return "123456";
      if (key === "kiosk_admin_password") return "secret-123";
      return null;
    });

    await expect(verifyKioskAdminPassword("123456", readStored)).resolves.toBe(true);
    await expect(verifyKioskAdminPassword("secret-123", readStored)).resolves.toBe(false);
    await expect(verifyKioskAdminPassword(DEFAULT_KIOSK_ADMIN_PASSWORD, readStored)).resolves.toBe(false);
  });

  it("บอกได้ว่ายังไม่มี PIN ถ้าค่าใน SecureStore ไม่ใช่ตัวเลข 6 ตัว", async () => {
    const readStored = jest.fn(async (key?: string) => (key === KIOSK_ADMIN_PIN_KEY ? "12345a" : null));

    await expect(hasKioskAdminPin(readStored)).resolves.toBe(false);
  });

  it("ตั้ง PIN ครั้งแรกด้วยรหัสเดิมและบันทึกเฉพาะตัวเลข 6 ตัว", async () => {
    const readStored = jest.fn(async () => null);
    const writeStored = jest.fn(async () => undefined);

    await expect(
      setKioskAdminPin(
        { currentCredential: DEFAULT_KIOSK_ADMIN_PASSWORD, pin: "654321", confirmPin: "654321" },
        readStored,
        writeStored,
      ),
    ).resolves.toEqual({ ok: true });
    expect(writeStored).toHaveBeenCalledWith(KIOSK_ADMIN_PIN_KEY, "654321");
  });

  it("เปลี่ยน PIN ต้องใช้ PIN เดิม ไม่ใช่รหัสเดิม", async () => {
    const readStored = jest.fn(async (key?: string) => {
      if (key === KIOSK_ADMIN_PIN_KEY) return "111111";
      if (key === "kiosk_admin_password") return DEFAULT_KIOSK_ADMIN_PASSWORD;
      return null;
    });
    const writeStored = jest.fn(async () => undefined);

    await expect(
      setKioskAdminPin(
        { currentCredential: DEFAULT_KIOSK_ADMIN_PASSWORD, pin: "222222", confirmPin: "222222" },
        readStored,
        writeStored,
      ),
    ).resolves.toEqual({ ok: false, error: "current-invalid" });
    expect(writeStored).not.toHaveBeenCalled();

    await expect(
      setKioskAdminPin(
        { currentCredential: "111111", pin: "222222", confirmPin: "222222" },
        readStored,
        writeStored,
      ),
    ).resolves.toEqual({ ok: true });
    expect(writeStored).toHaveBeenCalledWith(KIOSK_ADMIN_PIN_KEY, "222222");
  });

  it("ลืมรหัสผ่านให้ตั้ง PIN ใหม่ด้วยรหัสเดิมได้", async () => {
    const readStored = jest.fn(async (key?: string) => {
      if (key === KIOSK_ADMIN_PIN_KEY) return "111111";
      if (key === "kiosk_admin_password") return null;
      return null;
    });
    const writeStored = jest.fn(async () => undefined);

    await expect(
      setKioskAdminPin(
        {
          currentCredential: DEFAULT_KIOSK_ADMIN_PASSWORD,
          pin: "333333",
          confirmPin: "333333",
          allowDefaultRecovery: true,
        },
        readStored,
        writeStored,
      ),
    ).resolves.toEqual({ ok: true });
    expect(writeStored).toHaveBeenCalledWith(KIOSK_ADMIN_PIN_KEY, "333333");
  });

  it("ไม่บันทึก PIN ที่ไม่ใช่ตัวเลข 6 ตัวหรือยืนยันไม่ตรงกัน", async () => {
    const readStored = jest.fn(async () => null);
    const writeStored = jest.fn(async () => undefined);

    await expect(
      setKioskAdminPin(
        { currentCredential: DEFAULT_KIOSK_ADMIN_PASSWORD, pin: "12345", confirmPin: "12345" },
        readStored,
        writeStored,
      ),
    ).resolves.toEqual({ ok: false, error: "pin-format" });
    await expect(
      setKioskAdminPin(
        { currentCredential: DEFAULT_KIOSK_ADMIN_PASSWORD, pin: "123456", confirmPin: "654321" },
        readStored,
        writeStored,
      ),
    ).resolves.toEqual({ ok: false, error: "pin-mismatch" });
    expect(writeStored).not.toHaveBeenCalled();
  });

  it("กรอง PIN input ให้เหลือเฉพาะตัวเลข 6 ตัวแรก", () => {
    expect(sanitizeKioskPinInput("12a34-5678")).toBe("123456");
  });
});
