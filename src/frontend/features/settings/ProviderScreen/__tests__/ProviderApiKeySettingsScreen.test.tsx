import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ApiKeyEntry, AuthConfig, Provider } from '@/shared/data/types/provider';
import ProviderApiKeySettingsScreen from '../ProviderApiKeySettingsScreen';

type QueryState = { isError: boolean; isPending: boolean; isSuccess: boolean };
type KeyFormProps = { apiKeys: readonly ApiKeyEntry[] };

const pendingQuery: QueryState = { isError: false, isPending: true, isSuccess: false };
const settledQuery: QueryState = { isError: false, isPending: false, isSuccess: true };

const apiKeyProvider = {
  authType: 'api-key',
  id: 'provider-1',
  isEnabled: true,
  name: 'Provider One',
} as unknown as Provider;

const persistedKeys: ApiKeyEntry[] = [{ id: 'key-a', isEnabled: true, key: 'sk-a' }];

let mockProviderId: string | undefined;
let mockProvider: Provider | undefined;
let mockProviderQuery: QueryState;
let mockApiKeys: ApiKeyEntry[] | undefined;
let mockAuthConfig: AuthConfig | null | undefined;
let mockAuthConfigQuery: QueryState;
let mockRedirectHref: unknown;
let mockKeyFormRenders: KeyFormProps[];

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    mockRedirectHref = href;
    return null;
  },
  useLocalSearchParams: () => ({ providerId: mockProviderId }),
}));

jest.mock('@/frontend/components/headers', () => ({
  BackHeader: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Keep the pure helpers and the draft hook real — they are what decides whether this
// screen belongs to the provider at all. Only the query layer and the form UI are stubbed.
jest.mock('../apiService', () => ({
  ...jest.requireActual('../apiService/utils/providerApiServiceApiKeys'),
  ...jest.requireActual('../apiService/utils/providerApiServiceAuth'),
  ...jest.requireActual('../apiService/utils/providerApiServiceDirtyState'),
  ...jest.requireActual('../apiService/hooks/useProviderApiServiceApiKeysDraft'),
  ProviderApiServiceApiKeyForm: (props: KeyFormProps) => {
    mockKeyFormRenders.push(props);
    return null;
  },
  useProviderApiServiceConfirmDialog: () => ({
    confirmDialog: null,
    requestConfirm: jest.fn(),
  }),
  useProviderApiServiceQueries: () => ({
    apiKeys: mockApiKeys,
    authConfig: mockAuthConfig,
    authConfigQuery: mockAuthConfigQuery,
    provider: mockProvider,
    providerQuery: mockProviderQuery,
    replaceApiKeysMutation: { mutateAsync: jest.fn() },
  }),
  useProviderApiServiceSheetClose: () => ({
    discardDialog: null,
    requestClose: jest.fn(),
  }),
}));

describe('ProviderApiKeySettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  function loadKeysOnly() {
    mockProvider = apiKeyProvider;
    mockProviderQuery = settledQuery;
    mockApiKeys = persistedKeys;
  }

  function settleAuthConfig(authConfig: AuthConfig) {
    mockAuthConfig = authConfig;
    mockAuthConfigQuery = settledQuery;
  }

  function render() {
    act(() => {
      renderer = create(<ProviderApiKeySettingsScreen />);
    });
  }

  function rerender() {
    act(() => {
      renderer?.update(<ProviderApiKeySettingsScreen />);
    });
  }

  beforeEach(() => {
    mockProviderId = 'provider-1';
    mockProvider = undefined;
    mockProviderQuery = pendingQuery;
    mockApiKeys = undefined;
    mockAuthConfig = undefined;
    mockAuthConfigQuery = pendingQuery;
    mockRedirectHref = undefined;
    mockKeyFormRenders = [];
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('does not mount the key form until the auth config settles', () => {
    loadKeysOnly();
    render();

    expect(mockKeyFormRenders).toEqual([]);
    expect(mockRedirectHref).toBeUndefined();
  });

  // Regression pin: the keys query and the auth config query settle independently. When
  // the keys landed first the form used to mount, and only the later auth config revealed
  // that this provider has no API keys at all — so the screen appeared, then redirected,
  // and only on a cold cache.
  it('redirects without ever mounting the form when the provider has no API keys', () => {
    loadKeysOnly();
    render();

    settleAuthConfig({ location: '', project: '', type: 'iam-gcp' } as AuthConfig);
    rerender();

    expect(mockKeyFormRenders).toEqual([]);
    expect(mockRedirectHref).toMatchObject({
      pathname: '/settings/provider/[providerId]',
    });
  });

  it('mounts the form with the persisted keys once both queries have settled', () => {
    loadKeysOnly();
    settleAuthConfig({ type: 'api-key' } as AuthConfig);
    render();

    expect(mockKeyFormRenders).toHaveLength(1);
    expect(mockKeyFormRenders[0].apiKeys).toEqual(persistedKeys);
    expect(mockRedirectHref).toBeUndefined();
  });

  it('takes the same path whether the queries were cold or already cached', () => {
    loadKeysOnly();
    render();
    const coldStartFormRenders = mockKeyFormRenders.length;

    settleAuthConfig({ type: 'api-key' } as AuthConfig);
    rerender();
    const afterLoad = mockKeyFormRenders.at(-1)?.apiKeys;

    act(() => renderer?.unmount());
    mockKeyFormRenders = [];
    render();

    expect(coldStartFormRenders).toBe(0);
    expect(afterLoad).toEqual(persistedKeys);
    expect(mockKeyFormRenders).toHaveLength(1);
    expect(mockKeyFormRenders[0].apiKeys).toEqual(afterLoad);
  });

  it('redirects to the provider list when the route has no provider id', () => {
    mockProviderId = undefined;
    render();

    expect(mockRedirectHref).toBe('/settings/provider');
  });

  it('redirects to the provider list when the provider cannot be loaded', () => {
    mockProviderQuery = { isError: true, isPending: false, isSuccess: false };
    render();

    expect(mockRedirectHref).toBe('/settings/provider');
    expect(mockKeyFormRenders).toEqual([]);
  });
});
