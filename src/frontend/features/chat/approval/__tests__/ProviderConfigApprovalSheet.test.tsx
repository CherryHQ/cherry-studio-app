import { ENDPOINT_TYPE } from '@cherrystudio/universal/data/types/model';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { PendingToolApproval } from '../../runtime/chatRuntimeProjection';
import { ProviderConfigApprovalSheet } from '../ProviderConfigApprovalSheet';
import type { ToolApprovalRespondInput } from '../types';

const generatedProviderId = '00000000-0000-4000-8000-000000000123';
const remoteModelId = `${generatedProviderId}::remote-model`;
const mockPreviewCustom = jest.fn();
const mockPreviewBuiltin = jest.fn();
const mockResolveBuiltin = jest.fn();
const mockCherryInOauth = jest.fn((_props: object) => null);
const mockProviderOauthSection = jest.fn((_props: object) => null);
let mockLegendListProps: Record<string, any> = {};

jest.mock('expo-crypto', () => ({ randomUUID: () => generatedProviderId }));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: ({ children }: { children?: ReactNode }) => children ?? null,
  KeyboardAwareScrollView: ({ children }: { children?: ReactNode }) => children ?? null,
}));

jest.mock('@legendapp/list/react-native', () => ({
  LegendList: (props: Record<string, any>) => {
    const React = jest.requireActual('react');
    mockLegendListProps = props;
    return React.createElement(
      React.Fragment,
      null,
      props.ListHeaderComponent,
      ...props.data.map((item: unknown, index: number) =>
        React.createElement(
          React.Fragment,
          { key: props.keyExtractor(item, index) },
          props.renderItem({ extraData: props.extraData, index, item }),
        ),
      ),
      props.ListFooterComponent,
    );
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const native = jest.requireActual('react-native');

  function Button({ children, ...props }: { children?: ReactNode }) {
    return React.createElement(
      native.View,
      { ...props, testID: `button:${String(children)}` },
      children,
    );
  }
  Button.Label = native.Text;

  function BottomSheet({
    children,
    headerRight,
    ...props
  }: {
    children?: ReactNode;
    headerRight?: ReactNode;
  }) {
    return React.createElement(
      native.View,
      { ...props, testID: 'bottom-sheet' },
      headerRight,
      children,
    );
  }
  function PageTransition({ children, ...props }: { children?: ReactNode }) {
    return React.createElement(native.View, { ...props, testID: 'page-transition' }, children);
  }
  BottomSheet.PageTransition = PageTransition;

  function Section({ children, ...props }: { children?: ReactNode }) {
    return React.createElement(native.View, props, children);
  }
  function SectionHeader({ title, ...props }: { title?: ReactNode }) {
    return React.createElement(native.View, props, title);
  }
  function SectionItem({ children, label, ...props }: { children?: ReactNode; label?: ReactNode }) {
    return React.createElement(native.View, props, label, children);
  }
  Section.Header = SectionHeader;
  Section.Item = SectionItem;

  return {
    BottomSheet,
    Button,
    Input: (props: object) => React.createElement(native.View, props),
    Label: native.Text,
    Section,
    Surface: ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement(native.View, props, children),
    TextField: ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement(native.View, props, children),
  };
});

jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({
    previewBuiltin: mockPreviewBuiltin,
    previewCustom: mockPreviewCustom,
    resolveBuiltin: mockResolveBuiltin,
  }),
}));

jest.mock('@/frontend/features/settings/ProviderScreen/components/CustomProviderForm', () => ({
  CustomProviderForm: () => null,
  isCustomProviderFormComplete: (value: { baseUrl?: string; endpointUrls: object; name: string }) =>
    Boolean(value.name.trim()) &&
    Boolean((value.endpointUrls as Record<string, string>)['openai-chat-completions']?.trim()),
}));

jest.mock('@/frontend/features/settings/ProviderScreen/components/CherryInOauth', () => ({
  CherryInOauth: (props: object) => mockCherryInOauth(props),
}));
jest.mock('@/frontend/features/settings/ProviderScreen/components/ProviderOauthSection', () => ({
  ProviderOauthSection: (props: object) => mockProviderOauthSection(props),
}));
jest.mock(
  '@/frontend/features/settings/ProviderScreen/models/components/ProviderModelDraftForm',
  () => {
    const React = jest.requireActual('react');
    const native = jest.requireActual('react-native');
    return {
      ProviderModelDraftForm: (props: object) =>
        React.createElement(native.View, { ...props, testID: 'manual-model-form' }),
    };
  },
);

