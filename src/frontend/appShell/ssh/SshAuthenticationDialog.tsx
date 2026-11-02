import { Button, Dialog, Input, TextField } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useSshAuthentication } from '@/frontend/hooks/ssh';
import type { SshAuthenticationRequest } from '@/shared/data/types/ssh';

/** Backend-owned authentication queue, presented outside model and transcript state. */
export function SshAuthenticationDialog() {
  const requests = useSshAuthentication();
  const pending = requests[0];
  return pending ? <AuthenticationForm key={pending.id} request={pending} /> : null;
}

function AuthenticationForm({ request }: { request: SshAuthenticationRequest }) {
  const { t } = useTranslation();
  const ssh = useBackendModule('ssh');
  const [responses, setResponses] = useState(() => request.prompts.map(() => ''));
  const [invalid, setInvalid] = useState(false);
  function respond(value: string[] | null) {
    if (
      value &&
      value.some((item) => new TextEncoder().encode(item).length > 4096 || item.includes('\0'))
    ) {
      setInvalid(true);
      return;
    }
    ssh.respondAuthentication(request.id, value);
    setResponses(request.prompts.map(() => ''));
  }
  return (
    <Dialog
      open
      title={t('ssh.auth.title')}
      onOpenChange={(open) => {
        if (!open) respond(null);
      }}
    >
      <ScrollView
        className="max-h-96"
        contentContainerClassName="gap-4"
        keyboardShouldPersistTaps="handled"
      >
        <Text selectable className="font-mono text-sm text-foreground">
          {request.destination}
        </Text>
        <Text className="text-sm text-muted-foreground">{t('ssh.auth.notice')}</Text>
        {request.name ? <Text className="text-base text-foreground">{request.name}</Text> : null}
        {request.instruction ? (
          <Text className="text-sm text-foreground">{request.instruction}</Text>
        ) : null}
        {request.prompts.map((prompt, index) => (
          // A challenge has immutable protocol slots; repeated prompt text is valid.
          // eslint-disable-next-line react/no-array-index-key
          <TextField key={index} invalid={invalid}>
            <TextField.Label>{prompt.text || t('ssh.auth.response')}</TextField.Label>
            <Input
              accessibilityLabel={prompt.text || t('ssh.auth.response')}
              {...(prompt.echo
                ? { type: 'text' as const, autoCapitalize: 'none' as const, autoCorrect: false }
                : {
                    type: 'password' as const,
                    visibilityAccessibilityLabels: {
                      hide: t('ssh.hidePassword'),
                      show: t('ssh.showPassword'),
                    },
                  })}
              autoComplete="off"
              textContentType="none"
              maxLength={4096}
              value={responses[index]}
              onChangeText={(value) => {
                setResponses((current) =>
                  current.map((item, position) => (position === index ? value : item)),
                );
                setInvalid(false);
              }}
            />
          </TextField>
        ))}
        {invalid ? (
          <Text className="text-sm text-destructive">{t('ssh.error.invalidInput')}</Text>
        ) : null}
      </ScrollView>
      <View className="gap-2 pt-4">
        <Button onPress={() => respond(responses)}>{t('common.ok')}</Button>
        <Button variant="secondary" onPress={() => respond(null)}>
          {t('common.cancel')}
        </Button>
      </View>
    </Dialog>
  );
}
