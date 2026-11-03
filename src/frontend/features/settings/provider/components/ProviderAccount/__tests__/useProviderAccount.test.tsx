import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setStringAsync } from 'expo-clipboard';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  ProviderAccountError,
  type ProviderAccountsModule,
  type ProviderAccountStatus,
  type ProviderSignInEvent,
  type ProviderSignInInteraction,
} from '@/shared/contracts';

import { useProviderAccount } from '../useProviderAccount';

const mockToast = jest.fn();
const mockAccounts = {
  getStatus: jest.fn<ReturnType<ProviderAccountsModule['getStatus']>, [string]>(),
  refresh: jest.fn<ReturnType<ProviderAccountsModule['refresh']>, [string]>(),
  signIn: jest.fn<
    ReturnType<ProviderAccountsModule['signIn']>,
    [string, ProviderSignInInteraction]
  >(),
};

jest.mock('@/frontend/data', () => ({
  queryKeys: jest.requireActual('@/frontend/data/queryKeys').queryKeys,
  useBackendModule: () => ({ accounts: mockAccounts }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  openBrowserAsync: jest.fn(),
}));
jest.mock('expo-linking', () => ({ clearInitialURL: jest.fn() }));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToast } }),
}));

const deviceCode: ProviderSignInEvent = {
  type: 'device-code',
  code: '  AbCd-1234\n',
  url: 'https://example.com/device',
};
const signedOut: ProviderAccountStatus = {
  signedIn: false,
  balance: null,
  displayName: null,
  email: null,
  updatedAt: null,
};
const successToast = {
  label: 'settings.provider.account.deviceCodeCopied',
  variant: 'success',
};
const failureToast = {
  label: 'settings.provider.account.deviceCodeCopyFailed',
  variant: 'danger',
};

describe('device verification code copy feedback', () => {
  let queryClient: QueryClient;
  let renderer: ReactTestRenderer;
  let account: ReturnType<typeof useProviderAccount>;
  let interaction: ProviderSignInInteraction;
  let finishSignIn: (() => void) | undefined;
  let pendingLogin: Promise<void> | undefined;
  const onKeysChanged = jest.fn(async () => {});
  const onBusyChange = jest.fn();
  const clipboard = jest.mocked(setStringAsync);

  function AccountProbe() {
    account = useProviderAccount('copilot', onKeysChanged, onBusyChange, true);
    return null;
  }

  async function emit(event: ProviderSignInEvent) {
    await act(async () => interaction.notify(event));
  }

  async function startLogin(event = deviceCode) {
    await act(async () => {
      pendingLogin = account.login();
    });
    await emit(event);
    expect(account.busy).toBe(true);
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    finishSignIn = undefined;
    pendingLogin = undefined;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockAccounts.getStatus.mockResolvedValue(signedOut);
    mockAccounts.refresh.mockResolvedValue(signedOut);
    mockAccounts.signIn.mockImplementation((_providerId, nextInteraction) => {
      interaction = nextInteraction;
      return new Promise<void>((resolve) => {
        finishSignIn = resolve;
      });
    });
    clipboard.mockResolvedValue(true);
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <AccountProbe />
        </QueryClientProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      finishSignIn?.();
      await pendingLogin;
      renderer.unmount();
    });
    queryClient.clear();
  });

  it('copies the exact code and reports success only after the write settles', async () => {
    await startLogin();
    let finishWrite!: (value: boolean) => void;
    clipboard.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finishWrite = resolve)),
    );
    let pendingCopy!: Promise<void>;
    await act(async () => {
      pendingCopy = account.copyLoginCode();
    });
    expect(clipboard).toHaveBeenCalledTimes(1);
    expect(clipboard).toHaveBeenCalledWith(deviceCode.code);
    expect(mockToast).not.toHaveBeenCalled();

    await act(async () => {
      finishWrite(true);
      await pendingCopy;
    });
    expect(mockToast.mock.calls).toEqual([[successToast]]);
  });

  it('resolves a rejected write and reports exactly one failure toast', async () => {
    await startLogin();
    clipboard.mockRejectedValueOnce(new Error('clipboard unavailable'));
    await act(async () => {
      await expect(account.copyLoginCode()).resolves.toBeUndefined();
    });
    expect(mockToast.mock.calls).toEqual([[failureToast]]);
  });

  it('keeps the account error null after a rejected write', async () => {
    await startLogin();
    clipboard.mockRejectedValueOnce(new Error('clipboard unavailable'));
    await act(async () => account.copyLoginCode());
    expect(account.error).toBeNull();
  });

  it('allows a successful retry while sign-in stays busy', async () => {
    await startLogin();
    clipboard.mockRejectedValueOnce(new Error('clipboard unavailable'));
    await act(async () => account.copyLoginCode());
    expect(account.busy).toBe(true);

    let finishWrite!: (value: boolean) => void;
    clipboard.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finishWrite = resolve)),
    );
    let pendingCopy!: Promise<void>;
    await act(async () => {
      pendingCopy = account.copyLoginCode();
    });
    expect(account.busy).toBe(true);
    await act(async () => {
      finishWrite(true);
      await pendingCopy;
    });
    expect(account.busy).toBe(true);
    expect(onBusyChange.mock.calls).toEqual([[true]]);
    expect(clipboard.mock.calls).toEqual([[deviceCode.code], [deviceCode.code]]);
    expect(mockToast.mock.calls).toEqual([[failureToast], [successToast]]);
  });

  it.each<{ event: ProviderSignInEvent | null; name: string }>([
    { event: null, name: 'no event' },
    { event: { type: 'progress' }, name: 'a progress event' },
    { event: { type: 'browser', url: 'https://example.com/login' }, name: 'a browser event' },
  ])('does nothing with $name', async ({ event }) => {
    if (event) await startLogin(event);
    await act(async () => account.copyLoginCode());
    expect(clipboard).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('reports both successful copies when tapped twice', async () => {
    await startLogin();
    await act(async () => {
      await Promise.all([account.copyLoginCode(), account.copyLoginCode()]);
    });
    expect(clipboard.mock.calls).toEqual([[deviceCode.code], [deviceCode.code]]);
    expect(mockToast.mock.calls).toEqual([[successToast], [successToast]]);
  });

  it.each([false, true])(
    'preserves an existing account error when copy rejects: %s',
    async (reject) => {
      await startLogin();
      mockAccounts.refresh.mockRejectedValueOnce(new ProviderAccountError('network'));
      await act(async () => account.refresh());
      expect(account.error).toBe('network');

      if (reject) clipboard.mockRejectedValueOnce(new Error('clipboard unavailable'));
      await act(async () => account.copyLoginCode());
      expect(account.error).toBe('network');
      expect(clipboard.mock.calls).toEqual([[deviceCode.code]]);
      expect(mockToast.mock.calls).toEqual([[reject ? failureToast : successToast]]);
    },
  );
});
