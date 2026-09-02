# MCP

This page branch owns `/settings/mcp` and its server child page.

## Public Interface

The root and `server/` pages expose separate route boundaries. Components, header helpers, and tests
remain private to the page that uses them.

## Organization

- `McpScreen.tsx` owns the server list and runtime summaries.
- `server/McpServerScreen.tsx` owns server editing and tool configuration.
- `server/components/` contains the server page's sections and native adapters.
