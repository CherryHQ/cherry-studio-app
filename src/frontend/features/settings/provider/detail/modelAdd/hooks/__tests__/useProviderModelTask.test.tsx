import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Provider } from '@/shared/data/types/provider';

import { useProviderModelTask } from '../useProviderModelTask';

const provider = { id: 'provider', name: 'Provider' } as Provider;
const mockCompleteSetup = jest.fn();
const mockDismissTo = jest.fn();
const mockReplace = jest.fn();
const mockAllowNavigation = jest.fn();
const mockBeforeNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo, replace: mockReplace }),
}));
jest.mock('../../../../hooks/useProviderSetup', () => ({
  useProviderSetup: () => ({ completeSetup: mockCompleteSetup }),
}));
jest.mock('../../../../apiService', () => ({
  useProviderApiServiceSheetClose: () => ({
    allowNavigation: mockAllowNavigation,
    closeWithoutPrompt: jest.fn(),
    requestClose: jest.fn(),
  }),
}));

describe('model task completion', () => {
  let renderer: ReactTestRenderer;
  let flow: ReturnType<typeof useProviderModelTask>;
  function Probe({ shouldEnableProvider = true }: { shouldEnableProvider?: boolean }) {
    flow = useProviderModelTask({
      provider,
      returnTo: '/agents/new',
      shouldEnableProvider,
      isSaving: false,
      beforeNavigate: mockBeforeNavigate,
    });
    return null;
  }
  beforeEach(() => {
    jest.clearAllMocks();
    mockCompleteSetup.mockResolvedValue(true);
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
  });

  it('retains saved models after failed activation and completes on retry', async () => {
    mockCompleteSetup.mockResolvedValueOnce(false);
    await act(async () => {
      await flow.completeAfterSave();
    });
    expect(flow.hasSavedModels).toBe(true);
    expect(flow.isEnabling).toBe(false);
    expect(mockDismissTo).not.toHaveBeenCalled();

    await act(async () => {
      await flow.completeFlow();
    });
    expect(mockCompleteSetup).toHaveBeenCalledTimes(2);
    expect(mockDismissTo).toHaveBeenCalledWith('/agents/new');
  });

  it('finishes ordinary model tasks without activating the provider', async () => {
    act(() => renderer.update(<Probe shouldEnableProvider={false} />));
    await act(async () => {
      await flow.completeAfterSave();
    });
    expect(mockCompleteSetup).not.toHaveBeenCalled();
    expect(mockBeforeNavigate).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith('/agents/new');
  });

  it('preserves activation intent and the requesting surface when repairing configuration', () => {
    act(() => flow.openConfiguration());
    expect(mockBeforeNavigate).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/settings/provider/new',
      params: {
        providerId: 'provider',
        providerName: 'Provider',
        intent: 'enable',
        returnTo: '/agents/new',
      },
    });
  });
});
