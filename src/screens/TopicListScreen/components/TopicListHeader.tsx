import { CloseButton } from 'heroui-native/close-button';
import { cn } from 'heroui-native/utils';
import { SearchIcon } from 'lucide-uniwind/png';
import { memo, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { TopicSearchField } from './TopicSearchField';

const searchControlSurfaceClassName = 'bg-field ios:shadow-field android:shadow-sm';

type TopicListHeaderProps = {
  closeButtonSize: number;
  closeButtonStyle: AnimatedStyle<ViewStyle>;
  collapsedHeaderStyle: AnimatedStyle<ViewStyle>;
  expandedSearchWidth: number;
  inputRef: Ref<TextInput>;
  isSearchVisible: boolean;
  onClose: () => void;
  onSearchPress: () => void;
  searchFieldIconStyle: AnimatedStyle<ViewStyle>;
  searchFieldSlotStyle: AnimatedStyle<ViewStyle>;
  searchText: string;
  setSearchText: (value: string) => void;
};

export const TopicListHeader = memo(function TopicListHeader({
  closeButtonSize,
  closeButtonStyle,
  collapsedHeaderStyle,
  expandedSearchWidth,
  inputRef,
  isSearchVisible,
  onClose,
  onSearchPress,
  searchFieldIconStyle,
  searchFieldSlotStyle,
  searchText,
  setSearchText,
}: TopicListHeaderProps) {
  const { t } = useTranslation();
  const searchAccessibilityLabel = t('navigation.search');

  return (
    <View className="px-4 py-2.5">
      <View style={{ height: closeButtonSize }}>
        <CollapsedHeaderLayer
          accessibilityLabel={searchAccessibilityLabel}
          controlSize={closeButtonSize}
          isSearchVisible={isSearchVisible}
          style={collapsedHeaderStyle}
          title={t('navigation.messages')}
          onSearchPress={onSearchPress}
        />
        <SearchFieldLayer
          accessibilityLabel={searchAccessibilityLabel}
          controlSize={closeButtonSize}
          expandedSearchWidth={expandedSearchWidth}
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
  accessibilityLabel: string;
  controlSize: number;
  isSearchVisible: boolean;
  onSearchPress: () => void;
  style: AnimatedStyle<ViewStyle>;
  title: string;
};

function CollapsedHeaderLayer({
  accessibilityLabel,
  controlSize,
  isSearchVisible,
  onSearchPress,
  style,
  title,
}: CollapsedHeaderLayerProps) {
  return (
    <Animated.View
      className="absolute inset-0 flex-row items-center gap-3"
      pointerEvents={isSearchVisible ? 'none' : 'auto'}
      style={style}
    >
      <Text className="min-w-0 flex-1 font-bold text-2xl text-foreground" numberOfLines={1}>
        {title}
      </Text>
      <View
        className={cn('rounded-3xl', searchControlSurfaceClassName)}
        style={{ height: controlSize, width: controlSize }}
      >
        <HeaderIconButton
          accessibilityLabel={accessibilityLabel}
          controlSize={controlSize}
          onPress={onSearchPress}
        >
          <SearchIcon className="size-6 text-foreground" strokeWidth={2} />
        </HeaderIconButton>
      </View>
    </Animated.View>
  );
}

type SearchFieldLayerProps = {
  accessibilityLabel: string;
  controlSize: number;
  expandedSearchWidth: number;
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
  expandedSearchWidth,
  iconStyle,
  inputRef,
  isSearchVisible,
  onSearchPress,
  searchText,
  setSearchText,
  style,
}: SearchFieldLayerProps) {
  return (
    <Animated.View
      className={cn('absolute top-0 rounded-3xl', searchControlSurfaceClassName)}
      pointerEvents={isSearchVisible ? 'auto' : 'none'}
      style={[{ height: controlSize }, style]}
    >
      <View className="flex-1 overflow-hidden rounded-3xl">
        <View style={{ width: expandedSearchWidth }}>
          <TopicSearchField
            editable={isSearchVisible}
            height={controlSize}
            inputRef={inputRef}
            onChange={setSearchText}
            searchIconStyle={iconStyle}
            value={searchText}
          />
        </View>
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          className="absolute inset-0"
          onPress={onSearchPress}
          pointerEvents={isSearchVisible ? 'none' : 'auto'}
        />
      </View>
    </Animated.View>
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
    <Animated.View
      className="absolute top-0"
      pointerEvents={isSearchVisible ? 'auto' : 'none'}
      style={[{ height: closeButtonSize, width: closeButtonSize }, style]}
    >
      <CloseButton
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className={cn('rounded-3xl', searchControlSurfaceClassName)}
        hitSlop={8}
        onPress={onClose}
        style={{ height: closeButtonSize, width: closeButtonSize }}
        variant="ghost"
      />
    </Animated.View>
  );
}

type HeaderIconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  controlSize: number;
  onPress: () => void;
};

function HeaderIconButton({
  accessibilityLabel,
  children,
  controlSize,
  onPress,
}: HeaderIconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="items-center justify-center rounded-3xl active:opacity-60"
      hitSlop={8}
      onPress={onPress}
      style={{ height: controlSize, width: controlSize }}
    >
      {children}
    </Pressable>
  );
}
