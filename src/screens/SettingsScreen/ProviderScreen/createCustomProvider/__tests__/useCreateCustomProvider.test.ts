import { act, renderHook } from '@testing-library/react-native';
import { useCreateCustomProvider } from '../useCreateCustomProvider';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
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
  getQueryData: jest.fn(),
  invalidateQueries: jest.fn(),
};
const mockToastShow = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockUseDataServices.mockReturnValue(mockServices);
  mockUseQueryClient.mockReturnValue(mockQueryClient);
  jest.requireMock('heroui-native/toast').useToast().toast.show = mockToastShow;
});

describe('useCreateCustomProvider', () => {
  it('returns default state', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    expect(result.current.isSheetOpen).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.name).toBe('');
    expect(result.current.selectedEndpointType).toBe('openai-chat-completions');
    expect(result.current.canSubmit).toBe(false);
  });

  it('canSubmit is false when name is empty', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName(''));

    expect(result.current.canSubmit).toBe(false);
  });

  it('canSubmit is true when name is non-empty and not submitting', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('My Provider'));

    expect(result.current.canSubmit).toBe(true);
  });

  it('canSubmit is false when name is only whitespace', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('   '));

    expect(result.current.canSubmit).toBe(false);
  });

  it('canSubmit is false while submitting', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('My Provider'));

    mockQueryClient.getQueryData.mockReturnValue([]);
    mockServices.provider.create.mockImplementation(() => new Promise(() => {}));

    await act(async () => result.current.submit());

    expect(result.current.canSubmit).toBe(false);
  });

  it('openSheet opens the sheet and resets form', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('Old Name'));
    act(() => result.current.openSheet());

    expect(result.current.isSheetOpen).toBe(true);
    expect(result.current.name).toBe('');
  });

  it('closeSheet closes the sheet', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.openSheet());
    act(() => result.current.closeSheet());

    expect(result.current.isSheetOpen).toBe(false);
  });

  it('closeSheet does not close while submitting', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.openSheet());

    mockQueryClient.getQueryData.mockReturnValue([]);
    mockServices.provider.create.mockImplementation(() => new Promise(() => {}));

    act(() => result.current.setName('My Provider'));
    await act(async () => result.current.submit());
    act(() => result.current.closeSheet());

    expect(result.current.isSheetOpen).toBe(true);
  });

  it('submit returns early when canSubmit is false', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    await act(async () => result.current.submit());

    expect(mockServices.provider.create).not.toHaveBeenCalled();
  });

  it('submit shows error toast on duplicate name', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('Existing Provider'));

    mockQueryClient.getQueryData.mockReturnValue([{ name: 'Existing Provider' }]);

    await act(async () => result.current.submit());

    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.provider.create_custom.duplicateName',
      variant: 'danger',
    });
    expect(mockServices.provider.create).not.toHaveBeenCalled();
  });

  it('checks duplicate name case-insensitively', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('existing provider'));

    mockQueryClient.getQueryData.mockReturnValue([{ name: 'Existing Provider' }]);

    await act(async () => result.current.submit());

    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.provider.create_custom.duplicateName',
      variant: 'danger',
    });
  });

  it('checks duplicate name with whitespace trimming', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('  My Provider  '));

    mockQueryClient.getQueryData.mockReturnValue([{ name: 'My Provider' }]);

    await act(async () => result.current.submit());

    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.provider.create_custom.duplicateName',
      variant: 'danger',
    });
  });

  it('calls provider.create and invalidates queries on submit', async () => {
    const onCreated = jest.fn();
    const { result } = await renderHook(() => useCreateCustomProvider({ onCreated }));

    act(() => result.current.setName('My Provider'));

    mockQueryClient.getQueryData.mockReturnValue([]);
    mockBuildPayload.mockReturnValue({ name: 'My Provider' });
    mockServices.provider.create.mockResolvedValue({ id: 'prov-123', name: 'My Provider' });

    await act(async () => result.current.submit());

    expect(mockBuildPayload).toHaveBeenCalledWith({
      defaultChatEndpoint: 'openai-chat-completions',
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
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('My Provider'));

    mockQueryClient.getQueryData.mockReturnValue([]);
    mockBuildPayload.mockReturnValue({ name: 'My Provider' });
    mockServices.provider.create.mockRejectedValue(new Error('DB error'));

    await act(async () => result.current.submit());

    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.provider.create_custom.saveFailed',
      variant: 'danger',
    });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('resets submitting state after error', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.setName('My Provider'));

    mockQueryClient.getQueryData.mockReturnValue([]);
    mockBuildPayload.mockReturnValue({ name: 'My Provider' });
    mockServices.provider.create.mockRejectedValue(new Error('DB error'));

    await act(async () => result.current.submit());

    expect(result.current.isSubmitting).toBe(false);
  });

  it('returns endpointOptions with type and labelKey', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    expect(result.current.endpointOptions).toEqual([
      { type: 'openai-chat-completions', labelKey: 'settings.provider.endpoint_type.openai_chat' },
      { type: 'anthropic-messages', labelKey: 'settings.provider.endpoint_type.anthropic' },
      { type: 'google-generate-content', labelKey: 'settings.provider.endpoint_type.gemini' },
      { type: 'openai-responses', labelKey: 'settings.provider.endpoint_type.openai_responses' },
    ]);
  });

  it('allows selecting a different endpoint type', async () => {
    const { result } = await renderHook(() => useCreateCustomProvider());

    act(() => result.current.setSelectedEndpointType('anthropic-messages'));

    expect(result.current.selectedEndpointType).toBe('anthropic-messages');
  });
});
