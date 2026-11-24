# Network Region

`RegionService` owns shared egress region detection (`CN` or `GLOBAL`). Bootstrap's post-ready pass
warms the region off the first-paint path. Concurrent callers share one lookup, and successful
regions stay in the backend memory cache for ten minutes. The service's gate initialization only
binds cancellation. Region detection runs independently of the data-collection consent setting: an
unanswered or declined disclosure does not delay or disable the lookup, and changing that setting
does not cancel detection or clear its cache.

Config Service's `POST /v1/resolve` endpoint (`CONFIG_SERVICE_ORIGIN`) supplies `region` (`CN` or
`GLOBAL`) anonymously over the shared HTTP client (`requestConfigServiceResolve`, shared with cloud
login discovery) with a five-second timeout and a 32 KiB response cap. When `CONFIG_SERVICE_ORIGIN`
is absent or invalid, or on unsupported platforms, no lookup is issued and the region remains
unknown.

Only successful region values are cached; no region, IP address or coordinates are persisted. A
failed lookup returns `null`, including after a previous result expires. Unknown is never classified
as a detected CN region or cached, so the next caller can retry. Mobile has no application-owned
proxy configuration; the ten-minute expiry bounds stale detection when a system VPN or network
changes. Device settings never change the detected network region.

A detected CN selects domestic provider discovery and GitCode distribution; a detected GLOBAL
selects global provider discovery and GitHub distribution. This applies to
every distribution, including domestic-store builds: a detected overseas VPN exit permits
international discovery. `getProviderCatalogEdition` owns the common discovery/recommendation
policy. When detection is unavailable, only discovery and fresh-install recommendations fall back to
the device region from `getLocales()[0]?.regionCode`: CN selects domestic entries and other regions
select global entries. If the device region is also missing, the domestic default remains. This
fallback never changes the detection result or its cache. Download mirrors and Jina retain their
domestic-first / CN fallback when the
region is unknown (`null`). `repositorySourceOrder` shares that GitCode/GitHub preference and
failure fallback order between provider-registry and Agent-template downloads. Offline voice
downloads use byte-identical immutable ModelScope/Hugging Face mirrors. CherryIN Skills always uses
the global catalog, and App Store lookup uses the current StoreKit storefront. Neither uses the
network region. Installed store channels retain their platform-owned update mechanism. Region
policy never filters, mutates or disables saved provider/model/credential records. Application
disposal aborts and joins any lookup.

Provider discovery reuses the trusted bundled registry's upstream `availableInEditions` labels.
Edition filtering runs after the complete trusted catalog is available. Mobile applies its own
capability exclusions and recommended-provider subset. Mobile-only presets default to global
availability until explicitly admitted to the domestic catalog; Kimi Code is explicitly available
in both editions. The model metadata files are shared, not separate CN/global catalogs. Unsigned
remote updates remain restricted to model metadata, never provider definitions or their edition
labels. `ProviderCatalogRuntime` is also initialized without work in the gate, then bootstrap starts
its provider seeding after first paint; only a fresh database waits for region detection before
installing its recommended set. The persisted seed journal is independent of region, so travelling
does not add, remove, or reset installed providers.
