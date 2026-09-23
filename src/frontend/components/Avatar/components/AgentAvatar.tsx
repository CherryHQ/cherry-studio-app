import { Avatar } from '@cherrystudio/ui/components';

import { CHERRY_AGENT_AVATAR } from '@/shared/data/types/agent';

const AGENT_AVATAR_SIZE = 40;

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

/** Round Agent avatar: resolved image, configured emoji, then the shared robot default. */
export function AgentAvatar({
  accessibilityLabel,
  avatar,
  emoji,
  name,
  size = AGENT_AVATAR_SIZE,
  testID,
  uri,
}: AgentAvatarProps) {
  const avatarText = emoji?.trim() || (avatar === CHERRY_AGENT_AVATAR ? avatar : '🤖');

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
        <Avatar.Fallback textProps={{ style: { fontSize: Math.round(size * 0.58) } }}>
          {avatarText}
        </Avatar.Fallback>
      )}
    </Avatar>
  );
}
