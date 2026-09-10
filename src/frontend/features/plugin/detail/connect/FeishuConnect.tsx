import { Button, ContentState, useAlert, useToast } from '@cherrystudio/ui/components';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { useBackendModule } from '@/frontend/data';
import {
  PluginError,
  type PluginAuthorizationState,
  type PluginErrorReason,
} from '@/shared/contracts/plugins';
import type { PluginCatalogEntry } from '@/shared/data/types/plugin';

import { getPluginText } from '../../pluginCatalog';
import { useRefreshPluginConnections } from '../../usePluginConnections';

export function FeishuConnect({
  entry,
  onUseCredentials,
}: {
  entry: PluginCatalogEntry;
  onUseCredentials(): void;
}) {
  const plugins = useBackendModule('plugins');
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { alert } = useAlert();
  const refresh = useRefreshPluginConnections();
  const [state, setState] = useState<PluginAuthorizationState | null>(null);
  const [errorReason, setErrorReason] = useState<PluginErrorReason | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const actionPending = useRef(false);
  const checkNow = useRef<(() => Promise<void>) | null>(null);
  const completion = useRef<{ attemptId: string; result: Promise<unknown> } | null>(null);
  const browserOpen = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const name = getPluginText(entry.name, i18n.language);

  const connected = useEffectEvent(async () => {
    if (browserOpen.current) {
      try {
        await WebBrowser.dismissBrowser();
      } catch {
        // Only an owned in-app presentation can be dismissed; external browsers return manually.
      }
    }
    await refresh();
    if (!mounted.current) return;
    toast.show({ label: t('plugins.connectSuccess', { name }), variant: 'success' });
    router.back();
  });
  useEffect(() => {
    if (!isCompleted) return;
    let handled = false;
    const finish = () => {
      if (AppState.currentState !== 'active' || handled) return;
      handled = true;
      void connected();
    };
    finish();
    const listener = AppState.addEventListener('change', finish);
    return () => listener.remove();
  }, [isCompleted]);

  // The screen owns observation, not authorization lifetime. Leaving this route stops
  // scheduling; already issued credentials stay backend-owned for the next visit.
  useFocusEffect(
    useCallback(() => {
      let disposed = false;
      let running = false;
      let checkRequested = false;
      let observation = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const canObserve = () => !disposed && AppState.currentState === 'active';
      async function check() {
        clearTimeout(timer);
        if (!canObserve() || actionPending.current) return;
        if (running) {
          checkRequested = true;
          return;
        }
        running = true;
        checkRequested = false;
        const observationSignal = observation.signal;
        const isCurrent = () => canObserve() && !observationSignal.aborted;
        try {
          let next = await plugins.authorization.getState(entry.id);
          if (!isCurrent()) return;
          if (next.status === 'waiting' && Date.now() >= next.nextPollAt)
            next = await plugins.authorization.poll(entry.id, next.attemptId, observationSignal);
          if (!isCurrent()) return;
          setState(next);
          setErrorReason(null);
          if (next.status === 'ready') {
            setIsBusy(true);
            if (completion.current?.attemptId !== next.attemptId) {
              completion.current = {
                attemptId: next.attemptId,
                result: plugins.authorization.complete(entry.id, next.attemptId),
              };
            }
            await completion.current.result;
            if (!disposed) setIsCompleted(true);
          } else if (next.status === 'waiting') {
            timer = setTimeout(
              () => void check(),
              Math.max(100, Math.min(next.nextPollAt, next.expiresAt) - Date.now()),
            );
          }
        } catch (error) {
          completion.current = null;
          if (!disposed) setErrorReason(error instanceof PluginError ? error.reason : 'request');
          // Retry is explicit after an actual failure. Do not loop permission/storage errors.
        } finally {
          running = false;
          if (!disposed) setIsBusy(false);
          if (checkRequested && canObserve()) void check();
        }
      }
      checkNow.current = check;
      void check();
      const listener = AppState.addEventListener('change', (activity) => {
        if (activity === 'active') {
          observation = new AbortController();
          void check();
        } else {
          observation.abort();
          clearTimeout(timer);
        }
      });
      return () => {
        disposed = true;
        observation.abort();
        if (checkNow.current === check) checkNow.current = null;
        clearTimeout(timer);
        listener.remove();
      };
    }, [plugins, entry.id]),
  );

  async function openConfirmation(next: PluginAuthorizationState) {
    if (next.status !== 'waiting' || browserOpen.current) return;
    browserOpen.current = true;
    try {
      // Android may resolve immediately; iOS resolves on close (including `cancel`
      // after successful approval). Neither result is proof of success or denial.
      try {
        await WebBrowser.openBrowserAsync(next.verificationUrl);
      } catch {
        await Linking.openURL(next.verificationUrl);
      }
    } catch {
      if (mounted.current)
        toast.show({ label: t('plugins.feishu.browserFailed'), variant: 'danger' });
    } finally {
      browserOpen.current = false;
      if (mounted.current) void checkNow.current?.();
    }
  }

  async function begin(restart = false) {
    if (actionPending.current) return;
    actionPending.current = true;
    setIsBusy(true);
    setErrorReason(null);
    let started = false;
    try {
      if (restart) await plugins.authorization.cancel(entry.id);
      const next = await plugins.authorization.begin(entry.id);
      started = true;
      if (mounted.current) {
        setState(next);
        void openConfirmation(next);
      }
    } catch (error) {
      if (mounted.current) setErrorReason(error instanceof PluginError ? error.reason : 'request');
    } finally {
      actionPending.current = false;
      if (mounted.current) {
        setIsBusy(false);
        if (started) void checkNow.current?.();
      }
    }
  }

  async function cancel(resetApplication = false) {
    try {
      const next = resetApplication
        ? await plugins.authorization.resetApplication(entry.id)
        : await plugins.authorization.cancel(entry.id);
      if (mounted.current) {
        setState(next);
        setErrorReason(null);
        void checkNow.current?.();
      }
    } catch (error) {
      if (mounted.current) setErrorReason(error instanceof PluginError ? error.reason : 'storage');
    }
  }

  const waiting = state?.status === 'waiting' ? state : null;
  return (
    <>
      <RouteHeader title={t('plugins.connectTitle', { name })} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-6 px-6 py-6"
        contentInsetAdjustmentBehavior="automatic"
        testID="feishu-connect"
      >
        <Text className="text-base text-muted-foreground">
          {getPluginText(entry.setup, i18n.language)}
        </Text>
        <View className="gap-3">
          <Text className="text-lg font-medium text-foreground">
            {t('plugins.feishu.registrationStep')}
          </Text>
          <Text className="text-lg font-medium text-foreground">
            {t('plugins.feishu.userStep')}
          </Text>
          <Text className="text-sm text-muted-foreground">{t('plugins.feishu.permissions')}</Text>
        </View>
        {!state && !errorReason ? <ContentState.Loading title={t('plugins.loading')} /> : null}
        {waiting ? (
          <View className="gap-3">
            <Text className="text-base font-medium text-foreground">
              {t(`plugins.feishu.waiting.${waiting.stage}`)}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {t('plugins.feishu.returnToCherry')}
            </Text>
            <Text selectable className="text-sm text-foreground">
              {t('plugins.feishu.userCode', { code: waiting.userCode })}
            </Text>
            <Button variant="outline" onPress={() => void openConfirmation(waiting)}>
              {t('plugins.feishu.openAgain')}
            </Button>
            <Button variant="ghost" disabled={isBusy} onPress={() => void checkNow.current?.()}>
              {t('plugins.feishu.checkAgain')}
            </Button>
          </View>
        ) : null}
        {state?.status === 'expired' ||
        state?.status === 'denied' ||
        state?.status === 'unsupported-account' ? (
          <Text className="text-sm text-muted-foreground">
            {t(`plugins.feishu.${state.status}`)}
          </Text>
        ) : null}
        {state?.status === 'application-ready' ? (
          <Text className="text-base text-foreground">{t('plugins.feishu.applicationReady')}</Text>
        ) : null}
        {errorReason ? (
          <ContentState.Error
            title={t(`plugins.errors.${errorReason}`)}
            description={t('plugins.feishu.recovery')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => {
                if (state && state.status !== 'waiting' && state.status !== 'ready') void begin();
                else void checkNow.current?.();
              },
            }}
          />
        ) : null}
        {state && !waiting && state.status !== 'ready' ? (
          <Button size="lg" loading={isBusy} onPress={() => void begin()} testID="feishu-authorize">
            {t(
              state.status === 'application-ready'
                ? 'plugins.feishu.continue'
                : 'plugins.feishu.start',
            )}
          </Button>
        ) : null}
        {state?.status === 'ready' && isBusy ? (
          <ContentState.Loading title={t('plugins.feishu.finishing')} />
        ) : null}
        {errorReason && state?.status === 'ready' ? (
          <Button variant="outline" disabled={isBusy} onPress={() => void begin(true)}>
            {t('plugins.feishu.reauthorize')}
          </Button>
        ) : null}
        {errorReason && state ? (
          <Button
            variant="ghost"
            disabled={isBusy}
            onPress={() =>
              alert.confirm({
                title: t('plugins.feishu.resetApplication'),
                description: t('plugins.feishu.resetApplicationMessage'),
                confirmLabel: t('plugins.feishu.resetApplication'),
                onConfirm: () => void cancel(true),
              })
            }
          >
            {t('plugins.feishu.resetApplication')}
          </Button>
        ) : null}
        {waiting || state?.status === 'ready' || isBusy ? (
          <Button variant="ghost" onPress={() => void cancel()}>
            {t('plugins.feishu.cancel')}
          </Button>
        ) : null}
        <Text className="text-sm text-muted-foreground">{t('plugins.credentialPrivacy')}</Text>
        <Button variant="link" size="inline" disabled={isBusy} onPress={onUseCredentials}>
          {t('plugins.feishu.manual')}
        </Button>
      </ScrollView>
    </>
  );
}
