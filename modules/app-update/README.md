# Native App Updates

Android-only Expo module used by `backend/services/appUpdate`:

- `getDomesticStore` resolves one store from the installation/update source, then device identity.
  The application update module reads it once when created.
- `checkDomesticStoreUpdate(requestId, store)` queries HONOR/Xiaomi SDKs or vivo's local provider
  without opening vendor UI. `cancelDomesticStoreUpdate` releases the pending request.
- `openDomesticStore(store)` opens that store's full-release listing after checking availability.
- `checkPlayUpdate` reads availability and version code from Google's official update library.
- `isApkInstallationEnabled` reads the immutable Android manifest flag and embedded Expo channel.
- `canInstallPackages` reads the system's install-source authorization.
- `installApk` accepts no path or URL. It validates the app-owned `cache/app-updates/update.apk`,
  including package, signer set and increasing build number, then opens Android's installer.

`scripts/withAppUpdates.js` owns build-time installation permission policy. The private
FileProvider exposes only the update cache. JavaScript owns download/checksum handling; the
existing permission owner serializes the install-source settings screen.

New or changed native APIs require a new installation package. See
[SDK provenance](android/libs/README.md) and the
[domestic update guide](../../docs/guides/domestic-store-updates.md) for query lifecycle and SDK
constraints. No vendor credentials live in this module. Store/installer navigation does not
establish installation success.
