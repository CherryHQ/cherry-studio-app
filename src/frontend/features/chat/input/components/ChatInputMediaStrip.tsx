import { CameraIcon, FileIcon, ImagesIcon, type PngIconProps, XIcon } from 'lucide-uniwind/png';
import { type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type GestureResponderEvent, Pressable, ScrollView, Text, View } from 'react-native';

import { FileTile, ImageTile } from '../../mediaTile';
import type { ChatInputAttachmentDraft } from '../utils/chatInputAttachments';
import { ChatInputAccessoryItem, ChatInputAccessorySection } from './ChatInputAccessory';

type ChatInputMediaStripProps = {
  children: ReactNode;
};

type MediaTileProps = {
  accessibilityLabel: string;
  icon: ComponentType<PngIconProps>;
  label: string;
  onPress: () => void;
};

type PhotoPreviewTileProps = {
  accessibilityLabel: string;
  isSelected?: boolean;
  onPress: () => void;
  selectionIndex?: number;
  uri: string;
};

type ChatInputPhotoPreviewTileProps = Omit<PhotoPreviewTileProps, 'accessibilityLabel'>;

type ChatInputAttachmentPreviewStripProps = {
  attachments: readonly ChatInputAttachmentDraft[];
  onAttachmentPreview: (attachment: ChatInputAttachmentDraft) => void;
  onAttachmentRemove: (attachmentId: string) => void;
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

export function ChatInputPhotoPreviewTile({
  isSelected,
  onPress,
  selectionIndex,
  uri,
}: ChatInputPhotoPreviewTileProps) {
  const { t } = useTranslation();

  return (
    <PhotoPreviewTile
      accessibilityLabel={t('chat.media.photoPreview')}
      isSelected={isSelected}
      selectionIndex={selectionIndex}
      uri={uri}
      onPress={onPress}
    />
  );
}

export function ChatInputAttachmentPreviewStrip({
  attachments,
  onAttachmentPreview,
  onAttachmentRemove,
}: ChatInputAttachmentPreviewStripProps) {
  const hasAttachments = attachments.length > 0;

  return (
    <ChatInputAccessorySection
      className={hasAttachments ? 'p-2' : 'p-0'}
      pointerEvents={hasAttachments ? 'auto' : 'none'}
    >
      <ChatInputMediaStrip>
        {attachments.map((attachment) =>
          attachment.kind === 'image' ? (
            <AttachmentImagePreviewTile
              attachment={attachment}
              key={attachment.id}
              onPreview={() => onAttachmentPreview(attachment)}
              onRemove={() => onAttachmentRemove(attachment.id)}
            />
          ) : (
            <AttachmentFilePreviewTile
              attachment={attachment}
              key={attachment.id}
              onRemove={() => onAttachmentRemove(attachment.id)}
            />
          ),
        )}
      </ChatInputMediaStrip>
    </ChatInputAccessorySection>
  );
}

function MediaTile({ accessibilityLabel, icon: Icon, label, onPress }: MediaTileProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="size-28 items-center justify-center gap-2 rounded-2xl bg-secondary active:opacity-70"
      onPress={onPress}
    >
      <Icon className="size-7 text-foreground" strokeWidth={2} />
      <Text className="font-semibold text-base text-foreground">{label}</Text>
    </Pressable>
  );
}

function PhotoPreviewTile({
  accessibilityLabel,
  isSelected,
  onPress,
  selectionIndex,
  uri,
}: PhotoPreviewTileProps) {
  const isTileSelected = isSelected ?? selectionIndex !== undefined;

  return (
    <ImageTile
      accessibilityLabel={accessibilityLabel}
      accessibilityState={isTileSelected === undefined ? undefined : { selected: isTileSelected }}
      className={isTileSelected ? 'border-2 border-[#007AFF]' : undefined}
      onPress={onPress}
      uri={uri}
    >
      {selectionIndex === undefined ? (
        <EmptySelectionBadge />
      ) : (
        <SelectionIndexBadge selectionIndex={selectionIndex} />
      )}
    </ImageTile>
  );
}

function AttachmentImagePreviewTile({
  attachment,
  onPreview,
  onRemove,
}: {
  attachment: ChatInputAttachmentDraft;
  onPreview: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const accessibilityLabel = attachment.name || t('chat.attachments.image');

  return (
    <ChatInputAccessoryItem accessibilityLabel={accessibilityLabel}>
      <ImageTile accessibilityLabel={accessibilityLabel} onPress={onPreview} uri={attachment.uri} />
      <XBadge onPress={onRemove} />
    </ChatInputAccessoryItem>
  );
}

function AttachmentFilePreviewTile({
  attachment,
  onRemove,
}: {
  attachment: ChatInputAttachmentDraft;
  onRemove: () => void;
}) {
  return (
    <ChatInputAccessoryItem accessibilityLabel={attachment.name}>
      <FileTile name={attachment.name} />
      <XBadge onPress={onRemove} />
    </ChatInputAccessoryItem>
  );
}

function XBadge({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  const handlePress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onPress?.();
  };

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={t('common.remove')}
        accessibilityRole="button"
        className="absolute top-0 right-0 z-[1] size-11 active:opacity-70"
        onPress={handlePress}
      >
        <View className="absolute top-1.5 right-1.5 size-7 items-center justify-center rounded-full bg-white">
          <XIcon className="size-4.5 text-black" strokeWidth={2.5} />
        </View>
      </Pressable>
    );
  }

  return (
    <View className="absolute top-1.5 right-1.5 size-7 items-center justify-center rounded-full bg-white">
      <XIcon className="size-4.5 text-black" strokeWidth={2.5} />
    </View>
  );
}

function EmptySelectionBadge() {
  return (
    <View className="absolute top-2 right-2 size-5 rounded-full border-2 border-white bg-black/20" />
  );
}

function SelectionIndexBadge({ selectionIndex }: { selectionIndex: number }) {
  return (
    <View className="absolute top-2 right-2 size-5 items-center justify-center rounded-full bg-white">
      <Text
        adjustsFontSizeToFit
        className="font-semibold text-black text-xs"
        minimumFontScale={0.7}
        numberOfLines={1}
      >
        {selectionIndex}
      </Text>
    </View>
  );
}
