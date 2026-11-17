# App Icon

`AppIconRuntime` automatically follows the selected account space on supported installation
packages. There is no user setting or separately persisted icon preference. Bootstrap supplies the
selected profile registry and the native SystemIntegration methods. Cloud enterprise and private
profiles select enterprise; community selects community. Session expiry alone does not select
another profile.

The runtime serializes icon operations, reads the actual system icon, and rechecks the selected
profile after an asynchronous change. Account activation requests best-effort synchronization
before reloading JavaScript; failure does not block account activation. Startup and
foreground return reconcile the actual native icon against the current profile and retry failed
changes. Bootstrap starts and stops foreground observation, while the installation object remains
independent of database generations.

The system capability is read from the installed binary, so old clients and domestic Android
packages without alternate launchers skip synchronization. Android switches only aliases,
preserving MainActivity for OAuth callbacks, notifications, and other deep links. API 33+ switches
aliases atomically; earlier systems enable the destination first. Launcher refresh and process
behavior are platform-controlled and need authorized device acceptance.

`scripts/withAppIcons.js` prepares opaque 1024px iOS artwork and Android adaptive/legacy resources
from the official desktop enterprise PNG. It fills transparent corners with the original enterprise
blue and keeps Android artwork inside the adaptive-icon safe area. iOS declares the alternate set
through Xcode's asset-catalog build setting, leaving Xcode to generate icon plist declarations.
The system retains its icon-change notice. Native launch-screen and notification artwork are not
changed by this workflow.

Returning to a community space restores the community icon automatically. Domestic Android
distributions keep their original launcher pending channel-specific clarification. These native
resources and methods require a new installation package; OTA alone cannot add them.

References: [Apple alternate icons](https://developer.apple.com/documentation/xcode/configuring-your-app-to-use-alternate-app-icons),
[Google Play device changes](https://support.google.com/googleplay/android-developer/answer/17006354?hl=en).
