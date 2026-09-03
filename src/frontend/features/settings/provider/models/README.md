# Provider Models

This module owns provider model listing, connectivity checks, synchronization, and manual creation.

## Public Interface

- Model list leaf components and `useProviderModelGroups` are exported from `index.ts`.

## Organization

- `components/` contains provider model list UI pieces.
- `hooks/` owns displayed group state plus add/sync workflows.
- `utils/` contains pure grouping and filtering helpers, synchronization previews, and the check's
  selection resolvers.

The provider detail page exposes synchronization and manual creation as two independent header
actions. `ProviderModelAddScreen` renders the task selected by the route without a mode switch. The
legacy pull route redirects into the synchronization task.

Provider setup starts with synchronization, requires an explicit model selection, and finishes on
the validated `returnTo` href supplied by its entry point. Settings uses the provider list as the
fallback. A provider that does not expose a model list stays in the synchronization task with retry
guidance; manual creation remains available from the provider model page's separate Add action.

Model synchronization pulls the provider's whole remote catalogue once per visit. A pulled catalogue
starts with no proposed changes selected: choosing models is explicit, and the header action reports
how many changes it will apply. Manual creation opens its own form and returns to provider detail.

`useProviderModelPull` reports how a pull ended and shows nothing itself. The screen a pull runs on
has room for a full state, so an alert or a toast from the hook would put the same sentence on
screen twice.
