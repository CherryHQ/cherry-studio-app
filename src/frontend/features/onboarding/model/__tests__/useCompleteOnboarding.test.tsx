import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { useCompleteOnboarding } from '../useCompleteOnboarding';

const mockCheckChat = jest.fn();
const mockReconcile = jest.fn();
const mockSavePreferences = jest.fn();
const mockCreateModels = jest.fn();
const mockEnableModel = jest.fn();
const mockEnableProvider = jest.fn();
const mockRefetchAgents = jest.fn();
const mockCreateAgent = jest.fn();
const mockUpdateAgent = jest.fn();
const mockShowToast = jest.fn();
const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockShowToast } }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
  useRouter: () => ({ dismissAll: mockDismissAll, replace: mockReplace }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ checkChat: mockCheckChat, reconcile: mockReconcile }),
  useMultiplePreferences: () => [{}, mockSavePreferences],
  useMutation: (method: string, path: string) => ({
    trigger:
      method === 'POST'
        ? mockCreateModels
        : path === '/providers/:id'
          ? mockEnableProvider
          : mockEnableModel,
  }),
}));
jest.mock('@/frontend/hooks/agent', () => ({
  useAgentsApi: () => ({ refetch: mockRefetchAgents }),
  useAgentMutations: () => ({ createAgent: mockCreateAgent, updateAgent: mockUpdateAgent }),
}));

const model: Model = {
  id: createUniqueModelId('provider', 'chat'),
  providerId: 'provider',
  modelId: 'chat',
  name: 'Chat',
  capabilities: [],
  isEnabled: true,
  isDeprecated: false,
  isHidden: false,
  supportsStreaming: true,
};

describe('useCompleteOnboarding', () => {
  let renderer: ReactTestRenderer;
  let onboarding: ReturnType<typeof useCompleteOnboarding>;
  function Probe() {
    onboarding = useCompleteOnboarding();
    return null;
  }

  beforeEach(() => {
    jest.resetAllMocks();
    mockCreateModels.mockResolvedValue([model]);
    mockRefetchAgents.mockResolvedValue({ data: { items: [{ id: 'seed', model: null }] } });
    mockUpdateAgent.mockResolvedValue({ id: 'seed', model: model.id });
    mockCreateAgent.mockResolvedValue({ id: 'created', model: model.id });
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
  });

  test('does not finish when the chosen model could not be bound to the Agent', async () => {
    mockUpdateAgent.mockRejectedValueOnce(new Error('storage unavailable'));
    await act(async () => {
      await onboarding.complete({ kind: 'catalog', model, isLocal: true });
    });
    expect(mockSavePreferences).not.toHaveBeenCalled();
    expect(mockUpdateAgent).toHaveBeenCalledWith('seed', { model: model.id });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockCheckChat).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      label: 'onboarding.saveFailed',
      variant: 'danger',
    });
  });

  test('saves the selected model and seeded Agent without sending a chat request', async () => {
    await act(async () => {
      await onboarding.complete({ kind: 'catalog', model, isLocal: true });
    });
    expect(mockCreateAgent).not.toHaveBeenCalled();
    expect(mockUpdateAgent).toHaveBeenCalledWith('seed', { model: model.id });
    expect(mockSavePreferences).toHaveBeenCalledWith(
      { defaultModelId: model.id, status: 'completed' },
      { optimistic: false },
    );
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/',
      params: { agentId: 'seed', sessionId: undefined },
    });
    expect(mockCheckChat).not.toHaveBeenCalled();
    expect(mockUpdateAgent.mock.invocationCallOrder[0]).toBeLessThan(
      mockSavePreferences.mock.invocationCallOrder[0],
    );
  });

  test('ignores duplicate starts and aborts work when the screen leaves', async () => {
    let resolveReconcile!: () => void;
    mockReconcile.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveReconcile = resolve;
        }),
    );
    let pending!: Promise<boolean>;
    act(() => {
      pending = onboarding.complete({ kind: 'catalog', model, isLocal: false });
      void onboarding.complete({ kind: 'catalog', model, isLocal: false });
    });
    expect(mockReconcile).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
    await act(async () => {
      resolveReconcile();
      await pending;
    });
    expect(mockSavePreferences).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  test('saves the chosen subscription model without a paid probe or configuration writes', async () => {
    const accountModel = {
      ...model,
      id: createUniqueModelId(CLOUD_PROVIDER_ID, 'chat'),
      providerId: CLOUD_PROVIDER_ID,
    };
    mockUpdateAgent.mockResolvedValue({ id: 'seed', model: accountModel.id });
    await act(async () => {
      await onboarding.complete({ kind: 'subscription', model: accountModel });
    });
    expect(mockCheckChat).not.toHaveBeenCalled();
    expect(mockEnableModel).not.toHaveBeenCalled();
    expect(mockEnableProvider).not.toHaveBeenCalled();
    expect(mockSavePreferences).toHaveBeenCalledWith(
      { defaultModelId: accountModel.id, status: 'completed' },
      { optimistic: false },
    );
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/',
      params: { agentId: 'seed', sessionId: undefined },
    });
  });

  test('retries a manually entered model without creating duplicate models or Agents', async () => {
    mockRefetchAgents.mockResolvedValue({ data: { items: [] } });
    mockSavePreferences.mockRejectedValueOnce(new Error('storage unavailable'));
    const selection = {
      kind: 'manual',
      modelId: 'chat',
      provider: { id: 'provider' } as Provider,
    } as const;
    await act(async () => {
      await onboarding.complete(selection);
    });
    await act(async () => {
      await onboarding.complete(selection);
    });
    expect(mockCreateModels).toHaveBeenCalledTimes(1);
    expect(mockCreateAgent).toHaveBeenCalledTimes(1);
    expect(mockCreateAgent.mock.calls[0][0]).not.toHaveProperty('disabledCapabilities');
    expect(mockCheckChat).not.toHaveBeenCalled();
    expect(mockSavePreferences).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
});
