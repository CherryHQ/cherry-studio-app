import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatInputReasoningEffort } from '../../utils/chatInputReasoning';
import { useChatInputReasoningEffortSelection } from '../useChatInputReasoningEffortSelection';

type Snapshot = ReturnType<typeof useChatInputReasoningEffortSelection>;

describe('useChatInputReasoningEffortSelection', () => {
  test('shows the Agent effort without turning it into a local override', async () => {
    let snapshot: Snapshot | undefined;

    await act(async () => {
      create(
        <Harness
          agentEffort="high"
          availableEfforts={['default', 'low', 'high']}
          onSnapshot={(value) => {
            snapshot = value;
          }}
        />,
      );
    });

    expect(snapshot).toMatchObject({
      isReasoningEffortSelected: false,
      reasoningEffort: 'high',
    });
  });

  test('keeps a composer selection when the Agent value refreshes', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const renderHarness = (agentEffort: ReasoningEffortOption) => (
      <Harness
        agentEffort={agentEffort}
        availableEfforts={['default', 'low', 'high']}
        onSnapshot={(value) => {
          snapshot = value;
        }}
      />
    );

    await act(async () => {
      renderer = create(renderHarness('low'));
    });
    await act(async () => snapshot?.selectReasoningEffort('high'));
    await act(async () => renderer?.update(renderHarness('low')));

    expect(snapshot).toMatchObject({
      isReasoningEffortSelected: true,
      reasoningEffort: 'high',
    });
  });

  test('clears a composer selection when the Agent changes', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const renderHarness = (agentId: string, agentEffort: ReasoningEffortOption) => (
      <Harness
        agentEffort={agentEffort}
        agentId={agentId}
        availableEfforts={['default', 'low', 'high']}
        onSnapshot={(value) => {
          snapshot = value;
        }}
      />
    );

    await act(async () => {
      renderer = create(renderHarness('agent-a', 'low'));
    });
    await act(async () => snapshot?.selectReasoningEffort('high'));
    await act(async () => renderer?.update(renderHarness('agent-b', 'low')));

    expect(snapshot).toMatchObject({
      isReasoningEffortSelected: false,
      reasoningEffort: 'low',
    });
  });
});

function Harness({
  agentEffort,
  agentId,
  availableEfforts,
  onSnapshot,
}: {
  agentEffort: ReasoningEffortOption;
  agentId?: string;
  availableEfforts: readonly ChatInputReasoningEffort[];
  onSnapshot: (snapshot: Snapshot) => void;
}) {
  const snapshot = useChatInputReasoningEffortSelection(availableEfforts, agentEffort, agentId);

  useEffect(() => onSnapshot(snapshot), [onSnapshot, snapshot]);
  return null;
}
