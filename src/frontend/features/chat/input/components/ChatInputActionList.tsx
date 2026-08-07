import { cn } from '@cherrystudio/ui/utils';
import { CheckIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import {
  type ChatInputAction,
  type ChatInputActionId,
  chatInputActions,
} from '../utils/chatInputActions';

type ChatInputActionListProps = {
  actions?: readonly ChatInputAction[];
  onActionPress: (actionId: ChatInputActionId) => void;
  selectedActionId: ChatInputActionId | null;
};

export function ChatInputActionList({
  actions = chatInputActions,
  onActionPress,
  selectedActionId,
}: ChatInputActionListProps) {
  const { t } = useTranslation();

  return (
    <View className="gap-1">
      {actions.map((action) => {
        const Icon = action.icon;
        const title = t(action.titleKey);
        const isSelected = action.id === selectedActionId;

        return (
          <Pressable
            accessibilityLabel={title}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className="min-h-14 flex-row items-center gap-4 rounded-2xl px-3 py-2 active:bg-secondary active:opacity-70"
            key={action.id}
            onPress={() => onActionPress(action.id)}
          >
            <Icon
              className={cn('size-7', isSelected ? 'text-primary' : 'text-foreground')}
              strokeWidth={2}
            />
            <Text
              className={cn(
                'flex-1 font-semibold text-base',
                isSelected ? 'text-primary' : 'text-foreground',
              )}
            >
              {title}
            </Text>
            {isSelected ? <CheckIcon className="size-5 text-primary" strokeWidth={2.25} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
