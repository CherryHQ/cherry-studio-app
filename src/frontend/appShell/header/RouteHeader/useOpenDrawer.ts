import { useNavigation } from 'expo-router';
import { DrawerActions } from 'expo-router/react-navigation';
import { useCallback } from 'react';
import { Keyboard } from 'react-native';

// Dispatched rather than called on a typed drawer prop: the header can sit any
// number of stack levels below the drawer navigator, and the action bubbles up
// to the nearest drawer on its own.
export function useOpenDrawer() {
  const navigation = useNavigation();

  return useCallback(() => {
    Keyboard.dismiss();
    navigation.dispatch(DrawerActions.openDrawer());
  }, [navigation]);
}
