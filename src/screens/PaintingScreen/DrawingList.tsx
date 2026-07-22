import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import { useToast } from 'heroui-native/toast';
import { CheckIcon, ImageIcon } from 'lucide-uniwind/png';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  selectionToolbarGap,
  selectionToolbarHeight,
  useMessageScope,
  useMessageSelectionActions,
  useMessageSelectionState,
  useRegisterSelectionSource,
} from '@/components/messageTabs';
import { Image } from '@/components/nativePrimitives';
import { PaintingZoomLink } from '@/components/navigation';
import { type PaintingGalleryItem, usePaintingGalleryItems, usePaintings } from '@/hooks/paintings';
import {
  CHAT_INPUT_PHOTO_SELECTION_LIMIT,
  type ChatInputPhotoPreview,
  loadPhotoPreviewPage,
} from '@/screens/ChatScreen/input/hooks/useChatInputPhotoPicker';
import {
  type ChatInputAttachmentDraft,
  createPhotoAttachmentDraft,
} from '@/screens/ChatScreen/input/utils/chatInputAttachments';
import { type PaintingTemplate, PaintingTemplateRow, toPaintingTemplateDraft } from './templates';
import { usePaintingSelectionSource } from './usePaintingSelectionSource';
import { distributeMasonryItems } from './utils/masonry';
import {
  createPaintingDraftHandoff,
  type PaintingDraftHandoff,
} from './utils/paintingDraftHandoff';

const recentPhotoLimit = 12;
const galleryGap = 6;
const pageEdge = 16;

