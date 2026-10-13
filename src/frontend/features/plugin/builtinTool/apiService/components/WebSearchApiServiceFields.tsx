import ActivityIcon from '@cherrystudio/app-icons/icons/activity';
import { Button, Section, TextField } from '@cherrystudio/ui/components';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { useWebSearchApiManagementContext } from '../../context/WebSearchApiManagementContext';
import {
  parseWebSearchApiHostInput,
  type WebSearchProviderDetailSection,
} from '../../utils/providerSettings';
import {
  buildWebSearchApiKeysInput,
  parseWebSearchApiKeysInput,
} from '../utils/webSearchApiServiceApiKeys';
import { WebSearchApiServiceCommitInput } from './WebSearchApiServiceCommitInput';

function ZhipuApiKeyShortcutSection() {
  const {
    actions: { openZhipuApiKeySettings },
    meta: { t },
  } = useWebSearchApiManagementContext();

  return (
    <Section.Item
      accessibilityLabel={t('settings.websearch.provider.configureZhipuApiKey')}
      label={t('settings.websearch.provider.configureZhipuApiKey')}
      onPress={openZhipuApiKeySettings}
    />
  );
}

function CheckButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const {
    meta: { t },
    state: { isChecking },
  } = useWebSearchApiManagementContext();

  return (
    <Button
      accessibilityLabel={t('settings.websearch.provider.check')}
      disabled={disabled}
      hitSlop={2}
      icon={<ActivityIcon />}
      loading={isChecking}
      onPress={onPress}
      variant="secondary"
    />
  );
}

/** One labelled input, with the check button beside it when this field owns the check. */
function FieldRow({
  check,
  children,
  error,
  label,
}: {
  check?: ReactNode;
  children: ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <TextField invalid={Boolean(error)}>
      <TextField.Label>{label}</TextField.Label>
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1 overflow-hidden">{children}</View>
        {check}
      </View>
      <TextField.Error>{error}</TextField.Error>
    </TextField>
  );
}

function ApiKeysSection() {
  const {
    actions: { check, onProviderOverrideChange },
    meta: { t },
    state: { checkPlacement, provider, providerCapability, providerOverride },
  } = useWebSearchApiManagementContext();
  const savedInput = buildWebSearchApiKeysInput(providerOverride?.apiKeys ?? []);
  const [draft, setDraft] = useState(savedInput);

  const commit = (input: string) => {
    onProviderOverrideChange(provider.id, { apiKeys: parseWebSearchApiKeysInput(input) });
  };

  return (
    <Section.Item>
      <FieldRow
        check={
          checkPlacement === 'apiKeys' ? (
            <CheckButton
              disabled={providerCapability.requiresApiKey && !draft.trim()}
              onPress={() => {
                commit(draft);
                check({ apiKeys: parseWebSearchApiKeysInput(draft).slice(0, 1) });
              }}
            />
          ) : null
        }
        label={t('settings.websearch.provider.apiKeys')}
      >
        <WebSearchApiServiceCommitInput
          accessibilityLabel={t('settings.websearch.provider.apiKeys')}
          onCommit={commit}
          onDraftChange={setDraft}
          placeholder={t('settings.websearch.provider.apiKeysPlaceholder')}
          secret={{
            hide: t('settings.websearch.provider.hideApiKeys'),
            show: t('settings.websearch.provider.showApiKeys'),
          }}
          value={savedInput}
        />
      </FieldRow>
    </Section.Item>
  );
}

/**
 * The field holds only the user's own address. Left empty, the provider's built-in address
 * applies and shows as the placeholder.
 */
function ApiHostSection() {
  const {
    actions: { check, onProviderOverrideChange },
    meta: { t },
    state: { capability, checkPlacement, provider, providerCapability, providerOverride },
  } = useWebSearchApiManagementContext();
  const savedHost = providerOverride?.capabilities?.[capability]?.apiHost ?? '';
  const [draft, setDraft] = useState(savedHost);
  const [invalid, setInvalid] = useState(false);

  /** Saves a valid address and returns its override patch; an invalid one only flags the field. */
  const commit = (input: string) => {
    const parsed = parseWebSearchApiHostInput(input);
    setInvalid(!parsed.valid);
    if (!parsed.valid) return null;

    const patch = { capabilities: { [capability]: { apiHost: parsed.apiHost } } };
    if ((parsed.apiHost ?? '') !== savedHost) onProviderOverrideChange(provider.id, patch);
    return patch;
  };

  return (
    <Section.Item>
      <FieldRow
        check={
          checkPlacement === 'apiHost' ? (
            <CheckButton
              disabled={!providerCapability.apiHost && !draft.trim()}
              onPress={() => {
                const patch = commit(draft);
                if (patch) check(patch);
              }}
            />
          ) : null
        }
        error={invalid ? t('settings.websearch.provider.apiHostInvalid') : undefined}
        label={t('settings.websearch.provider.apiHost')}
      >
        <WebSearchApiServiceCommitInput
          accessibilityLabel={t('settings.websearch.provider.apiHost')}
          keyboardType="url"
          onCommit={commit}
          onDraftChange={(input) => {
            setDraft(input);
            setInvalid(false);
          }}
          placeholder={
            providerCapability.apiHost || t('settings.websearch.provider.apiHostPlaceholder')
          }
          value={savedHost}
        />
      </FieldRow>
    </Section.Item>
  );
}

function BasicAuthSection() {
  const {
    actions: { onProviderOverrideChange },
    meta: { t },
    state: { provider, providerOverride },
  } = useWebSearchApiManagementContext();
  const savedUsername = providerOverride?.basicAuthUsername ?? '';
  const [username, setUsername] = useState(savedUsername);

  return (
    <Section.Item>
      <View className="gap-4">
        <FieldRow label={t('settings.websearch.provider.basicAuthUsername')}>
          <WebSearchApiServiceCommitInput
            accessibilityLabel={t('settings.websearch.provider.basicAuthUsername')}
            onCommit={(input) => {
              const basicAuthUsername = input.trim();
              onProviderOverrideChange(provider.id, {
                basicAuthUsername,
                // A password without a username is never sent, so it is not kept either.
                ...(basicAuthUsername ? {} : { basicAuthPassword: '' }),
              });
            }}
            onDraftChange={setUsername}
            placeholder={t('settings.websearch.provider.basicAuthUsernamePlaceholder')}
            value={savedUsername}
          />
        </FieldRow>
        {username.trim() ? (
          <FieldRow label={t('settings.websearch.provider.basicAuthPassword')}>
            <WebSearchApiServiceCommitInput
              accessibilityLabel={t('settings.websearch.provider.basicAuthPassword')}
              onCommit={(input) =>
                onProviderOverrideChange(provider.id, { basicAuthPassword: input.trim() })
              }
              placeholder={t('settings.websearch.provider.basicAuthPasswordPlaceholder')}
              secret={{
                hide: t('settings.websearch.provider.hidePassword'),
                show: t('settings.websearch.provider.showPassword'),
              }}
              value={providerOverride?.basicAuthPassword ?? ''}
            />
          </FieldRow>
        ) : null}
      </View>
    </Section.Item>
  );
}

export function WebSearchApiServiceFieldGroup({
  section,
}: {
  section: WebSearchProviderDetailSection;
}) {
  switch (section.type) {
    case 'apiHost':
      return <ApiHostSection />;
    case 'apiKeys':
      return <ApiKeysSection />;
    case 'basicAuth':
      return <BasicAuthSection />;
    case 'zhipuApiKeyShortcut':
      return <ZhipuApiKeyShortcutSection />;
  }
}
