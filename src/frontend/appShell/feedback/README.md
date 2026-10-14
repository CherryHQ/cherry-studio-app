# Shake Feedback

The app shell owns foreground motion observation and the temporary screenshot handoff. The
settings page owns the feedback form and submission. Manual entries use the same `/settings/about/feedback/new`
route, without taking a screenshot.

Settings → Privacy → Shake to give feedback controls the device-local preference
`app.feedback.shake_enabled`, which defaults to false. Enabling waits for the preference write to
succeed before observing motion. Disabling removes the subscription and invalidates any pending
capture. Restore preserves the target device's choice instead of importing another device's opt-in.
Manual feedback remains available regardless of this preference.

## Permission boundary

This feature reads live raw acceleration only. Apple's current [device sensor permission table](https://developer.apple.com/documentation/technologyoverviews/device-sensors)
marks accelerometer/gyroscope device-motion data as not requiring permission. It does not use
pedometer, motion recording, activity recognition, or health APIs. Android's accelerometer at our
20 Hz rate requires no runtime permission; [high sampling rate permission](https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview#sensors-rate-limiting)
applies above 200 Hz. Do not request Motion & Fitness or Activity Recognition just to manufacture
a permission prompt for this feature. Raw acceleration is used in memory and is neither stored nor
included in feedback uploads.

The feature switch is an app preference, not an OS authorization status. It therefore does not add
a synthetic permission to `DevicePermissions`. If a future feature uses an OS-protected sensor API,
its status and serialized request flow belong in that existing permission owner, with contextual
requests and denied-state recovery. Hardware/module absence remains separate from permission denial.

## Capture lifecycle

The local diagnostics module emits acceleration in g at 20 Hz on iOS and Android while observed.
Two separate peaks over 2.5 g within 100–600 ms trigger capture, with a two-second cooldown. A
single bump or sustained acceleration does not trigger feedback. The hook unsubscribes while
inactive, during onboarding or the privacy disclosure, and on the feedback form. Native lifecycle
listeners also stop sensors in the background. Devices without an accelerometer and old clients
without the capability retain manual feedback.

Capture finishes before navigation. Repeated shakes cannot overlap capture or open duplicate
forms. Switching routes, backgrounding, or unmounting invalidates pending capture and deletes its
late result. A capture failure still opens the form and explains the missing image.

The screenshot is copied from view-shot's temporary file to a UUID-named PNG under the app cache.
Only the ID crosses the diagnostics contract. The form previews the screenshot, explains that its
visible content will be shared, and allows removal. Nothing uploads until Submit. Removal, leaving
the form, or app-shell disposal deletes the draft image. Backend preparation copies the chosen
image before collecting diagnostics; each upload attempt deletes its own staged copy. A failed
submission keeps the draft image for an explicit retry.

Native changes require a rebuilt custom client. Device acceptance must cover actual shakes,
capture-before-navigation, repeat shakes, foreground/background, cancel/back, image removal,
submission/retry, and light/dark form layout on both platforms. In development builds, turn off the
Expo developer menu's shake gesture before testing so it does not cover the captured page; production
builds do not contain that menu. Simulator menu commands that simulate UIKit shake events do not
produce accelerometer samples; use sensor input or physical-device verification for detection.
