import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ProviderSetupStatus } from '@/shared/contracts';
import type { Provider } from '@/shared/data/types/provider';

import { useProviderSetup } from '../useProviderSetup';

const provider = { id: 'provider', name: 'Provider', isEnabled: false } as Provider;
const mockGetSetupStatus = jest.fn<Promise<ProviderSetupStatus>, [string]>();
const mockEnable = jest.fn(async () => ({ ...provider, isEnabled: true }));
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissTo = jest.fn();
const mockToastShow = jest.fn();
const mockAlertShow = jest.fn();
const mockProviders = { getSetupStatus: mockGetSetupStatus, enable: mockEnable };
const mockRouter = { push: mockPush, replace: mockReplace, dismissTo: mockDismissTo };
const mockQueryClient = { invalidateQueries: jest.fn(async () => undefined) };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => mockQueryClient }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
  useToast: () => ({ toast: { show: mockToastShow } }),
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => mockProviders,
  queryKeys: {
    providers: {
      detail: (id: string) => [`/providers/${id}`],
      list: () => ['/providers'],
      page: () => ['/providers/page'],
    },
    models: { list: () => ['/models'] },
  },
}));

describe('provider setup navigation', () => {
  let renderer: ReactTestRenderer;
  let setup: ReturnType<typeof useProviderSetup>;
  function Probe() {
    setup = useProviderSetup();
    return null;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnable.mockResolvedValue({ ...provider, isEnabled: true });
    mockGetSetupStatus.mockResolvedValue({ provider, issue: null, hasModels: true });
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(async () => {
    await act(async () => renderer.unmount());
  });

  it('takes a missing-key activation directly to configuration and retains the original destination', async () => {
    mockGetSetupStatus.mockResolvedValue({ provider, issue: 'missing-api-key', hasModels: false });
    await act(async () => setup.openSetup(provider.id, '/settings/provider'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/settings/provider/new',
      params: {
        providerId: provider.id,
        providerName: provider.name,
        returnTo: '/settings/provider',
        intent: 'enable',
        issue: 'missing-api-key',
      },
    });
    expect(mockEnable).not.toHaveBeenCalled();
  });

  it('enables an already configured provider without requiring another synchronization', async () => {
    await act(async () => setup.openSetup(provider.id, '/agents/new'));
    expect(mockEnable).toHaveBeenCalledWith(provider.id);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockDismissTo).toHaveBeenCalledWith('/agents/new');
  });

  it('carries explicit activation intent when models still need to be added', async () => {
    mockGetSetupStatus.mockResolvedValue({ provider, issue: null, hasModels: false });
    await act(async () => setup.openSetup(provider.id, '/agents/new', 'enable', true));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          mode: 'sync',
          enableProvider: 'true',
          returnTo: '/agents/new',
        }),
      }),
    );
    expect(mockEnable).not.toHaveBeenCalled();
  });

  it('does not report completion or dismiss the page when enabling fails', async () => {
    mockEnable.mockRejectedValue(new Error('write failed'));
    const beforeNavigate = jest.fn();
    await act(async () =>
      setup.openSetup(provider.id, '/agents/new', 'enable', true, beforeNavigate),
    );
    expect(mockDismissTo).not.toHaveBeenCalled();
    expect(beforeNavigate).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }));
  });

  it('releases an edit guard only immediately before a successful navigation', async () => {
    const beforeNavigate = jest.fn(() => expect(mockDismissTo).not.toHaveBeenCalled());
    await act(async () =>
      setup.openSetup(provider.id, '/agents/new', 'enable', true, beforeNavigate),
    );
    expect(beforeNavigate).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith('/agents/new');
  });

  it('coalesces repeated taps while preparation is pending', async () => {
    let finish: (status: ProviderSetupStatus) => void = () => undefined;
    mockGetSetupStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      const first = setup.openSetup(provider.id, '/settings/provider');
      await setup.openSetup(provider.id, '/settings/provider');
      finish({ provider, issue: 'missing-api-key', hasModels: false });
      await first;
    });
    expect(mockGetSetupStatus).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
