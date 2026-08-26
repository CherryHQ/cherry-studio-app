import { Avatar, Image } from '@cherrystudio/ui/components';
import { type ComponentProps, type ReactNode } from 'react';

import {
  DEFAULT_BRAND_ICON_SCALE,
  getBrandAvatarFallback,
  getBrandAvatarIconDisplayConfig,
} from '../utils/brandAvatarStyles';

type ImageSource = ComponentProps<typeof Image>['source'];

const BRAND_AVATAR_SIZE = 26;
const BRAND_AVATAR_FRAME_RADIUS = 6;
const BRAND_AVATAR_INITIAL_FONT_SIZE = 14;

type BrandAvatarProps = {
  /**
   * What to show inside the frame — usually {@link BrandAvatarIcon} or
   * {@link BrandAvatarPhoto}. Omit it to fall back to `label`'s first character
   * over its generated background color.
   */
  children?: ReactNode;
  label: string;
  /**
   * `rounded` is the brand default — a logo reads as a mark, not a face. Editing
   * forms use `circle`, where the avatar is the subject rather than one entry in
   * a list of brands.
   */
  shape?: 'circle' | 'rounded';
  size?: number;
  testID?: string;
};

/**
 * Hairline-framed brand logo, shared by provider settings and the usage
 * ranking. Sizing lives here so the content components can scale against it.
 */
export function BrandAvatar({
  children,
  label,
  shape = 'rounded',
  size = BRAND_AVATAR_SIZE,
  testID,
}: BrandAvatarProps) {
  const fallback = children === undefined ? getBrandAvatarFallback(label) : undefined;
  // Corner radius and the initial's type size are ratios of the default size,
  // not constants: the same avatar is rendered at 26 in lists and at form-hero
  // sizes in the provider form, and a fixed 6pt radius reads as a square there.
  // At the default size these resolve to the plain 6/5/14 they replaced.
  const frameRadius =
    shape === 'circle' ? size / 2 : (size * BRAND_AVATAR_FRAME_RADIUS) / BRAND_AVATAR_SIZE;

  return (
    <Avatar
      accessibilityLabel={label}
      radius={frameRadius}
      shape={shape}
      size={size}
      testID={testID}
    >
      {fallback ? (
        <Avatar.Fallback
          scale={DEFAULT_BRAND_ICON_SCALE}
          style={{ backgroundColor: fallback.backgroundColor, borderRadius: frameRadius - 1 }}
          textProps={{
            style: {
              color: fallback.color,
              fontSize: (size * BRAND_AVATAR_INITIAL_FONT_SIZE) / BRAND_AVATAR_SIZE,
            },
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
