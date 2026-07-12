import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { useCreateCustomProvider } from '../useCreateCustomProvider';

function renderHook<T>(useHook: () => T): { result: { current: T } } {
  const result: { current: T } = { current: undefined as unknown as T };
  const TestComponent = () => {
    result.current = useHook();
    return null;
  };
  act(() => {
    create(createElement(TestComponent));
  });
  return { result };
}

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockToastApi = { toast: { show: jest.fn() } };
jest.mock('heroui-native/toast', () => ({
  useToast: () => mockToastApi,
}));

const mockUseDataServices = jest.fn();
jest.mock('@/data/runtime', () => ({
  useDataServices: () => mockUseDataServices(),
}));

const mockUseQueryClient = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockUseQueryClient(),
}));

const mockBuildPayload = jest.fn();
jest.mock('../createCustomProviderPayload', () => ({
  buildCreateCustomProviderPayload: (...args: unknown[]) => mockBuildPayload(...args),
}));

const mockServices = {
  provider: { create: jest.fn() },
};
const mockQueryClient = {
  invalidateQueries: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseDataServices.mockReturnValue(mockServices);
  mockUseQueryClient.mockReturnValue(mockQueryClient);
});

describe('useCreateCustomProvider', () => {
  it('returns default state', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    expect(result.current.isSheetOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.name).toBe('');
    expect(result.current.selectedEndpointType).toBe(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS);
    expect(result.current.canSubmit).toBe(false);
  });

  it('canSubmit is false when name is empty', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName(''));

    expect(result.current.canSubmit).toBe(false);
  });

  it('canSubmit is true when name is non-empty and not submitting', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('My Provider'));

    expect(result.current.canSubmit).toBe(true);
  });

  it('canSubmit is false when name is only whitespace', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('   '));

    expect(result.current.canSubmit).toBe(false);
  });

  it('canSubmit is false while submitting', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('My Provider'));

    let resolveCreate!: (value: unknown) => void;
    mockServices.provider.create.mockImplementation(
      () =>
        new Promise((r) => {
          resolveCreate = r;
        }),
    );

    const submitPromise = result.current.submit();
    await act(async () => {});
    expect(result.current.canSubmit).toBe(false);

    resolveCreate({ id: 'prov-123', name: 'My Provider' });
    await act(async () => submitPromise);

    expect(result.current.canSubmit).toBe(true);
  });

  it('openSheet opens the sheet and resets form', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('Old Name'));
    act(() => result.current.openSheet());

    expect(result.current.isSheetOpen).toBe(true);
    expect(result.current.name).toBe('');
  });

  it('closeSheet closes the sheet', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    act(() => result.current.openSheet());
    act(() => result.current.closeSheet());

    expect(result.current.isSheetOpen).toBe(false);
  });

  it('closeSheet does not close while submitting', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    act(() => result.current.openSheet());

    let resolveCreate!: (value: unknown) => void;
    mockServices.provider.create.mockImplementation(
      () =>
        new Promise((r) => {
          resolveCreate = r;
        }),
    );

    act(() => result.current.setName('My Provider'));
    const submitPromise = result.current.submit();
    await act(async () => {});

    act(() => result.current.closeSheet());
    expect(result.current.isSheetOpen).toBe(true);

    resolveCreate({ id: 'prov-123', name: 'My Provider' });
    await act(async () => submitPromise);
  });

  it('submit returns early when canSubmit is false', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    await act(async () => result.current.submit());

    expect(mockServices.provider.create).not.toHaveBeenCalled();
  });

  it('calls provider.create and invalidates queries on submit', async () => {
    const onCreated = jest.fn();
    const { result } = renderHook(() => useCreateCustomProvider({ onCreated }));

    act(() => result.current.setName('My Provider'));

    mockBuildPayload.mockReturnValue({ name: 'My Provider' });
    mockServices.provider.create.mockResolvedValue({ id: 'prov-123', name: 'My Provider' });

    await act(async () => result.current.submit());

    expect(mockBuildPayload).toHaveBeenCalledWith({
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      name: 'My Provider',
    });
    expect(mockServices.provider.create).toHaveBeenCalledWith({ name: 'My Provider' });
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['/providers', {}],
    });
    expect(onCreated).toHaveBeenCalledWith('prov-123', 'My Provider');
    expect(result.current.isSheetOpen).toBe(false);
  });

  it('shows error toast when provider.create fails', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('My Provider'));

    mockBuildPayload.mockReturnValue({ name: 'My Provider' });
    mockServices.provider.create.mockRejectedValue(new Error('DB error'));

    await act(async () => result.current.submit());

    expect(mockToastApi.toast.show).toHaveBeenCalledWith({
      label: 'settings.provider.create_custom.saveFailed',
      variant: 'danger',
    });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('resets submitting state after error', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('My Provider'));

    mockBuildPayload.mockReturnValue({ name: 'My Provider' });
    mockServices.provider.create.mockRejectedValue(new Error('DB error'));

    await act(async () => result.current.submit());

    expect(result.current.isSubmitting).toBe(false);
  });

  it('returns endpointOptions with type and labelKey', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    expect(result.current.endpointOptions).toEqual([
      {
        type: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        labelKey: 'settings.provider.endpoint_type.openai_chat',
      },
      {
        type: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
        labelKey: 'settings.provider.endpoint_type.anthropic',
      },
      {
        type: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
        labelKey: 'settings.provider.endpoint_type.gemini',
      },
      {
        type: ENDPOINT_TYPE.OPENAI_RESPONSES,
        labelKey: 'settings.provider.endpoint_type.openai_responses',
      },
    ]);
  });

  it('allows selecting a different endpoint type', async () => {
    const { result } = renderHook(() => useCreateCustomProvider());

    act(() => result.current.setSelectedEndpointType(ENDPOINT_TYPE.ANTHROPIC_MESSAGES));

    expect(result.current.selectedEndpointType).toBe(ENDPOINT_TYPE.ANTHROPIC_MESSAGES);
  });
});
