import { Button, ContentState, useAlert } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import type { PluginCatalogEntry, PluginInteractiveMethod } from '@/shared/data/types/plugin';

import { PluginIdentity } from '../../components/PluginIdentity';
import { PluginPage } from '../../components/PluginPage';
import { CredentialFields, hasEveryField } from './CredentialFields';
import { useInteractiveConnect } from './useInteractiveConnect';

/** Presents provider authorization and account review, with optional application entry. */
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
  const router = useRouter();
  const {
    state,
    progress,
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
    confirm,
  } = useInteractiveConnect(entry, method);
  const name = t(`plugins.catalog.${entry.id}.name`);
  const textKey = `plugins.catalog.${entry.id}.authMethods.${method.id}`;
  const applicationFields = method.applicationFields;
  const waiting = state?.status === 'waiting' || state?.status === 'callback' ? state : null;
  const review = state?.status === 'review' ? state : null;
  const finalStatus =
    state?.status === 'expired' ||
    state?.status === 'denied' ||
    state?.status === 'unsupported-account'
      ? state.status
      : null;
  const isEditingApplication = !!existingApplication && !!applicationFields;
  const progressTitle =
    progress === 'connected'
      ? t('plugins.connectSuccess', { name })
      : progress === 'loading'
        ? t('plugins.loading')
        : progress
          ? t(`plugins.authorization.${progress}`)
          : '';

  let primaryAction: { label: string; onPress?: () => void; disabled?: boolean; testID?: string };
  if (progress) {
    primaryAction = { label: progressTitle, disabled: true };
  } else if (isEditingApplication) {
    primaryAction = {
      label: t('plugins.authorization.useExistingSubmit'),
      onPress: () => void submitExistingApplication(),
      disabled: !hasEveryField(applicationFields!, existingApplication!.fields),
      testID: 'plugin-use-existing-submit',
    };
  } else if (error || finalStatus) {
    primaryAction = {
      label: t('plugins.authorization.reauthorize'),
      onPress: () => void begin(true),
      testID: 'plugin-reauthorize',
    };
  } else if (review) {
    primaryAction = review.requiresDisconnect
      ? {
          label: t('plugins.authorization.manageConnection'),
          onPress: () =>
            router.dismissTo({ pathname: '/plugins/[pluginId]', params: { pluginId: entry.id } }),
        }
      : {
          label: t('plugins.authorization.confirmConnection'),
          onPress: () => void confirm(),
          testID: 'plugin-confirm-connection',
        };
  } else if (waiting) {
    primaryAction = {
      label: t(
        waiting.status === 'waiting'
          ? 'plugins.authorization.checkAgain'
          : 'plugins.authorization.openAgain',
      ),
      onPress: waiting.status === 'waiting' ? check : () => void openConfirmation(waiting),
      testID: 'plugin-check-authorization',
    };
  } else {
    primaryAction = {
      label: t(state?.status === 'application-ready' ? `${textKey}.continue` : `${textKey}.start`),
      onPress: () => void begin(),
      testID: 'plugin-authorize',
    };
  }

  return (
    <>
      <RouteHeader title={t('plugins.connectTitle', { name })} />
      <PluginPage
        testID="plugin-interactive-connect"
        footer={
          <>
            {!isBusy ? (
              <>
                {isEditingApplication ? (
                  <Button variant="ghost" onPress={() => setExistingApplication(null)}>
                    {t('plugins.authorization.useExistingCancel')}
                  </Button>
                ) : (
                  <>
                    {waiting || review ? (
                      <View className="flex-row flex-wrap items-center justify-center gap-2">
                        {waiting?.status === 'waiting' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onPress={() => void openConfirmation(waiting)}
                          >
                            {t('plugins.authorization.openAgain')}
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" onPress={() => void cancel()}>
                          {t('plugins.authorization.cancel')}
                        </Button>
                      </View>
                    ) : (
                      <>
                        {children}
                        {state?.status === 'idle' && applicationFields ? (
                          <Button
                            variant="ghost"
                            onPress={() =>
                              setExistingApplication({ fields: {}, invalid: new Set() })
                            }
                            testID="plugin-use-existing"
                          >
                            {t('plugins.authorization.useExisting')}
                          </Button>
                        ) : null}
                      </>
                    )}
                    {applicationFields &&
                    state &&
                    state.status !== 'idle' &&
                    (error || state.status === 'application-ready') ? (
                      <Button
                        variant="ghost"
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
                  </>
                )}
              </>
            ) : null}
            <Button
              size="lg"
              loading={isBusy && progress !== 'connected'}
              disabled={primaryAction.disabled}
              onPress={primaryAction.onPress}
              testID={primaryAction.testID}
            >
              {primaryAction.label}
            </Button>
          </>
        }
      >
        <PluginIdentity entry={entry} />
        <View
          className="gap-4"
          accessibilityLiveRegion="polite"
          accessibilityState={{ busy: isBusy }}
        >
          {progress ? (
            <Text className="text-lg font-semibold text-foreground">{progressTitle}</Text>
          ) : error ? (
            <ContentState.Error
              layout="leading"
              title={t(`plugins.errors.${error}`)}
              description={t(`${textKey}.recovery`)}
            />
          ) : finalStatus ? (
            <ContentState.Error
              layout="leading"
              title={t(
                finalStatus === 'unsupported-account'
                  ? `${textKey}.unsupported-account`
                  : `plugins.authorization.${finalStatus}`,
              )}
            />
          ) : review ? (
            <View className="gap-3 rounded-2xl bg-secondary p-5">
              <Text className="text-lg font-semibold text-foreground">
                {t('plugins.authorization.reviewAccount', { account: review.accountLabel })}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {t(
                  review.requiresDisconnect
                    ? 'plugins.authorization.requiresDisconnect'
                    : 'plugins.authorization.confirmAccountHint',
                )}
              </Text>
            </View>
          ) : waiting ? (
            <View className="gap-3">
              <Text className="text-lg font-semibold text-foreground">
                {t(`${textKey}.stages.${waiting.stage}.waiting`)}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {t(
                  waiting.status === 'callback'
                    ? 'plugins.authorization.returnFromCallback'
                    : 'plugins.authorization.returnToCherry',
                  { name },
                )}
              </Text>
              {waiting.status === 'waiting' && waiting.userCode ? (
                <Text selectable className="text-base font-medium text-foreground">
                  {t('plugins.authorization.userCode', { code: waiting.userCode })}
                </Text>
              ) : null}
            </View>
          ) : state?.status === 'application-ready' ? (
            <ContentState.Empty
              layout="leading"
              title={t('plugins.authorization.applicationPrepared')}
              description={t('plugins.authorization.applicationReady', {
                applicationId: state.applicationId,
              })}
            />
          ) : (
            <Text className="text-base text-foreground">
              {t(isEditingApplication ? `${textKey}.useExistingSetup` : `${textKey}.setup`)}
            </Text>
          )}
          {isEditingApplication && existingApplication && applicationFields ? (
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
          ) : null}
        </View>
        <View className="gap-3">
          <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
            {t('plugins.privacy')}
          </Text>
          <Text className="text-sm text-muted-foreground">{t(`${textKey}.permissions`)}</Text>
          <Text className="text-sm text-muted-foreground">{t('plugins.credentialPrivacy')}</Text>
        </View>
      </PluginPage>
    </>
  );
}
