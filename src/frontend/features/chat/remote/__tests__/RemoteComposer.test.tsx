import type { ReactNode } from 'react';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentRef, AgentSummary } from '@/frontend/appShell/conversation';
import type {
  DraftId,
  HistoryVersion,
  RemoteConversationSnapshot,
} from '@/frontend/appShell/conversation/remote';
import { ComposerTestProvider } from '@/frontend/components/Composer/components/__tests__/_composerTestProvider';

import { RemoteComposer } from '../RemoteComposer';

const mockSend = jest.fn();
const mockStart = jest.fn();
const mockToastShow = jest.fn();
let mockComposerOnSend: (() => Promise<void> | void) | undefined;

jest.mock('react-native-reanimated', () => {
  const shared = jest.requireActual(
    '@/frontend/components/Composer/components/__tests__/_sharedValueMock',
  );
  const { View, Text } = require('react-native');
  const Animated = {
    View,
    Text,
  };
  return {
    __esModule: true,
    ...shared,
    default: Animated,
    Easing: {
      linear: (t: number) => t,
      bezier: () => (t: number) => t,
    },
    LayoutAnimationConfig: ({ children }: { children?: ReactNode }) => children,
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    interpolate: (_val: number, _in: number[], out: number[]) => out[0] ?? 0,
    Extrapolation: { CLAMP: 'clamp' },
    withTiming: (val: any) => val,
    withDelay: (_d: number, val: any) => val,
    runOnJS: (fn: any) => fn,
  };
});

jest.mock('@cherrystudio/ui/components', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');

  function MockPill(props: {
    children?: ReactNode;
    onPress?: () => void;
    testID?: string;
    accessibilityLabel?: string;
    disabled?: boolean;
  }) {
    return React.createElement(
      Pressable,
      {
        testID: props.testID,
        accessibilityLabel: props.accessibilityLabel,
        disabled: props.disabled,
        onPress: props.disabled ? undefined : props.onPress,
      },
      props.children,
    );
  }

  function MockSend(props: { testID?: string; onPress?: () => void; disabled?: boolean }) {
    return React.createElement(Pressable, {
      testID: props.testID ?? 'chat-composer-send',
      disabled: props.disabled,
      onPress: () => mockComposerOnSend?.(),
    });
  }

  function MockAction(props: {
    children?: ReactNode;
    onPress?: () => void;
    testID?: string;
    accessibilityLabel?: string;
  }) {
    return React.createElement(
      Pressable,
      {
        testID: props.testID,
        accessibilityLabel: props.accessibilityLabel,
        onPress: props.onPress,
      },
      props.children,
    );
  }

  function MockBottomSheet({
    children,
    footer,
    open,
    title,
  }: {
    children?: ReactNode;
    footer?: ReactNode;
    open?: boolean;
    title?: string;
  }) {
    if (!open) return null;
    return React.createElement(
      View,
      { testID: 'mock-bottom-sheet' },
      React.createElement(Text, null, title),
      children,
      footer,
    );
  }

  function MockButton(props: { children?: ReactNode; onPress?: () => void; disabled?: boolean }) {
    return React.createElement(
      Pressable,
      {
        disabled: props.disabled,
        onPress: props.disabled ? undefined : props.onPress,
      },
      props.children,
    );
  }

  function MockSection({ children }: { children?: ReactNode }) {
    return React.createElement(View, null, children);
  }

  MockSection.RadioItem = function MockRadioItem(props: {
    label: string;
    selected?: boolean;
    disabled?: boolean;
    onPress?: () => void;
  }) {
    return React.createElement(
      Pressable,
      {
        accessibilityLabel: props.label,
        disabled: props.disabled,
        onPress: props.disabled ? undefined : props.onPress,
      },
      React.createElement(Text, null, props.label),
    );
  };

  MockSection.Item = function MockItem(props: {
    label: string;
    disabled?: boolean;
    onPress?: () => void;
  }) {
    return React.createElement(
      Pressable,
      {
        accessibilityLabel: props.label,
        disabled: props.disabled,
        onPress: props.disabled ? undefined : props.onPress,
      },
      React.createElement(Text, null, props.label),
    );
  };

  function MockComposerRoot({
    children,
    onSend,
  }: {
    children?: ReactNode;
    onSend?: () => Promise<void> | void;
  }) {
    mockComposerOnSend = onSend;
    return React.createElement(View, { testID: 'mock-composer' }, children);
  }

  const MockComposer = Object.assign(MockComposerRoot, {
    Pill: MockPill,
    Send: MockSend,
    Action: MockAction,
    Editor: ({ children }: { children?: ReactNode }) => React.createElement(View, null, children),
    EditorAccessories: ({ children }: { children?: ReactNode }) =>
      React.createElement(View, null, children),
    EditorSecondary: ({ children }: { children?: ReactNode }) =>
      React.createElement(View, null, children),
  });

  return {
    BottomSheet: MockBottomSheet,
    Button: MockButton,
    Composer: MockComposer,
    ContentState: {
      Error: () => null,
      Loading: () => null,
      Empty: () => null,
    },
    Section: MockSection,
    Spinner: () => null,
    useToast: () => ({ toast: { show: mockToastShow } }),
    useAlert: () => ({ alert: { show: jest.fn() } }),
    useComposerExpansion: () => null,
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false, isError: false }),
}));

