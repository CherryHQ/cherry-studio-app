# Network Region

`RegionService` owns shared egress-IP country detection. Bootstrap's post-ready pass warms the
country off the first-paint path. Concurrent callers share one lookup, and successful country codes
stay in the backend memory cache for ten minutes, matching Cherry Desktop. The service's gate
initialization only binds cancellation, so lazy callers already have an initialized lifecycle owner.

IPinfo Lite's `/lite/me` endpoint supplies `country_code` over the shared HTTP client using the
public project credential shared with Desktop, a five-second timeout and a 4 KiB response cap.
IP address data powered by [IPinfo](https://ipinfo.io).

Only successful country codes are cached; no country, IP address or coordinates are persisted.
A failed lookup returns CN, including after a previous global result expires. Failures are not
cached, so the next caller can retry. Mobile has no application-owned proxy configuration; the
ten-minute expiry bounds stale detection when a system VPN or network changes. Device language,
locale and time zone do not select network region.

CN selects domestic provider discovery and GitCode distribution; other countries select global
discovery and GitHub distribution. Offline voice-model downloads select byte-identical immutable
ModelScope/Hugging Face mirrors using the same country. App Store lookup uses the detected country. Installed store
channels retain their platform-owned update mechanism. Region policy never filters, mutates or
disables saved provider/model/credential records. Application disposal aborts and joins any lookup.

Provider discovery reuses the trusted bundled registry's upstream `availableInEditions` labels.
CN fallback therefore selects domestic discovery and initial recommendations as well as domestic
download sources. Mobile applies its own capability exclusions and recommended-provider subset;
Mobile-only presets default to global availability until explicitly admitted to the domestic
catalog. The model metadata files are shared, not separate CN/global catalogs. Unsigned remote
updates remain restricted to model metadata, never provider definitions or their edition labels.
`ProviderCatalogRuntime` is also initialized without work in the gate, then bootstrap starts its
provider seeding after first paint; only a fresh database waits for
country detection before installing its recommended set. The persisted seed journal is independent
of country, so travelling does not add, remove, or reset installed providers.
