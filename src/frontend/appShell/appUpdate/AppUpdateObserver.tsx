import { useQuery } from '@tanstack/react-query';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { type ChatRouteParamsInput, parseChatRoute } from '@/frontend/appShell/navigation/chat';
import { usePrivacyConsentPending } from '@/frontend/appShell/privacy';
import { useStartupCoverVisible } from '@/frontend/appShell/startup';
import { appUpdateQueryOptions } from '@/frontend/data/appUpdate';
import { useBackendModule } from '@/frontend/data/BackendProvider';
import { cacheService } from '@/frontend/data/CacheService';

import { useAppUpdateActions } from './AppUpdateProvider';

const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Checks after bootstrap and offers a newer release once per cold start, only on the plain landing
 * chat: a launch from a share, notification or link keeps its destination uninterrupted, and a
 * foreground refresh never interrupts a session already in use.
 */
export function AppUpdateObserver() {
  const appUpdate = useBackendModule('appUpdate');
  const { data, status } = useQuery(appUpdateQueryOptions(appUpdate));
  const actions = useAppUpdateActions();
  const coverVisible = useStartupCoverVisible();
  const privacyPending = usePrivacyConsentPending();
  const pathname = usePathname();
  const params = useGlobalSearchParams<ChatRouteParamsInput>();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const settled = useRef(false);
  const route = parseChatRoute(params);
  // A new chat with nothing handed to it; a share or a notification arrives with a target.
  const landing =
    pathname === '/' &&
    (route.status === 'empty' ||
      (route.status === 'ready' &&
        route.target.kind === 'draft' &&
        !route.target.composerHandoff &&
        !route.target.selectionHandoff));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (settled.current || !active || coverVisible) return;
    // Leaving the landing chat, a pending privacy decision, or a failed first check ends this
    // launch's chance to prompt; the next cold start tries again.
    if (!landing || privacyPending || status === 'error') {
      settled.current = true;
      return;
    }
    if (status !== 'success') return;
    settled.current = true;
    if (data.status !== 'available' || appUpdate.getDownload().status !== 'idle') return;
    const previous = cacheService.getPersist('app_update.last_reminder');
    const now = Date.now();
    if (
      previous?.releaseId === data.id &&
      now >= previous.remindedAt &&
      now - previous.remindedAt < REMINDER_INTERVAL_MS
    )
      return;
    actions.open(data);
  }, [active, coverVisible, privacyPending, landing, status, data, appUpdate, actions]);

  return null;
}
