import { ContentState, useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { clearInitialURL, useLinkingURL } from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys, useBackendModule } from '@/frontend/data';

/** Navigation fallback for native auth sessions. Codes leave the route before exchange starts. */
export function McpOAuthCallbackScreen() {
  const url = useLinkingURL();
  const mcp = useBackendModule('mcp');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !url) return;
    handled.current = true;
    clearInitialURL();
    router.replace('/plugins');
    void mcp
      .receiveOAuthCallback(url)
      .then(async (server) => {
        if (!server) return;
        queryClient.setQueryData(queryKeys.mcpServers.detail(server.id), server);
        await queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.all() });
        await queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.tools(server.id) });
      })
      .catch(() => {
        toast.show({ label: t('settings.mcp.oauth.errors.invalid_response'), variant: 'danger' });
      });
  }, [mcp, queryClient, router, t, toast, url]);
  return <ContentState.Loading title={t('plugins.authorization.returning')} />;
}
