import { useToast } from '@cherrystudio/ui/components';
import { clearInitialURL } from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Keyboard, Linking, Platform } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import {
  PluginError,
  type PluginAuthorizationObservation,
  type PluginAuthorizationState,
  type PluginErrorReason,
} from '@/shared/contracts/plugins';
import type {
  PluginCatalogEntry,
  PluginConnection,
  PluginInteractiveMethod,
} from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import { useRefreshPluginConnections } from '../../usePluginConnections';
import {
  getInteractiveConnectProgress,
  type InteractiveConnectOperation,
} from './interactiveConnectProgress';

/** Owns route observation, browser actions and form state; backend observers poll and complete. */
export function useInteractiveConnect(entry: PluginCatalogEntry, method: PluginInteractiveMethod) {
  const plugins = useBackendModule('plugins');
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const refresh = useRefreshPluginConnections();
  const [observation, setObservation] = useState<PluginAuthorizationObservation | null>(null);
  const [actionError, setActionError] = useState<PluginErrorReason | null>(null);
  const [operation, setOperation] = useState<InteractiveConnectOperation | null>(null);
  const acting = useRef(false);
  const [isChecking, setIsChecking] = useState(false);
  const [connection, setConnection] = useState<PluginConnection | null>(null);
  const [isForeground, setIsForeground] = useState(false);
  const [existingApplication, setExistingApplication] = useState<{
    fields: Record<string, string>;
    invalid: Set<string>;
  } | null>(() => (method.applicationSetup ? { fields: {}, invalid: new Set() } : null));
  const finalization = useRef<Promise<void> | null>(null);
  const navigated = useRef(false);
  const browserAttempt = useRef<string | null>(null);
  const name = t(`plugins.catalog.${entry.id}.name`);
  const applicationFields = method.applicationFields;

  useFocusEffect(
    useCallback(() => {
      let detach: (() => void) | null = null;
      const attach = () => {
        setIsForeground(true);
        detach ??= plugins.authorization.observe(entry.id, method.id, (next) => {
          setObservation(next);
          if (next.connection) setConnection(next.connection);
          if (!next.busy) setIsChecking(false);
        });
      };
      const release = () => {
        setIsForeground(false);
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

  const finalize = useEffectEvent(async () => {
    if (Platform.OS === 'ios' && method.interaction === 'polling' && browserAttempt.current) {
      try {
        await WebBrowser.dismissBrowser();
      } catch {
        // Browser dismissal must not block completion of the saved connection.
      }
    }
    // The grant is already saved; a cache refresh failure belongs to the destination page.
    await refresh().catch(() => {});
  });
  const returnToDetail = useEffectEvent(() => {
    toast.show({ label: t('plugins.connectSuccess', { name }), variant: 'success' });
    router.dismissTo({ pathname: '/plugins/[pluginId]', params: { pluginId: entry.id } });
  });
  useEffect(() => {
    if (!connection || !isForeground || navigated.current) return;
    let active = true;
    // A saved connection stays visible even if a background transition detaches the observer.
    finalization.current ??= finalize();
    void finalization.current.then(() => {
      if (!active || navigated.current) return;
      navigated.current = true;
      returnToDetail();
    });
    return () => {
      active = false;
    };
  }, [connection, isForeground]);

  async function openConfirmation(state: PluginAuthorizationState) {
    if (state.status !== 'waiting' && state.status !== 'callback') return;
    if (browserAttempt.current) return;
    browserAttempt.current = state.attemptId;
    try {
      if (state.status === 'callback') {
        const result = await WebBrowser.openAuthSessionAsync(
          state.authorizationUrl,
          state.redirectUrl,
        );
        if (result.type === 'success') {
          clearInitialURL();
          await act('receiving', () =>
            plugins.authorization.receiveCallback(entry.id, method.id, state.attemptId, result.url),
          );
        } else {
          // Closing the browser is an explicit cancellation; the previous grant is untouched.
          await plugins.authorization.cancel(entry.id, method.id, state.attemptId);
        }
        return;
      }
      // Android may resolve immediately; iOS resolves on close (including `cancel`
      // after successful approval). Neither result is proof of success or denial.
      await WebBrowser.openBrowserAsync(state.verificationUrl).catch(() =>
        Linking.openURL(state.verificationUrl),
      );
    } catch (error) {
      setActionError(error instanceof PluginError ? error.reason : 'request');
    } finally {
      browserAttempt.current = null;
      plugins.authorization.check(entry.id, method.id);
    }
  }

  async function act(
    phase: InteractiveConnectOperation,
    action: () => Promise<PluginAuthorizationState | void>,
  ) {
    if (acting.current) return;
    acting.current = true;
    setOperation(phase);
    setActionError(null);
    try {
      const next = await action();
      if (next) {
        // Publish the resulting state with the end of the action, not a frame later via observation.
        setObservation((previous) => ({ ...previous, state: next, busy: previous?.busy ?? false }));
      }
      return next;
    } catch (error) {
      setActionError(error instanceof PluginError ? error.reason : 'request');
      return undefined;
    } finally {
      acting.current = false;
      setOperation(null);
    }
  }

  const begin = async (restart = false) => {
    const next = await act('starting', async () => {
      if (restart) await plugins.authorization.cancel(entry.id, method.id);
      const next = await plugins.authorization.begin(entry.id, method.id);
      if (next.status === 'idle' && applicationFields) {
        setExistingApplication((previous) => previous ?? { fields: {}, invalid: new Set() });
      }
      return next;
    });
    if (next) void openConfirmation(next);
  };

  const submitExistingApplication = async () => {
    const next = await act('starting', async () => {
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
      return plugins.authorization.begin(entry.id, method.id);
    });
    if (next) void openConfirmation(next);
  };

  const state = observation?.state ?? null;
  const error = actionError ?? observation?.error ?? null;
  const progress = getInteractiveConnectProgress({
    state,
    connected: connection !== null,
    operation,
    checking: isChecking,
    error,
  });
  const isBusy = progress !== null;
  return {
    state,
    progress,
    isBusy,
    error,
    existingApplication: state?.status === 'idle' ? existingApplication : null,
    setExistingApplication,
    begin,
    submitExistingApplication,
    openConfirmation,
    check: () => {
      if (isBusy) return;
      setActionError(null);
      setIsChecking(true);
      plugins.authorization.check(entry.id, method.id);
    },
    cancel: () => act('cancelling', () => plugins.authorization.cancel(entry.id, method.id)),
    confirm: () =>
      state?.status === 'review' &&
      act('confirming', () => plugins.authorization.confirm(entry.id, method.id, state.attemptId)),
    resetApplication: () =>
      act('starting', async () => {
        const next = await plugins.authorization.resetApplication(entry.id, method.id);
        setExistingApplication(method.applicationSetup ? { fields: {}, invalid: new Set() } : null);
        return next;
      }),
  };
}
