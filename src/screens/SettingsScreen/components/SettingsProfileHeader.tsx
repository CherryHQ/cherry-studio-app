import { type MenuAction, MenuView, type NativeActionEvent } from '@expo/ui/community/menu';
import { ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import { GlassView } from 'expo-glass-effect';
import type { ImageSource } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useThemeColor } from 'heroui-native/hooks';
import { Input } from 'heroui-native/input';
import { CameraIcon, PencilIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Image } from '@/components/uniwind';
import { isLiquidGlassAvailable } from '@/config/constants';
import { usePreference } from '@/data/hooks';

const avatarSource = require('@/assets/icon.png');
const avatarSize = 72;
const sheetAvatarSize = 104;
const profileSheetSnapPointFraction = 0.6;
// Detent indices into `detents`: 0 closed, 1 open.
const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;

export function SettingsProfileHeader() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = (windowHeight - insets.top - insets.bottom) * profileSheetSnapPointFraction;
  const [userName, setUserName] = usePreference('app.user.name');
  const [sheetIndex, setSheetIndex] = useState(CLOSED_INDEX);
  const [draftName, setDraftName] = useState(userName);
  const [draftAvatarUri, setDraftAvatarUri] = useState<string | null>(null);

  const openSheet = useCallback(() => {
    Keyboard.dismiss();
    setDraftName(userName);
    setDraftAvatarUri(null);
    setSheetIndex(OPEN_INDEX);
  }, [userName]);

  const closeSheet = useCallback(() => {
    setSheetIndex(CLOSED_INDEX);
  }, []);

  const cancelEdit = useCallback(() => {
    Keyboard.dismiss();
    setSheetIndex(CLOSED_INDEX);
  }, []);

  const saveProfile = useCallback(() => {
    Keyboard.dismiss();
    void setUserName(draftName, { optimistic: true }).then(() => {
      setSheetIndex(CLOSED_INDEX);
    });
  }, [draftName, setUserName]);

  return (
    <>
      <Pressable
        accessibilityLabel={t('settings.profile.edit')}
        accessibilityRole="button"
        className="items-center gap-3 active:opacity-70"
        onPress={openSheet}
      >
        <EditableAvatar icon="pencil" size={avatarSize} />
        <Text className="min-h-7 font-semibold text-2xl text-foreground" numberOfLines={1}>
          {userName}
        </Text>
      </Pressable>
      <ModalBottomSheet
        detents={[0, sheetHeight]}
        index={sheetIndex}
        nativeOverlay
        onIndexChange={setSheetIndex}
        onSettle={(nextIndex) => {
          if (nextIndex === CLOSED_INDEX) {
            closeSheet();
          }
        }}
        surface={
          isLiquidGlassAvailable ? (
            <GlassView
              glassEffectStyle="regular"
              style={[StyleSheet.absoluteFill, styles.surfaceGlass]}
            />
          ) : (
            <View className="rounded-t-3xl bg-background" style={StyleSheet.absoluteFill} />
          )
        }
      >
        <View style={[styles.sheetViewport, { height: sheetHeight }]}>
          <SettingsProfileEditor
            draftAvatarUri={draftAvatarUri}
            draftName={draftName}
            onCancel={cancelEdit}
            onDraftAvatarUriChange={setDraftAvatarUri}
            onDraftNameChange={setDraftName}
            onSave={saveProfile}
          />
        </View>
      </ModalBottomSheet>
    </>
  );
}

type SettingsProfileEditorProps = {
  draftAvatarUri: string | null;
  draftName: string;
  onCancel: () => void;
  onDraftAvatarUriChange: (uri: string) => void;
  onDraftNameChange: (name: string) => void;
  onSave: () => void;
};

type AvatarSourceValue = 'camera' | 'photos';

