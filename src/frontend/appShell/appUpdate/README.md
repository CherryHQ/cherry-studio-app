# Application Updates

`AppUpdateProvider` checks the published `mobile.minSupportedVersion` once per cold launch,
after the startup cover and privacy disclosure. All installed distributions use the same numeric
minimum. A missing key clears the last valid value. If the request fails, the app uses the last
valid minimum saved for this installation. With no known minimum, startup continues normally.

Only an installed native version below the minimum opens the existing update dialog automatically.
The `requiredUpdate` sub-entry exposes that confirmed decision to startup measurement.
Tapping update looks up the current release and starts the usual store or APK flow. Returning from
the store keeps the same dialog and target available. Android offers an exit action. On iOS the
user can leave the app through the system. A published change to the minimum takes effect on the
next cold launch. Publish a higher minimum after all channels have distributed the update.

## Dialog

The centered dialog shows the version, the installed version, and one next step: download (APK) or
open the selected app store; then progress with cancel or continue in background, installation, or
retry. Closing it never stops
a transfer, and reopening it from About shows the transfer's current state. A retry fetches the
latest release, so a replaced or withdrawn package is not downloaded again. Installation explains
that active tasks are interrupted; Android's install-source permission is requested from an alert
when installation requires authorization.

Once a release is selected, the dialog loads its release notes. Notes are cached for six hours per release and language, and for App Store releases per
storefront URL as well. Missing notes omit the region. Dialog children use a portal, so provider hooks
remain outside it. GitCode-backed notes are Markdown; vendor notes are plain text. A second trigger
cannot replace an open prompt.

## Entry

About keeps its single row with an optional `NEW` badge. A tap rechecks the current storefront on
iOS. On Android, a recorded release or an active transfer reopens without a request. Repeated taps
share one check, and up-to-date, unavailable or failed checks are reported with a toast.
Domestic store releases use the same dialog and a generic "Go to app store" action. Query-source
selection and store routing remain in the backend; there is no store chooser or domestic-specific
cache policy. Store-open failures use the existing translated failure toast.

Backend failures map to translated copy; raw diagnostic errors stay out of UI. All supported locales
own the `appUpdate.*` catalog entries.

See the [backend contract](../../../backend/services/appUpdate/README.md) for sources, installation,
lifecycle and native limitations.
