import type { ReactElement } from 'react';
import { ScrollView } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ApiKeyEntry, AuthConfig, Provider } from '@/data/types/provider';
import ProviderDetailScreen from '../ProviderDetailScreen';

type QueryState = { isPending: boolean; isError: boolean; isSuccess: boolean };
type SectionProps = {
  apiKeysInput?: string;
  baseUrl?: string;
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

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    mockRedirectHref = href;
    return null;
  },
  useLocalSearchParams: () => ({ providerId: mockProviderId }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('@/components/confirmDialog', () => ({
  useConfirmDialog: () => ({ confirmDialog: null, requestConfirm: jest.fn() }),
}));

jest.mock('@/components/headers', () => ({
  BackHeader: () => null,
}));

jest.mock('@/data/api', () => ({
  queryKeys: {
    providers: { list: jest.fn(() => ['providers']) },
  },
}));

jest.mock('@/hooks/data', () => ({
  useDataMutation: () => ({ isPending: false, mutateAsync: jest.fn() }),
}));

jest.mock('@/data/services/ProviderService', () => ({
  canDeleteProvider: () => true,
}));

jest.mock('heroui-native/spinner', () => ({
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

jest.mock('../models/components/ProviderModelCheckSheet', () => ({
  ProviderModelCheckSheet: () => null,
}));

jest.mock('../models/hooks/useProviderModelCheck', () => ({
  useProviderModelCheck: () => ({
    apiKeyOptions: [],
    closeSheet: jest.fn(),
    isChecking: false,
    isSheetOpen: false,
    openCheckSheet: jest.fn(),
    selectedApiKeyId: undefined,
    selectedModelId: undefined,
    setSelectedApiKeyId: jest.fn(),
    setSelectedModelId: jest.fn(),
    startCheck: jest.fn(),
  }),
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
      renderer = create(<ProviderDetailScreen />);
    });
  }

  function rerender() {
    act(() => {
      renderer?.update(<ProviderDetailScreen />);
    });
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
