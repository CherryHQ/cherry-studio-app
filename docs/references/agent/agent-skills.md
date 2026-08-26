# Agent Skills

Status: **target design; persistence and Agent integration are not yet implemented**.

Cherry Mobile Skills are controlled, description-only instruction resources. They help Pi apply a
repeatable method or domain convention, but they are not tools, extensions, packages, or executable
workspaces. Skills follow the open Agent Skills progressive-disclosure model: only each enabled
Skill's name and description are injected into every turn, and the model loads a Skill's full
instructions on demand through a controlled built-in reader tool.

## Boundary

```text
Skill definition in Cherry persistence
        ↓ enabled Agent bindings
Mobile Agent Host
        ├─ deterministic index prompt section (name + description)
        └─ frozen content snapshot behind the built-in `load_skill` tool
Pi Runtime
```

A Skill never enters `RuntimeTool[]` as an executable capability and has no execution callback of
its own. The built-in `load_skill` reader is an ordinary application capability tool, not the
Skill: it returns validated instruction text for one Skill id frozen in the current turn and has no
side effects. A Skill may explain when and how to use a capability, but the capability must already
be present in the independent immutable tool snapshot described by
[Agent Tools And Controlled Resources](./agent-tools-and-resources.md).

Enabling a Skill cannot:

- add or enable a tool;
- change `auto` / `ask` / `deny` policy;
- grant calendar, network, provider, or file permission;
- add credentials or environment variables;
- access the filesystem or network; or
- install or execute code, scripts, hooks, templates, binaries, or MCP servers.

## Definition

The logical application model is:

```ts
type AgentSkillDefinition = {
  id: string
  name: string
  description: string
  instructions: string
  source: 'builtin' | 'user' | 'imported'
  sourceUrl?: string
  version?: string
  contentHash: string
  createdAt: string
  updatedAt: string
}

type AgentSkillBinding = {
  agentId: string
  skillId: string
  enabled: boolean
  orderKey: string
}
```

The physical SQLite schema lands with Skill CRUD and Agent configuration. Definitions are stored as
validated text records, not directories. The binding is many-to-many so one controlled Skill can be
enabled for multiple Agents without copying its contents.

That migration must first reconcile the current desktop `agent_global_skill` and `agent_skill`
tables. Desktop metadata and relations required for data/backup parity remain preserved even when
their directory-backed content cannot execute on mobile; the mobile Runtime projects only validated
description text. Unsupported desktop fields are retained opaquely rather than rewritten into the
mobile format.

`instructions` is Markdown text. Import accepts one `SKILL.md`-format document — YAML frontmatter
with the open Agent Skills metadata allowlist (`name`, `description`, `version`, and source
attribution) followed by the Markdown body — so Skills interchange with the open ecosystem and
Cherry Desktop. Archives, repositories, directory trees, bundled reference files, attachments,
relative file references, symlinks, HTML script, and executable frontmatter are rejected rather
than ignored.

`contentHash` identifies the exact validated content. An external update creates an explicit new
revision or confirmed replacement; it must not silently change instructions already enabled on an
Agent.

## Progressive Disclosure And Resolution

Skills load in the open Agent Skills three-level model, bounded to two levels on mobile:

1. **Index.** Before each turn, the Host loads the Agent's enabled Skills, validates their current
   records, sorts them by `orderKey` and stable id, and freezes an index of
   `(id, name, description)` entries plus each Skill's `contentHash` into one deterministic prompt
   section. Only this index is injected every turn.
2. **Instructions on demand.** When the model decides a Skill applies, it calls the built-in
   `load_skill` tool with the Skill id. The tool returns the instruction text pinned by the frozen
   `contentHash`, so a concurrent edit never changes what an active turn reads; changes apply to
   the next turn. Loading an id absent from the frozen index fails closed.
3. **Bundled resources are excluded.** The open model's third level — reference files and scripts
   shipped beside `SKILL.md` — is not ported; a mobile Skill remains one validated text record.

Per-Skill instruction size has a fixed ceiling. The index is small and always complete: enabling
many Skills grows the always-injected context only by name/description entries, never by
instruction bodies. An invalid or over-ceiling Skill is reported as a configuration error and
omitted from the index rather than silently truncated.

Instruction precedence is:

1. platform and Runtime safety constraints;
2. Agent system instructions;
3. the Skill index and loaded Skill instructions in resolved order; and
4. user input and retrieved context for the current turn.

Loaded instruction text enters the turn as the `load_skill` tool result, not as a system-prompt
rewrite; it remains subordinate to Agent system instructions. Text claiming to override safety,
enable a missing tool, or expand the turn resource ledger has no effect. The Host wraps the index
and each loaded body with the Skill's stable id and name so Pi can distinguish instruction sources
without inventing filesystem paths.

## Trust And Privacy

- Built-in, user-authored, and imported sources remain distinguishable in persistence and UI.
- Imported text is untrusted until the user previews and confirms the exact content hash.
- Skill text must not contain stored API keys, authentication headers, calendar data, file content,
  or other runtime secrets. Capabilities receive secrets only inside their application service.
- A Skill's name and description are sent to the selected model whenever it is enabled, and its
  full instructions whenever the model loads it; the UI must disclose that model-visible behavior.
- Disabled, deleted, invalid, or over-ceiling Skills are absent from the turn index and cannot be
  loaded. The Host reports a configuration error instead of silently truncating a single Skill into
  different instructions.

## Desktop Relationship

Cherry Desktop supports Cherry-managed Skill directories and explicitly injects their paths into
Pi while disabling untrusted automatic extension discovery. Mobile keeps the open `SKILL.md`
metadata format, progressive disclosure, explicit enablement, content identity, deterministic
resolution, and fail-closed semantics. It intentionally does not port directory trees, repository
cloning, ZIP extraction, supporting files, workspace symlinks, or runtime-loaded executable
content. This is a mobile security boundary, not a competing Skill business model.

## Acceptance

- Every turn injects only the frozen index of enabled, validated Skills; instruction bodies reach
  the model only through `load_skill` against that frozen, content-hash-pinned snapshot.
- Skills are persisted application resources and never discovered from arbitrary device paths.
- A Skill cannot create tools or expand approval, OS permission, MCP, or the turn resource ledger;
  the built-in reader returns validated text only.
- Import is a single `SKILL.md`-format document, bounded, previewed, attributed, and
  content-hashed.
- Skill ordering, index content, and instruction precedence are deterministic.
- No Skill script, hook, binary, archive member, or supporting file can execute in Cherry Mobile.
