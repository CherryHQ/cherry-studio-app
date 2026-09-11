# Background Activity

This App Shell module owns the iOS Live Activity factories registered during app bootstrap and
Android notification navigation after the Router mounts. `BackgroundActivityBridge` connects
navigation and foreground failure/approval toasts. Bootstrap injects presentation events into the
host's environment; backend services never import frontend code.

Chat and painting surfaces use `useBackgroundTaskNotifications` to register the visible task and
acknowledge its notifications on Android.

Android execution and notification delivery belong to the backend's `AndroidBackgroundActivityRuntime`.
See [Android Background Generation](../../../../docs/references/android-background-generation.md)
for notification behavior and [Navigation And Insets](../../../../docs/references/navigation-and-insets.md)
for task and draft route identity.
