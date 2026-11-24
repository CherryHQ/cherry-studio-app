# Provider Setup

Provider catalog, custom provider creation, base URL and API key configuration, connection testing,
and adding or editing individual models (including pricing and purpose tabs).

## User Entry

- From Sidebar (`testID:sidebar`) -> Settings (`testID:sidebar-settings`) -> Providers
  (`testID:provider-list`), or from onboarding model source (`testID:onboarding-connect`).
- Catalog screen: `testID:provider-catalog-entry-custom`, `testID:provider-catalog-custom`, and
  onboarding variants `testID:onboarding-provider-show-all`, `testID:onboarding-provider-custom`.
- Provider detail & configuration:
  - Address sheet: `testID:provider-address-sheet`, URL field `testID:provider-base-url`
  - Connection test: `testID:provider-connection-test`, key selector `testID:provider-connection-test-key`,
    key picker `testID:provider-connection-test-key-picker`
  - Model settings & pricing: `testID:provider-model-purpose-tabs`, `testID:model-setting-sheet`,
    `testID:model-setting-modelId`, `testID:model-setting-pricing`, `testID:model-pricing-sheet`,
    `testID:model-pricing-submit`.

## Verification Driver

- Focused Jest suites:
  - `pnpm test:app -- src/frontend/features/settings/provider/models/hooks/__tests__/useProviderModelAddDirty.test.tsx --runInBand`
- Device acceptance: `agent-device` walkthrough creating/editing a provider configuration and
  re-reading it after full app relaunch.

## Observable Acceptance

- Typing a custom model ID in `testID:model-setting-modelId` resolves catalog baseline metadata
  after debounce without stale lookup overwrites.
- Saving provider base URL or API keys persists across a full app relaunch and updates readiness in
  `testID:provider-list`.
- Running `testID:provider-connection-test` reports concrete connection errors rather than hanging
  indefinitely.

## Known Pitfalls

- Never log or paste real API keys into `.context/agent-self-testing/` receipts or PR comments;
  `pnpm verify:device` redacts common secret patterns, but callers must still treat provider keys as
  private.
- DeepSeek model credentials are shared with DeepSeek file/voice/web tools; modifying or clearing
  DeepSeek provider settings affects those dependent features.
- Provider recommendations depend on egress/device region (`getProviderCatalogEdition`).
