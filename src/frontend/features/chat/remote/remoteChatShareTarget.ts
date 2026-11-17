import type { RemoteConversationSession } from '@/frontend/appShell/conversation/remote';
import { DOCUMENT_EXPORT_MAX_SECTIONS } from '@/shared/contracts/documentExport';

import type { ChatShareTarget } from '../share/chatShareTarget';

export function remoteChatShareTarget(session: RemoteConversationSession): ChatShareTarget {
  return {
    ref: session.ref,
    prepareSelection: (ids, signal) => session.history.prepareSelection(ids, signal),
    readSelectableIds: async (signal) => {
      const window = await session.history.openLatest(signal);
      try {
        const ids: string[] = [];
        let page = window.initial;
        while (true) {
          ids.unshift(
            ...page.items
              .filter(
                (message) =>
                  message.completeness === 'complete' &&
                  message.display.role !== 'system' &&
                  !['pending', 'streaming'].includes(message.state),
              )
              .map((message) => message.key),
          );
          if (!page.older || ids.length > DOCUMENT_EXPORT_MAX_SECTIONS) return ids;
          page = await window.read(page.older, signal);
        }
      } finally {
        window.dispose();
      }
    },
  };
}
