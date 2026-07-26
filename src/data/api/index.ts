/**
 * Data API Query Keys Index
 *
 * Combines all domain-specific query key factories into a unified queryKeys object.
 */

import { assistantQueryKeys } from './assistants';
import { mcpServerQueryKeys } from './mcpServers';
import { messageQueryKeys } from './messages';
import { modelQueryKeys } from './models';
import { paintingQueryKeys } from './paintings';
import { pinQueryKeys } from './pins';
import { preferenceQueryKeys } from './preferences';
import { providerQueryKeys } from './providers';
import { tagQueryKeys } from './tags';
import { topicQueryKeys } from './topics';

export { createMobileQueryClient, QueryProvider } from './queryClient';

export const queryKeys = {
  assistants: assistantQueryKeys,
  mcpServers: mcpServerQueryKeys,
  topics: topicQueryKeys,
  messages: messageQueryKeys,
  models: modelQueryKeys,
  paintings: paintingQueryKeys,
  pins: pinQueryKeys,
  providers: providerQueryKeys,
  preferences: preferenceQueryKeys,
  tags: tagQueryKeys,
};
