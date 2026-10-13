# Agent Skills

Standard mode exposes Skill discovery, installation and reading only when the selected model
supports native function calling, matching Desktop's tool-catalog gate. Models without function
calling still support ordinary chat and supported direct images; explicit Skill selections and
installation requests fail before discovery. Minimal mode does not use Skills. **Add in chat**
is offered only while the current Agent is in standard mode; without a current Agent it uses a
standard-mode Agent, and opens the Agent list with setup guidance when none exists.

Cherry Mobile owns Skill discovery, package validation, installation, Agent bindings and per-turn
instruction context. Plugins and Skills have separate sidebar entries and pages.
The Skills library provides installed search, details, update and uninstall.
Installed Skills are available by default, with no library enablement switch. Agent settings enable
Skills individually for each Agent; the chat composer selects eligible bindings for a message.
An Agent toggle makes a Skill available for the model to choose when relevant. A composer reference
requests its use and supplies its full instructions for that turn; it is not a request to install
the Skill or open a file viewer.

Structured notes, research brief and daily agenda are app-owned system workflows. The Host includes
their instructions and templates in internal system context, independently of installed packages or
Agent bindings. Calendar and research workflows are included only when all their required built-in
tools are present in the current turn. They are not listed, recommended, installable or selectable
in user Skill pages. Earlier `builtin` installation records and package bytes remain available to
backups, but are excluded from user reads, binding updates and installed runtime scope. Installing a
user package with the same folder name replaces that hidden legacy record and its bindings; its old
bytes follow ordinary storage reconciliation.

## Ownership And Authority

