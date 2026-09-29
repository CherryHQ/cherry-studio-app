# Health Access

This local Expo module owns HealthKit read authorization. The root `modules` directory is Expo's
local native-module discovery location; it contains only the native bridge required by
`src/backend/services/permissions/DevicePermissions.ts`. Agent approval, settings presentation, and
health data queries stay with their existing application owners.

The module requests the eight read types declared in `src/shared/contracts/permissions.ts`; it
does not request health writing, background reading, or extended history access. Health is
iOS-only: the module has no Android implementation, and Android reports health as `unsupported`.

HealthKit exposes whether authorization needs to be requested, never whether reading was allowed. A
completed inquiry is `requested`, not `granted`; an empty query cannot distinguish denial from no
records. Permission management instructions point users to Apple Health.

Native changes require a new development build. JavaScript updates alone cannot install this
bridge; an older client reports `native-unavailable` rather than claiming the device lacks health
support.
