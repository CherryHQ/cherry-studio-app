import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ModelPullResult } from '@/shared/contracts/models';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { useOnboardingModels } from '../useOnboardingModels';

const mockLocal = {
  data: [] as Model[],
  error: undefined as Error | undefined,
  isPending: false,
  isRefreshing: false,
  refetch: jest.fn(),
};
const mockProviders = {
  data: [{ id: 'cherryin', isEnabled: false }] as Provider[],
  error: undefined,
  isPending: false,
  isRefreshing: false,
  refetch: jest.fn(),
};
const mockRemote = {
  data: undefined as ModelPullResult | undefined,
  error: null as unknown,
  isPending: false,
  isFetching: false,
  refetch: jest.fn(),
};
const mockQueryClient = { cancelQueries: jest.fn() };

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => mockRemote,
  useQueryClient: () => mockQueryClient,
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => (() => void) | void) =>
    jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
}));
jest.mock('@/frontend/data', () => ({
  queryKeys: { models: { setup: (id: string) => ['onboarding-models', id] } },
  useBackendModule: () => ({ pull: jest.fn() }),
  useQuery: (path: string) => (path === '/models' ? mockLocal : mockProviders),
}));

const model: Model = {
  id: createUniqueModelId('cherryin', 'chat'),
  providerId: 'cherryin',
  modelId: 'chat',
  name: 'Chat',
  capabilities: [],
  isEnabled: true,
  isDeprecated: false,
  isHidden: false,
  supportsStreaming: true,
};

describe('onboarding model loading feedback', () => {
  let renderer: ReactTestRenderer | undefined;
  let data: ReturnType<typeof useOnboardingModels>;
  function Probe() {
    data = useOnboardingModels('cherryin');
    return null;
  }
  const render = () =>
    act(() => {
      renderer = create(<Probe />);
    });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocal.data = [];
    mockLocal.error = undefined;
    mockRemote.data = undefined;
    mockRemote.error = null;
    mockRemote.isPending = false;
    mockRemote.isFetching = false;
  });
  afterEach(() => {
    act(() => renderer?.unmount());
  });

  test('shows a remote error instead of an empty list without blocking manual entry', () => {
    mockRemote.error = { statusCode: 401 };
    render();
    expect(data.loadError).toEqual({ reason: 'authentication', action: 'editConnection' });
    expect(data.isLoading).toBe(false);
    expect(data.error).toBeUndefined();
    expect(data.provider?.id).toBe('cherryin');
  });

  test('keeps saved models selectable when refreshing the remote list fails', () => {
    mockLocal.data = [model];
    mockRemote.error = { statusCode: 503 };
    render();
    expect(data.items).toEqual([model]);
    expect(data.loadError).toBeNull();
    expect(data.pullError).toEqual({ reason: 'server', action: 'retry' });
  });

  test('only presents a successful empty result as empty', () => {
    mockRemote.data = { status: 'up-to-date', providerEnabled: false };
    render();
    expect(data.loadError).toBeNull();
    expect(data.pullError).toBeNull();
    expect(data.items).toEqual([]);
    expect(data.isLoading).toBe(false);
  });

  test('shows progress on retry and clears the failure when models arrive', () => {
    mockRemote.error = { statusCode: 503 };
    render();
    act(() => data.retry());
    expect(mockRemote.refetch).toHaveBeenCalledTimes(1);
    mockRemote.isFetching = true;
    act(() => renderer?.update(<Probe />));
    expect(data.isLoading).toBe(true);
    mockRemote.isFetching = false;
    mockRemote.error = null;
    mockRemote.data = { status: 'changes', preview: { added: [model], missing: [] } };
    act(() => renderer?.update(<Probe />));
    expect(data.items).toEqual([model]);
    expect(data.loadError).toBeNull();
    expect(data.isLoading).toBe(false);
  });

  test('does not mask a local data failure behind a remote result', () => {
    mockLocal.error = new Error('storage unavailable');
    mockRemote.data = { status: 'changes', preview: { added: [model], missing: [] } };
    render();
    expect(data.error).toBe(mockLocal.error);
    expect(data.loadError?.reason).toBe('unknown');
  });
});
