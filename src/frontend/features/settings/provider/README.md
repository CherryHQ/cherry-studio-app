# Provider

This page branch owns the `/settings/provider` list and its child pages.

## Public Interface

- The list page is exported from this directory's `index.ts`; every child page has its own public
  `index.ts`.
- `useProviderListNavigation` lets the parent settings page open and prefetch the provider list.
  Its route, query key, pagination, and cache policy remain private to this branch.
- Provider avatar persistence stays private to this page branch under `hooks/`.

## Organization

- `catalog/` and `new/` own direct provider-list child pages.
- `desktopSync/` owns provider import from a paired desktop device.
- `detail/` owns `/settings/provider/[providerId]`; its `edit/`, `modelAdd/`, and `modelPull/`
  directories own the dynamic route's child pages. Model synchronization and manual model creation
  are separate entry points and do not switch modes inside either task.
- `detail/modelAdd/` dispatches to separate manual and synchronization components. Their shared
  completion hook preserves activation intent, saved-model retries, and the return destination;
  only the manual form owns keyboard behavior, and only synchronization owns pull selection.
- `apiService/` owns API key, authentication, endpoint draft, dirty-state, and save behavior.
- `components/` contains UI shared within the provider page branch. Page-specific UI stays in the
  child page's own `components/` directory.
- `hooks/` contains provider-owned persistence and deletion behavior.
- `models/` owns provider model grouping, synchronization, health checks, and list UI.
- `components/ProviderConfiguration/` owns the configuration body shared by provider details,
  setup, creation and onboarding.

## Provider List Motion

The list keeps provider IDs independent of the enabled/disabled group. Headers and provider rows
share one recycled `AnimatedLegendList`; only position changes animate, using the shared settle
curve over 250 ms. The viewport fills its available space instead of resizing from content
measurements. Header and provider rows use separate recycling pools.

A toggle responds immediately through the shared platform switch, with pending feedback confined
to that provider. Setup requirements and failed writes restore the persisted switch state. The
list changes groups once the refreshed data supplies the final order, avoiding a second reorder
after an optimistic move.

`ProviderListRow` owns the enabled/disabled label crossfade (200 ms). Reversals continue from its
current opacity. Only this small status subtree is keyed to the provider so recycling starts at
the new provider's state without replaying an entrance. System Reduce Motion skips both the row
movement and label crossfade, leaving the final switch, text, and group state intact. Colors use
the shared theme tokens in both light and dark themes.

## Provider Catalog

`catalog/ProviderCatalogScreen` owns the bundled provider catalog. A fixed custom-provider row is the first
item in the recommended section; preset rows keep their explicit Add action. Both paths continue to
`new/ProviderCreationScreen`, which renders the shared provider configuration before model synchronization. The
catalog carries a validated `returnTo` href through creation and model selection; finishing setup
returns to the requesting surface, or to the provider list when settings opened the flow.

## Desktop Provider Synchronization

The provider list's overflow menu owns the collection-level entry for synchronizing from a paired
PC. Device details and the post-pairing guide open the same sync page with a connection ID, skipping
source selection. Dedicated onboarding routes also reuse this page with a route-owned
`setupIntent="chat"`; successful import then opens onboarding's chat-model selection without marking
setup complete. Settings synchronization still returns to the provider list.

Device discovery, pairing, repair, and removal stay in `DeviceConnectionsScreen`; this module
only selects a paired source, fetches the providers enabled on that PC, lets the user choose which
ones to synchronize, and refreshes provider/model queries after the import transaction succeeds.
Selected providers receive the PC configuration and are enabled, including already installed
presets with no missing models. Only enabled PC models are compared by provider ID and model ID;
missing models are added and existing model rows remain unchanged. Mobile-only providers and models
are retained. Custom providers also retain endpoint entries absent from the PC so existing mobile
models can keep using them; matching endpoint entries use the PC configuration.
Preview and import both exclude CherryAI and local providers (Ollama, LM Studio, GPUStack, and
OpenVINO Model Server), including copies identified by their preset provider ID or legacy type.

