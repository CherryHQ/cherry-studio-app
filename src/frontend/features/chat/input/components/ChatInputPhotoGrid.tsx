import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { ChevronLeftIcon, ImagesIcon, InfoIcon } from 'lucide-uniwind/png';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Image } from '@/frontend/components/nativePrimitives';

import {
  CHAT_INPUT_PHOTO_SELECTION_LIMIT,
  type ChatInputPhotoPickerActions,
  type ChatInputPhotoPickerState,
  type ChatInputPhotoPreview,
} from '../hooks/useChatInputPhotoPicker';
import { CameraControlButton } from './CameraControlButton/CameraControlButton';
import { ChatInputMediaControlOverlay } from './ChatInputMediaControlOverlay';
import { ChatInputSelectedPhotoBar } from './ChatInputSelectedPhotoBar';

const PHOTO_GRID_COLUMN_COUNT = 3;
const PHOTO_GRID_GAP = 2;
const PHOTO_GRID_DRAW_DISTANCE = 360;
const PHOTO_SELECTION_TIMING = { duration: 180 };

function photoKeyExtractor(item: ChatInputPhotoPreview) {
  return item.id;
}
const PHOTO_PRESS_IN_TIMING = { duration: 80 };
const PHOTO_PRESS_OUT_TIMING = { duration: 140 };
const PHOTO_CELL_ACCESSIBILITY_ACTIONS = [{ name: 'activate' as const }];

type ChatInputPhotoGridProps = {
  actions: ChatInputPhotoPickerActions;
  bottomInset: number;
  onBack: () => void;
  onConfirm: () => void;
  onError: (message: string) => void;
  state: ChatInputPhotoPickerState;
  /** The grid's own width, which is no longer the window's — it lives in the ＋ menu. */
  width: number;
};

type ChatInputPhotoGridExtraData = {
  isSelectionFull: boolean;
  selectedPhotoOrder: ReadonlyMap<string, number>;
};

type ChatInputPhotoCellProps = {
  accessibilityLabel: string;
  isDisabled: boolean;
  isSelected: boolean;
  item: ChatInputPhotoPreview;
  onToggle: (photoId: string) => void;
  selectionIndex: number;
};

const ChatInputPhotoCell = memo(function ChatInputPhotoCell({
  accessibilityLabel,
  isDisabled,
  isSelected,
  item,
  onToggle,
  selectionIndex,
}: ChatInputPhotoCellProps) {
  const pressProgress = useSharedValue(1);
  const selectionProgress = useSharedValue(isSelected ? 1 : 0);
  const appliedSelectionRef = useRef(isSelected);
  const previousItemIdRef = useRef(item.id);

  useLayoutEffect(() => {
    if (previousItemIdRef.current === item.id) {
      return;
    }

    previousItemIdRef.current = item.id;
    appliedSelectionRef.current = isSelected;
    selectionProgress.set(isSelected ? 1 : 0);
  }, [isSelected, item.id, selectionProgress]);

  useEffect(() => {
    if (appliedSelectionRef.current === isSelected) {
      return;
    }

    appliedSelectionRef.current = isSelected;
    selectionProgress.set(withTiming(isSelected ? 1 : 0, PHOTO_SELECTION_TIMING));
  }, [isSelected, selectionProgress]);

  const imageStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(selectionProgress.value, [0, 1], [0, 12]),
    transform: [
      {
        scale:
          pressProgress.value *
          interpolate(selectionProgress.value, [0, 1], [1, 0.88], Extrapolation.CLAMP),
      },
    ],
  }));

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(selectionProgress.value, [0, 0.35, 1], [0, 1, 1], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(selectionProgress.value, [0, 1], [0.4, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  const handlePress = useCallback(() => {
    if (isDisabled) {
      return;
    }

    onToggle(item.id);
  }, [isDisabled, item.id, onToggle]);

  const pressGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(!isDisabled)
        .onBegin(() => {
          pressProgress.value = withTiming(0.94, PHOTO_PRESS_IN_TIMING);
        })
        .onFinalize(() => {
          pressProgress.value = withTiming(1, PHOTO_PRESS_OUT_TIMING);
        })
        .onEnd(() => {
          runOnJS(onToggle)(item.id);
        }),
    [isDisabled, item.id, onToggle, pressProgress],
  );

  return (
    <GestureDetector gesture={pressGesture}>
      <View
        accessibilityActions={PHOTO_CELL_ACCESSIBILITY_ACTIONS}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, selected: isSelected }}
        accessible
        onAccessibilityAction={handlePress}
        style={styles.photoCell}
      >
        <Animated.View style={[styles.photoImageWrapper, imageStyle]}>
          <Image
            cachePolicy="memory-disk"
            contentFit="cover"
            recyclingKey={item.id}
            source={item.uri}
            style={StyleSheet.absoluteFill}
            transition={100}
          />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.selectionBadge, badgeStyle]}>
          <Text
            adjustsFontSizeToFit
            className="font-bold text-white text-xs"
            minimumFontScale={0.7}
            numberOfLines={1}
            style={styles.selectionBadgeText}
          >
            {selectionIndex}
          </Text>
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

