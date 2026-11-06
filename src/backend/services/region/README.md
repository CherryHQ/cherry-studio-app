# Network Region

`RegionService` owns one egress-IP country lookup per application generation. Bootstrap's post-ready
pass starts the lookup off the first-paint path; provider discovery and distribution callers await
the same result. The service's gate initialization only binds cancellation, so lazy callers already
have an initialized lifecycle owner. Foreground transitions do not change region within a generation.

The public IPinfo JSON endpoint supplies a two-letter country code over the shared HTTP client,
with a five-second timeout and a 4 KiB response cap. Only the country code is cached; IP addresses
and coordinates are not stored. A failed lookup uses the last successful country, or US for the
existing global-directory default when no successful lookup exists. Device language, locale and
time zone do not select network region.

CN selects domestic provider discovery and GitCode distribution; other countries select global
discovery and GitHub distribution. Offline voice-model downloads select byte-identical immutable
ModelScope/Hugging Face mirrors using the same country. App Store lookup uses the detected country. Installed store
channels retain their platform-owned update mechanism. Region policy never filters, mutates or
disables saved provider/model/credential records. Application disposal aborts and joins the lookup.

Provider discovery reuses the trusted bundled registry's `availableInEditions` labels. Mobile-only
presets default to global availability until explicitly admitted to the domestic catalog. The
registry's unsigned remote updates remain restricted to model metadata, never provider definitions.
`ProviderCatalogRuntime` is also initialized without work in the gate, then bootstrap starts its
provider seeding after first paint; only a fresh database waits for
country detection before installing its recommended set. The persisted seed journal is independent
of country, so travelling does not add, remove, or reset installed providers.
