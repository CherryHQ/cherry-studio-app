# MCP Server

This page branch owns `/plugins/mcp/[serverId]`, which creates a user-added MCP server (`new`) or
edits an existing one. The Plugins page's MCP group is its entry: the Custom row creates, and each
server row edits. A created server returns to that list.

## Organization

- `McpServerScreen.tsx` owns the page, laid out like a plugin's: identity and status, directly
  editable connection fields with a save footer, and the server's tool switches. Enabling,
  disabling, and deleting live in the header's more menu.
- `components/` contains the tools section, which keeps each tool to one compact row.
- `hooks/` owns the tools query.

New connections expose the local name before their first save. A typed name takes precedence over
server discovery metadata; when left blank, discovery supplies the initial name and a failed save
keeps it editable. The persistence owner still rejects duplicate names because tool namespaces must
remain unique. A structured name conflict offers rename guidance, while stale-edit conflicts and
connection-probe failures have separate translated outcomes.
