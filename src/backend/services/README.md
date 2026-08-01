# Backend Services

This directory is the mobile counterpart of Cherry Desktop's `src/main/services`. It owns
backend-facing product workflows, platform capabilities, and third-party services that do not
belong to AI or entity persistence.

The correspondence is by responsibility, not by file. Desktop process boundaries place some
equivalent workflows in DataApi handlers, Main AI modules, or renderer owners. Mobile keeps those
rules here when they belong behind the in-process Data API or workflow seam.

## Ownership

- `chat`, `models`, `paintings`, `mcp`, `providers`, `permissions`, and `profile` implement
  multi-step contract behavior.
- `oauth`, `cherryin`, `webSearch`, device permissions, and avatar storage own platform or
  third-party runtime behavior. `oauth` holds the provider-generic OAuth runtime (see its
  [README](./oauth/README.md)); `cherryin` holds that one provider's own REST surface.
- `src/backend/data/services` remains reserved for entity persistence and data-specific
  transformations.
- `src/backend/ai` remains reserved for AI SDK, provider, MCP runtime, message, and tool behavior.

Workflow services accept coordinated capabilities through constructor interfaces. Concrete graph
assembly and lifecycle ownership remain in `src/bootstrap`.
