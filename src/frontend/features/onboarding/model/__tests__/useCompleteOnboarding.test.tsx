import { act, create, type ReactTestRenderer } from 'react-test-renderer';

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
const mockShowAlert = jest.fn();
const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: mockShowAlert } }),
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
    mockCheckChat.mockResolvedValue({ status: 'success', latency: 1 });
    mockCreateModels.mockResolvedValue([model]);
    mockRefetchAgents.mockResolvedValue({ data: { items: [{ id: 'seed', modelId: null }] } });
    mockUpdateAgent.mockResolvedValue({ id: 'seed', modelId: model.id });
    mockCreateAgent.mockResolvedValue({ id: 'created', modelId: model.id });
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
  });

  test('does not change defaults or navigate when a real chat check fails', async () => {
    mockCheckChat.mockResolvedValue({ status: 'failed', reason: 'authentication' });
    await act(async () => onboarding.complete({ kind: 'catalog', model, isLocal: true }));
    expect(mockSavePreferences).not.toHaveBeenCalled();
    expect(mockUpdateAgent).not.toHaveBeenCalled();
    expect(mockEnableModel).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockShowAlert).toHaveBeenCalledWith({
      title: 'onboarding.check.failed',
      description: 'onboarding.check.authentication',
    });
  });

  test('reuses the seeded Agent and writes completion only after the check succeeds', async () => {
    await act(async () => onboarding.complete({ kind: 'catalog', model, isLocal: true }));
    expect(mockCreateAgent).not.toHaveBeenCalled();
    expect(mockUpdateAgent).toHaveBeenCalledWith('seed', { modelId: model.id });
    expect(mockSavePreferences).toHaveBeenCalledWith(
      { defaultModelId: model.id, status: 'completed' },
      { optimistic: false },
    );
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/',
      params: { agentId: 'seed', sessionId: undefined },
    });
    expect(mockCheckChat.mock.invocationCallOrder[0]).toBeLessThan(
      mockSavePreferences.mock.invocationCallOrder[0],
    );
  });

  test('ignores duplicate starts and aborts work when the screen leaves', async () => {
    let resolveCheck!: (result: { status: 'success'; latency: number }) => void;
    mockCheckChat.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = onboarding.complete({ kind: 'catalog', model, isLocal: true });
      void onboarding.complete({ kind: 'catalog', model, isLocal: true });
    });
    expect(mockCheckChat).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
    expect(mockCheckChat.mock.calls[0][0].signal.aborted).toBe(true);
    await act(async () => {
      resolveCheck({ status: 'success', latency: 1 });
      await pending;
    });
    expect(mockSavePreferences).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockShowAlert).not.toHaveBeenCalled();
  });

  test('retries a manually entered model without creating duplicate models or Agents', async () => {
    mockRefetchAgents.mockResolvedValue({ data: { items: [] } });
    mockSavePreferences.mockRejectedValueOnce(new Error('storage unavailable'));
    const selection = {
      kind: 'manual',
      modelId: 'chat',
      provider: { id: 'provider' } as Provider,
    } as const;
    await act(async () => onboarding.complete(selection));
    await act(async () => onboarding.complete(selection));
    expect(mockCreateModels).toHaveBeenCalledTimes(1);
    expect(mockCreateAgent).toHaveBeenCalledTimes(1);
    expect(mockCheckChat).toHaveBeenCalledTimes(2);
    expect(mockSavePreferences).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
});
