import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ToolCaseIcon from '@cherrystudio/app-icons/icons/tool-case';
import { Button, Composer } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useComposerMeta, useComposerState } from '@/frontend/components/Composer';
import { useSkillsApi } from '@/frontend/hooks/skill';
import type { SkillListItem } from '@/shared/data/types/skill';

import {
  createSkillMentionLabel,
  createSkillMentionUrl,
  readSkillMentions,
} from '../utils/skillMentions';

/** Uses the plugin picker's anchored menu and preserves the live composer keyboard. */
export function ChatInputSkillPopover({
  agentId,
  children,
  onClose,
  open,
  returnFocusRef,
}: {
  agentId?: string;
  children: ReactNode;
  onClose(): void;
  open: boolean;
  returnFocusRef?: RefObject<View | null>;
}) {
  const { t } = useTranslation();
  const { inputRef } = useComposerMeta();
  const { draft } = useComposerState();
  const selected = readSkillMentions(draft).skills;
  const initialFocusRef = useRef<View>(null);
  const selectionAccepted = useRef(false);
  const [shouldRestoreFocus, setShouldRestoreFocus] = useState(true);
  const { skills, error, isLoading, refetch, hasNext, loadNext, isLoadingMore } = useSkillsApi(
    { agentId, scope: 'composer' },
    { enabled: open && Boolean(agentId) },
  );
  useEffect(() => {
    if (open) selectionAccepted.current = false;
  }, [open]);
  useFocusEffect(
    useCallback(
      () => () => {
        setShouldRestoreFocus(false);
        onClose();
      },
      [onClose],
    ),
  );

  function close(reason: 'outside' | 'anchor' | 'back') {
    setShouldRestoreFocus(reason !== 'anchor');
    onClose();
  }

  function select(skill: SkillListItem, isSelected: boolean) {
    if (!open || selectionAccepted.current || (!isSelected && selected.length >= 8)) return;
    selectionAccepted.current = true;
    setShouldRestoreFocus(true);
    if (!isSelected) {
      inputRef.current?.insertLink(
        createSkillMentionLabel(skill.name),
        createSkillMentionUrl(skill.id),
      );
      inputRef.current?.insertText(' ');
    }
    onClose();
  }

  const content = (
    <ScrollView
      className="grow-0 shrink"
      contentContainerClassName="gap-0.5 p-2"
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
              className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-secondary-active disabled:opacity-50"
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
    <Composer.Popover
      accessibilityLabel={t('skills.title')}
      content={content}
      initialFocusRef={initialFocusRef}
      maxHeight={320}
      maxWidth={280}
      onClose={close}
      open={open}
      returnFocusRef={shouldRestoreFocus ? returnFocusRef : undefined}
      testID="chat-skill-popover"
    >
      {children}
    </Composer.Popover>
  );
}
