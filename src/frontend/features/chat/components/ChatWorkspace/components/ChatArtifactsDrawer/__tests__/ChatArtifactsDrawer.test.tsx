import { Keyboard, type LayoutChangeEvent } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { OpenRemoteSessionSheetContext } from '@/frontend/appShell/navigation/chat';
import type { RemoteSessionLivePreview } from '@/shared/contracts/remoteAgent';
import type { AgentSessionResources } from '@/shared/data/api/schemas/agentSessionMessages';
import type { DesktopDispatchResult } from '@/shared/data/types/desktopDispatchTool';

import { ChatArtifactsDrawer } from '../ChatArtifactsDrawer';

const mockUseQuery = jest.fn();
const mockGetPersist = jest.fn();
const mockSetPersist = jest.fn();
const mockHaptic = jest.fn();
const mockWithDelay = jest.fn((_delay: number, next: number) => next);
const mockMinDistance = jest.fn();
const mockOpenFile = jest.fn();
const mockResolveFile = jest.fn();
const mockOpenSheet = jest.fn();
const mockBreathing = jest.fn();
const mockLiveListeners = new Set<() => void>();
let mockPreview: RemoteSessionLivePreview | undefined;
let mockBack: (() => void) | undefined;
let mockTap: ((event: unknown, success: boolean) => void) | undefined;
let mockPanStart: (() => void) | undefined;
let mockPanUpdate: ((event: { translationX: number; translationY: number }) => void) | undefined;
let mockPanEnd:
  | ((event: { velocityX: number; velocityY: number }, success: boolean) => void)
  | undefined;

const mockAgent = {
  peekLiveSession: () => mockPreview,
  subscribeLiveSession: (_connectionId: string, _sessionId: string, listener: () => void) => {
    mockLiveListeners.add(listener);
    return () => mockLiveListeners.delete(listener);
  },
};

jest.mock('@/frontend/data', () => ({
  queryKeys: { agentSessions: { messages: (id: string) => [`/agent-sessions/${id}/messages`] } },
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useBackendModule: () => mockAgent,
}));
jest.mock('@/frontend/data/CacheService', () => ({
  cacheService: {
    getPersist: (...args: unknown[]) => mockGetPersist(...args),
    setPersist: (...args: unknown[]) => mockSetPersist(...args),
  },
}));
jest.mock('@/frontend/components/Message', () =>
  jest.requireActual('@/frontend/components/Message/parts/tools/desktopTaskPipHooks'),
);
jest.mock('@/frontend/components/FileEntryPreview', () => {
  const React = jest.requireActual('react');
  return {
    FileEntrySkeleton: (props: object) => React.createElement('FileEntrySkeleton', props),
    LoadedFileEntryPreview: (props: object) => React.createElement('LoadedFileEntryPreview', props),
    useOpenFileEntry: () => ({ openFileEntry: mockOpenFile }),
    useResolvedFile: (id: string) => mockResolveFile(id),
  };
});
jest.mock('@/frontend/hooks/useBreathingOpacity', () => ({
  useBreathingOpacity: (options: object) => {
    mockBreathing(options);
    return { get: () => 0.28 };
  },
}));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/frontend/appShell/navigation', () => ({
  useFocusedBackPress: (back: () => void, enabled: boolean) => {
    mockBack = enabled ? back : undefined;
  },
}));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  OpenRemoteSessionSheetContext: jest.requireActual('react').createContext(undefined),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { date: string }) => (values ? `${key} ${values.date}` : key),
    i18n: { resolvedLanguage: 'en-US' },
  }),
}));
jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    BackgroundPressExclusion: (props: object) => React.createElement(View, props),
    FileBrowserRow: ({ description, name, preview, ...props }: Record<string, unknown>) =>
      React.createElement(
        Pressable,
        props,
        React.createElement(Text, null, name),
        React.createElement(Text, null, description),
        preview,
      ),
    ShimmerText: (props: object) => React.createElement('ShimmerText', props),
    Skeleton: (props: object) => React.createElement(View, props),
  };
});
jest.mock('@cherrystudio/ui/haptics', () => ({ haptics: { light: () => mockHaptic() } }));
jest.mock('@cherrystudio/ui/motion', () => ({
  duration: { fast: 200 },
  easing: { inOut: 'inOut' },
  spring: { settle: {} },
}));
jest.mock('@cherrystudio/app-icons/icons/box', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/monitor', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);

jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: <T,>(initial: T) => {
      const value = useRef(initial);
      return {
        get: () => value.current,
        set: (next: T) => {
          value.current = next;
        },
      };
    },
    useAnimatedStyle: (read: () => object) => read(),
    useDerivedValue: <T,>(read: () => T) => ({ get: read }),
    useReducedMotion: () => false,
    cancelAnimation: jest.fn(),
    withTiming: (value: number) => value,
    withSpring: (value: number) => value,
    withDelay: (delay: number, value: number) => mockWithDelay(delay, value),
    ReduceMotion: { System: 'system', Never: 'never' },
  };
});
jest.mock('react-native-keyboard-controller', () => ({
  useReanimatedKeyboardAnimation: () => ({ height: { get: () => 0 }, progress: { get: () => 0 } }),
}));
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: {
    Pan: () => {
      const pan = {
        minDistance: (distance: number) => {
          mockMinDistance(distance);
          return pan;
        },
        maxPointers: () => pan,
        onStart: (callback: typeof mockPanStart) => {
          mockPanStart = callback;
          return pan;
        },
        onUpdate: (callback: typeof mockPanUpdate) => {
          mockPanUpdate = callback;
          return pan;
        },
        onEnd: (callback: typeof mockPanEnd) => {
          mockPanEnd = callback;
          return pan;
        },
      };
      return pan;
    },
    Tap: () => {
      const tap = {
        runOnJS: () => tap,
        onEnd: (callback: typeof mockTap) => {
          mockTap = callback;
          return tap;
        },
      };
      return tap;
    },
    Race: () => ({}),
  },
}));

