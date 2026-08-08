import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import type {
  ApiKeyEntry,
  AuthConfig,
  Provider,
} from '@cherrystudio/universal/data/types/provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ScrollView } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { Backend } from '@/shared/contracts';

import ProviderDetailScreen from '../ProviderDetailScreen';

type QueryState = { isPending: boolean; isError: boolean; isSuccess: boolean };
type SectionProps = {
  apiKeysInput?: string;
  baseUrl?: string;
  onApiKeysCommit?: (value: string) => void;
  provider?: Provider;
  showApiKeys: boolean;
  showBaseUrl: boolean;
};

const pendingQuery: QueryState = { isError: false, isPending: true, isSuccess: false };
const settledQuery: QueryState = { isError: false, isPending: false, isSuccess: true };

const testProvider = {
  authType: 'api-key',
  defaultChatEndpoint: 'openai-chat-completions',
  endpointConfigs: { 'openai-chat-completions': { baseUrl: 'https://chat.example.com' } },
  id: 'provider-1',
  isEnabled: true,
  name: 'Provider One',
} as unknown as Provider;

let mockProviderId: string | undefined;
let mockProvider: Provider | undefined;
let mockProviderQuery: QueryState;
let mockApiKeys: ApiKeyEntry[] | undefined;
let mockApiKeysQuery: QueryState;
let mockAuthConfig: AuthConfig | null | undefined;
let mockAuthConfigQuery: QueryState;
let mockRedirectHref: unknown;
let mockSpinnerRenderCount: number;
let mockChromeRenderCount: number;
let mockSectionRenders: SectionProps[];
const mockReplaceApiKeys = jest.fn(async () => undefined);
const mockAlertConfirm = jest.fn();
const mockAlertShow = jest.fn();
let queryClient: QueryClient;

const providersBackend = {
  canRemove: jest.fn(() => true),
  remove: jest.fn(async () => undefined),
} as unknown as Backend['providers'];
const backend = { providers: providersBackend } as Backend;
const dataApi = {
  delete: jest.fn(async () => undefined),
  get: jest.fn(),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as ApiClient;

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    mockRedirectHref = href;
    return null;
  },
  useLocalSearchParams: () => ({ providerId: mockProviderId }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({
    alert: {
      confirm: mockAlertConfirm,
      show: mockAlertShow,
    },
  }),
}));

jest.mock('@/frontend/components/headers', () => ({
  BackHeader: () => null,
}));

jest.mock('@cherrystudio/ui/components', () => ({
  Spinner: () => {
    mockSpinnerRenderCount += 1;
    return null;
  },
}));

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));

