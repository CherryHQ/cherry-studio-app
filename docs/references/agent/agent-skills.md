# Agent Skills

Cherry Mobile owns Skill discovery, package validation, installation, Agent bindings and per-turn
instruction context. The first implementation includes three reviewed bundled packages: structured
notes, research brief and daily agenda. Plugins and Skills have separate sidebar entries and pages.
The Skills library provides installed search, details, environment guidance, update and uninstall.
Installed Skills are available by default, with no library enablement switch. Agent settings enable
Skills individually for each Agent; the chat composer selects eligible bindings for a message.
An Agent toggle makes a Skill available for the model to choose when relevant. A composer reference
requests its use and supplies its full instructions for that turn; it is not a request to install
the Skill or open a file viewer.

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

The main entry is **Sidebar → Skills → More → Add in chat**, with a direct **Add Skill** action in the
empty library. It returns to chat with a fresh
draft and a removable built-in `find-skills` reference inside the input, using the same presentation
as plugin references. It uses the current available Agent or the first available Agent as fallback.
A shared composer handoff carries the action exactly as draft content;
its token is the only handoff data in navigation parameters. Opening the draft does not send a
message or install a package. Sending persists the structured `find-and-install` intent on the user
message, including retries. Deleting the reference cancels the installation intent. Rejected sends
retain the reference, successful sends clear the submitted selection, and switching Agents clears it.
The app-owned discovery instructions are always available
when management tools are present, so no bootstrap package needs to be installed first. The
composer plus menu only selects already installed Skills. Manual search and bundled recommendations
are available through **Discover Skills** in the same **More** menu.

Installed and discovery searches use the shared App Search route, which owns the input, cancellation
and result selection. Selecting a discovery listing opens its detail page before resolving and
inspecting the package. The chat's separate Skills menu uses the same anchored popover as Plugins;
it preserves the keyboard and inserts existing Agent bindings as inline references. Deleting a
reference removes its selection. Submission records both Skill and plugin references against the
final plain prompt, adjusting plugin offsets as Skill link syntax is removed. User messages retain
the same inline icon and name as the input, without a separate selected-Skill or revision caption.
Older messages recover inline names from their selection receipts when no display range was stored.
Skill references display desktop's ToolCase icon beside the name at the input's font size and in its
link color. The plus menu, picker rows and sidebar use the same Lucide icon. Their identity stays in
the editor link. Inline artwork is tagged so the native paste wrapper keeps it inside the text and
does not import it as a file attachment.

The Agent uses two tools. `find_skills` searches skills.sh with keywords or lists the Skills behind a
URL; it never installs. `install_skill` takes one URL, resolves and downloads it, validates
the package, installs it and enables it for the current Agent in the same transaction. A URL with
several Skills returns their URLs for the model to choose from. Package validation failures return their
reason codes so the Agent can explain them. The built-in reference expresses installation intent and makes
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
| `load_skill` | Read a complete entry; emit an attributed receipt and available resource paths; repeat reads recover the body without another budget charge |
| `list_skill_files` | List package paths after loading or explicit selection |
| `read_skill_file` | Read a package-local text line window; binary content is metadata only |
| `find_skills` | Search skills.sh, or list the Skills behind a supported URL |
| `install_skill` | Validate, install and bind one Skill for this Agent; append it to the turn |

These are directly exposed built-in functions, not MCP catalog entries. `tool_search` searches only
MCP tools, so no matches there say nothing about Skill access. Pi Durable does not need a desktop
filesystem path: the Host reads the app-managed `SKILL.md`, selected instructions go into the system
prompt, and automatic loading returns the body through `load_skill`.

The initial catalog contains at most 40 whole name/ID/description entries within a 12,000-character
metadata budget. Descriptions are not individually truncated: their trailing usage conditions must
remain available for model routing. When either bound omits entries, the prompt directs the model to
search before concluding that no Skill fits. Search covers the remaining eligible
scope, including eligible additions installed during the turn. A new installation still uses
`load_skill` to activate instructions and create the ordinary loading receipt. Manual-only packages
cannot be guessed into automatic loading. The composer accepts up to eight eligible Skills and does
not silently create bindings.

Active entry instructions have a 48,000-character aggregate limit; oversized activation fails rather
than truncating instructions. Explicit selections and previously active instructions are quoted in
the Host's prepared system instructions. A new automatic `load_skill` returns the full body and a
trusted Runtime instruction contribution. The Pi adapter commits that contribution to a native
conversation document and renders it through a native prompt section before every model request,
including after compaction or reopening the same working copy. This follows Pi Durable's
[extension-state example](https://github.com/earendil-works/pi/blob/main/packages/durable/test/examples/11-extension-state.ts),
not a dedicated upstream Skill API. The model-facing tool result is a compact receipt pointing to
the system instructions; the full body stays in the persisted display result for inspection. MCP
results cannot contribute these instructions or replace their model-facing value.

The next Host configuration atomically clears this per-execution document after rebuilding currently
applicable instructions. Old or disabled Skills therefore cannot survive through native document
state. Repeat entry reads return the complete pinned body without charging the unique activation
budget again. References and templates remain progressive reads via `list_skill_files` and
`read_skill_file`; having already loaded the entry does not forbid reading its referenced files.

On later turns the Host restores active instructions into the system instructions, outside the
history Pi may compact. It reads successful built-in loading receipts and Host-written user
selection metadata from the Cherry transcript, so restoration also works after a working copy is
rebuilt. It loads the Skill's current revision while the Skill stays bound, enabled, eligible and
invocable in the same way; a Skill that no longer qualifies simply stops contributing instructions.
Retry and regeneration resubmit the original message's selections and find-and-install action. The
UI shows automatic loading as **Read Skill** with the Skill name. Opening its activity details shows
the exact returned instruction body and revision, plus a separately labeled link to the current
installed Skill details. The library's read-only instruction viewer reads the current installed
revision through `GET /skills/:skillId/instructions`, without enabling or executing it. Explicit
selection does not create a synthetic loading call; its inline composer reference already expresses
the user's request.

## First-Version Scope

The current implementation reuses existing load receipts and Host prompt assembly across turns, and
Pi's native document/section extension mechanism within a running execution. Later turns use the
current installed revision; a running turn keeps its prepared package scope. There is no separate
application activation table, session-specific unload protocol, or archive of historical package
files. Existing tool results retain their returned bodies for activity inspection; that snapshot is
not permission to read removed package resources. Remote script execution remains out of scope.
Backups continue to include live installations and the existing conversation records.
