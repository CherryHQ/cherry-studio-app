import { useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { loggerService } from '@/shared/core/logger/LoggerService';

import { useComposerPresentationActions } from '../context/ComposerProvider';

const logger = loggerService.withContext('ComposerSheet');

/** The replacement lasts until the sheet closes, not just until setOpen returns. */
export function useComposerSheet() {
  const { runInputReplacement } = useComposerPresentationActions();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const opening = useRef(false);
  const operation = useRef<Promise<unknown> | undefined>(undefined);
  const mounted = useRef(true);
  const resolveClose = useRef<(() => void) | undefined>(undefined);

  const close = useCallback(async () => {
    setIsOpen(false);
    const resolve = resolveClose.current;
    resolveClose.current = undefined;
    // Remove the sheet before the dock resumes following the keyboard.
    if (resolve) requestAnimationFrame(resolve);
    await operation.current;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resolveClose.current?.();
      resolveClose.current = undefined;
    };
  }, []);

  const open = useCallback(() => {
    if (opening.current) return;
    opening.current = true;
    operation.current = runInputReplacement(() => {
      if (!mounted.current) return Promise.resolve();
      return new Promise<void>((resolve) => {
        resolveClose.current = resolve;
        setIsOpen(true);
      });
    })
      .catch((error: unknown) => {
        logger.warn('Failed to present composer sheet', error as Error);
        if (mounted.current) toast.show({ label: t('chat.input.pickerFailed'), variant: 'danger' });
      })
      .finally(() => {
        opening.current = false;
      });
  }, [runInputReplacement, t, toast]);

  return { close, isOpen, open };
}
