import { Button, ContentState, Dialog } from '@cherrystudio/ui/components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useMcpAppConversation } from '@/frontend/components/McpApp';
import { useBackendModule } from '@/frontend/data';
import type { McpContentPreview } from '@/shared/contracts/mcp';
import type { McpResourceReference } from '@/shared/contracts/mcpContent';

import { addMcpContentToDraft } from './addMcpContentToDraft';

/** A tool-returned resource becomes an inspectable composer draft only after Add. */
export function McpResourcePreview({
  onClose,
  resource,
}: {
  onClose: () => void;
  resource: McpResourceReference;
}) {
  const { t } = useTranslation();
  const mcp = useBackendModule('mcp');
  const files = useBackendModule('file');
  const conversation = useMcpAppConversation();
  const [preview, setPreview] = useState<McpContentPreview>();
  const [busy, setBusy] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    void mcp
      .readResultResource(resource, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPreview(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [mcp, resource]);
  async function add() {
    if (!preview || adding) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setAdding(true);
    setError(false);
    try {
      if (!conversation) throw new Error('The composer is unavailable.');
      await addMcpContentToDraft(preview, files, conversation, controller.signal);
      onClose();
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setAdding(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !adding) onClose();
      }}
      title={t('mcp.content.title')}
    >
      <ScrollView
        className="max-h-96"
        contentContainerClassName="gap-3"
        keyboardShouldPersistTaps="handled"
      >
        {busy ? <ContentState.Loading title={t('mcp.content.loading')} /> : null}
        {error ? <Text className="text-sm text-danger">{t('mcp.content.failed')}</Text> : null}
        {preview ? (
          <>
            <Text className="text-base font-semibold text-foreground">
              {preview.serverName} · {preview.title}
            </Text>
            <Text className="text-base text-foreground" selectable>
              {preview.text}
            </Text>
            {preview.files.map((file) => (
              <Text className="text-sm text-muted-foreground" key={file.name}>
                {file.name} · {file.mimeType}
              </Text>
            ))}
            <Text className="text-sm text-muted-foreground">{t('mcp.content.draftHint')}</Text>
          </>
        ) : null}
      </ScrollView>
      <View className="gap-2 pt-4">
        {preview ? (
          <Button disabled={adding} onPress={() => void add()}>
            {t('mcp.content.add')}
          </Button>
        ) : null}
        <Button variant="ghost" disabled={adding} onPress={onClose}>
          {t('common.cancel')}
        </Button>
      </View>
    </Dialog>
  );
}
