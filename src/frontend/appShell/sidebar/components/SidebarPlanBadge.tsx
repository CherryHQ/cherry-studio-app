import { TextAnimation } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, AppState, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useAccount } from '@/frontend/appShell/account';
import { useCloud } from '@/frontend/hooks/useCloud';
import { formatQuotaWindow, formatQuotaWindowShort } from '@/frontend/utils/cloudQuota';

import { useSidebarPresence } from '../hooks/useSidebarPresence';
import { useSidebarSelectionSnapshot } from '../SidebarSelectionProvider';

/** Cloud and lifecycle changes stay local to the small profile badge. */
export function SidebarPlanBadge() {
  const { t, i18n } = useTranslation();
  const { state: account } = useAccount();
  const { state } = useCloud();
  const isVisible = useSidebarPresence() !== 'closed';
  const isSelecting = useSidebarSelectionSnapshot((selection) => selection.isSelecting);
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

  if (account.isEnterprise) return null;
  const activePlan =
    state.plans?.entitlements.find((entry) => entry.state === 'active' && !entry.plan.is_free) ??
    state.plans?.entitlements.find((entry) => entry.state === 'active');
  const planName =
    activePlan?.plan.display_name ??
    (state.phase === 'loading' || state.phase === 'error' ? '—' : t('cloud.free'));
  const quotas =
    activePlan?.quota_pools.flatMap((pool) =>
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
          text: t('cloud.quotaWindowRemainingShort', {
            window: formatQuotaWindowShort(window, i18n.language, t),
            percent,
          }),
        };
      }),
    ) ?? [];
  const firstQuota = quotas[0];
  const labels: readonly [string, ...string[]] = [
    planName,
    ...quotas.map((quota) =>
      quotas.length === 1
        ? t('cloud.remainingPercentShort', { percent: quota.percent })
        : quota.text,
    ),
  ];
  const isRotating = firstQuota && isVisible && isForeground && !isSelecting && !reducedMotion;

  return (
    <View
      accessibilityLabel={[planName, ...quotas.map((quota) => quota.label)].join('; ')}
      accessible
      className={cn(
        'max-w-28 shrink overflow-hidden rounded-lg border border-dashed border-border-strong py-0.5',
        firstQuota ? 'w-26 px-2.5' : 'px-3',
      )}
      testID="sidebar-plan-badge"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {isRotating ? (
          <SidebarPlanRotation key={activePlan?.id} labels={labels} />
        ) : reducedMotion && firstQuota ? (
          <View className="flex-row items-center justify-center gap-1">
            <Text className="shrink text-sm text-sidebar-foreground" numberOfLines={1}>
              {planName}
            </Text>
            <Text className="shrink-0 text-sm text-sidebar-foreground tabular-nums">
              {firstQuota.percent}
            </Text>
          </View>
        ) : (
          <Text className="text-center text-sm text-sidebar-foreground" numberOfLines={1}>
            {planName}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * State indication: the plan rests for 4s, then each quota window for 3s. CherryUI owns the
 * interruptible slide/fade on the UI thread. Unmounting on hide/background/selection cancels the
 * timer and starts the next appearance at the plan. Reduce Motion uses the static badge above.
 */
function SidebarPlanRotation({ labels }: { labels: readonly [string, ...string[]] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const index = activeIndex % labels.length;
  useEffect(() => {
    const timer = setTimeout(
      () => setActiveIndex((current) => (current + 1) % labels.length),
      index === 0 ? 4000 : 3000,
    );
    return () => clearTimeout(timer);
  }, [index, labels.length]);

  return (
    <TextAnimation.Rotating
      className="w-full"
      direction={index === 0 ? 'down' : 'up'}
      numberOfLines={1}
      text={labels[index] ?? labels[0]}
      textClassName="text-center text-sm text-sidebar-foreground tabular-nums"
    />
  );
}
