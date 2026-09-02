import BotIcon from '@cherrystudio/app-icons/icons/bot';
import { Avatar } from '@cherrystudio/ui/components';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { getBrandAvatarFallback } from '../utils/brandAvatarStyles';

const AGENT_AVATAR_SIZE = 40;
const AGENT_AVATAR_INITIAL_FONT_SIZE = 18;

type AgentAvatarProps = {
  /** Defaults to `name`; pass one explicitly when the name may be blank. */
  accessibilityLabel?: string;
  name: string;
  size?: number;
  testID?: string;
  /** Resolved image URI — an Agent's `avatarUri`, or a draft the user just picked. */
  uri?: null | string;
};

/**
 * Round avatar for an Agent, with the same generated initial tile providers use
 * (`getBrandAvatarFallback`) — round rather than square because an Agent reads
 * as a persona, not a brand.
 *
 * A blank name falls through to a neutral bot badge instead of an initial: the
 * create form renders this before anything is typed, and the shared fallback's
 * placeholder letter is `P`, from its provider origins.
 */
export function AgentAvatar({
  accessibilityLabel,
  name,
  size = AGENT_AVATAR_SIZE,
  testID,
  uri,
}: AgentAvatarProps) {
  const iconColor = useThemeColor('foreground');
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
