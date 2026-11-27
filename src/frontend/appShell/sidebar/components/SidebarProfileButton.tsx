import SettingsIcon from '@cherrystudio/app-icons/icons/settings';
import { TextAnimation } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, AppState, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';

import { useAccount } from '@/frontend/appShell/account';
import { ProfileAvatarImage } from '@/frontend/components/Avatar';
import { usePreference } from '@/frontend/data/hooks';
import { useCloud } from '@/frontend/hooks/useCloud';
import { appSidebar } from '@/frontend/utils/constants';
import { getActiveCloudEntitlements } from '@/shared/contracts/cloud';

import { useSidebarPresence } from '../hooks/useSidebarPresence';
import { formatQuotaWindow, formatQuotaWindowShort } from '../utils/cloudQuota';
import { SidebarAvatarRing } from './SidebarAvatarRing';

type SidebarProfileButtonProps = {
  disabled: boolean;
  selected: boolean;
  onPress: () => void;
};

type QuotaWindow = {
  label: string;
  percent: string;
  ratio: number;
  text: string;
};

export function SidebarProfileButton(props: SidebarProfileButtonProps) {
  const { t, i18n } = useTranslation();
  const { state: account } = useAccount();
  const { cloud, state } = useCloud();
  const presence = useSidebarPresence();
  const isVisible = presence !== 'closed';
  const initialReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  const [isForeground, setIsForeground] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const foreground = AppState.addEventListener('change', (status) => {
      setIsForeground(status === 'active');
    });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      foreground.remove();
      motion.remove();
    };
  }, []);

  useEffect(() => {
    if (presence === 'persistent' && isForeground) void cloud.refresh('if-stale').catch(() => {});
  }, [cloud, isForeground, presence]);

  const activeEntitlements = account.isEnterprise ? [] : getActiveCloudEntitlements(state);
  const activePlan = state.plans?.entitlements.find(
    (entry) =>
      entry.state === 'active' &&
      !entry.plan.is_free &&
      activeEntitlements.some((entitlement) => entitlement.plan_id === entry.plan.id),
  );
  const planName = activeEntitlements.length
    ? activePlan?.plan.display_name.trim() || t('cloud.title')
    : undefined;
  const quotas =
    state.account?.quota_pools
      .filter((pool) =>
        activePlan?.quota_pools.some((planPool) => planPool.allocation_id === pool.allocation_id),
      )
      .flatMap((pool) =>
        pool.windows.map((window) => {
          const ratio =
            window.limit_units > 0 ? Math.min(window.remaining_units / window.limit_units, 1) : 0;
          const percent = ratio.toLocaleString(i18n.language, {
            style: 'percent',
            maximumFractionDigits: 0,
          });
          return {
            label: [
              pool.display_name,
              t('cloud.quotaWindowRemaining', {
                window: formatQuotaWindow(window, i18n.language, t),
                remaining: t('cloud.remainingPercent', { percent }),
              }),
            ]
              .filter(Boolean)
              .join(' · '),
            percent,
            ratio,
            text: t('cloud.quotaWindowRemainingShort', {
              window: formatQuotaWindowShort(window, i18n.language, t),
              percent,
            }),
          };
        }),
      ) ?? [];
  return (
    <ProfileButtonContent
      key={JSON.stringify([
        state.account?.account.id,
        activePlan?.plan.id ?? activeEntitlements[0]?.plan_id,
      ])}
      {...props}
      active={isVisible && isForeground && !props.disabled && !reducedMotion}
      planName={planName}
      quotas={quotas}
      reducedMotion={reducedMotion}
    />
  );
}

function ProfileButtonContent({
  active,
  disabled,
  onPress,
  planName,
  quotas,
  reducedMotion,
  selected,
}: SidebarProfileButtonProps & {
  active: boolean;
  planName?: string;
  quotas: readonly QuotaWindow[];
  reducedMotion: boolean;
}) {
  const { t } = useTranslation();
  const [userName] = usePreference('app.user.name');
  const displayName = userName.trim() || t('settings.profile.title');
  const avatar = <ProfileAvatarImage accessibilityLabel={displayName} size={36} />;

  // Frame zero is the plan. Both the arc and its caption read the same quota window after that.
  const [activeIndex, setActiveIndex] = useState(0);
  const frameCount = quotas.length + 1;
  const rotating = Boolean(planName && active && quotas.length);
  if (!rotating && activeIndex !== 0) setActiveIndex(0);
  const index = activeIndex % frameCount;
  useEffect(() => {
    if (!rotating) return;
    const timer = setTimeout(
      () => setActiveIndex((current) => (current + 1) % frameCount),
      index === 0 ? 4000 : 3000,
    );
    return () => clearTimeout(timer);
  }, [frameCount, index, rotating]);

  const quota = reducedMotion ? quotas[0] : quotas[index - 1];
  const quotaText =
    quota &&
    (quotas.length === 1
      ? t('cloud.remainingPercentShort', { percent: quota.percent })
      : quota.text);
  const accessibilityValue = [displayName, planName, ...quotas.map((item) => item.label)]
    .filter(Boolean)
    .join('; ');

  return (
    <Pressable
      accessibilityLabel={t('navigation.settings')}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      accessibilityValue={{ text: accessibilityValue }}
      disabled={disabled}
      onPress={onPress}
      style={{ flex: 1 }}
      testID="sidebar-settings"
    >
      {({ pressed }) => (
        <View
          className={cn(
            'flex-row items-center gap-3 rounded-3xl bg-secondary px-2 py-1',
            pressed && 'opacity-60',
          )}
          style={{ minHeight: appSidebar.dockHeight }}
        >
          {planName ? (
            <SidebarAvatarRing active={active} ratio={quota?.ratio}>
              {avatar}
            </SidebarAvatarRing>
          ) : (
            avatar
          )}
          <View className="min-w-0 flex-1">
            <Text className="font-semibold text-base text-sidebar-foreground" numberOfLines={1}>
              {displayName}
            </Text>
            {planName ? (
              <View testID="sidebar-plan-badge">
                {rotating ? (
                  <TextAnimation.Rotating
                    className="w-full"
                    direction={index === 0 ? 'down' : 'up'}
                    numberOfLines={1}
                    text={quotaText ?? planName}
                    textClassName="text-xs text-muted-foreground tabular-nums"
                  />
                ) : (
                  <View className="flex-row items-center gap-1">
                    <Text className="shrink text-xs text-muted-foreground" numberOfLines={1}>
                      {planName}
                    </Text>
                    {quota ? (
                      <Text className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {quota.percent}
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            ) : null}
          </View>
          <View
            className={cn(
              'size-10 shrink-0 items-center justify-center rounded-full',
              selected ? 'bg-sidebar-foreground' : 'bg-secondary',
            )}
          >
            <SettingsIcon
              className={cn('size-5', selected ? 'text-background' : 'text-sidebar-foreground')}
            />
          </View>
        </View>
      )}
    </Pressable>
  );
}
