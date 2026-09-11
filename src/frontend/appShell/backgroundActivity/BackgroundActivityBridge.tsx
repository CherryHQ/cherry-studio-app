import { useToast } from '@cherrystudio/ui/components';
import { resolveScheme } from 'expo-linking';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { parseBackgroundTaskUrl } from '@/shared/backgroundActivity/taskLink';

import {
  isBackgroundTaskVisible,
  subscribeForegroundActivityAttention,
} from './foregroundActivityAttention';
import { useBackgroundActivityNavigation } from './useBackgroundActivityNavigation';

/** Isolates notification subscriptions from the root navigator's render surface. */
export function BackgroundActivityBridge() {
  useBackgroundActivityNavigation();
  const { toast } = useToast();
  useEffect(
    () =>
      subscribeForegroundActivityAttention((attention) => {
        if (
          AppState.currentState !== 'active' ||
          isBackgroundTaskVisible(parseBackgroundTaskUrl(attention.url, resolveScheme({})))
        )
          return;
        toast.show({
          label: `${attention.title}: ${attention.detail}`,
          variant: attention.phase === 'failed' ? 'danger' : 'warning',
        });
      }),
    [toast],
  );
  return null;
}
