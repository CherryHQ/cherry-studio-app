# Diagnostics

`DiagnosticBundleService` owns inspection, archive creation, upload retries, cancellation and
cleanup. Frontend callers use `Backend.diagnostics`. Export reads selected plugin configuration
columns through `backend/data/services/diagnosticPluginState.ts`; it does not read chat tables or
resolve credentials, refresh tokens, connect plugins or make discovery requests.

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

The ZIP contains `diagnostics.json` (schema version 2), optional `logs/` and `traces/` metadata files.
The legacy chat and crash envelopes remain fixed empty and the scan status remains `skipped` for
schema compatibility. Their presence does not enable collection. Plugin configuration is capped
at 200 connections, with truncation reported. The manifest declares `privacy.capture: metadata`.
Technical identifiers can still be private; the screen describes the scope before export/upload.

## Save and upload

Upload uses `POST https://api.cherry-ai.com/diagnostics`, v2 HMAC headers, a normalized description
of at most 4096 UTF-8 bytes, a 100 MiB ZIP limit, a 64 KiB response limit and a 15-minute timeout.
There is no background upload or automatic retry. An unreadable success acknowledgement or network
interruption remains `submission_unknown`; a known rejection is `submission_failed`.

`modules/diagnostics` provides file identity, SHA-256, signing, system saving and file-backed upload.
iOS uses a document export picker and URLSession; Android uses `ACTION_CREATE_DOCUMENT` and
HttpURLConnection. Saving succeeds only after the native destination operation completes.
Retries reuse the original ZIP and description. Success, discard or host disposal removes the
internal original; user-saved copies remain. Retained upload state is process-local.

## Build Configuration

The local Expo module requires rebuilding the custom development client; an OTA JS update alone
cannot add it. The module is discovered from Expo's default `modules/` directory.

`plugins/withDiagnostics.js` provisions the same Cherry client credential from the build
environment variable `CHERRYAI_CLIENT_SECRET`, with `MAIN_VITE_CHERRYAI_CLIENT_SECRET` accepted
for Desktop build-environment parity. It places the value in native application resources, not
Expo's public `extra` configuration. The client ID, secret suffix, and signature field ordering
match Desktop. No credential is checked into this repository. A build without the credential
can export locally; upload returns `authentication_failed` and retains the bundle for retry or
system saving.

## Verification scope

Test cases cover metadata projection, source budgeting/range filtering, snapshot cleanup, plugin
error facts and upload/save lifecycle behavior. Executing tests, type checks, native builds,
device acceptance or a real submission requires explicit user authorization. A schema-v2
manifest alone does not establish server acceptance of mobile metadata payloads.
