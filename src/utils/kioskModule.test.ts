describe("kioskModule", () => {
  afterEach(() => {
    jest.dontMock("react-native");
    jest.restoreAllMocks();
    jest.resetModules();
  });

  function loadKioskModule(nativeModule: Record<string, unknown>) {
    jest.resetModules();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.doMock("react-native", () => ({
      NativeModules: { KioskModule: nativeModule },
      Platform: { OS: "android" },
    }));
    return require("./kioskModule").kioskModule;
  }

  it("returns false when an older APK does not have the native notification sound method", async () => {
    const kioskModule = loadKioskModule({});

    await expect(kioskModule.playNotificationSound()).resolves.toBe(false);
  });
});
