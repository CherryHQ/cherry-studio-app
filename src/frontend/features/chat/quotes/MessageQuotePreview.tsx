import {
  BackgroundPressExclusion,
  Button,
  ContextMenuExclusion,
} from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import type { QuoteFields } from '@/shared/contracts/agent';

import { useChatQuoteActions, useChatQuoteState } from './ChatQuoteContext';

export function DraftMessageQuotePreview() {
  const state = useChatQuoteState();
  const actions = useChatQuoteActions();
  const { t } = useTranslation();
  if (!state.fields.quotes)
    return state.isBusy || state.failure ? (
      <Text
        accessibilityRole="text"
        accessibilityLabel={t(
          state.isBusy
            ? 'chat.quote.checking'
            : state.failure === 'unavailable'
              ? 'chat.quote.unavailable'
              : 'chat.quote.retryable',
        )}
        className="text-muted-foreground text-sm"
      >
        {t(
          state.isBusy
            ? 'chat.quote.checking'
            : state.failure === 'unavailable'
              ? 'chat.quote.unavailable'
              : 'chat.quote.retryable',
        )}
      </Text>
    ) : null;
  return (
    <View className="gap-1">
      <MessageQuotePreview
        key={state.fields.quotes[0].id}
        fields={state.fields}
        isBusy={state.isBusy}
        onRemove={actions?.clearQuote}
      />
      {state.failure ? (
        <Text accessibilityRole="text" className="text-muted-foreground text-sm">
          {t(state.failure === 'unavailable' ? 'chat.quote.unavailable' : 'chat.quote.retryable')}
        </Text>
      ) : null}
    </View>
  );
}

export function MessageQuotePreview({
  fields,
  isBusy = false,
  onRemove,
}: {
  fields: QuoteFields;
  isBusy?: boolean;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const actions = useChatQuoteActions();
  const [status, setStatus] = useState<'idle' | 'checking' | 'unavailable' | 'retryable'>('idle');
  const quote = fields.quotes?.[0];
  if (!quote || !fields.quoteAuthor) return null;
  const author =
    fields.quoteAuthor.name ??
    t(fields.quoteAuthor.role === 'user' ? 'chat.quote.you' : 'chat.quote.assistant');
  const busy = isBusy || status === 'checking';
  const label = t(
    status === 'unavailable'
      ? 'chat.quote.unavailable'
      : status === 'retryable'
        ? 'chat.quote.retryable'
        : 'chat.quote.open',
  );
  const open = async () => {
    if (!actions || busy) return;
    setStatus('checking');
    const result = await actions.openQuote({
      sourceMessageId: quote.sourceMessageId,
      requestId: uuidv7(),
    });
    setStatus(
      result.state === 'unavailable' || result.state === 'retryable' ? result.state : 'idle',
    );
  };
  return (
    <BackgroundPressExclusion>
      <ContextMenuExclusion className="w-full flex-row items-start gap-2 rounded-md border-l-2 border-border-selected bg-secondary px-3 py-2">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-medium text-foreground text-sm">{author}</Text>
          <Text className="text-muted-foreground text-sm" numberOfLines={3}>
            {quote.text}
          </Text>
          <Button
            accessibilityLabel={label}
            accessibilityRole="button"
            disabled={busy || !actions || status === 'unavailable'}
            loading={busy}
            onPress={() => void open()}
            size="xs"
            variant="ghost"
          >
            {label}
          </Button>
        </View>
        {onRemove ? (
          <Button
            accessibilityLabel={t('chat.quote.remove')}
            accessibilityRole="button"
            disabled={busy}
            onPress={onRemove}
            size="xs"
            variant="ghost"
          >
            {t('chat.quote.remove')}
          </Button>
        ) : null}
      </ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}
