import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

const mockStartAuthorization = jest.fn();
const mockCompleteAuthorization = jest.fn(async () => ({ status: 'completed' as const }));
const mockCancelAuthorization = jest.fn(async () => undefined);
const mockGetStatus = jest.fn(async () => ({
  accountId: null,
  flowType: 'pkce-session' as const,
  isAuthenticated: false,
  isConfigured: true,
  providerId: 'cherryin',
}));
const mockLogout = jest.fn(async () => undefined);
const mockPush = jest.fn();

jest.mock('expo-auth-session', () => ({
  __esModule: true,
  makeRedirectUri: jest.fn(() => 'cherrystudio://oauth/callback'),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/frontend/data', () => ({
  queryKeys: {
    providers: {
      apiKeys: (id: string) => ['providers', id, 'apiKeys'],
      authConfig: (id: string) => ['providers', id, 'auth'],
      detail: (id: string) => ['providers', id],
      list: () => ['providers'],
    },
  },
  useBackendModule: () => ({
    cancelAuthorization: mockCancelAuthorization,
    completeAuthorization: mockCompleteAuthorization,
    getStatus: mockGetStatus,
    logout: mockLogout,
    startAuthorization: mockStartAuthorization,
  }),
}));
jest.mock('@/frontend/utils/openExternalUrl', () => ({ openExternalUrl: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'zh-CN' } }),
}));

import { UserCancelledError, useProviderOauth } from '../useProviderOauth';

const mockOpenAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock;
const mockOpenExternalUrl = openExternalUrl as jest.Mock;
const mockSetString = Clipboard.setStringAsync as jest.Mock;

function renderSubject(providerId = 'cherryin') {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { gcTime: Infinity },
      queries: { gcTime: Infinity, retry: false },
    },
  });
  let latest: ReturnType<typeof useProviderOauth> | undefined;
  let renderer: ReactTestRenderer;

  function Probe() {
    latest = useProviderOauth(providerId);
    return null;
  }
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  act(() => {
    renderer = create(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );
  });

  return {
    get current() {
      if (!latest) throw new Error('hook did not render');
      return latest;
    },
    unmount: () => {
      act(() => renderer.unmount());
      queryClient.clear();
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetString.mockResolvedValue(undefined);
  mockOpenExternalUrl.mockResolvedValue(undefined);
});

describe('useProviderOauth', () => {
  it('completes a backend-owned PKCE flow with only the callback URL', async () => {
    mockStartAuthorization.mockResolvedValue({
      authorizationUrl: 'https://open.cherryin.ai/oauth2/auth?state=state',
      expiresAt: Date.now() + 60_000,
      flowId: 'flow-1',
      providerId: 'cherryin',
      redirectUri: 'cherrystudio://oauth/callback',
      type: 'pkce-session',
    });
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: 'cherrystudio://oauth/callback?code=code&state=state',
    });
    const subject = renderSubject();

    await act(async () => subject.current.login());

    expect(mockStartAuthorization).toHaveBeenCalledWith({
      language: 'zh-CN',
      providerId: 'cherryin',
      redirectUri: 'cherrystudio://oauth/callback',
    });
    expect(mockCompleteAuthorization).toHaveBeenCalledWith({
      callbackUrl: 'cherrystudio://oauth/callback?code=code&state=state',
      flowId: 'flow-1',
      type: 'pkce-session',
    });
    subject.unmount();
  });

  it('hands a WebView flow to the restricted authorization route', async () => {
    mockStartAuthorization.mockResolvedValue({
      allowedOrigins: ['https://dash.302.ai'],
      authorizationUrl: 'https://dash.302.ai/sso/login',
      expiresAt: Date.now() + 60_000,
      flowId: 'flow-web',
      providerId: '302ai',
      type: 'webview-api-key',
    });
    const subject = renderSubject('302ai');

    await act(async () => subject.current.login());

    expect(mockPush).toHaveBeenCalledWith({
      params: { flowId: 'flow-web' },
      pathname: '/oauth/authorize',
    });
    expect(mockCompleteAuthorization).not.toHaveBeenCalled();
    expect(mockCancelAuthorization).not.toHaveBeenCalled();
    subject.unmount();
  });

  it('copies and opens a Copilot device code while the backend polls', async () => {
    mockStartAuthorization.mockResolvedValue({
      expiresAt: Date.now() + 60_000,
      flowId: 'flow-device',
      intervalSeconds: 5,
      providerId: 'copilot',
      type: 'device-code-session',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://github.com/login/device',
    });
    const subject = renderSubject('copilot');

    await act(async () => subject.current.login());

    expect(mockSetString).toHaveBeenCalledWith('ABCD-EFGH');
    expect(mockOpenExternalUrl).toHaveBeenCalledWith('https://github.com/login/device');
    expect(mockCompleteAuthorization).toHaveBeenCalledWith({
      flowId: 'flow-device',
      type: 'device-code-session',
    });
    subject.unmount();
  });

  it('cancels an opaque flow when the browser is dismissed', async () => {
    mockStartAuthorization.mockResolvedValue({
      authorizationUrl: 'https://open.cherryin.ai/oauth2/auth',
      expiresAt: Date.now() + 60_000,
      flowId: 'flow-cancel',
      providerId: 'cherryin',
      redirectUri: 'cherrystudio://oauth/callback',
      type: 'pkce-session',
    });
    mockOpenAuthSession.mockResolvedValue({ type: 'cancel' });
    const subject = renderSubject();

    await act(async () => {
      await expect(subject.current.login()).rejects.toBeInstanceOf(UserCancelledError);
    });

    expect(mockCancelAuthorization).toHaveBeenCalledWith('flow-cancel');
    subject.unmount();
  });
});
