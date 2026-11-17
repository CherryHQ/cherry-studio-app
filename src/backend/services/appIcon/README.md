# App Icon

`AppIconRuntime` makes supported launcher icons follow the active account space: cloud enterprise
and private profiles select enterprise, community selects community. There is no setting or stored
preference. Bootstrap starts it after the host is ready; startup and every foreground return compare
the actual system icon with the active profile and change it when they differ. Switching spaces
reloads JavaScript, so the next startup applies the new space. Failures are logged and retried on
the next foreground.

- iOS uses the `Enterprise` alternate icon set and keeps the system change notice.
- Android keeps the real activity as `MainActivityHost`, always enabled for deep links,
  notifications and reloads, and switches two launcher aliases. The community alias keeps the
  shipped `.MainActivity` name so existing home-screen entries survive upgrades. Switching requires
  Android 10+, because older Launcher3 deletes home-screen entries of a disabled alias.
- Google Play and domestic packages report switching unavailable through manifest metadata. They
  still declare the aliases: domestic packages share the APK signing key and can replace an APK
  installation whose enterprise alias is active.

`scripts/withAppIcons.js` generates opaque 1024px iOS artwork and Android adaptive/legacy resources
from `assets/enterprise-icon.png`, and restores Expo's MainActivity manifest shape before a
non-clean prebuild.

References: [Apple alternate icons](https://developer.apple.com/documentation/xcode/configuring-your-app-to-use-alternate-app-icons),
[Google Play device changes](https://support.google.com/googleplay/android-developer/answer/17006354?hl=en).
