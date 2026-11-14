import { useEffect, useRef, useState } from 'react';

import { useBackendModule } from '@/frontend/data';
import type { DiagnosticFeedbackContext } from '@/shared/contracts/diagnostics';
import {
  DiagnosticSessionError,
  type DiagnosticSession,
  type DiagnosticReport,
  type DiagnosticAiReport,
  type DiagnosticCheck,
  type DiagnosticEvidence,
} from '@/shared/contracts/diagnosticSession';
import type { UniqueModelId } from '@/shared/data/types/model';

export function useDiagnosticSession(context?: DiagnosticFeedbackContext) {
  const module = useBackendModule('diagnostics');
  const session = useRef<DiagnosticSession>(undefined);
  const active = useRef(false);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState<'check' | 'conversation' | 'ai' | undefined>('check');
  const [report, setReport] = useState<DiagnosticReport>();
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [ai, setAi] = useState<DiagnosticAiReport>();
  const [evidence, setEvidence] = useState<DiagnosticEvidence[]>([]);
  const [error, setError] = useState<DiagnosticSessionError['reason']>();

  useEffect(() => {
    const owned = module.createSession(context);
    session.current = owned;
    active.current = true;
    busyRef.current = true;
    let current = true;
    let firstCheck = true;
    void owned
      .check({
        network: context !== undefined,
        onCheck: (check) => {
          if (current) {
            if (firstCheck) {
              firstCheck = false;
              setBusy('check');
              setChecks([check]);
              setError(undefined);
              setReport(undefined);
              setAi(undefined);
              setEvidence([]);
            } else setChecks((values) => [...values.filter((item) => item.id !== check.id), check]);
          }
        },
      })
      .then((result) => {
        if (current) setReport(result);
      })
      .catch((failure: unknown) => {
        if (current)
          setError(failure instanceof DiagnosticSessionError ? failure.reason : 'unavailable');
      })
      .finally(() => {
        if (current) {
          busyRef.current = false;
          setBusy(undefined);
        }
      });
    return () => {
      current = false;
      active.current = false;
      session.current = undefined;
      void owned.dispose();
    };
  }, [module, context]);

  async function perform(
    kind: 'check' | 'conversation' | 'ai',
    action: (owned: DiagnosticSession) => Promise<void>,
  ) {
    const owned = session.current;
    if (!owned || busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setError(undefined);
    try {
      await action(owned);
    } catch (failure) {
      if (active.current && session.current === owned)
        setError(failure instanceof DiagnosticSessionError ? failure.reason : 'unavailable');
    } finally {
      if (active.current && session.current === owned) {
        busyRef.current = false;
        setBusy(undefined);
      }
    }
  }

  function accept(owned: DiagnosticSession, result: DiagnosticReport) {
    if (active.current && session.current === owned) {
      setReport(result);
      setChecks(result.checks);
    }
  }

  return {
    busy,
    report,
    checks,
    ai,
    evidence,
    error,
    cancel: () => session.current?.cancel(),
    check: (network: boolean) =>
      perform('check', async (owned) => {
        setReport(undefined);
        setAi(undefined);
        setChecks([]);
        setEvidence([]);
        accept(
          owned,
          await owned.check({
            network,
            onCheck: (check) => {
              if (active.current && session.current === owned)
                setChecks((values) => [...values.filter((item) => item.id !== check.id), check]);
            },
          }),
        );
      }),
    checkConversation: () =>
      perform('conversation', async (owned) => {
        setAi(undefined);
        accept(owned, await owned.checkConversation());
      }),
    diagnose: (modelId: UniqueModelId) =>
      perform('ai', async (owned) => {
        setAi(undefined);
        setEvidence([]);
        const result = await owned.diagnose(modelId, (entry) => {
          if (active.current && session.current === owned)
            setEvidence((values) => [...values, entry]);
        });
        if (active.current && session.current === owned) setAi(result);
      }),
  };
}
