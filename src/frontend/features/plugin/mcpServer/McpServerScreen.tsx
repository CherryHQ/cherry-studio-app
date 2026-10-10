import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import {
  Button,
  ContentState,
  Input,
  Tabs,
  TextField,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useQueryClient } from '@tanstack/react-query';
import { clearInitialURL } from 'expo-linking';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { PluginIcon } from '@/frontend/components/PluginIcon';
import { queryKeys, useBackendModule } from '@/frontend/data';
import {
  useMcpServerApiById,
  useMcpServerMutations,
  useMcpServerRuntimeSummaries,
} from '@/frontend/hooks/mcp/useMcpServers';
import type { McpServerRuntimeSummary } from '@/shared/contracts';
import { McpAuthorizationError } from '@/shared/contracts/mcp';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import type { McpServer } from '@/shared/data/types/mcpServer';

import { PluginPage } from '../components/PluginPage';
import { McpToolsSection } from './components/McpToolsSection';
import { parseMcpHeaders, serializeMcpHeaders } from './mcpHeaders';

const logger = loggerService.withContext('McpServerScreen');

const NEW_SERVER_SENTINEL = 'new';

type McpServerFormState = {
  authorization: 'headers' | 'oauth';
  clientId: string;
  endpointUrl: string;
  headers: string;
  name: string;
};

export function McpServerScreen() {
  const { serverId: rawServerId } = useLocalSearchParams<{ serverId?: string }>();
  const { t } = useTranslation();

  const isCreating = !rawServerId || rawServerId === NEW_SERVER_SENTINEL;
  const serverId = isCreating ? undefined : rawServerId;
  const { error, isLoading, refetch, server } = useMcpServerApiById(serverId);

  if (!isCreating && isLoading) {
    return (
      <McpServerStateScreen>
        <ContentState.Loading title={t('settings.mcp.detail.loading')} />
      </McpServerStateScreen>
    );
  }

  if (!isCreating && error) {
    const isNotFound = error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND;
    return (
      <McpServerStateScreen>
        {isNotFound ? (
          <ContentState.Empty title={t('settings.mcp.detail.notFound')} />
        ) : (
          <ContentState.Error
            description={error instanceof Error ? error.message : String(error)}
            primaryAction={{
              children: t('settings.mcp.retry'),
              onPress: () => void refetch(),
            }}
            title={t('settings.mcp.detail.loadFailed')}
          />
        )}
      </McpServerStateScreen>
    );
  }

  if (!isCreating && !server) {
    return (
      <McpServerStateScreen>
        <ContentState.Empty title={t('settings.mcp.detail.notFound')} />
      </McpServerStateScreen>
    );
  }

  if (server?.origin === 'builtin') {
    return (
      <Redirect
        href={{ pathname: '/plugins/[pluginId]', params: { pluginId: server.builtinId } }}
      />
    );
  }

  return (
    <McpServerEditor key={server?.id ?? NEW_SERVER_SENTINEL} server={server} serverId={serverId} />
  );
}

function McpServerStateScreen({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <>
      <RouteHeader title={t('settings.mcp.tabs.configuration')} />
      <View className="flex-1 justify-center px-6">{children}</View>
    </>
  );
}

