import { Button, ContentState, useAlert } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader } from '@/frontend/appShell/header';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import type { PluginCatalogEntry, PluginInteractiveMethod } from '@/shared/data/types/plugin';

import { CredentialFields, hasEveryField } from './CredentialFields';
import { useInteractiveConnect } from './useInteractiveConnect';

/** Presents browser-confirmation stages and the optional existing-application form. */
export function InteractiveConnect({
  entry,
  method,
  children,
}: {
  entry: PluginCatalogEntry;
  method: PluginInteractiveMethod;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const {
    state,
    isBusy,
    error,
    existingApplication,
    setExistingApplication,
    begin,
    submitExistingApplication,
    openConfirmation,
    check,
    cancel,
    resetApplication,
  } = useInteractiveConnect(entry, method);
  const name = t(`plugins.catalog.${entry.id}.name`);
  const textKey = `plugins.catalog.${entry.id}.authMethods.${method.id}`;
  const applicationFields = method.applicationFields;
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
            <Button variant="ghost" disabled={isBusy} onPress={() => check()}>
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
              onPress: () => void begin(true),
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
              disabled={isBusy}
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
              loading={isBusy}
              disabled={!hasEveryField(applicationFields, existingApplication.fields)}
              onPress={() => void submitExistingApplication()}
              testID="plugin-use-existing-submit"
            >
              {t('plugins.authorization.useExistingSubmit')}
            </Button>
            <Button variant="ghost" disabled={isBusy} onPress={() => setExistingApplication(null)}>
              {t('plugins.authorization.useExistingCancel')}
            </Button>
          </View>
        ) : null}
        {state && !waiting && state.status !== 'ready' && !existingApplication ? (
          <Button size="lg" loading={isBusy} onPress={() => void begin()} testID="plugin-authorize">
            {t(state.status === 'application-ready' ? `${textKey}.continue` : `${textKey}.start`)}
          </Button>
        ) : null}
        {state?.status === 'idle' && !existingApplication && applicationFields ? (
          <Button
            variant="outline"
            disabled={isBusy}
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
          <Button variant="outline" disabled={isBusy} onPress={() => void begin(true)}>
            {t('plugins.authorization.reauthorize')}
          </Button>
        ) : null}
        {applicationFields &&
        state &&
        state.status !== 'idle' &&
        (error || state.status === 'application-ready') ? (
          <Button
            variant="ghost"
            disabled={isBusy}
            onPress={() =>
              alert.confirm({
                title: t('plugins.authorization.resetApplication'),
                description: t('plugins.authorization.resetApplicationMessage'),
                confirmLabel: t('plugins.authorization.resetApplication'),
                onConfirm: () => void resetApplication(),
              })
            }
          >
            {t('plugins.authorization.resetApplication')}
          </Button>
        ) : null}
        {waiting || state?.status === 'ready' ? (
          <Button variant="ghost" onPress={() => void cancel()}>
            {t('plugins.authorization.cancel')}
          </Button>
        ) : null}
        <Text className="text-sm text-muted-foreground">{t('plugins.credentialPrivacy')}</Text>
        {children}
      </KeyboardAwareScrollView>
    </>
  );
}
