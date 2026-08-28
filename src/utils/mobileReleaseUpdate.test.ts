jest.mock("expo-application", () => ({
  nativeApplicationVersion: "1.0.0",
  nativeBuildVersion: "1",
}));
jest.mock("react-native", () => ({
  Linking: { openURL: jest.fn() },
}));
jest.mock("../services/api", () => ({ API_URL: "https://app-plant.icpladda.com/ICPBooking/api" }));
jest.mock("./kioskModule", () => ({
  kioskModule: { stopKiosk: jest.fn(async () => true) },
}));

import {
  isMobileReleaseNewer,
  parseNativeVersionCode,
  resolveMobileReleaseCheck,
} from "./mobileReleaseUpdate";

describe("mobileReleaseUpdate", () => {
  it("parses Android nativeBuildVersion as versionCode", () => {
    expect(parseNativeVersionCode("7")).toBe(7);
    expect(parseNativeVersionCode("007")).toBe(7);
    expect(parseNativeVersionCode(null)).toBe(0);
    expect(parseNativeVersionCode("abc")).toBe(0);
  });

  it("detects newer mobile releases by versionCode", () => {
    expect(isMobileReleaseNewer({ versionCode: 2 }, 1)).toBe(true);
    expect(isMobileReleaseNewer({ versionCode: 2 }, 2)).toBe(false);
    expect(isMobileReleaseNewer(null, 1)).toBe(false);
  });

  it("marks only forced newer releases as required", () => {
    expect(
      resolveMobileReleaseCheck(
        { updateAvailable: true, latest: { id: "ap-scanner-2", versionName: "1.0.1", versionCode: 2, apkUrl: "https://example.com/app.apk", forceUpdate: true } },
        1,
        "1.0.0",
      ),
    ).toEqual(
      expect.objectContaining({
        currentVersionCode: 1,
        currentVersionName: "1.0.0",
        available: true,
        required: true,
      }),
    );

    expect(
      resolveMobileReleaseCheck(
        { updateAvailable: true, latest: { id: "ap-scanner-2", versionName: "1.0.1", versionCode: 2, apkUrl: "https://example.com/app.apk", forceUpdate: false } },
        1,
      ).required,
    ).toBe(false);

    expect(
      resolveMobileReleaseCheck(
        { updateAvailable: true, latest: { id: "ap-scanner-1", versionName: "1.0.0", versionCode: 1, apkUrl: "https://example.com/app.apk", forceUpdate: true } },
        1,
      ).required,
    ).toBe(false);
  });
});
