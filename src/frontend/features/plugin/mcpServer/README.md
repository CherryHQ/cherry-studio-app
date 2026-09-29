# MCP Server

This page branch owns `/plugins/mcp/[serverId]`, which creates a user-added MCP server (`new`) or
edits an existing one. The Plugins page's MCP group is its entry: the Custom row creates, and each
server row edits. A created server returns to that list.

## Organization

- `McpServerScreen.tsx` owns the page, laid out like a plugin's: identity and status, directly
  editable connection fields with a save footer, and the server's tools. Enabling, disabling, and
  deleting live in the header's more menu.
- `components/` contains the tools section.
