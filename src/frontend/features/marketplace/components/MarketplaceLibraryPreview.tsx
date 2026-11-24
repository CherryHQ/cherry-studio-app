import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { ContentState } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { AgentAvatar } from '@/frontend/components/Avatar';
import { EmptyIllustration } from '@/frontend/components/EmptyIllustration';
import { useAgentsApi } from '@/frontend/hooks/agent';
import { useSkillsApi } from '@/frontend/hooks/skill';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { MarketplaceIcon } from './MarketplaceIcon';

const PREVIEW_SIZE = 4;

export function MarketplaceSkillLibraryPreview() {
  const { t } = useTranslation();
  const router = useRouter();
  const { agentId, sessionId } = useLocalSearchParams<{
    agentId?: string | string[];
    sessionId?: string | string[];
  }>();
  const library = useSkillsApi({ scope: 'library', limit: PREVIEW_SIZE });

  return (
    <LibraryPreview
      copy={{
        empty: t('skills.installedEmpty'),
        failed: t('skills.loadFailed'),
        loading: t('skills.loading'),
      }}
      items={library.skills.slice(0, PREVIEW_SIZE).map((skill) => (
        <LibraryItem
          key={skill.id}
          name={skill.name}
          onPress={() =>
            router.push({ pathname: '/skills/[skillId]', params: { skillId: skill.id } })
          }
          testID={`marketplace-installed-skill-${skill.id}`}
        >
          <MarketplaceIcon kind="skill" />
        </LibraryItem>
      ))}
      onOpen={() =>
        router.push({
          pathname: '/skills/library',
          params: {
            agentId: getSingleRouteParam(agentId),
            sessionId: getSingleRouteParam(sessionId),
          },
        })
      }
      state={library}
      testID="marketplace-my-skills"
      title={t('skills.library')}
    />
  );
}

export function MarketplaceAgentLibraryPreview() {
  const { t } = useTranslation();
  const router = useRouter();
  const library = useAgentsApi();

  return (
    <LibraryPreview
      copy={{
        empty: t('agent.list.emptyTitle'),
        failed: t('agent.list.loadFailed'),
        loading: t('agent.list.loading'),
      }}
      items={library.agents.slice(0, PREVIEW_SIZE).map((agent) => (
        <LibraryItem
          key={agent.id}
          name={agent.name}
          onPress={() =>
            router.push({ pathname: '/agents/[agentId]/edit', params: { agentId: agent.id } })
          }
          testID={`marketplace-owned-agent-${agent.id}`}
        >
          <AgentAvatar avatar={agent.avatar} name={agent.name} size={48} uri={agent.avatarUri} />
        </LibraryItem>
      ))}
      onOpen={() => router.push('/agents')}
      state={library}
      testID="marketplace-my-agents"
      title={t('marketplace.myAgents')}
    />
  );
}

function LibraryPreview({
  copy,
  items,
  onOpen,
  state,
  testID,
  title,
}: {
  copy: { empty: string; failed: string; loading: string };
  items: readonly ReactElement[];
  onOpen(): void;
  state: { error: unknown; isLoading: boolean; refetch(): unknown };
  testID: string;
  title: string;
}) {
  const { t } = useTranslation();

  return (
    <View className="mx-auto w-full max-w-[880px] gap-2 px-4" testID={testID}>
      <Pressable
        accessibilityLabel={title}
        accessibilityRole="link"
        className="min-h-11 flex-row items-center gap-1 self-start active:opacity-60"
        onPress={onOpen}
        testID={`${testID}-open`}
      >
        <Text className="shrink text-base font-medium text-muted-foreground">{title}</Text>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </Pressable>
      {items.length ? (
        <View className="flex-row gap-3">{items}</View>
      ) : (
        <View className="min-h-8 justify-center">
          {state.isLoading ? (
            <ContentState.Loading layout="row" title={copy.loading} />
          ) : state.error ? (
            <ContentState.Error
              layout="leading"
              primaryAction={{ children: t('common.retry'), onPress: () => void state.refetch() }}
              title={copy.failed}
            />
          ) : (
            <ContentState.Empty
              icon={<EmptyIllustration scene="collection" size="panel" />}
              title={copy.empty}
            />
          )}
        </View>
      )}
    </View>
  );
}

function LibraryItem({
  children,
  name,
  onPress,
  testID,
}: {
  children: ReactNode;
  name: string;
  onPress(): void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={name}
      accessibilityRole="link"
      className="max-w-24 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 active:bg-secondary"
      onPress={onPress}
      testID={testID}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {children}
      </View>
      <Text className="w-full text-center text-sm text-foreground" numberOfLines={2}>
        {name}
      </Text>
    </Pressable>
  );
}
