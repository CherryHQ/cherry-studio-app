import type { AgentMessageView } from '@/shared/contracts/agent';

import { mergeAgentMessageViews } from '../agentMessageProjection';
import {
  type LiveSiblingViews,
  readQuestionAnswers,
  selectedBranchMessages,
  selectedLiveMessages,
  withLiveSiblings,
} from '../messageTreeView';

function message(
  id: string,
  parentId: string | null,
  role: AgentMessageView['role'] = 'assistant',
  status: AgentMessageView['status'] = 'success',
): AgentMessageView {
  return {
    id,
    sessionId: 'session',
    parentId,
    turnId: `turn-${id}`,
    role,
    status,
    parts: [],
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
    createdAt: '2026-10-17T00:00:00.000Z',
    updatedAt: '2026-10-17T00:00:00.000Z',
  };
}

describe('message tree view', () => {
  const persisted = [message('q1', null, 'user'), message('a1', 'q1')];

  test('shows only the live rows on the selected branch', () => {
    const question = message('q2', 'a1', 'user');
    const first = message('a2', 'q2', 'assistant', 'streaming');
    const second = message('b2', 'q2', 'assistant', 'streaming');
    expect(selectedLiveMessages([question, first, second], persisted, 'a2')).toEqual([
      question,
      first,
    ]);
    expect(selectedLiveMessages([question, first, second], persisted, 'b2')).toEqual([
      question,
      second,
    ]);
    // Without a known or loaded leaf, such as a queued answer, nothing is hidden.
    expect(selectedLiveMessages([question, first, second], persisted, undefined)).toHaveLength(3);
    expect(selectedLiveMessages([question, first, second], persisted, 'queued')).toHaveLength(3);
  });

  test('lists parallel answers that are still streaming as siblings', () => {
    const question = message('q2', 'a1', 'user');
    const first = message('a2', 'q2', 'assistant', 'streaming');
    const second = message('b2', 'q2', 'assistant', 'streaming');
    const shown = [...persisted, question, first];
    const [, , , answer] = withLiveSiblings(shown, [question, first, second], new Map());
    expect(answer?.siblings?.map((sibling) => sibling.id)).toEqual(['a2', 'b2']);
    expect(withLiveSiblings(persisted, [question, first], new Map())).toBe(persisted);
  });

  test.each(['pending', 'streaming'] as const)(
    "switches back from a completed steer branch to the original question's %s retry",
    (status) => {
      const [question, first] = persisted;
      const guided = message('guided-question', first.id, 'user');
      const guidedAnswer = message('guided-answer', guided.id);
      const retry = message('retry', question.id, 'assistant', status);
      const live = [question, first, retry];
      // While retry runs, settled history omits its whole turn but retains the steer below it.
      const history = [guided, guidedAnswer];
      const read = readQuestionAnswers([...persisted, ...history]);
      const selected = (leaf: string) =>
        withLiveSiblings(
          selectedBranchMessages(
            mergeAgentMessageViews(history, selectedLiveMessages(live, history, leaf)),
            leaf,
          ),
          live,
          read,
        );

      const original = selected(guidedAnswer.id);
      expect(original.map((row) => row.id)).toEqual([
        question.id,
        first.id,
        guided.id,
        guidedAnswer.id,
      ]);
      expect(original[1].siblings?.map((row) => row.id)).toEqual([first.id, retry.id]);
      expect(original[1].siblings?.[1].status).toBe(status);
      expect(selected(retry.id).map((row) => row.id)).toEqual([question.id, retry.id]);
      expect(selected(guidedAnswer.id)).toEqual(original);
    },
  );

  test('restored answers retain their persisted groups without a previously read history page', () => {
    const question = message('q2', 'a1', 'user');
    const first = { ...message('a2', 'q2'), siblingsGroupId: 3 };
    const parallel = { ...message('b2', 'q2'), siblingsGroupId: 3 };
    const retry = { ...message('retry', 'q2', 'assistant', 'streaming'), siblingsGroupId: 0 };
    const live = [question, first, parallel, retry];
    const shown = selectedLiveMessages(live, persisted, first.id);
    expect(shown).toEqual([question, first]);
    const [, answer] = withLiveSiblings(shown, live, new Map());
    expect(answer?.siblings?.map(({ id, siblingsGroupId }) => ({ id, siblingsGroupId }))).toEqual([
      { id: 'a2', siblingsGroupId: 3 },
      { id: 'b2', siblingsGroupId: 3 },
      { id: 'retry', siblingsGroupId: 0 },
    ]);
  });

  test('shows one answer per question until the transcript is read again', () => {
    // History still holds A1 and its follow-up; the live B1 was just selected.
    const followUp = message('q2', 'a1', 'user');
    const live = message('b1', 'q1');
    const merged = [...persisted, live, followUp];
    expect(selectedBranchMessages(merged, 'b1').map((row) => row.id)).toEqual(['q1', 'b1']);
    // An unread selected leaf keeps the first answer rather than two rows for one question.
    expect(selectedBranchMessages(merged, 'unread').map((row) => row.id)).toEqual([
      'q1',
      'a1',
      'q2',
    ]);
    expect(selectedBranchMessages(persisted, 'a1')).toBe(persisted);
  });

  test('keeps the shown answer while only another answer streams text', () => {
    const question = message('q2', 'a1', 'user');
    const first = message('a2', 'q2', 'assistant', 'success');
    const second = message('b2', 'q2', 'assistant', 'streaming');
    const shown = [...persisted, question, first];
    const views: LiveSiblingViews = new WeakMap();
    const [, , , before] = withLiveSiblings(shown, [question, first, second], new Map(), views);
    const streamed = {
      ...second,
      parts: [{ id: 't', type: 'text' as const, text: 'more', state: 'streaming' as const }],
    };
    const [, , , after] = withLiveSiblings(shown, [question, first, streamed], new Map(), views);
    expect(after).toBe(before);
    const settled = { ...second, status: 'success' as const };
    const [, , , changed] = withLiveSiblings(shown, [question, first, settled], new Map(), views);
    expect(changed).not.toBe(before);
  });

  test.each(['pending', 'streaming'] as const)(
    'selects an added %s answer with cards before history refreshes',
    (status) => {
      const added = message('a1b', 'q1', 'assistant', status);
      // A lone persisted answer has no siblings field until another answer is saved.
      const read = readQuestionAnswers(persisted);
      const selected = selectedBranchMessages([...persisted, added], added.id);
      const shown = withLiveSiblings(selected, [added], read);
      expect(shown.map((row) => row.id)).toEqual(['q1', 'a1b']);
      expect(shown[1]?.siblings).toEqual([
        { id: 'a1', modelId: null, status: 'success', siblingsGroupId: 0 },
        { id: 'a1b', modelId: null, status, siblingsGroupId: 0 },
      ]);
      // Settled history then omits the answering turn; the cards must stay present.
      expect(
        withLiveSiblings(selected, [added], readQuestionAnswers([persisted[0]!], read)),
      ).toEqual(shown);
      // A first answer with nothing read before it has no alternatives.
      expect(withLiveSiblings(selected, [added], new Map())).toBe(selected);
    },
  );
});
