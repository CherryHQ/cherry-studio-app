import { ContentState, useOverlayNavigation } from '@cherrystudio/ui/components';
import {
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
  useRouter,
  useSegments,
} from 'expo-router';
import { type PropsWithChildren, useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { accountSessionReturnTo, accountSignInHref, isAccountRoute } from './accountRoute';
import { useAccount } from './useAccount';

/** Covers refused data without unmounting its navigator, pages or unsent drafts. */
export function AccountSessionGate({ children }: PropsWithChildren) {
  const { state } = useAccount();
  const router = useRouter();
  const navigation = useRootNavigationState();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const segments = useSegments();
  // Sheets and dialogs render in portals above this cover, so they must close before login opens.
  const overlays = useOverlayNavigation();
  const overlaysDismissible = useSyncExternalStore(overlays.subscribe, overlays.canNavigate);
  const [attempt, setAttempt] = useState(0);
  const needsSignIn = state.isEnterprise && state.needsSignIn;
  const returnTo = accountSessionReturnTo(pathname, params, segments);
  // Callback redemption repairs credentials; other pages wait until restoration settles.
  const covered =
    (state.isRestoringSession && pathname !== '/auth/callback') ||
    (needsSignIn && !isAccountRoute(pathname));

  useEffect(() => {
    if (
      !navigation?.key ||
      state.isRestoringSession ||
      state.isBusy ||
      !needsSignIn ||
      isAccountRoute(pathname) ||
      // A pending decision stays with the user; login opens once it has been answered.
      !overlaysDismissible
    )
      return;
    const controller = new AbortController();
    void overlays.prepareForNavigation(controller.signal).then((ready) => {
      if (controller.signal.aborted) return;
      if (ready) router.push(accountSignInHref(returnTo, 'expired'));
      // A surface opened during dismissal; close it on the next pass.
      else setAttempt((count) => count + 1);
    });
    return () => controller.abort();
  }, [
    attempt,
    navigation?.key,
    needsSignIn,
    overlays,
    overlaysDismissible,
    pathname,
    returnTo,
    router,
    state.isBusy,
    state.isRestoringSession,
  ]);

  return (
    <View className="flex-1">
      <View
        accessibilityElementsHidden={covered}
        className="flex-1"
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
        pointerEvents={covered ? 'none' : 'auto'}
        style={{ opacity: covered ? 0 : 1 }}
      >
        {children}
      </View>
      {covered ? (
        <View className="absolute inset-0 justify-center bg-background">
          <ContentState.Loading />
        </View>
      ) : null}
    </View>
  );
}
