import { Button, ContentState, useToast } from '@cherrystudio/ui/components';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { useBackendModule } from '@/frontend/data';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import { PluginError } from '@/shared/contracts/plugins';
import type { PluginCatalogEntry, PluginCredentialMethod } from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import { PluginIdentity } from '../../components/PluginIdentity';
import { PluginPage } from '../../components/PluginPage';
import { usePluginConnections, useRefreshPluginConnections } from '../../usePluginConnections';
import { CredentialFields, hasEveryField } from './CredentialFields';

export function CredentialConnect({
  entry,
  method,
  children,
}: {
  entry: PluginCatalogEntry;
  method: PluginCredentialMethod;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const plugins = useBackendModule('plugins');
  const refresh = useRefreshPluginConnections();
  const connections = usePluginConnections();
  const { toast } = useToast();
  const pendingConnection = useRef<AbortController | null>(null);
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  useEffect(() => () => pendingConnection.current?.abort(), []);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(() => new Set());
  const name = t(`plugins.catalog.${entry.id}.name`);
  const needsConnectionCheck = method.requiresDisconnect === true && !isConnecting && !isConnected;
  const requiresDisconnect =
    needsConnectionCheck &&
    connections.data?.some((connection) => connection.pluginId === entry.id);
  const isCheckingConnection = needsConnectionCheck && connections.isLoading;
  const hasConnectionError = needsConnectionCheck && connections.isError;

  const returnToDetail = () =>
    router.dismissTo({ pathname: '/plugins/[pluginId]', params: { pluginId: entry.id } });

  async function connect() {
    if (
      pendingConnection.current ||
      isConnected ||
      requiresDisconnect ||
      isCheckingConnection ||
      hasConnectionError
    )
      return;
    const parsed = createPluginCredentialsSchema(method.fields).safeParse(fields);
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
      await plugins.connect(
        { pluginId: entry.id, authMethod: method.id, fields: parsed.data },
        controller.signal,
      );
      setIsConnected(true);
      setFields({});
      // Connection persistence succeeded; refresh failures must not turn it into an auth failure.
      await refresh().catch(() => {});
      if (!focused.current || controller.signal.aborted) return;
      toast.show({ label: t('plugins.connectSuccess', { name }), variant: 'success' });
      returnToDetail();
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
      <PluginPage
        testID="plugin-connect"
        footer={
          <>
            {!isConnecting && !isConnected ? children : null}
            <Button
              size="lg"
              loading={isConnecting || isCheckingConnection}
              disabled={
                !requiresDisconnect &&
                !hasConnectionError &&
                !isConnected &&
                !hasEveryField(method.fields, fields)
              }
              onPress={() => {
                if (requiresDisconnect || isConnected) returnToDetail();
                else if (hasConnectionError) void connections.refetch();
                else void connect();
              }}
              testID="plugin-connect-submit"
            >
              {t(
                requiresDisconnect
                  ? 'plugins.authorization.manageConnection'
                  : isConnected
                    ? 'common.done'
                    : hasConnectionError
                      ? 'common.retry'
                      : isConnecting
                        ? 'plugins.authorization.connecting'
                        : 'plugins.authorize',
              )}
            </Button>
          </>
        }
      >
        <PluginIdentity entry={entry} />
        {requiresDisconnect ? (
          <ContentState.Empty
            layout="leading"
            title={t('plugins.authorization.requiresDisconnect')}
          />
        ) : hasConnectionError ? (
          <ContentState.Error layout="leading" title={t('plugins.loadFailed')} />
        ) : isConnected ? (
          <Text className="text-lg font-semibold text-foreground">
            {t('plugins.connectSuccess', { name })}
          </Text>
        ) : (
          <View className="gap-6">
            <Text className="text-sm text-muted-foreground">
              {t(`plugins.catalog.${entry.id}.authMethods.${method.id}.setup`)}
            </Text>
            <View className="gap-4">
              <CredentialFields
                pluginId={entry.id}
                fields={method.fields}
                values={fields}
                invalidFields={invalidFields}
                disabled={isConnecting || isCheckingConnection}
                onChange={(fieldId, value) => {
                  setFields((previous) => ({ ...previous, [fieldId]: value }));
                  setInvalidFields((previous) => {
                    const next = new Set(previous);
                    next.delete(fieldId);
                    return next;
                  });
                }}
                onSubmit={() => void connect()}
              />
              <View className="items-start">
                <Button
                  variant="link"
                  size="inline"
                  disabled={isConnecting}
                  onPress={() => void openExternalUrl(entry.links.credentials)}
                >
                  {t(`plugins.catalog.${entry.id}.credentialLink`)}
                </Button>
              </View>
            </View>
            <Text className="text-sm text-muted-foreground">{t('plugins.credentialPrivacy')}</Text>
          </View>
        )}
      </PluginPage>
    </>
  );
}
