import type { BottomSheetMethods } from '@expo/ui/community/bottom-sheet';
import { cn } from 'heroui-native/utils';
import { CheckIcon, PlusIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SelectionBottomSheet, SelectionSheetSearchField } from '@/components/selectionSheet';

import type { Assistant } from '@/data/types/assistant';
import { useAssistantsApi } from '@/hooks/chat';

type AssistantPickerBottomSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreatePress: () => void;
  onSelect: (assistant: Assistant | null) => void;
  selectedAssistantId?: string | null;
};

const defaultAssistantPickerHeaderHeight = 60;

export function AssistantPickerBottomSheet({
  isOpen,
  onClose,
  onCreatePress,
  onSelect,
  selectedAssistantId,
}: AssistantPickerBottomSheetProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<BottomSheetMethods>(null);
  const [searchText, setSearchText] = useState('');
  const [headerHeight, setHeaderHeight] = useState(0);
  const { assistants, isLoading } = useAssistantsApi();
  const filteredAssistants = useMemo(
    () => filterAssistants(assistants, searchText),
    [assistants, searchText],
  );

  const handleClose = useCallback(() => {
    setSearchText('');
    onClose();
  }, [onClose]);
  const handleSelect = useCallback(
    (assistant: Assistant | null) => {
      onSelect(assistant);
      sheetRef.current?.close();
    },
    [onSelect],
  );
  const handleCreatePress = useCallback(() => {
    sheetRef.current?.close();
    onCreatePress();
  }, [onCreatePress]);
  const handleHeaderLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.round(event.nativeEvent.layout.height);
    setHeaderHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
  }, []);

  return (
    <SelectionBottomSheet bottomSheetRef={sheetRef} isOpen={isOpen} onClose={handleClose}>
      {({ sheetHeight }) => {
        const listHeight = Math.max(
          sheetHeight - (headerHeight || defaultAssistantPickerHeaderHeight),
          120,
        );

        return (
          <>
            <View className="px-4 pt-5" onLayout={handleHeaderLayout}>
              <SelectionSheetSearchField onChange={setSearchText} value={searchText} />
            </View>
            <View style={[styles.assistantListViewport, { height: listHeight }]}>
              <ScrollView
                className="flex-1"
                contentContainerStyle={styles.listContentContainer}
                keyboardDismissMode="on-drag"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <AssistantPickerActionRow
                  subtitle={t('assistant.picker.subtitle')}
                  title={t('assistant.actions.create')}
                  onPress={handleCreatePress}
                />
                {filteredAssistants.length > 0 ? (
                  filteredAssistants.map((assistant) => (
                    <AssistantPickerRow
                      key={assistant.id}
                      assistant={assistant}
                      isSelected={assistant.id === selectedAssistantId}
                      onPress={() => handleSelect(assistant)}
                    />
                  ))
                ) : (
                  <View className="items-center justify-center px-6 py-8">
                    <Text className="text-center text-default-foreground text-sm">
                      {isLoading ? t('assistant.list.loading') : t('assistant.list.emptySearch')}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </>
        );
      }}
    </SelectionBottomSheet>
  );
}

type AssistantPickerRowProps = {
  assistant: Assistant;
  isSelected: boolean;
  onPress: () => void;
};

function AssistantPickerRow({ assistant, isSelected, onPress }: AssistantPickerRowProps) {
  const { t } = useTranslation();
  const assistantSubtitle =
    assistant.modelName ?? assistant.modelId ?? assistant.description ?? assistant.prompt;
  const resolvedSubtitle = assistantSubtitle || t('assistant.model.none');

  return (
    <Pressable
      accessibilityLabel={assistant.name}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className={cn(
        'mx-4 flex-row items-center gap-3 rounded-xl px-3 py-2 active:opacity-60',
        isSelected ? 'bg-settings-grouped-surface' : 'bg-transparent',
      )}
      onPress={onPress}
    >
      <View className="size-10 items-center justify-center rounded-full bg-surface-secondary">
        <Text className="text-xl leading-6">{assistant.emoji || '🌟'}</Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-semibold text-base text-foreground" numberOfLines={1}>
          {assistant.name}
        </Text>
        <Text className="text-default-foreground text-sm" numberOfLines={1}>
          {resolvedSubtitle}
        </Text>
      </View>
      {isSelected ? <CheckIcon className="size-5 text-accent" strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

function AssistantPickerActionRow({
  onPress,
  subtitle,
  title,
}: {
  onPress: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      className="mx-4 flex-row items-center gap-3 rounded-xl px-3 py-2 active:opacity-60"
      onPress={onPress}
    >
      <View className="size-10 items-center justify-center rounded-full bg-surface-secondary">
        <PlusIcon className="size-5 text-foreground" strokeWidth={2.25} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-semibold text-base text-foreground" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-default-foreground text-sm" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <PlusIcon className="size-5 text-default-foreground" strokeWidth={2} />
    </Pressable>
  );
}

function filterAssistants(assistants: readonly Assistant[], searchText: string) {
  const query = searchText.trim().toLocaleLowerCase();

  if (!query) {
    return assistants;
  }

  return assistants.filter((assistant) =>
    [
      assistant.name,
      assistant.description,
      assistant.prompt,
      assistant.modelName,
      assistant.modelId,
    ]
      .filter(Boolean)
      .some((value) => value?.toLocaleLowerCase().includes(query)),
  );
}

const styles = StyleSheet.create({
  assistantListViewport: {
    flex: 1,
    minHeight: 0,
  },
  listContentContainer: {
    paddingBottom: 20,
    paddingTop: 12,
  },
});
