import { AppState, AppStateStatus } from "react-native";
import * as Updates from "expo-updates";

const ACTIVE_CHECK_COOLDOWN_MS = 5 * 60 * 1000;

let checking = false;
let lastCheckedAt = 0;
let appStateSub: { remove: () => void } | null = null;

export async function checkForAppUpdate(force = false) {
  if (__DEV__ || !Updates.isEnabled || checking) return;

  const now = Date.now();
  if (!force && now - lastCheckedAt < ACTIVE_CHECK_COOLDOWN_MS) return;

  checking = true;
  lastCheckedAt = now;

  try {
    const update = await Updates.checkForUpdateAsync();
    if (!update.isAvailable && !update.isRollBackToEmbedded) return;

    const fetchResult = await Updates.fetchUpdateAsync();
    if (fetchResult.isNew || fetchResult.isRollBackToEmbedded) {
      await Updates.reloadAsync();
    }
  } catch (error) {
    console.log("App update check failed:", error);
  } finally {
    checking = false;
  }
}

export function startAppUpdateChecks() {
  checkForAppUpdate(true);

  if (appStateSub) return;

  appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") {
      checkForAppUpdate().catch(() => {});
    }
  });
}

export function stopAppUpdateChecks() {
  if (!appStateSub) return;
  appStateSub.remove();
  appStateSub = null;
}
