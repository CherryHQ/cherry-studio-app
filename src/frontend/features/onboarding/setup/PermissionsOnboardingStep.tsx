import CalendarIcon from '@cherrystudio/app-icons/icons/calendar';
import CameraIcon from '@cherrystudio/app-icons/icons/camera';
import CheckIcon from '@cherrystudio/app-icons/icons/check';
import HeartIcon from '@cherrystudio/app-icons/icons/heart-pulse';
import ListTodoIcon from '@cherrystudio/app-icons/icons/list-checks';
import MapPinIcon from '@cherrystudio/app-icons/icons/map-pin';
import { cn } from '@cherrystudio/ui/utils';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  getPermissionStatusKey,
  isPermissionSupported,
  type PermissionKind,
  permissionConfig,
  permissionKinds,
  useDevicePermissionAction,
} from '@/frontend/hooks/devicePermission';
import { useDevicePermissionStatuses } from '@/frontend/hooks/useDevicePermissionStatuses';
import type { PermissionStatuses } from '@/shared/contracts';

import { OnboardingButton, OnboardingPage } from '../components/OnboardingPage';
import type { OnboardingProgress } from './useOnboardingProgress';

const ICONS = {
  location: MapPinIcon,
  calendar: CalendarIcon,
  reminders: ListTodoIcon,
  health: HeartIcon,
  camera: CameraIcon,
} satisfies Record<PermissionKind, typeof CameraIcon>;
const SCOPES = permissionKinds.flatMap((kind) => permissionConfig[kind].scopes);

export function PermissionsOnboardingStep({ progress }: { progress: OnboardingProgress }) {
  const { t } = useTranslation();
  const { statuses, refresh } = useDevicePermissionStatuses(SCOPES);

  return (
    <OnboardingPage
      description={t('onboarding.permissions.description')}
      footer={
        <>
          <Text className="text-center text-xs text-muted-foreground">
            {t('onboarding.permissions.optional')}
          </Text>
          <OnboardingButton
            loading={progress.isSaving}
            onPress={() => void progress.advance('notifications')}
            testID="onboarding-permissions-continue"
          >
            {t('onboarding.continue')}
          </OnboardingButton>
        </>
      }
      onBack={progress.isSaving ? undefined : () => void progress.advance('privacy')}
      step={{ current: 2, total: 4, label: t('onboarding.preparation.step', { current: 2 }) }}
      testID="onboarding-permissions"
      title={t('onboarding.permissions.title')}
    >
      <View className="gap-3">
        {permissionKinds
          .filter((kind) => isPermissionSupported(kind, statuses))
          .map((kind) => (
            <PermissionOption
              disabled={progress.isSaving}
              key={kind}
              kind={kind}
              refresh={refresh}
              statuses={statuses}
            />
          ))}
      </View>
    </OnboardingPage>
  );
}

/** The onboarding owns the row; settings and onboarding use the same permission action. */
function PermissionOption({
  disabled,
  kind,
  refresh,
  statuses,
}: {
  disabled: boolean;
  kind: PermissionKind;
  refresh: () => Promise<void>;
  statuses: PermissionStatuses;
}) {
  const { t } = useTranslation();
  const { status, action, pending, handlePress } = useDevicePermissionAction({
    kind,
    statuses,
    refresh,
  });
  const Icon = ICONS[kind];
  const settled = status?.state === 'granted' || status?.state === 'requested';
  const label = t(`settings.permissions.type.${kind}`);
  const statusText = status
    ? t(getPermissionStatusKey(kind, status))
    : t('settings.permissions.checking');
  const actionLabel = action ? t(`settings.permissions.action.${action}`) : '';
  const blocked = disabled || pending || !action;
  const statusLabel = (
    <View className="min-w-0 shrink flex-row items-center justify-end gap-1">
      {settled && !pending ? <CheckIcon className="size-3.5 shrink-0 text-foreground" /> : null}
      <Text className="shrink text-right text-xs text-muted-foreground">
        {pending ? t('onboarding.loading') : settled ? statusText : actionLabel || statusText}
      </Text>
    </View>
  );

  return (
    <Pressable
      accessibilityLabel={`${label}: ${statusText}, ${actionLabel}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: pending }}
      className={cn(
        'min-h-20 flex-row items-center gap-4 rounded-2xl border border-border p-4 active:opacity-70',
        (pending || disabled) && 'opacity-50',
      )}
      disabled={blocked}
      onPress={() => void handlePress()}
      testID={`onboarding-permission-${kind}`}
    >
      <Icon className="size-5 shrink-0 text-foreground" />
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="shrink font-medium text-base text-foreground">{label}</Text>
          {statusLabel}
        </View>
        <Text className="text-sm text-muted-foreground">{t(`onboarding.permissions.${kind}`)}</Text>
      </View>
    </Pressable>
  );
}
