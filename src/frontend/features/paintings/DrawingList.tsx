import { CheckIcon, ImageIcon, RotateCcwIcon } from '@cherrystudio/app-icons';
import {
  Button,
  Image,
  ImageGenerationLoader,
  Section,
  useAlert,
} from '@cherrystudio/ui/components';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import {
  COMPOSER_PHOTO_SELECTION_LIMIT,
  type ComposerInitialAttachment,
  createPhotoAttachmentDraft,
} from '@/frontend/components/composer/utils/composerAttachments';
import {
  useMessageListBottomInset,
  useMessagePendingDeletionIds,
  useMessageScope,
  useMessageSelectionActions,
  useMessageSelectionState,
  useRegisterSelectionSource,
} from '@/frontend/components/messageTabs';
import { PaintingZoomLink } from '@/frontend/components/navigation';

import {
  type PaintingGalleryItem,
  usePaintingGalleryEntries,
  usePaintings,
} from './hooks/usePaintings';
import { usePaintingSelectionSource } from './hooks/usePaintingSelectionSource';
import { type PaintingTemplate, PaintingTemplateRow, toPaintingTemplateDraft } from './templates';
import { distributeMasonryItems } from './utils/masonry';
import {
  createPaintingDraftHandoff,
  type PaintingDraftHandoff,
} from './utils/paintingDraftHandoff';
import { loadPhotoPreviewPage, type PhotoPreview } from './utils/photoLibrary';

const recentPhotoLimit = 12;
const galleryGap = 6;
const pageEdge = 16;

