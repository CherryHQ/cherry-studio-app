# Domestic Android Store Updates

One `production-domestic-stores` APK is submitted separately to HONOR, Xiaomi, OPPO and vivo.
It retains the production package ID and signing credentials, has its own embedded update channel,
and disables direct APK downloads and installation. The stable-tag workflow saves the APK,
checksum and signing identity as `domestic-stores-release`; each store owns review, publication
and installation. Follow the
[per-release upload and archiving procedure](./cloud-releases.md#manual-domestic-store-upload).

## Checks And Store Actions

Use the store's client query when one is integrated; otherwise reuse `checkApkRelease` with the
`gitcode` source.
The update action always opens the device's app store. The native module resolves one store from
Android's installation/update source, falling back to device brand/manufacturer. The update module
reads this target once when created; there is no store list or runtime source-switching workflow.

| Store | Version check |
| --- | --- |
| HONOR | Official `UpdateCallAPI.checkUpdateFromAppMarket`, SDK 16.0.18.301. Code 0 reports a target; 1 means no update. |
| Xiaomi | Official `XiaomiUpdateAgent.update(context, false)`, SDK 4.2.4, with automatic popups disabled. Reads update/no-update callbacks. |
| vivo | The local `com.bbk.appstore.self_update_query` provider and its result broadcast. Only documented code 0 confirms an update. |
| OPPO | Existing GitCode stable-release query. The authenticated server API is outside this client-only flow. |

Vendor queries compare the target native build number, so a higher build of the same display
version is an update. GitCode retains its existing stable-version comparison and release validation.
Its result describes the project's published version, not the store's live listing; the store
ultimately determines which version can be installed. The GitCode result is converted to a store
action without APK URLs or a fabricated native build number.

Checks use the existing `available`, `upToDate` and `unavailable` results. Failed requests and
invalid responses never become up-to-date assertions or automatic navigation. An available result
uses the existing update dialog with one generic **Go to app store** button. No public version
manifest, collector, hosting, vendor credentials or extra environment variable is needed.

The native action opens the resolved store's listing after checking that it can handle the intent.
OPPO supports both `com.heytap.market` and `com.oppo.market`. Only full-release queries and updates
are supported. Opening a store does not claim installation success.

## Shared Presentation And Lifecycle

Domestic checks reuse the normal channel query cache and six-hour stale time. Cold-start checks
wait for privacy consent and foreground activation. Every open update dialog reads and displays
release notes, including manual checks and transfer reopen. GitCode-backed notes
reuse the existing Chinese/English release-note reader. `notesSource` identifies GitCode or vendor
notes explicitly; vendor build numbers stay inside backend comparison.

Native queries have a 15-second deadline. Cancellation/disposal releases request waiters and vivo
receivers. Xiaomi's process-global listener drains an abandoned request before accepting another,
so a late callback cannot settle a newer request. Package visibility covers only supported stores
and vivo's provider. See [SDK provenance](../../modules/app-update/android/libs/README.md).

## Delivery Status

Native integrations are implemented in source and require a new installation package. Tests,
compilation and vendor-device acceptance have not been run for this change. Existing EAS domestic
channel setup is retained; no build, OTA publication or store submission is performed here.
Follow [Testing And CI](./testing-and-ci.md) and the current task's execution authorization.
