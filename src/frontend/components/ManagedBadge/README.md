# ManagedBadge

`ManagedBadge` marks an Agent, Skill, or MCP server delivered by the enterprise server, shared by the
Agent, plugin, and Skill pages. Callers render it only when the record's `isManaged` is true; the
badge owns its wording and lock icon, not the read-only behavior of the surface that shows it. A
row that sets its own `accessibilityLabel` includes the badge text in that label.