function customApproval(
  overrides: Partial<PendingToolApproval['input']> = {},
): PendingToolApproval {
  return {
    approvalId: 'approval-1',
    input: {
      anthropicUrl: '',
      apiKey: 'secret-key',
      baseUrl: 'https://api.example.com/v1',
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      geminiUrl: '',
      imageEditUrl: '',
      imageGenerationUrl: '',
      intent: 'configure-and-models',
      manualModels: [],
      name: 'Example AI',
      openaiResponsesUrl: '',
      providerId: 'model-supplied-id',
      removedModelIds: [],
      selectedModelIds: [],
      skipModelPull: false,
      ...overrides,
    },
    messageId: 'assistant-1',
    toolCallId: 'call-1',
    toolName: 'create_custom_provider',
    toolType: 'provider',
  };
}

describe('ProviderConfigApprovalSheet', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLegendListProps = {};
    mockPreviewCustom.mockResolvedValue({
      apiKeyCount: 0,
      apiKeyWillBeAdded: true,
      canEditEndpoint: true,
      catalogSource: 'api',
      defaultSelectedModelIds: [remoteModelId],
      models: {
        added: [
          {
            capabilities: [],
            id: remoteModelId,
            isEnabled: true,
            isHidden: false,
            modelId: 'remote-model',
            name: 'Remote Model',
            providerId: generatedProviderId,
            supportsStreaming: true,
          },
        ],
        missing: [],
      },
      origin: 'https://api.example.com',
      provider: {
        apiFeatures: {},
        apiKeys: [],
        defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
        endpointConfigs: {
          [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
            baseUrl: 'https://api.example.com/v1',
          },
        },
        id: generatedProviderId,
        isEnabled: false,
        name: 'Example AI',
        settings: {},
      },
      remotelyProbed: true,
      status: 'matched',
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function renderSheet(
    onRespond: (response: ToolApprovalRespondInput) => Promise<void> = jest.fn(
      async () => undefined,
    ),
    approval = customApproval(),
    isOpen = true,
  ) {
    act(() => {
      renderer = create(
        <ProviderConfigApprovalSheet
          approval={approval}
          approvalCount={1}
          isOpen={isOpen}
          onRespond={onRespond}
        />,
      );
    });
    return onRespond;
  }

  function action(label: string) {
    return renderer!.root.findByProps({ testID: `button:${label}` });
  }

  test('dismissal denies with an explicit reason', async () => {
    const onRespond = renderSheet();

    await act(async () => {
      renderer!.root.findByProps({ testID: 'bottom-sheet' }).props.onClose('dismiss');
    });

    expect(onRespond).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      approved: false,
      messageId: 'assistant-1',
      reason: 'Provider configuration was cancelled by the user.',
    });
  });

  test('controlled close does not submit a second decision', async () => {
    const onRespond = renderSheet();

    await act(async () => {
      renderer!.root.findByProps({ testID: 'bottom-sheet' }).props.onClose('controlled');
    });

    expect(onRespond).not.toHaveBeenCalled();
  });

  test('uses a full-width pill action without a footer', () => {
    renderSheet();

    expect(action('chat.providerConfig.next').props).toMatchObject({
      className: 'self-stretch rounded-full p-4',
    });
    expect(
      renderer!.root.findByProps({ testID: 'provider-config-floating-action' }).props,
    ).toMatchObject({
      className: 'absolute inset-x-4 bottom-3 z-10 items-center gap-2',
    });
  });

  test('renders setup progress on an adaptive liquid-glass surface', () => {
    renderSheet();

    expect(renderer!.root.findByProps({ testID: 'provider-config-progress' }).props).toMatchObject({
      className: 'bg-secondary',
      cornerRadius: 16,
      style: {
        alignItems: 'center',
        height: 32,
        justifyContent: 'center',
        width: 40,
      },
    });
    expect(
      renderer!.root.findByProps({ testID: 'provider-config-progress-label' }).props,
    ).toMatchObject({
      className: 'text-foreground text-sm',
      style: { fontVariant: ['tabular-nums'] },
    });
  });

  test('saves a generated stable id and default model selection through updatedInput', async () => {
    const onRespond = renderSheet();

    await act(async () => {
      action('chat.providerConfig.next').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockPreviewCustom).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: generatedProviderId }),
      expect.objectContaining({ aborted: false }),
    );

    act(() => action('chat.providerConfig.next').props.onPress());
    await act(async () => {
      action('common.save').props.onPress();
      await Promise.resolve();
    });

    expect(onRespond).toHaveBeenCalledWith({
      approvalId: 'approval-1',
      approved: true,
      messageId: 'assistant-1',
      updatedInput: expect.objectContaining({
        apiKey: 'secret-key',
        providerId: generatedProviderId,
        selectedModelIds: [remoteModelId],
        skipModelPull: false,
      }),
    });
  });

  test('cancels an in-flight preview when the sheet closes', async () => {
    let previewSignal: AbortSignal | undefined;
    mockPreviewCustom.mockImplementationOnce(
      async (_input: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          previewSignal = signal;
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const onRespond = renderSheet();

    act(() => action('chat.providerConfig.next').props.onPress());
    expect(previewSignal?.aborted).toBe(false);
    expect(renderer!.root.findByProps({ testID: 'bottom-sheet' }).props.isCloseDisabled).toBe(
      false,
    );

    await act(async () => {
      renderer!.root.findByProps({ testID: 'bottom-sheet' }).props.onClose('dismiss');
      await Promise.resolve();
    });

    expect(previewSignal?.aborted).toBe(true);
    expect(onRespond).toHaveBeenCalledWith(expect.objectContaining({ approved: false }));
  });

  test('loads the catalog immediately for a models-only request', async () => {
    renderSheet(undefined, customApproval({ intent: 'models' }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPreviewCustom).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'models', providerId: generatedProviderId }),
      expect.objectContaining({ aborted: false }),
    );
    expect(renderer!.root.findByProps({ testID: 'page-transition' }).props.pageKey).toBe('models');
  });

  test('virtualizes model sections with stable keys and recycling', async () => {
    renderSheet();

    await act(async () => {
      action('chat.providerConfig.next').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockLegendListProps.recycleItems).toBe(true);
    expect(mockLegendListProps.drawDistance).toBe(320);
    expect(mockLegendListProps.data).toEqual([
      expect.objectContaining({ key: 'section:added', type: 'section' }),
      expect.objectContaining({
        key: `catalog-model:added:${remoteModelId}`,
        type: 'catalog-model',
      }),
    ]);
    expect(
      mockLegendListProps.data.map((item: unknown, index: number) =>
        mockLegendListProps.keyExtractor(item, index),
      ),
    ).toEqual(['section:added', `catalog-model:added:${remoteModelId}`]);
  });

  test('disables closing while the approved draft is being saved', async () => {
    let resolveResponse: (() => void) | undefined;
    const onRespond = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    renderSheet(onRespond);

    await act(async () => {
      action('chat.providerConfig.next').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => action('chat.providerConfig.next').props.onPress());
    act(() => action('common.save').props.onPress());

    expect(renderer!.root.findByProps({ testID: 'bottom-sheet' }).props.isCloseDisabled).toBe(true);

    await act(async () => {
      resolveResponse?.();
      await Promise.resolve();
    });
    expect(renderer!.root.findByProps({ testID: 'bottom-sheet' }).props.isCloseDisabled).toBe(
      false,
    );
  });

  test('removes a catalog selection when the same model is added manually', async () => {
    const onRespond = renderSheet();

    await act(async () => {
      action('chat.providerConfig.next').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => action('settings.provider.models.addTitle').props.onPress());
    act(() => {
      renderer!.root
        .findByProps({ testID: 'manual-model-form' })
        .props.controller.updateModelId('remote-model');
    });
    act(() => action('settings.provider.models.addSubmit').props.onPress());
    act(() => action('chat.providerConfig.next').props.onPress());
    await act(async () => {
      action('common.save').props.onPress();
      await Promise.resolve();
    });

    expect(onRespond).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedInput: expect.objectContaining({
          manualModels: [expect.objectContaining({ modelId: 'remote-model' })],
          selectedModelIds: [],
        }),
      }),
    );
  });

  test('keeps OAuth sessions active when configuring a built-in provider', async () => {
    const provider = {
      apiFeatures: {},
      apiKeys: [],
      authMethods: ['oauth'],
      authType: 'oauth',
      id: 'cherryin',
      isEnabled: false,
      name: 'CherryIN',
      settings: {},
    };
    mockResolveBuiltin.mockResolvedValueOnce({
      apiKeyCount: 0,
      canEditEndpoint: false,
      origin: '',
      provider,
      status: 'matched',
    });
    mockPreviewBuiltin.mockResolvedValueOnce({
      apiKeyCount: 0,
      apiKeyWillBeAdded: false,
      canEditEndpoint: false,
      catalogSource: 'registry',
      defaultSelectedModelIds: [],
      models: { added: [], missing: [] },
      origin: '',
      provider,
      remotelyProbed: false,
      status: 'matched',
    });
    const approval: PendingToolApproval = {
      ...customApproval(),
      input: {
        apiKey: '',
        baseUrl: '',
        intent: 'configure',
        manualModels: [],
        provider: 'CherryIN',
        removedModelIds: [],
        selectedModelIds: [],
        skipModelPull: false,
      },
      toolName: 'configure_builtin_provider',
    };
    const onRespond = renderSheet(undefined, approval);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      action('chat.providerConfig.next').props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => action('chat.providerConfig.next').props.onPress());
    await act(async () => {
      action('common.save').props.onPress();
      await Promise.resolve();
    });

    expect(mockCherryInOauth).toHaveBeenCalledWith(
      expect.objectContaining({ allowLogout: false, provider }),
    );
    expect(mockProviderOauthSection).not.toHaveBeenCalled();
    expect(onRespond).toHaveBeenCalledWith(
      expect.objectContaining({ updatedInput: expect.objectContaining({ provider: 'cherryin' }) }),
    );
  });
});
