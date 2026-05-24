import { useThemeColor } from 'heroui-native/hooks';
import { StyleSheet } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

type ChatInitialRenderCoverProps = {
  isVisible: boolean;
};

export function ChatInitialRenderCover({ isVisible }: ChatInitialRenderCoverProps) {
  const [backgroundColor] = useThemeColor(['background']);

  if (!isVisible) {
    return null;
  }

  return (
    <Animated.View
      exiting={FadeOut.duration(400)}
      pointerEvents="none"
      style={[styles.cover, { backgroundColor }]}
    />
  );
}

const styles = StyleSheet.create({
  cover: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
});
