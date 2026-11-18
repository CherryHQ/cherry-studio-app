import { useState } from 'react';
import { v7 as uuidv7 } from 'uuid';

import { ConversationReadError } from '@/frontend/appShell/conversation';
import type { RemoteConversationSession } from '@/frontend/appShell/conversation/remote';

import { type ChatTurn, type ChatTurnNavigator, toChatTurn } from '../components/ChatWorkspace';

export function useRemoteChatTurns(session: RemoteConversationSession | undefined) {
  const [target, setTarget] = useState<{
    session: RemoteConversationSession;
    messageId: string;
    key: string;
  }>();
  const navigator: ChatTurnNavigator | undefined = session?.history.openAround
    ? {
        scope: JSON.stringify([session.scope, session.ref.sessionId]),
        read: (signal) => readRemoteTurns(session, signal),
        jump: (messageId) => setTarget({ session, messageId, key: uuidv7() }),
      }
    : undefined;
  return { navigation: target?.session === session ? target : undefined, navigator };
}

async function readRemoteTurns(session: RemoteConversationSession, signal: AbortSignal) {
  const window = await session.history.openLatest(signal);
  try {
    const turns = new Map<string, ChatTurn>();
    const visited = new Set<string>();
    let page = window.initial;
    while (true) {
      signal.throwIfAborted();
      for (let index = page.items.length - 1; index >= 0; index--) {
        const { display } = page.items[index];
        if (display.role === 'user' && !turns.has(display.id)) {
          turns.set(display.id, toChatTurn(display.id, display.data.parts));
        }
      }
      if (!page.older) return [...turns.values()];
      if (visited.has(page.older))
        throw new ConversationReadError({ code: 'internal', retry: 'none' });
      visited.add(page.older);
      page = await window.read(page.older, signal);
    }
  } finally {
    window.dispose();
  }
}
