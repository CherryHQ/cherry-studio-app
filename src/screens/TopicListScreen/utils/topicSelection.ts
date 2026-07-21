import type { Topic } from '@/data/types/topic';

export function toggleTopicSelection(
  selectedTopicIds: ReadonlySet<string>,
  topicId: string,
): Set<string> {
  const nextSelectedTopicIds = new Set(selectedTopicIds);

  if (nextSelectedTopicIds.has(topicId)) {
    nextSelectedTopicIds.delete(topicId);
  } else {
    nextSelectedTopicIds.add(topicId);
  }

  return nextSelectedTopicIds;
}

export function areAllTopicsSelected(
  selectedTopicIds: ReadonlySet<string>,
  topics: readonly Topic[],
): boolean {
  return topics.length > 0 && topics.every((topic) => selectedTopicIds.has(topic.id));
}

export function getAllTopicIds(topics: readonly Topic[]): Set<string> {
  return new Set(topics.map((topic) => topic.id));
}
