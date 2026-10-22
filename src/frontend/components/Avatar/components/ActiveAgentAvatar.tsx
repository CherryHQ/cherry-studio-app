import type { CharacterStatus } from '@cherrystudio/character-avatar';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, useSyncExternalStore } from 'react';

import { useBackendModule } from '@/frontend/data';

import { AgentAvatar } from './AgentAvatar';
import { DynamicAvatar } from './DynamicAvatar';

type ActiveAgentAvatarProps = {
  avatar?: string | null;
  name: string;
  sessionId?: string;
  size: number;
  uri?: string | null;
};

/** The session's execution state, reduced to what the character expresses. */
function useSessionCharacterStatus(sessionId?: string): CharacterStatus {
  const agent = useBackendModule('agent');
  const subscribe = useCallback(
    (listener: () => void) =>
      sessionId ? agent.subscribeSessionStatus(sessionId, listener) : () => {},
    [agent, sessionId],
  );
  const getSnapshot = useCallback(
    () => (sessionId ? agent.getSessionStatus(sessionId)?.status : undefined),
    [agent, sessionId],
  );
  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (status === 'running' || status === 'cancelling') return 'running';
  if (status === 'awaiting-approval' || status === 'awaiting-input') return 'waiting';
  if (status === 'completed') return 'completed';
  if (status === 'failed' || status === 'interrupted') return 'failed';
  return 'idle';
}

/** Only the focused conversation's main avatar animates; lists keep their static covers. */
export function ActiveAgentAvatar({ avatar, name, sessionId, size, uri }: ActiveAgentAvatarProps) {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused ? (
    <PlayingAgentAvatar
      key={avatar}
      avatar={avatar}
      name={name}
      sessionId={sessionId}
      size={size}
      uri={uri}
    />
  ) : (
    <AgentAvatar avatar={avatar} name={name} size={size} uri={uri} />
  );
}

function PlayingAgentAvatar({ avatar, name, sessionId, size, uri }: ActiveAgentAvatarProps) {
  const status = useSessionCharacterStatus(sessionId);
  return avatar ? (
    <DynamicAvatar source={avatar} name={name} size={size} coverUri={uri} status={status} />
  ) : null;
}