jest.mock('@/frontend/data', () => ({
  useBackendModule: (module: string) => {
    if (module === 'file') return { getUri: (id: string) => `uri:${id}` };
    return {};
  },
  usePreference: () => [undefined, jest.fn()],
  useQuery: () => ({ data: undefined }),
}));

jest.mock('@/frontend/components/Composer/hooks/useComposerPresentation', () => ({
  useComposerPresentation: () => ({
    actions: {
      activateInput: jest.fn(),
      dismissInput: jest.fn(),
      registerInputTag: jest.fn(),
      runInputReplacement: (cb: () => void) => cb(),
    },
    state: {
      isEditing: false,
      keyboardTracking: { get: () => false, set: jest.fn() },
    },
  }),
}));

jest.mock('@/frontend/appShell/conversation', () => {
  const actual = jest.requireActual('@/frontend/appShell/conversation');
  return {
    ...actual,
    useConversationWorkspaces: () => ({
      items: [{ ref: 'ws-sys', kind: 'system' }],
      hasNextPage: false,
      isFetchingNextPage: false,
      isError: false,
    }),
  };
});

let mockDraftState: any = undefined;
jest.mock('@/frontend/appShell/conversation/remote', () => {
  const actual = jest.requireActual('@/frontend/appShell/conversation/remote');
  return {
    ...actual,
    useConversationDraft: () => ({
      state: mockDraftState,
      error: undefined,
    }),
  };
});

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: any) => {
    const { useEffect } = require('react');
    useEffect(() => {
      const cleanup = cb();
      return typeof cleanup === 'function' ? cleanup : undefined;
    }, [cb]);
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../useRemoteDraftPersistence', () => ({
  useRemoteDraftPersistence: () => {},
  readRemoteDraft: () => '',
}));

jest.mock('../../components/ChatInput/components/ChatInputEffortOverlay', () => ({
  ChatInputEffortOverlay: ({
    children,
    onChange,
    reasoningEfforts,
  }: {
    children: (gauge: ReactNode) => ReactNode;
    onChange: (value: string) => void;
    reasoningEfforts: readonly string[];
  }) => {
    const React = require('react');
    const { Pressable } = require('react-native');
    const gauge =
      reasoningEfforts.length > 0
        ? React.createElement(Pressable, {
            testID: 'chat-input-effort-gauge',
            onPress: () => onChange(reasoningEfforts[reasoningEfforts.length - 1]),
          })
        : null;
    return children(gauge);
  },
}));

const baseAgent: AgentSummary = {
  id: 'agent-1',
  ref: 'ref-agent-1' as AgentRef,
  name: 'Test Agent',
  configuration: 'available',
  model: {
    modelId: 'm-1',
    providerId: 'desktop',
    name: 'Model 1',
  },
  reasoningEffort: 'medium',
  availableModels: [
    {
      modelId: 'm-1',
      providerId: 'desktop',
      name: 'Model 1',
      reasoningEfforts: ['low', 'medium', 'high'],
    },
    {
      modelId: 'm-2',
      providerId: 'desktop',
      name: 'Model 2',
    },
  ],
};

const baseSnapshot: RemoteConversationSnapshot = {
  title: 'Test Session',
  freshness: { state: 'current' },
  liveMessages: [],
  executions: [],
  interactions: [],
  historyVersion: '1' as HistoryVersion,
  actions: {
    inputPolicy: {
      attachments: true,
      pluginReferences: false,
      modelSelection: true,
    },
    send: {
      availability: { state: 'enabled' },
      execute: mockSend,
    },
  },
};

let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  mockDraftState = undefined;
  mockSend.mockReset();
  mockStart.mockReset();
  mockToastShow.mockReset();
});

afterEach(() => {
  act(() => {
    renderer?.unmount();
  });
  renderer = undefined;
  jest.clearAllMocks();
});

