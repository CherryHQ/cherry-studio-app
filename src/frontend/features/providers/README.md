# Providers

This feature owns provider discovery, configuration, model management, and default-model settings.

## Public Interface

- Route screens and provider-list query constants are exported from `index.ts`.
- `ProviderScreen/` exposes the provider catalog, creation, detail, and model-management screens.
- Provider avatar persistence stays private to this feature under `hooks/`.

## Organization

- `components/` contains provider-owned visual adapters.
- `hooks/` contains provider-owned persistence hooks.
- `ProviderScreen/` contains provider configuration and model-management flows.
