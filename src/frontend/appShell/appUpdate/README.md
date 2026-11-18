# Application Updates

This app-shell module owns update presentation across the application. `AppUpdateProvider` exposes
shared actions and renders `AppUpdateDialog`; `AppUpdateObserver` runs the startup check and
the cold-start offer; `useAppUpdateEntry` gives a page the state for an ordinary "check for updates"
row. Pages render that row with their own settings components and do not own channel decisions,
transfers or update UI.

The observer checks after bootstrap, privacy consent and foreground activation without blocking
startup. Each cold launch checks again; returning to the foreground refreshes results older than
six hours. Query keys include the channel.

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

The centered dialog shows the version, the installed version, and one next step: download (APK) or
open the selected app store; then progress with cancel or continue in background, installation, or
retry. Closing it never stops
a transfer, and reopening it from About shows the transfer's current state. A retry fetches the
latest release, so a replaced or withdrawn package is not downloaded again. Installation explains
that active tasks are interrupted; Android's install-source permission is requested from an alert
after the dialog closes.

Every open dialog loads and displays release notes, including manual checks, retries and transfer
reopen. The notes query is keyed by release and language with six-hour freshness, so reopening can
reuse cached notes. Missing notes omit the region. Dialog children use a portal, so provider hooks
remain outside it. GitCode-backed notes are Markdown; vendor notes are plain text. A second trigger
cannot replace an open prompt.

## Entry

About keeps its single row with an optional `NEW` badge. A tap opens the dialog for a recorded
release or an active transfer without a request; otherwise it checks once, sharing one request and
outcome across repeated taps, and reports up-to-date, unavailable or failed checks with a toast.
Domestic store releases use the same dialog and a generic "Go to app store" action. Query-source
selection and store routing remain in the backend; there is no store chooser or domestic-specific
cache policy. Store-open failures use the existing translated failure toast.

Backend failures map to translated copy; raw diagnostic errors stay out of UI. All supported locales
own the `appUpdate.*` catalog entries.

See the [backend contract](../../../backend/services/appUpdate/README.md) for sources, installation,
lifecycle and native limitations.
