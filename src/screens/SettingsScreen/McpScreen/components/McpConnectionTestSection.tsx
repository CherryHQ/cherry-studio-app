import { Spinner } from 'heroui-native/spinner';
import { CheckCircleIcon, XCircleIcon } from 'lucide-uniwind/png';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useDataServices } from '@/data/runtime';
import type { McpConnectionConfig, McpToolSummary } from '@/services/mcp/McpService';
import { SettingsDialogActionButton } from '../../components/SettingsDialogActionButton';

type TestState =
  | { status: 'error'; message: string }
  | { status: 'idle' }
  | { status: 'success'; tools: McpToolSummary[] }
  | { status: 'testing' };

type McpConnectionTestSectionProps = {
  /** Resolve the current (possibly unsaved) form values at test time. */
  getConfig: () => McpConnectionConfig | null;
};

export function McpConnectionTestSection({ getConfig }: McpConnectionTestSectionProps) {
  const { t } = useTranslation();
  const services = useDataServices();
  const [state, setState] = useState<TestState>({ status: 'idle' });

  const runTest = useCallback(async () => {
    const config = getConfig();
    if (!config) {
      setState({ message: t('settings.mcp.fields.baseUrlRequired'), status: 'error' });
      return;
    }

    setState({ status: 'testing' });
    try {
      const { tools } = await services.mcp.testConnection(config);
      setState({ status: 'success', tools });
    } catch (error) {
      setState({
        message: error instanceof Error ? error.message : String(error),
        status: 'error',
      });
    }
  }, [getConfig, services, t]);

  return (
    <View className="gap-3">
      <SettingsDialogActionButton
        isLoading={state.status === 'testing'}
        label={t('settings.mcp.test.button')}
        onPress={() => {
          void runTest();
        }}
      />
      {state.status === 'testing' ? (
        <View className="flex-row items-center gap-2">
          <Spinner size="sm" />
          <Text className="text-default-foreground text-sm">{t('settings.mcp.test.testing')}</Text>
        </View>
      ) : null}
      {state.status === 'success' ? (
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <CheckCircleIcon className="size-5 text-success" strokeWidth={2} />
            <Text className="text-foreground text-sm">
              {t('settings.mcp.test.success', { count: state.tools.length })}
            </Text>
          </View>
          {state.tools.length > 0 ? (
            <View className="gap-1 rounded-xl bg-surface-tertiary p-3">
              {state.tools.map((tool) => (
                <Text
                  className="font-mono text-default-foreground text-xs"
                  key={tool.name}
                  numberOfLines={1}
                >
                  {tool.name}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {state.status === 'error' ? (
        <View className="flex-row items-center gap-2">
          <XCircleIcon className="size-5 text-danger-foreground" strokeWidth={2} />
          <Text className="flex-1 text-danger-foreground text-sm">
            {t('settings.mcp.test.failed', { message: state.message })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
