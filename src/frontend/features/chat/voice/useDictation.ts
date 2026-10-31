import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useComposerActions, useComposerState } from '@/frontend/components/Composer';
import { useBackendModule } from '@/frontend/data';
import { useDictationSetup } from '@/frontend/hooks/useDictationSetup';
import { voiceErrorLabelKey } from '@/frontend/utils/voiceErrorLabel';
import { VoiceError, type DictationSession } from '@/shared/contracts/voice';
import { appendUtterance } from '@/shared/utils/dictationText';

export type DictationState = 'idle' | 'starting' | 'listening' | 'finishing';

type ActiveDictation = {
  controller: AbortController;
  session?: DictationSession;
  /** User edits and sending hand the draft back even when its text matches an earlier result. */
  ownsDraft: boolean;
};

/**
 * Dictates into the composer draft: recognized text follows what was already typed and is
 * updated live. Cancelling or failing restores the draft as it was; nothing is sent automatically.
 *
 * Dictation owns only the text it appended. Typing or sending meanwhile hands the draft back to
 * the user and cancels the session, so nothing more is captured or written.
 */
export function useDictation() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();
  const voice = useBackendModule('voice');
  const permissions = useBackendModule('permissions');
  const showDictationSetup = useDictationSetup();
  const { draft } = useComposerState();
  const { setDraft, subscribeDraftEdits } = useComposerActions();
  const active = useRef<ActiveDictation | null>(null);
  const [state, setState] = useState<DictationState>('idle');
  const [level, setLevel] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = subscribeDraftEdits(() => {
        const owner = active.current;
        if (!owner) return;
        owner.ownsDraft = false;
        owner.controller.abort();
      });
      return () => {
        unsubscribe();
        active.current?.controller.abort();
      };
    }, [subscribeDraftEdits]),
  );

  const report = useCallback(
    (error: unknown) => {
      if (error instanceof VoiceError && error.code === 'recognition-not-configured') {
        showDictationSetup('needs-setup');
        return;
      }
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
    [alert, permissions, showDictationSetup, t, toast],
  );

  const start = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController();
    const base = draft;
    const owner: ActiveDictation = { controller, ownsDraft: true };
    active.current = owner;
    let written = base;
    const write = (next: string) => {
      if (!owner.ownsDraft) return;
      const expected = written;
      written = next;
      setDraft((current) => (owner.ownsDraft && current === expected ? next : current));
    };
    setState('starting');
    try {
      owner.session = await voice.startDictation({
        signal: controller.signal,
        onText: (text) => {
          if (!controller.signal.aborted) write(appendUtterance(base, text));
        },
        onLevel: setLevel,
        onTranscribing: () => {
          if (!controller.signal.aborted) setState('finishing');
        },
      });
      setState('listening');
      const text = await owner.session.result;
      controller.signal.throwIfAborted();
      write(appendUtterance(base, text));
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
