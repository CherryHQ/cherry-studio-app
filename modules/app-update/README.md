# Native App Updates

Android-only Expo module used by `backend/services/appUpdate`:

- `checkPlayUpdate` asks Google's official `com.google.android.play:app-update:2.1.0` library for
  availability and the target version code; it does not start Play's in-app installation flow.
- `getDomesticStoreInfo` reads the supported installation source, device brand/manufacturer and
  stores capable of handling an explicitly targeted listing. The backend resolves one store
  automatically from these facts; no store list is presented to the user.
- `openDomesticStore` opens an explicitly targeted store after rechecking its availability.
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

`checkDomesticStoreUpdate(requestId, store)` owns query-only HONOR/Xiaomi SDK and vivo provider
integration. `cancelDomesticStoreUpdate` releases the request; disposal cancels all waiters.
Callbacks and deadlines settle on the main queue; the vivo provider call runs off that queue.
Vendor errors preserve a reason/code instead of becoming no-update. HONOR never invokes its UI;
Xiaomi disables auto popup and serializes its process-global callback. `openDomesticStore`
accepts an optional vivo gray target and opens the store listing; installation remains owned
by the store. The native method checks the embedded domestic channel and store.
See [SDK provenance](android/libs/README.md) and
[the domestic update guide](../../docs/guides/domestic-store-updates.md). These archives require a new
native build; they cannot be delivered through an OTA. No vendor credentials live in this module.
