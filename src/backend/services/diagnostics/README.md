# Diagnostics

`DiagnosticBundleService` owns archive creation, submission, cancellation and cleanup. Frontend
callers use `Backend.diagnostics`. Collection reads selected plugin configuration columns through `backend/data/services/diagnosticPluginState.ts`; it does not read chat tables or
resolve credentials, refresh tokens, connect plugins or make discovery requests.

## Feedback flow

Settings → About → Feedback opens the feedback form page. Shaking captures the visible page first
and opens the same form. The user writes a required description
(at most 4096 UTF-8 bytes after newline normalization), reviews the attached-data notice, and
confirms submission. The same page shows indeterminate progress, then success or a failure.
There is no range selector or file-save step. Desktop's current report
form and IPC schema accept only a description, so Mobile does not invent issue categories.

Submission uses the last 24 hours with logs and traces included. The description draft survives
failure and returning to the form; leaving the form discards it. Submission blocks navigation
back until the operation settles. Retrying from the form creates a fresh archive.

`uploadBundle` takes `DiagnosticReportInput`, which carries the description and optional selected
screenshot ID; the backend validates it. The 24-hour range and the log/trace selection are service constants, recorded in the
manifest. Archives include `feedback.txt` beside the manifest. Description text stays separate from
technical metadata.

Desktop's current Doctor dialog owns checks, local export, and report submission. Its report flow
also has a report URL, server processing status, and local submission history. Mobile implements
the feedback-and-bundle flow, shows the acknowledgement's tracking ID, and provides status lookup
and local submission history through About → Feedback history. Desktop reference:
`CherryHQ/cherry-studio` main commit `0ca0ebaffc`, `src/renderer/components/doctor/DoctorDialog.tsx` and
`src/renderer/components/feedback/DiagnosticUploadPanel.tsx`.

## Feedback history and status

The frontend's existing MMKV-backed `CacheService` persist tier owns
`diagnostics.feedback_history`; no SQLite table or migration is added. Only accepted submissions
create records, containing the report ID, user description, local submission time and last known
processing status. Status checks also retain the server update time and local check time. History
is device-local, starts with submissions made by this flow, and is cleared with the app's persisted
UI cache. It does not retain diagnostic ZIPs. A history-write exception cannot change an accepted
upload into a failed submission.

About → Feedback history lists receipts newest first, 20 per page. Each row shows a one-line
description preview, submission time and processing status. The detail page keeps the preview
to one line; tapping it opens the full original description and last-check time in a scrollable
bottom sheet, leaving the status page more room. Its visible records use
`GET /diagnostics/:id/status` on entry and manual refresh, with a one-minute query freshness window,
no retries and no background polling. The public lookup needs no signing credential. The adapter
validates the matching UUID, documented processing states and timestamps; reads are cancellable,
reject redirects and cap the body at 64 KiB. Transport logs use a redacted path because a tracking
ID is a status-view capability. Network/service errors preserve cached status. A 404 marks the
receipt unavailable without deleting it; a later successful lookup can recover that receipt.

Selecting a record, or View progress after upload, opens an app-owned WebView of the public status
page. The app language is sent in `Accept-Language`; the server owns its Chinese/English page,
processing reply and associated Issue/PR links. The report page and anchors remain embedded;
associated HTTPS GitHub links use the existing in-app browser. Unsupported destinations are
blocked. Page loading/failure/retry and native report-ID copy actions remain usable independently
of the cached status. Completing a web load refreshes that report's cached state. Route identity
and a stable WebView source prevent status writes from reloading the page.

## Collected data

- Warning/error summaries: timestamp, module, fixed message templates and allowlisted error facts.
  Arbitrary messages, stacks, causes and nested payloads are excluded before writing to disk.
- Startup metadata: JS entry, bootstrap, host/service phases, database open/configuration/migrations/
  seeding, cover handoff, theme/i18n, default Agent and skill initialization, first-content readiness,
  minimum cover duration and cover exit. Stages retain starts, terminal outcomes and monotonic
  durations; service phase promotions retain the service, requiring service and old/new phases.
  `startupStartedAt` identifies the JS launch by wall time; `jsEntryStartMs` and `elapsedMs` locate
  each event on the monotonic clock. Available React Native startup/runtime/bundle-entry milestones
  are sampled from `performance.rnStartupTiming`, relative to `performance.timeOrigin`. Missing
  native milestones remain absent; JS events alone do not measure the OS's entire launch interval.
  No preference values, database paths, translated names or route parameters are recorded.
