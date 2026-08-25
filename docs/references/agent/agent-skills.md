# Agent Skills

Status: **target design; persistence and Agent integration are not yet implemented**.

Cherry Mobile Skills are controlled, description-only instruction resources. They help Pi apply a
repeatable method or domain convention, but they are not tools, extensions, packages, or executable
workspaces.

## Boundary

```text
Skill definition in Cherry persistence
        ↓ enabled Agent bindings
Mobile Agent Host
        ↓ deterministic prompt section
Pi Runtime
```

A Skill never enters `RuntimeTool[]` and has no execution callback. It may explain when and how to
use a capability, but the capability must already be present in the independent immutable tool
snapshot described by [Agent Tools And Controlled Resources](./agent-tools-and-resources.md).

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

`instructions` is Markdown text. Import accepts one descriptor document and a small allowlist of
metadata fields (`name`, `description`, `version`, and source attribution). Archives, repositories,
directory trees, attachments, relative file references, symlinks, HTML script, and executable
frontmatter are rejected rather than ignored.

`contentHash` identifies the exact validated content. An external update creates an explicit new
revision or confirmed replacement; it must not silently change instructions already enabled on an
Agent.

## Resolution And Precedence

Before each turn, the Host loads the Agent's enabled Skills, validates their current records, sorts
them by `orderKey` and stable id, applies per-Skill and aggregate size ceilings, and freezes one
prompt section for the request. Changes during execution apply to the next turn.

Instruction precedence is:

1. platform and Runtime safety constraints;
2. Agent system instructions;
3. enabled Skill instructions in resolved order; and
4. user input and retrieved context for the current turn.

A Skill remains useful when it does not conflict with a higher-priority source. Text claiming to
override safety, enable a missing tool, or expand the turn resource ledger has no effect. The Host
wraps each Skill with its stable id and name so Pi can distinguish separate instruction sources
without inventing filesystem paths.

## Trust And Privacy

- Built-in, user-authored, and imported sources remain distinguishable in persistence and UI.
- Imported text is untrusted until the user previews and confirms the exact content hash.
- Skill text must not contain stored API keys, authentication headers, calendar data, file content,
  or other runtime secrets. Capabilities receive secrets only inside their application service.
- Skill text is sent to the selected model as prompt context whenever enabled; the UI must disclose
  that model-visible behavior.
- Disabled, deleted, invalid, or over-budget Skills are absent from the turn. The Host reports a
  configuration error instead of silently truncating a single Skill into different instructions.

## Desktop Relationship

Cherry Desktop supports Cherry-managed Skill directories and explicitly injects their paths into
Pi while disabling untrusted automatic extension discovery. Mobile keeps the explicit enablement,
content identity, deterministic injection, and fail-closed semantics. It intentionally does not
port directory trees, repository cloning, ZIP extraction, supporting files, workspace symlinks, or
runtime-loaded executable content. This is a mobile security boundary, not a competing Skill
business model.

## Acceptance

- Pi receives only the enabled, validated, immutable Skill text snapshot for a turn.
- Skills are persisted application resources and never discovered from arbitrary device paths.
- A Skill cannot create tools or expand approval, OS permission, MCP, or the turn resource ledger.
- Import is single-document, bounded, previewed, attributed, and content-hashed.
- Skill ordering and instruction precedence are deterministic.
- No Skill script, hook, binary, archive member, or supporting file can execute in Cherry Mobile.
