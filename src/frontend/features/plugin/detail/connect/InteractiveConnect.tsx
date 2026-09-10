import { Button, ContentState, useAlert, useToast } from '@cherrystudio/ui/components';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Keyboard, Linking, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader } from '@/frontend/appShell/header';
import { useBackendModule } from '@/frontend/data';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import {
  PluginError,
  type PluginAuthorizationObservation,
  type PluginAuthorizationState,
  type PluginErrorReason,
} from '@/shared/contracts/plugins';
import type { PluginCatalogEntry, PluginInteractiveMethod } from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import { useRefreshPluginConnections } from '../../usePluginConnections';
import { CredentialFields, hasEveryField } from './CredentialFields';

/**
 * Renders the backend's authorization observation and forwards user actions. Polling,
 * completion and retry bookkeeping live in the backend observer, attached only while this
 * route is focused and the app is active.
 */
export function InteractiveConnect({
  entry,
  method,
  children,
}: {
  entry: PluginCatalogEntry;
  method: PluginInteractiveMethod;
  children: ReactNode;
}) {
  const plugins = useBackendModule('plugins');
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { alert } = useAlert();
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
  const textKey = `plugins.catalog.${entry.id}.authMethods.${method.id}`;
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
  const busy = isActing || observation?.busy === true;
  const error = actionError ?? observation?.error ?? null;
  const waiting = state?.status === 'waiting' ? state : null;
  const finalStatus =
    state?.status === 'expired' ||
    state?.status === 'denied' ||
    state?.status === 'unsupported-account'
      ? state.status
      : null;
  return (
    <>
      <RouteHeader title={t('plugins.connectTitle', { name })} />
      <KeyboardAwareScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-6 px-6 py-6"
        contentInsetAdjustmentBehavior="automatic"
        bottomOffset={keyboardBottomOffset}
        keyboardShouldPersistTaps="handled"
        testID="plugin-interactive-connect"
      >
        <Text className="text-base text-muted-foreground">{t(`${textKey}.setup`)}</Text>
        <View className="gap-3">
          {method.stages.map((stage) => (
            <Text key={stage} className="text-lg font-medium text-foreground">
              {t(`${textKey}.stages.${stage}.title`)}
            </Text>
          ))}
          <Text className="text-sm text-muted-foreground">{t(`${textKey}.permissions`)}</Text>
        </View>
        {!state ? <ContentState.Loading title={t('plugins.loading')} /> : null}
        {waiting ? (
          <View className="gap-3">
            <Text className="text-base font-medium text-foreground">
              {t(`${textKey}.stages.${waiting.stage}.waiting`)}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {t('plugins.authorization.returnToCherry', { name })}
            </Text>
            {waiting.userCode ? (
              <Text selectable className="text-sm text-foreground">
                {t('plugins.authorization.userCode', { code: waiting.userCode })}
              </Text>
            ) : null}
            <Button variant="outline" onPress={() => void openConfirmation(waiting)}>
              {t('plugins.authorization.openAgain')}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onPress={() => plugins.authorization.check(entry.id, method.id)}
            >
              {t('plugins.authorization.checkAgain')}
            </Button>
          </View>
        ) : null}
        {finalStatus ? (
          <Text className="text-sm text-muted-foreground">
            {t(
              finalStatus === 'unsupported-account'
                ? `${textKey}.unsupported-account`
                : `plugins.authorization.${finalStatus}`,
            )}
          </Text>
        ) : null}
        {state?.status === 'application-ready' ? (
          <Text className="text-base text-foreground">
            {t('plugins.authorization.applicationReady', { applicationId: state.applicationId })}
          </Text>
        ) : null}
        {error ? (
          <ContentState.Error
            title={t(`plugins.errors.${error}`)}
            description={t(`${textKey}.recovery`)}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => {
                setActionError(null);
                if (waiting || state?.status === 'ready')
                  plugins.authorization.check(entry.id, method.id);
                else void begin();
              },
            }}
          />
        ) : null}
        {state?.status === 'idle' && existingApplication && applicationFields ? (
          <View className="gap-4">
            <Text className="text-sm text-muted-foreground">
              {t(`${textKey}.useExistingSetup`)}
            </Text>
            <CredentialFields
              pluginId={entry.id}
              fields={applicationFields}
              values={existingApplication.fields}
              invalidFields={existingApplication.invalid}
              disabled={busy}
              onChange={(fieldId, value) =>
                setExistingApplication((previous) => {
                  if (!previous) return previous;
                  const invalid = new Set(previous.invalid);
                  invalid.delete(fieldId);
                  return { fields: { ...previous.fields, [fieldId]: value }, invalid };
                })
              }
              onSubmit={() => void submitExistingApplication()}
            />
            <Button
              size="lg"
              loading={busy}
              disabled={!hasEveryField(applicationFields, existingApplication.fields)}
              onPress={() => void submitExistingApplication()}
              testID="plugin-use-existing-submit"
            >
              {t('plugins.authorization.useExistingSubmit')}
            </Button>
            <Button variant="ghost" disabled={busy} onPress={() => setExistingApplication(null)}>
              {t('plugins.authorization.useExistingCancel')}
            </Button>
          </View>
        ) : null}
        {state && !waiting && state.status !== 'ready' && !existingApplication ? (
          <Button size="lg" loading={busy} onPress={() => void begin()} testID="plugin-authorize">
            {t(state.status === 'application-ready' ? `${textKey}.continue` : `${textKey}.start`)}
          </Button>
        ) : null}
        {state?.status === 'idle' && !existingApplication && applicationFields ? (
          <Button
            variant="outline"
            disabled={busy}
            onPress={() => setExistingApplication({ fields: {}, invalid: new Set() })}
            testID="plugin-use-existing"
          >
            {t('plugins.authorization.useExisting')}
          </Button>
        ) : null}
        {state?.status === 'ready' && !error ? (
          <ContentState.Loading title={t('plugins.authorization.finishing')} />
        ) : null}
        {error && state?.status === 'ready' ? (
          <Button variant="outline" disabled={busy} onPress={() => void begin(true)}>
            {t('plugins.authorization.reauthorize')}
          </Button>
        ) : null}
        {applicationFields &&
        state &&
        state.status !== 'idle' &&
        (error || state.status === 'application-ready') ? (
          <Button
            variant="ghost"
            disabled={busy}
            onPress={() =>
              alert.confirm({
                title: t('plugins.authorization.resetApplication'),
                description: t('plugins.authorization.resetApplicationMessage'),
                confirmLabel: t('plugins.authorization.resetApplication'),
                onConfirm: () =>
                  void act(() => plugins.authorization.resetApplication(entry.id, method.id)),
              })
            }
          >
            {t('plugins.authorization.resetApplication')}
          </Button>
        ) : null}
        {waiting || state?.status === 'ready' ? (
          <Button
            variant="ghost"
            onPress={() => void act(() => plugins.authorization.cancel(entry.id, method.id))}
          >
            {t('plugins.authorization.cancel')}
          </Button>
        ) : null}
        <Text className="text-sm text-muted-foreground">{t('plugins.credentialPrivacy')}</Text>
        {children}
      </KeyboardAwareScrollView>
    </>
  );
}
