import type { LucideIconComponent } from '@cherrystudio/app-icons';
import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import CropIcon from '@cherrystudio/app-icons/icons/crop';
import EyeIcon from '@cherrystudio/app-icons/icons/eye';
import FlipHorizontalIcon from '@cherrystudio/app-icons/icons/flip-horizontal';
import FlipVerticalIcon from '@cherrystudio/app-icons/icons/flip-vertical';
import RedoIcon from '@cherrystudio/app-icons/icons/redo-2';
import RotateCwIcon from '@cherrystudio/app-icons/icons/rotate-cw';
import SlidersHorizontalIcon from '@cherrystudio/app-icons/icons/sliders-horizontal';
import UndoIcon from '@cherrystudio/app-icons/icons/undo-2';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { Image } from '../image';
import { ActionMenu } from '../menu';
import { fitCrop, INITIAL_IMAGE_EDIT, mirrorImageEdit, rotateImageEdit } from './crop-geometry';
import { ImageAdjustmentSlider } from './image-adjustment-slider';
import { ImageCropCanvas } from './image-crop-canvas';
import type { ImageEdit, ImageEditGeometry, ImageEditorLabels } from './image-editor.types';

type Tool = 'aspect' | 'direction' | 'perspective';
type Aspect =
  | 'free'
  | 'original'
  | 'screen'
  | 'screenLandscape'
  | '1:1'
  | '3:4'
  | '4:3'
  | '9:16'
  | '16:9';
type Snapshot = { edit: ImageEdit; aspect: Aspect };
const INITIAL_SNAPSHOT: Snapshot = { edit: INITIAL_IMAGE_EDIT, aspect: 'free' };
const ASPECTS: readonly Aspect[] = [
  'free',
  'original',
  'screen',
  'screenLandscape',
  '1:1',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
];
const QUICK_ASPECTS: readonly Aspect[] = ['free', 'original', '1:1', '3:4', '16:9'];
const TOOLS = [
  { value: 'aspect', Icon: CropIcon },
  { value: 'direction', Icon: RotateCwIcon },
  { value: 'perspective', Icon: SlidersHorizontalIcon },
] as const;
const ROTATED_ASPECTS: Record<Aspect, Aspect> = {
  free: 'free',
  original: 'original',
  screen: 'screenLandscape',
  screenLandscape: 'screen',
  '1:1': '1:1',
  '3:4': '4:3',
  '4:3': '3:4',
  '9:16': '16:9',
  '16:9': '9:16',
};

