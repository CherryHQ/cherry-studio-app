import BotIcon from '@cherrystudio/app-icons/icons/bot';
import { Avatar } from '@cherrystudio/ui/components';
import { View } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { CHERRY_AGENT_AVATAR } from '@/shared/data/types/agent';
import { parseSlimeAvatar } from '@/shared/data/types/agentAvatar';

import { getBrandAvatarFallback } from '../utils/brandAvatarStyles';
import { SlimeAvatar } from './SlimeAvatar';

const AGENT_AVATAR_SIZE = 40;
const AGENT_AVATAR_INITIAL_FONT_SIZE = 18;

type AgentAvatarProps = {
  /** Defaults to `name`; pass one explicitly when the name may be blank. */
  accessibilityLabel?: string;
  /** Stored avatar value; slime artwork and built-in emoji need no image URI. */
  avatar?: null | string;
  name: string;
  size?: number;
  testID?: string;
  /** Resolved image URI — an Agent's `avatarUri`, or a draft the user just picked. */
  uri?: null | string;
};

/**
 * Photos and legacy fallbacks use the round Avatar frame. Slime artwork owns its
 * silhouette and renders without a border or circular clipping.
 */
export function AgentAvatar({
  accessibilityLabel,
  avatar,
  name,
  size = AGENT_AVATAR_SIZE,
  testID,
  uri,
}: AgentAvatarProps) {
  const iconColor = useThemeColor('foreground');
  const slime = uri ? null : parseSlimeAvatar(avatar);

  if (slime) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel ?? name}
        accessibilityRole="image"
        className="shrink-0"
        style={{ height: size, width: size }}
        testID={testID}
      >
        <SlimeAvatar parts={slime} size={size} />
      </View>
    );
  }

  const fallback = name.trim() ? getBrandAvatarFallback(name) : undefined;

  return (
    <Avatar accessibilityLabel={accessibilityLabel ?? name} size={size} testID={testID}>
      {uri ? (
        <Avatar.Image
          accessibilityIgnoresInvertColors
          cachePolicy="memory-disk"
          contentFit="cover"
          recyclingKey={uri}
          source={{ uri }}
        />
      ) : avatar === CHERRY_AGENT_AVATAR ? (
        <Avatar.Fallback textProps={{ style: { fontSize: Math.round(size * 0.58) } }}>
          {avatar}
        </Avatar.Fallback>
      ) : fallback ? (
        <Avatar.Fallback
          style={{ backgroundColor: fallback.backgroundColor }}
          textProps={{
            style: {
              color: fallback.color,
              fontSize: (size * AGENT_AVATAR_INITIAL_FONT_SIZE) / AGENT_AVATAR_SIZE,
            },
          }}
        >
          {fallback.initial}
        </Avatar.Fallback>
      ) : (
        <Avatar.Fallback>
          <BotIcon color={iconColor} size={Math.round(size * 0.5)} />
        </Avatar.Fallback>
      )}
    </Avatar>
  );
}
