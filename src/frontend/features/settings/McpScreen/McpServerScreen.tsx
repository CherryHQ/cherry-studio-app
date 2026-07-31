import { useLocalSearchParams, useRouter } from 'expo-router';
import { Input } from 'heroui-native/input';
import { useToast } from 'heroui-native/toast';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useConfirmDialog } from '@/frontend/components/confirmDialog';
import { BackHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
import { useBackendModule } from '@/frontend/data';
import { useMcpServerApiById, useMcpServerMutations } from '@/frontend/hooks/mcp/useMcpServers';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import { withMcpToolRuleAdded, withMcpToolRuleCleared } from '@/shared/ai/tools/mcpSourcePolicy';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { DataApiError, ErrorCode } from '@/shared/data/api/types';
import type { StreamableHttpMcpServer } from '@/shared/data/types/mcpServer';
import { SettingsDialogActionButton } from '../components/SettingsDialogActionButton';
import { McpHeadersEditor } from './components/McpHeadersEditor';
import { McpServerChrome } from './components/McpServerChrome/McpServerChrome';
import { McpServerTabs } from './components/McpServerTabs/McpServerTabs';
import type { McpServerTab } from './components/McpServerTabs/types';
import { McpToolsSection } from './components/McpToolsSection';
import { parseHeaderText, serializeHeaders } from './utils/headerText';

const logger = loggerService.withContext('McpServerScreen');

const NEW_SERVER_SENTINEL = 'new';

type McpServerFormState = {
  baseUrl: string;
  description: string;
  headerText: string;
  name: string;
  timeout: string;
};

export function McpServerScreen() {
  const { serverId: rawServerId } = useLocalSearchParams<{ serverId?: string }>();
  const { t } = useTranslation();

  const isCreating = !rawServerId || rawServerId === NEW_SERVER_SENTINEL;
  const serverId = isCreating ? undefined : rawServerId;
  const { error, isLoading, refetch, server } = useMcpServerApiById(serverId);

  if (!isCreating && isLoading) {
    return <McpServerLoadState isLoading message={t('settings.mcp.detail.loading')} />;
  }

  if (!isCreating && error) {
    const isNotFound = error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND;
    return (
      <McpServerLoadState
        detail={isNotFound ? undefined : error instanceof Error ? error.message : String(error)}
        message={t(isNotFound ? 'settings.mcp.detail.notFound' : 'settings.mcp.detail.loadFailed')}
        onRetry={isNotFound ? undefined : () => void refetch()}
      />
    );
  }

  if (!isCreating && !server) {
    return <McpServerLoadState message={t('settings.mcp.detail.notFound')} />;
  }

  return (
    <McpServerEditor key={server?.id ?? NEW_SERVER_SENTINEL} server={server} serverId={serverId} />
  );
}

function McpServerLoadState({
  detail,
  isLoading = false,
  message,
  onRetry,
}: {
  detail?: string;
  isLoading?: boolean;
  message: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <BackHeader title={t('settings.mcp.tabs.configuration')} />
      <View className="flex-1 items-center justify-center gap-3 px-6">
        {isLoading ? <ActivityIndicator size="small" /> : null}
        <Text
          className={
            onRetry
              ? 'text-center text-danger-foreground text-sm'
              : 'text-center text-default-foreground text-sm'
          }
        >
          {message}
        </Text>
        {detail ? (
          <Text className="text-center text-default-foreground text-xs" selectable>
            {detail}
          </Text>
        ) : null}
        {onRetry ? (
          <SettingsDialogActionButton label={t('settings.mcp.retry')} onPress={onRetry} />
        ) : null}
      </View>
    </>
  );
}

function McpServerEditor({
  server,
  serverId,
}: {
  server?: StreamableHttpMcpServer;
  serverId?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const mcp = useBackendModule('mcp');
  const { confirmDialog, requestConfirm } = useConfirmDialog();

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
      toast.show({ label: t(dto.errorKey, dto.errorOptions), variant: 'danger' });
      return;
    }

    try {
      setIsSaving(true);
      if (serverId) {
        await updateServer(serverId, dto.value);
        setIsEditing(false);
      } else {
        const serverInfo = await mcp.getServerInfo({
          baseUrl: dto.value.baseUrl,
          headers: dto.value.headers,
        });
        const name = serverInfo.title?.trim() || serverInfo.name.trim() || dto.value.name;
        const description = serverInfo.instructions?.trim() || dto.value.description;
        const createdServer = await createServer({
          ...dto.value,
          description,
          isActive: true,
          name,
        });
        setIsEditing(false);
        router.replace({
          params: { serverId: createdServer.id },
          pathname: '/settings/mcp/[serverId]',
        });
      }
    } catch (error) {
      logger.error('Failed to save MCP server', error as Error);
      toast.show({ label: t('settings.mcp.toast.saveFailed'), variant: 'danger' });
    } finally {
      setIsSaving(false);
    }
  }, [createServer, form, mcp, router, serverId, t, toast, updateServer]);

  const handleToggleTool = useCallback(
    async (toolName: string, enabled: boolean, knownToolNames: string[]) => {
      if (!serverId || !server) {
        return;
      }
      // The switch renders off for wire ids and wildcards too, so turning it
      // back on has to clear those forms as well.
      const nextDisabled = enabled
        ? withMcpToolRuleCleared(server.disabledTools, server, toolName, knownToolNames)
        : withMcpToolRuleAdded(server.disabledTools, toolName);
      try {
        await updateServer(serverId, { disabledTools: nextDisabled });
      } catch (error) {
        logger.error('Failed to toggle MCP tool', error as Error);
        toast.show({ label: t('settings.mcp.toast.saveFailed'), variant: 'danger' });
      }
    },
    [server, serverId, t, toast, updateServer],
  );

  const handleToggleAutoApprove = useCallback(
    async (toolName: string, autoApprove: boolean, knownToolNames: string[]) => {
      if (!serverId || !server) {
        return;
      }
      // Listed = force prompt, so auto-approve ON clears the rule (re-expanding
      // wildcards like the enable toggle) and OFF appends the tool.
      const nextDisabled = autoApprove
        ? withMcpToolRuleCleared(server.disabledAutoApproveTools, server, toolName, knownToolNames)
        : withMcpToolRuleAdded(server.disabledAutoApproveTools, toolName);
      try {
        await updateServer(serverId, { disabledAutoApproveTools: nextDisabled });
      } catch (error) {
        logger.error('Failed to toggle MCP tool auto-approve', error as Error);
        toast.show({ label: t('settings.mcp.toast.saveFailed'), variant: 'danger' });
      }
    },
    [server, serverId, t, toast, updateServer],
  );

  const handleToggleServer = useCallback(async () => {
    if (!serverId || !server) {
      return;
    }

    const nextIsActive = !server.isActive;
    try {
      await updateServer(serverId, { isActive: nextIsActive });
    } catch (error) {
      logger.error('Failed to toggle MCP server', error as Error);
      toast.show({ label: t('settings.mcp.toast.saveFailed'), variant: 'danger' });
    }
  }, [server, serverId, t, toast, updateServer]);

  const handleDelete = useCallback(async () => {
    if (!serverId) {
      return;
    }
    try {
      await deleteServer(serverId);
      toast.show({ label: t('settings.mcp.toast.deleted'), variant: 'success' });
      router.back();
    } catch (error) {
      logger.error('Failed to delete MCP server', error as Error);
      toast.show({ label: t('settings.mcp.toast.deleteFailed'), variant: 'danger' });
    }
  }, [deleteServer, router, serverId, t, toast]);

  const requestDelete = useCallback(() => {
    if (!serverId || !server) {
      return;
    }

    requestConfirm({
      message: t('settings.mcp.delete.message', { name: server.name }),
      onConfirm: handleDelete,
      title: t('settings.mcp.delete.title'),
    });
  }, [handleDelete, requestConfirm, server, serverId, t]);

  const isBusy = isSaving || isCreateMutationPending || isUpdating;
  const saveActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        disabled: isBusy,
        element: isBusy ? (
          <ActivityIndicator
            accessibilityLabel={t('common.save')}
            size="small"
            style={styles.headerActivityIndicator}
          />
        ) : undefined,
        key: 'save',
        label: t('common.save'),
        onPress: () => {
          void handleSave();
        },
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
      },
    ],
    [server, t],
  );

  const displayedForm = isEditing ? form : createFormState(server);
  const showHttpWarning = displayedForm.baseUrl.trim().toLowerCase().startsWith('http://');
  const canShowTools = Boolean(serverId && server);
  const visibleTab = canShowTools ? activeTab : 'configuration';

  return (
    <>
      <BackHeader
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
            <FormField label={t('settings.mcp.fields.name')}>
              <Input
                accessibilityLabel={t('settings.mcp.fields.name')}
                autoCorrect={false}
                className="rounded-2xl px-4 text-base text-foreground leading-5"
                isDisabled={!isEditing}
                onChangeText={(value) => updateField('name', value)}
                placeholder={t('settings.mcp.fields.name')}
                placeholderColorClassName="accent-muted"
                style={styles.textInput}
                value={displayedForm.name}
                variant="secondary"
              />
            </FormField>
          ) : null}
          <FormField label={t('settings.mcp.fields.baseUrl')}>
            <Input
              accessibilityLabel={t('settings.mcp.fields.baseUrl')}
              autoCapitalize="none"
              autoCorrect={false}
              className="rounded-2xl px-4 text-base text-foreground leading-5"
              isDisabled={!isEditing}
              keyboardType="url"
              onChangeText={(value) => updateField('baseUrl', value)}
              placeholder="https://example.com/mcp"
              placeholderColorClassName="accent-muted"
              spellCheck={false}
              style={styles.textInput}
              value={displayedForm.baseUrl}
              variant="secondary"
            />
            {showHttpWarning ? (
              <Text className="text-warning-foreground text-xs">
                {t('settings.mcp.fields.httpWarning')}
              </Text>
            ) : null}
          </FormField>
          {!isCreating ? (
            <FormField label={t('settings.mcp.fields.description')}>
              <Input
                accessibilityLabel={t('settings.mcp.fields.description')}
                className="rounded-2xl px-4 text-base text-foreground leading-5"
                isDisabled={!isEditing}
                onChangeText={(value) => updateField('description', value)}
                placeholder={t('settings.mcp.fields.description')}
                placeholderColorClassName="accent-muted"
                style={styles.textInput}
                value={displayedForm.description}
                variant="secondary"
              />
            </FormField>
          ) : null}
          <FormField label={t('settings.mcp.headers.title')}>
            <McpHeadersEditor
              isDisabled={!isEditing}
              onChangeText={(value) => updateField('headerText', value)}
              value={displayedForm.headerText}
            />
          </FormField>
          <FormField label={t('settings.mcp.fields.timeout')}>
            <Input
              accessibilityLabel={t('settings.mcp.fields.timeout')}
              className="rounded-2xl px-4 text-base text-foreground leading-5"
              inputMode="numeric"
              isDisabled={!isEditing}
              keyboardType="number-pad"
              onChangeText={(value) => updateField('timeout', value)}
              placeholder="60"
              placeholderColorClassName="accent-muted"
              style={styles.textInput}
              value={displayedForm.timeout}
              variant="secondary"
            />
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
          <View className="rounded-2xl bg-settings-grouped-surface p-4">
            <McpToolsSection
              isReadOnly={isUpdating}
              onToggleAutoApprove={handleToggleAutoApprove}
              onToggleTool={handleToggleTool}
              server={server}
            />
          </View>
        </ScrollView>
      ) : null}
      {serverId && server ? (
        <McpServerChrome
          isActive={server.isActive}
          isDisabled={isEditing || isBusy || isDeleting}
          onDelete={requestDelete}
          onToggleActive={() => {
            void handleToggleServer();
          }}
        />
      ) : null}
      {confirmDialog}
    </>
  );
}

