import { Button, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { RouteHeader } from '@/frontend/appShell/header';
import { useBackendModule } from '@/frontend/data';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import { PluginError } from '@/shared/contracts/plugins';
import type { PluginCatalogEntry, PluginCredentialMethod } from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import { useRefreshPluginConnections } from '../../usePluginConnections';
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
