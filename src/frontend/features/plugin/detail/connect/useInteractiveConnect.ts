import { useToast } from '@cherrystudio/ui/components';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Keyboard, Linking } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import {
  PluginError,
  type PluginAuthorizationObservation,
  type PluginAuthorizationState,
  type PluginErrorReason,
} from '@/shared/contracts/plugins';
import type { PluginCatalogEntry, PluginInteractiveMethod } from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import { useRefreshPluginConnections } from '../../usePluginConnections';

/** Owns route observation, browser actions and form state; backend observers poll and complete. */
export function useInteractiveConnect(entry: PluginCatalogEntry, method: PluginInteractiveMethod) {
  const plugins = useBackendModule('plugins');
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const refresh = useRefreshPluginConnections();
  const [observation, setObservation] = useState<PluginAuthorizationObservation | null>(null);
  const [actionError, setActionError] = useState<PluginErrorReason | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [existingApplication, setExistingApplication] = useState<{
    fields: Record<string, string>;
    invalid: Set<string>;
  } | null>(null);
  const finished = useRef(false);
  const name = t(`plugins.catalog.${entry.id}.name`);
  const applicationFields = method.applicationFields;

  useFocusEffect(
    useCallback(() => {
      let detach: (() => void) | null = null;
      const attach = () => {
        detach ??= plugins.authorization.observe(entry.id, method.id, setObservation);
      };
      const release = () => {
        detach?.();
        detach = null;
      };
      if (AppState.currentState === 'active') attach();
      const listener = AppState.addEventListener('change', (status) =>
        status === 'active' ? attach() : release(),
      );
      return () => {
        listener.remove();
        release();
      };
    }, [plugins, entry.id, method.id]),
  );

  const connection = observation?.connection;
  const connected = useEffectEvent(async () => {
    // Only an owned in-app presentation can be dismissed; external browsers return manually.
    await WebBrowser.dismissBrowser().catch(() => undefined);
    await refresh();
    toast.show({ label: t('plugins.connectSuccess', { name }), variant: 'success' });
    router.back();
  });
  useEffect(() => {
    if (!connection || finished.current) return;
    finished.current = true;
    void connected();
  }, [connection]);

  async function openConfirmation(state: PluginAuthorizationState) {
    if (state.status !== 'waiting') return;
    try {
      // Android may resolve immediately; iOS resolves on close (including `cancel`
      // after successful approval). Neither result is proof of success or denial.
      await WebBrowser.openBrowserAsync(state.verificationUrl).catch(() =>
        Linking.openURL(state.verificationUrl),
      );
    } catch {
      toast.show({ label: t('plugins.authorization.browserFailed'), variant: 'danger' });
    } finally {
      plugins.authorization.check(entry.id, method.id);
    }
  }

  async function act(action: () => Promise<PluginAuthorizationState | void>) {
    if (isActing) return;
    setIsActing(true);
    setActionError(null);
    try {
      return await action();
    } catch (error) {
      setActionError(error instanceof PluginError ? error.reason : 'request');
      return undefined;
    } finally {
      setIsActing(false);
    }
  }

  const begin = (restart = false) =>
    act(async () => {
      if (restart) await plugins.authorization.cancel(entry.id, method.id);
      const next = await plugins.authorization.begin(entry.id, method.id);
      void openConfirmation(next);
      return next;
    });

  const submitExistingApplication = () =>
    act(async () => {
      if (!existingApplication || !applicationFields) return;
      const parsed = createPluginCredentialsSchema(applicationFields).safeParse(
        existingApplication.fields,
      );
      if (!parsed.success) {
        setExistingApplication({
          ...existingApplication,
          invalid: new Set(parsed.error.issues.map((issue) => String(issue.path[0]))),
        });
        return;
      }
      Keyboard.dismiss();
      // Keep credentials out of route parameters and query caches.
      await plugins.authorization.useApplication(entry.id, method.id, parsed.data);
      setExistingApplication(null);
      const next = await plugins.authorization.begin(entry.id, method.id);
      void openConfirmation(next);
    });

  const state = observation?.state ?? null;
  const isBusy = isActing || observation?.busy === true;
  const error = actionError ?? observation?.error ?? null;
  return {
    state,
    isBusy,
    error,
    existingApplication,
    setExistingApplication,
    begin,
    submitExistingApplication,
    openConfirmation,
    check: () => plugins.authorization.check(entry.id, method.id),
    cancel: () => act(() => plugins.authorization.cancel(entry.id, method.id)),
    resetApplication: () => act(() => plugins.authorization.resetApplication(entry.id, method.id)),
  };
}