- Model and MCP request metadata from the existing `TraceStorageService`: correlation identifiers,
  operation, timing, outcome, status/error codes and plugin authorization steps. Capture runs
  during ordinary use; there is no developer-mode setting or separate Agent event recorder.
- Durable Agent operation metadata: preparation/admission, recovery and background suspension,
  observation, queue membership/counts, changed turn states, capability execution, transcript and
  checkpoint writes. Pi failure summaries include automatic retry attempts, failed/blocked tasks,
  interrupted tools, extension reports and asynchronous usage delivery failures. Only existing
  observers/inspection/report callbacks supply these facts; the engine database and full event
  payloads are not diagnostic sources. See [AI Diagnostic Tracing](../../ai/observability/README.md).
  Archives retain model failure stage/category/retryability and fixed tool business outcomes, so
  returned errors, partial failures and requests for user choice remain distinguishable.
- System summary: app/build/runtime version, device model, OS and locale. No device name or unique
  hardware identifier is read. Plugin configuration includes server/plugin identifiers, enabled
  state, authorization method and disabled-tool count; no names, accounts, endpoints or credentials.

Chat text, checkpoints, tool arguments/results, request/response bodies, headers, credentials,
raw Agent events and native crash reports are not diagnostic sources. The old text-rule scan is
removed because it depended on those raw messages. Native crash reporting remains owned by the
existing [Sentry integration](../../../frontend/appShell/observability/README.md).

## Storage and collection

The process-owned logger and JS exception/rejection observer are installed before router imports.
They preserve React Native's existing handlers and persist projected warning/error metadata plus
the fixed `Startup` / `Startup stage` info event. Other info logs remain excluded. Startup events
use the same local retention and submission path; they do not add an external reporting channel.
Logs live under `Diagnostics/logs-v1`, rotate at 1 MiB and retain at most 7 days / 20 MiB.
Startup events retain separate records without repetition aggregation, preserving retry timings.
They share a bounded 64 KiB buffer and append together after 100 ms, before crossing a UTC day or
the buffer limit, or on explicit flush. Warning/error writes first drain preceding startup events
in the same append, so fatal exceptions remain synchronous. File inspection and history pruning
start with the first flush, outside the ordinary startup logging call path.
The first matching error is written immediately. Within a 30-second window, repeated records with
matching level/module/template and stable error/context facts are summarized. Request/turn/message
ids, elapsed time, token totals and cumulative storage counters do not split a group; summaries omit
those per-occurrence values. `repetition.count` counts **additional** occurrences, with their first
and last timestamps; add the separately written first record when counting the complete burst.
At most 64 groups are retained in memory, and pending counts are written before a group is evicted.
Fatal exceptions bypass aggregation. Summaries flush on a timer, backgrounding, writer replacement,
and submission; these flushes also drain pending startup events. An abrupt process exit can lose
pending startup events and repeat counts, but not the already written first error occurrence.
Collection limits are upper bounds, not a guarantee of seven days of history.

Request traces retain at most 7 days / 20 MiB / 512 files under `Runtime/trace/v1`. Flushes append to
the current file, rotating at 1 MiB or a UTC day boundary instead of creating a file per request
boundary. The 512-file guard remains for legacy files and exceptional histories. Submission flushes
and copies stable trace snapshots, then releases them on success, failure or cancellation.
Collection projects every record again through an explicit field allowlist and filters by the last
24 hours. A terminal span uses its end timestamp; a running span uses its start.
The 50 MiB source budget favors representation of both sources, then recent files. The manifest
reports unreadable/malformed/changed sources, size omissions and trace storage loss counters.

The ZIP contains `diagnostics.json` (schema version 2), `feedback.txt`, and optional `logs/` and
`traces/` metadata files.
The legacy chat and crash envelopes remain fixed empty and the scan status remains `skipped` for
schema compatibility. Their presence does not enable collection. Plugin configuration is capped
at 200 connections, with truncation reported. The manifest declares `privacy.capture: metadata`
for collected diagnostics.
`privacy.containsUnredactedData` is true because the user-authored feedback is included verbatim
(after trimming and newline normalization); `feedback` identifies its file and user origin.
Technical identifiers can still be private; the form describes the scope before submission.

