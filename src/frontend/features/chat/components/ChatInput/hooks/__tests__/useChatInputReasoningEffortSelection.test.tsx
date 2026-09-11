import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatInputReasoningEffort } from '../../utils/chatInputReasoning';
import { useChatInputReasoningEffortSelection } from '../useChatInputReasoningEffortSelection';

type Snapshot = ReturnType<typeof useChatInputReasoningEffortSelection>;

describe('useChatInputReasoningEffortSelection', () => {
  test('uses the model default without turning it into a local override', async () => {
    let snapshot: Snapshot | undefined;

    await act(async () => {
      create(
        <Harness
          availableEfforts={['default', 'low', 'high']}
          onSnapshot={(value) => {
            snapshot = value;
          }}
        />,
      );
    });

    expect(snapshot).toMatchObject({
      isReasoningEffortSelected: false,
      reasoningEffort: 'default',
    });
  });

  test('keeps a composer selection across a rerender', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const renderHarness = () => (
      <Harness
        availableEfforts={['default', 'low', 'high']}
        onSnapshot={(value) => {
          snapshot = value;
        }}
      />
    );

    await act(async () => {
      renderer = create(renderHarness());
    });
    await act(async () => snapshot?.selectReasoningEffort('high'));
    await act(async () => renderer?.update(renderHarness()));

    expect(snapshot).toMatchObject({
      isReasoningEffortSelected: true,
      reasoningEffort: 'high',
    });
  });

  test('clears a composer selection when the Agent changes', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const renderHarness = (agentId: string) => (
      <Harness
        agentId={agentId}
        availableEfforts={['default', 'low', 'high']}
        onSnapshot={(value) => {
          snapshot = value;
        }}
      />
    );

    await act(async () => {
      renderer = create(renderHarness('agent-a'));
    });
    await act(async () => snapshot?.selectReasoningEffort('high'));
    await act(async () => renderer?.update(renderHarness('agent-b')));

    expect(snapshot).toMatchObject({
      isReasoningEffortSelected: false,
      reasoningEffort: 'default',
    });
  });
});

function Harness({
  agentId,
  availableEfforts,
  onSnapshot,
}: {
  agentId?: string;
  availableEfforts: readonly ChatInputReasoningEffort[];
  onSnapshot: (snapshot: Snapshot) => void;
}) {
  const snapshot = useChatInputReasoningEffortSelection(availableEfforts, agentId);

  useEffect(() => onSnapshot(snapshot), [onSnapshot, snapshot]);
  return null;
}
