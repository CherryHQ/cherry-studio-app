import {
  type DrawerContentComponentProps,
  getDrawerStatusFromState,
  useDrawerProgress,
  useDrawerStatus,
} from 'expo-router/drawer';
import { useCallback, useEffect, useRef } from 'react';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export function useCloseDrawerForExternalNavigation(
  navigation: DrawerContentComponentProps['navigation'],
  isPermanent: boolean,
) {
  const progress = useDrawerProgress();
  const status = useDrawerStatus();
  const requestId = useSharedValue(0);
  const nextId = useRef(0);
  const pending = useRef<{ id: number; finish(ready: boolean): void } | null>(null);

  const finishClose = useCallback(
    (id: number) => {
      if (
        pending.current?.id === id &&
        progress.get() === 0 &&
        getDrawerStatusFromState(navigation.getState(), 'closed') === 'closed'
      ) {
        pending.current.finish(true);
      }
    },
    [navigation, progress],
  );

  // The drawer-content navigation listens to the parent route. Observe the drawer's actual
  // progress instead; send only completion to JS, correlated with the request that awaited it.
  useAnimatedReaction(
    () => ({ id: requestId.get(), closed: progress.get() === 0 }),
    ({ id, closed }) => {
      if (id && closed) scheduleOnRN(finishClose, id);
    },
  );

  useEffect(() => {
    if (isPermanent || (status === 'closed' && progress.get() === 0)) {
      pending.current?.finish(true);
    } else if (status === 'open') {
      pending.current?.finish(false);
    }
  }, [isPermanent, progress, status]);

  useEffect(() => () => pending.current?.finish(false), []);

  return (signal: AbortSignal): Promise<boolean> => {
    if (signal.aborted) return Promise.resolve(false);
    if (
      isPermanent ||
      (getDrawerStatusFromState(navigation.getState(), 'closed') === 'closed' &&
        progress.get() === 0)
    ) {
      return Promise.resolve(true);
    }

    pending.current?.finish(false);
    const id = ++nextId.current;
    return new Promise((resolve) => {
      const finish = (ready: boolean) => {
        pending.current = null;
        requestId.set(0);
        signal.removeEventListener('abort', abort);
        resolve(ready);
      };
      const abort = () => finish(false);
      pending.current = { id, finish };
      signal.addEventListener('abort', abort, { once: true });
      requestId.set(id);
      navigation.closeDrawer();
    });
  };
}
