# Health Access

This local Expo module owns HealthKit authorization and native reads. Agent approval and query
policy remain in `src/backend/ai/agent/tools/device` and `src/backend/services/device`. The module
is iOS-only and never writes HealthKit data or starts background delivery.

`src/shared/contracts/health.ts` is the single type catalog. It passes identifiers, minimum iOS
versions and authorization dependencies to native code. It covers the iOS 27.1 SDK's 212 current
public types and the deprecated audio-exposure alias, excluding clinical records, CDA documents and
verifiable health records:

| Kind | Types | Read representation |
| --- | ---: | --- |
| Quantity | 121 | Samples, preferred units, native range/day statistics, quantity series |
| Category | 71 + 1 alias | Original category values, times, sources and SDK value definitions |
| Characteristic | 6 | Date of birth, biological sex, blood type, skin type, wheelchair use, move mode |
| Correlation | 2 | Paired blood pressure and grouped food samples; constituent quantities own authorization |
| Scored assessment | 2 | GAD-7 and PHQ-9 scores, answers and risk values |
| Specialized | 9 | Workouts, routes, heartbeat series, ECG, audiograms, vision prescriptions, state of mind, activity rings, medication dose events |
| Medication list | 1 | Current and archived medications, codes, opaque concept identifiers and schedule flags |

Availability is checked before constructing a type; newer types do not make older systems fail.
Vision prescriptions and medications use per-object
authorization; medication doses inherit the selected medications' access. `reselectRecords` can
reopen either selection, including when querying medication doses. The app records only that
selection was requested, never that reading was granted. Reselection shares the application
permission queue with ordinary system requests.

The workout overview uses a bounded, newest-first sample query and preserves absent distance
and energy as null. The seven-metric summary reads native statistics in fixed units (`unit`:
kcal, m, count/min, ms, count) so its values do not follow the person's display units, and pages
sleep samples for its stage merge. Every Health read goes through this module; there is no
third-party HealthKit dependency.

Ordinary reads use bounded anchored pages. Continue with the returned cursor and the same explicit
dates, type and workout filter; a full last page may be followed by an empty page. Deleted IDs are
returned so callers can remove records deleted between pages. The order is HealthKit's anchor
order, not chronological. Quantity totals must use native statistics, not a sum of source samples.
Statistics preserve missing values as null, and use the type's aggregation style. Percent units
keep HealthKit's fractional convention (`0.97` means `97%`). Activity rings cover whole local
Gregorian calendar days. Characteristics and the medication list do not have a date filter.

Record details page ECG voltage, heartbeat gaps, locations, individual quantities and attachment
bytes. Attachment bytes are base64 and series offsets are points. Queries stop on completion or
timeout. Native records retain their original interval, source and device
metadata; raw overlapping records are not deduplicated. Read denial remains indistinguishable
from missing data. No public HealthKit sleep-score identifier exists in this SDK.

Native changes require a new development build. The fingerprint runtime version keeps these OTA
updates away from clients built with the previous bridge. Swift APIs are aligned to the project's
Xcode 27 SDK baseline; runtime availability guards retain the iOS 17 deployment target.

## Official references

- [Data types](https://developer.apple.com/documentation/healthkit/data-types)
- [Read authorization](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)
- [Anchored queries](https://developer.apple.com/documentation/healthkit/hkanchoredobjectquery)
- [Quantity statistics](https://developer.apple.com/documentation/healthkit/hkstatisticsquery)
- [Daily statistics](https://developer.apple.com/documentation/healthkit/hkstatisticscollectionquery)
- [Percent units](https://developer.apple.com/documentation/healthkit/hkunit/percent())
- [Per-object authorization](https://developer.apple.com/documentation/healthkit/hkhealthstore/requestperobjectreadauthorization(for:predicate:completion:))