export function ChatInputPhotoGrid({
  actions,
  bottomInset,
  onBack,
  onConfirm,
  onError,
  state,
  width,
}: ChatInputPhotoGridProps) {
  const { t } = useTranslation();
  const didRequestPermissionRef = useRef(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const {
    addSelectedPhotoPreviews,
    clearSelectedPhotos,
    loadMorePhotoPreviews,
    presentLimitedPhotoPermissionsPicker,
    requestPhotoLibraryPermission,
    togglePhotoSelection,
  } = actions;
  const {
    canAskPhotoPermissionAgain,
    hasNextPhotoPage,
    isPhotoPageLoading,
    photoAccess,
    photoPreviews,
    selectedPhotoCount,
    selectedPhotoOrder,
  } = state;
  // A bad estimate is what makes a long list jump as it scrolls, so this has to
  // be the grid's real width rather than the window's.
  const estimatedItemSize =
    (width - PHOTO_GRID_GAP * (PHOTO_GRID_COLUMN_COUNT - 1)) / PHOTO_GRID_COLUMN_COUNT +
    PHOTO_GRID_GAP;
  const controlsHeight = Math.max(bottomInset, 12) + 60;

  const handleBack = useCallback(() => {
    clearSelectedPhotos();
    onBack();
  }, [clearSelectedPhotos, onBack]);

  const handleConfirm = useCallback(async () => {
    if (selectedPhotoCount === 0 || isConfirming) {
      return;
    }

    setIsConfirming(true);

    try {
      if (await addSelectedPhotoPreviews()) {
        onConfirm();
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }

    setIsConfirming(false);
  }, [addSelectedPhotoPreviews, isConfirming, onConfirm, onError, selectedPhotoCount]);

  const handlePermissionPress = useCallback(() => {
    const request = canAskPhotoPermissionAgain
      ? requestPhotoLibraryPermission()
      : Linking.openSettings();
    void request.catch((error) => {
      onError(error instanceof Error ? error.message : String(error));
    });
  }, [canAskPhotoPermissionAgain, onError, requestPhotoLibraryPermission]);

  const handleLimitedAccessPress = useCallback(() => {
    void presentLimitedPhotoPermissionsPicker().catch((error) => {
      onError(error instanceof Error ? error.message : String(error));
    });
  }, [onError, presentLimitedPhotoPermissionsPicker]);

  const handleEndReached = useCallback(() => {
    if (!hasNextPhotoPage) {
      return;
    }

    void loadMorePhotoPreviews().catch((error) => {
      onError(error instanceof Error ? error.message : String(error));
    });
  }, [hasNextPhotoPage, loadMorePhotoPreviews, onError]);

  const listExtraData = useMemo<ChatInputPhotoGridExtraData>(
    () => ({
      isSelectionFull: selectedPhotoCount >= CHAT_INPUT_PHOTO_SELECTION_LIMIT,
      selectedPhotoOrder,
    }),
    [selectedPhotoCount, selectedPhotoOrder],
  );

  const renderItem = useCallback(
    ({ extraData, item }: LegendListRenderItemProps<ChatInputPhotoPreview>) => {
      const { isSelectionFull, selectedPhotoOrder: photoOrder } =
        extraData as ChatInputPhotoGridExtraData;
      const selectionIndex = photoOrder.get(item.id) ?? 0;

      return (
        <ChatInputPhotoCell
          accessibilityLabel={t('chat.media.photoPreview')}
          isDisabled={selectionIndex === 0 && isSelectionFull}
          isSelected={selectionIndex > 0}
          item={item}
          onToggle={togglePhotoSelection}
          selectionIndex={selectionIndex}
        />
      );
    },
    [t, togglePhotoSelection],
  );

  const listContentStyle = useMemo(
    () => ({
      paddingBottom: controlsHeight,
    }),
    [controlsHeight],
  );

  const listFooter = useMemo(
    () =>
      isPhotoPageLoading && photoPreviews.length > 0 ? (
        <View style={styles.listFooter}>
          <ActivityIndicator />
        </View>
      ) : null,
    [isPhotoPageLoading, photoPreviews.length],
  );

  const shouldShowInitialLoading =
    photoAccess === null || (isPhotoPageLoading && photoPreviews.length === 0);

  useEffect(() => {
    if (photoAccess !== 'none' || !canAskPhotoPermissionAgain || didRequestPermissionRef.current) {
      return;
    }

    didRequestPermissionRef.current = true;
    void requestPhotoLibraryPermission().catch((error) => {
      onError(error instanceof Error ? error.message : String(error));
    });
  }, [canAskPhotoPermissionAgain, onError, photoAccess, requestPhotoLibraryPermission]);

  return (
    <View className="flex-1 bg-background">
      {shouldShowInitialLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : photoAccess === 'none' ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <ImagesIcon className="size-10 text-muted-foreground" strokeWidth={1.5} />
          <Text className="text-center font-semibold text-base text-foreground">
            {t('chat.media.photoPermissionTitle')}
          </Text>
          <Text className="text-center text-muted-foreground text-sm">
            {t('chat.media.photoPermissionDescription')}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="mt-1 rounded-full bg-foreground px-5 py-2.5 active:opacity-70"
            onPress={handlePermissionPress}
          >
            <Text className="font-semibold text-background text-base">
              {canAskPhotoPermissionAgain
                ? t('chat.media.allowPhotos')
                : t('chat.media.openSettings')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <LegendList
          className="flex-1"
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={listContentStyle}
          contentInsetAdjustmentBehavior="never"
          data={photoPreviews}
          drawDistance={PHOTO_GRID_DRAW_DISTANCE}
          estimatedItemSize={estimatedItemSize}
          extraData={listExtraData}
          keyExtractor={photoKeyExtractor}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text className="text-muted-foreground text-sm">{t('chat.media.noPhotos')}</Text>
            </View>
          }
          ListFooterComponent={listFooter}
          numColumns={PHOTO_GRID_COLUMN_COUNT}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.6}
          recycleItems
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
        />
      )}

      {photoAccess === 'limited' ? (
        <View className="absolute top-3 right-3 z-10">
          <CameraControlButton
            accessibilityLabel={t('chat.media.limitedPhotoAccess')}
            icon={InfoIcon}
            onPress={handleLimitedAccessPress}
            sfSymbol="info.circle"
          />
        </View>
      ) : null}

      <ChatInputMediaControlOverlay>
        <View
          className="absolute inset-x-0 flex-row items-center justify-between px-10"
          pointerEvents="box-none"
          style={[styles.controlBar, { bottom: Math.max(bottomInset, 12) }]}
          testID="chat-input-photo-controls"
        >
          <CameraControlButton
            accessibilityLabel={t('common.back')}
            icon={ChevronLeftIcon}
            onPress={handleBack}
            sfSymbol="chevron.left"
          />

          {selectedPhotoCount > 0 ? (
            <ChatInputSelectedPhotoBar
              isLoading={isConfirming}
              selectedPhotoCount={selectedPhotoCount}
              onPress={() => {
                void handleConfirm();
              }}
            />
          ) : null}
        </View>
      </ChatInputMediaControlOverlay>
    </View>
  );
}

const styles = StyleSheet.create({
  columnWrapper: {
    columnGap: PHOTO_GRID_GAP,
    rowGap: PHOTO_GRID_GAP,
  },
  controlBar: {
    height: 52,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
  },
  listFooter: {
    alignItems: 'center',
    height: 56,
    justifyContent: 'center',
  },
  photoCell: {
    aspectRatio: 1,
    width: '100%',
  },
  photoImageWrapper: {
    height: '100%',
    overflow: 'hidden',
    width: '100%',
  },
  selectionBadge: {
    alignItems: 'center',
    backgroundColor: '#0A84FF',
    borderColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 5,
    position: 'absolute',
    right: 8,
    top: 8,
  },
  selectionBadgeText: {
    fontVariant: ['tabular-nums'],
  },
});
