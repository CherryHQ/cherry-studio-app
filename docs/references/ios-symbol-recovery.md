# iOS symbol recovery records

For a historical EAS cloud build, run `bash scripts/verifyEasIosSymbols.sh <build-id>`
from the release checkout with authenticated EAS access. The command downloads the original
recovery archive when EAS still retains it and invokes the same verifier as the local archive flow.
With the release's Sentry credentials configured, append `--retry-upload` to retry the symbol upload
for that build.

## Build 59

As of 2026-11-17, the matching original main dSYM for iOS 0.6.0 build 59 is unavailable in the documented searches; no repair upload was performed. The issue reports EAS build `0d597a16-b6ff-4429-8e74-aca9960f9e8b`, source `1e1bc7acbe0e23dbde016b0e97976f24651c487f`, [Actions run 44035114046](https://github.com/CherryHQ/cherry-studio-app/actions/runs/44035114046), and main executable UUID `c82992fb-86a8-3d5e-847c-bb9132aa9dd3` (issue-reported). The widget and share UUIDs are `unknown`; their reported full-debug status is unverified. The reported identities and Sentry state were not independently re-extracted or queried in the documented searches.

The search report dated 2026-11-17 found no matching original dSYM in bounded searches of available build checkouts, repository checkouts and retained investigation artifacts, Xcode Archives, and selected local archive and intake locations; some paths were permission-denied and a wider scan was interrupted. This does not rule out another copy: authenticated EAS inspection and the reporter's local release archive remain outstanding leads.

The shipped binary keeps its identity; a rebuild cannot repair it. The Actions deadline of **2026-12-17** was supplied with the issue; it is not an independently established retention guarantee for any recovery artifact.

The search report records the matching original main dSYM as unavailable within those bounded searches; no repair upload was performed. The searches and authenticated EAS/Sentry checks have not been independently repeated. Lost file/line symbolication remains unresolved. No candidate original dSYM path, checksum, architecture, or independently verified remote record is available to record.

## Per-build record

Record the following for each release and update it after artifact retrieval:

- Build ID and source SHA; version and build number.
- IPA SHA-256 and, for every distributed bundle, identifier, executable, UUID and architecture.
- Original dSYM paths, checksums and source-line coverage for the three Cherry targets. Record their qualifying remote IDs and features, and list third-party coverage and upload outcomes separately.
- Artifact download reference, checksum verification and one known source-line lookup per Cherry target during production acceptance, plus evidenced expiry (or `unknown`); if retrieval fails, record `unavailable` and the attempt and error.
- Actor and date, including any later recovery or verification attempt.

Use this template for the hook artifact's separate post-build acceptance record. Do not put tokens
or signed credential-bearing download URLs in it. The hook cannot verify an artifact collected
after it finishes.

```text
Version/build:
EAS build ID:
Source SHA:
Actions run / actor / observation date:
IPA relative path / size / SHA-256:
Each bundle: identifier / executable / version / build / UUID / architecture / provenance:
Original dSYM and DWARF paths / checksums / UUID / architecture / inspection result:
Published package.complete directory / manifest SHA-256 / dsyms.zip size / SHA-256:
archive-info.plist size / SHA-256:
Preflight / upload / remote verification statuses and timestamps / CLI exit:
Each required Cherry remote record: UUID / architecture / record ID / symbol type / features / observedAt:
Sanitized failure stage/code, if any:
Recovery artifact status: pending-post-build-check | download-verified | unavailable
Download attempt / stable retrieval reference / actor / date / error, if any:
Downloaded package, archive-info.plist, and manifest checksums verified:
Extracted original dSYM identities verified:
Retrieval verified independently of Sentry availability / actor / date:
Evidenced artifact expiry: <evidence and date> | unknown
Verified external copy / retrieval evidence / retention window, when required:
Recovery candidate original path / checksum / identity, only when obtained:
Repair upload and subsequent remote verification, only when performed:
Outstanding authenticated checks / next bounded recovery lead:
```

A configured EAS path or pending receipt is not proof of preservation. Record `unavailable` when
retrieval fails, with the attempt and error; record `unknown` for unevidenced expiry. Do not claim
preservation beyond the required window without actual retention evidence or a verified copy.