test('renders model and effort controls when desktop advertises availableModels', async () => {
  mockSend.mockResolvedValue({ state: 'applied', value: undefined });
  await act(async () => {
    renderer = create(
      <ComposerTestProvider initialDraft="hello">
        <RemoteComposer
          agent={baseAgent}
          snapshot={baseSnapshot}
          draftKey="draft-1"
          onSessionCreated={() => false}
        />
      </ComposerTestProvider>,
    );
  });

  const modelButton = renderer!.root.findByProps({ testID: 'composer-model-button' });
  expect(modelButton).toBeDefined();

  const effortGauge = renderer!.root.findByProps({ testID: 'chat-input-effort-gauge' });
  expect(effortGauge).toBeDefined();
});

test('submits chosen modelId and reasoningEffort on send', async () => {
  mockSend.mockResolvedValue({ state: 'applied', value: undefined });
  await act(async () => {
    renderer = create(
      <ComposerTestProvider initialDraft="hello world">
        <RemoteComposer
          agent={baseAgent}
          snapshot={baseSnapshot}
          draftKey="draft-1"
          onSessionCreated={() => false}
        />
      </ComposerTestProvider>,
    );
  });

  // Switch reasoning effort to high
  const effortGauge = renderer!.root.findByProps({ testID: 'chat-input-effort-gauge' });
  act(() => {
    effortGauge.props.onPress();
  });

  // Verify send button is visible and trigger send
  expect(renderer!.root.findByProps({ testID: 'chat-composer-send' })).toBeDefined();
  await act(async () => {
    await mockComposerOnSend?.();
  });

  expect(mockSend).toHaveBeenCalledWith({
    parts: [{ type: 'text', text: 'hello world' }],
    modelId: 'desktop::m-1',
    reasoningEffort: 'high',
  });
});

test('allows selecting another model from availableModels and updates reasoning effort availability', async () => {
  mockSend.mockResolvedValue({ state: 'applied', value: undefined });
  await act(async () => {
    renderer = create(
      <ComposerTestProvider initialDraft="testing model change">
        <RemoteComposer
          agent={baseAgent}
          snapshot={baseSnapshot}
          draftKey="draft-1"
          onSessionCreated={() => false}
        />
      </ComposerTestProvider>,
    );
  });

  // Open model selection sheet
  const modelButton = renderer!.root.findByProps({ testID: 'composer-model-button' });
  await act(async () => {
    await modelButton.props.onPress();
  });

  // Pick Model 2 (which has no reasoning efforts)
  const radioItems = renderer!.root.findAll((node) => node.props.label === 'Model 2');
  expect(radioItems.length).toBeGreaterThan(0);
  act(() => {
    radioItems[0].props.onPress();
  });

  // Model 2 does not have reasoningEfforts, so effort gauge should no longer be rendered
  const effortGaugeAfter = renderer!.root.findAllByProps({ testID: 'chat-input-effort-gauge' });
  expect(effortGaugeAfter).toHaveLength(0);

  // Send message
  expect(renderer!.root.findByProps({ testID: 'chat-composer-send' })).toBeDefined();
  await act(async () => {
    await mockComposerOnSend?.();
  });

  expect(mockSend).toHaveBeenCalledWith({
    parts: [{ type: 'text', text: 'testing model change' }],
    modelId: 'desktop::m-2',
  });
});

test('does not offer model or effort controls when desktop does not advertise availableModels', async () => {
  const legacyAgent: AgentSummary = {
    ...baseAgent,
    availableModels: undefined,
  };

  await act(async () => {
    renderer = create(
      <ComposerTestProvider initialDraft="legacy peer">
        <RemoteComposer
          agent={legacyAgent}
          snapshot={baseSnapshot}
          draftKey="draft-legacy"
          onSessionCreated={() => false}
        />
      </ComposerTestProvider>,
    );
  });

  const modelButtons = renderer!.root.findAllByProps({ testID: 'composer-model-button' });
  expect(modelButtons).toHaveLength(0);

  const effortGauges = renderer!.root.findAllByProps({ testID: 'chat-input-effort-gauge' });
  expect(effortGauges).toHaveLength(0);

  // Send message sends without modelId or reasoningEffort
  mockSend.mockResolvedValue({ state: 'applied', value: undefined });
  expect(renderer!.root.findByProps({ testID: 'chat-composer-send' })).toBeDefined();
  await act(async () => {
    await mockComposerOnSend?.();
  });

  expect(mockSend).toHaveBeenCalledWith({
    parts: [{ type: 'text', text: 'legacy peer' }],
  });
});

test('does not offer model or effort controls when inputPolicy.modelSelection is false', async () => {
  const disabledPolicySnapshot: RemoteConversationSnapshot = {
    ...baseSnapshot,
    actions: {
      ...baseSnapshot.actions,
      inputPolicy: {
        ...baseSnapshot.actions.inputPolicy,
        modelSelection: false,
      },
    },
  };

  await act(async () => {
    renderer = create(
      <ComposerTestProvider initialDraft="disabled policy">
        <RemoteComposer
          agent={baseAgent}
          snapshot={disabledPolicySnapshot}
          draftKey="draft-disabled"
          onSessionCreated={() => false}
        />
      </ComposerTestProvider>,
    );
  });

  const modelButtons = renderer!.root.findAllByProps({ testID: 'composer-model-button' });
  expect(modelButtons).toHaveLength(0);

  const effortGauges = renderer!.root.findAllByProps({ testID: 'chat-input-effort-gauge' });
  expect(effortGauges).toHaveLength(0);
});

