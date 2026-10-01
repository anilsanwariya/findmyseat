import { useEffect, useState } from "react";

/**
 * LibraryBandhu's Android app is the live website wrapped as a Trusted Web
 * Activity (built with PWABuilder and published on Google Play).
 */

/** Play Store package name. Must match the one used when building the app. */
export const ANDROID_PACKAGE = "com.librarybandhu.app";

/**
 * SHA-256 signing-certificate fingerprints allowed to open this site full-screen
 * (served at /.well-known/assetlinks.json). Add both the upload key from
 * PWABuilder and the "App signing key" from Play Console → Setup → App integrity.
 * Format: "AB:CD:...".
 */
export const ANDROID_SHA256_FINGERPRINTS: string[] = [];

export function assetLinks() {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: ANDROID_SHA256_FINGERPRINTS,
      },
    },
  ];
}

const FLAG = "lb-android-app";

/**
 * True when the page is running inside the Android app. The app opens
 * `/?source=android-app`, and Android reports an `android-app://` referrer on
 * launch; either marks the tab for the rest of the session. sessionStorage (not
 * localStorage) because the app shares Chrome's storage with the normal browser.
 */
export function isAndroidApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(FLAG) === "1") return true;
    const fromApp =
      document.referrer.startsWith("android-app://") ||
      new URLSearchParams(window.location.search).get("source") === "android-app";
    if (fromApp) sessionStorage.setItem(FLAG, "1");
    return fromApp;
  } catch {
    return false;
  }
}

/** isAndroidApp() as a hook; false during server render so hydration matches. */
export function useIsAndroidApp() {
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(isAndroidApp()), []);
  return inApp;
}
