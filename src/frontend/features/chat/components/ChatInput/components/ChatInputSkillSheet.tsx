import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ToolCaseIcon from '@cherrystudio/app-icons/icons/tool-case';
import { BottomSheet, Button } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View, type ViewInstance } from 'react-native';

import { useComposerMeta, useComposerState } from '@/frontend/components/Composer';
import { useSkillsApi } from '@/frontend/hooks/skill';
import type { SkillListItem } from '@/shared/data/types/skill';

import { createMentionLabel } from '../utils/mentionLabels';
import { createSkillMentionUrl, readSkillMentions } from '../utils/skillMentions';

/** Selects an installed Skill into the mounted composer without changing its Agent binding. */
export function ChatInputSkillSheet({
  agentId,
  onClose,
  onClosed,
  onSelect,
  open,
  returnFocusRef,
}: {
  agentId?: string;
  onClose(): void;
  onClosed?: () => void;
  onSelect(): void;
  open: boolean;
  returnFocusRef?: RefObject<ViewInstance | null>;
}) {
  const { t } = useTranslation();
  const { inputRef } = useComposerMeta();
  const { draft } = useComposerState();
  const selected = readSkillMentions(draft).skills;
  const initialFocusRef = useRef<ViewInstance>(null);
  const selectionAccepted = useRef(false);
  // Follow installations while the picker is open.
  const { skills, error, isLoading, refetch, hasNext, loadNext, isLoadingMore } = useSkillsApi(
    { agentId, scope: 'composer' },
    { enabled: Boolean(agentId) },
  );
  useEffect(() => {
    if (open) selectionAccepted.current = false;
  }, [open]);
  useFocusEffect(
    useCallback(
      () => () => {
        onClose();
      },
      [onClose],
    ),
  );

  function select(skill: SkillListItem, isSelected: boolean) {
    if (!open || selectionAccepted.current || (!isSelected && selected.length >= 8)) return;
    selectionAccepted.current = true;
    if (!isSelected) {
      inputRef.current?.insertLink(createMentionLabel(skill.name), createSkillMentionUrl(skill.id));
      inputRef.current?.insertText(' ');
    }
    onSelect();
  }

  const content = (
    <ScrollView
      className="min-h-0 flex-1"
      contentContainerClassName="gap-1 px-5 py-2"
      keyboardDismissMode="none"
      keyboardShouldPersistTaps="always"
    >
      {isLoading || error || skills.length === 0 ? (
        <View className="gap-2 px-3 py-2">
          <Text className="text-sm text-muted-foreground">
            {t(
              isLoading ? 'skills.loading' : error ? 'skills.loadFailed' : 'skills.composer.empty',
            )}
          </Text>
          {error ? (
            <Button onPress={() => void refetch()} size="sm" variant="ghost">
              {t('common.retry')}
            </Button>
          ) : null}
        </View>
      ) : (
        skills.map((skill, index) => {
          const isSelected = selected.some((item) => item.id === skill.id);
          const isDisabled = !isSelected && selected.length >= 8;
          return (
            <Pressable
              accessibilityLabel={skill.name}
              accessibilityRole="button"
              accessibilityState={{ disabled: isDisabled, selected: isSelected }}
              className="min-h-14 flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-secondary-active disabled:opacity-50"
              disabled={isDisabled}
              key={skill.id}
              onPress={() => select(skill, isSelected)}
              ref={index === 0 ? initialFocusRef : undefined}
              testID={`chat-skill-${skill.id}`}
            >
              <ToolCaseIcon className="size-5 text-foreground" />
              <Text className="min-w-0 flex-1 text-base text-foreground" numberOfLines={2}>
                {skill.name}
              </Text>
              {isSelected ? <CheckIcon className="size-5 text-primary" /> : null}
            </Pressable>
          );
        })
      )}
      {hasNext ? (
        <Button disabled={isLoadingMore} onPress={() => void loadNext()} size="sm" variant="ghost">
          {t('skills.loadMore')}
        </Button>
      ) : null}
    </ScrollView>
  );

  return (
    <BottomSheet
      onClosed={onClosed}
      initialFocusRef={initialFocusRef}
      onClose={onClose}
      open={open}
      presentation="overlay"
      returnFocusRef={returnFocusRef}
      size="full"
      testID="chat-skill-sheet"
      title={t('skills.title')}
    >
      {content}
    </BottomSheet>
  );
}
