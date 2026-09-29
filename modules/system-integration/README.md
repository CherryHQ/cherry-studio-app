# System Integration

This local Expo module owns Cherry Mobile's native share boundary. Frontend code uses
`Backend.systemEntry`; it never imports this module directly. See the
[architecture and behavior contract](../../docs/references/system-integration-design.md).

## Native targets

- Android: `ShareReceiverActivity` receives text, links, images, and files.
- iOS: `CherryShareExtension` supports iOS 17 and stages shares in the app group.

`scripts/withSystemIntegration.js` configures the iOS share extension, its resources, and its
App Group entitlement. The Android activity is registered by the local Expo module. These
native changes require a new custom development client; an OTA update or Expo Go cannot add them.

## Share storage and lifecycle

Staged shares may be kept for 24 hours. Limits are 131,072 UTF-16 text units, 10 attachments,
25 MiB per attachment, and 50 MiB total. Files are copied while source access is valid; links are
not fetched. Native stores keep files in private staging directories, and `entrySchema.ts`
validates every versioned envelope again before the backend accepts it.

Claiming a share imports its attachments into the file library and then releases native staging,
so an attachment belongs to the library exactly as a picked one does. An interrupted import leaves
the share staged for a later claim, which re-imports every attachment. Route parameters contain
only in-memory handoff handles; shared text and file paths never enter URLs or saved navigation
state.

iOS uses `group.<bundle-id>.system-integration`. Shared files use complete file protection and are
excluded from backup. Android uses `noBackupFilesDir`.

## Acceptance

Before release, authorize and perform native builds and device checks for cold and warm share
delivery, attachment limits, expiry cleanup, App Group provisioning, Agent switching with a seeded
draft, and sending. Run the focused system-entry and native-envelope suites when verification is
authorized.
