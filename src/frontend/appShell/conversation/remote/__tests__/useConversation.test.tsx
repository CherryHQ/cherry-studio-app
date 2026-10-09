import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationRef, ConversationSource } from '../../contracts';
import { createConversationState } from '../../conversationState';
import type { RemoteConversationSession } from '../remoteContracts';
import { useConversation } from '../useConversation';
const mockSources = { open: jest.fn() };
jest.mock('../../ConversationProvider', () => ({ useConversationSources: () => mockSources }));
const desktop = { kind: 'desktop', connectionId: 'pc' } as const;
const ref: ConversationRef = { source: desktop, sessionId: 's' };
let result: ReturnType<typeof useConversation>;
function Harness() {
  const value = useConversation(ref);
  useEffect(() => {
    result = value;
  }, [value]);
  return null;
}

describe('conversation route observation', () => {
  let tree: ReactTestRenderer;
  afterEach(async () => {
    await act(async () => tree?.unmount());
    jest.clearAllMocks();
  });
  it('retains source demand after an offline read and retries when the backend reconnects', async () => {
    const state = createConversationState<ReturnType<ConversationSource['state']['getSnapshot']>>({
      availability: { state: 'disabled', reason: 'offline' },
    });
    const unobserve = jest.fn();
    const session = {
      activate: jest.fn(() => unobserve),
      dispose: jest.fn(),
    } as unknown as RemoteConversationSession;
    const openSession = jest
      .fn()
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(session);
    const release = jest.fn();
    mockSources.open.mockResolvedValue({ source: { ref: desktop, state, openSession }, release });
    await act(async () => {
      tree = create(<Harness />);
    });
    expect(result.error?.message).toBe('Offline');
    expect(release).not.toHaveBeenCalled();
    await act(async () => state.set({ availability: { state: 'enabled' } }));
    expect(result.session).toBe(session);
    expect(openSession).toHaveBeenCalledTimes(2);
    expect(mockSources.open).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
    expect(unobserve).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('does not lose reconnect while an earlier open is still rejecting', async () => {
    const state = createConversationState<ReturnType<ConversationSource['state']['getSnapshot']>>({
      availability: { state: 'disabled', reason: 'offline' },
    });
    let reject!: (error: Error) => void;
    const session = {
      activate: jest.fn(() => () => {}),
      dispose: jest.fn(),
    } as unknown as RemoteConversationSession;
    const openSession = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, no) => {
            reject = no;
          }),
      )
      .mockResolvedValueOnce(session);
    mockSources.open.mockResolvedValue({
      source: { ref: desktop, state, openSession },
      release: jest.fn(),
    });
    await act(async () => {
      tree = create(<Harness />);
    });
    await act(async () => state.set({ availability: { state: 'enabled' } }));
    await act(async () => reject(new Error('Old channel closed')));
    expect(openSession).toHaveBeenCalledTimes(2);
    expect(result.session).toBe(session);
  });
  it('disposes a late session without installing observation after the route exits', async () => {
    let resolve!: (session: RemoteConversationSession) => void;
    let signal: AbortSignal | undefined;
    const release = jest.fn();
    mockSources.open.mockResolvedValue({
      source: {
        ref: desktop,
        state: { subscribe: () => () => {} },
        openSession: (_ref: ConversationRef, value: AbortSignal) => {
          signal = value;
          return new Promise((yes) => {
            resolve = yes;
          });
        },
      },
      release,
    });
    await act(async () => {
      tree = create(<Harness />);
    });
    await act(async () => tree.unmount());
    const session = {
      activate: jest.fn(),
      dispose: jest.fn(),
    } as unknown as RemoteConversationSession;
    await act(async () => resolve(session));
    expect(signal?.aborted).toBe(true);
    expect(session.activate).not.toHaveBeenCalled();
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
