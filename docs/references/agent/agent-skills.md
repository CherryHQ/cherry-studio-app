# Agent Skills

Cherry Mobile owns Skill discovery, package validation, installation, Agent bindings and per-turn
instruction context. The first implementation includes three reviewed bundled packages: structured
notes, research brief and daily agenda. The sidebar's Plugins page has separate Plugins and Skills
tabs. The Skills library provides installed search, details, environment guidance, enablement, update and
uninstall. Agent settings bind installed Skills; the chat composer selects eligible bindings for a
message.

## Ownership And Authority

```text
backend/services/skill       sources → package validation → managed installation
backend/data                 installed package facts + Agent binding preferences
backend/ai/agent/host         current eligibility → pinned scope → active instructions
backend/ai/agent/runtime      Pi Durable model history, compaction and tool loop
```

A Skill is an instruction package, not an executable extension. Loading cannot add tools, change
approval, grant OS access, expose credentials, expand MCP access or widen the conversation file
ledger. Existing tool and permission owners remain authoritative. Skill instructions are subordinate
to application policy, Agent instructions and the user's current request. Package acceptance,
instruction access and step execution are separate: a valid package can be installed and read even
when some steps need unavailable tools or a script runtime. Installation never claims that the
whole workflow can execute.

General Skills are separate from the existing bundled plugin guides. Those guides retain their
[plugin module contract](../../../src/backend/services/builtInMcp/README.md#plugin-guides), global
plugin connection ownership and per-turn tool filtering.

## Sources And Package Format

Bundled recommendations carry app-owned compatibility profiles. Keyword search uses skills.sh and
returns listings only; nothing is downloaded until a listing URL is resolved. skills.sh pages and
public GitHub repository, directory, raw entry and `SKILL.md` links resolve to GitHub packages;
repositories with multiple Skills return candidates, with a maximum of 20 package directories.
Like desktop, a package's folder name is its declared name and holds one installation. A candidate
from the same origin (bundled name, or GitHub owner, repository and directory) reuses it; a
different package with the same name is refused.

GitHub resolution pins a ref to a commit and acquires the complete package directory, including a
repository-root package when present. Truncated trees, symlinks and submodules are rejected. Sources
must be public and resolvable through their supported interfaces; they use the project HTTP client,
bounded responses and cancellation. There is no script runner or package editor.

Packages require UTF-8 `SKILL.md` with leading YAML frontmatter and a nonempty conforming name and
description. A named package directory must match the declared name; root packages use the entry's
declared name. The `yaml` parser reads frontmatter mappings, including block scalars, collections
and nested metadata; malformed YAML and duplicate keys are rejected. Original bytes and unknown
metadata remain in the package. Author, version, tags, license and compatibility notes are extracted
for inspection; declared compatibility notes also accompany loaded instructions.

- `disable-model-invocation: true` excludes a Skill from automatic discovery and loading.
- `user-invocable: false` excludes it from explicit composer selection.
- `allowed-tools` grants no capabilities. Hooks, shell interpolation and execution-context/model
  overrides are rejected.
- Package-relative paths cannot escape the root or collide after case/Unicode normalization, or
  represent both a file and a directory.
- Limits are 200 files, 8 MiB per package, 2 MiB per file, and 24,000 Unicode characters for entry
  instructions. Every file contributes to the SHA-256 manifest and to the content hash, which uses
  desktop's `directory-sha256:` algorithm so one package has the same hash on both clients.

## Package Acceptance And Environment Guidance

Installation and updates validate the package format, paths, integrity and size. Missing tools,
permissions, model tool calling or script interpreters do not block installation or instruction
loading. Scripts, references, templates and other accepted resources are preserved together.

Bundled packages retain their reviewed requirement profiles as environment guidance. Their checks
consult permission, web-search, painting-model and plugin owners; actual execution checks remain
with the tools. External packages are `unverified`: the app does not infer dependencies from prose,
script filenames or mentioned tool names. Older stored `analyzed` profiles remain readable and are
also treated as unverified, without a database migration.

| Status | Meaning |
| --- | --- |
| `ready` | No known limitation in the reviewed requirements; not a guarantee of execution |
| `unverified` | The external workflow's execution requirements have not been verified |
| `setup-required` | Known configuration or permission needs; also used for missing package bytes |
| `unsupported` | A reviewed step needs an unavailable platform, tool or script runtime |

These statuses describe the environment rather than grant access. Binding, global enablement,
invocation policy and readable package bytes determine instruction access. Missing package bytes
exclude a Skill from loading and composer selection; execution limitations do not. The Agent sees
known limitations with loaded instructions and must explain an unavailable capability before a step
that needs it. Reading a script must never be reported as running it.

## Conversation Installation

The main entry is **Sidebar → Plugins → Skills → Add Skill**. It returns to chat with a fresh
draft and a removable built-in `find-skills` chip, using the current available Agent or the first
available Agent as fallback. A shared composer handoff carries the action exactly as draft content;
its token is the only handoff data in navigation parameters. Opening the draft does not send a
message or install a package. Sending persists the structured `find-and-install` intent on the user
message, including retries. Rejected sends retain the chip, successful sends clear the submitted
selection, and switching Agents clears it. The app-owned discovery instructions are always available
when management tools are present, so no bootstrap package needs to be installed first. The
composer plus menu only selects already installed Skills. Manual search and bundled recommendations
are a secondary destination in the Skills tab's overflow menu.

The Agent uses two tools. `find_skills` searches skills.sh with keywords or lists the Skills behind a
URL; it never installs. `install_skill` takes one URL, resolves and downloads it, validates
the package, installs it and enables it for the current Agent in the same transaction. A URL with
several Skills returns their URLs for the model to choose from. Package validation failures return their
reason codes so the Agent can explain them. The chip expresses installation intent and makes
`install_skill` approval automatic; otherwise it asks. Agent approval policy still applies, and
search-only requests do not authorize installation. An identical installation is reused for a new
Agent without republishing its files.

## Persistence And Lifecycle

`agent_global_skill` and `agent_skill` match desktop's columns, defaults and index names. Mobile
writes `source` as `builtin` (bundled recommendations) or `marketplace` (GitHub-hosted packages),
`source_url` as the URL updates re-resolve, and `is_enabled` as global enablement; new
installations and conversation bindings are written enabled. Desktop's `namespace` is absent
because mobile has no built-in namespaces or system skill placements. Three mobile columns follow
the shared ones: `manifest` lists accepted files for backup completeness and package-local reads,
`profile` holds reviewed environment guidance or unverified provenance, and
`invocation` lets list queries filter by invocation policy. Installation binds nothing unless
Agent IDs were explicitly supplied; conversation tools supply only the current Agent. Binding
changes preserve unrelated bindings; global disablement preserves binding preferences.

Accepted packages live in the selected storage generation beside its database, under
`Data/Skills/<folder_name>/<content hash hex>/`; absolute sandbox paths are never persisted.
Cache staging is disposable. A complete tree is published before the SQLite acceptance transaction
commits. A failed commit leaves an unreferenced tree for cleanup.

Updates follow the original GitHub ref (including an intentionally pinned commit), reacquire and
validate the source before replacing the accepted revision, preserving ID, folder, enablement and
bindings. Rejected updates leave the old package intact. Uninstall deletes the row and its bindings
immediately, like desktop. Superseded and uninstalled bytes remain until next startup so already
prepared turns can finish reading their pinned revisions. Startup reconciliation runs after database
initialization and removes unreferenced revisions and staging. Missing package bytes are reported as
setup required, not as an empty successful installation.

The existing local backup includes the package trees of live installations, and restore activates
them with the database. Missing referenced files block backup instead of producing an incomplete
archive. Package writes and backup capture exclude each other.

Library reads use `/skills` and `/skills/:skillId`; `/agents/:agentId/skills` reads and updates
bindings. Composer search applies binding, global enablement, invocation and package-presence filters before
its public page boundary. Local metadata search uses stable name/ID cursors. Installation and
lifecycle operations belong to `Backend.skills`, separate from the ordinary Data API.

## Runtime And History

The Host resolves installed, globally enabled, bound-enabled and currently eligible packages for this
Agent, pinning each revision for the turn. After a successful conversation install, it may append
only that installed ID and exact digest from a freshly checked access scope. It never replaces a pinned revision. A refresh failure preserves the installation but
reports it unavailable in this turn. Tools cannot name another Agent or revision, and reads are
limited to paths in the accepted manifest. The model-facing tools are:

| Tool | Contract |
| --- | --- |
| `search_local_skills` | Scoped automatic-invocation metadata, 20 results per page |
| `load_skill` | Load a complete entry once; emit an attributed receipt and available resource paths |
| `list_skill_files` | List package paths after loading or explicit selection |
| `read_skill_file` | Read a package-local text line window; binary content is metadata only |
| `find_skills` | Search skills.sh, or list the Skills behind a supported URL |
| `install_skill` | Validate, install and bind one Skill for this Agent; append it to the turn |

The initial catalog contains at most 40 bounded descriptions. Search covers the remaining eligible
scope, including eligible additions installed during the turn. A new installation still uses
`load_skill` to activate instructions and create the ordinary loading receipt. Manual-only packages
cannot be guessed into automatic loading. The composer accepts up to eight eligible Skills and does
not silently create bindings.

Active entry instructions have a 48,000-character aggregate limit; oversized activation fails rather
than truncating instructions. Pi Durable owns model history and compaction. This first implementation
keeps Cherry's prepared system instructions fixed for the duration of a turn. `load_skill` therefore returns the
instructions in its result so the current turn can follow them, and explicit selections are quoted
in that turn's system instructions. References are read progressively and can be read again after
compaction.

On later turns the Host restores active instructions into the system instructions, outside the
history Pi may compact. It reads successful built-in loading receipts and Host-written user
selection metadata from the Cherry transcript, so restoration also works after a working copy is
rebuilt. It loads the Skill's current revision while the Skill stays bound, enabled, eligible and
invocable in the same way; a Skill that no longer qualifies simply stops contributing instructions.
Retry and regeneration resubmit the original message's selections and find-and-install action. The
UI shows Skill name and revision receipts, without dumping instruction bodies into the tool trace.

## First-Version Scope

The current implementation reuses the existing load receipts and Host prompt assembly. Later turns
use the current installed revision; a running turn keeps its prepared package scope. This version
adds no request-level Skill sections, separate activation-state store, session-specific unload
protocol, or long-term revision retention. Exact old-version recovery across restart, advanced
queue/history interactions and remote script execution remain outside this version's contract.
Backups continue to include live installations, not a separate archive of historical activations.
