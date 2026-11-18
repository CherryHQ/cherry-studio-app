import type { RefObject } from 'react';
import { Text, View, type ViewInstance } from 'react-native';

import { ProviderAvatar } from '@/frontend/components/Avatar';

import type { ModelPickerFastScrollAnchor } from '../utils/modelPickerFastScroll';
import { ModelPickerBackdrop } from './ModelPickerBackdrop';

type ModelPickerProviderPreviewProps = {
  anchor: ModelPickerFastScrollAnchor;
  blurTarget: RefObject<ViewInstance | null>;
};

/** A contacts-style identity preview, separate from anchored informational popovers. */
export function ModelPickerProviderPreview({
  anchor,
  blurTarget,
}: ModelPickerProviderPreviewProps) {
  return (
    <View className="w-38 rounded-3xl border border-constant-white/65 border-continuous shadow-md shadow-constant-black/10 dark:border-border dark:shadow-constant-black/25">
      <View className="absolute inset-0 overflow-hidden rounded-3xl border-continuous">
        <ModelPickerBackdrop blurTarget={blurTarget} variant="preview" />
      </View>
      <View className="min-h-36 items-center justify-center gap-3 px-4 py-5">
        <View className="size-12 overflow-hidden rounded-xl border-continuous">
          <ProviderAvatar
            presetProviderId={anchor.provider.presetProviderId}
            providerId={anchor.provider.id}
            providerName={anchor.provider.name}
            shape="rounded"
            size={48}
          />
        </View>
        <Text
          className="w-full text-center font-semibold text-foreground text-lg"
          ellipsizeMode="middle"
          numberOfLines={2}
        >
          {anchor.label}
        </Text>
      </View>
    </View>
  );
}