test('works on draft start with modelSelection enabled', async () => {
  mockStart.mockResolvedValue({ state: 'applied', value: { conversation: { sessionId: 'c-1' } } });
  mockDraftState = {
    inputPolicy: { attachments: true, pluginReferences: false, modelSelection: true },
    start: { availability: { state: 'enabled' }, execute: mockStart },
  };

  await act(async () => {
    renderer = create(
      <ComposerTestProvider initialDraft="first draft message">
        <RemoteComposer
          agent={baseAgent}
          snapshot={baseSnapshot}
          draftId={'draft-new' as DraftId}
          draftKey="draft-new"
          onSessionCreated={() => false}
        />
      </ComposerTestProvider>,
    );
  });

  const modelButton = renderer!.root.findByProps({ testID: 'composer-model-button' });
  expect(modelButton).toBeDefined();

  expect(renderer!.root.findByProps({ testID: 'chat-composer-send' })).toBeDefined();
  await act(async () => {
    await mockComposerOnSend?.();
  });

  expect(mockStart).toHaveBeenCalledWith({
    parts: [{ type: 'text', text: 'first draft message' }],
    modelId: 'desktop::m-1',
    reasoningEffort: 'medium',
  });
});

test('preserves user selected model, effort, and input text when send rejects with conflict', async () => {
  mockSend.mockResolvedValue({
    state: 'rejected',
    failure: { code: 'conflict', retry: 'read-again' },
  });

  await act(async () => {
    renderer = create(
      <ComposerTestProvider initialDraft="conflict message">
        <RemoteComposer
          agent={baseAgent}
          snapshot={baseSnapshot}
          draftKey="draft-conflict"
          onSessionCreated={() => false}
        />
      </ComposerTestProvider>,
    );
  });

  // Switch reasoning effort to high
  const effortGauge = renderer!.root.findByProps({ testID: 'chat-input-effort-gauge' });
  act(() => {
    effortGauge.props.onPress();
  });

  // Attempt to send, which rejects with conflict
  expect(renderer!.root.findByProps({ testID: 'chat-composer-send' })).toBeDefined();
  await act(async () => {
    await mockComposerOnSend?.();
  });

  // Model and effort controls remain active with the user's selection
  const modelButton = renderer!.root.findByProps({ testID: 'composer-model-button' });
  expect(modelButton).toBeDefined();

  // Try send again with success
  mockSend.mockResolvedValue({ state: 'applied', value: undefined });
  await act(async () => {
    await mockComposerOnSend?.();
  });

  expect(mockSend).toHaveBeenLastCalledWith({
    parts: [{ type: 'text', text: 'conflict message' }],
    modelId: 'desktop::m-1',
    reasoningEffort: 'high',
  });
});

test('restores model and reasoning effort when editing undelivered message', async () => {
  const undeliveredSnapshot: RemoteConversationSnapshot = {
    ...baseSnapshot,
    undelivered: {
      id: 'op-1' as any,
      state: 'rejected',
      failure: { code: 'invalid-input', retry: 'revise-input' },
      input: {
        parts: [{ type: 'text', text: 'undelivered text' }],
        modelId: 'desktop::m-2' as any,
        reasoningEffort: 'low' as any,
      },
      resend: { availability: { state: 'enabled' }, execute: jest.fn() },
      discard: jest.fn(),
    },
  };

  await act(async () => {
    renderer = create(
      <ComposerTestProvider initialDraft="">
        <RemoteComposer
          agent={baseAgent}
          snapshot={undeliveredSnapshot}
          draftKey="draft-undelivered"
          onSessionCreated={() => false}
        />
      </ComposerTestProvider>,
    );
  });

  // Open details and click edit
  const undeliveredNode = renderer!.root.findByProps({ testID: 'undelivered-message' });
  act(() => {
    undeliveredNode.props.onPress();
  });

  // Find Edit button in undelivered bottom sheet
  const editButtons = renderer!.root.findAll((node) => node.props.children === 'common.edit');
  expect(editButtons.length).toBeGreaterThan(0);
  await act(async () => {
    await editButtons[0].props.onPress();
  });

  // Model 2 was selected from undelivered message
  const modelButton = renderer!.root.findByProps({ testID: 'composer-model-button' });
  expect(modelButton.props.accessibilityLabel).toBe('Model 2');
});
