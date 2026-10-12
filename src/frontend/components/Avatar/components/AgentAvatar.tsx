import { Avatar } from '@cherrystudio/ui/components';

import { CHERRY_AGENT_AVATAR } from '@/shared/data/types/agent';

const AGENT_AVATAR_SIZE = 40;
const EMOJI_FONT_SCALE = 0.58;
const INITIAL_FONT_SCALE = 0.42;

type AgentAvatarProps = {
  /** Defaults to `name`; pass one explicitly when the name may be blank. */
  accessibilityLabel?: string;
  /** Stored avatar value; built-in emoji are rendered without an image URI. */
  avatar?: null | string;
  /** Desktop text/emoji avatar, distinct from a local managed file reference. */
  emoji?: string;
  name: string;
  size?: number;
  testID?: string;
  /** Resolved image URI — an Agent's `avatarUri`, or a draft the user just picked. */
  uri?: null | string;
};

/**
 * Round Agent avatar: resolved image, then a configured emoji, then the name's
 * initial on the neutral fallback fill. A blank name leaves the fill empty.
 */
export function AgentAvatar({
  accessibilityLabel,
  avatar,
  emoji,
  name,
  size = AGENT_AVATAR_SIZE,
  testID,
  uri,
}: AgentAvatarProps) {
  const avatarEmoji = emoji?.trim() || (avatar === CHERRY_AGENT_AVATAR ? avatar : undefined);
  const initial = getInitial(name);

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
      ) : (
        <Avatar.Fallback
          textProps={{
            style: {
              fontSize: Math.round(size * (avatarEmoji ? EMOJI_FONT_SCALE : INITIAL_FONT_SCALE)),
            },
          }}
        >
          {avatarEmoji ?? initial}
        </Avatar.Fallback>
      )}
    </Avatar>
  );
}

/** First grapheme-safe character of the name, uppercased where the script has case. */
function getInitial(name: string) {
  for (const character of name.trim()) {
    return character.toLocaleUpperCase();
  }
  return '';
}