```text
backend/services/skill       sources → package validation → managed installation
backend/data                 installed package facts + Agent binding preferences
backend/ai/agent/host         current eligibility → accepted scope → active instructions
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

Keyword search uses skills.sh and returns listings only; nothing is downloaded until a listing URL
is resolved. The same registry's all-time leaderboard supplies the popular list: its first page,
bounded to 50 listings with their install counts. Listings from publishers other than a GitHub
`<owner>/<repo>` cannot resolve to a package and are omitted from both. skills.sh pages and
public GitHub repository, directory, raw entry and `SKILL.md` links resolve to GitHub packages;
repositories with multiple Skills return candidates, with a maximum of 20 package directories.
Like desktop, a package's folder name is its declared name and holds one installation. A candidate
from the same origin (GitHub owner, repository and directory) reuses it; a
different package with the same name is refused.

GitHub resolution pins a ref to a commit and acquires the complete package directory, including a
repository-root package when present. Truncated trees, symlinks and submodules are rejected. Sources
must be public and resolvable through their supported interfaces; they use the project HTTP client,
bounded responses and cancellation. There is no script runner; local adaptation edits only entry
instructions after explicit user review.

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

## Package Acceptance And App Limitations

Installation and updates validate the package format, paths, integrity and size. Missing tools,
permissions, model tool calling or script interpreters do not block installation or instruction
loading. Scripts, references, templates and other accepted resources are preserved together.

Limitations compare two fixed things: what the package asks of its host, and what this build of the
app provides. Neither side depends on the user's configuration. A missing permission, web-search
provider, drawing model, plugin connection or Agent capability is the user's to configure, and the
owning tool reports it when a step runs.

- **The package's side** is two stored facts. Its script files come from the accepted manifest:
  shell and Python files anywhere, plus JavaScript, TypeScript, Ruby, Perl and PHP files under
  `scripts/`. Schemas and data kept beside scripts are not counted, and neither are source files
  elsewhere, which are usually templates. Its declared tools are the names in the `allowed-tools`
  frontmatter without their argument patterns, read once from the accepted bytes at installation and
  again on update, then stored in `agent_global_skill.profile`. Prose, mentioned commands and the
  free-text `compatibility` note are never interpreted.
- **The app's side** is a table in `skillCompatibility.ts`. The app runs no package script: `run_js`
  evaluates only code the model writes. For declared tools, the table maps each known desktop tool
  name to the built-in tool that covers it, or marks it as having no counterpart. Names outside the
  table, such as MCP tools, are unknown and never reported.

Reads compare the stored manifest and profile with the app in memory and perform no I/O, so a newer
app build that adds a capability or refines the script rule corrects every installed Skill without
touching stored data. Profiles written by the earlier environment evaluation are read as empty until
the Skill's next update.

The detail and candidate pages state the result as facts — the number of script files the app cannot
run, and the declared tools it does not provide — beside the general execution hint. They never
conclude whether a Skill is usable, and list rows stay free of it. The only other condition the
library, candidate and Agent settings pages report is a missing package, with the instruction to
check for updates.

Limitations describe the app rather than grant or deny access. Binding, global enablement,
invocation policy and readable package bytes determine instruction access. Missing package bytes
exclude a Skill from loading and composer selection; limitations do not. The Agent receives the same
facts with loaded instructions — the number of script files rather than their paths, because this
text shares the instruction budget with the body — and must explain an unavailable capability before
a step that needs it. Reading a script must never be reported as running it.

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
composer plus menu only selects already installed Skills. Manual discovery is available through
**Discover Skills** in the same **More** menu. That page opens on the popular list, so it offers
something to browse before any query; its search shows the same list while the query is empty.

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
search-only requests do not authorize installation. An existing installation from the same origin
is reused for a new Agent without republishing its files, preserving local adaptations.

## Local Adaptation

When a loaded Skill requires structurally unavailable desktop execution, `adapt_skill` proposes
up to three exact substitutions in the current `SKILL.md` body. It may replace execution with
tools actually exposed in this turn, or remove a passage explicitly marked optional. At least two
thirds of the body must remain untouched. Frontmatter, identity, source metadata, references,
templates and binary resources stay intact. Normalized instruction line endings can be matched
without changing the original bytes outside the edited passages.

The existing `UserQuestionSheet` displays the actual before/after text, reasons, and a notice that
the one local Skill changes for all Agents using it. The tool itself requests this choice through
the Host question port, including in automatic tool approval mode. It does not rely on the model
remembering to ask. Only the explicit adaptation option with no unresolved custom input permits
saving. Refusal, skipping, free-text-only answers and cancellation leave files unchanged. The tool
rechecks current Agent access and package integrity after the answer; an internal content-hash
comparison in the write transaction rejects concurrent changes instead of overwriting them.

Saving publishes a fully validated package and switches the one current installation atomically,
preserving bindings. It does not create user-managed versions or per-Agent variants. The accepted
scope and the same per-Skill Runtime instruction section are replaced before continuing the original
task. A saved receipt with the actual changes stays inline outside the completed process disclosure,
even if the model supplies no explanatory prose. A post-save refresh failure reports that saving
succeeded and requests a new message instead of claiming current-turn execution support.

Tool availability and bounded text changes do not prove semantic equivalence. The model must
preserve the core goal, output, data scope, validation and approval rules. Configuration problems,
disabled tools, denied permissions and transient failures are not grounds for permanent deletions.
If a core function has no supported replacement, it must report that limit rather than delete it
and claim success. Explicit upstream updates still replace current local content from its source.

## Persistence And Lifecycle

`agent_global_skill` and `agent_skill` match desktop's columns, defaults and index names. Mobile
writes `source` as `marketplace` (GitHub-hosted packages); `builtin` remains readable for legacy
installations and backups. It writes `source_url` as the URL updates re-resolve, and `is_enabled`
as global enablement; new
installations and conversation bindings are written enabled. Desktop's `namespace` is absent
because app-owned system workflows live in Host instructions rather than user installations.
Three mobile columns follow the shared ones: `manifest` lists accepted files for backup completeness and package-local reads,
`profile` holds the tool names the package declares, and
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
Agent, reading accepted package snapshots. After a successful conversation install, it may append
only that installed ID and exact digest from a freshly checked access scope. Consented local
adaptation may replace an existing entry with its freshly checked current package. A refresh failure preserves the installation but
reports it unavailable in this turn. Tools cannot name another Agent or revision, and reads are
limited to paths in the accepted manifest. The model-facing tools are:

| Tool | Contract |
| --- | --- |
| `search_local_skills` | Scoped automatic-invocation metadata, 20 results per page; `include_manual` includes manual-only metadata for an explicit inventory request without granting instruction access |
| `load_skill` | Read a complete entry; emit an attributed receipt and available resource paths; repeat reads recover the body without another budget charge |
| `list_skill_files` | List package paths after loading or explicit selection |
| `read_skill_file` | Read a package-local text line window; binary content is metadata only |
| `find_skills` | Search skills.sh, or list the Skills behind a supported URL |
| `install_skill` | Validate, install and bind one Skill for this Agent; append it to the turn |
| `adapt_skill` | Review bounded local entry changes in the existing question sheet, save on explicit consent and replace current-turn instructions |

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

The prompt reports the Agent's complete bound/readable package count and its automatic-invocation
subset, even when either is zero, and distinguishes them from the app's installed library, explicit
selections and app-owned system workflows. Current inventory questions use `search_local_skills`
with an empty query and `include_manual: true`: `total` is the requested scoped inventory count,
`automaticTotal` is its automatically invocable subset, `matched` is the query count, and `returned`
is one page. Complete lists follow `nextCursor` until null with the same options. This also refreshes
inventory after a conversation installation without loading every package's instructions. Default
automatic discovery and `load_skill` retain the manual-only invocation gate.

Active entry instructions have a 48,000-character aggregate limit and at most 64 entries; oversized
activation fails rather than truncating instructions. Explicit selections and previously active
instructions seed individually replaceable Runtime system sections. A new automatic `load_skill` returns a
trusted Runtime instruction contribution carrying the full body. The Pi adapter commits that contribution to a native
conversation document and renders it through a native prompt section before every model request,
including after compaction or reopening the same working copy. This follows Pi Durable's
[extension-state example](https://github.com/earendil-works/pi/blob/main/packages/durable/test/examples/11-extension-state.ts),
not a dedicated upstream Skill API. The tool result is a compact receipt pointing to the system
instructions; the body is never stored in the transcript. MCP results cannot contribute these
instructions.

The next Host configuration atomically replaces this per-execution document with rebuilt currently
applicable instructions. Old or disabled Skills therefore cannot survive through native document
state. Repeat entry reads return the complete current body without charging the unique activation
budget again. References and templates remain progressive reads via `list_skill_files` and
`read_skill_file`; having already loaded the entry does not forbid reading its referenced files.

On later turns the Host restores active instructions into the system instructions, outside the
history Pi may compact. It reads successful built-in loading receipts and Host-written user
selection metadata from the Cherry transcript, so restoration also works after a working copy is
rebuilt. It loads the Skill's current revision while the Skill stays bound, enabled, eligible and
invocable in the same way; a Skill that no longer qualifies simply stops contributing instructions.
Retry and regeneration resubmit the original message's selections and find-and-install action. The
UI shows automatic loading as **Read Skill** with the Skill name. Its activity details show only the
Skill's name and description; an installation's show its name and source. Neither repeats the
instruction body nor links into the library. The library's
read-only instruction viewer reads the current installed
revision through `GET /skills/:skillId/instructions`, without enabling or executing it. Explicit
selection does not create a synthetic loading call; its inline composer reference already expresses
the user's request.

## First-Version Scope

The current implementation reuses existing load receipts and Host prompt assembly across turns, and
Pi's native document/section extension mechanism within a running execution. Later turns use the
current installed revision; a running turn keeps its prepared package scope except for its own
consented local adaptation. There is no separate
application activation table, session-specific unload protocol, or archive of historical package
files. Tool results keep receipts, not instruction bodies. Remote script execution remains out of
scope.
Backups continue to include live installations and the existing conversation records.
