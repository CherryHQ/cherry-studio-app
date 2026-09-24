import { BottomSheet, Button, ContentState, Input, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useSkillsApi } from '@/frontend/hooks/skill';
import type { SkillListItem } from '@/shared/data/types/skill';

export type ComposerSkill = Pick<SkillListItem, 'id' | 'name'>;

/** Selection stays in the owning chat draft; closing this picker does not send anything. */
export function ChatInputSkillPicker({
  agentId,
  selected,
  onChange,
  onClose,
}: {
  agentId: string;
  selected: readonly ComposerSkill[];
  onChange(skills: readonly ComposerSkill[]): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const { skills, error, isLoading, refetch, hasNext, loadNext, isLoadingMore } = useSkillsApi({
    agentId,
    scope: 'composer',
    search,
  });
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('skills.title')}
      closeAction={{ accessibilityLabel: t('common.close') }}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 px-5 pb-6">
        <Input
          accessibilityLabel={t('skills.search')}
          placeholder={t('skills.search')}
          value={search}
          onChangeText={setSearch}
        />
        <Text className="text-sm text-muted-foreground">{t('skills.composer.hint')}</Text>
        {isLoading ? (
          <ContentState.Loading title={t('skills.loading')} />
        ) : error ? (
          <ContentState.Error
            title={t('skills.loadFailed')}
            primaryAction={{ children: t('common.retry'), onPress: () => void refetch() }}
          />
        ) : skills.length === 0 ? (
          <ContentState.Empty title={t('skills.composer.empty')} />
        ) : (
          <Section>
            {skills.map((skill) => {
              const isSelected = selected.some((item) => item.id === skill.id);
              return (
                <Section.SwitchItem
                  key={skill.id}
                  label={skill.name}
                  description={skill.description}
                  value={isSelected}
                  disabled={!isSelected && selected.length >= 8}
                  onValueChange={(value) =>
                    onChange(
                      value
                        ? [...selected, { id: skill.id, name: skill.name }]
                        : selected.filter((item) => item.id !== skill.id),
                    )
                  }
                />
              );
            })}
          </Section>
        )}
        {hasNext ? (
          <Button disabled={isLoadingMore} onPress={() => void loadNext()} variant="ghost">
            {t('skills.loadMore')}
          </Button>
        ) : null}
        {selected.length > 0 ? (
          <View>
            <Button onPress={() => onChange([])} variant="ghost">
              {t('common.clear')}
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}
