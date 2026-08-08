import { CameraIcon, FileIcon, ImagesIcon, type PngIconProps } from 'lucide-uniwind/png';
import { type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text } from 'react-native';

type ChatInputMediaStripProps = {
  children: ReactNode;
};

type MediaTileProps = {
  accessibilityLabel: string;
  icon: ComponentType<PngIconProps>;
  label: string;
  onPress: () => void;
};

export function ChatInputMediaStrip({ children }: ChatInputMediaStripProps) {
  return (
    <ScrollView
      horizontal
      alwaysBounceHorizontal={false}
      contentContainerClassName="gap-3 pr-1"
      showsHorizontalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function ChatInputCameraTile({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();

  return (
    <MediaTile
      accessibilityLabel={t('chat.media.camera')}
      icon={CameraIcon}
      label={t('chat.media.camera')}
      onPress={onPress}
    />
  );
}

export function ChatInputPhotosTile({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();

  return (
    <MediaTile
      accessibilityLabel={t('chat.media.photos')}
      icon={ImagesIcon}
      label={t('chat.media.photos')}
      onPress={onPress}
    />
  );
}

export function ChatInputFileTile({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();

  return (
    <MediaTile
      accessibilityLabel={t('chat.media.file')}
      icon={FileIcon}
      label={t('chat.media.file')}
      onPress={onPress}
    />
  );
}

function MediaTile({ accessibilityLabel, icon: Icon, label, onPress }: MediaTileProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="size-28 items-center justify-center gap-2 rounded-2xl bg-surface-secondary active:opacity-70"
      onPress={onPress}
    >
      <Icon className="size-7 text-foreground" strokeWidth={2} />
      <Text className="font-semibold text-base text-foreground">{label}</Text>
    </Pressable>
  );
}
