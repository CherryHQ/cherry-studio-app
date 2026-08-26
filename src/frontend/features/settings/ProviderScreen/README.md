# Provider Settings

This module owns provider detail settings, API service settings, and provider model management UI.

## Public Interface

- `ProviderModelList` and `useProviderDetailSettings` are exported from `index.ts`, alongside the
  screens themselves.
- API service form hooks, fields, and pure helpers are exported from `apiService/index.ts`.
- The shared provider form is exported from `providerForm/index.ts`.

## Organization

- `components/` contains provider detail page sections.
- `apiService/` owns API key, auth, endpoint draft, dirty-state, and save behavior.
- `detail/` owns provider detail data loading.
- `models/` owns provider model grouping and list UI.
- `providerForm/` owns the compound form both `NewProviderScreen` and `ProviderEditScreen` compose.

## Provider Form

`ProviderForm` is a compound component over one draft: `ProviderForm.Avatar`, `.Name`, `.BaseUrl`,
`.ApiKey`, and `.Endpoints`. The draft lives in `useProviderFormDraft`, which the screen calls and
passes down (`<ProviderForm value={form}>`) so the screen can drive its own header from the same
state.

Screens differ by which slots they compose, not by flags:

- `NewProviderScreen` composes every slot, including `ProviderForm.ApiKey` for a first key, and adds
  its own "Base URL is required" rule on top of `meta.canSubmit`.
- `ProviderEditScreen` leaves `ProviderForm.ApiKey` out — an existing provider's keys are a list with
  per-key state, managed from the detail page — and passes the provider's built-in logo as
  `ProviderForm.Avatar`'s fallback.

A provider whose auth type has no editable URL (AWS, GCP) yields no endpoint types, and both
endpoint slots render nothing.

The form is laid out the way the Agent editor is: a circular `AvatarPickerField` over bare fields
that carry no visible label, because the placeholder already names the field and required-ness is
expressed by Save staying disabled rather than by an asterisk.

## Connectivity Check

The check section selects one provider-scoped model through `ModelPickerDrawer`, whose header search
button can open app search, and uses the first enabled API key. Neither choice is stored — a check is
something you run — so the section keeps the model in local state. A result is tagged with the model
and key it ran with, so picking another one stops showing it.

## Model Pull

The pull preview keeps search inside its multi-selection screen. Query and model-type filters scope
the visible rows plus section and toolbar select-all actions, so this workflow does not use the
single-selection app-search route.
