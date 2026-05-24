import { Drawer } from 'expo-router/drawer';
import { useThemeColor } from 'heroui-native/hooks';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { DrawerContent } from './components/DrawerContent';
import { useDrawerNavigationBridge } from './context/DrawerProvider';

const drawerActivationOffset = 8;
const drawerSwipeMinDistance = 60;

type DrawerNavigationDispatcher = {
  dispatch: (action: { type: 'CLOSE_DRAWER' | 'OPEN_DRAWER' }) => void;
};

type DrawerStateLike = {
  default?: 'closed' | 'open';
  history?: readonly ({ status: 'closed' | 'open'; type: 'drawer' } | { type: string })[];
};

type DrawerControllerBridgeProps = {
  children: React.ReactNode;
  navigation: DrawerNavigationDispatcher;
  state: DrawerStateLike;
};

function getDrawerOpenState(state: DrawerStateLike) {
  const drawerEntry = state.history?.findLast(
    (entry): entry is { status: 'closed' | 'open'; type: 'drawer' } => entry.type === 'drawer',
  );

  return (drawerEntry?.status ?? state.default ?? 'closed') === 'open';
}

function DrawerControllerBridge({ children, navigation, state }: DrawerControllerBridgeProps) {
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

  return children;
}

export function DrawerLayout() {
  const { width } = useWindowDimensions();
  const [backgroundColor] = useThemeColor(['background']);

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Drawer
        backBehavior="none"
        drawerContent={() => <DrawerContent />}
        layout={({ children, navigation, state }) => (
          <DrawerControllerBridge navigation={navigation} state={state}>
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
          drawerType: 'slide',
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
});
