jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn() }));

import { DEFAULT_KIOSK_ADMIN_PASSWORD, verifyKioskAdminPassword } from "./kioskAdminPassword";

describe("verifyKioskAdminPassword", () => {
  it("ยอมรับรหัส default เมื่อยังไม่มีรหัสใน SecureStore", async () => {
    const readStored = jest.fn(async () => null);

    await expect(verifyKioskAdminPassword(DEFAULT_KIOSK_ADMIN_PASSWORD, readStored)).resolves.toBe(true);
  });

  it("ยอมรับเฉพาะรหัสที่เก็บไว้เมื่อมีรหัสใน SecureStore", async () => {
    const readStored = jest.fn(async () => "secret-123");

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
});
