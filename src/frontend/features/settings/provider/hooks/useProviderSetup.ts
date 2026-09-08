import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys, useBackendModule } from '@/frontend/data';
import { ProviderSetupError } from '@/shared/contracts';

export type ProviderSetupIntent = 'enable' | 'sync';

/** Owns navigation for the user's explicit setup intent, including credential repair. */
export function useProviderSetup() {
  const providers = useBackendModule('providers');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [isPreparing, setIsPreparing] = useState(false);

  async function completeSetup(providerId: string): Promise<boolean> {
    try {
      const provider = await providers.enable(providerId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.detail(providerId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.providers.page() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.models.list() }),
      ]);
      toast.show({
        label: t('settings.provider.setup.enabled', { name: provider.name }),
        variant: 'success',
      });
      return true;
    } catch (error) {
      toast.show({
        label:
          error instanceof ProviderSetupError
            ? t(`settings.provider.setup.issues.${error.reason}`)
            : t('settings.provider.setup.enableFailed'),
        variant: 'danger',
      });
      return false;
    }
  }

  async function openSetup(
    providerId: string,
    returnTo: string,
    intent: ProviderSetupIntent = 'enable',
    replace = false,
    beforeNavigate?: () => void,
  ): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    setIsPreparing(true);
    try {
      const status = await providers.getSetupStatus(providerId);
      if (!active.current) return;
      const navigate = (href: Href) => {
        beforeNavigate?.();
        if (replace) router.replace(href);
        else router.push(href);
      };
      const issue =
        intent === 'sync' && status.provider.modelListSource === 'registry' ? null : status.issue;
      if (issue === 'unsupported-auth') {
        alert.show({ title: t('settings.provider.setup.issues.unsupported-auth') });
      } else if (issue) {
        navigate({
          pathname: '/settings/provider/new',
          params: { providerId, providerName: status.provider.name, returnTo, intent, issue },
        });
      } else if (intent === 'enable' && status.hasModels) {
        if ((await completeSetup(providerId)) && active.current) {
          beforeNavigate?.();
          router.dismissTo(returnTo as Href);
        }
      } else {
        navigate({
          pathname: '/settings/provider/[providerId]/model-add',
          params: {
            providerId,
            providerName: status.provider.name,
            mode: 'sync',
            ...(intent === 'enable' ? { enableProvider: 'true' } : {}),
            returnTo,
          },
        });
      }
    } catch {
      toast.show({ label: t('settings.provider.setup.loadFailed'), variant: 'danger' });
    } finally {
      pending.current = false;
      if (active.current) setIsPreparing(false);
    }
  }

  return { completeSetup, isPreparing, openSetup };
}
