import { createContext, type ComponentProps, type ReactNode, use } from 'react';
import { Text, View } from 'react-native';

import { Image } from '@/frontend/components/nativePrimitives';
import {
  DEFAULT_BRAND_ICON_SCALE,
  getBrandAvatarFallback,
  getBrandAvatarIconDisplayConfig,
} from '@/frontend/utils/brandAvatarStyles';

type ImageSource = ComponentProps<typeof Image>['source'];

const BRAND_AVATAR_SIZE = 26;
const BRAND_AVATAR_FRAME_RADIUS = 6;
const BRAND_AVATAR_INITIAL_FONT_SIZE = 14;
const BRAND_AVATAR_FRAME_CLASS_NAME =
  'items-center justify-center overflow-hidden border border-border border-continuous';

const BrandAvatarSizeContext = createContext(BRAND_AVATAR_SIZE);

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
  const fallbackSize = size * DEFAULT_BRAND_ICON_SCALE;
  // Corner radius and the initial's type size are ratios of the default size,
  // not constants: the same avatar is rendered at 26 in lists and at form-hero
  // sizes in the provider form, and a fixed 6pt radius reads as a square there.
  const frameRadius = (size * BRAND_AVATAR_FRAME_RADIUS) / BRAND_AVATAR_SIZE;

  return (
    <BrandAvatarSizeContext value={size}>
      <View
        className={BRAND_AVATAR_FRAME_CLASS_NAME}
        style={{
          borderRadius: frameRadius,
          height: size,
          width: size,
        }}
        testID={testID}
      >
        {fallback ? (
          <View
            className="items-center justify-center"
            style={{
              backgroundColor: fallback.backgroundColor,
              borderRadius: frameRadius - 1,
              height: fallbackSize,
              width: fallbackSize,
            }}
          >
            <Text
              className="font-medium"
              style={{
                color: fallback.color,
                fontSize: (size * BRAND_AVATAR_INITIAL_FONT_SIZE) / BRAND_AVATAR_SIZE,
              }}
            >
              {fallback.initial}
            </Text>
          </View>
        ) : (
          children
        )}
      </View>
    </BrandAvatarSizeContext>
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
  const size = use(BrandAvatarSizeContext);
  const displayConfig = getBrandAvatarIconDisplayConfig(iconId);
  const imageSize = size * (displayConfig?.scale ?? DEFAULT_BRAND_ICON_SCALE);

  return (
    <Image
      cachePolicy="memory-disk"
      contentFit="contain"
      recyclingKey={recyclingKey}
      source={source}
      style={{
        borderRadius: displayConfig?.borderRadius,
        height: imageSize,
        width: imageSize,
      }}
    />
  );
}

/** User-supplied avatar, cropped to fill the whole frame. */
export function BrandAvatarPhoto({ uri }: { uri: string }) {
  const size = use(BrandAvatarSizeContext);

  return (
    <Image
      cachePolicy="memory-disk"
      contentFit="cover"
      recyclingKey={uri}
      source={{ uri }}
      style={{ height: size, width: size }}
    />
  );
}
