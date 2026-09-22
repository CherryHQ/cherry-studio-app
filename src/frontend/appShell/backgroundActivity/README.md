# Background Activity

This App Shell module owns the iOS Live Activity factories registered during app bootstrap and
local-notification navigation after the Router mounts, on every platform that raises task
notifications. `BackgroundActivityBridge` connects navigation and foreground failure/approval
toasts. Bootstrap injects presentation events into the host's environment; backend services never
import frontend code.

Chat and painting surfaces use `useBackgroundTaskNotifications` to register the visible task and
acknowledge its notifications on Android. Registering the visible task is platform-blind: its deep
link is what retires an already-seen Live Activity or notification, through the port bootstrap
injects as `subscribeVisibleTask`.

Surface lifecycle — when a surface exists, what retires it, and how many a destination may show —
belongs to [Background Activity Presentation](../../../../docs/references/background-activity-presentation.md).
Android execution and notification delivery belong to the backend's `AndroidBackgroundActivityRuntime`.
See [Android Background Generation](../../../../docs/references/android-background-generation.md)
for notification behavior and [Navigation And Insets](../../../../docs/references/navigation-and-insets.md)
for task and draft route identity.
