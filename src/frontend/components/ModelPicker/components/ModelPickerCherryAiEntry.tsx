import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { Button, Spinner } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { CloudState } from '@/shared/contracts/cloud';

export function ModelPickerCherryAiEntry({
  state,
  restoring,
  onRetry,
}: {
  state: CloudState;
  restoring: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  if (state.guestCatalog === 'error' || state.phase === 'error') {
    const isReauth = state.accountIssue === 'reauth_required';
    const messageKey =
      state.accountIssue === 'account_disabled'
        ? 'cloud.accountDisabled'
        : isReauth
          ? 'cloud.sessionExpired'
          : 'chat.errorPart.reason.providerUnavailable';
    const actionKey = isReauth ? 'account.login.reSignIn' : 'common.retry';

    return (
      <View
        className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2.5 rounded-2xl border border-border border-continuous bg-card py-2.5 pl-3.5 pr-2.5 dark:bg-secondary"
        testID="model-picker-cherryai-error"
      >
        <View className="min-w-40 flex-1 flex-row items-start gap-2.5">
          <CircleAlertIcon
            accessible={false}
            className={cn('mt-0.5 size-4 shrink-0', isReauth ? 'text-warning' : 'text-error')}
          />
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            className="min-w-0 flex-1 font-medium text-foreground text-sm"
          >
            {t(messageKey)}
          </Text>
        </View>
        <Button
          hitSlop={4}
          icon={isReauth ? undefined : <RefreshCwIcon />}
          loading={!isReauth && state.isRefreshing}
          onPress={onRetry}
          shape="pill"
          size="sm"
          testID="model-picker-cherryai-retry"
          variant="tonal"
        >
          {t(actionKey)}
        </Button>
      </View>
    );
  }

  const loading =
    restoring ||
    state.phase === 'loading' ||
    (state.phase === 'signed_out' && state.guestCatalog !== 'ready');

  if (loading) {
    return (
      <View
        accessibilityState={{ busy: true }}
        className="min-h-11 flex-row items-center gap-2.5 py-2"
        testID="model-picker-cherryai-loading"
      >
        <Spinner
          accessibilityLabel={t('settings.provider.models.loading')}
          accessibilityRole="progressbar"
          size="sm"
        />
        <Text className="min-w-0 flex-1 text-muted-foreground text-sm">
          {t('settings.provider.models.loading')}
        </Text>
      </View>
    );
  }

  return (
    <View className="min-h-10 justify-center py-2" testID="model-picker-cherryai-empty">
      <Text className="text-muted-foreground text-sm">{t('modelPicker.empty')}</Text>
    </View>
  );
}
