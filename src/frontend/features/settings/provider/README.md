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
  directories own the dynamic route's child pages.
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
neither choice is stored. `ProviderModelAddScreen` owns both synchronization and manual creation as
two modes on one page. Model grouping, selection, synchronization previews, and health-check logic
remain private under `models/`.
