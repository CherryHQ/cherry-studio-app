import { ContentState } from '@cherrystudio/ui/components';
import {
  useGlobalSearchParams,
  usePathname,
  useRootNavigationState,
  useRouter,
  useSegments,
} from 'expo-router';
import { type PropsWithChildren, useEffect } from 'react';
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
  const needsSignIn = state.isEnterprise && state.needsSignIn;
  const returnTo = accountSessionReturnTo(pathname, params, segments);
  // Callback redemption repairs credentials; other pages wait until restoration settles.
  const covered =
    (state.isRestoringSession && pathname !== '/auth/callback') ||
    (needsSignIn && !isAccountRoute(pathname));

  useEffect(() => {
    if (
      navigation?.key &&
      !state.isRestoringSession &&
      !state.isBusy &&
      needsSignIn &&
      !isAccountRoute(pathname)
    ) {
      router.push(accountSignInHref(returnTo, 'expired'));
    }
  }, [
    navigation?.key,
    needsSignIn,
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
