import ImageIcon from '@cherrystudio/app-icons/icons/image';
import RotateCcwIcon from '@cherrystudio/app-icons/icons/rotate-ccw';
import {
  Button,
  ContentState,
  Image,
  ImageGenerationLoader,
  SelectionIndicator,
  Section,
  Spinner,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ArtifactPreviewLink } from '@/frontend/components/ArtifactPreview';
import {
  COMPOSER_PHOTO_SELECTION_LIMIT,
  type ComposerInitialAttachment,
  createPhotoAttachmentDraft,
} from '@/frontend/components/Composer/utils/composerAttachments';
import {
  useListBottomInset,
  usePendingDeletionIds,
  useRegisterSelectionSource,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/Selection';
import {
  type PaintingGalleryItem,
  usePaintingGalleryEntries,
  usePaintings,
} from '@/frontend/data/paintings/usePaintings';
import { createPaintingDraftHandoff } from '@/frontend/utils/paintingDraftHandoff';
import type { PaintingDraftHandoff } from '@/frontend/utils/paintingDraftHandoff';

import { usePaintingSelectionSource } from '../hooks/usePaintingSelectionSource';
import {
  loadPhotoPreviewPage,
  type PhotoPreview,
  shouldRequestPhotoPreviewAccess,
} from '../utils/photoLibrary';
import {
  type PaintingTemplate,
  PaintingTemplateRow,
  toPaintingTemplateDraft,
} from './PaintingTemplates';

const recentPhotoLimit = 12;
const galleryGap = 6;
const pageEdge = 16;
const galleryContentEdge = pageEdge - galleryGap / 2;

export function DrawingList() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const router = useRouter();
  const { isEditing, selectedIds } = useSelectionState();
  const pendingDeletionIds = usePendingDeletionIds('drawings');
  const { toggleId } = useSelectionActions();
  const selectionSource = usePaintingSelectionSource(isEditing);
  useRegisterSelectionSource('drawings', selectionSource);
  const bottomInset = useListBottomInset();
  const { width: windowWidth } = useWindowDimensions();
  // Mounted means visible now that the gallery owns a whole screen. The hook
  // reads existing access immediately, but only requests new access after the
  // user presses the photo placeholder.
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
      } catch {
        toast.show({ label: t('painting.photos.openFailed'), variant: 'danger' });
      }
    },
    [openPaintingWithAttachments, t, toast],
  );
  const handleRequestPhotoAccess = useCallback(async () => {
    const result = await requestPhotoAccess();
    if (result === 'denied') {
      toast.show({ label: t('painting.photos.accessDenied'), variant: 'danger' });
      return;
    }
    if (result !== 'blocked') {
      return;
    }

    alert.confirm({
      confirmLabel: t('settings.permissions.openSystemSettings'),
      description: t('painting.photos.accessRequired'),
      onConfirm: () =>
        Linking.openSettings().catch(() => {
          toast.show({ label: t('painting.photos.openSettingsFailed'), variant: 'danger' });
        }),
      title: t('settings.permissions.accessRequired'),
    });
  }, [alert, requestPhotoAccess, t, toast]);
  const handleViewAllPress = useCallback(async () => {
    try {
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
    } catch {
      toast.show({ label: t('painting.photos.openFailed'), variant: 'danger' });
    }
  }, [openPaintingWithAttachments, t, toast]);

  const contentContainerStyle = useMemo(
    () => ({ paddingBottom: bottomInset, paddingHorizontal: galleryContentEdge }),
    [bottomInset],
  );
  const listExtraData = useMemo<DrawingListExtraData>(
    () => ({
      isEditing,
      onToggle: toggleId,
      selectedIds,
      width: columnWidth,
    }),
    [columnWidth, isEditing, selectedIds, toggleId],
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
        onRequestPhotoAccess={handleRequestPhotoAccess}
        onTemplateUse={handleTemplateUse}
        onViewAllPress={handleViewAllPress}
      />
    ),
    [
      gallery.isLoading,
      handleRecentPhotoPress,
      handleRequestPhotoAccess,
      handleTemplateUse,
      handleViewAllPress,
      isEditing,
      paintings.isLoading,
      recentPhotos.isLoading,
      recentPhotos.photos,
      visibleGalleryItems.length,
    ],
  );
  const listEmpty = useMemo(
    () =>
      paintings.isLoading || gallery.isLoading ? (
        <View className="h-32 justify-center">
          <ContentState.Loading />
        </View>
      ) : (
        <View className="px-8 py-16">
          <ContentState.Empty
            description={t('painting.history.emptyDescription')}
            icon={
              <ContentState.Icon>
                <ImageIcon className="size-7 text-foreground" />
              </ContentState.Icon>
            }
            primaryAction={{
              accessibilityLabel: t('painting.history.createNew'),
              children: t('painting.history.createNew'),
              onPress: handleCreatePainting,
              testID: 'painting-history-create',
            }}
            prominence="prominent"
            testID="painting-history-empty"
            title={t('painting.history.empty')}
          />
        </View>
      ),
    [gallery.isLoading, handleCreatePainting, paintings.isLoading, t],
  );
  const listFooter = useMemo(
    () =>
      paintings.isLoadingMore ? (
        <View className="h-16 items-center justify-center">
          <Spinner
            accessibilityLabel={t('painting.history.loading')}
            accessibilityRole="progressbar"
          />
        </View>
      ) : null,
    [paintings.isLoadingMore, t],
  );
  const listData = paintings.isLoading || gallery.isLoading ? [] : visibleGalleryItems;

  return (
    <View className="flex-1">
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
  isEditing: boolean;
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
        height={listData.width / item.aspectRatio}
        isEditing={listData.isEditing}
        isSelected={listData.selectedIds.has(item.painting.id)}
        item={item}
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
  onRequestPhotoAccess: () => Promise<void>;
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
            <View className="px-4">
              <Section.Header title={t('painting.photos.title')}>
                <Button
                  accessibilityLabel={t('painting.photos.viewAll')}
                  hitSlop={10}
                  onPress={() => void onViewAllPress()}
                  size="inline"
                  testID="painting-photos-view-all"
                  variant="ghost"
                >
                  <Button.Label numberOfLines={1}>{t('painting.photos.viewAll')}</Button.Label>
                </Button>
              </Section.Header>
            </View>
            {isRecentPhotosLoading ? (
              <View className="h-20 items-center justify-center">
                <Spinner
                  accessibilityLabel={t('painting.photos.loading')}
                  accessibilityRole="progressbar"
                />
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
  height: number;
  isEditing: boolean;
  isSelected: boolean;
  item: PaintingGalleryItem;
  onToggle: (paintingId: string) => void;
  width: number;
};

function DrawingGridItem({
  height,
  isEditing,
  isSelected,
  item,
  onToggle,
  width,
}: DrawingGridItemProps) {
  const { t } = useTranslation();
  const statusLabel =
    item.kind === 'generating'
      ? t('painting.status.generating')
      : item.kind === 'interrupted' && item.interruptionReason === 'failed'
        ? t('painting.status.failed')
        : t('painting.status.interrupted');
  const statusHint =
    item.kind === 'interrupted'
      ? t(
          item.interruptionReason === 'failed'
            ? 'painting.status.failedHint'
            : 'painting.status.interruptedHint',
        )
      : undefined;
  const content = renderTileContent({ height, item, statusHint, statusLabel, width });
  const accessibilityLabel =
    item.kind === 'output'
      ? t('painting.outputAccessibility', {
          count: item.outputCount,
          index: item.outputIndex,
          prompt: item.painting.prompt,
        })
      : statusHint
        ? `${statusLabel}. ${statusHint}`
        : statusLabel;
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
          <SelectionIndicator selected={isSelected} variant="overlay" />
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
  height,
  item,
  statusHint,
  statusLabel,
  width,
}: {
  height: number;
  item: PaintingGalleryItem;
  statusHint: string | undefined;
  statusLabel: string;
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
        label={statusLabel}
        resolution={item.resolution}
        testID={`painting-history-loader-${item.painting.id}`}
        width={width}
      />
    );
  }

  return (
    <View className="flex-1 items-center justify-center gap-1 px-2">
      <RotateCcwIcon className="size-5 text-foreground-tertiary" />
      <Text className="text-center font-medium text-muted-foreground text-xs">{statusLabel}</Text>
      {statusHint ? (
        <Text className="text-center text-foreground-tertiary text-xs" numberOfLines={2}>
          {statusHint}
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
    async (isUserInitiated: boolean): Promise<PhotoAccessResult> => {
      if (!enabled) {
        return 'denied';
      }

      try {
        let permission = await MediaLibrary.getPermissionsAsync(false, ['photo']);
        if (shouldRequestPhotoPreviewAccess(permission, isUserInitiated)) {
          permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
        }
        const nextPhotos = permission.granted
          ? (await loadPhotoPreviewPage(0)).photoPreviews.slice(0, recentPhotoLimit)
          : [];
        if (isActiveRef.current) {
          setPhotos(nextPhotos);
          setLoading(false);
        }
        return permission.granted ? 'granted' : permission.canAskAgain ? 'denied' : 'blocked';
      } catch {
        if (isActiveRef.current) {
          setPhotos([]);
          setLoading(false);
        }
        return 'denied';
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

type PhotoAccessResult = 'blocked' | 'denied' | 'granted';

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
