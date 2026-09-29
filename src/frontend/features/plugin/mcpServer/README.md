# MCP Server

This page branch owns `/plugins/mcp/[serverId]`, which creates a user-added MCP server (`new`) or
edits an existing one. The Plugins page's MCP group is its entry: the Custom row creates, and each
server row edits. A created server returns to that list.

## Organization

- `McpServerScreen.tsx` owns server editing and tool configuration.
- `components/` contains the page's sections and native adapters.
