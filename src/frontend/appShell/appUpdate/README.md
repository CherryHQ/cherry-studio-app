# Application Updates

This app-shell module owns update presentation across the application. `AppUpdateProvider` exposes
shared actions; `AppUpdateObserver` handles passive discovery/reminders; `AppUpdateSection` is the
reusable entry currently rendered by About. Pages do not own channel decisions or transfers.

The observer checks after bootstrap without blocking startup. Each cold launch checks again;
returning to the foreground refreshes results older than six hours. Query keys include the channel.
About reads the recorded result without starting a request and keeps `NEW` when a later refresh
fails. Manual checks fetch fresh data when no newer release is recorded.

After the startup cover is gone and the app is active, a newer release produces a ten-second toast
with a View update action. Each release is reminded at most once per 24 hours using frontend persist
cache. No automatic result opens a modal, downloads an APK, or reloads an active conversation.

The shared decision opens the store for store builds or starts the backend's APK transfer after
confirmation. About shows progress, cancellation, verification, retry and installation using
CherryUI. Transfer completion/failure receives one foreground toast, including when it completes
while the app is in the background. The progress subscription stays in the section/observer and does
not rerender the About page or navigation tree.

Installing requires an explicit decision that explains active tasks will be interrupted. If Android
needs install-source authorization, the user explicitly opens settings and returns before the
installer is opened. Backend failures map to translated copy; raw diagnostic errors stay out of UI.
All supported locales own the `appUpdate.*` catalog entries.

See the [backend contract](../../../backend/services/appUpdate/README.md) for sources, installation,
lifecycle and native limitations.
