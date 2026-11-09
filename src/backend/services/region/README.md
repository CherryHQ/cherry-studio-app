# Network Region

`RegionService` owns shared egress-IP country detection. Bootstrap's post-ready pass warms the
country off the first-paint path. Concurrent callers share one lookup, and successful country codes
stay in the backend memory cache for ten minutes, matching Cherry Desktop. The service's gate
initialization binds cancellation and privacy-preference changes. Before the current disclosure is
answered, callers wait without issuing a request; accepting it permits detection, while declining
returns an unknown country. This keeps fresh-install recommendations from being seeded before
the user can make their privacy decision. Revocation aborts an in-flight lookup and clears its cache.

IPinfo Lite's `/lite/me` endpoint supplies `country_code` over the shared HTTP client using the
public project credential shared with Desktop, a five-second timeout and a 4 KiB response cap.
IP address data powered by [IPinfo](https://ipinfo.io).

Only successful country codes are cached; no country, IP address or coordinates are persisted.
A failed lookup returns `null`, including after a previous result expires. Unknown is never
classified as a detected CN country or cached, so the next eligible caller can retry. Mobile has
no application-owned proxy configuration; the ten-minute expiry bounds stale detection when a
system VPN or network changes. Device settings never change the detected network country.

A detected CN selects domestic provider discovery and GitCode distribution; other detected
countries select global discovery and GitHub distribution. This applies to every distribution,
including domestic-store builds: a detected overseas VPN exit permits international discovery.
`getProviderCatalogEdition` owns the common discovery/recommendation policy. When detection is
unavailable or declined, only discovery and fresh-install recommendations fall back to the device
region from `getLocales()[0]?.regionCode`: CN selects domestic entries and other regions select
global entries. If the device region is also missing, the domestic default remains. This fallback
never changes the detection result or its cache. Download clients retain
their historical domestic-source preference when the country is unknown. Offline voice downloads
use byte-identical immutable ModelScope/Hugging Face mirrors.
App Store lookup retains its CN request fallback when unknown. Installed store
channels retain their platform-owned update mechanism. Region policy never filters, mutates or
disables saved provider/model/credential records. Application disposal aborts and joins any lookup.

Provider discovery reuses the trusted bundled registry's upstream `availableInEditions` labels.
Edition filtering runs after the complete trusted catalog is available. Mobile applies its own
capability exclusions and recommended-provider subset. Mobile-only presets default to global
availability until explicitly admitted to the domestic catalog; Kimi Code is explicitly available
in both editions. The model metadata files are shared, not separate CN/global catalogs. Unsigned remote
updates remain restricted to model metadata, never provider definitions or their edition labels.
`ProviderCatalogRuntime` is also initialized without work in the gate, then bootstrap starts its
provider seeding after first paint; only a fresh database waits for
country detection before installing its recommended set. The persisted seed journal is independent
of country, so travelling does not add, remove, or reset installed providers.
