import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { isCloudAmdModel, type CloudAmdStatus } from '@/shared/contracts/cloud';

import { cloudAmdReturn } from './nativeIntent';

function amdActionLabel({ action, activated, registration_enabled, status }: CloudAmdStatus) {
  switch (action) {
    case 'register':
      return registration_enabled ? 'cloud.amd.activate' : 'cloud.amd.link';
    case 'login':
      return status === 'credential_invalid' ? 'cloud.amd.verify' : 'cloud.amd.link';
    case 'continue':
      return 'cloud.amd.continue';
    case 'none':
      return activated ? 'cloud.amd.viewUsage' : undefined;
    default:
      return undefined;
  }
}

async function openActivationPage(url: string, accountId: string, activating: boolean) {
  cloudAmdReturn.markBrowserOpened({ accountId, activating });
  try {
    await Linking.openURL(url);
  } catch (error) {
    cloudAmdReturn.consumeBrowserOpen();
    throw error;
  }
}

/** Issues a fresh browser entry for the selected model after the user confirms. */
export function useCloudModelActivation() {
  const { t } = useTranslation();
  const cloud = useBackendModule('cloud');
  const { alert } = useAlert();
  const { toast } = useToast();
  const focus = useRef<AbortController | null>(null);
  const isPending = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const current = new AbortController();
      focus.current = current;
      return () => {
        focus.current = null;
        current.abort();
      };
    }, []),
  );

  return useCallback(
    async (modelId: string, onOpened?: () => void) => {
      const signal = focus.current?.signal;
      const state = cloud.getState();
      const account = state.account?.account;
      const model = state.models.find((item) => item.id === modelId);
      if (
        !signal ||
        isPending.current ||
        state.phase !== 'ready' ||
        account?.status !== 'active' ||
        !model ||
        !model.activation_endpoint
      )
        return;

      const isCurrentAccount = () => {
        const current = cloud.getState();
        return (
          !signal.aborted &&
          current.phase === 'ready' &&
          current.account?.account.id === account.id &&
          current.account.account.status === 'active'
        );
      };
      const amdModel = isCloudAmdModel(model);
      const showOpenFailed = () =>
        toast.show({
          label: t(amdModel ? 'cloud.amd.openFailed' : 'onboarding.linkFailed'),
          variant: 'danger',
        });
      isPending.current = true;
      try {
        if (amdModel) await cloud.refreshAmd();
        if (!isCurrentAccount()) return;
        const { amd } = cloud.getState();
        if (amdModel && amd?.phase !== 'ready') {
          if (amd?.phase !== 'unsupported')
            toast.show({
              label: t('chat.errorPart.reason.providerUnavailable'),
              variant: 'danger',
            });
          return;
        }

        const status = amdModel && amd?.phase === 'ready' ? amd.status : undefined;
        const label = status ? amdActionLabel(status) : 'cloud.activate';
        if (!label) {
          alert.show({
            title: t('cloud.amd.title'),
            description: t(
              status?.action === 'contact_support'
                ? 'cloud.amd.contactSupport'
                : status?.action === 'wait'
                  ? 'cloud.amd.pending'
                  : 'chat.errorPart.reason.providerUnavailable',
            ),
          });
          return;
        }

        const isActivation = label === 'cloud.amd.activate';
        const isUsage = label === 'cloud.amd.viewUsage';
        alert.confirm({
          title: t(label),
          confirmLabel: t(isActivation ? 'cloud.amd.openActivation' : label),
          description: t(
            isUsage
              ? 'cloud.amd.linked'
              : status
                ? 'cloud.amd.activationPromptDescription'
                : 'cloud.amd.sameAccount',
          ),
          onConfirm: async () => {
            if (isPending.current || !isCurrentAccount()) return;
            isPending.current = true;
            try {
              const entry = await cloud.createActivationEntry(modelId);
              if (!isCurrentAccount()) return;
              await openActivationPage(entry, account.id, Boolean(status && !status.activated));
              if (!signal.aborted) onOpened?.();
            } catch {
              if (isCurrentAccount()) {
                showOpenFailed();
                if (amdModel) void cloud.refreshAmd();
              }
            } finally {
              isPending.current = false;
            }
          },
        });
      } catch {
        if (isCurrentAccount()) showOpenFailed();
      } finally {
        isPending.current = false;
      }
    },
    [alert, cloud, t, toast],
  );
}
