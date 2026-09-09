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
import {
  ConnectPluginSchema,
  PluginIdSchema,
  PluginError,
  type PluginId,
} from '@/shared/contracts/plugins';

import { PluginIcon } from '../../components/PluginIcon';
import { PLUGIN_LINKS } from '../../pluginCatalog';
import { useRefreshPluginConnections } from '../../usePluginConnections';

export function PluginConnectScreen() {
  const { pluginId } = useLocalSearchParams<{ pluginId: string }>();
  const parsed = PluginIdSchema.safeParse(pluginId);
  const { t } = useTranslation();
  if (!parsed.success) return <ContentState.Empty title={t('plugins.notFound')} />;
  return <PluginConnect key={parsed.data} pluginId={parsed.data} />;
}

function PluginConnect({ pluginId }: { pluginId: PluginId }) {
  const { t } = useTranslation();
  const router = useRouter();
  const plugins = useBackendModule('plugins');
  const refresh = useRefreshPluginConnections();
  const { toast } = useToast();
  const pendingConnection = useRef<AbortController | null>(null);
  useEffect(() => () => pendingConnection.current?.abort(), []);
  const [credential, setCredential] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const name = t(`plugins.catalog.${pluginId}.name`);

  async function connect() {
    if (pendingConnection.current) return;
    const parsed = ConnectPluginSchema.safeParse({ pluginId, credential });
    if (!parsed.success) {
      setInvalid(true);
      return;
    }
    const controller = new AbortController();
    pendingConnection.current = controller;
    Keyboard.dismiss();
    setIsConnecting(true);
    try {
      // Keep credentials out of query/mutation caches and route parameters.
      await plugins.connect(parsed.data, controller.signal);
      setCredential('');
      await refresh();
      toast.show({ label: t('plugins.connectSuccess', { name }), variant: 'success' });
      router.back();
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.show({
        label:
          error instanceof PluginError
            ? t(`plugins.errors.${error.reason}`)
            : t(`plugins.catalog.${pluginId}.connectFailed`),
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
        contentContainerClassName="gap-7 px-6 py-6"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        bottomOffset={keyboardBottomOffset}
        testID="plugin-connect"
      >
        <View className="gap-4">
          <PluginIcon pluginId={pluginId} size="large" />
          <Text className="text-2xl font-semibold text-foreground">
            {t('plugins.connectTitle', { name })}
          </Text>
          <Text className="text-base text-muted-foreground">
            {t(`plugins.catalog.${pluginId}.setup`)}
          </Text>
        </View>
        <View className="gap-4">
          <TextField invalid={invalid} disabled={isConnecting}>
            <TextField.Label>{t(`plugins.catalog.${pluginId}.credentialLabel`)}</TextField.Label>
            <Input
              accessibilityLabel={t(`plugins.catalog.${pluginId}.credentialLabel`)}
              type="password"
              visibilityAccessibilityLabels={{
                hide: t('plugins.hideCredential'),
                show: t('plugins.showCredential'),
              }}
              value={credential}
              onChangeText={(value) => {
                setCredential(value);
                setInvalid(false);
              }}
              disabled={isConnecting}
              invalid={invalid}
              maxLength={4096}
              onSubmitEditing={() => void connect()}
              returnKeyType="done"
              testID="plugin-credential"
            />
            <TextField.Error>{t('plugins.invalidCredential')}</TextField.Error>
          </TextField>
          <Button
            variant="link"
            size="inline"
            onPress={() => void openExternalUrl(PLUGIN_LINKS[pluginId].credentials)}
          >
            {t(`plugins.catalog.${pluginId}.getCredential`)}
          </Button>
        </View>
        <Text className="text-sm text-muted-foreground">{t('plugins.credentialPrivacy')}</Text>
        <Button
          size="lg"
          shape="pill"
          loading={isConnecting}
          disabled={!credential.trim()}
          onPress={() => void connect()}
          testID="plugin-connect-submit"
        >
          {t('plugins.authorize')}
        </Button>
      </KeyboardAwareScrollView>
    </>
  );
}