/** Local editing and history; the caller supplies the geometry shared with its pixel writer. */
export function ImageEditor({
  uri,
  labels,
  getGeometry,
  isSaving = false,
  onCancel,
  onSubmit,
  onError,
}: {
  uri: string;
  labels: ImageEditorLabels;
  getGeometry: (edit: ImageEdit, source: { width: number; height: number }) => ImageEditGeometry;
  isSaving?: boolean;
  onCancel: () => void;
  onSubmit: (edit: ImageEdit) => void;
  onError: () => void;
}) {
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [history, setHistory] = useState({
    past: [] as Snapshot[],
    present: INITIAL_SNAPSHOT,
    future: [] as Snapshot[],
  });
  const [preview, setPreview] = useState<ImageEdit | null>(null);
  const [tool, setTool] = useState<Tool>('aspect');
  const [isComparing, setIsComparing] = useState(false);
  const screen = useWindowDimensions();
  const { aspect } = history.present;
  const edit = preview ?? history.present.edit;
  const geometry = sourceSize ? getGeometry(edit, sourceSize) : null;
  const ready =
    sourceSize !== null && geometry !== null && viewport.width > 0 && viewport.height > 0;
  const disabled = isSaving || !ready;
  const actionDisabled = disabled || isComparing || preview !== null;
  const dirty = JSON.stringify(edit) !== JSON.stringify(INITIAL_IMAGE_EDIT);
  const aspectRatio = (nextAspect: Aspect, nextEdit: ImageEdit): number | undefined => {
    if (nextAspect === 'free' || !sourceSize) return undefined;
    if (nextAspect === 'original')
      return nextEdit.rotation % 180 === 0
        ? sourceSize.width / sourceSize.height
        : sourceSize.height / sourceSize.width;
    if (nextAspect === 'screen')
      return Math.min(screen.width, screen.height) / Math.max(screen.width, screen.height);
    if (nextAspect === 'screenLandscape')
      return Math.max(screen.width, screen.height) / Math.min(screen.width, screen.height);
    const [width, height] = nextAspect.split(':').map(Number);
    return width / height;
  };
  const constrain = (nextEdit: ImageEdit, nextAspect: Aspect, useFullBounds = false): ImageEdit => {
    if (!sourceSize) return nextEdit;
    const nextGeometry = getGeometry(nextEdit, sourceSize);
    const ratio = aspectRatio(nextAspect, nextEdit);
    return {
      ...nextEdit,
      crop: fitCrop(
        useFullBounds ? nextGeometry.bounds : nextEdit.crop,
        nextGeometry.bounds,
        ratio ? (ratio * nextGeometry.height) / nextGeometry.width : undefined,
      ),
    };
  };
  const commit = (nextEdit: ImageEdit, nextAspect = aspect) => {
    setPreview(null);
    setHistory((current) => {
      const next = { edit: nextEdit, aspect: nextAspect };
      if (JSON.stringify(next) === JSON.stringify(current.present)) return current;
      return { past: [...current.past.slice(-49), current.present], present: next, future: [] };
    });
  };
  const physicalRatio = aspectRatio(aspect, edit);
  const normalizedRatio =
    geometry && physicalRatio ? (physicalRatio * geometry.height) / geometry.width : undefined;
  const quickAspects = QUICK_ASPECTS.includes(aspect)
    ? QUICK_ASPECTS
    : [...QUICK_ASPECTS.slice(0, -1), aspect];
  const aspectLabel = (value: Aspect) =>
    value === 'free' || value === 'original' || value === 'screen' || value === 'screenLandscape'
      ? labels[value]
      : value;

  return (
    <View className="flex-1 bg-background">
      <View className="min-h-14 flex-row items-center gap-3 px-5">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          onPress={onCancel}
          className="min-h-11 min-w-14 justify-center active:opacity-70 disabled:opacity-40"
        >
          <Text className="text-base text-foreground">{labels.cancel}</Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="min-w-0 flex-1 text-center text-sm font-medium text-foreground"
        >
          {labels.title}
        </Text>
        <Pressable
          accessibilityLabel={isSaving ? labels.saving : labels.done}
          accessibilityRole="button"
          accessibilityState={{ disabled: actionDisabled, busy: isSaving }}
          disabled={actionDisabled}
          className="min-h-11 min-w-14 items-end justify-center active:opacity-70 disabled:opacity-40"
          onPress={() => (dirty ? onSubmit(edit) : onCancel())}
        >
          <Text className="text-base font-semibold text-primary">
            {isSaving ? labels.saving : labels.done}
          </Text>
        </Pressable>
      </View>
      <View className="flex-1 px-4 py-1">
        <View
          className="flex-1 items-center justify-center"
          onLayout={({ nativeEvent: { layout } }) =>
            setViewport({ width: layout.width, height: layout.height })
          }
        >
          {ready ? (
            <ImageCropCanvas
              key={uri}
              disabled={isSaving || isComparing}
              edit={edit}
              geometry={geometry}
              ratio={normalizedRatio}
              labels={labels}
              source={{ uri, ...sourceSize }}
              width={viewport.width}
              height={viewport.height}
              onChange={(crop) => commit({ ...edit, crop })}
              onPreview={(crop) => setPreview({ ...history.present.edit, crop })}
              onCancel={() => setPreview(null)}
              onError={onError}
            />
          ) : (
            <>
              <Image
                accessible={false}
                className="absolute inset-0"
                contentFit="contain"
                source={{ uri }}
                onError={onError}
                onLoad={({ source }) => {
                  if (!source.isAnimated && source.width > 0 && source.height > 0)
                    setSourceSize({ width: source.width, height: source.height });
                  else onError();
                }}
              />
              <Text accessibilityLiveRegion="polite" className="text-base text-foreground">
                {labels.loading}
              </Text>
            </>
          )}
          {isComparing ? (
            <View pointerEvents="none" className="absolute inset-0 bg-background">
              <Image
                accessible={false}
                className="h-full w-full"
                contentFit="contain"
                source={{ uri }}
                onError={onError}
              />
            </View>
          ) : null}
        </View>
      </View>
      <View className="flex-row items-center justify-between px-4">
        <View className="flex-row">
          <UtilityAction
            label={labels.undo}
            disabled={actionDisabled || history.past.length === 0}
            onPress={() => {
              setPreview(null);
              setHistory((current) =>
                current.past.length
                  ? {
                      past: current.past.slice(0, -1),
                      present: current.past.at(-1)!,
                      future: [current.present, ...current.future],
                    }
                  : current,
              );
            }}
          >
            <UndoIcon className="size-5 text-foreground" />
          </UtilityAction>
          <UtilityAction
            label={labels.redo}
            disabled={actionDisabled || history.future.length === 0}
            onPress={() => {
              setPreview(null);
              setHistory((current) =>
                current.future.length
                  ? {
                      past: [...current.past, current.present],
                      present: current.future[0],
                      future: current.future.slice(1),
                    }
                  : current,
              );
            }}
          >
            <RedoIcon className="size-5 text-foreground" />
          </UtilityAction>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityLabel={labels.compare}
            accessibilityRole="button"
            accessibilityState={{ disabled: disabled || preview !== null, selected: isComparing }}
            disabled={disabled || preview !== null}
            onPressIn={() => setIsComparing(true)}
            onPressOut={() => setIsComparing(false)}
            className={
              isComparing
                ? 'size-11 items-center justify-center rounded-full bg-secondary active:opacity-70 disabled:opacity-40'
                : 'size-11 items-center justify-center active:opacity-70 disabled:opacity-40'
            }
          >
            <EyeIcon className="size-5 text-muted-foreground" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: actionDisabled || !dirty }}
            disabled={actionDisabled || !dirty}
            onPress={() => commit(INITIAL_IMAGE_EDIT, 'free')}
            className="min-h-11 min-w-11 items-center justify-center px-1 active:opacity-70 disabled:opacity-40"
          >
            <Text className="text-xs text-muted-foreground">{labels.reset}</Text>
          </Pressable>
        </View>
      </View>
      <View className="gap-1 px-5 py-1">
        {tool === 'aspect' ? (
          <View className="flex-row items-center justify-between gap-1">
            {quickAspects.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: aspect === value, disabled: actionDisabled }}
                disabled={actionDisabled}
                className={
                  aspect === value
                    ? 'min-h-11 min-w-11 shrink items-center justify-center rounded-xl bg-secondary px-2 active:opacity-70 disabled:opacity-40'
                    : 'min-h-11 min-w-11 shrink items-center justify-center rounded-xl px-2 active:opacity-70 disabled:opacity-40'
                }
                onPress={() => commit(constrain(edit, value, value !== 'free'), value)}
              >
                <Text
                  className={
                    aspect === value
                      ? 'text-center text-xs font-medium text-foreground'
                      : 'text-center text-xs text-muted-foreground'
                  }
                >
                  {aspectLabel(value)}
                </Text>
              </Pressable>
            ))}
            <ActionMenu
              items={
                actionDisabled
                  ? []
                  : ASPECTS.map((value) => ({
                      id: value,
                      label: aspectLabel(value),
                      checked: aspect === value,
                      disabled: actionDisabled,
                      onPress: () => commit(constrain(edit, value, value !== 'free'), value),
                    }))
              }
            >
              <Pressable
                accessibilityLabel={labels.aspectRatio}
                accessibilityRole="button"
                accessibilityState={{ disabled: actionDisabled }}
                disabled={actionDisabled}
                className="size-11 items-center justify-center active:opacity-70 disabled:opacity-40"
              >
                <ChevronDownIcon className="size-4 text-muted-foreground" />
              </Pressable>
            </ActionMenu>
          </View>
        ) : (
          <>
            {tool === 'direction' ? (
              <View className="flex-row items-center gap-2">
                <DirectionAction
                  label={labels.rotate}
                  Icon={RotateCwIcon}
                  disabled={actionDisabled}
                  onPress={() => {
                    const nextAspect = ROTATED_ASPECTS[aspect];
                    commit(constrain(rotateImageEdit(edit), nextAspect), nextAspect);
                  }}
                />
                <DirectionAction
                  label={labels.flipHorizontal}
                  Icon={FlipHorizontalIcon}
                  disabled={actionDisabled}
                  selected={edit.flipHorizontal}
                  onPress={() => commit(constrain(mirrorImageEdit(edit, 'horizontal'), aspect))}
                />
                <DirectionAction
                  label={labels.flipVertical}
                  Icon={FlipVerticalIcon}
                  disabled={actionDisabled}
                  selected={edit.flipVertical}
                  onPress={() => commit(constrain(mirrorImageEdit(edit, 'vertical'), aspect))}
                />
              </View>
            ) : null}
            {(tool === 'direction'
              ? (['straighten'] as const)
              : (['horizontal', 'vertical'] as const)
            ).map((field) => (
              <ImageAdjustmentSlider
                key={field}
                label={labels[field]}
                unit={field === 'straighten' ? '°' : ''}
                zeroLabel={labels.zero}
                increaseLabel={labels.increase(labels[field])}
                decreaseLabel={labels.decrease(labels[field])}
                disabled={disabled || isComparing}
                value={edit[field]}
                onPreview={(value) =>
                  setPreview(constrain({ ...history.present.edit, [field]: value }, aspect))
                }
                onCommit={(value) =>
                  commit(constrain({ ...history.present.edit, [field]: value }, aspect))
                }
                onCancel={() => setPreview(null)}
              />
            ))}
          </>
        )}
      </View>
      <View
        accessibilityRole="tablist"
        className="flex-row items-center justify-evenly gap-2 px-5 py-1"
      >
        {TOOLS.map(({ value, Icon }) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={labels[value]}
            accessibilityState={{ selected: tool === value, disabled: actionDisabled }}
            disabled={actionDisabled}
            className={
              tool === value
                ? 'min-h-11 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-secondary px-2 active:opacity-70 disabled:opacity-40'
                : 'min-h-11 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl px-2 active:opacity-70 disabled:opacity-40'
            }
            onPress={() => setTool(value)}
          >
            <Icon
              className={tool === value ? 'size-5 text-foreground' : 'size-5 text-muted-foreground'}
            />
            <Text
              className={
                tool === value
                  ? 'shrink text-center text-xs font-medium text-foreground'
                  : 'shrink text-center text-xs text-muted-foreground'
              }
            >
              {labels[value]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function DirectionAction({
  label,
  Icon,
  disabled,
  selected,
  onPress,
}: {
  label: string;
  Icon: LucideIconComponent;
  disabled: boolean;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      className={
        selected
          ? 'min-h-11 min-w-0 flex-1 flex-row items-center justify-center gap-1 rounded-lg bg-secondary px-1 active:opacity-70 disabled:opacity-40'
          : 'min-h-11 min-w-0 flex-1 flex-row items-center justify-center gap-1 rounded-lg px-1 active:opacity-70 disabled:opacity-40'
      }
    >
      <Icon className="size-5 text-foreground" />
      <Text className="shrink text-center text-xs text-foreground">{label}</Text>
    </Pressable>
  );
}

function UtilityAction({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="size-11 items-center justify-center active:opacity-70 disabled:opacity-40"
    >
      {children}
    </Pressable>
  );
}
