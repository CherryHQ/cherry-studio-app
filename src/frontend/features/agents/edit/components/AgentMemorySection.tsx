import {
  BottomSheet,
  Button,
  ContentState,
  Section,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, Text, TextInput, View } from 'react-native';

import { useBackendModule } from '@/frontend/data/BackendProvider';
import {
  AGENT_MEMORY_DOCUMENT_BYTES,
  AgentMemoryError,
  type AgentMemoryFile,
  type AgentMemoryKey,
} from '@/shared/contracts/agentMemory';

const LABELS = {
  soul: 'agent.memory.soul',
  user: 'agent.memory.user',
  fact: 'agent.memory.fact',
  journal: 'agent.memory.journal',
} as const;

export function AgentMemorySection({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<AgentMemoryKey | null>(null);
  return (
    <>
      <Section title={t('agent.memory.title')} footer={t('agent.memory.hint')}>
        {(Object.keys(LABELS) as AgentMemoryKey[]).map((key) => (
          <Section.Item
            key={key}
            label={t(LABELS[key])}
            onPress={() => {
              Keyboard.dismiss();
              setSelected(key);
            }}
          />
        ))}
      </Section>
      {selected ? (
        <MemorySheet
          key={selected}
          agentId={agentId}
          fileKey={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

function MemorySheet({
  agentId,
  fileKey,
  onClose,
}: {
  agentId: string;
  fileKey: AgentMemoryKey;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const memory = useBackendModule('agentMemory');
  const queryClient = useQueryClient();
  const queryKey = ['agent-memory', agentId, fileKey];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => memory.read(agentId, fileKey, signal),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  if (!query.data || query.isFetching || query.isError)
    return (
      <BottomSheet onClose={onClose} open size="large" title={t(LABELS[fileKey])}>
        <View className="p-4">
          {query.isPending || query.isFetching ? (
            <ContentState.Loading title={t('agent.memory.loading')} />
          ) : (
            <ContentState.Error
              title={t('agent.memory.loadFailed')}
              primaryAction={{
                children: t('common.retry'),
                onPress: () => {
                  void query.refetch();
                },
              }}
            />
          )}
        </View>
      </BottomSheet>
    );
  return (
    <MemoryEditor
      key={query.data.version}
      agentId={agentId}
      file={query.data}
      onClose={onClose}
      onSaved={(file) => queryClient.setQueryData(queryKey, file)}
      onReload={() => {
        void query.refetch();
      }}
    />
  );
}

function MemoryEditor({
  agentId,
  file,
  onClose,
  onSaved,
  onReload,
}: {
  agentId: string;
  file: AgentMemoryFile;
  onClose(): void;
  onSaved(file: AgentMemoryFile): void;
  onReload(): void;
}) {
  const { t } = useTranslation();
  const memory = useBackendModule('agentMemory');
  const alert = useAlert();
  const toast = useToast();
  const [draft, setDraft] = useState(file.content);
  const [saving, setSaving] = useState(false);
  const dirty = draft !== file.content;
  const readOnly = file.key === 'journal';

  function leave(action: () => void) {
    if (saving) return;
    if (!dirty) {
      action();
      return;
    }
    alert.confirm({
      title: t('agent.memory.discard'),
      description: t('agent.memory.unsaved'),
      confirmLabel: t('common.discard'),
      onConfirm: action,
    });
  }

  async function save() {
    if (file.key === 'journal' || saving || !dirty) return;
    setSaving(true);
    try {
      const updated = await memory.write({
        agentId,
        key: file.key,
        content: draft,
        expectedVersion: file.version,
      });
      onSaved(updated);
      toast.show({ label: t('agent.memory.saved'), variant: 'success' });
    } catch (error) {
      const key =
        error instanceof AgentMemoryError
          ? {
              conflict: 'agent.memory.conflict',
              'too-large': 'agent.memory.tooLarge',
              'agent-unavailable': 'agent.memory.unavailable',
              unavailable: 'agent.memory.unavailable',
            }[error.code]
          : 'agent.memory.saveFailed';
      toast.show({ label: t(key), variant: 'danger' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      avoidKeyboard
      dismissible={!saving && !dirty}
      onClose={() => leave(onClose)}
      open
      size="large"
      title={t(LABELS[file.key])}
      footer={
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            disabled={saving}
            onPress={() => leave(onClose)}
            variant="secondary"
          >
            {t('common.close')}
          </Button>
          {!readOnly ? (
            <>
              <Button
                disabled={saving}
                onPress={() =>
                  leave(() => {
                    setDraft(file.content);
                    onReload();
                  })
                }
                variant="secondary"
              >
                {t('agent.memory.reload')}
              </Button>
              <Button
                className="flex-1"
                disabled={!dirty}
                loading={saving}
                onPress={() => {
                  void save();
                }}
              >
                {t('common.save')}
              </Button>
            </>
          ) : null}
        </View>
      }
    >
      {readOnly ? (
        <ScrollView contentContainerClassName="gap-3 p-4">
          <Text className="text-sm text-muted-foreground">{t('agent.memory.journalHint')}</Text>
          <Text selectable className="text-foreground">
            {file.content || t('agent.memory.empty')}
          </Text>
        </ScrollView>
      ) : (
        <TextInput
          accessibilityLabel={t(LABELS[file.key])}
          className="flex-1 p-4 text-base text-foreground"
          multiline
          textAlignVertical="top"
          maxLength={AGENT_MEMORY_DOCUMENT_BYTES}
          onChangeText={setDraft}
          placeholder={t('agent.memory.empty')}
          value={draft}
          editable={!saving}
        />
      )}
    </BottomSheet>
  );
}
