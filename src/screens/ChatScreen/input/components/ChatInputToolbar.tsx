import { XIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';
import type { ChatInputAction } from '../utils/chatInputActions';
import { ChatInputAccessoryItem, ChatInputAccessorySection } from './ChatInputAccessory';

type ChatInputToolbarProps = {
  onToolClear: () => void;
  selectedTool?: ChatInputAction;
};

type SelectedToolTagProps = {
  onClear: () => void;
  tool: ChatInputAction;
};

export function ChatInputToolbar({ onToolClear, selectedTool }: ChatInputToolbarProps) {
  const hasToolbarContent = selectedTool !== undefined;
  const toolbarClassName = hasToolbarContent
    ? 'flex-row flex-wrap gap-2 self-start p-2'
    : 'flex-row flex-wrap gap-2 self-start p-0';

  return (
    <ChatInputAccessorySection
      className={toolbarClassName}
      pointerEvents={hasToolbarContent ? 'auto' : 'none'}
    >
      {selectedTool ? <SelectedToolTag tool={selectedTool} onClear={onToolClear} /> : null}
    </ChatInputAccessorySection>
  );
}

function SelectedToolTag({ onClear, tool }: SelectedToolTagProps) {
  const { t } = useTranslation();
  const Icon = tool.icon;

  return (
    <ChatInputAccessoryItem className="flex-row items-center gap-1 rounded-full bg-accent/10 px-2 py-1">
      <Icon className="size-5 text-accent" strokeWidth={2.25} />
      <Text className="font-semibold text-accent text-base" numberOfLines={1}>
        {t(tool.tagTitleKey)}
      </Text>
      <ClearTagButton onPress={onClear} />
    </ChatInputAccessoryItem>
  );
}

function ClearTagButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityLabel={t('common.clear')}
      accessibilityRole="button"
      className="size-6 items-center justify-center rounded-full active:opacity-60"
      hitSlop={6}
      onPress={onPress}
    >
      <XIcon className="size-5 text-accent" strokeWidth={2.25} />
    </Pressable>
  );
}
