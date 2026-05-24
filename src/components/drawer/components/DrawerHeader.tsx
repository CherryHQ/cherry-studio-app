import { CloseButton } from 'heroui-native/close-button';
import { SearchIcon } from 'lucide-uniwind';
import { memo, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, Text, TextInput, View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

import { useDrawerActions } from '../context/DrawerProvider';
import { DrawerSearchField } from './DrawerSearchField';

const StyledAnimatedView = withUniwind(Animated.View);
const StyledPressable = withUniwind(Pressable);
const searchControlSurfaceClassName = 'bg-field ios:shadow-field android:shadow-sm';

type DrawerHeaderProps = {
  closeButtonSize: number;
  closeButtonStyle: AnimatedStyle<ViewStyle>;
  collapsedHeaderStyle: AnimatedStyle<ViewStyle>;
  inputRef: Ref<TextInput>;
  isSearchVisible: boolean;
  onClose: () => void;
  onSearchPress: () => void;
  searchFieldIconStyle: AnimatedStyle<ViewStyle>;
  searchFieldSlotStyle: AnimatedStyle<ViewStyle>;
  searchText: string;
  setSearchText: (value: string) => void;
};

export const DrawerHeader = memo(function DrawerHeader({
  closeButtonSize,
  closeButtonStyle,
  collapsedHeaderStyle,
  inputRef,
  isSearchVisible,
  onClose,
  onSearchPress,
  searchFieldIconStyle,
  searchFieldSlotStyle,
  searchText,
  setSearchText,
}: DrawerHeaderProps) {
  const { t } = useTranslation();
  const { openSettings } = useDrawerActions();
  const searchAccessibilityLabel = t('navigation.search');

  return (
    <View className="px-4 py-2.5">
      <View style={{ height: closeButtonSize }}>
        <CollapsedHeaderLayer
          accessibilityLabels={{
            search: searchAccessibilityLabel,
            settings: t('navigation.settings'),
          }}
          controlSize={closeButtonSize}
          isSearchVisible={isSearchVisible}
          style={collapsedHeaderStyle}
          title={t('common.cherryStudio')}
          onSearchPress={onSearchPress}
          onSettingsPress={openSettings}
        />
        <SearchFieldLayer
          accessibilityLabel={searchAccessibilityLabel}
          controlSize={closeButtonSize}
          iconStyle={searchFieldIconStyle}
          inputRef={inputRef}
          isSearchVisible={isSearchVisible}
          searchText={searchText}
          setSearchText={setSearchText}
          style={searchFieldSlotStyle}
          onSearchPress={onSearchPress}
        />
        <SearchCloseButtonLayer
          accessibilityLabel={t('navigation.closeSearch')}
          closeButtonSize={closeButtonSize}
          isSearchVisible={isSearchVisible}
          style={closeButtonStyle}
          onClose={onClose}
        />
      </View>
    </View>
  );
});

type CollapsedHeaderLayerProps = {
  accessibilityLabels: {
    search: string;
    settings: string;
  };
  controlSize: number;
  isSearchVisible: boolean;
  onSearchPress: () => void;
  onSettingsPress: () => void;
  style: AnimatedStyle<ViewStyle>;
  title: string;
};

function CollapsedHeaderLayer({
  accessibilityLabels,
  controlSize,
  isSearchVisible,
  onSearchPress,
  onSettingsPress,
  style,
  title,
}: CollapsedHeaderLayerProps) {
  return (
    <StyledAnimatedView
      className="absolute inset-0 flex-row items-center gap-3"
      pointerEvents={isSearchVisible ? 'none' : 'auto'}
      style={style}
    >
      <Text className="min-w-0 flex-1 font-bold text-2xl text-foreground" numberOfLines={1}>
        {title}
      </Text>
      <View
        className={`flex-row items-center gap-1 rounded-3xl ${searchControlSurfaceClassName}`}
        style={{ height: controlSize }}
      >
        <DrawerHeaderIconButton
          accessibilityLabel={accessibilityLabels.search}
          controlSize={controlSize}
          onPress={onSearchPress}
        >
          <SearchIcon className="size-6 text-foreground" strokeWidth={2} />
        </DrawerHeaderIconButton>
        <DrawerAvatarButton
          accessibilityLabel={accessibilityLabels.settings}
          controlSize={controlSize}
          onPress={onSettingsPress}
        />
      </View>
    </StyledAnimatedView>
  );
}

type SearchFieldLayerProps = {
  accessibilityLabel: string;
  controlSize: number;
  iconStyle: AnimatedStyle<ViewStyle>;
  inputRef: Ref<TextInput>;
  isSearchVisible: boolean;
  onSearchPress: () => void;
  searchText: string;
  setSearchText: (value: string) => void;
  style: AnimatedStyle<ViewStyle>;
};

function SearchFieldLayer({
  accessibilityLabel,
  controlSize,
  iconStyle,
  inputRef,
  isSearchVisible,
  onSearchPress,
  searchText,
  setSearchText,
  style,
}: SearchFieldLayerProps) {
  return (
    <StyledAnimatedView
      className={`absolute top-0 rounded-3xl ${searchControlSurfaceClassName}`}
      pointerEvents={isSearchVisible ? 'auto' : 'none'}
      style={[{ height: controlSize }, style]}
    >
      <View className="flex-1 overflow-hidden rounded-3xl">
        <DrawerSearchField
          editable={isSearchVisible}
          height={controlSize}
          inputRef={inputRef}
          onChange={setSearchText}
          searchIconStyle={iconStyle}
          value={searchText}
        />
        <StyledPressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          className="absolute inset-0"
          onPress={onSearchPress}
          pointerEvents={isSearchVisible ? 'none' : 'auto'}
        />
      </View>
    </StyledAnimatedView>
  );
}

type SearchCloseButtonLayerProps = {
  accessibilityLabel: string;
  closeButtonSize: number;
  isSearchVisible: boolean;
  onClose: () => void;
  style: AnimatedStyle<ViewStyle>;
};

function SearchCloseButtonLayer({
  accessibilityLabel,
  closeButtonSize,
  isSearchVisible,
  onClose,
  style,
}: SearchCloseButtonLayerProps) {
  return (
    <StyledAnimatedView
      className="absolute top-0"
      pointerEvents={isSearchVisible ? 'auto' : 'none'}
      style={[
        {
          height: closeButtonSize,
          width: closeButtonSize,
        },
        style,
      ]}
    >
      <CloseButton
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className={`rounded-3xl ${searchControlSurfaceClassName}`}
        hitSlop={8}
        onPress={onClose}
        style={{ height: closeButtonSize, width: closeButtonSize }}
        variant="ghost"
      />
    </StyledAnimatedView>
  );
}

type DrawerHeaderIconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  controlSize: number;
  onPress: () => void;
};

function DrawerHeaderIconButton({
  accessibilityLabel,
  children,
  controlSize,
  onPress,
}: DrawerHeaderIconButtonProps) {
  return (
    <StyledPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="items-center justify-center rounded-3xl active:opacity-60"
      hitSlop={8}
      onPress={onPress}
      style={{ height: controlSize, width: controlSize }}
    >
      {children}
    </StyledPressable>
  );
}

type DrawerAvatarButtonProps = {
  accessibilityLabel: string;
  controlSize: number;
  onPress: () => void;
};

function DrawerAvatarButton({ accessibilityLabel, controlSize, onPress }: DrawerAvatarButtonProps) {
  return (
    <StyledPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="items-center justify-center overflow-hidden rounded-full active:opacity-60"
      hitSlop={8}
      onPress={onPress}
      style={{ height: controlSize, width: controlSize }}
    >
      <Image
        accessibilityIgnoresInvertColors
        source={require('@/assets/icon.png')}
        style={{ height: 24, width: 24 }}
      />
    </StyledPressable>
  );
}
