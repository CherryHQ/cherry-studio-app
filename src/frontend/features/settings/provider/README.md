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
- `components/ProviderForm/` owns the compound form shared by provider creation and provider detail.

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
`new/ProviderCreationScreen`, which renders the shared provider form before model synchronization. The
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

## Provider Form

`ProviderForm` is a compound component over one draft: `ProviderForm.Avatar`, `.Name`, `.BaseUrl`,
`.Endpoint`, `.Endpoints`, and `.ApiKeys`. `useProviderFormDraft` owns field state; `useProviderConfigurationForm` adds loading,
validation, endpoint impact confirmation, and saving for existing providers. Creation keeps its
own initial persistence step. Each screen drives its actions from the same draft that its fields
consume and composes the slots it needs.

`ProviderForm.ApiKeys` edits a dynamic list of credential entries. Each row keeps its ID, key,
optional label, and enabled state together; removing another row never reassigns that identity.
Each credential occupies one grouped-list row showing its optional note (or default name), a
masked key, an enable switch, and a Settings button. The switch and Settings button have separate
touch targets. Scroll cancellation stays with the page scroller and shared controls; the row adds
no long-press or swipe recognizers.

Adding or opening Settings presents a dedicated `BottomSheet` for that key, with the key and an
optional note explaining its identification-only purpose. Existing keys edit the page draft
directly; closing the sheet keeps those edits. New keys stay in a local buffer until Add validates
and inserts the entry; cancelling an addition leaves the list unchanged.
Delete is a full-width destructive button below the existing-key sheet's fields.
There is no second confirmation action for editing a key. Empty,
duplicate, or multi-key input shows an error in the sheet and list and blocks page save; it also
blocks Add for a new key. Short keys are fully masked; longer keys expose only their last four
characters in the list.
All edits, including enabling keys during setup, remain in the page draft until the explicit page
save succeeds. Editing unrelated fields does not replace keys updated by background synchronization.

The data model follows desktop's `ProviderApiKeyListDrawer`; presentation and editing follow
Mobile's grouped rows, keyboard-aware sheet, and page save/discard contract. No database or device
synchronization protocol change is needed.

Endpoint fields share protocol labels, full request URL previews with explicit copying, and
correction hints for pasted request paths. Base URLs accept the desktop-compatible trailing `#` to
disable automatic version insertion. The marker remains visible in the input and saved configuration,
and is removed before outgoing requests. Provider-specific transports
without a standard URL formatter do not display a guessed request URL.

First-use setup replaces the single selected text endpoint atomically when the protocol changes,
carrying the visible URL forward. Clearing that URL keeps the selected protocol. Providers already
configured with multiple text endpoints use the multi-endpoint form so setup cannot hide or discard
their other addresses.

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