export function DrawingList() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { scope } = useMessageScope();
  const { isEditing, selectedIds } = useMessageSelectionState();
  const { toggleId } = useMessageSelectionActions();
  const selectionSource = usePaintingSelectionSource(isEditing && scope === 'drawings');
  useRegisterSelectionSource('drawings', selectionSource);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const recentPhotos = useRecentPaintingPhotos(scope === 'drawings');
  const paintings = usePaintings();
  const gallery = usePaintingGalleryItems(paintings.paintings);
  const columnWidth = (windowWidth - pageEdge * 2 - galleryGap) / 2;
  const columns = useMemo(() => distributeMasonryItems(gallery.data ?? []), [gallery.data]);
  const namedColumns = [
    { items: columns[0], key: 'left' },
    { items: columns[1], key: 'right' },
  ] as const;

  const openPainting = useCallback(
    (payload: PaintingDraftHandoff) => {
      const handoff = createPaintingDraftHandoff(payload);
      router.push({ pathname: '/paintings', params: { handoff } });
    },
    [router],
  );
  const openPaintingWithAttachments = useCallback(
    (attachments: readonly ChatInputAttachmentDraft[]) => {
      openPainting({ attachments });
    },
    [openPainting],
  );
  const handleTemplateUse = useCallback(
    (template: PaintingTemplate) => {
      openPainting(toPaintingTemplateDraft(template));
    },
    [openPainting],
  );
  const handleRecentPhotoPress = useCallback(
    async (photo: ChatInputPhotoPreview) => {
      try {
        const uri = await new MediaLibrary.Asset(photo.id).getUri();
        openPaintingWithAttachments([createPhotoAttachmentDraft({ ...photo, uri })]);
      } catch (error) {
        toast.show({
          label: error instanceof Error ? error.message : String(error),
          variant: 'danger',
        });
      }
    },
    [openPaintingWithAttachments, toast],
  );
  const handleViewAllPress = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);
      if (!permission.granted) {
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        orderedSelection: true,
        quality: 1,
        selectionLimit: CHAT_INPUT_PHOTO_SELECTION_LIMIT,
      });
      if (result.canceled || result.assets.length === 0) {
        return;
      }
      const attachments = result.assets.map((asset) => {
        const attachment = createPhotoAttachmentDraft({
          fileName: asset.fileName ?? undefined,
          id: asset.assetId ?? asset.uri,
          uri: asset.uri,
        });
        return {
          ...attachment,
          mediaType: asset.mimeType ?? attachment.mediaType,
          size: asset.fileSize ?? attachment.size,
        };
      });
      openPaintingWithAttachments(attachments);
    } catch (error) {
      toast.show({
        label: error instanceof Error ? error.message : String(error),
        variant: 'danger',
      });
    }
  }, [openPaintingWithAttachments, toast]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingBottom: isEditing
          ? insets.bottom + selectionToolbarHeight + selectionToolbarGap * 2
          : tabBarHeight + 24,
      }}
      onScroll={({ nativeEvent }) => {
        const distanceToEnd =
          nativeEvent.contentSize.height -
          (nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height);
        if (distanceToEnd < 400) {
          void paintings.loadMore();
        }
      }}
      scrollEventThrottle={160}
      testID="drawing-home-scroll"
    >
      {isEditing ? null : (
        <>
          <View className="pb-5 pt-2">
            <View className="h-10 flex-row items-center justify-between px-4">
              <Text className="font-semibold text-foreground text-base">
                {t('painting.photos.title')}
              </Text>
              <Pressable
                accessibilityLabel={t('painting.photos.viewAll')}
                accessibilityRole="button"
                className="h-10 flex-row items-center px-1 active:opacity-60"
                onPress={() => void handleViewAllPress()}
                testID="painting-photos-view-all"
              >
                <Text className="font-medium text-primary text-sm">
                  {t('painting.photos.viewAll')}
                </Text>
              </Pressable>
            </View>
            {recentPhotos.isLoading ? (
              <View className="h-20 items-center justify-center">
                <ActivityIndicator />
              </View>
            ) : recentPhotos.photos.length > 0 ? (
              <ScrollView
                contentContainerClassName="gap-2 px-4"
                horizontal
                showsHorizontalScrollIndicator={false}
                testID="painting-recent-photos"
              >
                {recentPhotos.photos.map((photo, index) => (
                  <Pressable
                    accessibilityLabel={t('painting.photos.item', { index: index + 1 })}
                    accessibilityRole="button"
                    className="size-20 overflow-hidden rounded-md active:opacity-70"
                    key={photo.id}
                    onPress={() => void handleRecentPhotoPress(photo)}
                    testID={`painting-recent-photo-${index}`}
                  >
                    <Image
                      cachePolicy="memory-disk"
                      contentFit="cover"
                      recyclingKey={photo.id}
                      source={photo.uri}
                      style={{ height: '100%', width: '100%' }}
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Pressable
                accessibilityRole="button"
                className="mx-4 h-20 items-center justify-center rounded-md bg-surface-secondary active:opacity-70"
                onPress={() => void handleViewAllPress()}
              >
                <ImageIcon className="size-6 text-foreground-muted" strokeWidth={1.5} />
              </Pressable>
            )}
          </View>

          <PaintingTemplateRow onUseTemplate={handleTemplateUse} />
        </>
      )}

      <Text className="px-4 pb-3 font-semibold text-foreground text-base">
        {t('painting.history.title')}
      </Text>
      {paintings.isLoading || gallery.isLoading ? (
        <View className="h-32 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (gallery.data?.length ?? 0) === 0 ? (
        <View className="h-32 items-center justify-center gap-2 px-6">
          <ImageIcon className="size-7 text-foreground-muted" strokeWidth={1.5} />
          <Text className="text-default-foreground text-sm">{t('topic.drawings.empty')}</Text>
        </View>
      ) : (
        <View className="flex-row gap-1.5 px-4" testID="painting-history-masonry">
          {namedColumns.map((column) => (
            <View className="flex-1 gap-1.5" key={column.key}>
              {column.items.map((item) => (
                <DrawingGridItem
                  height={columnWidth / item.aspectRatio}
                  isEditing={isEditing}
                  isSelected={selectedIds.has(item.painting.id)}
                  item={item}
                  key={item.key}
                  label={t('painting.history.item')}
                  onToggle={toggleId}
                />
              ))}
            </View>
          ))}
        </View>
      )}
      {paintings.isLoadingMore ? (
        <View className="h-16 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : null}
    </ScrollView>
  );
}

type DrawingGridItemProps = {
  height: number;
  isEditing: boolean;
  isSelected: boolean;
  item: PaintingGalleryItem;
  label: string;
  onToggle: (paintingId: string) => void;
};

function DrawingGridItem({
  height,
  isEditing,
  isSelected,
  item,
  label,
  onToggle,
}: DrawingGridItemProps) {
  const image = (
    <Image
      cachePolicy="memory-disk"
      contentFit="cover"
      source={item.uri}
      style={{ height: '100%', width: '100%' }}
      transition={120}
    />
  );

  // A Link navigates on tap regardless of onPress, so editing mode must drop
  // the PaintingZoomLink wrapper entirely to turn taps into selection.
  if (isEditing) {
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        className="overflow-hidden rounded-md bg-surface-secondary active:opacity-75"
        onPress={() => onToggle(item.painting.id)}
        style={{ height }}
        testID={`painting-history-${item.key}`}
      >
        {image}
        <Animated.View
          className="absolute top-1.5 right-1.5"
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
        >
          {isSelected ? (
            <View className="size-6 items-center justify-center rounded-full bg-primary">
              <CheckIcon className="size-4 text-white" strokeWidth={3} />
            </View>
          ) : (
            <View className="size-6 rounded-full border-2 border-foreground-muted bg-black/30" />
          )}
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <PaintingZoomLink fileEntryId={item.fileEntryId} paintingId={item.painting.id}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        className="overflow-hidden rounded-md bg-surface-secondary active:opacity-75"
        style={{ height }}
        testID={`painting-history-${item.key}`}
      >
        {image}
      </Pressable>
    </PaintingZoomLink>
  );
}

function useRecentPaintingPhotos(enabled: boolean) {
  const [isLoading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<ChatInputPhotoPreview[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let active = true;
    const load = async () => {
      let permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
      if (!permission.granted && permission.canAskAgain) {
        permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
      }
      if (permission.granted) {
        const page = await loadPhotoPreviewPage(0);
        if (active) {
          setPhotos(page.photoPreviews.slice(0, recentPhotoLimit));
        }
      } else if (active) {
        setPhotos([]);
      }
      if (active) {
        setLoading(false);
      }
    };
    void load().catch(() => {
      if (active) {
        setPhotos([]);
        setLoading(false);
      }
    });
    const subscription = MediaLibrary.addListener(() => void load());
    return () => {
      active = false;
      subscription.remove();
    };
  }, [enabled]);

  return { isLoading: enabled && isLoading, photos };
}
