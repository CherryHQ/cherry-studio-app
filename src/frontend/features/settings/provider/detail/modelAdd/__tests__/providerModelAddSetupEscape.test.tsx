import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ProviderModelPullLoadResult } from '../../../models/hooks/useProviderModelPull';
import ProviderModelAddScreen from '../ProviderModelAddScreen';

let mockSearchParams: Record<string, string> = {};
let mockPullResult: ProviderModelPullLoadResult = 'failed';
let mockHasConfiguredModels = false;
let mockProvider: {
  authType: 'api-key';
  id: string;
  isEnabled: boolean;
  name: string;
  presetProviderId?: string;
  settings: Record<string, never>;
} = {
  authType: 'api-key',
  id: 'preset',
  isEnabled: true,
  name: 'Preset',
  presetProviderId: 'openai',
  settings: {},
};
const mockLoadPullPreview = jest.fn(async () => mockPullResult);
const mockDismissTo = jest.fn();

jest.mock('expo-router', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    Redirect: () => <MockView testID="redirect" />,
    useLocalSearchParams: () => mockSearchParams,
    useRouter: () => ({ dismissTo: mockDismissTo, push: jest.fn(), replace: jest.fn() }),
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

  function TextField({ children }: { children?: ReactNode }) {
    return <MockView>{children}</MockView>;
  }

  function TextFieldError({ children }: { children?: ReactNode }) {
    return <MockText>{children}</MockText>;
  }

  function TextFieldDescription({ children }: { children?: ReactNode }) {
    return <MockText>{children}</MockText>;
  }

  function TextFieldLabel({ children }: { children?: ReactNode }) {
    return <MockText>{children}</MockText>;
  }

  function ChipSelectable({
    accessibilityLabel,
    children,
  }: {
    accessibilityLabel?: string;
    children?: ReactNode;
  }) {
    return <MockText accessibilityLabel={accessibilityLabel}>{children}</MockText>;
  }

  function Button({ children }: { children?: ReactNode }) {
    return <MockView>{children}</MockView>;
  }

  function ButtonLabel({ children }: { children?: ReactNode }) {
    return <MockText>{children}</MockText>;
  }

  Button.Label = ButtonLabel;
  TextField.Description = TextFieldDescription;
  TextField.Error = TextFieldError;
  TextField.Label = TextFieldLabel;

  return {
    Button,
    Chip: { Selectable: ChipSelectable },
    ContentState: {
      Empty: ({
        primaryAction,
        secondaryAction,
        title,
      }: {
        primaryAction?: { onPress?: () => void };
        secondaryAction?: { onPress?: () => void };
        title: ReactNode;
      }) => (
        <MockView testID="empty">
          <MockText onPress={primaryAction?.onPress} testID="empty-primary">
            {title}
          </MockText>
          <MockText onPress={secondaryAction?.onPress} testID="empty-secondary" />
        </MockView>
      ),
      Error: ({
        primaryAction,
        secondaryAction,
        title,
      }: {
        primaryAction?: { onPress?: () => void };
        secondaryAction?: { onPress?: () => void };
        title: ReactNode;
      }) => (
        <MockView testID="error">
          <MockText onPress={primaryAction?.onPress} testID="error-primary">
            {title}
          </MockText>
          <MockText onPress={secondaryAction?.onPress} testID="error-secondary" />
        </MockView>
      ),
      Loading: ({ title }: { title: ReactNode }) => <MockText testID="loading">{title}</MockText>,
    },
    Input: (props: Record<string, unknown>) => <MockTextInput {...props} />,
    TextField,
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

jest.mock('@/frontend/appShell/header', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { RouteHeader: () => <MockView testID="route-header" /> };
});

jest.mock('../../../apiService', () => ({
  useProviderApiServiceSheetClose: () => ({
    allowNavigation: jest.fn(),
    closeWithoutPrompt: jest.fn(),
    requestClose: jest.fn(),
  }),
}));

jest.mock('../../hooks/useProviderDetailSettings', () => ({
  useProviderDetailSettings: () => ({
    models: mockHasConfiguredModels ? [{}] : [],
    modelsQuery: { isPending: false },
    provider: mockProvider,
    providerQuery: { isError: false },
  }),
}));

jest.mock('../../../models/hooks/useProviderModelAdd', () => ({
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

jest.mock('../../../models/hooks/useProviderModelPull', () => ({
  useProviderModelPull: () => ({
    applyModelChange: jest.fn(),
    isPreviewLoading: false,
    loadPullPreview: mockLoadPullPreview,
    preview: null,
  }),
}));

jest.mock('../../../models/hooks/useProviderModelPullSelection', () => ({
  useProviderModelPullSelection: () => ({
    applySelection: jest.fn(),
    isApplying: false,
    selectedIds: new Set(),
    toggleAll: jest.fn(),
    toggleModel: jest.fn(),
  }),
}));

jest.mock('../../modelPull/ProviderModelPullScreen', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return { ProviderModelPullPreviewContent: () => <MockView testID="pull-preview" /> };
});

/**
 * Provider setup drops the user straight into sync so first-time configuration
 * is one pass. Manual creation is a separate route rather than a mode the sync
 * screen reveals.
 */
describe('provider setup flow when the sync has nothing to offer', () => {
  let renderer: ReactTestRenderer | undefined;

  async function mountSetupFlow() {
    await act(async () => {
      renderer = create(<ProviderModelAddScreen />);
    });
  }

  function manualModelFields() {
    return (
      renderer?.root.findAllByProps({
        accessibilityLabel: 'settings.provider.models.addModelIdLabel',
      }) ?? []
    );
  }

  beforeEach(() => {
    mockProvider = {
      authType: 'api-key',
      id: 'preset',
      isEnabled: true,
      name: 'Preset',
      presetProviderId: 'openai',
      settings: {},
    };
    mockSearchParams = { mode: 'sync', providerId: 'preset', returnTo: '/agents/new' };
    mockPullResult = 'failed';
    mockHasConfiguredModels = false;
    mockDismissTo.mockReset();
    mockLoadPullPreview.mockReset();
    mockLoadPullPreview.mockImplementation(async () => mockPullResult);
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps a failed sync on the sync screen', async () => {
    await mountSetupFlow();

    expect(renderer?.root.findByProps({ testID: 'error' })).toBeDefined();
    expect(manualModelFields()).toHaveLength(0);
    expect(renderer?.root.findByProps({ testID: 'error-secondary' }).props.onPress).toBeUndefined();
  });

  it('keeps an empty sync result on the sync screen', async () => {
    mockPullResult = 'empty';
    await mountSetupFlow();

    expect(renderer?.root.findByProps({ testID: 'empty' })).toBeDefined();
    expect(manualModelFields()).toHaveLength(0);
    expect(renderer?.root.findByProps({ testID: 'empty-secondary' }).props.onPress).toBeUndefined();
  });

  it('returns to the requesting surface when setup finishes', async () => {
    mockPullResult = 'empty';
    mockHasConfiguredModels = true;
    await mountSetupFlow();

    act(() => renderer?.root.findByProps({ testID: 'empty-primary' }).props.onPress());

    expect(mockDismissTo).toHaveBeenCalledWith('/agents/new');
  });

  it('keeps manual creation out of the primary flow while the pull is in flight', async () => {
    let settle: (result: ProviderModelPullLoadResult) => void = () => undefined;
    mockLoadPullPreview.mockImplementationOnce(
      () =>
        new Promise<ProviderModelPullLoadResult>((resolve) => {
          settle = resolve;
        }),
    );

    await mountSetupFlow();
    expect(renderer?.root.findByProps({ testID: 'loading' })).toBeDefined();
    expect(manualModelFields()).toHaveLength(0);

    await act(async () => settle('failed'));
    expect(renderer?.root.findByProps({ testID: 'error' })).toBeDefined();
  });

  it('retries the pull from the inline error state', async () => {
    await mountSetupFlow();

    let settleRetry: () => void = () => undefined;
    mockLoadPullPreview.mockImplementationOnce(
      () =>
        new Promise<ProviderModelPullLoadResult>((resolve) => {
          settleRetry = () => resolve('failed');
        }),
    );

    await act(async () => {
      renderer?.root.findByProps({ testID: 'error-primary' }).props.onPress();
    });
    expect(mockLoadPullPreview).toHaveBeenCalledTimes(2);
    expect(renderer?.root.findByProps({ testID: 'loading' })).toBeDefined();

    await act(async () => settleRetry());
    expect(renderer?.root.findByProps({ testID: 'error' })).toBeDefined();
  });

  it('starts custom providers in sync mode when requested', async () => {
    mockProvider = {
      authType: 'api-key',
      id: 'custom',
      isEnabled: true,
      name: 'Custom',
      presetProviderId: undefined,
      settings: {},
    };
    mockSearchParams = { mode: 'sync', providerId: 'custom', returnTo: '/agents/new' };
    mockPullResult = 'ready';

    await mountSetupFlow();

    expect(mockLoadPullPreview).toHaveBeenCalledTimes(1);
    expect(manualModelFields()).toHaveLength(0);
  });
});
