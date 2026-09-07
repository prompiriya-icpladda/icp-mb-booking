describe("dataWedgeScanner", () => {
  afterEach(() => {
    jest.dontMock("react-native");
    jest.resetModules();
    jest.restoreAllMocks();
  });

  function loadWithNativeModule(nativeModule: Record<string, unknown>, os = "android") {
    jest.resetModules();
    const listeners = new Map<string, (event: unknown) => void>();
    const addListener = jest.fn((eventName: string, handler: (event: unknown) => void) => {
      listeners.set(eventName, handler);
      return { remove: jest.fn(() => listeners.delete(eventName)) };
    });
    jest.doMock("react-native", () => ({
      DeviceEventEmitter: { addListener },
      NativeModules: { DataWedgeModule: nativeModule },
      Platform: { OS: os },
    }));
    return {
      module: require("./dataWedgeScanner") as typeof import("./dataWedgeScanner"),
      addListener,
      emit: (eventName: string, event: unknown) => listeners.get(eventName)?.(event),
    };
  }

  it("configures DataWedge profile on Android TC21", async () => {
    const configureProfile = jest.fn(async () => true);
    const { module } = loadWithNativeModule({ configureProfile });

    await expect(module.configureDataWedgeScanner()).resolves.toBe(true);

    expect(configureProfile).toHaveBeenCalledTimes(1);
  });

  it("emits trimmed hardware scan data from DataWedge broadcast", () => {
    const { module, addListener, emit } = loadWithNativeModule({ configureProfile: jest.fn() });
    const handler = jest.fn();

    const subscription = module.addDataWedgeScanListener(handler);
    emit(module.DATA_WEDGE_SCAN_EVENT, { data: "  apt:visitor1  " });
    emit(module.DATA_WEDGE_SCAN_EVENT, { data: "   " });

    expect(addListener).toHaveBeenCalledWith(module.DATA_WEDGE_SCAN_EVENT, expect.any(Function));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("apt:visitor1");
    subscription.remove();
  });

  it("starts hardware scanning by configuring DataWedge and subscribing once", async () => {
    const configureProfile = jest.fn(async () => true);
    const { module, addListener, emit } = loadWithNativeModule({ configureProfile });
    const handler = jest.fn();

    const subscription = await module.startDataWedgeScanner(handler);
    emit(module.DATA_WEDGE_SCAN_EVENT, { data: "apt:visitor1" });

    expect(configureProfile).toHaveBeenCalledTimes(1);
    expect(addListener).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("apt:visitor1");
    subscription.remove();
  });

  it("becomes a safe no-op when DataWedge native module is unavailable", async () => {
    const { module, addListener } = loadWithNativeModule({}, "ios");
    const handler = jest.fn();

    await expect(module.configureDataWedgeScanner()).resolves.toBe(false);
    module.addDataWedgeScanListener(handler);

    expect(addListener).not.toHaveBeenCalled();
  });
});
