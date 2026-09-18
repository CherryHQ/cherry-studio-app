import type { RefObject } from 'react';
import type { View } from 'react-native';

import { useMainHeaderAgent } from './MainHeaderAgentLabel';
import { MainHeaderView } from './MainHeaderView/MainHeaderView';

export function MainHeader({ blurTarget }: { blurTarget: RefObject<View | null> }) {
  const { agent, openNewSession } = useMainHeaderAgent();
  return <MainHeaderView agent={agent} blurTarget={blurTarget} onNewChat={openNewSession} />;
}
