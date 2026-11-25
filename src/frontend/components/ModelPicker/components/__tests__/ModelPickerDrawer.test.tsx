import type { BottomSheetSize } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PolicyScope } from '@/frontend/components/Policy';
import { CLOUD_PROVIDER_ID, CLOUD_PROVIDER_NAME, type CloudState } from '@/shared/contracts/cloud';
import { agentPolicy } from '@/shared/data/managedPolicy';

import type { ModelPickerGroup } from '../../utils/modelPickerData';
import type { ModelPickerListItem } from '../../utils/modelPickerListItems';
import { ModelPickerDrawer } from '../ModelPickerDrawer';

let mockEnabledProviders = [{ id: CLOUD_PROVIDER_ID }];
let mockGroups: ModelPickerGroup[] = [];
const signedOutCloud: CloudState = {
  account: null,
  isRefreshing: false,
  models: [],
  phase: 'signed_out',
  plans: null,
};
let mockCloudState = signedOutCloud;
let mockListProps:
  | {
      bottomInset?: number;
      emptyText?: string;
      emptyAction?: { label: string; onPress: () => void };
      cherryAiEntry?: ReactNode;
      listItems: readonly ModelPickerListItem[];
      maxSelectedCount?: number;
      selectedModelIds?: readonly string[];
    }
  | undefined;
let mockSheetProps:
  | {
      bodyInset?: string;
      onClosed?: () => void;
      onSizeChange?: (size: BottomSheetSize) => void;
      open: boolean;
      presentation?: string;
      size: string;
      sizes?: readonly string[];
    }
  | undefined;
let mockOnSizeChange: ((size: BottomSheetSize) => void) | undefined;
let mockFilterItems: { id: string; onPress: () => void }[] = [];
const chosenModelId = 'provider::chosen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useGlobalSearchParams: () => ({}),
}));

