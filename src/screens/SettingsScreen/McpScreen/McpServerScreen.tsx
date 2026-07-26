import { useLocalSearchParams, useRouter } from 'expo-router';
import { Input } from 'heroui-native/input';
import { Switch } from 'heroui-native/switch';
import { useToast } from 'heroui-native/toast';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import {
  withMcpToolDisabled,
  withMcpToolEnabled,
  withMcpToolRuleAdded,
  withMcpToolRuleCleared,
} from '@/ai/tools/mcpSourcePolicy';
import { BackHeader, type HeaderToolbarAction } from '@/components/headers';
import { keyboardBottomOffset } from '@/config/constants';
import { loggerService } from '@/core/logger/LoggerService';
import type { CreateMcpServerDto, UpdateMcpServerDto } from '@/data/api/schemas/mcpServers';
import type { McpServer } from '@/data/types/mcpServer';
import { useMcpServerApiById, useMcpServerMutations } from '@/hooks/mcp/useMcpServers';
import type { McpConnectionConfig } from '@/services/mcp/McpService';
import { SettingsDialogActionButton } from '../components/SettingsDialogActionButton';
import { McpConnectionTestSection } from './components/McpConnectionTestSection';
import {
  type HeaderRow,
  headerRowsToRecord,
  McpHeadersEditor,
  recordToHeaderRows,
} from './components/McpHeadersEditor';
import { McpToolsSection } from './components/McpToolsSection';

const logger = loggerService.withContext('McpServerScreen');

const NEW_SERVER_SENTINEL = 'new';

type McpServerFormState = {
  baseUrl: string;
  description: string;
  headerRows: HeaderRow[];
  isActive: boolean;
  name: string;
  timeout: string;
};

