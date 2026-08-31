# Provider Settings

This module owns the four provider-setting experiences: provider list, provider creation, provider
detail, and model creation.

## Public Interface

- `ProviderModelList` and `useProviderDetailSettings` are exported from `index.ts`, alongside the
  screens themselves. The legacy edit and model-pull routes only redirect into the consolidated
  screens; the new-provider route owns custom-provider creation.
- API service form hooks, fields, and pure helpers are exported from `apiService/index.ts`.
- The shared provider form is exported from `providerForm/index.ts`.

## Organization

- `components/` contains provider detail page sections.
- `apiService/` owns API key, auth, endpoint draft, dirty-state, and save behavior.
- `detail/` owns provider detail data loading.
- `models/` owns provider model grouping and list UI.
- `providerForm/` owns the compound form shared by provider creation and provider detail.

## Provider Catalog

`ProviderCatalogScreen` owns the bundled provider catalog. Its right-header plus action opens the
separate `ProviderCreationScreen` for custom providers; there is no in-page creation mode switch.
Catalog rows use an explicit import action, while custom providers use the visible Save button below
the form. After either path creates a provider, the route is replaced by the model synchronization
page. Finishing synchronization returns directly to the provider list, without passing through
provider detail. Opening the catalog checks the remote model-registry manifest and shows an inline
update notice when a newer revision exists. Installed presets are marked in place instead of opening
another action menu.

## Provider Form

`ProviderForm` is a compound component over one draft: `ProviderForm.Avatar`, `.Name`, `.BaseUrl`,
and `.ApiKey`. The draft lives in `useProviderFormDraft`, which the screen calls and
passes down (`<ProviderForm value={form}>`) so the screen can drive its visible Save action from the
same state. Creation places that action below the form; detail keeps it in the page header.

Screens differ by which slots they compose, not by flags:

- The custom-provider creation page composes avatar, name, Base URL, and API keys, and adds its own "Base URL is
  required" rule on top of `meta.canSubmit`. New custom providers use the product default enabled
  state; enabled state is managed directly from the provider-list row after creation.
- The detail page composes the same draft for provider identity, endpoint, and API keys. It saves
  the whole draft explicitly and uses the provider's built-in logo as the avatar fallback.

A provider whose auth type has no editable URL (AWS, GCP) yields no endpoint types, and both
endpoint slots render nothing.

The form is laid out the way the Agent editor is: a circular `AvatarPickerField` over bare fields.
Required state is expressed by Save staying disabled rather than by an asterisk.

## Connectivity Check

The check section selects one provider-scoped model through `ModelPickerDrawer`, whose header search
button can open app search, and uses the first enabled API key. Neither choice is stored — a check is
something you run — so the section keeps the model in local state. A result is tagged with the model
and key it ran with, so picking another one stops showing it.

## Model Creation

`ProviderModelAddScreen` owns both synchronization and manual creation as two modes on one page. The
sync preview keeps search and multi-selection in place; the manual mode keeps the model form. Both
modes commit through the same visible Save action. The provider detail model tab exposes creation as
its single right-header plus action; its content starts directly with search and the model list.
