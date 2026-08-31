import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ProviderModelPullLoadResult } from '../models/hooks/useProviderModelPull';
import ProviderModelAddScreen from '../ProviderModelAddScreen';

const MODE_TABS_TEST_ID = 'model-add-mode-tabs';

let mockSearchParams: Record<string, string> = {};
let mockPullResult: ProviderModelPullLoadResult = 'failed';
const mockLoadPullPreview = jest.fn(async () => mockPullResult);

jest.mock('expo-router', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    Redirect: () => <MockView testID="redirect" />,
    useLocalSearchParams: () => mockSearchParams,
    useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const {
    Text: MockText,
    TextInput: MockTextInput,
    View: MockView,
  } = jest.requireActual('react-native');

  return {
    ContentState: {
      Empty: ({ title }: { title: ReactNode }) => <MockText testID="empty">{title}</MockText>,
      Error: ({
        primaryAction,
        title,
      }: {
        primaryAction?: { onPress?: () => void };
        title: ReactNode;
      }) => (
        <MockText onPress={primaryAction?.onPress} testID="error">
          {title}
        </MockText>
      ),
      Loading: ({ title }: { title: ReactNode }) => <MockText testID="loading">{title}</MockText>,
    },
    FieldError: ({ children }: { children?: ReactNode }) => <MockText>{children}</MockText>,
    Input: (props: Record<string, unknown>) => <MockTextInput {...props} />,
    Label: ({ children }: { children?: ReactNode }) => <MockText>{children}</MockText>,
    Tabs: ({ value }: { value: string }) => (
      <MockView accessibilityValue={{ text: value }} testID="model-add-mode-tabs" />
    ),
    TextField: ({ children }: { children?: ReactNode }) => <MockView>{children}</MockView>,
    useAlert: () => ({ alert: { confirm: jest.fn(), show: jest.fn() } }),
  };
});

jest.mock('@cherrystudio/ui/utils', () => ({ cn: (...names: unknown[]) => names.join(' ') }));

jest.mock('@cherrystudio/app-icons/icons/chevron-down', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { __esModule: true, default: () => <MockView /> };
});

jest.mock('@cherrystudio/app-icons/icons/chevron-up', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { __esModule: true, default: () => <MockView /> };
});

jest.mock('react-native-keyboard-controller', () => {
  const { ScrollView: MockScrollView } = jest.requireActual('react-native');
  return { KeyboardAwareScrollView: MockScrollView };
});

jest.mock('@/frontend/components/headers', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { RouteHeader: () => <MockView testID="route-header" /> };
});

jest.mock('../apiService', () => ({
  useProviderApiServiceSheetClose: () => ({
    allowNavigation: jest.fn(),
    closeWithoutPrompt: jest.fn(),
    requestClose: jest.fn(),
  }),
}));

jest.mock('../detail', () => ({
  useProviderDetailSettings: () => ({
    provider: { authType: 'api-key', id: 'custom', isEnabled: true, name: 'Custom', settings: {} },
    providerQuery: { isError: false },
  }),
}));

jest.mock('../models/hooks/useProviderModelAdd', () => ({
  useProviderModelAdd: () => ({
    canSubmit: false,
    chatEndpointTypes: [],
    formState: {
      contextWindow: '',
      endpointTypes: [],
      group: '',
      maxInputTokens: '',
      maxOutputTokens: '',
      modelId: '',
      name: '',
    },
    isDirty: false,
    isSubmitting: false,
    modelAddMode: 'purpose',
    modelPurpose: 'chat',
    resetForm: jest.fn(),
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
  }),
}));

jest.mock('../models/hooks/useProviderModelPull', () => ({
  useProviderModelPull: () => ({
    applyModelChange: jest.fn(),
    isPreviewLoading: false,
    loadPullPreview: mockLoadPullPreview,
    preview: null,
  }),
}));

jest.mock('../models/hooks/useProviderModelPullSelection', () => ({
  useProviderModelPullSelection: () => ({
    applySelection: jest.fn(),
    isApplying: false,
    selectedIds: new Set(),
    toggleAll: jest.fn(),
    toggleModel: jest.fn(),
  }),
}));

jest.mock('../ProviderModelPullScreen', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { ProviderModelPullPreviewContent: () => <MockView testID="pull-preview" /> };
});

/**
 * Setup drops the user straight into a sync so first-time configuration is one
 * pass. A self-hosted endpoint that answers chat but not `/models` turns that
 * into a dead end: the provider is already created, and without the mode switch
 * there is no way to name a model by hand and finish.
 */
describe('provider setup flow when the sync has nothing to offer', () => {
  let renderer: ReactTestRenderer | undefined;

  async function mountSetupFlow() {
    await act(async () => {
      renderer = create(<ProviderModelAddScreen />);
    });
  }

  function modeTabs() {
    return renderer?.root.findAllByProps({ testID: MODE_TABS_TEST_ID }) ?? [];
  }

  beforeEach(() => {
    mockSearchParams = { mode: 'sync', providerId: 'custom', setupFlow: 'true' };
    mockPullResult = 'failed';
    mockLoadPullPreview.mockReset();
    mockLoadPullPreview.mockImplementation(async () => mockPullResult);
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('offers the mode switch once the pull fails', async () => {
    await mountSetupFlow();

    expect(renderer?.root.findByProps({ testID: 'error' })).toBeDefined();
    expect(modeTabs()).not.toHaveLength(0);
  });

  it('offers the mode switch when the provider serves no models at all', async () => {
    mockPullResult = 'empty';
    await mountSetupFlow();

    expect(modeTabs()).not.toHaveLength(0);
  });

  // The switch is hidden while the sync can still succeed, so a normal setup
  // stays on one track.
  it('keeps the switch hidden while the pull is still in flight', async () => {
    let settle: (result: ProviderModelPullLoadResult) => void = () => undefined;
    mockLoadPullPreview.mockImplementationOnce(
      () =>
        new Promise<ProviderModelPullLoadResult>((resolve) => {
          settle = resolve;
        }),
    );

    await mountSetupFlow();
    expect(modeTabs()).toHaveLength(0);

    await act(async () => settle('failed'));
    expect(modeTabs()).not.toHaveLength(0);
  });

  // A retry clears the previous outcome. Deriving the switch from that outcome
  // would pull it back off screen under the finger reaching for it.
  it('keeps the switch through a retry that is still in flight', async () => {
    await mountSetupFlow();
    expect(modeTabs()).not.toHaveLength(0);

    let settleRetry: () => void = () => undefined;
    mockLoadPullPreview.mockImplementationOnce(
      () =>
        new Promise<ProviderModelPullLoadResult>((resolve) => {
          settleRetry = () => resolve('failed');
        }),
    );

    await act(async () => {
      renderer?.root.findByProps({ testID: 'error' }).props.onPress();
    });
    expect(mockLoadPullPreview).toHaveBeenCalledTimes(2);
    expect(modeTabs()).not.toHaveLength(0);

    await act(async () => settleRetry());
    expect(modeTabs()).not.toHaveLength(0);
  });
});
