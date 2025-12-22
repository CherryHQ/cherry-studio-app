import { useTopics } from '@/hooks/useTopic'

/**
 * Hook to get the count of topics for an assistant
 *
 * This hook uses the existing useTopics Hook to leverage the caching and subscription
 * mechanism of TopicService. It automatically updates when topics are created,
 * deleted, or modified.
 *
 * Note: Filtering is performed client-side on cached topics for reactive updates.
 *
 * @param assistantId - The ID of the assistant to count topics for (returns 0 if undefined)
 * @returns The current count of topics for the assistant
 */
export function useTopicCount(assistantId: string | undefined): number {
  const { topics } = useTopics()

  if (!assistantId) {
    return 0
  }

  return topics.filter(t => t.assistantId === assistantId).length
}
