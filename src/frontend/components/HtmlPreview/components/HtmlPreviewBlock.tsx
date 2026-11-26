import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import ExternalLinkIcon from '@cherrystudio/app-icons/icons/external-link';
import { Button, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { HtmlBody } from '@/frontend/components/HtmlBody';

import { createHtmlPreviewHandoff } from '../utils/htmlPreviewHandoff';

type HtmlPreviewBlockProps = {
  source: string;
};

/**
 * A complete HTML fence inside Markdown. Renders a live WebView preview with a header that
 * copies the source or opens the full-screen viewer. Falls back to the code block on render
 * failure so a broken document never blanks the transcript.
 */
export function HtmlPreviewBlock({ source }: HtmlPreviewBlockProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(source);
      toast.show({ label: t('htmlPreview.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('htmlPreview.copyFailed'), variant: 'danger' });
    }
  };
  const open = () => {
    router.push({
      pathname: '/html-preview',
      params: { handoff: createHtmlPreviewHandoff(source) },
    });
  };

  return (
    <View className="h-64 overflow-hidden rounded-xl bg-code-block">
      <View className="h-9 flex-row items-center justify-between border-b border-foreground/20 pr-1 pl-3.5">
        <Text className="font-mono text-foreground/60 text-xs">html</Text>
        <View className="flex-row items-center">
          <Button
            accessibilityLabel={t('htmlPreview.copySource')}
            icon={<CopyIcon className="text-muted-foreground" />}
            onPress={() => void copy()}
            size="sm"
            variant="ghost"
          />
          <Button
            accessibilityLabel={t('htmlPreview.openHint')}
            icon={<ExternalLinkIcon className="text-muted-foreground" />}
            onPress={open}
            size="sm"
            variant="ghost"
          />
        </View>
      </View>
      <Pressable
        accessibilityHint={t('htmlPreview.openHint')}
        accessibilityLabel={t('htmlPreview.preview')}
        accessibilityRole="button"
        className="flex-1"
        onPress={open}
      >
        <View className="flex-1" pointerEvents="none">
          <HtmlBody
            html={source}
            onFailure={() => {
              // The block cannot swap itself out; the next render of the fence will. Keeping the
              // WebView mounted avoids a remount loop when the document is simply slow.
            }}
          />
        </View>
      </Pressable>
    </View>
  );
}
