import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationSnapshot } from '@/frontend/appShell/conversation';

import { useConversationFeedbackHint } from '../useConversationFeedbackHint';

const mockHint = { show: jest.fn(), hide: jest.fn() };
let mockFocused = true;
let mockBottomOffset = 100;
const bottomOffset = { get: () => mockBottomOffset } as SharedValue<number>;
jest.mock('@/frontend/appShell/feedback', () => ({ useFeedbackHint: () => mockHint }));
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
let renderer: ReactTestRenderer;
const NO_RUNS: ConversationSnapshot['executions'] = [];
function Probe({
  runs = NO_RUNS,
  scope = 'local:chat',
  freshness = 'current',
}: {
  runs?: ConversationSnapshot['executions'];
  scope?: string;
  freshness?: 'current' | 'loading';
}) {
  useConversationFeedbackHint(
    scope,
    {
      title: '',
      liveMessages: [],
      interactions: [],
      executions: runs,
      freshness: { state: freshness },
    },
    bottomOffset,
  );
  return null;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockBottomOffset = 100;
  act(() => {
    renderer = create(<Probe />);
  });
});
afterEach(() => act(() => renderer.unmount()));

test('only newly failed executions prompt, and repeated snapshots do not', () => {
  act(() => renderer.update(<Probe runs={[{ id: 'one', state: 'running' }]} />));
  expect(mockHint.show).not.toHaveBeenCalled();
  act(() => renderer.update(<Probe runs={[{ id: 'one', state: 'failed' }]} />));
  act(() => renderer.update(<Probe runs={[{ id: 'one', state: 'failed' }]} />));
  expect(mockHint.show).toHaveBeenCalledTimes(1);
  expect(mockHint.show).toHaveBeenCalledWith(100);
});

test('a fast failure without an intermediate running render still prompts', () => {
  act(() => renderer.update(<Probe runs={[{ id: 'fast', state: 'failed' }]} />));
  expect(mockHint.show).toHaveBeenCalledTimes(1);
});

test('reads the latest composer height when a failure arrives', () => {
  mockBottomOffset = 180;
  act(() => renderer.update(<Probe runs={[{ id: 'fast', state: 'failed' }]} />));
  expect(mockHint.show).toHaveBeenCalledWith(180);
});

test.each(['completed', 'cancelled', 'interrupted', 'awaiting-input'] as const)(
  'does not prompt for %s',
  (state) => {
    act(() => renderer.update(<Probe runs={[{ id: 'one', state }]} />));
    expect(mockHint.show).not.toHaveBeenCalled();
  },
);

test('history hydration and conversation switches only establish a baseline', () => {
  act(() => renderer.update(<Probe freshness="loading" />));
  act(() => renderer.update(<Probe runs={[{ id: 'old', state: 'failed' }]} />));
  act(() =>
    renderer.update(<Probe scope="remote:chat" runs={[{ id: 'other-old', state: 'failed' }]} />),
  );
  expect(mockHint.show).not.toHaveBeenCalled();
});

test('background routes do not prompt on failure or on return', () => {
  mockFocused = false;
  act(() => renderer.update(<Probe runs={[{ id: 'one', state: 'failed' }]} />));
  mockFocused = true;
  act(() => renderer.update(<Probe runs={[{ id: 'one', state: 'failed' }]} />));
  expect(mockHint.show).not.toHaveBeenCalled();
  expect(mockHint.hide).toHaveBeenCalled();
});
