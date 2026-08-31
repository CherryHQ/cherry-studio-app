# Provider Models

This module owns provider model listing, connectivity checks, synchronization, and manual creation.

## Public Interface

- Model list leaf components and `useProviderModelGroups` are exported from `index.ts`.

## Organization

- `components/` contains provider model list UI pieces.
- `hooks/` owns displayed group state plus add/sync workflows.
- `utils/` contains pure grouping and filtering helpers, synchronization previews, and the check's
  selection resolvers.

`ProviderModelAddScreen` exposes synchronization and manual creation as modes of one page. The
legacy pull route redirects into its synchronization mode. Provider creation marks the route to
finish at the provider list; model management opened from provider detail returns to detail instead.
The detail list itself is browse-only and opens model creation from the header.
