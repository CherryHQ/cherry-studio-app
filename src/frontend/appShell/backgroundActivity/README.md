# Background Activity

This App Shell module owns the iOS Live Activity factories registered during app bootstrap and
Android notification navigation after the Router mounts. `BackgroundActivityBridge` isolates those
subscriptions from the navigator and shows foreground failure/approval toasts for tasks outside the
visible surface. Bootstrap injects the presentation event into the host's environment; backend
services never import frontend code.

Chat and painting surfaces call `useBackgroundTaskNotifications` while their content is available.
On Android it registers the focused foreground task and dismisses only that task's notifications;
blur and drawer coverage release visibility. It reads existing notifications and observes the patched
Expo post-presentation event, so asynchronous background delivery cannot escape the initial read.
An unsubmitted painting edit observes no task until admission replaces its source with a new task id.
Other platforms retain their existing presentation.

These are app-level presentation adapters rather than page components. Android service and
notification delivery lifetimes belong to the backend's
`AndroidBackgroundActivityRuntime`; see [Android Background Generation](../../../../docs/references/android-background-generation.md).
