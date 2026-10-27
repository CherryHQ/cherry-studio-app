# Release Checklist Template

Copy this file to `release-status.md` outside the repository and follow
[Cloud Releases](./cloud-releases.md). Keep one current record per version.

Version / tag / source commit: `<version>` / `<tag>` / `<commit>`

## Before Pushing The Tag

- [ ] `expo.version` in `app.json` matches the tag.
- [ ] GitHub English and GitCode Simplified Chinese release notes are ready.
- [ ] Store descriptions and release notes are ready in every configured store locale.
- [ ] Required store screenshots are captured from the application.
- [ ] Every issue from a previous store rejection has a reply and a fix in this build.
- [ ] A maintainer with GitCode write access is available to sync and upload the release.

## Release Notes Outline

GitHub uses English. For GitCode, use `功能`, `修复`, `架构升级`, and `升级提醒`, and end with the
exact heading `## 下载安装`. Use a module name and one sentence per item; omit empty sections.

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

## Channel Status

Use the platform's own wording; record `unknown` rather than inferring a state.

| Channel | Version / build | Status | Observed at | Link |
| --- | --- | --- | --- | --- |
| GitHub | `<version/build>` | `<status>` | `<time>` | `<link>` |
| GitCode | `<version/build>` | `<status>` | `<time>` | `<link>` |
| TestFlight internal | `<version/build>` | `<status>` | `<time>` | `<link>` |
| TestFlight external | `<version/build>` | `<status>` | `<time>` | `<link>` |
| App Store | `<version/build>` | `<status>` | `<time>` | `<link>` |
| Google Play | `<version/build>` | `<status>` | `<time>` | `<link>` |

## Unfinished Items

- `<item, link, and what completes it>`
