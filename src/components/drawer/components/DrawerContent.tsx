import { useThemeColor } from 'heroui-native/hooks';
import { XIcon } from 'lucide-uniwind';
import { useCallback, useEffect, useRef } from 'react';
import { TextInput, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { useDrawerActions, useDrawerPanelState } from '../context/DrawerProvider';
import { useDrawerHeaderAnimation } from '../hooks/useDrawerHeaderAnimation';
import { drawerContentLayoutTransition } from '../utils/drawerAnimation';
import { DrawerHeader } from './DrawerHeader';
import { DrawerTopicList } from './DrawerTopicList';

const StyledSafeAreaView = withUniwind(SafeAreaView);
const StyledAnimatedView = withUniwind(Animated.View);

export function DrawerContent() {
  const inputRef = useRef<TextInput>(null);
  const { width } = useWindowDimensions();
  const [backgroundColor] = useThemeColor(['background']);
  const { isOpen, isSearchActive, searchText } = useDrawerPanelState();
  const { closeSearch, openSearch, setSearchText } = useDrawerActions();
  const isSearchVisible = isOpen && isSearchActive;
  const {
    closeButtonSize,
    closeButtonStyle,
    collapsedHeaderStyle,
    searchFieldIconStyle,
    searchFieldSlotStyle,
  } = useDrawerHeaderAnimation({
    isSearchActive: isSearchVisible,
    screenWidth: width,
  });

  // TODO(android): Verify system back closes the drawer and preserves search state.
  useEffect(() => {
    if (isSearchVisible) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isSearchVisible]);

  const handleSearchPress = useCallback(() => {
    openSearch();
  }, [openSearch]);

  const handleClose = useCallback(() => {
    inputRef.current?.blur();
    closeSearch();
  }, [closeSearch]);

  return (
    <StyledSafeAreaView
      accessibilityElementsHidden={!isOpen}
      className="flex-1"
      edges={['top', 'bottom']}
      importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}
      style={[{ backgroundColor }]}
    >
      <StyledAnimatedView className="flex-1 gap-2" layout={drawerContentLayoutTransition}>
        <DrawerHeader
          closeButtonSize={closeButtonSize}
          closeButtonStyle={closeButtonStyle}
          collapsedHeaderStyle={collapsedHeaderStyle}
          inputRef={inputRef}
          isSearchVisible={isSearchVisible}
          onClose={handleClose}
          onSearchPress={handleSearchPress}
          searchFieldIconStyle={searchFieldIconStyle}
          searchFieldSlotStyle={searchFieldSlotStyle}
          searchText={searchText}
          setSearchText={setSearchText}
        />
        <StyledAnimatedView className="flex-1" layout={drawerContentLayoutTransition}>
          <DrawerTopicList />
        </StyledAnimatedView>
      </StyledAnimatedView>
    </StyledSafeAreaView>
  );
}