export function McpServerScreen() {
  const { serverId: rawServerId } = useLocalSearchParams<{ serverId?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();

  const isCreating = !rawServerId || rawServerId === NEW_SERVER_SENTINEL;
  const serverId = isCreating ? undefined : rawServerId;
  const { server } = useMcpServerApiById(serverId);
  const {
    createServer,
    deleteServer,
    isCreating: isSaving,
    isDeleting,
    isUpdating,
    updateServer,
  } = useMcpServerMutations();

  const [form, setForm] = useState<McpServerFormState>(() => createFormState(server));
  const [syncedServer, setSyncedServer] = useState(server);

  // Re-seed the form once the async record arrives (render-time, no effect).
  if (server !== syncedServer) {
    setSyncedServer(server);
    if (server) {
      setForm(createFormState(server));
    }
  }

  const updateField = useCallback(
    <TKey extends keyof McpServerFormState>(key: TKey, value: McpServerFormState[TKey]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const getConnectionConfig = useCallback((): McpConnectionConfig | null => {
    const baseUrl = form.baseUrl.trim();
    if (!baseUrl) {
      return null;
    }
    return { baseUrl, headers: headerRowsToRecord(form.headerRows) };
  }, [form.baseUrl, form.headerRows]);

  const handleSave = useCallback(async () => {
    const dto = buildDto(form);
    if (!dto.ok) {
      toast.show({ label: t(dto.errorKey), variant: 'danger' });
      return;
    }

    try {
      if (serverId) {
        await updateServer(serverId, dto.value);
      } else {
        await createServer(dto.value);
      }
      toast.show({ label: t('settings.mcp.toast.saved'), variant: 'success' });
      router.back();
    } catch (error) {
      logger.error('Failed to save MCP server', error as Error);
      toast.show({ label: t('settings.mcp.toast.saveFailed'), variant: 'danger' });
    }
  }, [createServer, form, router, serverId, t, toast, updateServer]);

  const handleToggleTool = useCallback(
    (toolName: string, enabled: boolean, knownToolNames: string[]) => {
      if (!serverId || !server) {
        return;
      }
      // The switch renders off for wire ids and wildcards too, so turning it
      // back on has to clear those forms as well — see `withMcpToolEnabled`.
      const nextDisabled = enabled
        ? withMcpToolEnabled(server, toolName, knownToolNames)
        : withMcpToolDisabled(server, toolName);
      void updateServer(serverId, { disabledTools: nextDisabled }).catch((error: unknown) => {
        logger.error('Failed to toggle MCP tool', error as Error);
        toast.show({ label: t('settings.mcp.toast.saveFailed'), variant: 'danger' });
      });
    },
    [server, serverId, t, toast, updateServer],
  );

  const handleToggleAutoApprove = useCallback(
    (toolName: string, autoApprove: boolean, knownToolNames: string[]) => {
      if (!serverId || !server) {
        return;
      }
      // Listed = force prompt, so auto-approve ON clears the rule (re-expanding
      // wildcards like the enable toggle) and OFF appends the tool.
      const nextDisabled = autoApprove
        ? withMcpToolRuleCleared(server.disabledAutoApproveTools, server, toolName, knownToolNames)
        : withMcpToolRuleAdded(server.disabledAutoApproveTools, toolName);
      void updateServer(serverId, { disabledAutoApproveTools: nextDisabled }).catch(
        (error: unknown) => {
          logger.error('Failed to toggle MCP tool auto-approve', error as Error);
          toast.show({ label: t('settings.mcp.toast.saveFailed'), variant: 'danger' });
        },
      );
    },
    [server, serverId, t, toast, updateServer],
  );

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

  const title = isCreating ? t('settings.mcp.addServer') : t('settings.mcp.editServer');
  const isBusy = isSaving || isUpdating;
  const saveActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        disabled: isBusy,
        icon: 'checkmark',
        key: 'save',
        onPress: () => {
          void handleSave();
        },
      },
    ],
    [handleSave, isBusy, t],
  );

  const showHttpWarning = form.baseUrl.trim().toLowerCase().startsWith('http://');

  return (
    <>
      <BackHeader
        rightActions={saveActions}
        title={isCreating ? t('settings.mcp.addServer') : (server?.name ?? title)}
      />
      <KeyboardAwareScrollView
        alwaysBounceVertical={false}
        bottomOffset={keyboardBottomOffset}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <FormSection title={t('settings.mcp.fields.name')}>
          <Input
            accessibilityLabel={t('settings.mcp.fields.name')}
            autoCorrect={false}
            className="rounded-2xl px-4 text-base text-foreground leading-5"
            onChangeText={(value) => updateField('name', value)}
            placeholder={t('settings.mcp.fields.name')}
            placeholderColorClassName="accent-muted"
            style={styles.textInput}
            value={form.name}
            variant="secondary"
          />
          <FormField label={t('settings.mcp.fields.baseUrl')}>
            <Input
              accessibilityLabel={t('settings.mcp.fields.baseUrl')}
              autoCapitalize="none"
              autoCorrect={false}
              className="rounded-2xl px-4 text-base text-foreground leading-5"
              keyboardType="url"
              onChangeText={(value) => updateField('baseUrl', value)}
              placeholder="https://example.com/mcp"
              placeholderColorClassName="accent-muted"
              spellCheck={false}
              style={styles.textInput}
              value={form.baseUrl}
              variant="secondary"
            />
            {showHttpWarning ? (
              <Text className="text-warning-foreground text-xs">
                {t('settings.mcp.fields.httpWarning')}
              </Text>
            ) : null}
          </FormField>
          <FormField label={t('settings.mcp.fields.description')}>
            <Input
              accessibilityLabel={t('settings.mcp.fields.description')}
              className="rounded-2xl px-4 text-base text-foreground leading-5"
              onChangeText={(value) => updateField('description', value)}
              placeholder={t('settings.mcp.fields.description')}
              placeholderColorClassName="accent-muted"
              style={styles.textInput}
              value={form.description}
              variant="secondary"
            />
          </FormField>
          <FormField label={t('settings.mcp.fields.timeout')}>
            <Input
              accessibilityLabel={t('settings.mcp.fields.timeout')}
              className="rounded-2xl px-4 text-base text-foreground leading-5"
              inputMode="numeric"
              keyboardType="number-pad"
              onChangeText={(value) => updateField('timeout', value)}
              placeholder="60"
              placeholderColorClassName="accent-muted"
              style={styles.textInput}
              value={form.timeout}
              variant="secondary"
            />
          </FormField>
          <View className="min-h-10 flex-row items-center justify-between gap-4">
            <Text className="min-w-0 flex-1 font-medium text-base text-foreground">
              {t('settings.mcp.fields.isActive')}
            </Text>
            <Switch
              isSelected={form.isActive}
              onSelectedChange={(value) => updateField('isActive', value)}
            />
          </View>
        </FormSection>

        <FormSection title={t('settings.mcp.headers.title')}>
          <McpHeadersEditor
            onChange={(rows) => updateField('headerRows', rows)}
            rows={form.headerRows}
          />
        </FormSection>

        <FormSection title={t('settings.mcp.test.title')}>
          <McpConnectionTestSection getConfig={getConnectionConfig} />
        </FormSection>

        {serverId && server ? (
          <FormSection title={t('settings.mcp.tools.title')}>
            <McpToolsSection
              disabledAutoApproveTools={server.disabledAutoApproveTools}
              disabledTools={server.disabledTools}
              onToggleAutoApprove={handleToggleAutoApprove}
              onToggleTool={handleToggleTool}
              server={server}
            />
          </FormSection>
        ) : null}

        {serverId ? (
          <SettingsDialogActionButton
            isDisabled={isDeleting}
            isLoading={isDeleting}
            label={t('settings.mcp.deleteServer')}
            onPress={() => {
              void handleDelete();
            }}
          />
        ) : null}
      </KeyboardAwareScrollView>
    </>
  );
}

function FormSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View className="gap-2">
      <Text className="px-1 font-medium text-default-foreground text-sm">{title}</Text>
      <View className="gap-4 rounded-2xl bg-settings-grouped-surface p-4">{children}</View>
    </View>
  );
}

function FormField({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <View className="gap-2">
      <Text className="font-medium text-foreground text-sm">{label}</Text>
      {children}
    </View>
  );
}

function createFormState(server?: McpServer): McpServerFormState {
  return {
    baseUrl: server?.baseUrl ?? '',
    description: server?.description ?? '',
    headerRows: recordToHeaderRows(server?.headers),
    isActive: server?.isActive ?? true,
    name: server?.name ?? '',
    timeout: server?.timeout != null ? String(server.timeout) : '',
  };
}

function buildDto(
  form: McpServerFormState,
): { errorKey: string; ok: false } | { ok: true; value: CreateMcpServerDto & UpdateMcpServerDto } {
  const name = form.name.trim();
  if (!name) {
    return { errorKey: 'settings.mcp.fields.nameRequired', ok: false };
  }

  const baseUrl = form.baseUrl.trim();
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
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

  return {
    ok: true,
    value: {
      baseUrl,
      description: form.description.trim(),
      headers: headerRowsToRecord(form.headerRows),
      isActive: form.isActive,
      name,
      timeout,
    },
  };
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 24,
    paddingBottom: 32,
    paddingHorizontal: 16,
    paddingTop: 20,
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
