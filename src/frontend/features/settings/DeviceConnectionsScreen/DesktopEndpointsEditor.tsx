import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import {
  configuredEndpointsSchema,
  directEndpointUrl,
  parseDirectEndpoint,
  type DirectEndpoint,
} from '@cherrystudio/remote-protocol';
import {
  BottomSheet,
  Button,
  Input,
  Section,
  TextField,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useMutation } from '@/frontend/data';
import { useDesktopConnectionActions } from '@/frontend/hooks/useDesktopConnections';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';

import { desktopConnectionErrorMessage } from '../desktopConnectionError';

type EndpointEdit = { index: number | null; open: boolean; value: string };

function endpointAddress(endpoint: DirectEndpoint) {
  const host = endpoint.host.includes(':') ? `[${endpoint.host}]` : endpoint.host;
  return `${endpoint.security}://${host}:${endpoint.port}`;
}

export function DesktopEndpointsEditor({ connection }: { connection: DesktopConnection }) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const { testingEndpoint, testEndpoint } = useDesktopConnectionActions();
  const [edit, setEdit] = useState<EndpointEdit | null>(null);
  const writing = useRef(false);
  let draft: DirectEndpoint | undefined;
  let error: string | undefined;
  if (edit?.value.trim()) {
    try {
      draft = parseDirectEndpoint(edit.value.trim());
    } catch {
      error = t('settings.deviceConnections.location.invalid');
    }
    const draftUrl = draft && directEndpointUrl(draft);
    if (
      draftUrl &&
      connection.configuredEndpoints.some(
        (endpoint, index) => index !== edit.index && directEndpointUrl(endpoint) === draftUrl,
      )
    ) {
      error = t('settings.deviceConnections.location.duplicate');
    }
  }
  const mutation = useMutation('PATCH', '/desktop-connections/:id', {
    refresh: ['/desktop-connections', `/desktop-connections/${connection.id}`],
  });
  const isBusy = mutation.isLoading || Boolean(testingEndpoint);
  const closeEdit = () => {
    if (!isBusy) setEdit((current) => current && { ...current, open: false });
  };
  const persist = async (endpoints: DirectEndpoint[]) => {
    if (isBusy || writing.current) return;
    writing.current = true;
    try {
      const configuredEndpoints = configuredEndpointsSchema.parse(endpoints);
      await mutation.trigger({ params: { id: connection.id }, body: { configuredEndpoints } });
      setEdit((current) => current && { ...current, open: false });
      toast.show({ label: t('settings.deviceConnections.location.saved'), variant: 'success' });
    } catch (error) {
      toast.show({ label: desktopConnectionErrorMessage(error, t), variant: 'danger' });
    } finally {
      writing.current = false;
    }
  };
  const save = () => {
    if (!edit?.open || !draft || error) return;
    const endpoints = [...connection.configuredEndpoints];
    if (edit.index === null) endpoints.push(draft);
    else endpoints[edit.index] = draft;
    void persist(endpoints);
  };
  const remove = () => {
    if (!edit?.open || edit.index === null) return;
    void persist(connection.configuredEndpoints.filter((_, index) => index !== edit.index));
  };
  const test = async (endpoint: DirectEndpoint) => {
    try {
      const verified = await testEndpoint(connection.id, endpoint);
      if (verified)
        alert.show({
          title: t('settings.deviceConnections.location.testSucceeded'),
          description: endpointAddress(endpoint),
        });
    } catch (error) {
      alert.show({
        title: desktopConnectionErrorMessage(error, t),
        description: endpointAddress(endpoint),
      });
    }
  };
  return (
    <>
      <Section
        title={t('settings.deviceConnections.location.title')}
        footer={t('settings.deviceConnections.location.help')}
      >
        {connection.configuredEndpoints.length === 0 ? (
          <Section.Item label={t('settings.deviceConnections.location.automatic')} />
        ) : null}
        {connection.configuredEndpoints.map((endpoint, index) => {
          const address = endpointAddress(endpoint);
          return (
            <Section.Item
              accessibilityLabel={address}
              disabled={isBusy}
              key={directEndpointUrl(endpoint)}
              label={
                <Text className="text-base text-foreground" numberOfLines={2}>
                  {address}
                </Text>
              }
              onPress={() => setEdit({ index, open: true, value: address })}
              testID={`desktop-endpoint-${index}`}
            />
          );
        })}
        <Section.Item
          accessibilityLabel={t('settings.deviceConnections.location.add')}
          disabled={isBusy || connection.configuredEndpoints.length >= 8}
          label={
            <View className="flex-row items-center gap-2">
              <PlusIcon className="size-5 text-foreground" />
              <Text className="text-base text-foreground">
                {t('settings.deviceConnections.location.add')}
              </Text>
            </View>
          }
          onPress={() => setEdit({ index: null, open: true, value: '' })}
          showChevron={false}
          testID="desktop-endpoint-add"
        />
      </Section>
      {edit ? (
        <BottomSheet
          avoidKeyboard
          closeAction={{ accessibilityLabel: t('common.cancel') }}
          dismissible={!isBusy}
          footer={
            <View className="flex-row items-center gap-3">
              <View className="min-w-0 flex-1">
                <Button
                  accessibilityLabel={t('settings.deviceConnections.location.testAddress', {
                    address: edit.value.trim(),
                  })}
                  disabled={isBusy || !draft || Boolean(error)}
                  loading={Boolean(testingEndpoint)}
                  onPress={() => draft && void test(draft)}
                  testID="desktop-endpoint-test"
                  variant="secondary"
                >
                  {t('settings.deviceConnections.location.test')}
                </Button>
              </View>
              <View className="min-w-0 flex-1">
                <Button
                  disabled={isBusy || !draft || Boolean(error)}
                  loading={mutation.isLoading}
                  onPress={save}
                  testID="desktop-endpoint-save"
                >
                  {t('common.save')}
                </Button>
              </View>
            </View>
          }
          onClose={closeEdit}
          open={edit.open}
          size="medium"
          testID="desktop-endpoint-editor"
          title={t(
            edit.index === null
              ? 'settings.deviceConnections.location.add'
              : 'settings.deviceConnections.location.editTitle',
          )}
        >
          <View className="gap-4">
            <View className="px-4 pt-1">
              <TextField disabled={isBusy} invalid={Boolean(error)} required>
                <TextField.Label>
                  {t('settings.deviceConnections.location.address')}
                </TextField.Label>
                <Input
                  accessibilityLabel={t('settings.deviceConnections.location.address')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  disabled={isBusy}
                  invalid={Boolean(error)}
                  keyboardType="url"
                  onChangeText={(value) => setEdit((current) => current && { ...current, value })}
                  onSubmitEditing={save}
                  placeholder={t('settings.deviceConnections.location.placeholder')}
                  returnKeyType="done"
                  testID="desktop-endpoint-input"
                  value={edit.value}
                />
                <TextField.Error>{error}</TextField.Error>
              </TextField>
            </View>
            {edit.index !== null ? (
              <Section variant="plain">
                <Section.Item
                  destructive
                  disabled={isBusy}
                  label={t('settings.deviceConnections.location.remove')}
                  onPress={remove}
                  showChevron={false}
                  testID="desktop-endpoint-remove"
                />
              </Section>
            ) : null}
          </View>
        </BottomSheet>
      ) : null}
    </>
  );
}