function McpServerEditor({ server, serverId }: { server?: McpServer; serverId?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const mcp = useBackendModule('mcp');
  const queryClient = useQueryClient();
  const { alert } = useAlert();
  const { theme } = useUniwind();
  const mcpIcon = resolveProviderIcon('mcp')?.[theme === 'dark' ? 'dark' : 'light'];

  const isCreating = !serverId;
  const {
    createServer,
    deleteServer,
    isCreating: isCreateMutationPending,
    isDeleting,
    isUpdating,
    updateServer,
  } = useMcpServerMutations();
  const summaryServers = useMemo(() => (server ? [server] : []), [server]);
  const { summaries } = useMcpServerRuntimeSummaries(summaryServers);
  const summary = server ? summaries[server.id] : undefined;

  const [form, setForm] = useState<McpServerFormState>(() => createFormState(server));
  const [isSaving, setIsSaving] = useState(false);
  // Discovery can outlast the user's patience; once they leave, going back would pop their next page.
  const isFocused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      isFocused.current = true;
      return () => {
        isFocused.current = false;
      };
    }, []),
  );
  const savedForm = createFormState(server);
  const isDirty =
    isCreating ||
    form.name !== savedForm.name ||
    form.endpointUrl !== savedForm.endpointUrl ||
    form.headers !== savedForm.headers ||
    form.authorization !== savedForm.authorization ||
    form.clientId !== savedForm.clientId;

  const updateField = useCallback(
    <TKey extends keyof McpServerFormState>(key: TKey, value: McpServerFormState[TKey]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(
    async (reauthorize = false) => {
      const dto = buildDto(form, t('settings.mcp.defaultName'));
      if (!dto.ok) {
        alert.show({ title: t(dto.errorKey) });
        return;
      }

      try {
        setIsSaving(true);
        const needsOAuth =
          form.authorization === 'oauth' &&
          (reauthorize ||
            savedForm.authorization !== 'oauth' ||
            form.endpointUrl !== savedForm.endpointUrl ||
            form.headers !== savedForm.headers ||
            form.clientId !== savedForm.clientId);
        if (needsOAuth) {
          const attempt = await mcp.beginOAuth({
            ...dto.value,
            serverId,
            clientId: form.clientId.trim() || undefined,
          });
          if (!isFocused.current) {
            mcp.cancelOAuth(attempt.attemptId);
            return;
          }
          try {
            const result = await WebBrowser.openAuthSessionAsync(
              attempt.authorizationUrl,
              attempt.redirectUrl,
            );
            if (result.type !== 'success') {
              mcp.cancelOAuth(attempt.attemptId);
              return;
            }
            clearInitialURL();
            const connected = await mcp.completeOAuth(attempt.attemptId, result.url);
            queryClient.setQueryData(queryKeys.mcpServers.detail(connected.id), connected);
            await queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.all() });
            await queryClient.invalidateQueries({
              queryKey: queryKeys.mcpServers.tools(connected.id),
            });
            if (isFocused.current) {
              if (isCreating) router.back();
              else setForm(createFormState(connected));
            }
          } finally {
            mcp.cancelOAuth(attempt.attemptId);
          }
          return;
        }
        if (serverId) {
          if (server?.origin !== 'builtin' && server?.oauth && form.authorization === 'headers')
            await mcp.disconnectOAuth(serverId);
          await updateServer(serverId, { ...dto.value, isEnabled: server?.isEnabled });
          // Show the stored values, including a name filled in from the endpoint.
          setForm({ ...form, ...dto.value, headers: serializeMcpHeaders(dto.value.headers) });
        } else {
          const serverInfo = await mcp.getServerInfo({
            endpointUrl: dto.value.endpointUrl,
            headers: dto.value.headers,
          });
          const name = serverInfo.title?.trim() || serverInfo.name.trim() || dto.value.name;
          await createServer({ ...dto.value, isEnabled: true, name });
          // The new server joins the Plugins page's MCP group; opening it from there edits it.
          if (isFocused.current) router.back();
        }
      } catch (error) {
        if (error instanceof McpAuthorizationError) {
          if (error.code !== 'cancelled')
            toast.show({ label: t(`settings.mcp.oauth.errors.${error.code}`), variant: 'danger' });
          return;
        }
        logger.error('Failed to save MCP server', error as Error);
        toast.show({ label: t('settings.mcp.toast.saveFailed'), variant: 'danger' });
      } finally {
        setIsSaving(false);
      }
    },
    [
      alert,
      createServer,
      form,
      isCreating,
      mcp,
      queryClient,
      router,
      savedForm,
      server,
      serverId,
      t,
      toast,
      updateServer,
    ],
  );

  const handleDisconnectOAuth = async () => {
    if (!serverId) return;
    setIsSaving(true);
    try {
      const disconnected = await mcp.disconnectOAuth(serverId);
      queryClient.setQueryData(queryKeys.mcpServers.detail(serverId), disconnected);
      await queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.all() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.mcpServers.tools(serverId) });
      setForm(createFormState(disconnected));
    } catch {
      toast.show({ label: t('settings.mcp.toast.saveFailed'), variant: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleServer = useCallback(async () => {
    if (!serverId || !server) {
      return;
    }

    try {
      await updateServer(serverId, { isEnabled: !server.isEnabled });
    } catch (error) {
      logger.error('Failed to toggle MCP server', error as Error);
      toast.show({ label: t('settings.mcp.toast.saveFailed'), variant: 'danger' });
    }
  }, [server, serverId, t, toast, updateServer]);

  /**
   * A rule is the tool's raw name, so enabling drops that one entry and
   * disabling adds it. The row is the source of truth; the switch reads back
   * from it once the write lands.
   */
  const handleToggleTool = useCallback(
    (toolName: string, enabled: boolean) => {
      if (!serverId || !server) {
        return;
      }

      const disabledTools = enabled
        ? server.disabledTools.filter((name) => name !== toolName)
        : [...server.disabledTools, toolName];

      void updateServer(serverId, { disabledTools }).catch((error) => {
        logger.error('Failed to toggle MCP tool', error as Error);
        toast.show({ label: t('settings.mcp.toast.saveFailed'), variant: 'danger' });
      });
    },
    [server, serverId, t, toast, updateServer],
  );

  const handleDelete = useCallback(() => {
    if (!serverId) {
      return;
    }

    const deletion = deleteServer(serverId);
    router.back();
    void deletion
      .then(() => {
        toast.show({ label: t('settings.mcp.toast.deleted'), variant: 'success' });
      })
      .catch((error) => {
        logger.error('Failed to delete MCP server', error as Error);
        toast.show({ label: t('settings.mcp.toast.deleteFailed'), variant: 'danger' });
      });
  }, [deleteServer, router, serverId, t, toast]);

  const isBusy = isSaving || isCreateMutationPending || isUpdating;
  const serverActions = useMemo<HeaderToolbarAction[] | undefined>(
    () =>
      server
        ? [
            {
              accessibilityLabel: t('common.more'),
              disabled: isBusy || isDeleting,
              icon: EllipsisIcon,
              items: [
                {
                  id: 'mcp-server-toggle',
                  label: t(
                    server.isEnabled ? 'settings.mcp.disableServer' : 'settings.mcp.enableServer',
                  ),
                  onPress: () => void handleToggleServer(),
                },
                {
                  destructive: true,
                  id: 'mcp-server-delete',
                  label: t('settings.mcp.deleteServer'),
                  onPress: () =>
                    alert.confirm({
                      confirmLabel: t('common.delete'),
                      description: t('settings.mcp.delete.message', { name: server.name }),
                      onConfirm: handleDelete,
                      role: 'destructive',
                      title: t('settings.mcp.delete.title'),
                    }),
                },
              ],
              key: 'mcp-server-actions',
              testID: 'mcp-server-actions',
              type: 'menu',
            },
          ]
        : undefined,
    [alert, handleDelete, handleToggleServer, isBusy, isDeleting, server, t],
  );

  const status = server ? getServerStatus(server, summary) : undefined;
  const showHttpWarning = form.endpointUrl.trim().toLowerCase().startsWith('http://');

  return (
    <>
      <RouteHeader
        rightActions={serverActions}
        title={server ? server.name : t('settings.mcp.addServer')}
      />
      <PluginPage
        footer={
          <Button
            disabled={!isDirty || isBusy || isDeleting}
            loading={isBusy}
            onPress={() => void handleSave()}
            size="lg"
            testID="mcp-server-save"
          >
            {isCreating ? t('settings.mcp.addServer') : t('common.save')}
          </Button>
        }
        testID="mcp-server"
      >
        <View className="flex-row items-center gap-4">
          <PluginIcon size="large" source={mcpIcon} />
          <View className="min-w-0 flex-1 gap-1">
            <Text
              accessibilityRole="header"
              className="text-2xl font-semibold text-foreground"
              numberOfLines={1}
            >
              {server ? server.name : t('settings.mcp.defaultName')}
            </Text>
            {status ? (
              <Text className="text-sm text-muted-foreground">
                <Text
                  className={
                    status === 'connected'
                      ? 'text-success'
                      : status === 'error'
                        ? 'text-error'
                        : 'text-muted-foreground'
                  }
                >
                  {t(`settings.mcp.list.status.${status}`)}
                </Text>
                {summary?.toolCount === undefined
                  ? null
                  : ` · ${t('settings.mcp.list.toolCount', { count: summary.toolCount })}`}
              </Text>
            ) : (
              <Text className="text-sm text-muted-foreground">{t('plugins.custom.summary')}</Text>
            )}
          </View>
        </View>
        <View className="gap-4">
          <FormField label={t('settings.mcp.oauth.authentication')}>
            <Tabs
              items={[
                { value: 'headers', label: t('settings.mcp.fields.headers') },
                { value: 'oauth', label: 'OAuth' },
              ]}
              onValueChange={(value) => {
                if (!isBusy) updateField('authorization', value as 'headers' | 'oauth');
              }}
              value={form.authorization}
            />
          </FormField>
          {form.authorization === 'oauth' ? (
            <FormField label={t('settings.mcp.oauth.clientId')}>
              <Input
                accessibilityLabel={t('settings.mcp.oauth.clientId')}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value) => updateField('clientId', value)}
                value={form.clientId}
                placeholder={t('settings.mcp.oauth.optional')}
              />
              <Text className="text-xs text-muted-foreground">
                {t('settings.mcp.oauth.clientIdHint')}
              </Text>
              {server?.origin !== 'builtin' && server?.oauth ? (
                <View className="flex-row gap-3">
                  <Button disabled={isBusy} onPress={() => void handleSave(true)}>
                    {t('settings.mcp.oauth.reconnect')}
                  </Button>
                  <Button
                    disabled={isBusy}
                    variant="outline"
                    onPress={() => void handleDisconnectOAuth()}
                  >
                    {t('settings.mcp.oauth.disconnect')}
                  </Button>
                </View>
              ) : null}
            </FormField>
          ) : null}
          {!isCreating ? (
            <FormField label={t('settings.mcp.fields.name')}>
              <Input
                accessibilityLabel={t('settings.mcp.fields.name')}
                autoCorrect={false}
                onChangeText={(value) => updateField('name', value)}
                placeholder={t('settings.mcp.fields.name')}
                value={form.name}
              />
            </FormField>
          ) : null}
          <FormField label={t('settings.mcp.fields.endpointUrl')}>
            <Input
              accessibilityLabel={t('settings.mcp.fields.endpointUrl')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={(value) => updateField('endpointUrl', value)}
              placeholder="https://example.com/mcp"
              value={form.endpointUrl}
            />
            {showHttpWarning ? (
              <Text className="text-warning text-xs">{t('settings.mcp.fields.httpWarning')}</Text>
            ) : null}
          </FormField>
          <FormField label={t('settings.mcp.fields.headers')}>
            <Input
              accessibilityLabel={t('settings.mcp.fields.headers')}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={(value) => updateField('headers', value)}
              placeholder={t('settings.mcp.fields.headersPlaceholder')}
              spellCheck={false}
              textAlignVertical="top"
              value={form.headers}
            />
            <Text className="text-muted-foreground text-xs">
              {t('settings.mcp.fields.headersHint')}
            </Text>
          </FormField>
        </View>
        {server ? (
          <McpToolsSection isDisabled={isBusy} onToggleTool={handleToggleTool} server={server} />
        ) : null}
      </PluginPage>
    </>
  );
}

function FormField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <TextField>
      <TextField.Label>{label}</TextField.Label>
      {children}
    </TextField>
  );
}

