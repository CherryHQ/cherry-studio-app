import { Avatar, Image } from '@cherrystudio/ui/components';
import { type ComponentProps, type ReactNode } from 'react';

import {
  DEFAULT_BRAND_ICON_SCALE,
  getBrandAvatarFallback,
  getBrandAvatarIconDisplayConfig,
} from '../utils/brandAvatarStyles';

type ImageSource = ComponentProps<typeof Image>['source'];

const BRAND_AVATAR_SIZE = 26;
const BRAND_AVATAR_INITIAL_FONT_SIZE = 14;

type BrandAvatarProps = {
  /**
   * What to show inside the frame — usually {@link BrandAvatarIcon} or
   * {@link BrandAvatarPhoto}. Omit it to fall back to `label`'s first character
   * over its generated background color.
   */
  children?: ReactNode;
  label: string;
  size?: number;
  testID?: string;
};

/**
 * Square, hairline-framed brand logo, shared by provider settings and the usage
 * ranking. Sizing lives here so the content components can scale against it.
 */
export function BrandAvatar({
  children,
  label,
  size = BRAND_AVATAR_SIZE,
  testID,
}: BrandAvatarProps) {
  const fallback = children === undefined ? getBrandAvatarFallback(label) : undefined;

  return (
    <Avatar accessibilityLabel={label} shape="rounded" size={size} testID={testID}>
      {fallback ? (
        <Avatar.Fallback
          scale={DEFAULT_BRAND_ICON_SCALE}
          style={{ backgroundColor: fallback.backgroundColor, borderRadius: 5 }}
          textProps={{
            style: { color: fallback.color, fontSize: BRAND_AVATAR_INITIAL_FONT_SIZE },
          }}
        >
          {fallback.initial}
        </Avatar.Fallback>
      ) : (
        children
      )}
    </Avatar>
  );
}

type BrandAvatarIconProps = {
  /**
   * Provider or model id used to pick the inset — logos that already ship their
   * own colored tile are inset further so they do not read as a frame in a frame.
   */
  iconId?: string;
  recyclingKey?: string;
  source: ImageSource;
};

/** Built-in brand logo, inset within the frame. */
export function BrandAvatarIcon({ iconId, recyclingKey, source }: BrandAvatarIconProps) {
  const displayConfig = getBrandAvatarIconDisplayConfig(iconId);

  return (
    <Avatar.Image
      cachePolicy="memory-disk"
      contentFit="contain"
      recyclingKey={recyclingKey}
      scale={displayConfig?.scale ?? DEFAULT_BRAND_ICON_SCALE}
      source={source}
      style={{ borderRadius: displayConfig?.borderRadius }}
    />
  );
}

/** User-supplied avatar, cropped to fill the whole frame. */
export function BrandAvatarPhoto({ uri }: { uri: string }) {
  return (
    <Avatar.Image
      cachePolicy="memory-disk"
      contentFit="cover"
      recyclingKey={uri}
      source={{ uri }}
    />
  );
}
