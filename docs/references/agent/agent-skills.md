# Agent Skills

Cherry Mobile owns Skill discovery, package validation, installation, Agent bindings and per-turn
instruction context. The first implementation includes three reviewed bundled packages: structured
notes, research brief and daily agenda. The sidebar's Plugins page has separate Plugins and Skills
tabs. The Skills library provides installed search, details, prerequisites, enablement, update and
uninstall. Agent settings bind installed Skills; the chat composer selects eligible bindings for a
message.

## Ownership And Authority

```text
backend/services/skill       sources → validation → admission → managed installation
backend/data                 installed package facts + Agent binding preferences
backend/ai/agent/host         current eligibility → pinned scope → active instructions
backend/ai/agent/runtime      generic prepared context and context-budget accounting
```

A Skill is an instruction package, not an executable extension. Loading cannot add tools, change
approval, grant OS access, expose credentials, expand MCP access or widen the conversation file
ledger. Existing tool and permission owners remain authoritative. Skill instructions are subordinate
to application policy, Agent instructions and the user's current request. Because a Skill grants
nothing, an installed Skill whose instructions name an unavailable command can only fail to be
followed; admission therefore blocks only what is known not to work, not what is unproven.

General Skills are separate from the existing bundled plugin guides. Those guides retain their
[plugin module contract](../../../src/backend/services/builtInMcp/README.md#plugin-guides), global
plugin connection ownership and per-turn tool filtering.

## Sources And Package Format

Bundled recommendations carry app-owned compatibility profiles. Keyword search uses skills.sh and
returns listings only; nothing is downloaded until a listing URL is resolved. skills.sh pages and
public GitHub repository, directory, raw entry and `SKILL.md` links resolve to GitHub packages;
repositories with multiple Skills return candidates, with a maximum of 20 package directories.
Package identity is the GitHub directory, so the same package found through different links is one
installation.

GitHub resolution pins a ref to a commit and acquires the complete package directory, including a
repository-root package when present. Truncated trees, symlinks and submodules are rejected. Sources
must be public and resolvable through their supported interfaces; they use the project HTTP client,
bounded responses and cancellation. There is no script runner or package editor.

Packages require UTF-8 `SKILL.md` with leading YAML frontmatter and a nonempty conforming name and
description. A named package directory must match the declared name; root packages use the entry's
declared name. The supported YAML subset includes scalar key/value pairs, quoted strings, booleans,
numbers, block scalars and one nested mapping level for metadata. Full YAML compatibility is not
promised. Optional author, version, tags, license and compatibility metadata are retained.

- `disable-model-invocation: true` excludes a Skill from automatic discovery and loading.
- `user-invocable: false` excludes it from explicit composer selection.
- `allowed-tools` grants no capabilities. Hooks, shell interpolation and execution-context/model
  overrides are rejected.
- Package-relative paths cannot escape the root or collide after case/Unicode normalization, or
  represent both a file and a directory.
- Limits are 200 files, 8 MiB per package, 2 MiB per file, and 24,000 Unicode characters for entry
  instructions. Every file contributes to the sorted SHA-256 manifest and package digest.

## Admission

Compatibility is derived from the package profile and current environment facts on each read; it is
not a persisted boolean. A profile declares required built-in tools, plugin tools, platforms and
execution requirements. Bundled packages use their reviewed profile. Other packages get an
`analyzed` profile from deterministic rules: instructions that call the package's own bundled
scripts require an interpreter Cherry Mobile does not provide, and Cherry or plugin tool names the
instructions use explicitly become tool requirements. Environment checks consult the existing
permission, web-search, painting-model and plugin owners. A permission still requestable through the
normal OS flow is allowed; a denied permission requires setup.

| Status | Meaning | Installation |
| --- | --- | --- |
| `ready` | Current prerequisites are satisfied | Allowed |
| `setup-required` | Configuration, permission, model or package files need repair | Blocked |
| `unsupported` | Required platform, script execution or tool is unavailable on mobile | Blocked |

Agent admission additionally checks disabled capabilities and native tool calling. At turn
preparation, required tools must also exist in the actual executable tool snapshot, including the
correct plugin connection. Failed live discovery therefore cannot leave an apparently usable Skill.

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
URL; it never installs. `install_skill` takes one URL, resolves and downloads it, validates and
admits it, installs it and enables it for the current Agent in the same transaction. A URL with
several Skills returns their URLs for the model to choose from. Admission failures return their
reason codes so the Agent can explain them. The chip expresses installation intent and makes
`install_skill` approval automatic; otherwise it asks. Agent approval policy still applies, and
search-only requests do not authorize installation. An identical installation is reused for a new
Agent without republishing its files.

## Persistence And Lifecycle

`agent_global_skill` owns installed metadata, source identity, immutable revision facts, manifest,
profile and global enablement. `agent_skill` owns only Agent relationships and binding enablement.
Installation binds nothing unless Agent IDs were explicitly supplied; conversation tools supply only
the current Agent. Binding changes preserve unrelated bindings; global disablement preserves binding
preferences.

Accepted packages live in the selected storage generation beside its database, under
`Data/Skills/<folderName>/revisions/<packageDigest>/`; absolute sandbox paths are never persisted.
Cache staging is disposable. A complete tree is published before the SQLite acceptance transaction
commits. A failed commit leaves an unreferenced tree for cleanup.

Updates follow the original GitHub ref (including an intentionally pinned commit), reacquire and
validate the source before replacing the accepted revision, preserving ID, folder alias, enablement
and bindings. Rejected updates leave the old package intact. Uninstall marks the record deleted and
clears bindings immediately. Superseded and uninstalled bytes remain until next startup so already
prepared turns can finish reading their pinned revisions. Startup reconciliation runs after database
initialization and removes unreferenced revisions and staging. Missing package bytes are reported as
setup required, not as an empty successful installation.

The existing local backup includes the package trees of live installations, and restore activates
them with the database. Missing referenced files block backup instead of producing an incomplete
archive. Package writes and backup capture exclude each other.

Library reads use `/skills` and `/skills/:skillId`; `/agents/:agentId/skills` reads and updates
bindings. Composer search applies binding, global enablement, invocation and admission filters before
its public page boundary. Local metadata search uses stable name/ID cursors. Installation and
lifecycle operations belong to `Backend.skills`, separate from the ordinary Data API.

## Runtime And History

The Host resolves installed, globally enabled, bound-enabled and currently eligible packages for this
Agent, pinning each revision for the turn. After a successful conversation install, it may append
only that installed ID and exact digest from a freshly checked scope using the turn's actual tool
catalog. It never replaces a pinned revision. A refresh failure preserves the installation but
reports it unavailable in this turn. Tools cannot name another Agent or revision, and reads are
limited to paths in the accepted manifest. The model-facing tools are:

| Tool | Contract |
| --- | --- |
| `search_local_skills` | Scoped automatic-invocation metadata, 20 results per page |
| `load_skill` | Load a complete entry once; emit an attributed receipt and available resource paths |
| `list_skill_files` | List package paths after loading or explicit selection |
| `read_skill_file` | Read a package-local text line window; binary content is metadata only |
| `find_skills` | Search skills.sh, or list the Skills behind a supported URL |
| `install_skill` | Resolve, admit, install and bind one Skill for this Agent; append it to the turn |

The initial catalog contains at most 40 bounded descriptions. Search covers the remaining eligible
scope, including eligible additions installed during the turn. A new installation still uses
`load_skill` to activate instructions and create the ordinary loading receipt. Manual-only packages
cannot be guessed into automatic loading. The composer accepts up to eight eligible Skills and does
not silently create bindings.

Active entry instructions have a 48,000-character aggregate limit. They live in Host-owned context
outside compactable tool-result history. The generic Runtime callback refreshes that context through
Pi system-section updates before the next tool-loop budget and compaction decision. Oversized
activation fails rather than truncating instructions. References are read progressively and can be
read again after compaction.

Successful built-in loading receipts and Host-written user selection metadata, collected across the
whole transcript including compacted turns, restore active instructions on later turns. Restoration
loads the Skill's current revision while it stays bound, enabled, eligible and invocable in the same
way; a Skill that no longer qualifies simply stops contributing instructions. Retries exclude
receipts from the answer they replace. The UI shows Skill name and revision receipts, without dumping
instruction bodies into the tool trace.