jest.mock('@/frontend/components/ModelRegistry', () => ({
  ModelRegistryGate: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('@cherrystudio/ui/components', () => {
  const {
    Text: MockText,
    TextInput: MockTextInput,
    View: MockView,
  } = jest.requireActual('react-native');
  const { createElement } = jest.requireActual('react');
  const Button = (props: object) => createElement('Button', props);
  Button.Label = function ButtonLabel({ children }: { children: ReactNode }) {
    return <MockText>{children}</MockText>;
  };

  return {
    BottomSheet: ({
      bodyInset,
      children,
      footer,
      headerAction,
      onClosed,
      onSizeChange,
      open,
      presentation,
      size,
      sizes,
      testID,
      title,
    }: {
      bodyInset?: string;
      children: ReactNode;
      footer?: ReactNode;
      headerAction?: ReactNode;
      onClosed?: () => void;
      onSizeChange?: (size: BottomSheetSize) => void;
      open: boolean;
      presentation?: string;
      size: string;
      sizes?: readonly string[];
      testID: string;
      title: string;
    }) => {
      // Like the real portal, the sheet's content sits outside the screen's PolicyScope.
      const { PolicyScope: MockPolicyScope } = jest.requireActual(
        '@/frontend/components/Policy/PolicyScope',
      );
      const { OPEN_POLICY } = jest.requireActual('@/shared/data/managedPolicy');
      mockOnSizeChange = onSizeChange;
      mockSheetProps = { bodyInset, onClosed, onSizeChange, open, presentation, size, sizes };
      return (
        <MockView
          accessibilityLabel={title}
          accessibilityValue={{ text: size }}
          testID={`${testID}-surface`}
        >
          {headerAction}
          <MockPolicyScope policy={OPEN_POLICY}>{children}</MockPolicyScope>
          {footer}
        </MockView>
      );
    },
    Button,
    SearchField: (props: Record<string, unknown>) => (
      <MockTextInput onBlur={jest.fn()} {...props} testID={`${props.testID}-input`} />
    ),
    ActionMenu: ({ children, items }: { children: ReactNode; items: typeof mockFilterItems }) => {
      mockFilterItems = items;
      return <MockView>{children}</MockView>;
    },
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/appShell/cloud', () => ({
  ...jest.requireActual('@/frontend/appShell/cloud'),
  useCloudModelBrowser: (_enabled: boolean, use: 'agent' | 'general') => ({
    state: mockCloudState,
    accountState: { isRestoringSession: false },
    offers: jest
      .requireActual('@/frontend/appShell/cloud/cloudModelOffers')
      .getCloudModelOffers(mockCloudState, use),
    press: jest.fn(),
    refresh: jest.fn(),
  }),
  useReturnedCloudModel: () => {},
}));

jest.mock('../../hooks/useModelPickerData', () => ({
  useModelPickerData: () => ({
    cloudState: mockCloudState,
    groups: mockGroups,
    providers: mockEnabledProviders,
    hasLoadedCatalog: true,
    isLoading: false,
  }),
}));

jest.mock('../ModelPickerList', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ModelPickerList: (props: NonNullable<typeof mockListProps>) => {
      mockListProps = props;
      return <MockView />;
    },
  };
});

jest.mock('../ModelPickerCherryAiEntry', () => ({ ModelPickerCherryAiEntry: () => null }));

describe('ModelPickerDrawer', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    mockCloudState = signedOutCloud;
    mockGroups = [];
    mockEnabledProviders = [{ id: CLOUD_PROVIDER_ID }];
    mockListProps = undefined;
    mockSheetProps = undefined;
    mockOnSizeChange = undefined;
    mockFilterItems = [];
    act(() => {
      renderer = create(
        <ModelPickerDrawer
          modelType="text"
          onClose={jest.fn()}
          onSelect={jest.fn()}
          open
          selectedModelId={null}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => renderer.unmount());
  });

  test('shows the empty CherryAI group only while the provider is enabled', () => {
    expect(mockListProps?.listItems).toEqual([]);

    const renderChat = () =>
      act(() => {
        renderer.update(
          <ModelPickerDrawer
            modelType="text"
            onClose={jest.fn()}
            onSelect={jest.fn()}
            open
            selectedModelId={null}
            variant="chat"
          />,
        );
      });

    renderChat();
    expect(mockListProps?.listItems).toEqual([
      expect.objectContaining({
        provider: expect.objectContaining({ id: CLOUD_PROVIDER_ID }),
        title: CLOUD_PROVIDER_NAME,
        type: 'groupHeader',
      }),
    ]);
    mockEnabledProviders = [];
    renderChat();
    expect(mockListProps?.listItems).toEqual([]);
    expect(mockListProps?.cherryAiEntry).toBeUndefined();
  });

  test('finds the locked AMD row by name and by the free badge without a local projection', () => {
    mockCloudState = {
      ...signedOutCloud,
      account: {
        account: { id: 'account', status: 'active' },
        device: { id: 'device' },
        entitlements: [],
        measured_at: '2026-01-01T00:00:00Z',
        quota_pools: [],
      },
      models: [
        {
          requires_login: true,
          requires_plan: false,
          standalone: false,
          is_free: true,
          activation_endpoint: '/api/v1/amd/desktop/entry',
          activation_required: true,
          available_features: ['agent'],
          capabilities: [],
          context_window: 4096,
          display_name: 'GPT-OSS',
          endpoint_type: 'openai-chat-completions',
          id: 'amd/gpt-oss',
          max_output_tokens: 1024,
          provider: 'amd',
        },
      ],
      phase: 'ready',
    };
    const render = (variant: 'chat' | 'usage') =>
      act(() => {
        renderer.update(
          <ModelPickerDrawer
            modelType="text"
            onClose={jest.fn()}
            onSelect={jest.fn()}
            open
            selectedModelId={null}
            variant={variant}
          />,
        );
      });

    render('chat');
    act(() => {
      renderer.root
        .findByProps({ testID: 'model-picker-search-input' })
        .props.onChangeText('gpt-oss');
      mockFilterItems.find((item) => item.id === 'free')?.onPress();
    });

    expect(mockListProps?.cherryAiEntry).toBeUndefined();
    expect(mockListProps?.listItems).toMatchObject([
      { type: 'groupHeader', title: CLOUD_PROVIDER_NAME },
      {
        type: 'model',
        item: {
          model: { name: 'GPT-OSS' },
          isCloudFree: true,
          offer: { reason: 'activation_required' },
        },
      },
    ]);

    render('usage');
    expect(mockListProps?.listItems).toEqual([]);
    mockEnabledProviders = [];
    render('chat');
    expect(mockListProps?.listItems).toEqual([]);
  });

  test('retains full height after blur and clearing, and preserves search on manual collapse', () => {
    const sheet = () => renderer.root.findByProps({ testID: 'model-picker-surface' });
    const search = () => renderer.root.findByProps({ testID: 'model-picker-search-input' });

    expect(sheet().props.accessibilityValue).toEqual({ text: 'medium' });
    expect(mockSheetProps?.sizes).toEqual(['medium', 'full']);
    expect(mockSheetProps?.bodyInset).toBe('none');
    expect(mockSheetProps?.presentation).toBe('default');
    expect(mockListProps?.bottomInset).toBe(34);

    act(() => search().props.onFocus());
    expect(sheet().props.accessibilityValue).toEqual({ text: 'full' });

    act(() => search().props.onChangeText('qwen'));
    act(() => search().props.onBlur());
    expect(sheet().props.accessibilityValue).toEqual({ text: 'full' });

    act(() => search().props.onClear());
    expect(sheet().props.accessibilityValue).toEqual({ text: 'full' });

    act(() => search().props.onChangeText('qwen'));
    act(() => mockOnSizeChange?.('medium'));
    expect(sheet().props.accessibilityValue).toEqual({ text: 'medium' });
    expect(search().props.value).toBe('qwen');
  });

  test('stays mounted through controlled close settlement, resets state, and unmounts', () => {
    const surfaceNodes = () =>
      renderer.root.findAll(
        (node) => typeof node.type === 'string' && node.props.testID === 'model-picker-surface',
      );
    const search = () => renderer.root.findByProps({ testID: 'model-picker-search-input' });

    act(() => {
      renderer.update(
        <ModelPickerDrawer
          modelType="text"
          onClose={jest.fn()}
          onSelect={jest.fn()}
          open
          selectedModelId={null}
          variant="chat"
        />,
      );
    });
    act(() => search().props.onFocus());
    act(() => search().props.onChangeText('qwen'));
    act(() => mockFilterItems.find((item) => item.id === 'vision')?.onPress());
    expect(mockSheetProps?.size).toBe('full');

    act(() => {
      renderer.update(
        <ModelPickerDrawer
          modelType="text"
          onClose={jest.fn()}
          onSelect={jest.fn()}
          open={false}
          selectedModelId={null}
          variant="chat"
        />,
      );
    });
    expect(surfaceNodes()).toHaveLength(1);
    expect(mockSheetProps?.open).toBe(false);

    act(() => mockSheetProps?.onClosed?.());
    expect(surfaceNodes()).toHaveLength(0);

    act(() => {
      renderer.update(
        <ModelPickerDrawer
          modelType="text"
          onClose={jest.fn()}
          onSelect={jest.fn()}
          open
          selectedModelId={null}
          variant="chat"
        />,
      );
    });
    expect(surfaceNodes()).toHaveLength(1);
    expect(mockSheetProps?.size).toBe('medium');
    expect(search().props.value).toBe('');
    expect(
      renderer.root.findByProps({ testID: 'model-picker-filter' }).props.accessibilityState,
    ).toEqual({ selected: false });
  });

  test('distinguishes filtered emptiness and clears both the query and capability condition', () => {
    mockGroups = [
      {
        items: [
          {
            key: 'text-model',
            modelId: 'provider::text-model',
            model: {
              capabilities: [],
              modelId: 'text-model',
              name: 'Text model',
              providerId: 'provider',
            },
          } as never,
        ],
        key: 'provider',
        provider: {} as never,
        title: 'Provider',
      },
    ];
    act(() => {
      renderer.update(
        <ModelPickerDrawer
          modelType="text"
          onClose={jest.fn()}
          onSelect={jest.fn()}
          open
          selectedModelId={null}
          variant="chat"
        />,
      );
    });
    const search = () => renderer.root.findByProps({ testID: 'model-picker-search-input' });
    act(() => search().props.onChangeText('missing'));
    act(() => mockFilterItems.find((item) => item.id === 'vision')?.onPress());

    expect(mockListProps?.listItems).toHaveLength(0);
    expect(mockListProps?.emptyText).toBe('settings.provider.models.search.empty');
    expect(mockListProps?.emptyAction?.label).toBe('modelPicker.clearConditions');

    act(() => mockListProps?.emptyAction?.onPress());

    expect(search().props.value).toBe('');
    expect(mockListProps?.listItems.filter((item) => item.type === 'model')).toHaveLength(1);
    expect(
      renderer.root.findByProps({ testID: 'model-picker-filter' }).props.accessibilityState,
    ).toEqual({ selected: false });
  });

  test('keeps only caller-compatible models and uses the caller empty copy', () => {
    act(() => renderer.unmount());
    mockGroups = [
      {
        items: [
          { key: 'compatible', modelId: 'provider::compatible' } as never,
          { key: 'incompatible', modelId: 'provider::incompatible' } as never,
        ],
        key: 'provider',
        provider: {} as never,
        title: 'Provider',
      },
    ];

    act(() => {
      renderer = create(
        <ModelPickerDrawer
          emptyText="No compatible models"
          isModelVisible={(item) => item.modelId === 'provider::compatible'}
          modelType="image"
          onClose={jest.fn()}
          onSelect={jest.fn()}
          open
          selectedModelId={null}
        />,
      );
    });

    expect(
      mockListProps?.listItems
        .filter((item) => item.type === 'model')
        .map((item) => item.item.modelId),
    ).toEqual(['provider::compatible']);
    expect(mockListProps?.emptyText).toBe('No compatible models');
  });

  test('offers only the models of an enclosing scope', () => {
    act(() => renderer.unmount());
    mockGroups = [
      {
        items: [
          { key: 'pooled', modelId: 'provider::pooled' } as never,
          { key: 'other', modelId: 'provider::other' } as never,
        ],
        key: 'provider',
        provider: {} as never,
        title: 'Provider',
      },
    ];

    act(() => {
      renderer = create(
        <PolicyScope
          policy={agentPolicy({
            isManaged: true,
            allowedModelIds: ['provider::pooled', 'provider::elsewhere'],
          })}
        >
          <ModelPickerDrawer
            modelType="text"
            onClose={jest.fn()}
            onSelect={jest.fn()}
            open
            selectedModelId={null}
          />
        </PolicyScope>,
      );
    });

    expect(
      mockListProps?.listItems
        .filter((item) => item.type === 'model')
        .map((item) => item.item.modelId),
    ).toEqual(['provider::pooled']);
  });

  test('offers a multi-select mode entered and left from the header', () => {
    const multiSelect = {
      enabled: false,
      maxCount: 8,
      onEnabledChange: jest.fn(),
      selectedModelIds: [chosenModelId],
    };
    const render = (enabled: boolean) =>
      act(() => {
        renderer.update(
          <ModelPickerDrawer
            modelType="text"
            multiSelect={{ ...multiSelect, enabled }}
            onClose={jest.fn()}
            onSelect={jest.fn()}
            open
            selectedModelId={null}
          />,
        );
      });
    const sheet = () => renderer.root.findByProps({ testID: 'model-picker-surface' });
    const toggle = () => renderer.root.findByProps({ testID: 'model-picker-multi-select' });

    render(false);
    expect(sheet().props.accessibilityLabel).toBe('modelPicker.title');
    expect(mockListProps?.selectedModelIds).toBeUndefined();
    act(() => toggle().props.onPress());
    expect(multiSelect.onEnabledChange).toHaveBeenLastCalledWith(true);

    render(true);
    expect(sheet().props.accessibilityLabel).toBe('modelPicker.multiSelect.title');
    expect(mockListProps).toMatchObject({ maxSelectedCount: 8, selectedModelIds: [chosenModelId] });
    act(() => toggle().props.onPress());
    expect(multiSelect.onEnabledChange).toHaveBeenLastCalledWith(false);
  });
});
