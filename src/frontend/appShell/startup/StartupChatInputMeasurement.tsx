import { useGlobalSearchParams, usePathname } from 'expo-router';
import { type PropsWithChildren, use, useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAccount } from '@/frontend/appShell/account';
import { RequiredUpdateContext } from '@/frontend/appShell/appUpdate/requiredUpdate';
import type { ChatRouteParamsInput } from '@/frontend/appShell/navigation/chat';
import { recordStartupChatInputReady } from '@/frontend/appShell/observability';
import { usePrivacyConsentPending } from '@/frontend/appShell/privacy';
import {
  useSystemEntryReceiving,
  useSystemShareDestination,
} from '@/frontend/appShell/systemEntry';
import { ComposerFieldReadyContext } from '@/frontend/components/Composer/fieldReadiness';
import { wasStartupInterrupted } from '@/shared/core/logger/startupDiagnostics';

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
  const { state } = useAccount();
  const privacyPending = usePrivacyConsentPending();
  const requiredUpdate = use(RequiredUpdateContext);
  const { startupShareCheck } = useSystemShareDestination();
  const receivingShare = useSystemEntryReceiving();
  const excluded =
    enteredWithAgent ||
    specialEntry ||
    (pathname !== '' && pathname !== '/') ||
    privacyPending ||
    requiredUpdate ||
    receivingShare ||
    startupShareCheck === 'excluded' ||
    (state.isEnterprise && state.needsSignIn);
  const ready =
    pathname === '/' && Boolean(agentId) && fieldReady && !covered && !state.isRestoringSession;
  const settled = useRef(false);
  const readyAt = useRef<number | null>(null);
  useEffect(() => {
    function check(appState: typeof AppState.currentState) {
      if (settled.current) return;
      if (excluded || appState === 'background' || wasStartupInterrupted()) {
        settled.current = true;
        finish();
        return;
      }
      if (appState !== 'active' || !ready) {
        readyAt.current = null;
        return;
      }
      // Classification can finish later than layout. Preserve the instant typing became possible.
      readyAt.current ??= performance.now();
      if (startupShareCheck === 'clear') {
        settled.current = true;
        recordStartupChatInputReady(readyAt.current);
        finish();
      }
    }
    check(AppState.currentState);
    if (settled.current) return;
    const subscription = AppState.addEventListener('change', check);
    return () => subscription.remove();
  }, [excluded, finish, ready, startupShareCheck]);
  return null;
}
