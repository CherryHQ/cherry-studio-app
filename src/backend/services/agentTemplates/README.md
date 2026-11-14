# Agent Template Catalogs

`createAgentTemplatesModule` owns tolerant remote template reads and recoverable local snapshots.
Frontend callers use `Backend.agentTemplates` through `frontend/data/agentTemplates`; they never
access HTTP or filesystem implementations. Module creation performs no network or disk work.

## Sources And Versions

The content source is [Cherry Desktop's public catalog](https://github.com/CherryHQ/cherry-studio/tree/main/resources/data)
on `main`, under its upstream GNU Affero General Public License v3.0:

- `resources/data/agents-en.json` or `agents-zh.json` supplies the original assistant templates.
- `resources/data/marketplace-agents.json` supplies the newer localized names/descriptions and
  shared instructions. Both catalogs become ordinary Mobile Agent creation content.

The shared `RegionService` detects the egress-IP country. `repositorySourceOrder`, also consumed by
provider-registry downloads, selects GitCode first for CN and GitHub first for other countries.
Unknown country retains the existing domestic-source default. A failed source falls back to the
other source when it has no readable templates; the UI language never controls routing.

GitCode uses `https://api.gitcode.com/api/v5/repos/CherryHQ/cherry-studio`; GitHub uses
`https://api.github.com/repos/CherryHQ/cherry-studio` for branch metadata and
`https://raw.githubusercontent.com/CherryHQ/cherry-studio` for file content. Each source resolves
`/branches/main` to its own commit SHA when available before downloading both files. GitCode reads
`/raw/resources%2Fdata%2F<file>?ref=<sha>`; GitHub reads `/<sha>/resources/data/<file>`.
Mirrors can lag independently. A fallback resolves its own revision and never mixes files between
sources. If branch metadata is missing or unavailable, downloads use `main` and leave the saved
revision empty so the next refresh still downloads content. An unchanged saved SHA skips full
downloads only when both files were acquired successfully.

All requests use the shared HTTP transport, a 15-second timeout and response bounds (256 KiB for
branch metadata, 5 MiB per catalog file). Each file is independent: a failed download or unreadable
JSON becomes an empty collection while templates from the other file remain usable. When neither
file supplies content, the module tries the next source and preserves saved content if both fail.

Remote content is read field by field without a schema-version gate or whole-catalog validation.
Unknown fields are ignored. Missing text defaults to empty text, names fall back to template IDs,
and absent IDs use a stable source/index identity. Localized text falls back to the other available
language or a shared string. Emoji whitespace is trimmed; unavailable avatars use the normal Cherry
avatar. Non-object entries are ignored and duplicate IDs retain the last entry without rejecting
other templates. Instructions are kept intact, including empty text and original line endings.

## Cache And Lifetime

Catalogs are stored lazily per source language in `Paths.document/agent-templates/{en,zh}-{a,b}.json`.
Snapshots contain their local schema version, available commit SHA, language, normalized content,
local save time and whether both downloads completed. Partial snapshots remain available offline
but must retry downloads even when the source SHA is unchanged. The inactive slot is written
through a temporary file; an interrupted overwrite leaves
the last active slot intact. Reads validate both slots and select the newest valid snapshot.
These files are independent of the startup-loaded MMKV cache and contain no credentials or
user-created Agent data. Downloaded catalogs also live in memory independently of disk snapshots.
A snapshot write failure logs the storage error, preserves the previous disk snapshot and still
returns the downloaded catalog; a later refresh can retry persistence.

The frontend reads saved content first, including when offline, then refreshes in the background.
The query remains fresh for one hour; later mounts after expiry or explicit Retry may refresh it.
A cold application session checks metadata again. This is not a polling timer.
Refresh errors keep cached content visible; first use requires network access and offers Retry
on failure. Same-language callers share one refresh. Caller cancellation only stops that caller's
wait; bootstrap disposal aborts and joins owned reads/downloads/writes.

Chinese UI locales resolve to the Chinese source and other UI locales to English through the
shared language resolver. Shared upstream instructions remain unchanged, including line endings.
Templates supply only ID, name, description, categories, emoji and instructions; they cannot import
tools, model configuration or bindings. The create editor freezes the selected content and language
when its draft starts, so later refreshes cannot replace user edits.