export function DrawingList() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const router = useRouter();
  const { scope } = useMessageScope();
  const { isEditing, selectedIds } = useMessageSelectionState();
  const pendingDeletionIds = useMessagePendingDeletionIds('drawings');
  const { toggleId } = useMessageSelectionActions();
  const selectionSource = usePaintingSelectionSource(isEditing && scope === 'drawings');
  useRegisterSelectionSource('drawings', selectionSource);
  const bottomInset = useMessageListBottomInset();
  const { width: windowWidth } = useWindowDimensions();
  const recentPhotos = useRecentPaintingPhotos(scope === 'drawings');
  const requestPhotoAccess = recentPhotos.requestAccess;
  const paintings = usePaintings();
  const gallery = usePaintingGalleryEntries(paintings.paintings);
  const columnWidth = (windowWidth - pageEdge * 2 - galleryGap) / 2;
  const visibleGalleryItems = useMemo(
    () =>
      pendingDeletionIds.size === 0
        ? gallery.items
        : gallery.items.filter((item) => !pendingDeletionIds.has(item.painting.id)),
    [gallery.items, pendingDeletionIds],
  );
  const columns = useMemo(() => distributeMasonryItems(visibleGalleryItems), [visibleGalleryItems]);
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
    (attachments: readonly ComposerInitialAttachment[]) => {
      openPainting({ attachments });
    },
    [openPainting],
  );
  const handleCreatePainting = useCallback(() => {
    router.push('/paintings');
  }, [router]);
  const handleTemplateUse = useCallback(
    (template: PaintingTemplate) => {
      openPainting(toPaintingTemplateDraft(template));
    },
    [openPainting],
  );
  const handleRecentPhotoPress = useCallback(
    async (photo: PhotoPreview) => {
      try {
        const uri = await new MediaLibrary.Asset(photo.id).getUri();
        openPaintingWithAttachments([createPhotoAttachmentDraft({ ...photo, uri })]);
      } catch (error) {
        alert.show({ title: error instanceof Error ? error.message : String(error) });
      }
    },
    [alert, openPaintingWithAttachments],
  );
  const handleViewAllPress = useCallback(async () => {
    try {
      const hasAccess = await requestPhotoAccess();
      if (!hasAccess) {
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        orderedSelection: true,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: 1,
        selectionLimit: COMPOSER_PHOTO_SELECTION_LIMIT,
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
      alert.show({ title: error instanceof Error ? error.message : String(error) });
    }
  }, [alert, openPaintingWithAttachments, requestPhotoAccess]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      // Stable across the edit⇄done flip (see useMessageListBottomInset) so the
      // gallery never reflows on toggle.
      contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomInset }}
      onScroll={({ nativeEvent }) => {
        const distanceToEnd =
          nativeEvent.contentSize.height -
          (nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height);
        if (distanceToEnd < 400) {
          void paintings.loadMore();
        }
      }}
      scrollEventThrottle={160}
      showsVerticalScrollIndicator={false}
      testID="drawing-home-scroll"
    >
      {isEditing ? null : (
        <>
          <View className="pb-5 pt-2">
            <Section.Header className="h-10 px-4" title={t('painting.photos.title')}>
              <Button
                accessibilityLabel={t('painting.photos.viewAll')}
                className="min-h-10 px-1 py-0"
                onPress={() => void handleViewAllPress()}
                size="xs"
                testID="painting-photos-view-all"
                variant="ghost"
              >
                <Button.Label numberOfLines={1}>{t('painting.photos.viewAll')}</Button.Label>
              </Button>
            </Section.Header>
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
                accessibilityLabel={t('painting.photos.requestAccess')}
                accessibilityRole="button"
                className="mx-4 size-20 items-center justify-center rounded-md bg-secondary active:opacity-70"
                onPress={() => void requestPhotoAccess()}
                testID="painting-photos-permission-placeholder"
              >
                <ImageIcon className="size-6 text-foreground-tertiary" />
              </Pressable>
            )}
          </View>

          <PaintingTemplateRow onUseTemplate={handleTemplateUse} />
        </>
      )}

      {visibleGalleryItems.length > 0 || paintings.isLoading || gallery.isLoading ? (
        <Text className="px-4 pb-3 font-semibold text-foreground text-base">
          {t('painting.history.title')}
        </Text>
      ) : null}
      {paintings.isLoading || gallery.isLoading ? (
        <View className="h-32 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : visibleGalleryItems.length === 0 ? (
        <View
          className="min-h-48 flex-1 items-center justify-center gap-4 px-6 pb-24"
          testID="painting-history-empty"
        >
          <Text className="text-center text-base text-foreground">
            {t('painting.history.empty')}
          </Text>
          <Button
            accessibilityLabel={t('painting.history.createNew')}
            onPress={handleCreatePainting}
            testID="painting-history-create"
            variant="default"
          >
            <Button.Label>{t('painting.history.createNew')}</Button.Label>
          </Button>
        </View>
      ) : (
        <View className="flex-row gap-1.5 px-4" testID="painting-history-masonry">
          {namedColumns.map((column) => (
            <View className="flex-1 gap-1.5" key={column.key}>
              {column.items.map((item) => (
                <DrawingGridItem
                  generatingLabel={t('painting.status.generating')}
                  height={columnWidth / item.aspectRatio}
                  interruptedLabel={t('painting.status.interrupted')}
                  isEditing={isEditing}
                  isSelected={selectedIds.has(item.painting.id)}
                  item={item}
                  key={item.key}
                  label={t('painting.history.item')}
                  onToggle={toggleId}
                  width={columnWidth}
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
  generatingLabel: string;
  height: number;
  interruptedLabel: string;
  isEditing: boolean;
  isSelected: boolean;
  item: PaintingGalleryItem;
  label: string;
  onToggle: (paintingId: string) => void;
  width: number;
};

function DrawingGridItem({
  generatingLabel,
  height,
  interruptedLabel,
  isEditing,
  isSelected,
  item,
  label,
  onToggle,
  width,
}: DrawingGridItemProps) {
  const content = renderTileContent({ generatingLabel, height, interruptedLabel, item, width });
  const accessibilityLabel =
    item.kind === 'output'
      ? label
      : item.kind === 'generating'
        ? generatingLabel
        : interruptedLabel;
  // A generating tile is the loader card itself — its own surface, rounding and
  // border. Wrapping that in the placeholder tile would show a card inside a
  // card, so the wrapper only carries the press feedback.
  const surfaceClassName =
    item.kind === 'generating'
      ? 'active:opacity-75'
      : 'overflow-hidden rounded-md bg-secondary active:opacity-75';

  // A Link navigates on tap regardless of onPress, so editing mode must drop
  // the link wrapper entirely to turn taps into selection.
  if (isEditing) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        className={surfaceClassName}
        onPress={() => onToggle(item.painting.id)}
        style={{ height }}
        testID={`painting-history-${item.key}`}
      >
        {content}
        <Animated.View
          className="absolute top-1.5 right-1.5"
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
        >
          {isSelected ? (
            <View className="size-6 items-center justify-center rounded-full bg-foreground">
              <CheckIcon className="size-4 text-background" />
            </View>
          ) : (
            <View className="size-6 rounded-full border-2 border-border-strong bg-constant-black/30" />
          )}
        </Animated.View>
      </Pressable>
    );
  }

  const tile = (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className={surfaceClassName}
      style={{ height }}
      testID={`painting-history-${item.key}`}
    >
      {content}
    </Pressable>
  );

  // A receipt without images has nothing for the viewer to zoom into: tapping
  // it goes back to the composer, which is where its progress — or its retry —
  // lives.
  return item.kind === 'output' ? (
    <PaintingZoomLink fileEntryId={item.fileEntryId} paintingId={item.painting.id}>
      {tile}
    </PaintingZoomLink>
  ) : (
    <Link asChild href={{ pathname: '/paintings', params: { paintingId: item.painting.id } }}>
      {tile}
    </Link>
  );
}

function renderTileContent({
  generatingLabel,
  height,
  interruptedLabel,
  item,
  width,
}: {
  generatingLabel: string;
  height: number;
  interruptedLabel: string;
  item: PaintingGalleryItem;
  width: number;
}) {
  if (item.kind === 'output') {
    return (
      <Image
        cachePolicy="memory-disk"
        contentFit="cover"
        source={item.uri}
        style={{ height: '100%', width: '100%' }}
        transition={120}
      />
    );
  }

  if (item.kind === 'generating') {
    // The tile is already sized to the ratio the request asked for, so the
    // loader fills it outright: the dot field previews the shape of the image
    // being generated instead of a square standing in for it. The tile speaks
    // for the whole item, so the loader is not a second target for it.
    return (
      <ImageGenerationLoader
        accessible={false}
        height={height}
        label={generatingLabel}
        resolution={item.resolution}
        testID={`painting-history-loader-${item.painting.id}`}
        width={width}
      />
    );
  }

  return (
    <View className="flex-1 items-center justify-center gap-1 px-2">
      <RotateCcwIcon className="size-5 text-foreground-tertiary" />
      <Text className="text-center font-medium text-foreground-secondary text-xs">
        {interruptedLabel}
      </Text>
      {item.message ? (
        <Text className="text-center text-foreground-tertiary text-xs" numberOfLines={2}>
          {item.message}
        </Text>
      ) : null}
    </View>
  );
}

function useRecentPaintingPhotos(enabled: boolean) {
  const [isLoading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<PhotoPreview[]>([]);
  const isActiveRef = useRef(false);

  const refresh = useCallback(
    async (requestPermission: boolean) => {
      if (!enabled) {
        return false;
      }

      try {
        let permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
        if (!permission.granted && (requestPermission || permission.canAskAgain)) {
          permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
        }
        const nextPhotos = permission.granted
          ? (await loadPhotoPreviewPage(0)).photoPreviews.slice(0, recentPhotoLimit)
          : [];
        if (isActiveRef.current) {
          setPhotos(nextPhotos);
          setLoading(false);
        }
        return permission.granted;
      } catch {
        if (isActiveRef.current) {
          setPhotos([]);
          setLoading(false);
        }
        return false;
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    isActiveRef.current = true;
    const refreshPhotos = () => void refresh(false);
    queueMicrotask(refreshPhotos);
    const subscription = MediaLibrary.addListener(refreshPhotos);
    return () => {
      isActiveRef.current = false;
      subscription.remove();
    };
  }, [enabled, refresh]);

  const requestAccess = useCallback(() => refresh(true), [refresh]);

  return useMemo(
    () => ({ isLoading: enabled && isLoading, photos, requestAccess }),
    [enabled, isLoading, photos, requestAccess],
  );
}
