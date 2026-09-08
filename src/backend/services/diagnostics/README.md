# Diagnostics

`DiagnosticBundleService` is the mobile counterpart of Desktop's service at commit
`ea2f6bc3befd7a028c2e2b2a4310e5cceba1b676`. The application host owns its operation mutex,
inspection queue, retained uploads, cancellation, and cleanup. Frontend callers use
`Backend.diagnostics`; entity reads stay in `backend/data/services/diagnosticChatRecords.ts`.

## Desktop Contract

- Ranges are 24 hours, 3 days, and 7 days. Logs and persisted traces default on; chat records
  default off. System information and native crash-report inventory are always included.
- Raw selected data is not redacted. The screen requires the Desktop privacy acknowledgement.
- The 50 MiB source selector preserves source representation before filling with recent data.
  Chat context is counted and written once. Bad JSONL lines, changed/unreadable sources, and
  omissions are represented in the manifest.
- The archive contains `diagnostics.json` with schema version 2, `logs/`, `traces/`, optional
  `chats/agent-sessions.jsonl` and `chats/agent-session-messages.jsonl`, and, when logs are
  selected, `scan/findings.json`. Mobile has no separate Desktop topic/message tables.
- `sourceSelection.ts`, the scan engine, scan rules, and the scan parser follow the referenced
  Desktop implementation. Scan text limits affect the matching report only; raw exported logs
  are unchanged. Scan failure does not block the archive.
- Upload uses the existing `POST https://api.cherry-ai.com/diagnostics`, v2 HMAC headers, a
  normalized description of at most 4096 UTF-8 bytes, a 100 MiB ZIP limit, a 64 KiB response
  limit, and a 15-minute timeout. Redirects are not followed. There is no automatic retry.
- A readable successful response with a nonempty `id` is `uploaded`. Network interruption or
  an unreadable success acknowledgement is `submission_unknown`; known rejection is
  `submission_failed`. Retrying binds the same ZIP and description to a new signed request.

## Mobile Adapters

Export and upload share one mobile screen with the existing privacy acknowledgement. The screen
offers direct upload, retry, and system saving; it has no manual feedback-form entry.

The app entry installs a process-owned logger and JS exception/rejection observer before router
imports. The writer opens and closes each append, so startup errors do not depend on SQLite or a
ready application host. Logs rotate at 10 MiB, with 30 days for normal logs and 60 days for
warning/error logs. React Native's existing exception handler remains in the chain, and its
development rejection-reporting callbacks are preserved. Explicit bootstrap failures are logged.
Pi provider failures are recorded with their original diagnostics and response details before
the runtime converts them to the existing public error contract.

`TraceStorageService` reads `app.developer_mode.enabled` once at startup. It persists actual
Mobile Agent events in Desktop's span envelope, including the complete event attribute, even
when no chat screen subscribes. These are mobile Agent observations, not Desktop provider or
Claude Code OTLP spans. There is no reconstruction of historical traces during export. The
initial mobile producer stores daily event files; Desktop's per-container trace rewriting and
viewer are not mobile capabilities.

`modules/diagnostics` supplies file identity, SHA-256, signing, native crash inventory sources,
document export, and file-backed upload. Expo's current FormData implementation materializes
attachments into JS memory, so this streaming transfer has its own native adapter instead of
the non-streaming `services/http` transport. iOS streams a temporary multipart file through
URLSession; Android streams through HttpURLConnection. Neither uses a background upload session.

- iOS exports through `UIDocumentPickerViewController(forExporting:asCopy:)`. Only its successful
  document callback means saved. MetricKit supplies delayed OS diagnostic reports; delivery and
  report time granularity are controlled by iOS.
- Android uses `ACTION_CREATE_DOCUMENT` and reports saved only after copying and closing the
  destination stream. A local Java exception observer delegates to Android's original handler.
  Android 11+ also supplies historical native crash/ANR process-exit information. Earlier
  Android versions cannot supply that OS history.
- Crash report files remain local; only their timestamps and sizes enter the ZIP.
- After fallback saving, mobile retains the internal original for retries because a system
  destination URI does not guarantee future read permission. Success, discard, or application
  host disposal removes that internal copy. User-saved files are never removed by this cleanup.
  Retained upload state is process-local, as on Desktop.

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

## Validation

Focused test cases cover description encoding, caller-data preservation, source budgeting, raw
line reading, snapshot interruption, export completion, and upload status/signature handling.
Changed TypeScript/JavaScript files passed Oxlint and Expo Lint and were formatted with Oxfmt;
Swift sources were formatted with swift-format. Tests and type checks were not run. Native
compilation, device acceptance, and a real service submission were not run and require explicit
authorization. A schema-v2
manifest does not by itself establish server acceptance of mobile system/chat payloads.

Device acceptance should cover system save success/cancel/failure, app-background interruption,
raw content preservation, developer-mode restart behavior, report-ID acknowledgement, rejected
and unknown uploads, digest-preserving retry, and cleanup that leaves user-saved files intact.
