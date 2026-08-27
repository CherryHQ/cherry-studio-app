import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ImageIcon from '@cherrystudio/app-icons/icons/image';
import RotateCcwIcon from '@cherrystudio/app-icons/icons/rotate-ccw';
import {
  Button,
  ContentState,
  Image,
  ImageGenerationLoader,
  Section,
  useAlert,
} from '@cherrystudio/ui/components';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ArtifactPreviewLink } from '@/frontend/components/artifactPreview';
import {
  COMPOSER_PHOTO_SELECTION_LIMIT,
  type ComposerInitialAttachment,
  createPhotoAttachmentDraft,
} from '@/frontend/components/composer/utils/composerAttachments';
import {
  useListBottomInset,
  usePendingDeletionIds,
  useRegisterSelectionSource,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/selection';

import {
  type PaintingGalleryItem,
  usePaintingGalleryEntries,
  usePaintings,
} from './hooks/usePaintings';
import { usePaintingSelectionSource } from './hooks/usePaintingSelectionSource';
import { type PaintingTemplate, PaintingTemplateRow, toPaintingTemplateDraft } from './templates';
import {
  createPaintingDraftHandoff,
  type PaintingDraftHandoff,
} from './utils/paintingDraftHandoff';
import { loadPhotoPreviewPage, type PhotoPreview } from './utils/photoLibrary';

const recentPhotoLimit = 12;
const galleryGap = 6;
const pageEdge = 16;
const galleryContentEdge = pageEdge - galleryGap / 2;

export function DrawingList() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const router = useRouter();
  const { isEditing, selectedIds } = useSelectionState();
  const pendingDeletionIds = usePendingDeletionIds('drawings');
  const { toggleId } = useSelectionActions();
  const selectionSource = usePaintingSelectionSource(isEditing);
  useRegisterSelectionSource('drawings', selectionSource);
  const bottomInset = useListBottomInset();
  const { width: windowWidth } = useWindowDimensions();
  // Mounted means visible now that the gallery owns a whole screen, so photo
  // access is simply always armed here.
  const recentPhotos = useRecentPaintingPhotos(true);
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

  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: bottomInset, paddingHorizontal: galleryContentEdge }),
    [bottomInset],
  );
  const listExtraData = useMemo<DrawingListExtraData>(
    () => ({
      generatingLabel: t('painting.status.generating'),
      interruptedLabel: t('painting.status.interrupted'),
      isEditing,
      label: t('painting.history.item'),
      onToggle: toggleId,
      selectedIds,
      width: columnWidth,
    }),
    [columnWidth, isEditing, selectedIds, t, toggleId],
  );
  const listHeader = useMemo(
    () => (
      <DrawingListHeader
        isEditing={isEditing}
        isHistoryVisible={
          visibleGalleryItems.length > 0 || paintings.isLoading || gallery.isLoading
        }
        isRecentPhotosLoading={recentPhotos.isLoading}
        photos={recentPhotos.photos}
        onRecentPhotoPress={handleRecentPhotoPress}
        onRequestPhotoAccess={requestPhotoAccess}
        onTemplateUse={handleTemplateUse}
        onViewAllPress={handleViewAllPress}
      />
    ),
    [
      gallery.isLoading,
      handleRecentPhotoPress,
      handleTemplateUse,
      handleViewAllPress,
      isEditing,
      paintings.isLoading,
      recentPhotos.isLoading,
      recentPhotos.photos,
      requestPhotoAccess,
      visibleGalleryItems.length,
    ],
  );
  const listEmpty = useMemo(
    () =>
      paintings.isLoading || gallery.isLoading ? (
        <ContentState.Loading className="h-32" />
      ) : (
        <ContentState.Empty
          description={t('painting.history.emptyDescription')}
          icon={
            <ContentState.Icon>
              <ImageIcon className="size-7 text-foreground" />
            </ContentState.Icon>
          }
          layout="page"
          primaryAction={{
            accessibilityLabel: t('painting.history.createNew'),
            children: t('painting.history.createNew'),
            onPress: handleCreatePainting,
            testID: 'painting-history-create',
          }}
          testID="painting-history-empty"
          title={t('painting.history.empty')}
        />
      ),
    [gallery.isLoading, handleCreatePainting, paintings.isLoading, t],
  );
  const listFooter = useMemo(
    () =>
      paintings.isLoadingMore ? (
        <View className="h-16 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : null,
    [paintings.isLoadingMore],
  );
  const listData = paintings.isLoading || gallery.isLoading ? [] : visibleGalleryItems;

  return (
    <View className="flex-1 bg-background">
      <FlashList
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="automatic"
        data={listData}
        extraData={listExtraData}
        getItemType={getDrawingGridItemType}
        keyExtractor={drawingGridItemKeyExtractor}
        ListEmptyComponent={listEmpty}
        ListEmptyComponentStyle={styles.empty}
        ListFooterComponent={listFooter}
        ListHeaderComponent={listHeader}
        ListHeaderComponentStyle={styles.header}
        masonry
        numColumns={2}
        onEndReached={paintings.loadMore}
        onEndReachedThreshold={0.7}
        optimizeItemArrangement
        renderItem={renderDrawingGridItem}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        testID="drawing-home-scroll"
      />
    </View>
  );
}

