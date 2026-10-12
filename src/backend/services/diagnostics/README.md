# Diagnostics

`DiagnosticBundleService` owns inspection, archive creation, submission, cancellation and
cleanup. Frontend callers use `Backend.diagnostics`. Export reads selected plugin configuration
columns through `backend/data/services/diagnosticPluginState.ts`; it does not read chat tables or
resolve credentials, refresh tokens, connect plugins or make discovery requests.

## Feedback flow

Settings → About → Feedback opens a compact dialog. The user writes a required description
(at most 4096 UTF-8 bytes after newline normalization), reviews the attached-data notice, and
confirms submission. The same dialog shows indeterminate progress, then success or a failure.
There is no range selector or file-save step. Desktop's current report
form and IPC schema accept only a description, so Mobile does not invent issue categories.

Submission uses the last 24 hours with logs and traces included. The description draft survives
failure and returning to the form; closing the dialog discards it. Submission blocks dialog
closure until the operation settles. Retrying from the form creates a fresh archive.

The lower-level export and upload methods both take `DiagnosticReportInput`. Archives include
`feedback.txt` beside the manifest, so an explicitly exported ZIP also preserves the description.
Export remains a backend capability and is not part of the feedback dialog. The backend validates
the same input for saving and uploading. Description text stays separate from technical metadata.

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

About → Feedback history lists receipts newest first, 20 per page. Its visible records use
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
- Model and MCP request metadata from the existing `TraceStorageService`: correlation identifiers,
  operation, timing, outcome, status/error codes and plugin authorization steps. Capture runs
  during ordinary use; there is no developer-mode setting or separate Agent event recorder.
- System summary: app/build/runtime version, device model, OS and locale. No device name or unique
  hardware identifier is read. Plugin configuration includes server/plugin identifiers, enabled
  state, authorization method and disabled-tool count; no names, accounts, endpoints or credentials.

Chat text, checkpoints, tool arguments/results, request/response bodies, headers, credentials,
raw Agent events and native crash reports are not diagnostic sources. The old text-rule scan is
removed because it depended on those raw messages. Native crash reporting remains owned by the
existing [Sentry integration](../../../frontend/appShell/observability/README.md).

## Storage and export

The process-owned logger and JS exception/rejection observer are installed before router imports.
They preserve React Native's existing handlers and persist only projected warning/error metadata.
Logs live under `Diagnostics/logs-v1`, rotate at 1 MiB and retain at most 7 days / 20 MiB.
The first matching error is written immediately. Within a 30-second window, repeated records with
matching level/module/template and stable error/context facts are summarized. Request/turn/message
ids, elapsed time, token totals and cumulative storage counters do not split a group; summaries omit
those per-occurrence values. `repetition.count` counts **additional** occurrences, with their first
and last timestamps; add the separately written first record when counting the complete burst.
At most 64 groups are retained in memory, and pending counts are written before a group is evicted.
Fatal exceptions bypass aggregation. Summaries flush on a timer, backgrounding, writer replacement,
and inspection/export. An abrupt process exit can lose pending repeat counts, but not the already
written first occurrence. Collection limits are upper bounds, not a guarantee of seven days of history.

Legacy `Diagnostics/logs`, `Diagnostics/traces` and `Diagnostics/crashes` are removed at startup;
the new collector never reads those paths, even if cleanup fails.

Request traces retain at most 7 days / 20 MiB / 512 files under `Runtime/trace/v1`. Flushes append to
the current file, rotating at 1 MiB or a UTC day boundary instead of creating a file per request
boundary. The 512-file guard remains for legacy files and exceptional histories. Inspection and
export flush and copy stable trace snapshots, then release them on success, failure or cancellation.
Export projects every record again through an explicit field allowlist and filters by the selected
24-hour, 3-day or 7-day range. A terminal span uses its end timestamp; a running span uses its start.
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
Technical identifiers can still be private; the dialog describes the scope before submission.

## Save and upload

`CherryDiagnosticUploadClient` uses the
[diagnostic upload API](https://github.com/CherryInternal/cherry-studio-ops/blob/main/services/api/docs/API.md#上传诊断包):
`POST https://api.cherry-ai.com/diagnostics`, with no query parameters and exactly the
`description` and `file` multipart fields. The native transport owns the multipart body,
boundary, and matching Content-Type. The ZIP is streamed from disk rather than loaded into JS memory.

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
remove staged files. There is no retained ZIP, save-original action, or automatic retry. Only the
in-memory description survives a failed attempt; an uncertain result warns about duplicate reports.
Explicit exports remove the temporary original after the system picker finishes and leave the
user-selected destination intact.

`modules/diagnostics` supplies file identity, hashing, signing, foreground upload, cancellation
and system saving. iOS uses a document export picker and Android uses `ACTION_CREATE_DOCUMENT`.
Saving succeeds only after the native destination operation completes.

## Build Configuration

The local Expo module, including the upload-configuration capability, requires rebuilding the custom
development client; an OTA JS update alone cannot add it. The module is discovered from Expo's
default `modules/` directory.

`plugins/withDiagnostics.js` provisions the same Cherry client credential from the build
environment variable `CHERRYAI_CLIENT_SECRET`, with `MAIN_VITE_CHERRYAI_CLIENT_SECRET` accepted
for Desktop build-environment parity. It places the value in native application resources, not
Expo's public `extra` configuration. The client ID, secret suffix, and signature field ordering
match the service's mobile signature helper; diagnostic uploads use its v2 field ordering.
No credential is checked into this repository. Local saving requires no upload credentials.

## Verification scope

Test cases cover metadata projection, source budgeting/range filtering, snapshot cleanup, plugin
error facts, the v2 request/acknowledgement/error contract and upload/save lifecycle behavior.
Executing tests, type checks, native builds, device acceptance or a real submission requires
explicit user authorization. A schema-v2
manifest alone does not establish server acceptance of mobile metadata payloads.
