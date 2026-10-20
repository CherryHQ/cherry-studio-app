import { useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { aiFailureReasonTitleKey } from '@/frontend/components/AiFailure';
import { AiRequestError } from '@/shared/contracts/aiFailure';
import { VoiceError, type VoiceErrorCode } from '@/shared/contracts/voice';
import { loggerService } from '@/shared/core/logger/LoggerService';

const ERROR_KEYS = {
  'provider-unavailable': 'voice.providerUnavailable',
  'invalid-input': 'voice.invalidInput',
  'audio-too-large': 'voice.audioTooLarge',
  'text-too-long': 'voice.textTooLong',
  'empty-transcript': 'voice.emptyTranscript',
  failed: 'voice.failed',
} satisfies Record<VoiceErrorCode, string>;

/** One dialog operation. Cancellation also rejects late native/provider results. */
export function useVoiceRequest() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const cancel = useCallback(() => {
    active.current?.abort();
  }, []);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') cancel();
    });
    return () => {
      mounted.current = false;
      cancel();
      subscription.remove();
    };
  }, [cancel]);

  async function run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    accept: (value: T, signal: AbortSignal) => void | Promise<void>,
    discard?: (value: T) => void | Promise<void>,
  ) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setIsRunning(true);
    let result: { value: T } | undefined;
    let accepted = false;
    try {
      result = { value: await operation(controller.signal) };
      controller.signal.throwIfAborted();
      if (!mounted.current) return;
      await accept(result.value, controller.signal);
      accepted = true;
    } catch (error) {
      if (!controller.signal.aborted && mounted.current) {
        const key =
          error instanceof VoiceError
            ? ERROR_KEYS[error.code]
            : error instanceof AiRequestError
              ? aiFailureReasonTitleKey(error.detail.failure.reasonCode)
              : undefined;
        toast.show({ label: t(key ?? 'voice.failed'), variant: 'danger' });
      }
    } finally {
      if (result && !accepted) {
        try {
          await discard?.(result.value);
        } catch {
          loggerService.withContext('Voice').warn('Could not release a discarded voice result');
        }
      }
      if (active.current === controller) {
        active.current = null;
        if (mounted.current) setIsRunning(false);
      }
    }
  }

  return { cancel, isRunning, run };
}
