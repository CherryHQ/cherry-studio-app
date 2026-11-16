# Provider creation

`ProviderCreationScreen` owns the regular settings presentation. The public `ProviderConfiguration`,
`useNewProviderConfiguration` and `useSavedProviderConfiguration` exports let onboarding routes mount
the same configuration body and controllers inside their first-use frame. Keys, addresses, Vertex
authentication, provider-account UI and connection checks keep their existing components and
behavior. Shared view types live under `frontend/types/providerConfiguration.ts`.
