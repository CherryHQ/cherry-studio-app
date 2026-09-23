# Agent Skills

Cherry Mobile owns Skill discovery, package validation, installation, Agent bindings and per-turn
instruction context. The first implementation includes three reviewed bundled packages: structured
notes, research brief and daily agenda. The sidebar's Plugins page has separate Plugins and Skills
tabs. The Skills library provides installed search,
details, prerequisites, enablement, update and uninstall. Agent settings bind installed Skills;
the chat composer selects eligible bindings for a message.

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
to application policy, Agent instructions and the user's current request.

General Skills are separate from the existing bundled plugin guides. Those guides retain their
[plugin module contract](../../../src/backend/services/builtInMcp/README.md#plugin-guides), global
plugin connection ownership and per-turn tool filtering.

## Sources And Package Format

Bundled recommendations carry app-owned compatibility profiles bound to the complete package digest.
Discovery searches skills.sh, claude-plugins.dev and ClawHub. Listing provenance is retained separately
from package identity, so listings that resolve to the same GitHub directory do not create duplicate
installations. Public GitHub repository, directory, raw entry and `SKILL.md` links are also accepted;
repositories with multiple Skills return candidates, with a maximum of 20 package directories.

GitHub resolution pins a ref to a commit and acquires the complete package directory, including a
repository-root package when present. Truncated trees, symlinks and submodules are rejected. ClawHub
pins a published version, checks the publisher and availability, and downloads each file listed in
that version's manifest, verifying its byte size and SHA-256. A listing without a complete file
manifest is unavailable; there is no ZIP importer or GitHub-handoff inference. Sources must be public
and resolvable through their supported interfaces. External packages require AI assessment; discovery
or user confirmation alone never grants admission. There is no script runner or general package editor.

Packages require UTF-8 `SKILL.md` with leading YAML frontmatter and a nonempty conforming name and
description. A named package directory must match the declared name; root packages use the entry's
declared name. The supported YAML subset includes
scalar key/value pairs, quoted strings, booleans, numbers, block scalars and one nested mapping level
for metadata. Full YAML compatibility is not promised. Optional author, version, tags, license and
compatibility metadata are retained.

- `disable-model-invocation: true` excludes a Skill from automatic discovery and loading.
- `user-invocable: false` excludes it from explicit composer selection.
- `allowed-tools` grants no capabilities. Hooks, shell interpolation and execution-context/model
  overrides are rejected.
- Package-relative paths cannot escape the root or collide after case/Unicode normalization, or
  represent both a file and a directory.
- Limits are 200 files, 8 MiB per package, 2 MiB per file, and 24,000 Unicode characters for entry
  instructions. Every file contributes to the sorted SHA-256 manifest and package digest.

## Admission

Compatibility is derived from accepted package facts and current environment facts on each read;
it is not a persisted boolean. An accepted profile declares required built-in tools, plugin tools,
platforms and execution requirements. Environment checks consult the existing permission,
web-search, painting-model and plugin owners. A permission still requestable through the normal OS
flow is allowed; a denied permission requires setup.

| Status | Meaning | Installation |
| --- | --- | --- |
| `ready` | Reviewed or explicitly AI-assessed digest, with current prerequisites satisfied | Allowed |
| `setup-required` | Configuration, permission, model or package storage needs repair | Blocked |
| `unsupported` | Required platform, execution mode or tool is unavailable on mobile | Blocked |
| `unknown` | No accepted assessment, or unresolved assessment questions | Blocked |

Rule analysis can identify incompatibility; finding no unsupported command never proves support.
Agent admission additionally checks disabled capabilities and native tool calling. At turn
preparation, required tools must also exist in the actual executable tool snapshot, including the
correct plugin connection. Failed live discovery therefore cannot leave an apparently usable Skill.

## AI Discovery And Assessment

The app's default language model proposes at most two phrases; registry searches run concurrently
and the model ranks only observed results. Candidates resolve to actual pinned packages before
being returned. Direct supported URLs skip model search planning. Configured web search can
supplement an empty or unavailable registry search with exact GitHub `SKILL.md` URLs. Partial source
failures are retained; a failed search is not reported as an empty successful search. Sources use the
project HTTP client, bounded responses and cancellation. No desktop CLI, clone operation or external
package manager is required.

External candidates offer an explicit **Assess with AI** action, and conversation preparation calls
the same assessment service. Ordinary inspection, opening a page, installation and update checks do
not silently call the model. The assessment sends the complete
text package and app-owned capability catalog to the user's default model, using the existing
`AiService`, configured provider and shared app-language resolver. Generation exposes no tools.
It returns a structured workflow judgment, exact capability requirements, file/quote evidence and
unresolved questions. UI explains which model receives the package and attributes its assessment.

The first AI slice accepts only complete text-only packages of at most 80 files and 100,000 Unicode
characters. Nothing is truncated for approval. Binary or oversized packages remain unavailable for
AI assessment. Every nonempty file needs evidence whose quoted text actually exists in that file;
returned requirements must use supported schema values and known plugin tool names. Existing
rule-derived requirements remain a conservative floor and cannot be removed by an AI result.

An accepted AI profile has distinct `ai-assessed` provenance and records model, assessment time,
schema version, evidence and uncertainties inside the existing profile JSON. It is bound to the
complete package digest. Only `supported` with no unresolved questions can pass into ordinary
platform/tool/configuration admission; `unknown`, `unsupported`, malformed evidence and model
failures cannot authorize installation. The result is static model analysis, not runtime verification,
human review or a security certification. No additional tools, approval or permissions are granted.

Candidate assessments use a bounded process-local cache. Installation reacquires the pinned package
and accepts only a matching digest; installed records persist the accepted assessment. Changed
updates retain the current installation and open the new candidate for assessment. Applying an
assessed update rechecks its current package and environment, so upstream changes can require another
assessment. Reopening an unchanged installation uses its saved profile without another model call.

## Conversation Installation And Mobile Adaptation

The main entry is **Sidebar → Plugins → Skills → Add Skill**. It returns to chat with a fresh
draft and a removable built-in `find-skills` chip, using the current available Agent or the first
available Agent as fallback. A shared composer handoff carries the action exactly as draft content;
its token is the only handoff data in navigation parameters. Repeated Add Skill actions create
distinct handoffs. Opening the draft does not send a message or install a package. The user then
enters a task or source URL. Sending persists the structured `find-and-install` intent on the
user message, including retries. Rejected sends retain the chip, successful sends clear the submitted
selection, and switching Agents clears it. The app-owned discovery instructions are always available
when management tools are present, so no bootstrap package needs to be installed first.
The composer plus menu retains selection of already installed Skills. It has no add/discover action.
Skill detail, assessment and uninstall pages belong to the Plugins route tree. Manual discovery and
bundled recommendations remain a secondary destination in the Skills tab's overflow menu.

The Agent calls `find_skills`, `prepare_skill`, then `install_skill`. Candidate handles must have
been issued in the current turn; preparation must succeed, and installation rechecks both current
capabilities and the exact prepared package/profile fingerprints. The chip expresses installation
intent; ordinary conversation installs retain tool approval. Agent approval policy still applies,
and search-only requests do not authorize installation. Successful installs enable the Skill for
the current Agent in the same transaction. An identical accepted installation can be reused for a
new Agent without republishing its files. Duplicate calls within a turn share one installation.

When assessment cannot admit a package, preparation may propose an equivalent mobile adaptation.
Only unique, exact replacements in existing Markdown/text instructions are allowed. Identity,
frontmatter, invocation policy, scripts, assets and license files cannot change. A separate model
call reviews the complete original and adapted packages for equivalent required operations and
effects; then the complete adapted package receives ordinary AI assessment and deterministic
admission again. Uncertainty or unavailable capabilities prevents acceptance. This is static AI
analysis, not an executed equivalence test.

The original package remains an immutable managed revision. The adapted profile records the
upstream digest, model, time, summary and exact before/after passages with reasons. Changed upstream
bytes cannot reuse an old patch or assessment. The UI attributes **AI assessed** and mobile
adaptation, shows the assessment/change details, and links the installation receipt to management
and uninstall. No downloaded scripts, interpreters or mobile UI bundles are executed.

## Persistence And Lifecycle

`agent_global_skill` owns installed metadata, source identity, immutable revision facts, manifest,
profile and global enablement. `agent_skill` owns only Agent relationships and binding enablement.
Installation binds nothing unless Agent IDs were explicitly supplied; conversation tools supply
only the current Agent. Binding changes preserve
unrelated bindings; global disablement preserves binding preferences.

The native `managed-storage` module resolves iOS Application Support or Android `filesDir` at runtime.
Accepted packages live under `Data/Skills/<folderName>/revisions/<packageDigest>/`; absolute sandbox
paths are never persisted. Cache staging is disposable. A complete tree is published before the
SQLite acceptance transaction commits. A failed commit leaves an unreferenced tree for cleanup.
This native module requires a development client containing it; an older client reports storage
unavailable.

Updates follow the original GitHub ref (including an intentionally pinned commit), reacquire and
validate the source before replacing the accepted revision, preserving ID,
folder alias, enablement and bindings. Rejected updates leave the old package intact. Uninstall
marks the record deleted and clears bindings immediately. Superseded and uninstalled bytes remain
until next startup so already prepared turns can finish reading their pinned revisions. Startup
reconciliation runs after database initialization and removes unreferenced revisions and staging.
Both an accepted adapted revision and its original upstream revision are retained by reconciliation.
Missing package bytes are reported as setup required, not as an empty successful installation.

Any backup/restore mechanism must preserve both database records and their managed package trees.
This implementation does not add a backup archive/export workflow. Restored records without their
bytes are unavailable until repaired or reinstalled; cache recovery is never treated as installation.

Library reads use `/skills` and `/skills/:skillId`; `/agents/:agentId/skills` reads and updates bindings.
Composer search applies binding, global enablement, invocation and admission filters before its
public page boundary. Local metadata search uses stable name/ID cursors. Installation and lifecycle
operations belong to `Backend.skills`, separate from the ordinary Data API.

## Runtime And History

The Host initially resolves installed, globally enabled, bound-enabled and currently eligible
packages for this Agent, pinning each revision. After a successful conversation install, it may
append only that installed ID and exact digest from a freshly checked scope using the turn's actual
tool catalog. It never replaces a pinned revision or imports unrelated scope changes. A refresh
failure preserves the installation but reports it unavailable in this turn. Tools cannot name
another Agent or revision. Scope reads are manifest-gated and verify each file digest. The
model-facing tools are:

| Tool | Contract |
| --- | --- |
| `search_local_skills` | Scoped automatic-invocation metadata, 20 results per page |
| `load_skill` | Load a complete entry once; emit an attributed receipt and available resource paths |
| `list_skill_files` | List package paths after loading or explicit selection; at most the package file limit |
| `read_skill_file` | Read a package-local text line window; binary content is metadata only |
| `find_skills` | Resolve a supported URL or search registries; issue bounded turn-local candidate IDs |
| `prepare_skill` | Full-package assessment, optional equivalent adaptation and actual-tool admission |
| `install_skill` | Recheck preparation, install/bind for this Agent and append the accepted revision |

The initial catalog contains at most 40 bounded descriptions. Search covers the remaining eligible
scope, including eligible additions installed during the turn. A new installation still uses
`load_skill` to activate instructions and create the ordinary loading receipt. Manual-only packages
cannot be guessed into automatic loading. The composer accepts up to
eight eligible Skills and does not silently create bindings. Rejected sends keep selections; Agent
switches clear them.

Active entry instructions have a 48,000-character aggregate limit. They live in Host-owned context
outside compactable tool-result history. The generic Runtime callback refreshes that context before
Pi's next tool-loop budget and compaction decision. Oversized activation fails rather than truncating
instructions. References are read progressively and can be read again after compaction.

Only successful built-in loading receipts or Host-written user selection metadata restore active
instructions. Restoration rechecks the current binding, digest, invocation policy and prerequisites.
Old instruction/resource payloads are stripped from Runtime replay without changing durable history.
A stale activation invalidates a saved compaction checkpoint, triggering full transcript replay.
Retries exclude replaced answer receipts; explicit retries require the selected accepted revisions
to remain available. Session branches derive activation only from the copied history prefix.
The UI shows Skill name and revision receipts, without dumping instruction bodies into the tool trace.

## Verification Boundaries

The implementation includes regression cases for package identity/path validation, admission,
transactional lifecycle, scoped tools, explicit selection, history restoration, adaptation boundaries,
prepared revision checks, duplicate installation and same-turn loading. Running tests,
builds or device acceptance remains subject to the repository's user-authorization rules. Native
storage, SQLite migration, lifecycle interruption and iOS/Android UI flows need authorized execution
before release readiness can be claimed.
