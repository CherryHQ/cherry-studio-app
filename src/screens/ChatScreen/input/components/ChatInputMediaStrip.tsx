import { Image } from 'expo-image';
import { CameraIcon, ImagesIcon } from 'lucide-uniwind';
import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import { withUniwind } from 'uniwind';

type ChatInputMediaStripProps = {
  children: ReactNode;
};

type MediaTileProps = {
  accessibilityLabel: string;
  icon: ComponentType<SvgProps>;
  label: string;
  onPress: () => void;
};

type PhotoPreviewTileProps = {
  accessibilityLabel: string;
  onPress: () => void;
  selectionOrder?: number;
  uri: string;
};

type ChatInputPhotoPreviewTileProps = Omit<PhotoPreviewTileProps, 'accessibilityLabel'>;

const mediaTileSize = 112;
const StyledPressable = withUniwind(Pressable);

export function ChatInputMediaStrip({ children }: ChatInputMediaStripProps) {
  return (
    <ScrollView
      horizontal
      alwaysBounceHorizontal={false}
      contentContainerStyle={styles.mediaPreviewContent}
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

export function ChatInputPhotoPreviewTile({
  onPress,
  selectionOrder,
  uri,
}: ChatInputPhotoPreviewTileProps) {
  const { t } = useTranslation();

  return (
    <PhotoPreviewTile
      accessibilityLabel={t('chat.media.photoPreview')}
      selectionOrder={selectionOrder}
      uri={uri}
      onPress={onPress}
    />
  );
}

function MediaTile({ accessibilityLabel, icon: Icon, label, onPress }: MediaTileProps) {
  return (
    <StyledPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="items-center justify-center gap-2 rounded-2xl bg-surface-secondary active:opacity-70"
      onPress={onPress}
      style={styles.mediaTile}
    >
      <Icon className="size-7 text-foreground" strokeWidth={2} />
      <Text className="font-semibold text-base text-foreground">{label}</Text>
    </StyledPressable>
  );
}

function PhotoPreviewTile({
  accessibilityLabel,
  onPress,
  selectionOrder,
  uri,
}: PhotoPreviewTileProps) {
  const isSelected = typeof selectionOrder === 'number';

  return (
    <StyledPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className={[
        'items-center justify-center overflow-hidden rounded-2xl bg-surface-secondary active:opacity-80',
        isSelected ? 'border-[3px]' : '',
      ].join(' ')}
      onPress={onPress}
      style={[styles.mediaTile, isSelected ? styles.photoPreviewTileSelected : null]}
    >
      <Image contentFit="cover" source={{ uri }} style={StyleSheet.absoluteFill} />
      {isSelected ? (
        <View
          className="items-center justify-center rounded-full"
          style={[styles.photoSelectionBadge, styles.photoSelectionBadgeSelected]}
        >
          <Text className="font-semibold text-sm" style={styles.photoSelectionBadgeText}>
            {selectionOrder}
          </Text>
        </View>
      ) : (
        <View
          className="rounded-full"
          style={[styles.photoSelectionBadge, styles.photoSelectionBadgeUnselected]}
        />
      )}
    </StyledPressable>
  );
}

const styles = StyleSheet.create({
  mediaPreviewContent: {
    gap: 12,
    paddingRight: 4,
  },
  mediaTile: {
    height: mediaTileSize,
    width: mediaTileSize,
  },
  photoPreviewTileSelected: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  photoSelectionBadge: {
    height: 20,
    position: 'absolute',
    right: 8,
    top: 8,
    width: 20,
  },
  photoSelectionBadgeSelected: {
    backgroundColor: '#FFFFFF',
  },
  photoSelectionBadgeText: {
    color: '#000000',
  },
  photoSelectionBadgeUnselected: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
});
