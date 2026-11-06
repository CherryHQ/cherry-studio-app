import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import { Button, Spinner, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { useMermaidRender } from '../hooks/useMermaidRender';
import { createMermaidViewerHandoff } from '../utils/mermaidViewerHandoff';
import { MermaidSvgView } from './MermaidSvgView';

type MermaidBlockProps = {
  source: string;
  /** The fence as an ordinary code block, shown when the diagram cannot be rendered. */
  fallback: ReactElement;
};

/**
 * A complete Mermaid fence inside Markdown. It keeps the code block's frame and 192-point height,
 * so finishing a streamed fence or remounting a scrolled-away message does not move the transcript.
 */
export function MermaidBlock({ source, fallback }: MermaidBlockProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { theme } = useUniwind();
  const result = useMermaidRender(source, theme === 'dark');

  if (result?.status === 'failed') return fallback;

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(source);
      toast.show({ label: t('mermaid.copied'), variant: 'success' });
    } catch {
      toast.show({ label: t('mermaid.copyFailed'), variant: 'danger' });
    }
  };
  const open = () => {
    router.push({
      pathname: '/mermaid-diagram',
      params: { handoff: createMermaidViewerHandoff(source) },
    });
  };

  return (
    <View className="h-48 overflow-hidden rounded-xl bg-code-block">
      <View className="h-9 flex-row items-center justify-between border-b border-foreground/20 pr-1 pl-3.5">
        <Text className="font-mono text-foreground/60 text-xs">mermaid</Text>
        <Button
          accessibilityLabel={t('mermaid.copySource')}
          icon={<CopyIcon className="text-muted-foreground" />}
          onPress={() => void copy()}
          size="sm"
          variant="ghost"
        />
      </View>
      {result ? (
        <Pressable
          accessibilityHint={t('mermaid.openHint')}
          accessibilityLabel={t('mermaid.diagram')}
          accessibilityRole="button"
          className="flex-1"
          onPress={open}
        >
          <View className="flex-1" pointerEvents="none">
            <MermaidSvgView diagram={result} variant="preview" />
          </View>
        </Pressable>
      ) : (
        <View className="flex-1 items-center justify-center">
          <Spinner accessibilityLabel={t('mermaid.rendering')} size="sm" />
        </View>
      )}
    </View>
  );
}
