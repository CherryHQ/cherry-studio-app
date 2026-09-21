import { Button, OptionPickerBottomSheet, Section, useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { chatHref } from '@/frontend/appShell/navigation/chat';
import { getSystemEntryHandoff } from '@/frontend/appShell/systemEntry';
import { queryKeys } from '@/frontend/data';
import { useAgentsApi } from '@/frontend/hooks/agent';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

export function SystemShareScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ handoff?: string | string[] }>();
  const [session] = useState(() => getSystemEntryHandoff(getSingleRouteParam(params.handoff)));
  const action = session?.action.kind === 'share.receive' ? session.action : null;
  const { agents } = useAgentsApi();
  const [selectedId, setSelectedId] = useState<string>();
  const selected = agents.find((agent) => agent.id === selectedId) ?? agents[0];
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Route dismissal is an explicit discard. Bootstrap disposal releases the native claim instead.
      queueMicrotask(() => {
        if (!mounted.current) void session?.dismiss().catch(() => session.dispose());
      });
    };
  }, [session]);

  const submit = () => {
    if (!session || !selected || busy) return;
    setBusy(true);
    void session
      .submit(selected.id)
      .then(async ({ sessionId }) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.agentSessions.all() }),
          queryClient.invalidateQueries({ queryKey: queryKeys.files.entries() }),
        ]);
        if (mounted.current) router.replace(chatHref({ kind: 'session', sessionId }));
      })
      .catch(() => {
        if (mounted.current) toast.show({ label: t('systemEntry.sendFailed'), variant: 'danger' });
      })
      .finally(() => {
        if (mounted.current) setBusy(false);
      });
  };
  return (
    <View className="flex-1">
      <RouteHeader
        title={t('systemEntry.share.title')}
        onBack={() => {
          if (!busy) router.back();
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-5 px-4 py-5"
      >
        {!action ? (
          <Text className="text-muted-foreground">{t('systemEntry.share.expired')}</Text>
        ) : (
          <>
            <Text className="text-muted-foreground text-sm">{t('systemEntry.share.review')}</Text>
            {action.text ? (
              <Text selectable className="text-foreground text-base">
                {action.text}
              </Text>
            ) : null}
            {action.files.length ? (
              <Section title={t('systemEntry.share.attachments')}>
                {action.files.map((file) => (
                  <Section.Item
                    key={file.id}
                    label={file.name}
                    description={`${file.mediaType} · ${Math.ceil(file.size / 1024)} KB`}
                  />
                ))}
              </Section>
            ) : null}
            <Section>
              <Section.SelectItem
                label={t('systemEntry.agent')}
                value={selected?.name ?? t('systemEntry.noAgent')}
                onPress={() => setPickerOpen(true)}
                disabled={busy || agents.length === 0}
              />
              {!agents.length ? (
                <Section.Item
                  label={t('systemEntry.manageAgents')}
                  onPress={() => router.push('/agents')}
                />
              ) : null}
            </Section>
            <Button loading={busy} disabled={!selected} onPress={submit}>
              {t('systemEntry.share.send')}
            </Button>
          </>
        )}
      </ScrollView>
      <OptionPickerBottomSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('systemEntry.agent')}
        options={agents.map(({ id, name }) => ({ value: id, label: name }))}
        selectedValue={selected?.id ?? ''}
        onValueChange={setSelectedId}
        size="large"
      />
    </View>
  );
}
