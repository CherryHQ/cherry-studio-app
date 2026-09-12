import { Avatar } from '@cherrystudio/ui/components';
import type { IconSource } from '@cherrystudio/ui/icons';
import { createContext, type ReactNode, use } from 'react';
import { useResolveClassNames, useUniwind } from 'uniwind';

import {
  DEFAULT_BRAND_ICON_SCALE,
  getBrandAvatarFallback,
  getBrandAvatarIconDisplayConfig,
} from '../utils/brandAvatarStyles';

const BRAND_AVATAR_SIZE = 26;
const BRAND_AVATAR_INITIAL_FONT_SIZE = 14;
const BrandAvatarShapeContext = createContext<'circle' | 'rounded'>('rounded');

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
  const { borderRadius } = useResolveClassNames('rounded-md');
  const fallback = children === undefined ? getBrandAvatarFallback(label) : undefined;
  const frameRadius =
    shape === 'circle' ? size / 2 : typeof borderRadius === 'number' ? borderRadius : 0;

  return (
    <BrandAvatarShapeContext value={shape}>
      <Avatar
        accessibilityLabel={label}
        radius={frameRadius}
        shape={shape}
        size={size}
        testID={testID}
      >
        {fallback ? (
          <Avatar.Fallback
            style={{ backgroundColor: fallback.backgroundColor }}
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
    </BrandAvatarShapeContext>
  );
}

type BrandAvatarIconProps = {
  /**
   * Provider artwork uses a full-frame tile or an inset mark. Model artwork
   * keeps its original canvas when this context is omitted.
   */
  displayContext?: 'provider';
  recyclingKey?: string;
  source: IconSource;
};

/** Built-in brand artwork sized for its source canvas and enclosing shape. */
export function BrandAvatarIcon({ displayContext, recyclingKey, source }: BrandAvatarIconProps) {
  const shape = use(BrandAvatarShapeContext);
  const { theme } = useUniwind();
  const displayConfig = displayContext ? getBrandAvatarIconDisplayConfig(source, shape) : undefined;

  return (
    <Avatar.Image
      cachePolicy="memory-disk"
      contentFit="contain"
      recyclingKey={recyclingKey}
      scale={displayConfig?.scale ?? DEFAULT_BRAND_ICON_SCALE}
      source={source[theme === 'dark' ? 'dark' : 'light']}
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
