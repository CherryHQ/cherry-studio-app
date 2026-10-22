import type { CharacterStatus } from '@cherrystudio/character-avatar';
import { View } from 'react-native';

import { useAvatarResource } from '../hooks/useAvatarResource';
import { AgentAvatar } from './AgentAvatar';
import { CharacterAvatar } from './CharacterAvatar';

type DynamicAvatarProps = {
  source: string;
  name: string;
  size: number;
  status?: CharacterStatus;
  coverUri?: string | null;
};

/** Public renderer; resource internals stay inside the Avatar family. The cover stays beneath. */
export function DynamicAvatar({
  source,
  name,
  size,
  status = 'idle',
  coverUri,
}: DynamicAvatarProps) {
  const resource = useAvatarResource(source);
  const recipe = resource.data?.recipe;
  return (
    <View
      accessible
      accessibilityLabel={name}
      pointerEvents="none"
      style={{ width: size, height: size }}
    >
      <AgentAvatar name={name} size={size} uri={coverUri ?? resource.data?.coverUri} />
      {recipe ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute inset-0"
        >
          <CharacterAvatar recipe={recipe} size={size} status={status} />
        </View>
      ) : null}
    </View>
  );
}
