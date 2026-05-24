import { CheckIcon } from 'lucide-uniwind';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { withUniwind } from 'uniwind';

import {
  type ChatInputActionId,
  chatInputActions,
} from '@/screens/ChatScreen/input/utils/chatInputActions';

type ChatInputActionListProps = {
  onActionPress: (actionId: ChatInputActionId) => void;
  selectedActionId: ChatInputActionId | null;
};

const StyledPressable = withUniwind(Pressable);

export function ChatInputActionList({ onActionPress, selectedActionId }: ChatInputActionListProps) {
  const { t } = useTranslation();

  return (
    <View className="gap-1">
      {chatInputActions.map((action) => {
        const Icon = action.icon;
        const isSelected = action.id === selectedActionId;
        const title = t(action.titleKey);

        return (
          <StyledPressable
            accessibilityLabel={title}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className="min-h-14 flex-row items-center gap-4 rounded-2xl px-3 py-2 active:bg-surface-secondary active:opacity-70"
            key={action.id}
            onPress={() => onActionPress(action.id)}
          >
            <Icon
              className={['size-7', isSelected ? 'text-accent' : 'text-foreground'].join(' ')}
              strokeWidth={2}
            />
            <Text
              className={[
                'flex-1 font-semibold text-base',
                isSelected ? 'text-accent' : 'text-foreground',
              ].join(' ')}
            >
              {title}
            </Text>
            {isSelected ? <CheckIcon className="size-5 text-accent" strokeWidth={2.25} /> : null}
          </StyledPressable>
        );
      })}
    </View>
  );
}
