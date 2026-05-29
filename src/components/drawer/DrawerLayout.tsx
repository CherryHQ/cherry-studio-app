import { useDrawerProgress } from 'expo-router/build/react-navigation/drawer';
import { Drawer } from 'expo-router/drawer';
import { useThemeColor } from 'heroui-native/hooks';
import { useEffect } from 'react';
import { type ColorValue, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  makeMutable,
  useAnimatedReaction,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { DrawerContent } from './components/DrawerContent';
import { useDrawerNavigationBridge } from './context/DrawerProvider';

const drawerActivationOffset = 8;
const drawerProgress = makeMutable(0);
const drawerScreenOpenBorderRadius = 28;
const drawerScreenOpenScale = 0.94;
const drawerSwipeMinDistance = 60;

type DrawerNavigationDispatcher = {
  dispatch: (action: { type: 'CLOSE_DRAWER' | 'OPEN_DRAWER' }) => void;
};

type DrawerStateLike = {
  default?: 'closed' | 'open';
  history?: readonly ({ status: 'closed' | 'open'; type: 'drawer' } | { type: string })[];
};

type DrawerControllerBridgeProps = {
  backgroundColor: ColorValue;
  children: React.ReactNode;
  navigation: DrawerNavigationDispatcher;
  state: DrawerStateLike;
};

type DrawerScreenMotionProps = {
  backgroundColor: ColorValue;
  children: React.ReactNode;
};

function getDrawerOpenState(state: DrawerStateLike) {
  const drawerEntry = state.history?.findLast(
    (entry): entry is { status: 'closed' | 'open'; type: 'drawer' } => entry.type === 'drawer',
  );

  return (drawerEntry?.status ?? state.default ?? 'closed') === 'open';
}

function DrawerScreenMotion({ backgroundColor, children }: DrawerScreenMotionProps) {
  const screenStyle = useAnimatedStyle(() => {
    return {
      borderRadius: interpolate(
        drawerProgress.value,
        [0, 1],
        [0, drawerScreenOpenBorderRadius],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          scale: interpolate(
            drawerProgress.value,
            [0, 1],
            [drawerScreenOpenScale, 1],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <Animated.View style={[styles.screenMotion, { backgroundColor }, screenStyle]}>
      <View style={styles.screenContent}>{children}</View>
    </Animated.View>
  );
}

function DrawerContentWithProgressBridge() {
  const nativeDrawerProgress = useDrawerProgress();

  const drawerContentStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(nativeDrawerProgress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    };
  }, [nativeDrawerProgress]);

  useAnimatedReaction(
    () => nativeDrawerProgress.value,
    (value) => {
      drawerProgress.value = value;
    },
    [nativeDrawerProgress],
  );

  return (
    <Animated.View style={[styles.drawerContentMotion, drawerContentStyle]}>
      <DrawerContent />
    </Animated.View>
  );
}

function DrawerControllerBridge({
  backgroundColor,
  children,
  navigation,
  state,
}: DrawerControllerBridgeProps) {
  const { registerDrawerController, setDrawerOpen } = useDrawerNavigationBridge();

  useEffect(() => {
    registerDrawerController({
      closeDrawer: () => navigation.dispatch({ type: 'CLOSE_DRAWER' }),
      openDrawer: () => navigation.dispatch({ type: 'OPEN_DRAWER' }),
    });

    return () => {
      registerDrawerController(null);
    };
  }, [navigation, registerDrawerController]);

  useEffect(() => {
    setDrawerOpen(getDrawerOpenState(state));
  }, [setDrawerOpen, state]);

  return <DrawerScreenMotion backgroundColor={backgroundColor}>{children}</DrawerScreenMotion>;
}

export function DrawerLayout() {
  const { width } = useWindowDimensions();
  const [backgroundColor] = useThemeColor(['background']);

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Drawer
        backBehavior="none"
        drawerContent={() => <DrawerContentWithProgressBridge />}
        layout={({ children, navigation, state }) => (
          <DrawerControllerBridge
            backgroundColor={backgroundColor}
            navigation={navigation}
            state={state}
          >
            {children}
          </DrawerControllerBridge>
        )}
        screenOptions={{
          configureGestureHandler: (gesture) =>
            gesture
              .activeOffsetX([-drawerActivationOffset, drawerActivationOffset])
              .failOffsetY([-drawerActivationOffset, drawerActivationOffset]),
          drawerStyle: {
            backgroundColor,
            width,
          },
          drawerType: 'back',
          headerShown: false,
          keyboardDismissMode: 'on-drag',
          overlayColor: 'transparent',
          sceneStyle: {
            backgroundColor,
          },
          swipeEdgeWidth: width,
          swipeMinDistance: drawerSwipeMinDistance,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  drawerContentMotion: {
    flex: 1,
  },
  screenContent: {
    flex: 1,
  },
  screenMotion: {
    borderCurve: 'continuous',
    flex: 1,
    overflow: 'hidden',
  },
});
