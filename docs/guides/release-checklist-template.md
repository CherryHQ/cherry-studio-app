# Release Checklist Template

Copy this file to `release-status.md` in the version's artifact archive (a `<version>/` directory
outside the repository; see [Release Preparation](./cloud-releases.md#release-preparation)).
Replace placeholders, keep one current record, and link reports to it. Follow [Cloud Releases](./cloud-releases.md) and
[Local EAS Builds](./local-builds.md); replace these guide links with repository links in the copy.
Keep the filled record and private evidence outside committed documentation. Check an item only
when its evidence is recorded; use `not applicable` with a reason for excluded work.

## Scope And Decisions

| Field | Value |
| --- | --- |
| Version / tag / source commit | `<version>` / `<tag>` / `<commit>` |
| Release owner / record maintainer | `<owner>` / `<maintainer>` |
| Record updated at / timezone | `<timestamp>` / `<timezone>`; individual observations below keep their own times |
| Intended channels and completion criteria | `<channels and required final states>` |
| Existing authorization / outstanding decisions | `<task scope already agreed; only unresolved decisions>` |
| Artifact archive / manifest | `<paths>` |
| Delivery summary / closeout summary | `<delivery state>` / `<remaining handoff work>` |

## Preparation

- [ ] Target version, commit, channels, and completion criteria are recorded.
- [ ] Build locations and profiles are selected; tag-triggered cloud jobs are accounted for.
- [ ] Local tool readiness and cloud queue/fallback decisions are recorded before starting builds.
- [ ] Channel access, signing/upload credentials, and target commit/tag reachability are ready.
- [ ] A maintainer with GitCode repository write access owns the mirror sync and upload through their own agent using Computer Use in their authenticated browser.
- [ ] Change inventory, exclusions, upgrade requirements, and curated notes are complete.
- [ ] Required store locales and screenshot assets are identified; remaining gaps have owners.
- [ ] Final-package checks have an owner, authorization status, and evidence or an explicit gap.

| Artifact | Local/cloud; profile | Tool versions and readiness evidence | Queue reassessment budget / fallback | Owner |
| --- | --- | --- | --- | --- |
| Public APK | `<path; profile>` | `<evidence>` | `<budget or N/A; fallback>` | `<owner>` |
| Play AAB | `<path; profile>` | `<evidence>` | `<budget or N/A; fallback>` | `<owner>` |
| iOS IPA | `<path; profile>` | `<evidence>` | `<budget or N/A; fallback>` | `<owner>` |

Credential records contain location, access result, and expiry/readiness only, never secret values.

| Channel / service | Publishing path; credential location | Access and target readiness; checked at | Gap / owner |
| --- | --- | --- | --- |
| GitCode | Maintainer's own agent via Computer Use; maintainer's authenticated browser | `<repository write access; mirror sync available; timestamp>` | `<gap or none; maintainer>` |
| `<other service>` | `<channel-specific path; location>` | `<result; timestamp>` | `<gap or none; owner>` |

GitCode handoff: `<tag, source commit, GitHub release URL, same APK and SHA256SUMS, Chinese title
and notes>`. Follow the guide's GitCode Maintainer Upload procedure: sync the mirror first, then
publish in the browser. No repository publishing workflow, upload script, or GitCode automation
token is used.

## Copy And Assets

- Complete change inventory and evidence: `<path>`
- Release-specific exclusions and rationale: `<items>`
- Upgrade requirements: `<requirements or none with evidence>`
- Configured store locales / test-note locales: `<separate lists>`
- Asset inventory: `<path; source, app/client version, locale, device/display, dimensions, upload processing status>`

### Public Copy Outline

Use a module name and one sentence per item; omit empty categories. Keep upgrade guidance before
the final download section. GitHub uses English; GitCode uses Simplified Chinese.

```markdown
# Cherry Studio <version>

## Features

- [Module] One-sentence change.

## Fixes

- [Module] One-sentence fix.

## Architecture Upgrades

- [Module] One-sentence upgrade.

## Upgrade Notes

<Required upgrade steps, or omit this section.>

## Download and Installation

<APK, checksum, installation instructions, and independent store availability.>
```

For GitCode, use `功能`, `修复`, `架构升级`, and `升级提醒` for the corresponding sections, and
end with the exact heading `## 下载安装`. Preserve versions, filenames, and technical identifiers.
Adapt store/test copy to its channel while retaining applicable core features and upgrade guidance.

### Channel Coverage

Use `draft`, `confirmed` with evidence, or `omitted` with a reason. Expand the store columns to
one per configured locale in this release; a single translated draft does not cover all locales.

| Core feature / device capability / upgrade warning | GitHub EN | GitCode zh-CN | App Store locales | Play locales | Test notes |
| --- | --- | --- | --- | --- | --- |
| `<item>` | `<state; evidence>` | `<state; evidence>` | `<states; evidence>` | `<states; evidence>` | `<state; evidence>` |

## Store Submission Readiness

Complete this for each selected store before its first submission:

- [ ] The intended version and build are selected.
- [ ] All applicable rejection issues are resolved; required replies are sent with evidence and the replacement build recorded.
- [ ] Required descriptions, release notes, declarations, and review notes are current in every configured locale.
- [ ] Screenshots match their intended version, language, and device; upload processing is complete.

After submission, record the result, observation time, and evidence in the channel table.

| Store / rejection issue | Code or content resolution | Reply state / sent evidence | Replacement build | Owner |
| --- | --- | --- | --- | --- |
| `<issue or none>` | `<resolution>` | `<draft/sent; evidence>` | `<build>` | `<owner>` |

## Current Channel Status

Preserve exact platform wording. An observation timestamp is not the time approval or publication
occurred. Keep unobserved results `unknown`; mark excluded channels `out of scope` with a reason.

| Channel | Version / build | Observed status | Observed at (timezone) | Evidence | Owner / next action |
| --- | --- | --- | --- | --- | --- |
| GitHub | `<version/build>` | `<state>` | `<time>` | `<link>` | `<owner/action>` |
| GitCode | `<version/build>` | `<state>` | `<time>` | `<link>` | `<owner/action>` |
| TestFlight internal | `<version/build>` | `<state>` | `<time>` | `<link>` | `<owner/action>` |
| TestFlight external | `<version/build>` | `<state>` | `<time>` | `<link>` | `<owner/action>` |
| App Store public | `<version/build>` | `<state>` | `<time>` | `<link>` | `<owner/action>` |
| Google Play | `<version/build>` | `<state>` | `<time>` | `<link>` | `<owner/action>` |

Superseded snapshots: `<path, original observation time, and which state has been superseded>`.

## Artifacts And Verification

Reference the manifest for full hashes and upload details. Record each artifact's actual commit,
including recovery commits that differ from the public tag; do not move the tag to hide a difference.

| Artifact | Actual commit / profile | Build ID / number | Path / checksum evidence |
| --- | --- | --- | --- |
| `<artifact>` | `<commit/profile>` | `<ID/number>` | `<manifest entry>` |

| Check | Exact artifact/build | Owner / authorization | Result, observation time, and evidence or gap |
| --- | --- | --- | --- |
| Integrity / signing | `<artifact>` | `<owner/scope>` | `<result>` |
| Production diagnostic uploads | `<artifact>` | `<owner/scope>` | `<result>` |
| Final-package runtime acceptance | `<artifact>` | `<owner/scope>` | `<result or not performed>` |

## Recovery Decisions

Record queue time, execution time, and retry gaps separately. Before a retry, record the evidence,
change or transient-failure rationale, bounded attempts, expected result, and active-job disposition.

| Job / commit / profile / environment | Queue / execution / retry gap | Result / error evidence | Next attempt: change or rationale; expected result | Active jobs / owner |
| --- | --- | --- | --- | --- |
| `<attempt>` | `<durations>` | `<result/log>` | `<decision>` | `<disposition/owner>` |

## Closeout And Handoff

- [ ] Every selected channel has an evidenced state or an explicit remaining action.
- [ ] Applicable copy corrections are confirmed across channels.
- [ ] Final artifacts have actual source commits, build numbers, profiles, checksums, and verification boundaries.
- [ ] Recovery changes have a recorded route into shared history; unverified environments remain explicit.
- [ ] Compatibility warnings and missing checks have owners and completion conditions.
- [ ] Earlier snapshots are identified as historical and final reports link to this record.
- [ ] Delivery completion, monitoring completion, and remaining closeout work are stated separately.

| Open item | Evidence / issue or PR | Owner | Next action / timing | Completion condition |
| --- | --- | --- | --- | --- |
| `<item>` | `<link or issue not yet created>` | `<owner>` | `<next step>` | `<observable outcome>` |
