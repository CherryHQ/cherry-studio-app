import { directEndpointUrl, parseDirectEndpoint } from '@cherrystudio/remote-protocol';
import { Button, Input, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useMutation } from '@/frontend/data';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

export function DesktopEndpointsEditor({ connection }: { connection: DesktopConnection }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(() =>
    connection.configuredEndpoints.map(directEndpointUrl).join('\n'),
  );
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
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
        <Input
          accessibilityLabel={t('settings.deviceConnections.location.title')}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          editable={!mutation.isLoading}
          value={value}
          onChangeText={(text) => {
            setValue(text);
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
        <Button loading={mutation.isLoading} onPress={() => void save()}>
          {t('common.save')}
        </Button>
      </View>
    </Section>
  );
}
