import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Button, ContentState, Input, Section, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useRecommendedSkills } from '@/frontend/hooks/skill';
import { isSkillsError } from '@/shared/contracts/skills';
import type { SkillCandidate } from '@/shared/data/types/skill';

import { SkillPage } from './SkillPage';

/** A search listing has only a URL; a resolved candidate can open directly. */
type DiscoveryResult = {
  key: string;
  name: string;
  description: string;
  url: string | null;
  candidate: SkillCandidate | null;
};

const fromCandidate = (candidate: SkillCandidate): DiscoveryResult => ({
  key: candidate.candidateId,
  name: candidate.name,
  description: candidate.description,
  url: null,
  candidate,
});

export function SkillDiscoveryScreen() {
  const { t } = useTranslation();
  return (
    <SkillPage headerProps={{ title: t('skills.tabs.discover') }}>
      <DiscoverSkills />
    </SkillPage>
  );
}

function DiscoverSkills() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const skillsModule = useBackendModule('skills');
  const recommended = useRecommendedSkills();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DiscoveryResult[]>();
  const [isBusy, setIsBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const openCandidate = useCallback(
    (candidate: SkillCandidate) => {
      router.push({
        pathname: '/plugins/skills/candidate',
        params: { candidateId: candidate.candidateId },
      });
    },
    [router],
  );

  async function run(task: (signal: AbortSignal) => Promise<void>) {
    Keyboard.dismiss();
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    setIsBusy(true);
    try {
      await task(request.signal);
    } catch (error) {
      if (!request.signal.aborted)
        toast.show({
          label: t(`skills.error.${isSkillsError(error) ? error.code : 'source-unreachable'}`),
          variant: 'danger',
        });
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setIsBusy(false);
      }
    }
  }

  /** A link with one Skill opens it; several Skills are listed to choose from. */
  async function resolve(url: string, signal: AbortSignal) {
    const candidates = await skillsModule.resolve(url, signal);
    if (signal.aborted) return;
    if (candidates.length === 1) openCandidate(candidates[0]!);
    else setResults(candidates.map(fromCandidate));
  }

  function submit() {
    const text = query.trim();
    if (!text || isBusy) return;
    void run(async (signal) => {
      setResults(undefined);
      if (/^https:\/\//i.test(text)) return resolve(text, signal);
      const listings = await skillsModule.search(text, signal);
      if (!signal.aborted)
        setResults(
          listings.map((listing) => ({
            key: listing.url,
            name: listing.name,
            description: listing.source,
            url: listing.url,
            candidate: null,
          })),
        );
    });
  }

  function open(result: DiscoveryResult) {
    if (result.candidate) openCandidate(result.candidate);
    else if (result.url && !isBusy) void run((signal) => resolve(result.url!, signal));
  }

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Input
          accessibilityLabel={t('skills.discover.query')}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={500}
          onChangeText={setQuery}
          onSubmitEditing={submit}
          placeholder={t('skills.discover.query')}
          returnKeyType="search"
          value={query}
        />
        <Text className="px-1 text-muted-foreground text-xs">{t('skills.discover.hint')}</Text>
        <Button disabled={!query.trim() || isBusy} onPress={submit} size="sm">
          {t(isBusy ? 'skills.discover.searching' : 'skills.discover.search')}
        </Button>
        {isBusy ? (
          <Button variant="ghost" onPress={() => controller.current?.abort()}>
            {t('common.cancel')}
          </Button>
        ) : null}
        {results?.length === 0 ? <ContentState.Empty title={t('skills.discover.empty')} /> : null}
        {results?.length ? (
          <Section>
            {results.map((result) => (
              <Section.Item
                description={result.description}
                key={result.key}
                label={result.name}
                onPress={() => open(result)}
                trailing={<ChevronRightIcon className="size-5 text-muted-foreground" />}
              />
            ))}
          </Section>
        ) : null}
      </View>
      <View className="gap-2">
        <Text className="px-1 font-medium text-muted-foreground text-sm">
          {t('skills.recommended.title')}
        </Text>
        {recommended.isLoading ? <ContentState.Loading title={t('skills.loading')} /> : null}
        {recommended.isError ? (
          <ContentState.Error
            primaryAction={{
              children: t('common.retry'),
              onPress: () => void recommended.refetch(),
            }}
            title={t('skills.loadFailed')}
          />
        ) : null}
        {recommended.data ? (
          <Section>
            {recommended.data.map((candidate) => (
              <Section.Item
                accessibilityLabel={candidate.name}
                description={
                  <View className="gap-0.5">
                    <Text className="text-sm text-muted-foreground" numberOfLines={2}>
                      {candidate.description}
                    </Text>
                    {candidate.installedSkillId ? (
                      <Text className="text-xs text-success">
                        {t('skills.recommended.installed')}
                      </Text>
                    ) : null}
                  </View>
                }
                key={candidate.candidateId}
                label={candidate.name}
                onPress={() => openCandidate(candidate)}
                testID={`skill-candidate-${candidate.name}`}
                trailing={<ChevronRightIcon className="size-5 text-muted-foreground" />}
              />
            ))}
          </Section>
        ) : null}
      </View>
    </View>
  );
}
