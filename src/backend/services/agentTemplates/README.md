# Agent Template Catalogs

`createAgentTemplatesModule` owns remote template acquisition and validated local snapshots.
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
other source; the UI language never controls routing.

GitCode uses `https://api.gitcode.com/api/v5/repos/CherryHQ/cherry-studio`; GitHub uses
`https://api.github.com/repos/CherryHQ/cherry-studio` for branch metadata and
`https://raw.githubusercontent.com/CherryHQ/cherry-studio` for file content. Each source resolves
`/branches/main` to its own immutable commit SHA before downloading both files. GitCode reads
`/raw/resources%2Fdata%2F<file>?ref=<sha>`; GitHub reads `/<sha>/resources/data/<file>`.
Mirrors can lag independently. A fallback resolves its own revision and never mixes files between
sources or commits. An unchanged saved SHA avoids downloading the full catalogs again.

All requests use the shared HTTP transport, a 15-second timeout and response bounds (256 KiB for
branch metadata, 5 MiB per catalog file). Parsing validates schemas, template IDs, lengths and emoji
avatars before activation. Failed downloads or invalid updates never replace a saved catalog.

## Cache And Lifetime

Catalogs are stored lazily per source language in `Paths.document/agent-templates/{en,zh}-{a,b}.json`.
Snapshots contain their schema version, commit SHA, language, complete normalized content and local
save time. The inactive slot is written through a temporary file; an interrupted overwrite leaves
the last active slot intact. Reads validate both slots and select the newest valid snapshot.
These files are independent of the startup-loaded MMKV cache and contain no credentials or
user-created Agent data.

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
