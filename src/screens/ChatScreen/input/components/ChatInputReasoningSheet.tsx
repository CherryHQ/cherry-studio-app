import { cn } from 'heroui-native/utils';
import { CheckIcon } from 'lucide-uniwind/png';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { SelectionBottomSheet } from '@/components/selectionSheet';
import {
  useChatInputActions,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';
import {
  type ChatInputReasoningEffort,
  chatInputReasoningEffortOptions,
} from '@/screens/ChatScreen/input/utils/chatInputReasoning';

const CLOSED_INDEX = 0;
const OPEN_INDEX = 1;

type ChatInputReasoningSheetProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function ChatInputReasoningSheet({ isOpen, onClose }: ChatInputReasoningSheetProps) {
  const { t } = useTranslation();
  const { selectReasoningEffort } = useChatInputActions();
  const { reasoningEffort } = useChatInputState();
  const [sheetIndex, setSheetIndex] = useState(CLOSED_INDEX);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    setSheetIndex(isOpen ? OPEN_INDEX : CLOSED_INDEX);
  }

  const handleSelect = useCallback(
    (value: ChatInputReasoningEffort) => {
      selectReasoningEffort(value);
      setSheetIndex(CLOSED_INDEX);
      onClose();
    },
    [onClose, selectReasoningEffort],
  );

  return (
    <SelectionBottomSheet
      index={sheetIndex}
      onIndexChange={setSheetIndex}
      onSettle={(nextIndex) => {
        if (nextIndex === CLOSED_INDEX) {
          onClose();
        }
      }}
    >
      <View className="px-4 pt-5">
        <Text className="px-1 pb-3 font-semibold text-foreground text-lg">
          {t('chat.reasoning.title')}
        </Text>
        <View className="gap-1">
          {chatInputReasoningEffortOptions.map((option) => {
            const label = t(option.labelKey);
            const isSelected = option.value === reasoningEffort;

            return (
              <Pressable
                accessibilityLabel={label}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className="min-h-14 flex-row items-center gap-4 rounded-2xl px-3 py-2 active:bg-surface-secondary active:opacity-70"
                key={option.value}
                onPress={() => handleSelect(option.value)}
              >
                <Text
                  className={cn('flex-1 text-base', isSelected ? 'text-accent' : 'text-foreground')}
                  numberOfLines={1}
                >
                  {label}
                </Text>
                {isSelected ? (
                  <CheckIcon className="size-5 text-accent" strokeWidth={2.25} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </SelectionBottomSheet>
  );
}
