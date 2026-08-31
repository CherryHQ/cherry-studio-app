import {
  ContentState,
  Input,
  Label,
  TextField,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { useBackendModule } from '@/frontend/data';
import { useMcpServerApiById, useMcpServerMutations } from '@/frontend/hooks/mcp/useMcpServers';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import type { McpServer } from '@/shared/data/types/mcpServer';

import { McpServerChrome } from './components/McpServerChrome/McpServerChrome';
import { McpServerTabs } from './components/McpServerTabs/McpServerTabs';
import type { McpServerTab } from './components/McpServerTabs/types';
import { McpToolsSection } from './components/McpToolsSection';
import { parseMcpHeaders, serializeMcpHeaders } from './mcpHeaders';

const logger = loggerService.withContext('McpServerScreen');

const NEW_SERVER_SENTINEL = 'new';

type McpServerFormState = {
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
  const { alert } = useAlert();

  const isCreating = !serverId;
  const {
    createServer,
    deleteServer,
    isCreating: isCreateMutationPending,
    isDeleting,
    isUpdating,
    updateServer,
  } = useMcpServerMutations();

  const [form, setForm] = useState<McpServerFormState>(() => createFormState(server));
  const [activeTab, setActiveTab] = useState<McpServerTab>('configuration');
  const [isEditing, setIsEditing] = useState(isCreating);
  const [isSaving, setIsSaving] = useState(false);

  const updateField = useCallback(
    <TKey extends keyof McpServerFormState>(key: TKey, value: McpServerFormState[TKey]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    const dto = buildDto(form, t('settings.mcp.defaultName'));
    if (!dto.ok) {
      alert.show({ title: t(dto.errorKey) });
      return;
    }

    try {
      setIsSaving(true);
      if (serverId) {
        await updateServer(serverId, dto.value);
        setIsEditing(false);
      } else {
        const serverInfo = await mcp.getServerInfo({
          endpointUrl: dto.value.endpointUrl,
          headers: dto.value.headers,
        });
        const name = serverInfo.title?.trim() || serverInfo.name.trim() || dto.value.name;
        const createdServer = await createServer({ ...dto.value, isEnabled: true, name });
        setIsEditing(false);
        router.replace({
          params: { serverId: createdServer.id },
          pathname: '/settings/mcp/[serverId]',
        });
      }
    } catch (error) {
      logger.error('Failed to save MCP server', error as Error);
      alert.show({ title: t('settings.mcp.toast.saveFailed') });
    } finally {
      setIsSaving(false);
    }
  }, [alert, createServer, form, mcp, router, serverId, t, updateServer]);

  const handleToggleServer = useCallback(async () => {
    if (!serverId || !server) {
      return;
    }

    try {
      await updateServer(serverId, { isEnabled: !server.isEnabled });
    } catch (error) {
      logger.error('Failed to toggle MCP server', error as Error);
      alert.show({ title: t('settings.mcp.toast.saveFailed') });
    }
  }, [alert, server, serverId, t, updateServer]);

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
        alert.show({ title: t('settings.mcp.toast.saveFailed') });
      });
    },
    [alert, server, serverId, t, updateServer],
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
        alert.show({ title: t('settings.mcp.toast.deleteFailed') });
      });
  }, [alert, deleteServer, router, serverId, t, toast]);

  const requestDelete = useCallback(() => {
    if (!serverId || !server) {
      return;
    }

    alert.confirm({
      confirmLabel: t('common.delete'),
      description: t('settings.mcp.delete.message', { name: server.name }),
      onConfirm: handleDelete,
      role: 'destructive',
      title: t('settings.mcp.delete.title'),
    });
  }, [alert, handleDelete, server, serverId, t]);

  const isBusy = isSaving || isCreateMutationPending || isUpdating;
  const saveActions = useMemo<HeaderToolbarAction[]>(
    () => [
      isBusy
        ? {
            element: (
              <ActivityIndicator
                accessibilityLabel={t('common.save')}
                size="small"
                style={styles.headerActivityIndicator}
              />
            ),
            key: 'save',
            type: 'custom',
          }
        : {
            accessibilityLabel: t('common.save'),
            key: 'save',
            label: t('common.save'),
            onPress: () => {
              void handleSave();
            },
            type: 'label',
          },
    ],
    [handleSave, isBusy, t],
  );
  const editActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.edit'),
        key: 'edit',
        label: t('common.edit'),
        onPress: () => {
          setForm(createFormState(server));
          setIsEditing(true);
        },
        type: 'label',
      },
    ],
    [server, t],
  );

  const displayedForm = isEditing ? form : createFormState(server);
  const showHttpWarning = displayedForm.endpointUrl.trim().toLowerCase().startsWith('http://');
  const canShowTools = Boolean(serverId && server);
  const visibleTab = canShowTools ? activeTab : 'configuration';

  return (
    <>
      <RouteHeader
        rightActions={
          visibleTab === 'configuration' ? (isEditing ? saveActions : editActions) : undefined
        }
        title={t('settings.mcp.tabs.configuration')}
        titleElement={
          canShowTools && !isEditing ? (
            <McpServerTabs onTabChange={setActiveTab} tab={visibleTab} />
          ) : undefined
        }
      />
      {visibleTab === 'configuration' ? (
        <KeyboardAwareScrollView
          alwaysBounceVertical={false}
          bottomOffset={keyboardBottomOffset}
          contentContainerStyle={[
            styles.scrollContent,
            serverId ? styles.scrollContentWithChrome : null,
          ]}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          {!isCreating ? (
            <FormField isDisabled={!isEditing} label={t('settings.mcp.fields.name')}>
              <Input
                accessibilityLabel={t('settings.mcp.fields.name')}
                autoCorrect={false}
                onChangeText={(value) => updateField('name', value)}
                placeholder={t('settings.mcp.fields.name')}
                value={displayedForm.name}
              />
            </FormField>
          ) : null}
          <FormField isDisabled={!isEditing} label={t('settings.mcp.fields.endpointUrl')}>
            <Input
              accessibilityLabel={t('settings.mcp.fields.endpointUrl')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onChangeText={(value) => updateField('endpointUrl', value)}
              placeholder="https://example.com/mcp"
              spellCheck={false}
              value={displayedForm.endpointUrl}
            />
            {showHttpWarning ? (
              <Text className="text-warning text-xs">{t('settings.mcp.fields.httpWarning')}</Text>
            ) : null}
          </FormField>
          <FormField isDisabled={!isEditing} label={t('settings.mcp.fields.headers')}>
            <Input
              accessibilityLabel={t('settings.mcp.fields.headers')}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={(value) => updateField('headers', value)}
              placeholder={t('settings.mcp.fields.headersPlaceholder')}
              spellCheck={false}
              textAlignVertical="top"
              value={displayedForm.headers}
            />
            <Text className="text-muted-foreground text-xs">
              {t('settings.mcp.fields.headersHint')}
            </Text>
          </FormField>
        </KeyboardAwareScrollView>
      ) : server ? (
        <ScrollView
          alwaysBounceVertical={false}
          contentContainerStyle={[styles.scrollContent, styles.scrollContentWithChrome]}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <View className="rounded-2xl bg-grouped-surface p-4">
            <McpToolsSection isDisabled={isBusy} onToggleTool={handleToggleTool} server={server} />
          </View>
        </ScrollView>
      ) : null}
      {serverId && server ? (
        <McpServerChrome
          isDisabled={isEditing || isBusy || isDeleting}
          isEnabled={server.isEnabled}
          onDelete={requestDelete}
          onToggleEnabled={() => {
            void handleToggleServer();
          }}
        />
      ) : null}
    </>
  );
}

function FormField({
  children,
  isDisabled,
  label,
}: {
  children: React.ReactNode;
  isDisabled: boolean;
  label: string;
}) {
  return (
    <TextField isDisabled={isDisabled}>
      <Label>{label}</Label>
      {children}
    </TextField>
  );
}

function createFormState(server?: McpServer): McpServerFormState {
  return {
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

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 20,
    paddingBottom: 32,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  scrollContentWithChrome: {
    paddingBottom: 96,
  },
  headerActivityIndicator: {
    height: 32,
    width: 32,
  },
});
