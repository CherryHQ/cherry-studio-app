import { Button, ContentState, useToast } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader } from '@/frontend/appShell/header';
import { useBackendModule } from '@/frontend/data';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import { PluginError } from '@/shared/contracts/plugins';
import {
  PluginIdSchema,
  type PluginCatalogEntry,
  type PluginCredentialMethod,
} from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import { usePluginCatalog } from '../../usePluginCatalog';
import { useRefreshPluginConnections } from '../../usePluginConnections';
import { CredentialFields, hasEveryField } from './CredentialFields';
import { InteractiveConnect } from './InteractiveConnect';

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
  const { t } = useTranslation();
  const [methodId, setMethodId] = useState(entry.authMethods[0]?.id);
  const method = entry.authMethods.find((candidate) => candidate.id === methodId);
  if (!method) return <ContentState.Empty title={t('plugins.unavailable')} />;
  const alternatives = (
    <View className="gap-2">
      {entry.authMethods
        .filter((candidate) => candidate.id !== method.id)
        .map((candidate) => (
          <Button key={candidate.id} variant="link" onPress={() => setMethodId(candidate.id)}>
            {t(`plugins.catalog.${entry.id}.authMethods.${candidate.id}.label`)}
          </Button>
        ))}
    </View>
  );
  return method.kind === 'interactive' ? (
    <InteractiveConnect key={method.id} entry={entry} method={method}>
      {alternatives}
    </InteractiveConnect>
  ) : (
    <CredentialConnect key={method.id} entry={entry} method={method}>
      {alternatives}
    </CredentialConnect>
  );
}

function CredentialConnect({
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
  const { toast } = useToast();
  const pendingConnection = useRef<AbortController | null>(null);
  useEffect(() => () => pendingConnection.current?.abort(), []);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(() => new Set());
  const name = t(`plugins.catalog.${entry.id}.name`);

  async function connect() {
    if (pendingConnection.current) return;
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
        bottomOffset={keyboardBottomOffset}
        keyboardShouldPersistTaps="handled"
        testID="plugin-connect"
      >
        <Text className="text-base text-muted-foreground">
          {t(`plugins.catalog.${entry.id}.authMethods.${method.id}.setup`)}
        </Text>
        <View className="gap-4">
          <CredentialFields
            pluginId={entry.id}
            fields={method.fields}
            values={fields}
            invalidFields={invalidFields}
            disabled={isConnecting}
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
          <Button
            variant="link"
            size="inline"
            onPress={() => void openExternalUrl(entry.links.credentials)}
          >
            {t(`plugins.catalog.${entry.id}.credentialLink`)}
          </Button>
        </View>
        <Text className="text-sm text-muted-foreground">{t('plugins.credentialPrivacy')}</Text>
        <Button
          size="lg"
          loading={isConnecting}
          disabled={!hasEveryField(method.fields, fields)}
          onPress={() => void connect()}
          testID="plugin-connect-submit"
        >
          {t('plugins.authorize')}
        </Button>
        {children}
      </KeyboardAwareScrollView>
    </>
  );
}