type DrawingListExtraData = {
  generatingLabel: string;
  interruptedLabel: string;
  isEditing: boolean;
  label: string;
  onToggle: (paintingId: string) => void;
  selectedIds: ReadonlySet<string>;
  width: number;
};

function drawingGridItemKeyExtractor(item: PaintingGalleryItem) {
  return item.key;
}

function getDrawingGridItemType(item: PaintingGalleryItem) {
  return item.kind;
}

function renderDrawingGridItem({ extraData, item }: ListRenderItemInfo<PaintingGalleryItem>) {
  const listData = extraData as DrawingListExtraData;

  return (
    <View className="px-[3px] pb-1.5">
      <DrawingGridItem
        generatingLabel={listData.generatingLabel}
        height={listData.width / item.aspectRatio}
        interruptedLabel={listData.interruptedLabel}
        isEditing={listData.isEditing}
        isSelected={listData.selectedIds.has(item.painting.id)}
        item={item}
        label={listData.label}
        onToggle={listData.onToggle}
        width={listData.width}
      />
    </View>
  );
}

type DrawingListHeaderProps = {
  isEditing: boolean;
  isHistoryVisible: boolean;
  isRecentPhotosLoading: boolean;
  onRecentPhotoPress: (photo: PhotoPreview) => Promise<void>;
  onRequestPhotoAccess: () => Promise<boolean>;
  onTemplateUse: (template: PaintingTemplate) => void;
  onViewAllPress: () => Promise<void>;
  photos: readonly PhotoPreview[];
};

function DrawingListHeader({
  isEditing,
  isHistoryVisible,
  isRecentPhotosLoading,
  onRecentPhotoPress,
  onRequestPhotoAccess,
  onTemplateUse,
  onViewAllPress,
  photos,
}: DrawingListHeaderProps) {
  const { t } = useTranslation();

  return (
    <>
      {isEditing ? null : (
        <>
          <View className="pb-5 pt-2">
            <Section.Header className="h-10 px-4" title={t('painting.photos.title')}>
              <Button
                accessibilityLabel={t('painting.photos.viewAll')}
                className="min-h-10 px-1 py-0"
                onPress={() => void onViewAllPress()}
                size="xs"
                testID="painting-photos-view-all"
                variant="ghost"
              >
                <Button.Label numberOfLines={1}>{t('painting.photos.viewAll')}</Button.Label>
              </Button>
            </Section.Header>
            {isRecentPhotosLoading ? (
              <View className="h-20 items-center justify-center">
                <ActivityIndicator />
              </View>
            ) : photos.length > 0 ? (
              <ScrollView
                contentContainerClassName="gap-2 px-4"
                horizontal
                showsHorizontalScrollIndicator={false}
                testID="painting-recent-photos"
              >
                {photos.map((photo, index) => (
                  <Pressable
                    accessibilityLabel={t('painting.photos.item', { index: index + 1 })}
                    accessibilityRole="button"
                    className="size-20 overflow-hidden rounded-md active:opacity-70"
                    key={photo.id}
                    onPress={() => void onRecentPhotoPress(photo)}
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
                onPress={() => void onRequestPhotoAccess()}
                testID="painting-photos-permission-placeholder"
              >
                <ImageIcon className="size-6 text-foreground-tertiary" />
              </Pressable>
            )}
          </View>

          <PaintingTemplateRow onUseTemplate={onTemplateUse} />
        </>
      )}

      {isHistoryVisible ? (
        <Text className="px-4 pb-3 font-semibold text-foreground text-base">
          {t('painting.history.title')}
        </Text>
      ) : null}
    </>
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
    <ArtifactPreviewLink
      href={{
        pathname: '/paintings/[paintingId]',
        params: { fileEntryId: item.fileEntryId, paintingId: item.painting.id },
      }}
    >
      {tile}
    </ArtifactPreviewLink>
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
        recyclingKey={item.key}
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
      <Text className="text-center font-medium text-muted-foreground text-xs">
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

const styles = StyleSheet.create({
  empty: {
    flexGrow: 1,
  },
  header: {
    marginHorizontal: -galleryContentEdge,
  },
  list: {
    flex: 1,
  },
});
