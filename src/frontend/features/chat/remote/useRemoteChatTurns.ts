import { useState } from 'react';
import { v7 as uuidv7 } from 'uuid';

import type {
  HistoryPosition,
  HistoryVersion,
  RemoteConversationSession,
} from '@/frontend/appShell/conversation/remote';

import type { ChatTurnNavigator } from '../components/ChatWorkspace';

export function useRemoteChatTurns(
  session: RemoteConversationSession | undefined,
  version: HistoryVersion,
) {
  const [target, setTarget] = useState<{
    session: RemoteConversationSession;
    messageId: string;
    key: string;
    position?: HistoryPosition;
  }>();
  const read = session?.history.readTurns;
  const scope = session ? JSON.stringify([session.scope, session.ref.sessionId]) : '';
  const navigator: ChatTurnNavigator | undefined =
    session && read && session.history.openAround
      ? {
          scope,
          queryKey: ['chat-turns', scope, version],
          numbersFromLatest: true,
          read,
          jump: ({ id, position }) =>
            setTarget({ session, messageId: id, position, key: uuidv7() }),
        }
      : undefined;
  return { navigation: target?.session === session ? target : undefined, navigator };
}
