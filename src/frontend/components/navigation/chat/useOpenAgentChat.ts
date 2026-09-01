import { useAlert } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys } from '@/frontend/data';
import { useApiClient } from '@/frontend/data/DataApiProvider';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { chatHref } from './chatRoute';

const logger = loggerService.withContext('OpenAgentChat');

/** Resolves and opens an Agent's latest Session, or its draft when it has none. */
export function useOpenAgentChat() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const requestIdRef = useRef(0);

  return useCallback(
    async (agentId: string) => {
      const requestId = ++requestIdRef.current;

      try {
        const query = { agentId, limit: 1 };
        const result = await queryClient.fetchQuery({
          queryFn: () => apiClient.get('/agent-sessions', { query }),
          queryKey: queryKeys.agentSessions.list(query),
        });
        if (requestId !== requestIdRef.current) {
          return;
        }

        const session = result.items[0];
        router.replace(
          chatHref(
            session
              ? { agentId: session.agentId, kind: 'session', sessionId: session.id }
              : { agentId, kind: 'draft' },
          ),
        );
      } catch (error) {
        logger.error('Failed to resolve the latest Agent Session', error as Error);
        if (requestId === requestIdRef.current) {
          alert.show({ title: t('navigation.chatsLoadFailed') });
        }
      }
    },
    [alert, apiClient, queryClient, router, t],
  );
}
