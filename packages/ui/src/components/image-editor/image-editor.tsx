import RotateCwIcon from '@cherrystudio/app-icons/icons/rotate-cw';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Image } from '../image';
import { ImagePreviewToolbar } from '../image-preview-toolbar';
import { FULL_IMAGE_CROP, rotateImageEdit } from './crop-geometry';
import { ImageCropCanvas } from './image-crop-canvas';
import type { ImageEdit, ImageEditorLabels } from './image-editor.types';

/** Edits remain local until Done. The caller owns persistence, errors, navigation and insets. */
export function ImageEditor({
  uri,
  labels,
  isSaving = false,
  onCancel,
  onSubmit,
  onError,
}: {
  uri: string;
  labels: ImageEditorLabels;
  isSaving?: boolean;
  onCancel: () => void;
  onSubmit: (edit: ImageEdit) => void;
  onError: () => void;
}) {
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [edit, setEdit] = useState<ImageEdit>({ crop: FULL_IMAGE_CROP, rotation: 0 });
  const [resetCount, setResetCount] = useState(0);
  const ready = sourceSize !== null && viewport.width > 0 && viewport.height > 0;

  return (
    <View className="flex-1 bg-constant-black">
      <View className="flex-row items-center justify-between gap-2 px-4 py-2">
        <EditorAction disabled={isSaving} label={labels.cancel} onPress={onCancel} />
        <Text
          accessibilityRole="header"
          className="shrink text-center text-base font-semibold text-constant-white"
        >
          {labels.title}
        </Text>
        <EditorAction
          disabled={isSaving || !ready}
          label={isSaving ? labels.saving : labels.done}
          onPress={() => {
            if (
              edit.rotation === 0 &&
              edit.crop.x === 0 &&
              edit.crop.y === 0 &&
              edit.crop.width === 1 &&
              edit.crop.height === 1
            )
              onCancel();
            else onSubmit(edit);
          }}
        />
      </View>
      <View className="flex-1 px-6 py-4">
        <View
          className="flex-1 items-center justify-center"
          onLayout={({ nativeEvent: { layout } }) =>
            setViewport({ width: layout.width, height: layout.height })
          }
        >
          {ready ? (
            <ImageCropCanvas
              key={`${uri}:${edit.rotation}:${resetCount}:${viewport.width}:${viewport.height}`}
              disabled={isSaving}
              edit={edit}
              labels={labels}
              source={{ uri, ...sourceSize }}
              width={viewport.width}
              height={viewport.height}
              onChange={(crop) => setEdit((current) => ({ ...current, crop }))}
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
              <Text accessibilityLiveRegion="polite" className="text-base text-constant-white">
                {labels.loading}
              </Text>
            </>
          )}
        </View>
      </View>
      <View className="px-6">
        <Text className="text-center text-sm text-constant-white">{labels.hint}</Text>
      </View>
      <ImagePreviewToolbar>
        <ImagePreviewToolbar.Action
          disabled={isSaving || !ready}
          icon={<RotateCwIcon className="size-6 text-constant-white" />}
          label={labels.rotate}
          onPress={() => setEdit(rotateImageEdit)}
        />
        <ImagePreviewToolbar.Action
          disabled={isSaving || !ready}
          label={labels.reset}
          onPress={() => {
            setEdit({ crop: FULL_IMAGE_CROP, rotation: 0 });
            setResetCount((value) => value + 1);
          }}
        />
      </ImagePreviewToolbar>
    </View>
  );
}

function EditorAction({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="min-h-11 min-w-11 shrink items-center justify-center px-2 active:opacity-70 disabled:opacity-40"
      disabled={disabled}
      onPress={onPress}
    >
      <Text className="text-center text-base font-medium text-constant-white">{label}</Text>
    </Pressable>
  );
}
