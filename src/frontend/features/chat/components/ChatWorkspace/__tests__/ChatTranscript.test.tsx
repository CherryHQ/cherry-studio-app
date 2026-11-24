import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatTranscript } from '../ChatTranscript';
import type { ChatTurnNavigator } from '../chatTurns';

let mockHeaderHeight = 0;
const mockList = jest.fn((_props: { contentTopInset: number }) => null);
const mockTurnDirectory = jest.fn(
  (_props: { navigator: ChatTurnNavigator; scrollProgress: unknown; turnCount?: number }) => null,
);

jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => mockHeaderHeight }));

jest.mock('react-native-reanimated', () => ({
  useDerivedValue: (read: () => unknown) => ({ get: read }),
  useSharedValue: <T,>(initial: T) => ({ get: () => initial, set: jest.fn(), value: initial }),
}));

jest.mock('@cherrystudio/ui/components', () => ({ useComposerExpansion: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/frontend/appShell/navigation', () => ({
  resolveHeaderContentInset: (headerHeight: number) => headerHeight,
}));

jest.mock('@/frontend/appShell/header', () => ({ mainHeaderRowHeight: 56 }));

jest.mock('@/frontend/components/Message', () => ({
  MessageList: (props: { contentTopInset: number }) => mockList(props),
}));

jest.mock('../components/ChatTurnDirectory', () => ({
  ChatTurnDirectory: (props: Parameters<typeof mockTurnDirectory>[0]) => mockTurnDirectory(props),
  MAX_TRIGGER_TICKS: 7,
}));

jest.mock('../components/ChatInitialRenderCover', () => ({ ChatInitialRenderCover: () => null }));

jest.mock('../components/ChatOlderMessagesIndicator', () => ({
  ChatOlderMessagesIndicator: () => null,
}));

jest.mock('../hooks/useMessageListInitialRenderGate', () => ({
  useMessageListInitialRenderGate: () => ({ isCoverVisible: false, markListLoaded: jest.fn() }),
}));

describe('ChatTranscript', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockList.mockClear();
    mockTurnDirectory.mockClear();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('keeps the transcript under the header while a layer hides it', () => {
    mockHeaderHeight = 116;
    act(() => {
      renderer = create(transcript());
    });
    expect(mockList.mock.lastCall?.[0].contentTopInset).toBe(116);

    mockHeaderHeight = 0;
    act(() => renderer!.update(transcript()));
    expect(mockList.mock.lastCall?.[0].contentTopInset).toBe(116);

    mockHeaderHeight = 100;
    act(() => renderer!.update(transcript()));
    expect(mockList.mock.lastCall?.[0].contentTopInset).toBe(100);
  });

  test('hides turn directory for fewer than two turns and shows it once two user turns exist', () => {
    const turnNavigator: ChatTurnNavigator = {
      scope: 'local:s1',
      queryKey: ['turns', 'local:s1'],
      read: jest.fn(async () => ({ items: [] })),
      jump: jest.fn(),
    };

    act(() => {
      renderer = create(
        transcript({
          messages: [],
          turnNavigator,
        }),
      );
    });
    expect(mockTurnDirectory).not.toHaveBeenCalled();

    act(() => {
      renderer!.update(
        transcript({
          messages: [
            { id: 'u1', role: 'user', status: 'success', data: { parts: [] } },
            { id: 'a1', role: 'assistant', status: 'success', data: { parts: [] } },
          ] as never,
          turnNavigator,
        }),
      );
    });
    expect(mockTurnDirectory).not.toHaveBeenCalled();

    act(() => {
      renderer!.update(
        transcript({
          messages: [
            { id: 'u1', role: 'user', status: 'success', data: { parts: [] } },
            { id: 'a1', role: 'assistant', status: 'success', data: { parts: [] } },
            { id: 'u2', role: 'user', status: 'success', data: { parts: [] } },
          ] as never,
          turnNavigator,
        }),
      );
    });
    expect(mockTurnDirectory).toHaveBeenCalledWith(
      expect.objectContaining({
        navigator: turnNavigator,
        scrollProgress: expect.objectContaining({ value: 1 }),
        turnCount: 2,
      }),
    );
  });

  test.each([
    { hasOlderMessages: true, hasNewerMessages: false },
    { hasOlderMessages: false, hasNewerMessages: true },
  ])('uses seven ticks for a partial message window (%j)', (pagination) => {
    const turnNavigator: ChatTurnNavigator = {
      scope: 'local:s1',
      queryKey: ['turns', 'local:s1'],
      read: jest.fn(async () => ({ items: [] })),
      jump: jest.fn(),
    };
    act(() => {
      renderer = create(
        transcript({
          ...pagination,
          messages: [
            { id: 'u1', role: 'user', status: 'success', data: { parts: [] } },
            { id: 'u2', role: 'user', status: 'success', data: { parts: [] } },
          ],
          turnNavigator,
        }),
      );
    });

    expect(mockTurnDirectory.mock.lastCall?.[0].turnCount).toBe(7);
  });

  test('combines hidden loaded user turns with visible user turns when older pages are absent', () => {
    const turnNavigator: ChatTurnNavigator = {
      scope: 'local:s1',
      queryKey: ['turns', 'local:s1'],
      read: jest.fn(async () => ({ items: [] })),
      jump: jest.fn(),
    };

    act(() => {
      renderer = create(
        transcript({
          hasOlderMessages: false,
          hiddenUserTurnCount: 1,
          messages: [{ id: 'u2', role: 'user', status: 'success', data: { parts: [] } }] as never,
          turnNavigator,
        }),
      );
    });
    expect(mockTurnDirectory.mock.lastCall?.[0].turnCount).toBe(2);

    act(() => {
      renderer!.update(
        transcript({
          hasOlderMessages: false,
          hiddenUserTurnCount: 1,
          messages: [
            { id: 'u2', role: 'user', status: 'success', data: { parts: [] } },
            { id: 'u3', role: 'user', status: 'success', data: { parts: [] } },
          ] as never,
          turnNavigator,
        }),
      );
    });
    expect(mockTurnDirectory.mock.lastCall?.[0].turnCount).toBe(3);
  });
});

function transcript(overrides: Partial<Parameters<typeof ChatTranscript>[0]> = {}) {
  return (
    <ChatTranscript
      contentBottomInset={0}
      dataKey="s1"
      isLoadingMore={false}
      keyboardOffset={0}
      messages={[]}
      renderMessage={() => null}
      requiresInitialLayout={false}
      {...overrides}
    />
  );
}
