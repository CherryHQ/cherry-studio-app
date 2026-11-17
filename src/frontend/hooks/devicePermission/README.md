# Device permission actions

Settings and first-use onboarding share the original settings permission configuration and action
through this public module. `permissionConfig` retains the original request scopes, including all
health scopes. `useDevicePermissionAction` owns the existing request/retry/settings action, Health
management instructions, error feedback and per-item pending state. Each caller owns its UI.
The `devicePermission/permissionConfig` sub-entry exposes the pure configuration/status rules
without loading the action hook's UI feedback dependencies.

`useDevicePermissionStatuses` remains the shared focus/foreground status reader. Native prompts are
serialized by the backend `DevicePermissions`; this module does not replace that queue or release it
before native settlement.
