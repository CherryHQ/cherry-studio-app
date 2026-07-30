import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Provider } from '@/data/types/provider';
import ProviderModelAddScreen from '../ProviderModelAddScreen';

const endpointTypeLabel = 'settings.provider.models.addEndpointTypeLabel';
const modelIdLabel = 'settings.provider.models.addModelIdLabel';

const gatewayProvider = {
  defaultChatEndpoint: 'openai-chat-completions',
  endpointConfigs: {},
  id: 'gateway-1',
  isEnabled: true,
  name: 'Gateway One',
  presetProviderId: 'new-api',
} as unknown as Provider;

const plainProvider = {
  ...gatewayProvider,
  id: 'plain-1',
  presetProviderId: 'openai',
} as Provider;

let mockProviderId: string | undefined;
let mockProvider: Provider | undefined;
let mockProviderQuery: { isError: boolean; isPending: boolean };
let mockRedirectHref: unknown;
let mockHookProviders: (Provider | undefined)[];

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: unknown }) => {
    mockRedirectHref = href;
    return null;
  },
  useLocalSearchParams: () => ({ providerId: mockProviderId }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('@/components/headers', () => ({
  BackHeader: () => null,
}));

jest.mock('heroui-native/input', () => ({
  Input: () => null,
}));

jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

jest.mock('lucide-uniwind/png', () => ({
  ChevronDownIcon: () => null,
  ChevronUpIcon: () => null,
  SaveIcon: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: ({ children }: { children?: ReactNode }) => children ?? null,
}));

jest.mock('../detail', () => ({
  useProviderDetailSettings: () => ({
    provider: mockProvider,
    providerQuery: mockProviderQuery,
  }),
}));

// The hook's own plumbing (toast, query client, data services) is not what this test is
// about, but `showEndpointTypes` is — so the stub keeps the real provider-to-shape
// derivation and records which provider it was handed on every form render.
jest.mock('../models/hooks/useProviderModelAdd', () => {
  const { isNewApiLikeProvider } = jest.requireActual('../models/utils/providerModelAdd');
  return {
    useProviderModelAdd: ({ provider }: { provider: Provider }) => {
      mockHookProviders.push(provider);
      return {
        canSubmit: false,
        formState: {
          contextWindow: '',
          endpointTypes: [],
          group: '',
          maxInputTokens: '',
          maxOutputTokens: '',
          modelId: '',
          name: '',
        },
        isSubmitting: false,
        showEndpointTypes: isNewApiLikeProvider(provider),
        submitAddModel: jest.fn(),
        updateContextWindow: jest.fn(),
        updateEndpointTypes: jest.fn(),
        updateGroup: jest.fn(),
        updateMaxInputTokens: jest.fn(),
        updateMaxOutputTokens: jest.fn(),
        updateModelId: jest.fn(),
        updateName: jest.fn(),
      };
    },
  };
});

describe('ProviderModelAddScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  function render() {
    act(() => {
      renderer = create(<ProviderModelAddScreen />);
    });
  }

  function rerender() {
    act(() => {
      renderer?.update(<ProviderModelAddScreen />);
    });
  }

  function renderedLabels() {
    return collectStrings(renderer?.toJSON());
  }

  beforeEach(() => {
    mockProviderId = 'gateway-1';
    mockProvider = undefined;
    mockProviderQuery = { isError: false, isPending: true };
    mockRedirectHref = undefined;
    mockHookProviders = [];
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('does not mount the form while the provider is still loading', () => {
    render();

    expect(mockHookProviders).toEqual([]);
    expect(renderedLabels()).not.toContain(modelIdLabel);
  });

  // Regression pin: the endpoint-type block sits directly above the "More settings"
  // control, so it has to be there on the pass that first shows the form. It used to
  // appear only after the provider query resolved, one commit later.
  it('renders the endpoint-type block on the form pass for a gateway provider', () => {
    render();

    mockProvider = gatewayProvider;
    mockProviderQuery = { isError: false, isPending: false };
    rerender();

    expect(mockHookProviders).toHaveLength(1);
    expect(renderedLabels()).toContain(endpointTypeLabel);
  });

  it('never hands the form hook a provider that has not loaded', () => {
    render();
    mockProvider = gatewayProvider;
    mockProviderQuery = { isError: false, isPending: false };
    rerender();
    rerender();

    expect(mockHookProviders.length).toBeGreaterThan(0);
    expect(mockHookProviders.every(Boolean)).toBe(true);
  });

  it('takes the same path whether the provider query was cold or already cached', () => {
    render();
    const coldStartFormRenders = mockHookProviders.length;

    mockProvider = gatewayProvider;
    mockProviderQuery = { isError: false, isPending: false };
    rerender();
    const afterLoad = renderedLabels();

    act(() => renderer?.unmount());
    mockHookProviders = [];
    render();

    expect(coldStartFormRenders).toBe(0);
    expect(mockHookProviders).toHaveLength(1);
    expect(renderedLabels()).toEqual(afterLoad);
  });

  it('leaves the endpoint-type block out for providers that do not use it', () => {
    mockProvider = plainProvider;
    mockProviderQuery = { isError: false, isPending: false };
    render();

    expect(renderedLabels()).toContain(modelIdLabel);
    expect(renderedLabels()).not.toContain(endpointTypeLabel);
  });

  it('redirects to the provider list when the route has no provider id', () => {
    mockProviderId = undefined;
    render();

    expect(mockRedirectHref).toBe('/settings/provider');
    expect(mockHookProviders).toEqual([]);
  });

  it('redirects to the provider list when the provider cannot be loaded', () => {
    mockProviderQuery = { isError: true, isPending: false };
    render();

    expect(mockRedirectHref).toBe('/settings/provider');
  });
});

function collectStrings(node: unknown): string[] {
  if (typeof node === 'string') {
    return [node];
  }

  if (Array.isArray(node)) {
    return node.flatMap(collectStrings);
  }

  if (node && typeof node === 'object' && 'children' in node) {
    return collectStrings((node as { children: unknown }).children);
  }

  return [];
}
