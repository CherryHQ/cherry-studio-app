import { useToast } from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useAgentMutations, useAgentToolBindingMutations } from '@/frontend/hooks/agent';
import type { WriteAgentToolBinding } from '@/shared/data/api/schemas/agentToolBindings';

import type { AgentFormState } from './agentForm';

const TEXT_SAVE_DELAY_MS = 600;
const logger = loggerService.withContext('useAgentAutoSave');

type SaveKey = keyof AgentFormState | 'toolBindings';
type SaveTask = () => Promise<unknown>;

/** Keeps writes ordered and coalesces changes to the same field while a write is in flight. */
export function useAgentAutoSave(agentId: string | undefined) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setAgentAvatar, updateAgent } = useAgentMutations();
  const { replaceAgentToolBindings } = useAgentToolBindingMutations();
  const pending = useRef(new Map<SaveKey, SaveTask>());
  const deferred = useRef(new Map<SaveKey, SaveTask>());
  const failed = useRef(new Map<SaveKey, SaveTask>());
  const latest = useRef(new Map<SaveKey, SaveTask | null>());
  const isSaving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasFailedSave, setHasFailedSave] = useState(false);

  const drain = useCallback(async () => {
    if (isSaving.current) return;
    isSaving.current = true;

    try {
      while (pending.current.size > 0) {
        const next = pending.current.entries().next().value;
        if (!next) break;
        const [key, save] = next;
        pending.current.delete(key);

        try {
          await save();
        } catch (error) {
          logger.error('Failed to auto-save agent field', error as Error, { agentId, key });
          // A newer draft supersedes this failed write and will get its own attempt.
          if (latest.current.get(key) === save) {
            failed.current.set(key, save);
            toast.show({
              label: t(
                key === 'avatarUri' ? 'agent.toast.avatarSaveFailed' : 'agent.toast.saveFailed',
              ),
              variant: 'danger',
            });
          }
        }
      }
    } finally {
      isSaving.current = false;
      setHasFailedSave(failed.current.size > 0);
    }
  }, [agentId, t, toast]);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    for (const [key, save] of deferred.current) {
      pending.current.set(key, save);
    }
    deferred.current.clear();
    void drain();
  }, [drain]);

  const schedule = useCallback(
    (key: SaveKey, save: SaveTask | null, shouldDebounce = false) => {
      // Remove superseded queued work, including an invalidated name draft.
      pending.current.delete(key);
      deferred.current.delete(key);
      failed.current.delete(key);
      latest.current.set(key, save);
      setHasFailedSave(failed.current.size > 0);

      if (save) {
        if (shouldDebounce) {
          deferred.current.set(key, save);
        } else {
          pending.current.set(key, save);
        }
      }

      if (shouldDebounce) {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = deferred.current.size > 0 ? setTimeout(flush, TEXT_SAVE_DELAY_MS) : null;
      }
      void drain();
    },
    [drain, flush],
  );

  const saveField = useCallback(
    <TKey extends keyof AgentFormState>(key: TKey, value: AgentFormState[TKey]) => {
      if (!agentId) return;

      if (key === 'avatarUri') {
        if (typeof value === 'string' && value) {
          schedule(key, () => setAgentAvatar(agentId, value));
        }
      } else if (key === 'name' && typeof value === 'string') {
        const name = value.trim();
        schedule(key, name ? () => updateAgent(agentId, { name }) : null, true);
      } else {
        schedule(key, () => updateAgent(agentId, { [key]: value }), key === 'instructions');
      }
    },
    [agentId, schedule, setAgentAvatar, updateAgent],
  );

  const saveToolBindings = useCallback(
    (bindings: WriteAgentToolBinding[]) => {
      if (agentId) {
        schedule('toolBindings', () => replaceAgentToolBindings(agentId, bindings));
      }
    },
    [agentId, replaceAgentToolBindings, schedule],
  );

  const retry = useCallback(() => {
    for (const [key, save] of failed.current) {
      pending.current.set(key, save);
    }
    failed.current.clear();
    setHasFailedSave(false);
    flush();
  }, [flush]);

  // Leaving the page must submit the last keystrokes. Already-started work
  // deliberately continues after unmount, including the remainder of the queue.
  useFocusEffect(useCallback(() => flush, [flush]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flush();
    });
    return () => subscription.remove();
  }, [flush]);

  return { flush, hasFailedSave, retry, saveField, saveToolBindings };
}
