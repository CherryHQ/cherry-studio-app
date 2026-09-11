# Agent Skills

> Status: design for general Skills. Skill persistence, importing, and Agent-to-Skill bindings are not
> implemented. Bundled plugin guides are implemented separately as described below.

Cherry Mobile Skills are application-owned instruction resources designed for the mobile Agent
surface. Agent configuration selects which Skills are enabled. For each Session turn, the Host
resolves that current configuration and provides only the enabled, mobile-supported Skills; it never
loads the application's entire Skill catalog into the Session.

## Boundary

```text
Mobile Skill definitions
        ↓ current Agent configuration
Mobile Agent Host
        ↓ prepared instruction context
Pi Runtime
```

Cherry owns Skill storage, validation, attribution, enablement, and user-facing compatibility
status. The Host resolves the current Agent's enabled Skills before execution. Pi receives only the
prepared instruction context and does not read Skill persistence directly.

A Skill is not a tool or executable extension. Enabling one cannot add a capability, change tool
approval, grant OS permission, expand MCP access, expose credentials, or widen the turn resource
ledger. A Skill may explain how to use a capability only when that capability is independently
available to the Agent.

## Mobile Scope

Mobile defines its own supported Skill format and behavior. Desktop Skills may depend on directory
trees, workspaces, shell commands, scripts, hooks, local MCP processes, or other Electron/Node
capabilities that do not exist on mobile. Their persisted metadata and Agent relationships remain
available for data and backup parity, but retention does not make their content executable by the
mobile Runtime.

A future importer may adopt compatible `SKILL.md` conventions, but it must document the exact
mobile subset and report unsupported content explicitly. This document does not promise full Cherry
Desktop or open-ecosystem Skill compatibility.

The initial product scope exposes Skill-enabled Agents only with models that support native tool
calling. Product behavior for other models is deferred and must fail clearly rather than silently
changing the Agent's configured behavior.

## Trust And Privacy

- Built-in, user-authored, imported, desktop-retained, and unsupported Skills remain distinguishable
  in persistence and UI.
- Imported or edited instructions require validation and an explicit user confirmation before they
  become enabled.
- Skill content must not store credentials, private runtime data, or managed-file contents.
- Mobile does not execute Skill scripts, hooks, binaries, archives, or supporting files.
- Disabled, deleted, invalid, or unsupported Skills are not projected into Agent execution.

## Bundled Plugin Guides

GitHub, Amap and Feishu bundle workflow guides as TypeScript data with template-string content.
Feishu guidance includes document search, people lookup, wiki links, Base records, tasks and calendars.
The Host selects sections from the current Agent's executable plugin tools for each turn, with
source/revision attribution and no saved prompt or transcript mutation. The plugin detail page
provides a read-only full-guide preview.
The [plugin module contract](../../../src/backend/services/builtInMcp/README.md#plugin-guides)
defines the data contract, validation, prerequisite filtering, ordering, size limits and updates.

This slice follows the instruction-only boundary above and uses existing plugin bindings; it does
not implement general Skill selection, persistence, an importer, or an executable extension system.
Those contracts remain deferred and must not be inferred from the bundled guide format.

## Acceptance

- Every Session uses only the mobile-supported Skills enabled in its current Agent configuration.
- Skill selection never falls back to the global catalog or another Agent's configuration.
- Skills cannot add tools, permissions, credentials, MCP access, or managed-file grants.
- Desktop Skill data is retained without claiming desktop Runtime compatibility.
- General Skill loading and persistence remain open beyond the implemented bundled guide subset.
