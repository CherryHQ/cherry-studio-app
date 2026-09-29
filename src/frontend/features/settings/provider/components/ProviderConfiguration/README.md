# ProviderConfiguration

The single provider configuration body. Provider details, setup from the catalog, custom
provider creation and onboarding all render `ProviderConfiguration`, so a provider reads and
edits the same way wherever the user meets it.

## Shape

Sections always appear in one order and hide themselves when they do not apply:

1. Identity — avatar (tap to replace) and name (tap to rename; an input-style underline hints at it).
2. Account — sign-in for providers whose account supplies keys or a balance.
3. API keys — the first key is typed into the card; later keys toggle in place and open a
   sheet for their label or removal.
4. Connection test — a text model and one row that runs the check and shows the result.
   Shown only for saved providers with an enabled key and a text model.
5. Address — "Advanced" for presets (API address and API format); an address per protocol,
   with the default marked, for custom providers.

Callers add only a `header`, a `footer` inside the scroll view, or a fixed `bottomAction`
(`ProviderConfigurationContinue`). They cannot reorder or restyle sections.

## Data

`ProviderConfigurationValue` is persistence-neutral. Every change is one action:

- `useSavedProviderConfiguration` writes each action straight to the provider record. There
  is no draft, Save button or discard confirmation. Address changes keep the old guards:
  an endpoint still used by a model cannot be removed, and moving the default endpoint that
  models follow asks first. A custom provider whose default endpoint lost its address is
  repaired once when opened.
- `useNewProviderConfiguration` keeps a local draft (`useProviderConfigurationDraft`) because
  the provider does not exist until the user continues; `create()` writes it once.

Editing sheets are presentational: their owners keep the text or key draft, so sheet content
never depends on app providers from inside its portal.
