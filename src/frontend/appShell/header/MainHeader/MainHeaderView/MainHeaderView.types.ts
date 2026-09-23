import type { RefObject } from 'react';
import type { View } from 'react-native';

import type { Agent } from '@/shared/data/types/agent';

export type MainHeaderViewProps = {
  agent?: Pick<Agent, 'name'> & Partial<Pick<Agent, 'avatar' | 'avatarUri'>> & { emoji?: string };
  blurTarget: RefObject<View | null>;
  onNewChat: () => void;
  onAgentPress?: () => void;
};
