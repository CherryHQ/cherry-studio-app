import { BottomSheet, Button, ContentState } from '@cherrystudio/ui/components';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useRemoteAgent, useRemoteConnection } from '@/frontend/appShell/remoteAgent';

const fieldLabels = {
  text: 'remoteAgent.text',
  input: 'remoteAgent.input',
  output: 'remoteAgent.output',
  error: 'remoteAgent.error',
  artifact: 'remoteAgent.artifact',
  artifacts: 'remoteAgent.artifact',
} as const;
export function RemoteMessageDetails({
  sessionId,
  messageId,
  onClose,
}: {
  sessionId: string;
  messageId: string;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const { controller, connectionId } = useRemoteAgent();
  const connection = useRemoteConnection();
  const [resource, setResource] = useState<string>();
  const descriptors = useInfiniteQuery({
    queryKey: [
      'agentController',
      connectionId,
      connection.sourceKey,
      sessionId,
      messageId,
      'details',
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => controller.details(sessionId, messageId, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 0,
    retry: false,
  });
  const content = useQuery({
    queryKey: ['agentController', connectionId, connection.sourceKey, 'content', resource],
    queryFn: ({ signal }) => controller.readDetail(resource!, signal),
    enabled: Boolean(resource),
    staleTime: 0,
    retry: false,
    gcTime: 0,
  });
  return (
    <BottomSheet open onClose={onClose} title={t('remoteAgent.details')} size="large">
      <ScrollView contentContainerClassName="gap-4 px-6 pb-6">
        {descriptors.isPending ? (
          <ContentState.Loading title={t('remoteAgent.loading')} />
        ) : descriptors.isError ? (
          <ContentState.Error
            title={t('remoteAgent.loadFailed')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => void descriptors.refetch(),
            }}
          />
        ) : null}
        {descriptors.data?.pages
          .flatMap((page) => page.items)
          .map((detail) => (
            <View className="gap-2" key={detail.id}>
              {detail.name ? (
                <Text className="font-medium text-foreground">{detail.name}</Text>
              ) : null}
              <View className="flex-row flex-wrap gap-2">
                {detail.fields.map((field) => (
                  <Button
                    key={field.resource}
                    variant={resource === field.resource ? 'secondary' : 'outline'}
                    onPress={() => setResource(field.resource)}
                  >
                    {t(
                      fieldLabels[field.name as keyof typeof fieldLabels] ?? 'remoteAgent.details',
                    )}
                  </Button>
                ))}
              </View>
            </View>
          ))}
        {descriptors.hasNextPage ? (
          <Button
            loading={descriptors.isFetchingNextPage}
            onPress={() => void descriptors.fetchNextPage()}
          >
            {t('remoteAgent.loadMore')}
          </Button>
        ) : null}
        {resource && content.isPending ? (
          <ContentState.Loading title={t('remoteAgent.loading')} />
        ) : null}
        {content.isError ? (
          <ContentState.Error
            title={t('remoteAgent.loadFailed')}
            primaryAction={{ children: t('common.retry'), onPress: () => void content.refetch() }}
          />
        ) : null}
        {content.data !== undefined ? (
          <Text selectable className="font-mono text-sm text-foreground">
            {content.data}
          </Text>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}
