# Health Access

This local Expo module owns read authorization and Health Connect settings navigation. The root
`modules` directory is Expo's local native-module discovery location; it contains only the native
bridge required by `src/backend/services/permissions/DevicePermissions.ts`. Agent approval, settings
presentation, and health data queries stay with their existing application owners.

The module requests the eight read types declared in `src/shared/contracts/permissions.ts`; it
does not request health writing, background reading, or extended history access. Android uses the
same Health Connect client version as `react-native-nitro-healthkit`, which still owns data queries.

On Android 14+, authorization awaits Expo's runtime permission callback; earlier versions use the
Health Connect activity result. Expo's activity-result registry does not forward runtime permission
results, so these paths must stay separate. Both paths read actual grants per type.
Local history records only requests and consecutive denials, allowing a retry after the
first denial and directing subsequent attempts to settings after the second. Health Connect's
permission-usage activities open the in-app health explanation with the current build's scheme.
Management opens the SDK's public Health Connect settings entry point. The per-app permission
management activity can require a system-only grant permission on newer Android versions.

On iOS, HealthKit exposes whether authorization needs to be requested, never whether reading was
allowed. A completed inquiry is `requested`, not `granted`; an empty query cannot distinguish
denial from no records. Permission management instructions point users to Apple Health.

Native changes require a new development build. JavaScript updates alone cannot install this
bridge; an older client reports `native-unavailable` rather than claiming the device lacks health
support.