function SettingsProfileEditor({
  draftAvatarUri,
  draftName,
  onCancel,
  onDraftAvatarUriChange,
  onDraftNameChange,
  onSave,
}: SettingsProfileEditorProps) {
  const { t } = useTranslation();
  const borderColor = useThemeColor('border');
  const inputRef = useRef<TextInput>(null);
  const avatarActions = useMemo<MenuAction[]>(
    () => [
      {
        id: 'camera',
        image: 'camera',
        title: t('chat.media.camera'),
      },
      {
        id: 'photos',
        image: 'photo',
        title: t('chat.media.photos'),
      },
    ],
    [t],
  );

  const selectAvatarFromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 1,
    });

    const assetUri = result.canceled ? undefined : result.assets[0]?.uri;
    if (assetUri) {
      onDraftAvatarUriChange(assetUri);
    }
  }, [onDraftAvatarUriChange]);

  const selectAvatarFromPhotoLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 1,
      selectionLimit: 1,
    });

    const assetUri = result.canceled ? undefined : result.assets[0]?.uri;
    if (assetUri) {
      onDraftAvatarUriChange(assetUri);
    }
  }, [onDraftAvatarUriChange]);

  const handleAvatarSourceChange = useCallback(
    (event: NativeActionEvent) => {
      const nextValue = event.nativeEvent.event as AvatarSourceValue;

      if (nextValue === 'camera') {
        void selectAvatarFromCamera();
        return;
      }

      if (nextValue === 'photos') {
        void selectAvatarFromPhotoLibrary();
      }
    },
    [selectAvatarFromCamera, selectAvatarFromPhotoLibrary],
  );
  const blurInput = useCallback(() => {
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  return (
    <View style={styles.sheetContent}>
      <View className="gap-6 px-6" style={styles.sheetForm}>
        <View style={styles.sheetAvatarHeader}>
          <MenuAvatarTrigger
            actions={avatarActions}
            accessibilityLabel={t('settings.profile.changeAvatar')}
            imageSource={draftAvatarUri ? { uri: draftAvatarUri } : undefined}
            onPress={blurInput}
            onPressAction={handleAvatarSourceChange}
            size={sheetAvatarSize}
          />
        </View>
        <View className="gap-2">
          <Text className="font-medium text-foreground text-sm">
            {t('settings.profile.userName')}
          </Text>
          <Input
            accessibilityLabel={t('settings.profile.userName')}
            autoCorrect={false}
            className="rounded-2xl px-4 text-base text-foreground leading-5"
            onChangeText={onDraftNameChange}
            onSubmitEditing={onSave}
            placeholderColorClassName="accent-muted"
            ref={inputRef}
            returnKeyLabel="done"
            returnKeyType="done"
            style={[styles.input, { borderColor }]}
            value={draftName}
          />
        </View>
      </View>
      <View className="items-center gap-4 px-6" style={styles.sheetFooter}>
        <Pressable
          accessibilityLabel={t('common.save')}
          accessibilityRole="button"
          className="items-center justify-center rounded-full bg-foreground px-6 py-1 active:opacity-80"
          onPress={onSave}
        >
          <Text className="font-semibold text-background text-lg">{t('common.save')}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={t('common.cancel')}
          accessibilityRole="button"
          className="px-6 py-1 active:opacity-70"
          onPress={onCancel}
        >
          <Text className="text-foreground text-lg">{t('common.cancel')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type EditableAvatarProps = {
  icon: 'camera' | 'pencil';
  imageSource?: ImageSource | number;
  size: number;
};

function EditableAvatar({ icon, imageSource, size }: EditableAvatarProps) {
  return (
    <View style={{ height: size, width: size }}>
      <AvatarImage imageSource={imageSource} size={size} />
      <AvatarEditBadge icon={icon} size={size} />
    </View>
  );
}

type MenuAvatarTriggerProps = {
  accessibilityLabel: string;
  actions: MenuAction[];
  imageSource?: ImageSource | number;
  onPress: () => void;
  onPressAction: (event: NativeActionEvent) => void;
  size: number;
};

function MenuAvatarTrigger({
  accessibilityLabel,
  actions,
  imageSource,
  onPress,
  onPressAction,
  size,
}: MenuAvatarTriggerProps) {
  return (
    <View
      onStartShouldSetResponderCapture={() => {
        onPress();
        return false;
      }}
      style={{ height: size, width: size }}
    >
      <AvatarImage imageSource={imageSource} size={size} />
      <MenuView actions={actions} onPressAction={onPressAction} style={styles.avatarMenuTrigger}>
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          style={{ height: size, width: size }}
        >
          <AvatarEditBadge icon="camera" size={size} />
        </View>
      </MenuView>
    </View>
  );
}

type AvatarImageProps = {
  imageSource?: ImageSource | number;
  size: number;
};

function AvatarImage({ imageSource, size }: AvatarImageProps) {
  const source = imageSource ?? avatarSource;

  return (
    <Image
      accessibilityIgnoresInvertColors
      cachePolicy="memory-disk"
      className="rounded-full"
      source={source}
      style={{ borderRadius: size / 2, height: size, width: size }}
    />
  );
}

type AvatarEditBadgeProps = {
  icon: 'camera' | 'pencil';
  size: number;
};

function AvatarEditBadge({ icon, size }: AvatarEditBadgeProps) {
  const iconColor = useThemeColor('foreground');
  const badgeSize = Math.round(size * 0.32);
  const Icon = icon === 'camera' ? CameraIcon : PencilIcon;

  return (
    <View
      className="absolute right-0 bottom-0 items-center justify-center border border-border bg-surface"
      style={[
        {
          borderRadius: badgeSize / 2,
          height: badgeSize,
          width: badgeSize,
        },
      ]}
    >
      <Icon color={iconColor} size={Math.round(badgeSize * 0.5)} strokeWidth={2.4} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatarMenuTrigger: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  input: {
    borderWidth: 1,
    height: 48,
    includeFontPadding: false,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
    verticalAlign: 'middle',
  },
  sheetAvatarHeader: {
    alignItems: 'center',
    gap: 12,
    height: 144,
    justifyContent: 'flex-end',
  },
  sheetContent: {
    flex: 1,
  },
  sheetFooter: {
    paddingBottom: 32,
    paddingTop: 16,
  },
  sheetForm: {
    flex: 1,
  },
  sheetViewport: {
    overflow: 'hidden',
  },
  // Matches `rounded-t-3xl`'s --cs-radius-3xl (22px) — GlassView doesn't take
  // className, so the radius is set directly to keep the same silhouette as
  // the non-glass fallback.
  surfaceGlass: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
});
