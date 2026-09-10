import { Button, ContentState, Input, TextField, useToast } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader } from '@/frontend/appShell/header';
import { useBackendModule } from '@/frontend/data';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import { PluginError } from '@/shared/contracts/plugins';
import { PluginIdSchema, type PluginCatalogEntry } from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import { getPluginText } from '../../pluginCatalog';
import { usePluginCatalog } from '../../usePluginCatalog';
import { useRefreshPluginConnections } from '../../usePluginConnections';
import { FeishuConnect } from './FeishuConnect';

export function PluginConnectScreen() {
  const { pluginId } = useLocalSearchParams<{ pluginId: string }>();
  const parsed = PluginIdSchema.safeParse(pluginId);
  const { t } = useTranslation();
  const catalog = usePluginCatalog();
  if (!parsed.success) return <ContentState.Empty title={t('plugins.notFound')} />;
  if (catalog.isLoading) return <ContentState.Loading title={t('plugins.loading')} />;
  if (catalog.isError)
    return (
      <ContentState.Error
        title={t('plugins.loadFailed')}
        primaryAction={{ children: t('common.retry'), onPress: () => void catalog.refetch() }}
      />
    );
  const entry = catalog.data?.find((item) => item.id === parsed.data);
  if (!entry) return <ContentState.Empty title={t('plugins.unavailable')} />;
  return <PluginConnect key={entry.id} entry={entry} />;
}

function PluginConnect({ entry }: { entry: PluginCatalogEntry }) {
  const [useCredentials, setUseCredentials] = useState(false);
  if (entry.interactiveAuthorization === 'feishu-device' && !useCredentials)
    return <FeishuConnect entry={entry} onUseCredentials={() => setUseCredentials(true)} />;
  return (
    <CredentialConnect
      entry={entry}
      onUseBrowser={entry.interactiveAuthorization ? () => setUseCredentials(false) : undefined}
    />
  );
}

function CredentialConnect({
  entry,
  onUseBrowser,
}: {
  entry: PluginCatalogEntry;
  onUseBrowser?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const plugins = useBackendModule('plugins');
  const refresh = useRefreshPluginConnections();
  const { toast } = useToast();
  const pendingConnection = useRef<AbortController | null>(null);
  useEffect(() => () => pendingConnection.current?.abort(), []);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(() => new Set());
  const name = getPluginText(entry.name, i18n.language);

  async function connect() {
    if (pendingConnection.current) return;
    const parsed = createPluginCredentialsSchema(entry.credentialFields).safeParse(fields);
    if (!parsed.success) {
      setInvalidFields(new Set(parsed.error.issues.map((issue) => String(issue.path[0]))));
      return;
    }
    const controller = new AbortController();
    pendingConnection.current = controller;
    Keyboard.dismiss();
    setIsConnecting(true);
    try {
      // Keep credentials out of query/mutation caches and route parameters.
      await plugins.connect({ pluginId: entry.id, fields: parsed.data }, controller.signal);
      setFields({});
      await refresh();
      toast.show({ label: t('plugins.connectSuccess', { name }), variant: 'success' });
      router.back();
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.show({
        label:
          error instanceof PluginError
            ? t(`plugins.errors.${error.reason}`)
            : t('plugins.errors.request'),
        variant: 'danger',
      });
    } finally {
      pendingConnection.current = null;
      setIsConnecting(false);
    }
  }

  return (
    <>
      <RouteHeader title={t('plugins.connectTitle', { name })} />
      <KeyboardAwareScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-6 px-6 py-6"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        bottomOffset={keyboardBottomOffset}
        testID="plugin-connect"
      >
        <Text className="text-base text-muted-foreground">
          {onUseBrowser
            ? t('plugins.feishu.manualSetup')
            : getPluginText(entry.setup, i18n.language)}
        </Text>
        <View className="gap-4">
          {entry.credentialFields.map((field) => {
            const invalid = invalidFields.has(field.id);
            const label = getPluginText(field.label, i18n.language);
            return (
              <TextField key={field.id} invalid={invalid} disabled={isConnecting}>
                <TextField.Label>{label}</TextField.Label>
                <Input
                  accessibilityLabel={label}
                  {...(field.secret
                    ? {
                        type: 'password' as const,
                        visibilityAccessibilityLabels: {
                          hide: t('plugins.hideCredential'),
                          show: t('plugins.showCredential'),
                        },
                      }
                    : {
                        type: 'text' as const,
                        autoCapitalize: 'none' as const,
                        autoCorrect: false,
                      })}
                  value={fields[field.id] ?? ''}
                  onChangeText={(value) => {
                    setFields((previous) => ({ ...previous, [field.id]: value }));
                    setInvalidFields((previous) => {
                      const next = new Set(previous);
                      next.delete(field.id);
                      return next;
                    });
                  }}
                  disabled={isConnecting}
                  invalid={invalid}
                  maxLength={field.maxLength}
                  onSubmitEditing={() => void connect()}
                  returnKeyType="done"
                  testID={`plugin-field-${field.id}`}
                />
                <TextField.Error>{getPluginText(field.error, i18n.language)}</TextField.Error>
              </TextField>
            );
          })}
          <Button
            variant="link"
            size="inline"
            onPress={() => void openExternalUrl(entry.links.credentials)}
          >
            {getPluginText(entry.credentialLinkLabel, i18n.language)}
          </Button>
        </View>
        <Text className="text-sm text-muted-foreground">{t('plugins.credentialPrivacy')}</Text>
        <Button
          size="lg"
          loading={isConnecting}
          disabled={entry.credentialFields.some((field) => !fields[field.id]?.trim())}
          onPress={() => void connect()}
          testID="plugin-connect-submit"
        >
          {t('plugins.authorize')}
        </Button>
        {onUseBrowser ? (
          <Button variant="link" disabled={isConnecting} onPress={onUseBrowser}>
            {t('plugins.feishu.useBrowser')}
          </Button>
        ) : null}
      </KeyboardAwareScrollView>
    </>
  );
}
