# Domestic Android Store Updates

One `production-domestic-stores` APK is submitted independently to HONOR, Xiaomi, OPPO, and vivo.
It retains the production package ID and signing credentials, uses its own embedded update
channel, and cannot download or install the public APK. Each store owns download and installation.
The stable-tag release workflow saves this APK as `domestic-stores-release`; it does not upload to
the stores or claim that any store has published it. See [Cloud Releases](./cloud-releases.md).

This guide describes the current manifest-backed implementation. The
[Application Update Design](../references/app-update-design.md) proposes direct client queries for
HONOR, Xiaomi, and vivo, with the manifest as an optional adapter. Those SDK/provider integrations
and the proposed cold-start-only release-note presentation are not implemented yet.

## Client Behavior

The native `app-update` module reads Android's update owner on API 34+, then the installing
package; older Android uses the installer package. It returns only supported stores that can
handle an explicitly targeted listing intent. The manifest declares the five store package names
(OPPO has two), without requesting access to the entire installed-app list.

The app prefers the recorded source. When there is no recognized source and exactly one supported
store is available, it can check that store. With multiple possible stores it offers a manual
choice and does not automatically announce an update. Phone brand alone does not select a store.
The selected source and query cache are scoped to the application process; restart after changing
the installed stores. Before opening a store, native code rechecks its availability.

Store actions use `Intent.setPackage()` and the installed app's package ID. OPPO supports both
`com.heytap.market` and `com.oppo.market`. vivo includes `th_name=self_update`; installation timing
is left to the store because the current vendor documents disagree on the delay parameter. No half-screen, staged-release,
automatic-download permission, or vendor SDK is integrated. Native behavior still needs authorized
acceptance on the relevant vendor devices.

The app reads `EXPO_PUBLIC_DOMESTIC_STORE_VERSIONS_URL`, a public HTTPS URL without query parameters,
credentials, or fragments. Set it in the EAS production environment for both native builds and
compatible OTA publications. It can serve a static file or a read-only API with the same shape.
An unset URL keeps manual store visits available and sends no metadata request. This repository
does not yet contain a deployed collector or hosting integration; a URL alone does not populate it.

Only a fresh, validated publication for the selected store can produce an update offer. Compare
Android's native build number with `versionCode`, including higher builds of the same display
version. Missing, expired, malformed, unavailable, or non-global information never claims that
the app is up to date. Manual checks offer the installed stores instead. Automatic observers ignore
these manual-only results, and cached offers are not reopened after their metadata expires.

## Where The Data Lives

`src/backend` runs inside the phone. Vendor secrets must not be added to it, app config, or
`EXPO_PUBLIC_*` variables.

Choose one existing deployment owner:

- **Existing application server:** a scheduled job queries vendors and stores the latest result;
  a public GET endpoint returns the manifest. App requests read the cache, not vendor APIs.
- **GitHub Actions and existing website/object storage:** a scheduled workflow queries vendors and
  uploads the resulting JSON to a stable public HTTPS address. Actions executes the job; the
  website or storage serves the file. An Actions artifact is for maintainers and is not a public
  update endpoint. No always-running application server or database is needed for this option.

Keep vendor credentials in the server's secret store or GitHub Actions secrets. Keep the deployment
credential separate from vendor credentials. The only data sent to phones is the manifest below.
Verify reachability from supported markets before enabling reminders; do not assume GitHub-hosted
files are a suitable delivery endpoint for mainland China.

## Public Manifest

Illustrative data only; these versions are not a claim about current store listings:

```json
{
  "schemaVersion": 1,
  "packageName": "com.cherryai.cherrystudio_app",
  "stores": {
    "oppo": {
      "status": "published",
      "rollout": "all-supported-devices",
      "versionCode": 201,
      "versionName": "0.6.0",
      "notes": null,
      "checkedAt": "2026-11-02T12:00:00Z",
      "expiresAt": "2026-11-02T13:00:00Z"
    },
    "xiaomi": {
      "status": "unknown",
      "checkedAt": "2026-11-02T12:00:00Z",
      "expiresAt": "2026-11-02T13:00:00Z"
    }
  }
}
```

Store keys are `honor`, `xiaomi`, `oppo`, and `vivo`. Missing entries are unknown. Each entry has its
own UTC `checkedAt` and `expiresAt`; the client permits at most 24 hours between them and allows
five minutes of clock skew for `checkedAt`. Prefer a one-hour validity period, a 15-minute collector
schedule, and a five-minute HTTP cache lifetime. These are deployment recommendations, not an
already configured schedule. The app's domestic query cache uses a 15-minute stale time.

Statuses:

- `published`: requires `rollout: "all-supported-devices"`, a positive integer `versionCode`,
  `versionName` (string or null), and `notes` (plain text or null). This assertion includes the
  support range of this APK; do not emit it for a staged rollout or device-restricted release.
- `unpublished`: vendor evidence establishes that there is no live version. Keep the timestamps;
  omit the publication fields. The app still permits a manual store visit.
- `unknown`: permissions, credentials, response shape, eligibility, or network status are unclear.
  Do not copy a draft or uploaded build into a publication entry.

Use `versionName: null` if the official API returns only the live version code. In particular,
Xiaomi's `versionName` can belong to the submitted package while `onlineVersionCode` belongs to
the live one; only use the name if their version codes match or an independently verified mapping
establishes it. A release tag does not establish a store's live version code.

## Collector Requirements

Before implementing the deployment-specific collector, establish the hosting owner and obtain
each account's API access. Use these official integration paths:

| Store | Credential and query |
| --- | --- |
| HONOR | Obtain an account token using client credentials, resolve the app ID, and read `releaseInfo` from `get-app-detail`; see [self-update guidance](https://developer.honor.com/cn/doc/guides/101564) |
| Xiaomi | Sign the `devupload/dev/query` request using the developer API credentials and RSA public key; use `onlineVersionCode`, not the submitted `versionCode`; see [self-update guidance](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=2007) |
| OPPO | Obtain a token, sign the `selfupdate/query/version` request, and query the account's own package; see the [official cross-vendor document hosted by vivo](https://swsdl.vivo.com.cn/appstore/developer/uploadFile/20260729/zb94ha/安卓厂商自更新通用技术文档.docx) |
| vivo | Sign `gateway/developer/app/publish/v1/get-online-version` using the developer account secret; see [self-update guidance and current attachments](https://dev.vivo.com.cn/documentCenter/doc/240) |

Keep the collection cadence within each vendor's limits; it is shared across all installations.
Validate the package identity and live-release fields. Treat one vendor's failure independently:
publish `unknown` for that vendor, preserve fresh successes for the others, and never extend an
old observation's expiry after a failed query. Write the complete JSON atomically. Retain old
files only for diagnostics, without serving an expired file as newly checked.

Do not update live status when a Git tag is pushed, a build finishes, an APK uploads, or review is
submitted. While API access is pending, a maintainer may verify the live listing in its console
and publish a timestamped entry manually. This also needs an expiry and a responsible owner.

## Rollout And Verification

Native changes require a new APK. Create the EAS `production-domestic-stores` channel and its
same-named branch before publication. The `domestic-stores` OTA target uses this build profile;
the `all` choice includes it and requires a compatible recorded native build, like other targets.

Before distributing an authorized build, cover installer recognition, unknown/ambiguous sources,
disabled or missing stores, OPPO's two package variants, each vendor's detail page, metadata
expiry/failure, same-version higher builds, and APK installation being disabled. Unit sources
cover metadata decisions and manual actions; they do not establish native behavior or account
permissions. Follow [Testing And CI](./testing-and-ci.md) and the task's execution authorization.
