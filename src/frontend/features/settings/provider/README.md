# Provider

This page branch owns the `/settings/provider` list and its child pages.

## Public Interface

- The list page is exported from this directory's `index.ts`; every child page has its own public
  `index.ts`.
- `useProviderListNavigation` lets the parent settings page open and prefetch the provider list.
  Its route, query key, pagination, and cache policy remain private to this branch.
- Provider avatar persistence stays private to this page branch under `hooks/`.

## Organization

- `catalog/` and `new/` own direct provider-list child pages.
- `detail/` owns `/settings/provider/[providerId]`; its `edit/`, `modelAdd/`, and `modelPull/`
  directories own the dynamic route's child pages. Model synchronization and manual model creation
  are separate entry points and do not switch modes inside either task.
- `apiService/` owns API key, authentication, endpoint draft, dirty-state, and save behavior.
- `components/` contains UI shared within the provider page branch. Page-specific UI stays in the
  child page's own `components/` directory.
- `hooks/` contains provider-owned persistence and deletion behavior.
- `models/` owns provider model grouping, synchronization, health checks, and list UI.
- `components/ProviderForm/` owns the compound form shared by provider creation and provider detail.

## Provider Catalog

`catalog/ProviderCatalogScreen` owns the bundled provider catalog. A fixed custom-provider row is the first
item in the recommended section; preset rows keep their explicit Add action. Both paths continue to
`new/ProviderCreationScreen`, which renders the shared provider form before model synchronization. The
catalog carries a validated `returnTo` href through creation and model selection; finishing setup
returns to the requesting surface, or to the provider list when settings opened the flow.

## Provider Form

`ProviderForm` is a compound component over one draft: `ProviderForm.Avatar`, `.Name`, `.BaseUrl`,
and `.ApiKey`. The draft lives in `useProviderFormDraft`, which the screen calls and passes down so
the screen can drive its visible Save action from the same state. Creation and detail compose the
same form with different slots instead of configuring it with screen flags.

## Connectivity And Models

The connectivity check selects one provider-scoped model and uses the first enabled API key;
neither choice is stored. Checks and ordinary synchronization never change provider activation.

`useProviderSetup` owns the explicit activation path: inspect persisted configuration, repair missing
credentials or endpoints with the shared creation form, and enable directly when a supported enabled
model already exists. Otherwise, continue through synchronization or its independent manual-add
fallback. `returnTo` preserves the requesting surface; `enableProvider` explicitly identifies model
tasks that must complete activation. Saving models and enabling a provider have separate outcomes,
so an activation failure can be retried without adding the same models again.

The model tab has separate synchronization and manual-add icon actions. It lists all installed
provider models for management, labels unavailable models, and supports detail, edit, contextual
menus, and scoped multi-selection. The detail page's `model/` branch owns model inspection and its
`edit/` child. Model grouping, deletion protection, selection, and synchronization remain under
`models/`.