## Upload

`CherryDiagnosticUploadClient` uses the
[diagnostic upload API](https://github.com/CherryInternal/cherry-studio-ops/blob/main/services/api/docs/API.md#上传诊断包):
`POST https://api.cherry-ai.com/diagnostics`, with no query parameters and exactly the
`description` and `file` multipart fields. The native transport owns the multipart body,
boundary, and matching Content-Type. The ZIP is streamed from disk rather than loaded into JS memory.

Mobile sends one `X-Diagnostics-Source: app` header to classify uploads. It is not a multipart field
and is excluded from the unchanged v2 signature. Both existing native transports forward this
header map, so the source addition requires no native rebuild or extra environment variable.
Deploy the source-aware API first; older service instances ignore this header and classify uploads
as `desktop`. An `invalid_diagnostic_source` rejection maps to submission rejection.

Availability requires the native module's `isUploadConfigured` capability and a provisioned
signing credential. Missing credentials or an older development client return `not_configured`
before collecting data or generating a ZIP. Before uploading, the adapter checks the ZIP's
positive integer size and 100 MiB limit, then hashes the final ZIP and normalized description.
The description remains limited to 4096 UTF-8 bytes; the existing 50 MiB source budget is separate
from the server's archive limit.

Each attempt generates a lowercase UUID v4 Request ID and Unix-second timestamp after hashing.
The v2 signature covers ten newline-separated fields, including the empty query line, ZIP size,
ZIP SHA-256 and description SHA-256, with no trailing newline. Native signing keeps the credential
out of JS, and the transport rechecks the archive's signed size and digest before transfer.
Only a valid `201` acknowledgement with a UUID v4 ID and `pending` status is reported as uploaded.
Missing or malformed acknowledgements, transport errors and replay responses remain uncertain.
Known server errors map from `error.code` first, with HTTP status fallback; concurrency exhaustion
is temporary service unavailability, distinct from the IP frequency limit. Error response text,
request signatures and tracking IDs are not logged. Responses remain bounded to 64 KiB, and
redirects are not followed.

Each upload attempt owns its temporary directory. A `finally` block removes the ZIP on success,
rejection, an uncertain result, an exception, or service cancellation. Preparation failures also
remove staged files. There is no retained ZIP, save-original action, or automatic retry. The form
retains its in-memory description and screenshot selection after a failed attempt; an uncertain
result warns about duplicate reports. `modules/diagnostics` supplies file identity, signing,
foreground upload and cancellation; the
archive hash comes from the file module's shared native hash.

## Build Configuration

The local Expo module, including the upload-configuration capability, requires rebuilding the custom
development client; an OTA JS update alone cannot add it. The module is discovered from Expo's
default `modules/` directory.

`plugins/withDiagnostics.js` provisions the same Cherry client credential from the build
environment variable `CHERRYAI_CLIENT_SECRET`, with `MAIN_VITE_CHERRYAI_CLIENT_SECRET` accepted
for Desktop build-environment parity. It places the value in native application resources, not
Expo's public `extra` configuration. The client ID, secret suffix, and signature field ordering
match the service's mobile signature helper; diagnostic uploads use its v2 field ordering.
No credential is checked into this repository.

## Verification scope

Test cases cover metadata projection, source budgeting/range filtering, snapshot cleanup, plugin
error facts, the v2 request/acknowledgement/error contract and upload lifecycle behavior.
Executing tests, type checks, native builds, device acceptance or a real submission requires
explicit user authorization. A schema-v2
manifest alone does not establish server acceptance of mobile metadata payloads.


## Screenshot attachments

Shake feedback may supply an optional UUID `screenshotId`. Preparation reads only the matching PNG
in the app-owned `FeedbackScreenshots` cache directory, rejects empty files or files above 8 MiB,
and copies it into the attempt directory before asynchronous source collection. The ZIP includes
`screenshot.png` and an explicit `screenshot` manifest entry. The screenshot is not redacted and
may show conversation content; the form previews it and discloses this separately from metadata
collection. Inclusion defaults to off for each report; deselecting or removing it omits the ID
entirely. No screenshot is taken during bundle preparation.
The existing multipart request and signature remain unchanged.
