import { isRegistryProjectionPath } from '../ProviderRegistryQueryBridge';

test.each([
  '/models',
  '/models/provider::model',
  '/providers/openai/models:resolve',
  'onboarding-models',
  // Agent records embed the model's display name.
  '/agents',
  '/agents/9917766f-c084-496f-b6b8-17f08e0c6c3a',
])('refreshes %s when a registry snapshot becomes active', (path) => {
  expect(isRegistryProjectionPath(path)).toBe(true);
});

test.each([
  '/agents/9917766f-c084-496f-b6b8-17f08e0c6c3a/tool-bindings',
  '/agent-sessions',
  '/providers',
  '/mcp-servers',
  undefined,
])('leaves %s alone', (path) => {
  expect(isRegistryProjectionPath(path)).toBe(false);
});
