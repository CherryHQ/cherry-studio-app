import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatTranscript } from '../ChatTranscript';

let mockHeaderHeight = 0;
const mockList = jest.fn((_props: { contentTopInset: number }) => null);

jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => mockHeaderHeight }));

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

jest.mock('../components/ChatInitialRenderCover', () => ({ ChatInitialRenderCover: () => null }));

jest.mock('../components/ChatOlderMessagesIndicator', () => ({
  ChatOlderMessagesIndicator: () => null,
}));

jest.mock('../hooks/useMessageListInitialRenderGate', () => ({
  useMessageListInitialRenderGate: () => ({ isCoverVisible: false, markListLoaded: jest.fn() }),
}));

describe('ChatTranscript', () => {
  let renderer: ReactTestRenderer | undefined;

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
});

function transcript() {
  return (
    <ChatTranscript
      contentBottomInset={0}
      dataKey="s1"
      isLoadingMore={false}
      keyboardOffset={0}
      messages={[]}
      renderMessage={() => null}
      requiresInitialLayout={false}
    />
  );
}
