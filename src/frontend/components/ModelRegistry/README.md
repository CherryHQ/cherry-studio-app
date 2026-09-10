# Model Registry

`ModelRegistryGate` waits for the backend's durable model catalog before mounting model-selection
or editing content. It owns localized download/loading/retry feedback. Provider configuration,
onboarding welcome, and chat history stay outside this boundary.

The providers module deduplicates downloads; React Query shares the readiness result. A catalog
update pulled from a provider's model list refreshes model projections without unmounting an
active editor.
