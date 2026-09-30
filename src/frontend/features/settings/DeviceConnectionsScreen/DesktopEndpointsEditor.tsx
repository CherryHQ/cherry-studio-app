import {
  directEndpointUrl,
  parseDirectEndpoint,
  type DirectEndpoint,
} from '@cherrystudio/remote-protocol';
import { Button, Input, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useMutation } from '@/frontend/data';
import { useDesktopConnectionActions } from '@/frontend/hooks/useDesktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

import { desktopConnectionErrorMessage } from '../desktopConnectionError';

export function DesktopEndpointsEditor({ connection }: { connection: DesktopConnection }) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<string>();
  const value = draft ?? connection.configuredEndpoints.map(directEndpointUrl).join('\n');
  const dirty = draft !== undefined;
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [candidates, setCandidates] = useState<DirectEndpoint[]>();
  const [checkError, setCheckError] = useState<string>();
  const [verified, setVerified] = useState<{ endpoint: DirectEndpoint; verifiedAt: number }>();
  const { getEndpoints, saveEndpoint, isCheckingEndpoints, isSavingEndpoint } =
    useDesktopConnectionActions();
  const busy = isCheckingEndpoints || isSavingEndpoint;
  const check = async () => {
    setCheckError(undefined);
    try {
      const endpoints = await getEndpoints(connection.id);
      if (endpoints) setCandidates(endpoints);
    } catch (error) {
      setCheckError(desktopConnectionErrorMessage(error, t));
    }
  };
  const verify = async (endpoint: DirectEndpoint) => {
    setCheckError(undefined);
    setVerified(undefined);
    try {
      const result = await saveEndpoint(connection.id, endpoint);
      if (result) setVerified(result);
    } catch (error) {
      setCheckError(desktopConnectionErrorMessage(error, t));
    }
  };
  const mutation = useMutation('PATCH', '/desktop-connections/:id', {
    refresh: ['/desktop-connections', `/desktop-connections/${connection.id}`],
  });
  const save = async () => {
    setError(false);
    setSaved(false);
    try {
      const lines = value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length > 8) throw new Error('Too many endpoints');
      const configuredEndpoints = lines.map(parseDirectEndpoint);
      await mutation.trigger({ params: { id: connection.id }, body: { configuredEndpoints } });
      setDraft(undefined);
      setSaved(true);
    } catch {
      setError(true);
    }
  };
  return (
    <Section
      title={t('settings.deviceConnections.location.title')}
      footer={t('settings.deviceConnections.location.help')}
    >
      <View className="gap-3 p-4">
        <Text className="text-muted-foreground">
          {t('settings.deviceConnections.location.suggestionsHint')}
        </Text>
        <Button
          variant="outline"
          disabled={busy || mutation.isLoading}
          loading={isCheckingEndpoints}
          onPress={() => void check()}
        >
          {t('settings.deviceConnections.location.getAddresses')}
        </Button>
        {candidates?.length === 0 ? (
          <Text>{t('settings.deviceConnections.location.noAddresses')}</Text>
        ) : null}
        {candidates?.map((endpoint) => (
          <View key={directEndpointUrl(endpoint)} className="gap-2">
            <Text selectable className="font-mono text-sm">
              {directEndpointUrl(endpoint)}
            </Text>
            <Button
              variant="outline"
              disabled={busy || mutation.isLoading || dirty}
              onPress={() => void verify(endpoint)}
            >
              {t('settings.deviceConnections.location.saveAndVerify')}
            </Button>
          </View>
        ))}
        {checkError ? (
          <Text accessibilityRole="alert" className="text-destructive">
            {checkError}
          </Text>
        ) : null}
        {verified ? (
          <Text accessibilityLiveRegion="polite" className="text-muted-foreground">
            {t('settings.deviceConnections.location.verified', {
              address: directEndpointUrl(verified.endpoint),
              time: new Date(verified.verifiedAt).toLocaleTimeString(
                i18n.resolvedLanguage ?? i18n.language,
              ),
            })}
          </Text>
        ) : null}
        <Input
          accessibilityLabel={t('settings.deviceConnections.location.title')}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          editable={!mutation.isLoading && !busy}
          value={value}
          onChangeText={(text) => {
            setDraft(text);
            setVerified(undefined);
            setSaved(false);
          }}
          placeholder={t('settings.deviceConnections.location.placeholder')}
        />
        {error ? (
          <Text accessibilityRole="alert" className="text-destructive">
            {t('settings.deviceConnections.location.invalid')}
          </Text>
        ) : null}
        {saved ? (
          <Text className="text-muted-foreground">
            {t('settings.deviceConnections.location.saved')}
          </Text>
        ) : null}
        <Button disabled={busy} loading={mutation.isLoading} onPress={() => void save()}>
          {t('common.save')}
        </Button>
      </View>
    </Section>
  );
}
