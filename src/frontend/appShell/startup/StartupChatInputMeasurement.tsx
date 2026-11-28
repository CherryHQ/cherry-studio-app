import { useGlobalSearchParams, usePathname } from 'expo-router';
import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAccount } from '@/frontend/appShell/account';
import type { ChatRouteParamsInput } from '@/frontend/appShell/navigation/chat';
import { recordStartupChatInputReady } from '@/frontend/appShell/observability';
import { usePrivacyConsentPending } from '@/frontend/appShell/privacy';
import { ComposerFieldReadyContext } from '@/frontend/components/Composer/fieldReadiness';

import { useStartupCoverVisible } from './StartupReadinessContext';

/** The navigator owns the launch window even if the chat mounts after splash dismissal. */
export function StartupChatInputMeasurement({ children }: PropsWithChildren) {
  const [pending, setPending] = useState(true);
  const [fieldReady, setFieldReady] = useState(false);
  const finish = useCallback(() => setPending(false), []);
  return (
    <ComposerFieldReadyContext value={pending ? setFieldReady : undefined}>
      {children}
      {pending ? <MeasureInput fieldReady={fieldReady} finish={finish} /> : null}
    </ComposerFieldReadyContext>
  );
}

function MeasureInput({ fieldReady, finish }: { fieldReady: boolean; finish: () => void }) {
  const covered = useStartupCoverVisible();
  const pathname = usePathname();
  const {
    agentId,
    sessionId,
    composerHandoff,
    selectionHandoff,
    workspaceDraftId,
    sshDraftId,
    messageId,
    messageRequestId,
  } = useGlobalSearchParams<ChatRouteParamsInput>();
  const specialEntry = Boolean(
    sessionId ||
    composerHandoff ||
    selectionHandoff ||
    workspaceDraftId ||
    sshDraftId ||
    messageId ||
    messageRequestId,
  );
  const [enteredWithAgent] = useState(() => Boolean(agentId));
  const abandoned = enteredWithAgent || specialEntry || (pathname !== '' && pathname !== '/');
  const ready = pathname === '/' && Boolean(agentId) && fieldReady && !covered;
  const { state } = useAccount();
  const privacyPending = usePrivacyConsentPending();
  const settled = useRef(false);
  useEffect(() => {
    function cancel() {
      settled.current = true;
      finish();
    }
    if (
      abandoned ||
      privacyPending ||
      (state.isEnterprise && state.needsSignIn) ||
      AppState.currentState === 'background'
    ) {
      cancel();
      return;
    }
    function check(appState: typeof AppState.currentState) {
      if (appState === 'background') cancel();
      else if (!settled.current && appState === 'active' && ready && !state.isRestoringSession) {
        settled.current = true;
        recordStartupChatInputReady();
        finish();
      }
    }
    check(AppState.currentState);
    if (settled.current) return;
    const subscription = AppState.addEventListener('change', check);
    return () => subscription.remove();
  }, [
    abandoned,
    finish,
    privacyPending,
    ready,
    state.isEnterprise,
    state.isRestoringSession,
    state.needsSignIn,
  ]);
  return null;
}