## Provider Configuration

`components/ProviderConfiguration/` is the one configuration body for provider details, setup from
the catalog, custom provider creation and onboarding; see its README for the section order and
data sources. Saved providers write every change as it is made, so provider details have no Save
button and no discard confirmation. Only creating a custom provider keeps a local draft, written
once when the user continues; leaving with an unsaved draft still asks first.

API keys keep their ID, key, optional label and enabled state together; removing one never
reassigns another's identity. The first key is typed straight into the card. Later keys toggle in
place, and opening one presents a sheet that edits a copy of its key and label; the change is
written once on Save, and Delete removes it. Empty, duplicate or multi-key input shows an error in
the sheet and blocks saving it. Short keys are fully masked; longer keys expose only their last
four characters.

## Connectivity And Models

The connectivity check selects one provider-scoped model and uses the first enabled API key;
neither choice is stored. Checks and ordinary synchronization never change provider activation.

`useProviderSetup` owns the explicit activation path: inspect persisted configuration, repair missing
credentials or endpoints with the shared creation form, and enable directly when a supported enabled
model already exists. Otherwise, continue through synchronization or its independent manual-add
fallback. `returnTo` preserves the requesting surface; `enableProvider` explicitly identifies model
tasks that must complete activation. Saving models and enabling a provider have separate outcomes,
so an activation failure can be retried without adding the same models again.

The model tab has separate synchronization and manual-add icon actions. It lists all installed
provider models for management, labels unavailable models, and supports detail, edit, contextual
menus, and scoped multi-selection. The detail page's `model/` branch owns model inspection and its
`edit/` child. Model grouping, deletion protection, selection, and synchronization remain under
`models/`.

## Provider Accounts

`backend.providers.accounts` is the shared account contract. Setup and detail compose
`components/ProviderAccount/` using its capability declaration; `account/` receives the
`/oauth/callback` route. UI, callback handling, query keys and credential ownership do not branch on
provider IDs. The registered adapter determines sign-in, model API-key and balance support.
Mobile adds only login-based providers that the desktop app already supports.

The account panel follows provider identity and precedes manual configuration in setup, detail
and onboarding. Signed-out accounts expose one primary sign-in action. Signed-in accounts show
identity and local sign-out in the header, with a balance and adjacent refresh action below.

The backend's `providers/account/ProviderAccountRuntime` owns attempts, callback validation,
credential persistence, refresh, logout and provider deletion cleanup. `providerOauth` supplies the
shared PKCE authorization-code client. Adapters own client configuration and account API response
parsing. The composition root currently registers only CherryIN. The desktop app's Codex and Grok
CLI logins are not available on mobile: their upstream clients accept only loopback callbacks.

An in-progress attempt (state, PKCE verifier and deadline) exists only in runtime memory. A callback
must match that attempt's registered redirect URL exactly, so one provider's callback cannot
complete another provider's attempt. If the app is terminated during sign-in, the returning
callback is rejected and the user signs in again.

Model calls keep their existing supported authentication paths. Account login adds model API keys
when the adapter supplies them; logout removes only unchanged keys owned by that local account.
Account key changes update the form baseline without discarding other edits. Balance values carry
their currency instead of assuming USD throughout the shared UI.

Desktop OAuth imports use the same registered model-key capability. They discard the desktop grant,
preserve local keys and IDs/enabled choices, and add new PC keys. The balance belongs to the account
signed in on this phone; imported keys may belong to a different account. Unsupported upstream
OAuth/model protocols are not enabled merely by catalog metadata.

Each adapter declares the desktop app's registered client ID and redirect URL. CherryIN shares
`cherrystudio://oauth/callback` with desktop; a custom-scheme callback only reaches the app on the
device that opened the browser. Only production builds register the `cherrystudio` scheme, so
development and preview builds cannot complete provider sign-in.
