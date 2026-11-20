import { useAlert } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { accountSignInHref, rememberCloudModelTap, useAccount } from '@/frontend/appShell/account';
import { useCloud } from '@/frontend/hooks/useCloud';
import { CLOUD_PROVIDER_NAME, type CloudModelUse } from '@/shared/contracts/cloud';

import { getCloudModelOffers, getCloudModelTapNotice } from './cloudModelOffers';
import { useCloudModelActivation } from './useCloudModelActivation';

export function useCloudModelBrowser(enabled: boolean, use?: CloudModelUse) {
  const { cloud, state } = useCloud();
  const { account, state: accountState } = useAccount();
  const { t } = useTranslation();
  const { alert } = useAlert();
  const router = useRouter();
  const activate = useCloudModelActivation();
  const canBrowse = enabled && !accountState.isEnterprise && !accountState.isRestoringSession;
  const refresh = useCallback(() => {
    if (canBrowse) void cloud.refreshProvider().catch(() => {});
  }, [canBrowse, cloud]);
  useEffect(() => {
    if (canBrowse) void cloud.refresh().catch(() => {});
  }, [canBrowse, cloud]);
  const offers = useMemo(() => getCloudModelOffers(state, use), [state, use]);

  const signInAgain = useCallback(
    (destination: string) => {
      router.push(accountSignInHref(destination, { purpose: 'sign-in', cancelTo: destination }));
    },
    [router],
  );

  const press = useCallback(
    (id: string, returnTo: string, close?: () => void, resume = true) => {
      const current = account.getState();
      if (current.isRestoringSession || current.isEnterprise) return;
      const offer = getCloudModelOffers(cloud.getState(), use).get(id);
      if (
        (offer?.reason === 'signed_out' && (!current.isSignedIn || current.needsSignIn)) ||
        offer?.reason === 'reauth_required'
      ) {
        const destination = resume ? rememberCloudModelTap(returnTo, id) : returnTo;
        close?.();
        router.push(
          accountSignInHref(destination, {
            cancelTo: returnTo,
            purpose: offer.reason === 'reauth_required' ? 'sign-in' : undefined,
          }),
        );
        return;
      }
      if (offer?.reason === 'activation_required' || offer?.canViewUsage) {
        void activate(id, close);
        return;
      }
      const notice = getCloudModelTapNotice(offer);
      if (notice) {
        alert.show({
          title: offer?.model.display_name ?? CLOUD_PROVIDER_NAME,
          description: t(notice),
        });
      }
    },
    [account, alert, activate, cloud, router, t, use],
  );
  return { state, offers, refresh, press, accountState, signInAgain };
}
