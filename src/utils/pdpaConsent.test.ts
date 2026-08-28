import {
  buildPdpaSignaturePayload,
  hasPdpaSignature,
  isPdpaScrollAtEnd,
  PDPA_CONSENT_TEXT,
  PDPA_CONSENT_VERSION,
} from "./pdpaConsent";

describe("pdpaConsent", () => {
  it("ships the visitor walk-in PDPA text and version", () => {
    expect(PDPA_CONSENT_VERSION).toBe("visitor-walk-in-2026-08-28");
    expect(PDPA_CONSENT_TEXT).toContain("ชื่อและนามสกุล");
    expect(PDPA_CONSENT_TEXT).toContain("ระยะเวลา **1 ปี**");
    expect(PDPA_CONSENT_TEXT).toContain("หมายเหตุ: การกดปุ่ม **“ยินยอม”**");
    expect(PDPA_CONSENT_TEXT).not.toContain("ข้าพเจ้าจึงแสดงความประสงค์ดังต่อไปนี้");
    expect(PDPA_CONSENT_TEXT).not.toContain("☐ **ข้าพเจ้าไม่ยินยอม**");
    expect(PDPA_CONSENT_TEXT).not.toContain("**[ ไม่ยินยอม ]    [ ยินยอม ]**");
  });

  it("detects whether a signature has enough points", () => {
    expect(hasPdpaSignature(null)).toBe(false);
    expect(hasPdpaSignature({ version: 1, width: 320, height: 160, strokes: [] })).toBe(false);
    expect(
      hasPdpaSignature({
        version: 1,
        width: 320,
        height: 160,
        strokes: [[{ x: 1, y: 2 }]],
      }),
    ).toBe(true);
  });

  it("normalizes signature points before storage", () => {
    expect(
      buildPdpaSignaturePayload(
        [[{ x: 1.234, y: 2.789 }], []],
        { width: 320.4, height: 160.6 },
      ),
    ).toEqual({
      version: 1,
      width: 320,
      height: 161,
      strokes: [[{ x: 1.2, y: 2.8 }]],
    });
  });

  it("detects when the consent text is scrolled to the end", () => {
    expect(isPdpaScrollAtEnd({ layoutHeight: 0, contentHeight: 400, offsetY: 400 })).toBe(false);
    expect(isPdpaScrollAtEnd({ layoutHeight: 220, contentHeight: 400, offsetY: 120 })).toBe(false);
    expect(isPdpaScrollAtEnd({ layoutHeight: 220, contentHeight: 400, offsetY: 170 })).toBe(true);
    expect(isPdpaScrollAtEnd({ layoutHeight: 220, contentHeight: 200, offsetY: 0 })).toBe(true);
  });
});