function FormField({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <View className="gap-2">
      <Text className="px-1 font-medium text-default-foreground text-sm">{label}</Text>
      {children}
    </View>
  );
}

function createFormState(server?: StreamableHttpMcpServer): McpServerFormState {
  return {
    baseUrl: server?.baseUrl ?? '',
    description: server?.description ?? '',
    headerText: serializeHeaders(server?.headers),
    name: server?.name ?? '',
    timeout: server?.timeout != null ? String(server.timeout) : '',
  };
}

function buildDto(
  form: McpServerFormState,
  defaultName: string,
):
  | { errorKey: string; errorOptions?: { line: number }; ok: false }
  | { ok: true; value: McpServerConfigurationDto } {
  const baseUrl = form.baseUrl.trim();
  try {
    const parsedUrl = new URL(baseUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { errorKey: 'settings.mcp.fields.baseUrlInvalid', ok: false };
    }
  } catch {
    return { errorKey: 'settings.mcp.fields.baseUrlInvalid', ok: false };
  }

  const trimmedTimeout = form.timeout.trim();
  let timeout: number | null = null;
  if (trimmedTimeout) {
    const parsed = Number(trimmedTimeout);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      return { errorKey: 'settings.mcp.fields.timeoutInvalid', ok: false };
    }
    timeout = parsed;
  }

  const parsedHeaders = parseHeaderText(form.headerText);
  if (!parsedHeaders.ok) {
    return {
      errorKey: 'settings.mcp.headers.invalidLine',
      errorOptions: { line: parsedHeaders.line },
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      baseUrl,
      description: form.description.trim(),
      headers: parsedHeaders.headers,
      name: form.name.trim() || getFallbackServerName(baseUrl, defaultName),
      timeout,
    },
  };
}

type McpServerConfigurationDto = {
  baseUrl: string;
  description: string;
  headers: Record<string, string>;
  name: string;
  timeout: number | null;
};

function getFallbackServerName(baseUrl: string, defaultName: string): string {
  try {
    return new URL(baseUrl).hostname || defaultName;
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
  textInput: {
    includeFontPadding: false,
    minHeight: 48,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
    verticalAlign: 'middle',
  },
});
