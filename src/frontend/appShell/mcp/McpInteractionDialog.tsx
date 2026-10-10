import { Button, Dialog, Input, TextField, MessagePart } from '@cherrystudio/ui/components';
import * as WebBrowser from 'expo-web-browser';
import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import {
  validateMcpElicitationResponse,
  type McpElicitationResponse,
  type McpPendingElicitation,
} from '@/shared/contracts/mcpInteraction';

/** One app-wide presenter; the backend owns the queue and call cancellation. */
export function McpInteractionDialog() {
  const mcp = useBackendModule('mcp');
  const requests = useSyncExternalStore(
    mcp.subscribeElicitations,
    mcp.getElicitations,
    mcp.getElicitations,
  );
  const pending = requests[0];
  return pending ? (
    <McpInteraction
      key={pending.id}
      pending={pending}
      respond={(response) => {
        // A native browser or dialog callback can arrive after its initiating call was cancelled.
        if (mcp.getElicitations().some((request) => request.id === pending.id))
          mcp.respondElicitation(pending.id, response);
      }}
    />
  ) : null;
}

function McpInteraction({
  pending,
  respond,
}: {
  pending: McpPendingElicitation;
  respond: (response: McpElicitationResponse) => void;
}) {
  const { t } = useTranslation();
  const request = pending.request;
  const [values, setValues] = useState<Record<string, string>>(() =>
    request.mode === 'form'
      ? Object.fromEntries(
          Object.entries(request.requestedSchema.properties).map(([name, field]) => [
            name,
            field.default === undefined
              ? ''
              : typeof field.default === 'string'
                ? field.default
                : JSON.stringify(field.default),
          ]),
        )
      : {},
  );
  const [invalid, setInvalid] = useState(false);
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState(false);
  function submit() {
    try {
      const content =
        request.mode === 'form'
          ? Object.fromEntries(
              Object.entries(request.requestedSchema.properties).flatMap(([name, field]) => {
                const value = values[name] ?? '';
                if (!value && !request.requestedSchema.required?.includes(name)) return [];
                return [[name, field.type === 'string' ? value : JSON.parse(value)]];
              }),
            )
          : undefined;
      const response: McpElicitationResponse = {
        action: 'accept',
        ...(content ? { content } : {}),
      };
      validateMcpElicitationResponse(request, response);
      respond(response);
    } catch {
      setInvalid(true);
    }
  }
  async function openUrl() {
    if (request.mode !== 'url' || opening) return;
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(request.url);
      setOpened(true);
    } catch {
      respond({ action: 'cancel' });
    } finally {
      setOpening(false);
    }
  }
  return (
    <Dialog
      open={!opening}
      onOpenChange={(open) => {
        if (!open) respond({ action: 'cancel' });
      }}
      title={t('mcp.interaction.title', { name: pending.serverName })}
    >
      <ScrollView
        className="max-h-96"
        contentContainerClassName="gap-4"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-sm text-muted-foreground" selectable>
          {new URL(pending.endpointUrl).host}
        </Text>
        {pending.toolApproval ? (
          <>
            <Text className="text-base text-foreground">
              {t('mcp.apps.toolApproval', { name: pending.toolApproval.name })}
            </Text>
            <MessagePart.ValueSection
              title={t('chat.mcpTool.arguments')}
              value={pending.toolApproval.arguments}
            />
          </>
        ) : (
          <Text className="text-base text-foreground" selectable>
            {request.message}
          </Text>
        )}
        {request.mode === 'url' ? (
          <View className="gap-3">
            <Text className="text-base text-foreground" selectable>
              {new URL(request.url).host}
            </Text>
            <Text className="text-sm text-muted-foreground" selectable>
              {request.url}
            </Text>
            <Button onPress={() => void openUrl()}>{t('mcp.interaction.open')}</Button>
          </View>
        ) : (
          <>
            {!pending.toolApproval && (
              <Text className="text-sm text-muted-foreground">
                {t('mcp.interaction.noSecrets')}
              </Text>
            )}
            {Object.entries(request.requestedSchema.properties).map(([name, field]) => {
              const title = typeof field.title === 'string' ? field.title : name;
              const rawChoices = Array.isArray(field.enum)
                ? field.enum
                : Array.isArray(field.oneOf)
                  ? field.oneOf
                  : field.type === 'array'
                    ? ((field.items as { enum?: unknown[]; anyOf?: unknown[] } | undefined)?.enum ??
                      (field.items as { anyOf?: unknown[] } | undefined)?.anyOf)
                    : undefined;
              const choices =
                field.type === 'boolean'
                  ? [
                      { value: 'true', label: t('mcp.interaction.yes') },
                      { value: 'false', label: t('mcp.interaction.no') },
                    ]
                  : rawChoices?.flatMap((item) => {
                      if (typeof item === 'string') return [{ value: item, label: item }];
                      if (
                        item &&
                        typeof item === 'object' &&
                        'const' in item &&
                        typeof item.const === 'string'
                      )
                        return [
                          {
                            value: item.const,
                            label:
                              'title' in item && typeof item.title === 'string'
                                ? item.title
                                : item.const,
                          },
                        ];
                      return [];
                    });
              const selected =
                field.type === 'array'
                  ? (() => {
                      try {
                        return JSON.parse(values[name] || '[]') as string[];
                      } catch {
                        return [];
                      }
                    })()
                  : [values[name]];

              return (
                <TextField key={name}>
                  <TextField.Label>
                    {title}
                    {request.requestedSchema.required?.includes(name) ? ' *' : ''}
                  </TextField.Label>
                  {typeof field.description === 'string' && (
                    <Text className="text-sm text-muted-foreground">{field.description}</Text>
                  )}
                  {choices ? (
                    <View className="gap-2">
                      {choices.map((choice) => (
                        <Button
                          key={choice.value}
                          variant={selected.includes(choice.value) ? 'default' : 'secondary'}
                          onPress={() => {
                            const value =
                              field.type === 'array'
                                ? JSON.stringify(
                                    selected.includes(choice.value)
                                      ? selected.filter((item) => item !== choice.value)
                                      : [...selected, choice.value],
                                  )
                                : choice.value;
                            setValues((current) => ({ ...current, [name]: value }));
                            setInvalid(false);
                          }}
                        >
                          {choice.label}
                        </Button>
                      ))}
                    </View>
                  ) : (
                    <Input
                      accessibilityLabel={title}
                      autoCapitalize="none"
                      autoCorrect={false}
                      value={values[name] ?? ''}
                      keyboardType={
                        field.type === 'number' || field.type === 'integer'
                          ? 'numbers-and-punctuation'
                          : 'default'
                      }
                      onChangeText={(value) => {
                        setValues((current) => ({ ...current, [name]: value }));
                        setInvalid(false);
                      }}
                    />
                  )}
                </TextField>
              );
            })}
          </>
        )}
        {invalid && <Text className="text-sm text-danger">{t('mcp.interaction.invalid')}</Text>}
      </ScrollView>
      <View className="gap-2 pt-4">
        <Button disabled={request.mode === 'url' && !opened} onPress={submit}>
          {t(
            pending.toolApproval
              ? 'mcp.apps.allow'
              : request.mode === 'url'
                ? 'mcp.interaction.continue'
                : 'mcp.interaction.submit',
          )}
        </Button>
        <Button variant="secondary" onPress={() => respond({ action: 'decline' })}>
          {t('mcp.interaction.decline')}
        </Button>
        <Button variant="ghost" onPress={() => respond({ action: 'cancel' })}>
          {t('common.cancel')}
        </Button>
      </View>
    </Dialog>
  );
}
