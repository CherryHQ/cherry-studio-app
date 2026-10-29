import XIcon from '@cherrystudio/app-icons/icons/x';
import {
  BackgroundPressExclusion,
  Button,
  Composer,
  ContextMenuExclusion,
  useToast,
} from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { v7 as uuidv7 } from 'uuid';

import type { QuoteFields } from '@/shared/contracts/agent';
import { stripMarkdownFormatting } from '@/shared/utils/markdownFormatting';

import { useChatQuoteActions, useChatQuoteState } from './ChatQuoteContext';

/** The quote waiting in the composer, in the attachment row's place above the field. */
export function DraftMessageQuotePreview() {
  const { fields, isBusy } = useChatQuoteState();
  const actions = useChatQuoteActions();
  const { t } = useTranslation();
  return (
    <Composer.Collapsible style={draftRowStyle}>
      {fields.quotes ? (
        <View className="flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <MessageQuotePreview key={fields.quotes[0].id} fields={fields} />
          </View>
          <Button
            accessibilityLabel={t('chat.quote.remove')}
            disabled={isBusy}
            icon={<XIcon className="text-muted-foreground" />}
            onPress={actions?.clearQuote}
            shape="pill"
            size="xs"
            variant="ghost"
          />
        </View>
      ) : null}
    </Composer.Collapsible>
  );
}

/** A quiet reference to the quoted message; pressing it scrolls the transcript to the source. */
export function MessageQuotePreview({
  fields,
  numberOfLines = 2,
}: {
  fields: QuoteFields;
  numberOfLines?: number;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const actions = useChatQuoteActions();
  const [isOpening, setIsOpening] = useState(false);
  const quote = fields.quotes?.[0];
  if (!quote || !fields.quoteAuthor) return null;
  const author =
    fields.quoteAuthor.name ??
    t(fields.quoteAuthor.role === 'user' ? 'chat.quote.you' : 'chat.quote.assistant');
  const excerpt = stripMarkdownFormatting(quote.text).replace(/\s+/g, ' ').trim();
  const open = actions
    ? async () => {
        setIsOpening(true);
        const result = await actions.openQuote({
          sourceMessageId: quote.sourceMessageId,
          requestId: uuidv7(),
        });
        setIsOpening(false);
        if (result.state === 'unavailable') toast.show({ label: t('chat.quote.unavailable') });
        else if (result.state === 'retryable')
          toast.show({ label: t('chat.quote.retryable'), variant: 'danger' });
      }
    : undefined;
  return (
    <BackgroundPressExclusion>
      <ContextMenuExclusion className="min-w-0 shrink">
        <Pressable
          accessibilityHint={open ? t('chat.quote.open') : undefined}
          accessibilityLabel={`${author}: ${excerpt}`}
          accessibilityRole={open ? 'button' : 'text'}
          accessibilityState={{ busy: isOpening }}
          className="min-w-0 gap-0.5 border-l-2 border-border pl-2.5 active:opacity-70"
          disabled={!open || isOpening}
          onPress={() => void open?.()}
        >
          <Text className="font-medium text-muted-foreground text-xs">{author}</Text>
          <Text className="text-muted-foreground text-sm" numberOfLines={numberOfLines}>
            {excerpt}
          </Text>
        </Pressable>
      </ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}

// Matches the attachment row: flush with the field's text, the composer's rhythm below it.
const draftRowStyle = { paddingBottom: 8, paddingTop: 2 } as const;
