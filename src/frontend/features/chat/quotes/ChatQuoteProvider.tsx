import { useToast } from '@cherrystudio/ui/components';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { v7 as uuidv7 } from 'uuid';

import { useComposerMeta } from '@/frontend/components/Composer';
import type { MessageListItem } from '@/frontend/components/Message';
import { useApiClient } from '@/frontend/data';
import { messageQuoteSnapshot } from '@/shared/contracts/agent';

import { useAgentChatClient } from '../runtime/ChatProvider';
import {
  Actions,
  State,
  Highlight,
  type QuoteAttempt,
  type QuoteState,
  type ChatQuoteActions,
} from './ChatQuoteContext';
import { readChatQuoteSource } from './chatQuoteSource';

export function ChatQuoteProvider({
  children,
  sessionId,
  enabled,
  authorName,
  openQuote,
  highlight,
  partialMessageIds,
}: PropsWithChildren<{
  sessionId?: string;
  enabled: boolean;
  authorName?: string;
  openQuote: ChatQuoteActions['openQuote'];
  highlight?: string;
  partialMessageIds?: readonly string[];
}>) {
  const api = useApiClient();
  const { client } = useAgentChatClient();
  const { inputRef } = useComposerMeta();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [state, setState] = useState<QuoteState>({ fields: {}, isBusy: false });
  const current = useRef(state);
  const mounted = useRef(true);
  const generation = useRef(0);
  const focusFrame = useRef<number | undefined>(undefined);
  const locked = useRef(false);
  const latest = useRef({ sessionId, enabled, authorName });
  useLayoutEffect(() => {
    latest.current = { sessionId, enabled, authorName };
  });
  const invalidateSelection = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidateSelection();
      if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
    };
  }, [invalidateSelection]);
  const update = useCallback((value: QuoteState) => {
    current.current = value;
    if (mounted.current) setState(value);
  }, []);
  const clearQuote = useCallback(() => {
    if (locked.current) return;
    generation.current++;
    update({ fields: {}, isBusy: false });
  }, [update]);
  const replyToMessage = useCallback(
    async ({ messageId }: { messageId: string }) => {
      const scope = latest.current;
      if (locked.current || !scope.enabled || !scope.sessionId) return;
      const request = ++generation.current;
      update({ ...current.current, isBusy: true });
      try {
        const source = await readChatQuoteSource(api, client, scope.sessionId, messageId);
        if (
          !mounted.current ||
          request !== generation.current ||
          latest.current.sessionId !== scope.sessionId
        )
          return;
        const text = source && messageQuoteSnapshot(source);
        if (!source || !text || (source.role !== 'user' && source.role !== 'assistant')) {
          update({ ...current.current, isBusy: false });
          toast.show({ label: t('chat.quote.unavailable') });
          return;
        }
        update({
          fields: {
            quotes: [{ id: uuidv7(), sourceMessageId: source.id, text }],
            quoteAuthor: {
              role: source.role,
              ...(source.role === 'assistant' && scope.authorName
                ? { name: scope.authorName }
                : {}),
            },
          },
          isBusy: false,
        });
        // iOS UIAction dispatch has no after-dismissal callback. Defer focus to the next frame.
        focusFrame.current = requestAnimationFrame(() => {
          focusFrame.current = undefined;
          if (mounted.current && generation.current === request && latest.current.enabled)
            inputRef.current?.focus();
        });
      } catch {
        if (mounted.current && request === generation.current) {
          update({ ...current.current, isBusy: false });
          toast.show({ label: t('chat.quote.retryable'), variant: 'danger' });
        }
      }
    },
    [api, client, inputRef, t, toast, update],
  );
  const capture = useCallback((): QuoteAttempt => {
    if (locked.current || current.current.isBusy)
      throw new Error('Quote admission is already pending.');
    locked.current = true;
    const fields = current.current.fields;
    update({ ...current.current, isBusy: Boolean(fields.quotes) });
    let finished = false;
    return {
      fields,
      finish(accepted) {
        if (finished) return;
        finished = true;
        locked.current = false;
        if (!mounted.current) return;
        update({ fields: accepted ? {} : fields, isBusy: false });
      },
    };
  }, [update]);
  const partialKey = partialMessageIds?.join('\n') ?? '';
  const incomplete = useMemo(() => new Set(partialKey.split('\n')), [partialKey]);
  const canReply = useCallback(
    (message: MessageListItem) =>
      enabled &&
      Boolean(sessionId) &&
      !incomplete.has(message.id) &&
      message.status === 'success' &&
      (message.role === 'user' || message.role === 'assistant') &&
      !message.data.parts?.some(
        (part) =>
          (part.type === 'data-error' && part.data.code === 'MESSAGE_UNREADABLE') ||
          ((part.type === 'text' || part.type === 'reasoning') && part.state === 'streaming'),
      ) &&
      Boolean(
        message.data.parts?.some(
          (part) => part.type === 'file' || (part.type === 'text' && part.text.trim()),
        ),
      ),
    [enabled, incomplete, sessionId],
  );
  const actions = useMemo(
    () => ({ replyToMessage, clearQuote, capture, canReply, openQuote }),
    [replyToMessage, clearQuote, capture, canReply, openQuote],
  );
  return (
    <Actions value={actions}>
      <State value={state}>
        <Highlight value={highlight}>{children}</Highlight>
      </State>
    </Actions>
  );
}
