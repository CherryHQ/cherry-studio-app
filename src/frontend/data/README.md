# Frontend Data

This directory owns frontend access to `MobileBackend`: the module provider, React Query keys and
client, and React hooks that bind backend contracts to UI state.

It contains no persistence, AI, device, or integration implementations. Shared entities and DTO
schemas live in `src/shared/data`; workflow interfaces live in `src/shared/contracts`.
