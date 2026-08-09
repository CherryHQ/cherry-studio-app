# Message Content

This module renders the structured parts inside a chat message.

## Internal Interface

- `MessageParts` is exported from the local `index.ts` for message rows inside this module.
- Individual part renderers in `components/` are implementation details owned by this module.

## Organization

- `components/` maps Cherry message part types to React Native UI.
- `hooks/` owns rendering configuration shared by the part renderers.

When adding support for a new message part type, add a focused renderer in `components/` and route it
from `MessagePart`.
