import { cn } from 'heroui-native/utils';
import { CameraIcon, FileIcon, ImagesIcon, type PngIconProps, XIcon } from 'lucide-uniwind/png';
import { type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type GestureResponderEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from '@/components/uniwind';
import {
  ChatInputAccessoryItem,
  ChatInputAccessorySection,
} from '@/screens/ChatScreen/input/components/ChatInputAccessory';
import type { ChatInputAttachmentDraft } from '@/screens/ChatScreen/input/utils/chatInputAttachments';
import { getChatInputFileExtension } from '@/screens/ChatScreen/input/utils/chatInputAttachments';

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

type ImagePreviewTileProps = {
  accessibilityLabel: string;
  badge?: ReactNode;
  isSelected?: boolean;
  onPress: () => void;
  shouldFillParent?: boolean;
  uri: string;
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
      className="size-28 items-center justify-center gap-2 rounded-2xl bg-surface-secondary active:opacity-70"
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
    <ImagePreviewTile
      accessibilityLabel={accessibilityLabel}
      badge={
        selectionIndex === undefined ? (
          <EmptySelectionBadge />
        ) : (
          <SelectionIndexBadge selectionIndex={selectionIndex} />
        )
      }
      isSelected={isTileSelected}
      onPress={onPress}
      uri={uri}
    />
  );
}

function ImagePreviewTile({
  accessibilityLabel,
  badge,
  isSelected,
  onPress,
  shouldFillParent,
  uri,
}: ImagePreviewTileProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={isSelected === undefined ? undefined : { selected: isSelected }}
      className={cn(
        'items-center justify-center overflow-hidden rounded-2xl bg-surface-secondary active:opacity-80',
        shouldFillParent ? 'absolute inset-0' : 'size-28',
        isSelected && 'border-2 border-[#007AFF]',
      )}
      onPress={onPress}
    >
      <Image
        cachePolicy="memory-disk"
        className="absolute inset-0"
        contentFit="cover"
        source={uri}
      />
      {badge}
    </Pressable>
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

  return (
    <ChatInputAccessoryItem
      className="size-28 items-center justify-center overflow-hidden rounded-2xl bg-surface-secondary"
      accessibilityLabel={attachment.name || t('chat.attachments.image')}
    >
      <ImagePreviewTile
        accessibilityLabel={attachment.name || t('chat.attachments.image')}
        onPress={onPreview}
        shouldFillParent
        uri={attachment.uri}
      />
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
  const extension = getChatInputFileExtension(attachment.name);

  return (
    <ChatInputAccessoryItem
      className="size-28 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-surface-secondary px-3"
      accessibilityLabel={attachment.name}
    >
      <FileIcon className="size-8 text-default-foreground" strokeWidth={2} />
      {extension ? (
        <Text className="font-semibold text-accent text-xs" numberOfLines={1}>
          {extension}
        </Text>
      ) : null}
      <Text className="text-center text-default-foreground text-xs" numberOfLines={2}>
        {attachment.name}
      </Text>
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
        <View className="absolute top-2 right-2 size-5 items-center justify-center rounded-full bg-white">
          <XIcon className="size-3.5 text-black" strokeWidth={2.5} />
        </View>
      </Pressable>
    );
  }

  return (
    <View className="absolute top-2 right-2 size-5 items-center justify-center rounded-full bg-white">
      <XIcon className="size-3.5 text-black" strokeWidth={2.5} />
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
