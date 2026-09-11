# Background Activity

This App Shell module owns the iOS Live Activity factories registered during app bootstrap and
Android notification navigation after the Router mounts. These are app-level presentation adapters
rather than page components. Android service and notification lifetimes belong to the backend's
`AndroidBackgroundActivityRuntime`; see [Android Background Generation](../../../../docs/references/android-background-generation.md).
