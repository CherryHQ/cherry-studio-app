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

`ProviderCatalogScreen` owns the bundled provider catalog. A fixed custom-provider row is the first
item in the recommended section; preset rows keep their explicit Add action. Both paths continue to
`ProviderCreationScreen`, which renders the shared provider form before model synchronization. A
preset is imported in the disabled state so its registry defaults can seed the form, then its API key
and editable endpoint are saved before model discovery starts. Finishing synchronization opens the
provider detail model tab. Opening the catalog checks the remote model-registry manifest and shows an
inline update notice when a newer revision exists. Installed presets are marked in place instead of
opening another action menu.

## Provider Form

`ProviderForm` is a compound component over one draft: `ProviderForm.Avatar`, `.Name`, `.BaseUrl`,
and `.ApiKey`. The draft lives in `useProviderFormDraft`, which the screen calls and
passes down (`<ProviderForm value={form}>`) so the screen can drive its visible Save action from the
same state. Creation places that action below the form; detail keeps it in the page header.

Screens differ by which slots they compose, not by flags:

- Provider creation composes avatar, name, Base URL, and API keys. Custom providers require all three
  text fields. Presets seed their name, logo, and endpoint from the registry and require an API key
  unless their registry metadata marks authentication optional. New providers remain disabled until
  model synchronization writes at least one model.
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
