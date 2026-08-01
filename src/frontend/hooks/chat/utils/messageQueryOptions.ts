import { queryKeys } from '@/frontend/data';

import { messageWindowPolicy } from './messageWindowPolicy';

export const initialMessagesPageSize = messageWindowPolicy.initialFetchCount;

export function getMessagesQueryKey(topicId: string) {
  return queryKeys.messages.topic(topicId, {
    limit: initialMessagesPageSize,
  });
}
