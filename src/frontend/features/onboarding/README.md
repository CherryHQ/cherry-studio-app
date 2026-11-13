# First-use onboarding

New installations enter a dedicated visual flow: welcome → inline privacy choice → device
permissions → notifications/background guidance → account SDK → subscription/model preparation.
`app.onboarding.status` persists the resume point. The welcome action is **Get started**; provider
connection and computer synchronization appear after account admission, not on another welcome page.
Previously completed/skipped users and installations with saved models or Sessions retain their entry.

## Presentation

`components/OnboardingPage` owns first-use headers, content insets, controls, fields, choices and
footer actions. Privacy, permissions and the account entry use their dedicated first-use UI.
Provider selection and connection mount the existing provider components inside this frame. The
`content` variant leaves scrolling, content insets and keyboard handling with those components.
Account/profile selection and system permission prompts still belong to their SDK/OS owners.
Settings retain their ordinary presentation.

The supplied welcome artwork is reused as artwork. On **Get started**, the same rendered mark
shrinks from its measured hero position to the measured upper-left slot while the inline privacy
content appears. Only transform and opacity animate, on the UI thread. The transition is 250 ms,
retargets the current value on interruption, and docks immediately with Reduce Motion. Returning
from a later stage or restoring an interrupted setup starts with the mark already docked. All pages
support light/dark tokens, scrolling text and safe areas. Provider/model catalogs keep virtualized lists.

## Behavior and boundaries

- `FirstUseGate` and the privacy gate share installation eligibility. A fresh installation sees the
  welcome screen before consent; existing users still receive policy-update dialogs. Both privacy
  choices record the policy version. Anonymous-data sharing is checked by default for new users;
  returning users retain their saved choice. A failed write keeps the current step actionable.
- Permissions use the shared permission gateway and real system states. Grants are optional;
  unsupported capabilities stay hidden. HealthKit records that the system selection finished,
  without claiming it disclosed read grants. Settings and onboarding share the original request
  scopes, action decisions, management instructions and per-item pending state through
  `frontend/hooks/devicePermission`; an individual request does not lock the entire onboarding page.
  Camera and local-network preparation are retained for computer pairing, and previously granted
  permissions are reused.
- Notification access is settled before sign-in when completion notifications are enabled. Prior OS
  decisions are not repeated. Background guidance is recorded before the SDK can change profiles.
  Login/profile switching remains in the account module; this feature supplies only its first-use
  entry and the private-deployment inputs required by that module.
- `setup/onboardingDestination.ts` keeps subscription admission separate from its presentation.
  A paid, active, effective entitlement skips provider configuration and opens account-model selection.
  `OnboardingModelList` adapts both paths to the existing `ModelPickerList` and CherryUI `SearchField`,
  reusing provider groups, model avatars, chat badges, and selection marks rather than drawing rows.
  Discovery candidates may be unsaved or disabled, so onboarding retains its own model data source
  instead of using the picker's enabled-model query. Saving disables the shared list and search.
  Saved model rows supply their identities, while the current account catalog and entitlements decide
  which account models can be offered. Selection is confirmed by the user, never automatically saved.
  A loading or failed lookup never means no subscription.
  Organization profiles use their managed models; other accounts and skipped sign-ins configure a model.
- Provider routes compose the original `ProviderCatalogContent` and `ProviderConfiguration` with
  the first-use header, step progress and continuation. Provider fields, account actions, connection
  checks, catalog grouping and import behavior have one implementation in settings/provider.
  Custom-provider navigation guards and creation still use the existing controllers. Model selection,
  scanner, pairing and computer import retain this feature's presentation. Shared connection view
  types live in `frontend/types/providerConfiguration.ts`. Credentials never travel in route parameters.
- Model preparation keeps cancellable remote listing, saved-model fallback and manual IDs. Confirming
  a model saves its default and binds the seeded Agent before opening draft chat, without sending a
  chat probe. Provider credentials and model-list errors retain their original owners and recovery.
  Cancellation/blur prevents unfinished setup from navigating; account-supplied catalogs remain read-only.
- Computer import retains the chosen connection, unavailable-provider reasons, selected providers,
  credential notice and recoverable previews. Imported configuration still continues to model setup.
  Plugin connections and per-tool approvals retain their existing owners.

`components/LogoDraw` retains the supplied source artwork and its isolated draw-animation utility;
first-use navigation now owns its own mark-position transition instead of the retired auto-play intro.
