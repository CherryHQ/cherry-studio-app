import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatInputReasoningEffort } from '../../utils/chatInputReasoning';
import { useChatInputReasoningEffortSelection } from '../useChatInputReasoningEffortSelection';

type Snapshot = {
  isReasoningEffortSelected: boolean;
  reasoningEffort: ChatInputReasoningEffort;
  selectReasoningEffort: (effort: ChatInputReasoningEffort) => void;
};

describe('useChatInputReasoningEffortSelection', () => {
  test('shows the assistant effort without turning it into a request override', async () => {
    let snapshot: Snapshot | undefined;

    await act(async () => {
      create(
        <Harness
          assistantEffort="high"
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

  test('preserves a user override when the assistant value refreshes', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const renderHarness = (assistantEffort: ReasoningEffortOption) => (
      <Harness
        assistantEffort={assistantEffort}
        availableEfforts={['default', 'low', 'high']}
        onSnapshot={(value) => {
          snapshot = value;
        }}
      />
    );

    await act(async () => {
      renderer = create(renderHarness('low'));
    });
    await act(async () => {
      snapshot?.selectReasoningEffort('high');
    });
    await act(async () => {
      renderer?.update(renderHarness('low'));
    });

    expect(snapshot).toMatchObject({
      isReasoningEffortSelected: true,
      reasoningEffort: 'high',
    });
  });

  test('clears a user override when the selected assistant changes', async () => {
    let snapshot: Snapshot | undefined;
    let renderer: ReactTestRenderer | undefined;
    const renderHarness = (assistantId: string, assistantEffort: ReasoningEffortOption) => (
      <Harness
        assistantEffort={assistantEffort}
        assistantId={assistantId}
        availableEfforts={['default', 'low', 'high']}
        onSnapshot={(value) => {
          snapshot = value;
        }}
      />
    );

    await act(async () => {
      renderer = create(renderHarness('assistant-a', 'low'));
    });
    await act(async () => {
      snapshot?.selectReasoningEffort('high');
    });
    await act(async () => {
      renderer?.update(renderHarness('assistant-b', 'low'));
    });

    expect(snapshot).toMatchObject({
      isReasoningEffortSelected: false,
      reasoningEffort: 'low',
    });
  });
});

function Harness({
  assistantEffort,
  assistantId,
  availableEfforts,
  onSnapshot,
}: {
  assistantEffort: ReasoningEffortOption;
  assistantId?: string;
  availableEfforts: readonly ChatInputReasoningEffort[];
  onSnapshot: (snapshot: Snapshot) => void;
}) {
  const { isReasoningEffortSelected, reasoningEffort, selectReasoningEffort } =
    useChatInputReasoningEffortSelection(availableEfforts, assistantEffort, assistantId);

  useEffect(() => {
    onSnapshot({ isReasoningEffortSelected, reasoningEffort, selectReasoningEffort });
  }, [isReasoningEffortSelected, onSnapshot, reasoningEffort, selectReasoningEffort]);

  return null;
}
