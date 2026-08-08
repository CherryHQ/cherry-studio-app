import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

// `mock`-prefixed names are the only out-of-scope variables jest.mock factories
// may reference (they are hoisted above the imports).
const mockPromptAsync = jest.fn();
const mockCompleteAuthorization = jest.fn(async () => undefined);
const mockLogout = jest.fn(async () => undefined);
const mockGetBalance = jest.fn(async () => ({ balance: 42 }));
const mockAlertShow = jest.fn();
const mockAuthRequestConfig: { value: unknown } = { value: undefined };
const mockRedirectParts: { value: unknown } = { value: undefined };

jest.mock('expo-auth-session', () => ({
  ResponseType: { Code: 'code' },
  makeRedirectUri: (parts: unknown) => {
    mockRedirectParts.value = parts;
    return 'cherrystudio://oauth/callback';
  },
  useAuthRequest: (config: unknown, discovery: unknown) => {
    mockAuthRequestConfig.value = { config, discovery };
    return [{ codeVerifier: 'the-verifier' }, null, mockPromptAsync];
  },
}));

jest.mock('@/frontend/data', () => ({
  queryKeys: {
    providers: {
      apiKeys: (id: string) => ['providers', id, 'apiKeys'],
      authConfig: (id: string) => ['providers', id, 'auth'],
      detail: (id: string) => ['providers', id],
      list: () => ['providers'],
    },
  },
  useBackendModule: (key: string) =>
    key === 'oauth'
      ? { completeAuthorization: mockCompleteAuthorization, logout: mockLogout }
      : { getBalance: mockGetBalance },
  useQuery: () => ({ data: undefined, refetch: jest.fn(async () => undefined) }),
}));

jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { useCherryInOauth, UserCancelledError } from '../useCherryInOauth';

function renderSubject() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let latest: ReturnType<typeof useCherryInOauth> | undefined;

  function Probe() {
    latest = useCherryInOauth({ providerId: 'cherryin', requestConfirmation: jest.fn() });
    return null;
  }

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  act(() => {
    create(
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
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useCherryInOauth', () => {
  // The point of the OAuth registry: this screen must not carry its own copy of
  // CherryIN's client id, scopes, endpoint or redirect.
  it('builds the authorization request from the shared OAuth registry', () => {
    renderSubject();

    expect(mockRedirectParts.value).toEqual({ path: 'oauth/callback', scheme: 'cherrystudio' });
    expect(mockAuthRequestConfig.value).toMatchObject({
      config: {
        clientId: '2a348c87-bae1-4756-a62f-b2e97200fd6d',
        redirectUri: 'cherrystudio://oauth/callback',
        usePKCE: true,
      },
      discovery: { authorizationEndpoint: 'https://open.cherryin.ai/oauth2/auth' },
    });
    expect(
      (mockAuthRequestConfig.value as { config: { scopes: string[] } }).config.scopes,
    ).toContain('offline_access');
  });

  it('hands the code and PKCE verifier to the provider-generic OAuth contract', async () => {
    mockPromptAsync.mockResolvedValue({ params: { code: 'the-code' }, type: 'success' });
    const subject = renderSubject();

    await act(async () => {
      await subject.current.handleOAuthLogin();
    });

    expect(mockCompleteAuthorization).toHaveBeenCalledWith({
      code: 'the-code',
      codeVerifier: 'the-verifier',
      providerId: 'cherryin',
      redirectUri: 'cherrystudio://oauth/callback',
    });
  });

  it('raises UserCancelledError when the user dismisses the browser', async () => {
    mockPromptAsync.mockResolvedValue({ type: 'cancel' });
    const subject = renderSubject();

    await act(async () => {
      await expect(subject.current.handleOAuthLogin()).rejects.toBeInstanceOf(UserCancelledError);
    });

    expect(mockCompleteAuthorization).not.toHaveBeenCalled();
  });

  it('reads the balance without naming a host', async () => {
    const subject = renderSubject();

    await act(async () => {
      await subject.current.fetchData();
    });

    expect(mockGetBalance).toHaveBeenCalledWith();
    expect(subject.current.balance).toBe(42);
  });

  it('logs out by provider id rather than by host', async () => {
    const requestConfirmation = jest.fn(
      (options: { onConfirm: () => void }) => void options.onConfirm(),
    );
    let latest: ReturnType<typeof useCherryInOauth> | undefined;

    function Probe() {
      latest = useCherryInOauth({ providerId: 'cherryin', requestConfirmation });
      return null;
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    act(() => {
      create(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      latest?.handleLogout();
    });

    expect(mockLogout).toHaveBeenCalledWith('cherryin');
  });
});