const output: DesktopDispatchResult = {
  status: 'dispatched',
  connectionId: 'pc',
  connectionName: 'Desktop',
  agentId: 'agent',
  agentName: 'Agent',
  workspace: { kind: 'system' },
  workspaceName: 'Default',
  title: 'Summarize the report',
  promptPreview: 'Report',
  attachments: [],
  sessionId: 'remote',
};
const remoteResources: AgentSessionResources = {
  dispatches: [{ messageId: 'm1', toolCallId: 'call', input: null, output }],
  files: [],
};
const zero = { get: () => 0 } as SharedValue<number>;

describe('ChatArtifactsDrawer', () => {
  let renderer: ReactTestRenderer | undefined;
  let dismiss: jest.SpiedFunction<typeof Keyboard.dismiss>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPersist.mockReturnValue(null);
    mockResolveFile.mockReturnValue({ isLoading: false });
    mockPreview = undefined;
    dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    dismiss.mockRestore();
  });

  function render(data: AgentSessionResources) {
    mockUseQuery.mockReturnValue({ data });
    act(() => {
      renderer = create(
        <OpenRemoteSessionSheetContext value={mockOpenSheet}>
          <ChatArtifactsDrawer
            sessionId="session-1"
            messages={[]}
            bottomAccessoryHeight={zero}
            contentBottomInset={20}
            contentTopInset={90}
            hasTurnDirectory
            keyboardOffset={0}
          />
        </OpenRemoteSessionSheetContext>,
      );
    });
    const viewport = renderer!.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.pointerEvents === 'box-none' &&
        node.props.onLayout,
    )[0];
    if (viewport) {
      act(() =>
        viewport.props.onLayout({
          nativeEvent: { layout: { width: 390, height: 800 } },
        } as LayoutChangeEvent),
      );
    }
  }

  function identified(testID: string) {
    return renderer!.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === testID,
    );
  }

  test('requests the selected session under its message key and hides an empty result', () => {
    render({ dispatches: [], files: [] });
    expect(mockUseQuery).toHaveBeenCalledWith('/agent-sessions/:sessionId/messages/resources', {
      params: { sessionId: 'session-1' },
      queryKey: ['/agent-sessions/session-1/messages', 'resources'],
    });
    expect(identified('chat-artifacts-handle')).toHaveLength(0);
  });

  test('persists a velocity-projected snap, then tucks after drag and outside or back dismissal', () => {
    mockGetPersist.mockReturnValue({ side: 'right', yRatio: 0.24 });
    render(remoteResources);
    expect(mockMinDistance).toHaveBeenCalledWith(6);
    act(() => {
      mockPanStart!();
      mockPanUpdate!({ translationX: -150, translationY: 500 });
      mockPanEnd!({ velocityX: -1000, velocityY: 0 }, true);
    });
    expect(mockSetPersist).toHaveBeenCalledWith('chat.artifacts_handle_dock', {
      side: 'left',
      yRatio: 1,
    });
    expect(mockHaptic).toHaveBeenCalledTimes(1);
    expect(mockWithDelay).toHaveBeenLastCalledWith(2200, 0);

    act(() => mockTap!(null, true));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(mockHaptic).toHaveBeenCalledTimes(2);
    expect(identified('chat-artifacts-popover')).toHaveLength(1);
    act(() => identified('chat-artifacts-backdrop')[0].props.onClick({ nativeEvent: {} }));
    expect(identified('chat-artifacts-popover')).toHaveLength(0);

    act(() => mockTap!(null, true));
    act(() => mockBack!());
    expect(identified('chat-artifacts-popover')).toHaveLength(0);
    expect(mockWithDelay).toHaveBeenCalledTimes(3);
  });

  test('follows live status while tucked and closes before opening a remote destination', () => {
    render(remoteResources);
    expect(mockBreathing).toHaveBeenLastCalledWith({ active: false });
    act(() => {
      mockPreview = {
        connectionStatus: 'ready',
        current: true,
        executionState: 'running',
        sessionTitle: 'Live title',
      };
      mockLiveListeners.forEach((listener) => listener());
    });
    expect(mockBreathing).toHaveBeenLastCalledWith({ active: true });
    act(() => mockTap!(null, true));
    const status = renderer!.root.findAll((node) => node.type === ('ShimmerText' as never));
    expect(status[0].props.children).toBe('desktopDispatch.pip.status.running');
    const row = renderer!.root.findAll(
      (node) =>
        typeof node.props.onPress === 'function' &&
        node.props.accessibilityLabel === 'Live title, desktopDispatch.pip.status.running',
    )[0];
    act(() => row.props.onPress());
    expect(mockOpenSheet).toHaveBeenCalledWith({
      connectionId: 'pc',
      agentId: 'agent',
      sessionId: 'remote',
    });
    expect(identified('chat-artifacts-popover')).toHaveLength(0);
    expect(mockBreathing).toHaveBeenLastCalledWith({ active: true });
  });

  test('renders both file types as rows, distinguishes loading and missing bytes, and opens the chosen file', () => {
    const image = {
      id: 'image',
      filename: 'Generated.png',
      mediaType: 'image/png',
      updatedAt: Date.UTC(2026, 0, 3),
    };
    const pdf = { ...image, id: 'pdf', filename: 'Report.pdf', mediaType: 'application/pdf' };
    const file = { entry: pdf, uri: 'file://report.pdf' };
    mockResolveFile.mockImplementation((id: string) => {
      if (id === 'image') return { entry: image, data: { entry: image, uri: 'file://image.png' } };
      if (id === 'pdf') return { entry: pdf, data: file };
      if (id === 'unavailable') return { entry: { ...pdf, id }, data: null };
      return { isLoading: id === 'loading' };
    });
    render({
      ...remoteResources,
      files: ['image', 'pdf', 'unavailable', 'missing', 'loading'].map((fileEntryId) => ({
        fileEntryId,
      })),
    });
    act(() => mockTap!(null, true));
    const previews = renderer!.root.findAll(
      (node) => node.type === ('LoadedFileEntryPreview' as never),
    );
    expect(previews.map(({ props }) => [props.entry.id, props.variant, props.size])).toEqual([
      ['image', 'icon', 40],
      ['pdf', 'icon', 40],
      ['unavailable', 'icon', 40],
    ]);
    expect(
      renderer!.root.findAll((node) => node.type === ('FileEntrySkeleton' as never)),
    ).toHaveLength(1);
    expect(identified('chat-artifact-file-missing')).toHaveLength(0);
    expect(identified('chat-artifact-file-unavailable')[0].props.accessibilityState.disabled).toBe(
      true,
    );
    act(() => identified('chat-artifact-file-pdf')[0].props.onClick({ nativeEvent: {} }));
    expect(mockOpenFile).toHaveBeenCalledWith(file);
    expect(identified('chat-artifacts-popover')).toHaveLength(0);
  });
});
