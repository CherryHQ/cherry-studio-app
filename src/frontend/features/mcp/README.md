# MCP

This feature owns MCP server discovery, editing, runtime status, and tool rules.

## Public Interface

Route screens are exported from `index.ts`. Components, header helpers, and tests remain private to
the feature.

## Organization

- `McpScreen.tsx` owns the server list and runtime summaries.
- `McpServerScreen.tsx` owns server editing and tool configuration.
- `components/` contains MCP-specific screen sections and native adapters.
