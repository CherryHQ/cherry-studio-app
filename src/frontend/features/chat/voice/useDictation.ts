import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useComposerActions, useComposerState } from '@/frontend/components/Composer';
import { useBackendModule } from '@/frontend/data';
import { VoiceError, type DictationSession } from '@/shared/contracts/voice';
import { appendUtterance } from '@/shared/utils/dictationText';

import { voiceErrorLabelKey } from './voiceErrorLabel';

export type DictationState = 'idle' | 'starting' | 'listening' | 'finishing';

/**
 * Dictates into the composer draft: recognized text follows what was already typed and is
 * updated live. Cancelling or failing restores the draft as it was; nothing is sent automatically.
 *
 * Dictation owns only the text it appended. Each write applies when the draft is still exactly
 * what dictation last wrote, so typing or sending meanwhile hands the draft back to the user.
 */
export function useDictation() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();
  const voice = useBackendModule('voice');
  const permissions = useBackendModule('permissions');
  const { draft } = useComposerState();
  const { setDraft } = useComposerActions();
  const active = useRef<{ controller: AbortController; session?: DictationSession } | null>(null);
  const [state, setState] = useState<DictationState>('idle');
  const [level, setLevel] = useState(0);

  useEffect(() => () => active.current?.controller.abort(), []);

  const report = useCallback(
    (error: unknown) => {
      if (error instanceof VoiceError && error.code === 'permission-blocked') {
        alert.confirm({
          title: t('settings.permissions.accessRequired'),
          description: t('voice.error.permissionDenied'),
          confirmLabel: t('settings.permissions.openSystemSettings'),
          onConfirm: () =>
            permissions.openSystemSettings().catch(() => {
              toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' });
            }),
        });
        return;
      }
      toast.show({ label: t(voiceErrorLabelKey(error)), variant: 'danger' });
    },
    [alert, permissions, t, toast],
  );

  const start = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController();
    const owner: { controller: AbortController; session?: DictationSession } = { controller };
    active.current = owner;
    const base = draft;
    let written = base;
    const write = (next: string) => {
      const expected = written;
      written = next;
      setDraft((current) => (current === expected ? next : current));
    };
    setState('starting');
    try {
      owner.session = await voice.startDictation({
        signal: controller.signal,
        onText: (text) => write(appendUtterance(base, text)),
        onLevel: setLevel,
      });
      setState('listening');
      write(appendUtterance(base, await owner.session.result));
    } catch (error) {
      // Any end other than stopping, including backgrounding, returns the draft to where it was.
      write(base);
      if (!controller.signal.aborted) report(error);
    } finally {
      if (active.current === owner) {
        active.current = null;
        setState('idle');
        setLevel(0);
      }
    }
  }, [draft, report, setDraft, voice]);

  const stop = useCallback(() => {
    const session = active.current?.session;
    if (!session) return;
    setState('finishing');
    session.stop();
  }, []);

  const cancel = useCallback(() => active.current?.controller.abort(), []);

  return { state, level, start, stop, cancel };
}
