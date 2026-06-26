const appJson = require("./app.json");

const updatesUrl = process.env.EXPO_PUBLIC_UPDATES_URL;

module.exports = {
  expo: {
    ...appJson.expo,
    runtimeVersion: appJson.expo.version,
    updates: {
      enabled: true,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
      ...(updatesUrl ? { url: updatesUrl } : {}),
    },
  },
};
