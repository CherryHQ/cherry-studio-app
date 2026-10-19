import type { AgentMessageView } from '@/shared/contracts/agent';

import { readQuestionAnswers, selectedLiveMessages, withLiveSiblings } from '../messageTreeView';

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

  test('keeps the answers last read for a question while another answer to it runs', () => {
    const added = message('a1b', 'q1', 'assistant', 'streaming');
    const sibling = { id: 'a1', modelId: null, status: 'success' as const, siblingsGroupId: 0 };
    // Read while the question was settled; the next reading omits its answering turn.
    const read = readQuestionAnswers(
      [persisted[0]!],
      readQuestionAnswers([{ ...persisted[1]!, siblings: [sibling] }]),
    );
    const shown = [persisted[0]!, added];
    const [, answer] = withLiveSiblings(shown, [added], read);
    expect(answer?.siblings).toEqual([
      { id: 'a1', modelId: null, status: 'success', siblingsGroupId: 0 },
      { id: 'a1b', modelId: null, status: 'streaming', siblingsGroupId: 0 },
    ]);
    // A first answer with nothing read before it has no alternatives.
    expect(withLiveSiblings(shown, [added], new Map())).toBe(shown);
  });
});
