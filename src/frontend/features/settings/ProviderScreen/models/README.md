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
legacy pull route redirects into its synchronization mode. The detail list itself is browse-only and
opens model creation from the header.

Provider setup hides the mode switch, requires an explicit model selection, and finishes on the
provider list. A synchronization that comes back with nothing to add reveals the switch and keeps it
revealed: the provider is already created by then, and a self-hosted endpoint that serves chat
without a model list still has to be given one model by hand.

Model management opened from provider detail lands on manual mode and returns to detail.
Synchronization pulls the provider's whole remote catalogue the moment it opens, which is too much
to spend on a header button that is just as often one model typed by hand. Switching to the
synchronization tab still pulls, once per visit.

`useProviderModelPull` reports how a pull ended and shows nothing itself. The screen a pull runs on
has room for a full state, so an alert or a toast from the hook would put the same sentence on
screen twice.
