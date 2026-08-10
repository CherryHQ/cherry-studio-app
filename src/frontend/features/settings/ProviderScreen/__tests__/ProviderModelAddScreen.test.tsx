import type { Provider } from '@cherrystudio/universal/data/types/provider';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import ProviderModelAddScreen from '../ProviderModelAddScreen';

const endpointTypeLabel = 'settings.provider.models.addEndpointTypeLabel';
const modelIdLabel = 'settings.provider.models.addModelIdLabel';
const purposeLabel = 'settings.provider.models.addPurposeLabel';

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

const customProvider = {
  ...gatewayProvider,
  id: 'custom-1',
  presetProviderId: undefined,
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

jest.mock('@/frontend/components/headers', () => ({
  BackHeader: () => null,
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { Text, View } = jest.requireActual('react-native');

  return {
    FieldError: (props: Record<string, unknown>) => React.createElement(Text, props),
    Input: () => null,
    Label: (props: Record<string, unknown>) => React.createElement(Text, props),
    TextField: (props: Record<string, unknown>) => React.createElement(View, props),
  };
});

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
// about, but the model-add mode is — so the stub keeps the real provider-to-shape
// derivation and records which provider it was handed on every form render.
jest.mock('../models/hooks/useProviderModelAdd', () => {
  const { getProviderChatEndpointTypes, getProviderModelAddMode, inferProviderModelPurpose } =
    jest.requireActual('../models/utils/providerModelAdd');
  return {
    useProviderModelAdd: ({ provider }: { provider: Provider }) => {
      mockHookProviders.push(provider);
      const chatEndpointTypes = getProviderChatEndpointTypes(provider);
      const endpointTypes = [chatEndpointTypes[0] ?? 'openai-chat-completions'];
      return {
        canSubmit: false,
        chatEndpointTypes,
        formState: {
          contextWindow: '',
          endpointTypes,
          group: '',
          maxInputTokens: '',
          maxOutputTokens: '',
          modelId: '',
          name: '',
        },
        isSubmitting: false,
        modelAddMode: getProviderModelAddMode(provider),
        modelPurpose: inferProviderModelPurpose(endpointTypes),
        submitAddModel: jest.fn(),
        updateChatEndpointType: jest.fn(),
        updateContextWindow: jest.fn(),
        updateEndpointTypes: jest.fn(),
        updateGroup: jest.fn(),
        updateMaxInputTokens: jest.fn(),
        updateMaxOutputTokens: jest.fn(),
        updateModelId: jest.fn(),
        updateModelPurpose: jest.fn(),
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
    expect(renderedLabels()).toContain('endpoint_type.image-edit');
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
    expect(renderedLabels()).not.toContain(purposeLabel);
  });

  it('uses model purpose choices for a custom provider', () => {
    mockProvider = customProvider;
    mockProviderQuery = { isError: false, isPending: false };
    render();

    expect(renderedLabels()).toContain(purposeLabel);
    expect(renderedLabels()).toContain('settings.provider.models.addPurpose.imageGeneration');
    expect(renderedLabels()).toContain('settings.provider.models.addPurpose.imageEdit');
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
