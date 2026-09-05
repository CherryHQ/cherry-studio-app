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

Activation requires valid stored configuration and at least one enabled model supported by the app.
Synchronization and health checks are read-only with respect to provider activation. Setup model tasks
carry an explicit `enableProvider` intent; completion enables through the providers backend module and
returns to the validated `returnTo` href. A failed enable retains saved models for a direct retry.

Synchronization pulls the catalogue once per visit, cancels the request when leaving, and starts with
no changes selected. Errors are classified into configuration, authentication, network, timeout,
unavailable-directory, and rate-limit outcomes. The screen owns inline feedback and routes to
configuration repair or an independent manual-add task with the same setup intent and return target.
An empty directory also offers manual creation. Removal results report protected skipped models.

The management list uses CherryUI context menus and a scroll boundary. A tap opens details; a long
press offers details, editing, selection, and deletion. Selection disables navigation and endpoint
controls, retains the current filter scope, and uses stable model IDs. The list owns selection until
the user leaves the mode or deletion succeeds; a failure retains surviving selected IDs.

Management deletion uses the transactional model DELETE endpoint, not synchronization reconcile,
which intentionally protects custom models. Default model assignments block deletion and link to
model settings. Agent bindings are cleared by the existing database foreign key; model and Agent
queries are refreshed, including inactive Agent detail caches. The single request limit is 1000 IDs.
