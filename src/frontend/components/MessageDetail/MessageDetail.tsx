import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import {
  Button,
  formatMessagePartValue,
  hasMessagePartValue,
  MessagePart,
  type MessagePartSectionProps,
  useToast,
} from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import { createCodeBlockMarkdown } from '@/shared/utils/createCodeBlockMarkdown';

type MessageDetailSectionProps = Omit<MessagePartSectionProps, 'action'> & {
  copyText?: () => string;
  copyTestID?: string;
};

/** Application-owned clipboard and labels; CherryUI owns the section's presentation. */
export function MessageDetailSection({
  copyText,
  copyTestID,
  ...props
}: MessageDetailSectionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const copy = async () => {
    if (!copyText) return;
    try {
      await Clipboard.setStringAsync(copyText());
      toast.show({ label: t('chat.tool.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('chat.tool.copyFailed'), variant: 'danger' });
    }
  };

  return (
    <MessagePart.Section
      {...props}
      action={
        copyText ? (
          <Button
            accessibilityHint={props.title}
            accessibilityLabel={t('chat.tool.copyFullText')}
            icon={<CopyIcon className="text-muted-foreground" />}
            onPress={() => void copy()}
            size="sm"
            testID={copyTestID}
            variant="ghost"
          />
        ) : undefined
      }
    />
  );
}

const PREVIEW_MAX_LENGTH = 4_000;

type MessageDetailTextProps = Pick<MessagePartSectionProps, 'title' | 'tone'> & {
  language?: string;
  /** Persisted and remote parts can omit error text despite their declared type. */
  value: string | undefined;
  variant?: 'body' | 'code';
};

export function MessageDetailText({
  language,
  value,
  variant = 'body',
  ...props
}: MessageDetailTextProps) {
  const { t } = useTranslation();
  if (!value) return null;
  const isTruncated = value.length > PREVIEW_MAX_LENGTH;
  const preview = isTruncated
    ? value.slice(0, PREVIEW_MAX_LENGTH).replace(/[\uD800-\uDBFF]$/, '')
    : value;

  return (
    <MessageDetailSection {...props} copyText={() => value}>
      {variant === 'code' ? (
        <MarkdownText markdown={createCodeBlockMarkdown(preview, language)} />
      ) : (
        <MessagePart.SectionBody>
          <Text className="text-base text-foreground" selectable>
            {preview}
          </Text>
        </MessagePart.SectionBody>
      )}
      {isTruncated ? (
        <Text className="text-muted-foreground text-xs">
          {t('chat.tool.previewTruncated', { count: PREVIEW_MAX_LENGTH })}
        </Text>
      ) : null}
    </MessageDetailSection>
  );
}

/** Invocation arguments read as one formatted document; metadata keeps ValueSection's fact rows. */
export function MessageDetailValue({
  value,
  ...props
}: Pick<MessageDetailTextProps, 'title'> & { value: unknown }) {
  if (!hasMessagePartValue(value)) return null;
  return (
    <MessageDetailText
      {...props}
      language="json"
      value={formatMessagePartValue(value, Number.POSITIVE_INFINITY)}
      variant={typeof value === 'string' ? 'body' : 'code'}
    />
  );
}