jest.mock('lucide-uniwind/png', () => ({
  PlusIcon: () => null,
  SquareArrowOutUpRightIcon: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The barrel also re-exports the API service form components, which pull Reanimated in
// through heroui-native. The screen only needs the pure helpers plus the query hook.
jest.mock('../apiService', () => ({
  ...jest.requireActual('../apiService/utils/providerApiServiceApiKeys'),
  ...jest.requireActual('../apiService/utils/providerApiServiceAuth'),
  ...jest.requireActual('../apiService/utils/providerApiServiceEndpointRules'),
  useProviderApiServiceQueries: () => ({
    apiKeys: mockApiKeys,
    apiKeysQuery: mockApiKeysQuery,
    authConfig: mockAuthConfig,
    authConfigQuery: mockAuthConfigQuery,
    replaceApiKeysMutation: { mutateAsync: mockReplaceApiKeys },
  }),
}));

jest.mock('../detail', () => ({
  useProviderDetailSettings: () => ({
    models: [],
    modelsQuery: { isPending: false },
    provider: mockProvider,
    providerQuery: mockProviderQuery,
    updateProviderEnabledMutation: { isPending: false, mutate: jest.fn() },
  }),
}));

jest.mock('../detail/components/ProviderDetailChrome/ProviderDetailChrome', () => ({
  ProviderDetailChrome: () => {
    mockChromeRenderCount += 1;
    return null;
  },
}));

jest.mock('../detail/components/ProviderDetailTabs/ProviderDetailTabs', () => ({
  ProviderDetailTabs: () => null,
}));

jest.mock('../components/ProviderApiManagementSection', () => ({
  ProviderApiManagementSection: (props: SectionProps) => {
    mockSectionRenders.push(props);
    return null;
  },
}));

jest.mock('../components/ProviderModelList', () => ({
  // The API management section is handed over as this list's header, so the stub has to
  // render it for the assertions below to see anything.
  ProviderModelList: ({ header }: { header?: ReactElement }) => header ?? null,
}));

jest.mock('../models/hooks/useProviderModelPull', () => ({
  useProviderModelPull: () => ({ isPreviewLoading: false, loadPullPreview: jest.fn() }),
}));

describe('ProviderDetailScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  function loadEverything() {
    mockProvider = testProvider;
    mockProviderQuery = settledQuery;
    mockApiKeys = [{ id: 'key-a', isEnabled: true, key: 'sk-a' }];
    mockApiKeysQuery = settledQuery;
    mockAuthConfig = { type: 'api-key' };
    mockAuthConfigQuery = settledQuery;
  }

  function render() {
    act(() => {
      renderer = create(renderSubject());
    });
  }

  function rerender() {
    act(() => {
      renderer?.update(renderSubject());
    });
  }

  function renderSubject() {
    return (
      <QueryClientProvider client={queryClient}>
        <BackendProvider backend={backend}>
          <DataApiProvider dataApi={dataApi}>
            <ProviderDetailScreen />
          </DataApiProvider>
        </BackendProvider>
      </QueryClientProvider>
    );
  }

  beforeEach(() => {
    mockProviderId = 'provider-1';
    mockProvider = undefined;
    mockProviderQuery = pendingQuery;
    mockApiKeys = undefined;
    mockApiKeysQuery = pendingQuery;
    mockAuthConfig = undefined;
    mockAuthConfigQuery = pendingQuery;
    mockRedirectHref = undefined;
    mockSpinnerRenderCount = 0;
    mockChromeRenderCount = 0;
    mockSectionRenders = [];
    mockReplaceApiKeys.mockClear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('shows a spinner instead of a half-built API management section while loading', () => {
    render();

    expect(mockSpinnerRenderCount).toBe(1);
    expect(mockSectionRenders).toEqual([]);
  });

  // The spinner used to replace the whole screen, so the scroll view and the bottom
  // toolbar only mounted once the queries landed — after the push had settled. On a
  // first visit that left the scroll view with a zero top content inset and the
  // content rendered underneath the native header.
  it('mounts the scroll view and the bottom chrome before the queries land', () => {
    render();

    expect(renderer?.root.findAllByType(ScrollView)).not.toHaveLength(0);
    expect(mockChromeRenderCount).toBe(1);
  });

  // The section used to mount without its Base URL / API keys blocks and gain them a
  // commit later, once the draft effect had run. It must never render half-built.
  it('renders the API management section complete on its first pass', () => {
    loadEverything();
    render();

    expect(mockSectionRenders).toHaveLength(1);
    expect(mockSectionRenders[0]).toMatchObject({
      apiKeysInput: 'sk-a',
      baseUrl: 'https://chat.example.com',
      showApiKeys: true,
      showBaseUrl: true,
    });
  });

  it('takes the same path whether the queries were cold or already cached', () => {
    render();
    const coldStartRenders = mockSectionRenders.length;

    loadEverything();
    rerender();
    const afterLoad = sectionContent(mockSectionRenders.at(-1));

    mockSectionRenders = [];
    act(() => renderer?.unmount());
    render();

    expect(coldStartRenders).toBe(0);
    expect(mockSectionRenders).toHaveLength(1);
    expect(sectionContent(mockSectionRenders[0])).toEqual(afterLoad);
  });

  it('follows the API keys query when the server data refreshes', () => {
    loadEverything();
    render();

    mockApiKeys = [
      { id: 'key-a', isEnabled: true, key: 'sk-a' },
      { id: 'key-b', isEnabled: true, key: 'sk-b' },
    ];
    rerender();

    expect(mockSectionRenders.at(-1)?.apiKeysInput).toBe('sk-a,sk-b');
  });

  it('persists API keys edited directly in the configuration field', () => {
    loadEverything();
    mockApiKeys = [
      { id: 'key-a', isEnabled: true, key: 'sk-a' },
      { id: 'key-b', isEnabled: false, key: 'sk-b' },
    ];
    render();

    act(() => mockSectionRenders[0]?.onApiKeysCommit?.('next-a, next-b'));

    expect(mockReplaceApiKeys).toHaveBeenCalledWith([
      { id: 'key-a', isEnabled: true, key: 'next-a' },
      { id: 'key-b', isEnabled: false, key: 'next-b' },
    ]);
  });

  it('hides the API keys and base URL blocks for providers that use neither', () => {
    loadEverything();
    mockProvider = { ...testProvider, authType: 'iam-gcp' } as Provider;
    mockAuthConfig = { location: '', project: '', type: 'iam-gcp' };
    render();

    expect(mockSectionRenders[0]).toMatchObject({ showApiKeys: false, showBaseUrl: false });
  });

  it('redirects to the provider list when the route has no provider id', () => {
    mockProviderId = undefined;
    render();

    expect(mockRedirectHref).toBe('/settings/provider');
    expect(mockSpinnerRenderCount).toBe(0);
  });

  it('redirects to the provider list when the provider cannot be loaded', () => {
    mockProviderQuery = { isError: true, isPending: false, isSuccess: false };
    render();

    expect(mockRedirectHref).toBe('/settings/provider');
  });
});

// The section's callbacks are fresh closures per render, so only its rendered content is
// comparable across renders.
function sectionContent(props: SectionProps | undefined) {
  return (
    props && {
      apiKeysInput: props.apiKeysInput,
      baseUrl: props.baseUrl,
      showApiKeys: props.showApiKeys,
      showBaseUrl: props.showBaseUrl,
    }
  );
}
