import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Button, ContentState, Input, Section, useToast } from '@cherrystudio/ui/components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { isSkillsError, type SkillDiscoveryResult } from '@/shared/contracts/skills';
import type { SkillCandidate } from '@/shared/data/types/skill';

export function SkillAiDiscovery({ onSelect }: { onSelect(candidate: SkillCandidate): void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const skills = useBackendModule('skills');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SkillDiscoveryResult>();
  const [isSearching, setIsSearching] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [],
  );

  async function discover() {
    if (!query.trim() || isSearching) return;
    Keyboard.dismiss();
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    setIsSearching(true);
    setResult(undefined);
    try {
      const next = await skills.discover(query.trim(), request.signal);
      if (!request.signal.aborted) setResult(next);
    } catch (error) {
      if (!request.signal.aborted)
        toast.show({
          label: t(`skills.error.${isSkillsError(error) ? error.code : 'ai-unavailable'}`),
          variant: 'danger',
        });
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setIsSearching(false);
      }
    }
  }

  return (
    <View className="gap-2">
      <Text className="px-1 font-medium text-muted-foreground text-sm">
        {t('skills.ai.discoverTitle')}
      </Text>
      <Input
        accessibilityLabel={t('skills.ai.query')}
        placeholder={t('skills.ai.query')}
        value={query}
        onChangeText={setQuery}
        maxLength={500}
        onSubmitEditing={() => void discover()}
        returnKeyType="search"
      />
      <Text className="px-1 text-muted-foreground text-xs">{t('skills.ai.discoveryHint')}</Text>
      <Button disabled={!query.trim() || isSearching} onPress={() => void discover()} size="sm">
        {t(isSearching ? 'skills.ai.searching' : 'skills.ai.search')}
      </Button>
      {isSearching ? (
        <Button variant="ghost" onPress={() => controller.current?.abort()}>
          {t('common.cancel')}
        </Button>
      ) : null}
      {result?.partial ? (
        <Text className="text-sm text-muted-foreground">{t('skills.ai.partial')}</Text>
      ) : null}
      {result?.items.length === 0 ? <ContentState.Empty title={t('skills.ai.empty')} /> : null}
      {result?.items.length ? (
        <Section>
          {result.items.map(({ candidate, reason }) => (
            <Section.Item
              key={candidate.candidateId}
              label={candidate.name}
              description={reason}
              onPress={() => onSelect(candidate)}
              trailing={<ChevronRightIcon className="size-5 text-muted-foreground" />}
            />
          ))}
        </Section>
      ) : null}
    </View>
  );
}
