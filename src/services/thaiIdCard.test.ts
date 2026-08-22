import { readThaiIdCardName } from "./thaiIdCard";

describe("readThaiIdCardName", () => {

  it("returns only first and last Thai names from the native reader", async () => {
    const reader = {
      readThaiName: jest.fn(async () => ({
        firstNameTh: " สมชาย ",
        lastNameTh: " ใจดี ",
        fullNameTh: "ignored by normalizer",
        citizenId: "1234567890123",
      })),
    };

    await expect(readThaiIdCardName(reader)).resolves.toEqual({
      firstNameTh: "สมชาย",
      lastNameTh: "ใจดี",
      fullNameTh: "สมชาย ใจดี",
    });
  });

  it("times out when the native reader never responds", async () => {
    const reader = {
      readThaiName: jest.fn(() => new Promise(() => undefined)),
    };

    await expect(readThaiIdCardName(reader, { timeoutMs: 5 })).rejects.toThrow(
      "อ่านบัตรใช้เวลานานเกินไป กรุณาถอดเสียบเครื่องอ่านแล้วลองใหม่",
    );
  });
});
