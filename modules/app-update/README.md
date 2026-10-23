# Native App Updates

Android-only Expo module used by `backend/services/appUpdate`:

- `checkPlayUpdate` asks Google's official `com.google.android.play:app-update:2.1.0` library for
  availability and the target version code; it does not start Play's in-app installation flow.
- `isApkInstallationEnabled` reads the immutable Android manifest flag and embedded Expo channel.
- `canInstallPackages` reads Android 8+'s install-source authorization. On Android 7, the system
  installer owns the global unknown-source check.
- `installApk` accepts no path or URL. It validates only the app-owned `cache/app-updates/update.apk`
  and opens Android's installer. It checks the package name, exact signer set and increasing native
  version code. It never performs a silent installation or claims the system installation succeeded.

`scripts/withAppUpdates.js` owns build-time permission policy; the library manifest itself does not
request package-install permission. Its distinct private FileProvider exposes only the update cache.
JavaScript owns transfer, checksum verification and user-facing decisions; the existing permission
owner serializes the unknown-source settings screen.

New or changed native code requires a new installation package. Development clients can load the
JavaScript without this module, but cannot install APK updates or query Google Play until rebuilt.
