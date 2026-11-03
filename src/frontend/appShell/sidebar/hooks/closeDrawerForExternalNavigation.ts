import { type DrawerContentComponentProps, getDrawerStatusFromState } from 'expo-router/drawer';

export function closeDrawerForExternalNavigation(
  navigation: DrawerContentComponentProps['navigation'],
  isPermanent: boolean,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (isPermanent || getDrawerStatusFromState(navigation.getState(), 'closed') === 'closed')
    return Promise.resolve(true);

  return new Promise((resolve) => {
    const finish = (ready: boolean) => {
      unsubscribe();
      signal.removeEventListener('abort', abort);
      resolve(ready);
    };
    const abort = () => finish(false);
    const unsubscribe = navigation.addListener('transitionEnd', ({ data }) => {
      // Reopening the drawer interrupts the handoff instead of launching from a moving surface.
      finish(data.closing);
    });
    signal.addEventListener('abort', abort, { once: true });
    navigation.closeDrawer();
  });
}