function getServerStatus(
  server: McpServer,
  summary: McpServerRuntimeSummary | undefined,
): McpServerRuntimeSummary['state'] {
  if (!server.isEnabled) {
    return 'disabled';
  }
  return summary?.state ?? 'connecting';
}

function createFormState(server?: McpServer): McpServerFormState {
  const oauth = server?.origin !== 'builtin' ? server?.oauth : undefined;
  return {
    authorization: oauth ? 'oauth' : 'headers',
    clientId: oauth?.clientId ?? '',
    endpointUrl: server?.endpointUrl ?? '',
    headers: serializeMcpHeaders(server?.headers),
    name: server?.name ?? '',
  };
}

function buildDto(
  form: McpServerFormState,
  defaultName: string,
): { errorKey: string; ok: false } | { ok: true; value: McpServerConfigurationDto } {
  const endpointUrl = form.endpointUrl.trim();
  try {
    const parsedUrl = new URL(endpointUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { errorKey: 'settings.mcp.fields.endpointUrlInvalid', ok: false };
    }
  } catch {
    return { errorKey: 'settings.mcp.fields.endpointUrlInvalid', ok: false };
  }

  const headers = parseMcpHeaders(form.headers);
  if (!headers.ok) {
    return { errorKey: 'settings.mcp.fields.headersInvalid', ok: false };
  }

  return {
    ok: true,
    value: {
      endpointUrl,
      headers: headers.value,
      name: form.name.trim() || getFallbackServerName(endpointUrl, defaultName),
    },
  };
}

type McpServerConfigurationDto = {
  endpointUrl: string;
  headers: Record<string, string>;
  name: string;
};

function getFallbackServerName(endpointUrl: string, defaultName: string): string {
  try {
    return new URL(endpointUrl).hostname || defaultName;
  } catch {
    return defaultName;
  }
}
