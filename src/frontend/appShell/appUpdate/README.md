# Application Updates

This app-shell module owns update presentation across the application. `AppUpdateProvider` exposes
shared actions and renders the one `AppUpdateDialog`; `AppUpdateObserver` runs the startup check and
the cold-start offer; `useAppUpdateEntry` gives a page the state for an ordinary "check for updates"
row. Pages render that row with their own settings components and do not own channel decisions,
transfers or update UI.

The observer checks after bootstrap without blocking startup. Each cold launch checks again;
returning to the foreground refreshes results older than six hours. Query keys include the channel.

## Cold-Start Offer

Only the first check result of a launch may open the dialog, and only when the user is on the plain
landing chat: after the startup cover hides, while the app is active and no privacy decision is
pending. A launch that opens a shared draft, a notification's session, another route, or a pending
privacy disclosure keeps its destination; that launch does not offer the release later. An Android
share opens the plain landing chat and reaches its draft only after its attachments import, so a
share still importing counts as a shared draft. Foreground
refreshes never open the dialog. A release is offered at most once per 24 hours through frontend
persist cache, and any presentation of the dialog, including a manual check, counts as the offer.
There are no passive update toasts.

## Dialog

The centered dialog shows the version, the installed version, the release notes for the channel in a
bounded scrolling region, and one next step: download (APK), open App Store or open Google Play;
then progress with cancel or continue in background, installation, or retry. Closing it never stops
a transfer, and reopening it from About shows the transfer's current state. A retry fetches the
latest release, so a replaced or withdrawn package is not downloaded again. Installation explains
that active tasks are interrupted; Android's install-source permission is requested from an alert
after the dialog closes.

Release notes load when the dialog opens, one query per release and UI language. Dialog children
render through a portal outside the app providers, so the query and font-size preference are read
outside the dialog and its children only receive values. APK notes are Markdown; store notes are
plain text. Google Play publishes none to the app, so the dialog states that the store has an
update. A missing note never blocks the update.

## Entry

About keeps its single row with an optional `NEW` badge. A tap opens the dialog for a recorded
release or an active transfer without a request; otherwise it checks once, sharing one request and
outcome across repeated taps, and reports up-to-date, unavailable or failed checks with a toast.

Backend failures map to translated copy; raw diagnostic errors stay out of UI. All supported locales
own the `appUpdate.*` catalog entries.

See the [backend contract](../../../backend/services/appUpdate/README.md) for sources, installation,
lifecycle and native limitations.
