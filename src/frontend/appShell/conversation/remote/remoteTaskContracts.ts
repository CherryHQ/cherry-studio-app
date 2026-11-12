import type { RemoteTaskView } from '@/shared/contracts/remoteAgent';

import type { CatalogCursor, CatalogPage, ConversationSummary } from '../contracts';

/** Task metadata reads, independent of conversation creation and message actions. */
export interface RemoteTaskCatalogQueries {
  list(
    cursor: CatalogCursor | undefined,
    signal: AbortSignal,
  ): Promise<CatalogPage<RemoteTaskView>>;
  listSessions(
    taskId: string,
    cursor: CatalogCursor | undefined,
    signal: AbortSignal,
  ): Promise<CatalogPage<ConversationSummary>>;
}
