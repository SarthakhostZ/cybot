/**
 * frontend/app.config.js
 *
 * Dynamic Expo config — reads environment variables at build time.
 * Overrides app.json; both files are merged by Expo.
 *
 * Environment variables (set in EAS build profiles or local .env):
 *   EXPO_PUBLIC_API_BASE_URL   — Django API base (default: http://localhost:8000/api/v1)
 *   APP_ENV                    — "development" | "preview" | "production"
 */

const IS_PROD = process.env.APP_ENV === "production";
const IS_PREV = process.env.APP_ENV === "preview";

const fs = require("fs");
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ??
  (fs.existsSync("./google-services.json") ? "./google-services.json" : undefined);

const APP_IDENTIFIER = IS_PROD ? "com.cybot.app" : IS_PREV ? "com.cybot.app.preview" : "com.cybot.app.dev";

export default ({ config }) => ({
  ...config,
  name:    IS_PROD ? "Cybot" : IS_PREV ? "Cybot Preview" : "Cybot Dev",
  slug:    "cybot",
  version: config.version ?? "1.0.0",

  ios: {
    ...config.ios,
    bundleIdentifier: APP_IDENTIFIER,
    config: {
      usesNonExemptEncryption: false,
    },
  },

  android: {
    ...config.android,
    package: APP_IDENTIFIER,
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },

  extra: {
    ...config.extra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1",
    appEnv:     process.env.APP_ENV ?? "development",
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? config.extra?.eas?.projectId ?? "YOUR_EAS_PROJECT_ID",
    },
  },

  // OTA update channel — must match eas.json channel names
  updates: {
    url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID ?? "YOUR_EAS_PROJECT_ID"}`,
    enabled: IS_PROD || IS_PREV,
    fallbackToCacheTimeout: 0,
  },

  runtimeVersion: {
    policy: "appVersion",
  },

  plugins: [
    "expo-secure-store",
    ["expo-image-picker", {
      photosPermission: "Allow Cybot to access your photos for avatar upload.",
    }],
  ],

  scheme: "cybot",
});
