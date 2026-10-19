# Health Access

This local Expo module owns HealthKit authorization and native reads. Agent approval and query
policy remain in `src/backend/ai/agent/tools/device` and `src/backend/services/device`. The module
is iOS-only and never writes HealthKit data or starts background delivery.

`src/shared/contracts/health.ts` is the single type catalog. It passes identifiers, minimum iOS
versions and authorization dependencies to native code. It covers the iOS 27.1 SDK's 222 current
public types and the deprecated audio-exposure alias:

| Kind | Types | Read representation |
| --- | ---: | --- |
| Quantity | 121 | Samples, preferred units, native range/day statistics, quantity series |
| Category | 71 + 1 alias | Original category values, times, sources and SDK value definitions |
| Characteristic | 6 | Date of birth, biological sex, blood type, skin type, wheelchair use, move mode |
| Correlation | 2 | Paired blood pressure and grouped food samples; constituent quantities own authorization |
| Clinical | 9 | Record metadata and paged FHIR JSON |
| Scored assessment | 2 | GAD-7 and PHQ-9 scores, answers and risk values |
| Document | 1 | CDA metadata and paged XML through `HKDocumentQuery` |
| Specialized | 9 | Workouts, routes, heartbeat series, ECG, audiograms, vision prescriptions, state of mind, activity rings, medication dose events |
| Medication list | 1 | Current and archived medications, codes, opaque concept identifiers and schedule flags |

Availability is checked before constructing a type; newer types do not make older systems fail.
Clinical records additionally require Health Records support, the `health-records` entitlement
and `NSHealthClinicalHealthRecordsShareUsageDescription` configured in `app.json`. A signing
profile must include that capability. Vision prescriptions use per-object authorization. CDA
content queries can open Apple's document-selection sheet. The app records only that selection
was requested, never that reading was granted. Reselection uses the application permission queue.

The workout overview uses a bounded, newest-first sample query and preserves absent distance
and energy as null. It uses this module directly and adds no third-party dependency patch.

Ordinary reads use bounded anchored pages. Continue with the returned cursor and the same explicit
dates, type and workout filter; a full last page may be followed by an empty page. Deleted IDs are
returned so callers can remove records deleted between pages. The order is HealthKit's anchor
order, not chronological. Quantity totals must use native statistics, not a sum of source samples.
Statistics preserve missing values as null, and use the type's aggregation style. Percent units
keep HealthKit's fractional convention (`0.97` means `97%`). Activity rings cover whole local
Gregorian calendar days. Characteristics and the medication list do not have a date filter.

Record details page ECG voltage, heartbeat gaps, locations, individual quantities, clinical/CDA
text and attachment bytes. Attachment bytes are base64; text offsets are Unicode scalars and
series offsets are points. Queries stop on completion or timeout. Document selection has a longer
window for the user to respond. Native records retain their original interval, source and device
metadata; raw overlapping records are not deduplicated. Read denial remains indistinguishable
from missing data. No public HealthKit sleep-score identifier exists in this SDK.

Native changes require a new development build. The fingerprint runtime version keeps these OTA
updates away from clients built with the previous bridge. Swift APIs are aligned to the project's
Xcode 27 SDK baseline; runtime availability guards retain the iOS 17 deployment target.

## Verifiable health credentials

`shareVerifiableRecords` reads SMART Health Cards and EU Digital COVID Certificates with
`HKVerifiableClinicalRecordQuery`. This is separate from the 222 ordinary types above: Apple
presents a one-time selection sheet for every query, without prior type-level authorization.
The tool retains explicit application approval. It returns metadata and paged original signed
bytes, not a claim that the signature or issuer has been verified. Credential filters combine
with AND; continuations require selecting the same records again.

This API requires a restricted entitlement approved separately by Apple and present in the signing
profile. This change does not obtain or enable that entitlement. Without it, HealthKit denies the
query; the tool reports that deployment prerequisite explicitly. Ordinary clinical-record access
is not sufficient. Request it through Apple's
[Verifiable Health Records entitlement application](https://developer.apple.com/contact/request/verifiable-health-records/)
before enabling it in a signed build.

## Official references

- [Data types](https://developer.apple.com/documentation/healthkit/data-types)
- [Read authorization](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)
- [Anchored queries](https://developer.apple.com/documentation/healthkit/hkanchoredobjectquery)
- [Quantity statistics](https://developer.apple.com/documentation/healthkit/hkstatisticsquery)
- [Daily statistics](https://developer.apple.com/documentation/healthkit/hkstatisticscollectionquery)
- [Percent units](https://developer.apple.com/documentation/healthkit/hkunit/percent())
- [Clinical record capability](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit.access)
- [Per-object authorization](https://developer.apple.com/documentation/healthkit/hkhealthstore/requestperobjectreadauthorization(for:predicate:completion:))
- [CDA document query](https://developer.apple.com/documentation/healthkit/hkdocumentquery)

- [One-time verifiable records](https://developer.apple.com/documentation/healthkit/hkverifiableclinicalrecordquery)
