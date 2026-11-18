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
      return status === 'credential_invalid' || status === 'inactive'
        ? 'cloud.amd.verify'
        : 'cloud.amd.link';
    case 'continue':
      return 'cloud.amd.continue';
    case 'none':
      return activated ? 'cloud.amd.viewUsage' : undefined;
    default:
      return undefined;
  }
}

async function openAmdBrowser(url: string) {
  cloudAmdReturn.markBrowserOpened();
  try {
    await Linking.openURL(url);
  } catch (error) {
    cloudAmdReturn.consumeBrowserOpen();
    throw error;
  }
}

/** Opens the account-scoped AMD flow only after a model row was pressed and confirmed. */
export function useCloudAmdModelAction() {
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
        !isCloudAmdModel(model)
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
      const showOpenFailed = () =>
        toast.show({ label: t('cloud.amd.openFailed'), variant: 'danger' });
      isPending.current = true;
      try {
        if (state.amd?.phase !== 'ready') await cloud.refreshAmd();
        if (!isCurrentAccount()) return;
        const { amd } = cloud.getState();
        if (amd?.phase !== 'ready') {
          showOpenFailed();
          return;
        }

        const { status } = amd;
        const label = amdActionLabel(status);
        if (!label) {
          alert.show({
            title: t('cloud.amd.title'),
            description: t(
              status.action === 'contact_support'
                ? 'cloud.amd.contactSupport'
                : status.action === 'wait'
                  ? 'cloud.amd.pending'
                  : 'chat.errorPart.reason.providerUnavailable',
            ),
          });
          return;
        }

        const isActivation = label === 'cloud.amd.activate';
        const isUsage = label === 'cloud.amd.viewUsage';
        // The catalog may still require activation while the AMD account is already linked.
        const showActivation = isActivation || (isUsage && model.activation_required !== false);
        alert.confirm({
          title: t(showActivation ? 'cloud.amd.activate' : label),
          confirmLabel: t(showActivation ? 'cloud.amd.openActivation' : label),
          description: t(
            showActivation
              ? 'cloud.amd.activationPromptDescription'
              : isUsage
                ? 'cloud.amd.linked'
                : 'cloud.amd.sameAccount',
          ),
          onConfirm: async () => {
            if (isPending.current || !isCurrentAccount()) return;
            isPending.current = true;
            try {
              const entry = await cloud.createAmdEntry();
              if (!isCurrentAccount()) return;
              await openAmdBrowser(entry);
              if (!signal.aborted) onOpened?.();
            } catch {
              if (isCurrentAccount()) {
                showOpenFailed();
                void cloud.refreshAmd();
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
