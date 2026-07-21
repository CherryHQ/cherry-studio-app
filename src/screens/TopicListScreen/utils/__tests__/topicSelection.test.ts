import type { Topic } from '@/data/types/topic';

import { areAllTopicsSelected, getAllTopicIds, toggleTopicSelection } from '../topicSelection';

const topics = [{ id: 'topic-1' }, { id: 'topic-2' }] as Topic[];

describe('topicSelection', () => {
  test('toggles a topic without mutating the current selection', () => {
    const current = new Set(['topic-1']);

    const removed = toggleTopicSelection(current, 'topic-1');
    const added = toggleTopicSelection(current, 'topic-2');

    expect(current).toEqual(new Set(['topic-1']));
    expect(removed).toEqual(new Set());
    expect(added).toEqual(new Set(['topic-1', 'topic-2']));
  });

  test('selects every loaded topic and reports the all-selected state', () => {
    const selected = getAllTopicIds(topics);

    expect(selected).toEqual(new Set(['topic-1', 'topic-2']));
    expect(areAllTopicsSelected(selected, topics)).toBe(true);
    expect(areAllTopicsSelected(new Set(), [])).toBe(false);
  });
});
