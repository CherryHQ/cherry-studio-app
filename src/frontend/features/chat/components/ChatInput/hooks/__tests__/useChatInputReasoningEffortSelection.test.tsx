import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cacheService } from '@/frontend/data/CacheService';

import type { ChatInputReasoningEffort } from '../../utils/chatInputReasoning';
import { useChatInputReasoningEffortSelection } from '../useChatInputReasoningEffortSelection';

type Snapshot = ReturnType<typeof useChatInputReasoningEffortSelection>;
const DEFAULT_EFFORTS = ['default', 'low', 'medium', 'high'] as const;

describe('useChatInputReasoningEffortSelection', () => {
  let snapshot: Snapshot;
  let renderer: ReactTestRenderer | undefined;

  const render = async (
    availableEfforts: readonly ChatInputReasoningEffort[] | undefined,
    agentId = 'agent-a',
  ) => {
    await act(async () => {
      const harness = (
        <Harness
          agentId={agentId}
          availableEfforts={availableEfforts}
          onSnapshot={(value) => {
            snapshot = value;
          }}
        />
      );
      if (renderer) renderer.update(harness);
      else renderer = create(harness);
    });
  };

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    cacheService.cleanup();
  });

  test('uses the model default without creating a remembered selection', async () => {
    await render(DEFAULT_EFFORTS);
    expect(snapshot).toMatchObject({
      isReasoningEffortSelected: false,
      reasoningEffort: 'default',
    });
    expect(cacheService.getPersist('chat.reasoning_efforts')).toEqual({});
  });

  test('restores the selection when a new conversation mounts its composer', async () => {
    await render(DEFAULT_EFFORTS);
    await act(async () => snapshot.selectReasoningEffort('high'));
    await act(async () => renderer?.unmount());
    renderer = undefined;
    await render(DEFAULT_EFFORTS);

    expect(snapshot).toMatchObject({ isReasoningEffortSelected: true, reasoningEffort: 'high' });
    expect(cacheService.getPersist('chat.reasoning_efforts')).toEqual({ 'agent-a': 'high' });
  });

  test('remembers each Agent independently and merges writes against the latest cache', async () => {
    await render(DEFAULT_EFFORTS);
    const selectFirstAgent = snapshot.selectReasoningEffort;
    await act(async () => selectFirstAgent('high'));
    await render(DEFAULT_EFFORTS, 'agent-b');
    expect(snapshot.reasoningEffort).toBe('default');
    await act(async () => snapshot.selectReasoningEffort('low'));
    await act(async () => selectFirstAgent('medium'));
    expect(snapshot.reasoningEffort).toBe('low');
    await render(DEFAULT_EFFORTS);
    expect(snapshot.reasoningEffort).toBe('medium');
    expect(cacheService.getPersist('chat.reasoning_efforts')).toEqual({
      'agent-a': 'medium',
      'agent-b': 'low',
    });
  });

  test('remembers the nearest inherited stop instead of restoring the older preference', async () => {
    await render(DEFAULT_EFFORTS);
    await act(async () => snapshot.selectReasoningEffort('high'));
    await render(['default', 'low', 'medium']);
    expect(snapshot.reasoningEffort).toBe('medium');
    await render(DEFAULT_EFFORTS);
    expect(snapshot.reasoningEffort).toBe('medium');
    expect(cacheService.getPersist('chat.reasoning_efforts')).toEqual({ 'agent-a': 'medium' });
  });

  test('preserves the cache during model loading and resets only for a resolved non-reasoning model', async () => {
    cacheService.setPersist('chat.reasoning_efforts', { 'agent-a': 'high' });
    await render(undefined);
    expect(cacheService.getPersist('chat.reasoning_efforts')).toEqual({ 'agent-a': 'high' });
    await render(DEFAULT_EFFORTS);
    expect(snapshot.reasoningEffort).toBe('high');
    await render([]);
    expect(snapshot.reasoningEffort).toBe('default');
    await render(DEFAULT_EFFORTS);
    expect(snapshot.reasoningEffort).toBe('default');
  });
});

function Harness({
  agentId,
  availableEfforts,
  onSnapshot,
}: {
  agentId: string;
  availableEfforts: readonly ChatInputReasoningEffort[] | undefined;
  onSnapshot: (snapshot: Snapshot) => void;
}) {
  const snapshot = useChatInputReasoningEffortSelection(availableEfforts, agentId);
  useEffect(() => onSnapshot(snapshot), [onSnapshot, snapshot]);
  return null;
}
