import { Button, ContentState, Dialog, Input, TextField } from '@cherrystudio/ui/components';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useComposerActions, useComposerMeta } from '@/frontend/components/Composer';
import type { ComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';
import { useBackendModule } from '@/frontend/data';
import { useMcpServersApi } from '@/frontend/hooks/mcp/useMcpServers';
import type { McpContentEntry, McpContentPreview } from '@/shared/contracts/mcp';
import type { McpResourceReference } from '@/shared/contracts/mcpContent';

/** A server-selected source becomes an inspectable composer draft only after Add. */
export function McpContentPicker({
  onClose,
  resource,
}: {
  onClose: () => void;
  resource?: McpResourceReference;
}) {
  const { t } = useTranslation();
  const mcp = useBackendModule('mcp');
  const files = useBackendModule('file');
  const { servers } = useMcpServersApi();
  const { inputRef } = useComposerMeta();
  const { addAttachments } = useComposerActions();
  const [source, setSource] = useState<{ id: string; name: string }>();
  const [catalog, setCatalog] = useState<McpContentEntry[]>();
  const [entry, setEntry] = useState<McpContentEntry>();
  const [args, setArgs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<McpContentPreview>();
  const [busy, setBusy] = useState(Boolean(resource));
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!resource) return;
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
  async function load(server: { id: string; name: string }) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSource(server);
    setCatalog(undefined);
    setEntry(undefined);
    setPreview(undefined);
    setError(false);
    setBusy(true);
    try {
      const result = await mcp.listContent(server.id, controller.signal);
      if (!controller.signal.aborted) setCatalog(result);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function read() {
    if (!source || !entry || busy) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setBusy(true);
    setError(false);
    try {
      const result = await mcp.readContent(source.id, entry, args, controller.signal);
      if (!controller.signal.aborted) setPreview(result);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function add() {
    if (!preview || adding) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setAdding(true);
    setError(false);
    const attachments: ComposerAttachmentReady[] = [];
    try {
      for (const content of preview.files) {
        controller.signal.throwIfAborted();
        const temporary = new File(Paths.cache, `mcp-${randomUUID()}`);
        try {
          temporary.write(content.data, { encoding: 'base64' });
          const resolved = await files.createInternalEntry({
            uri: temporary.uri,
            mediaType: content.mimeType,
            name: content.name,
          });
          attachments.push({
            id: resolved.entry.id,
            fileEntryId: resolved.entry.id,
            status: 'ready',
            uri: resolved.uri,
            name: resolved.entry.filename,
            mediaType: resolved.entry.mediaType,
            kind: resolved.entry.mediaType.startsWith('image/') ? 'image' : 'file',
            size: resolved.entry.size,
          });
        } finally {
          if (temporary.exists) temporary.delete();
        }
      }
      controller.signal.throwIfAborted();
      if (!inputRef.current) throw new Error('The composer is unavailable.');
      inputRef.current.insertText(
        `\n[${preview.serverName} / ${preview.title}]\n${preview.text}\n`,
      );
      addAttachments(attachments);
      onClose();
    } catch {
      await Promise.allSettled(
        attachments.map((attachment) => files.delete(attachment.fileEntryId)),
      );
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setAdding(false);
    }
  }
  const available = servers.filter((server) => server.isEnabled && server.origin !== 'builtin');
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
        ) : entry ? (
          <>
            <Text className="text-base font-semibold text-foreground">{entry.title}</Text>
            {entry.description ? (
              <Text className="text-sm text-muted-foreground">{entry.description}</Text>
            ) : null}
            {entry.arguments.map((arg) => (
              <TextField key={arg.name}>
                <TextField.Label>
                  {arg.name}
                  {arg.required ? ' *' : ''}
                </TextField.Label>
                {arg.description ? (
                  <Text className="text-sm text-muted-foreground">{arg.description}</Text>
                ) : null}
                <Input
                  accessibilityLabel={arg.name}
                  value={args[arg.name] ?? ''}
                  onChangeText={(value) =>
                    setArgs((current) => ({ ...current, [arg.name]: value }))
                  }
                />
              </TextField>
            ))}
          </>
        ) : catalog ? (
          <>
            <Text className="text-base font-semibold text-foreground">{source?.name}</Text>
            {catalog.length === 0 ? (
              <Text className="text-sm text-muted-foreground">{t('mcp.content.empty')}</Text>
            ) : null}
            {catalog.map((item) => (
              <Button
                variant="secondary"
                key={`${item.kind}:${item.key}`}
                onPress={() => {
                  setEntry(item);
                  setArgs({});
                  setError(false);
                }}
              >
                {item.title} · {t(`mcp.content.${item.kind}`)}
              </Button>
            ))}
          </>
        ) : !busy && !resource ? (
          <>
            {available.length === 0 ? (
              <Text className="text-sm text-muted-foreground">{t('mcp.content.noServers')}</Text>
            ) : null}
            {available.map((server) => (
              <Button variant="secondary" key={server.id} onPress={() => void load(server)}>
                {server.name}
              </Button>
            ))}
          </>
        ) : null}
      </ScrollView>
      <View className="gap-2 pt-4">
        {preview ? (
          <Button disabled={adding} onPress={() => void add()}>
            {t('mcp.content.add')}
          </Button>
        ) : entry ? (
          <Button
            disabled={
              busy || entry.arguments.some((arg) => arg.required && !args[arg.name]?.trim())
            }
            onPress={() => void read()}
          >
            {t('mcp.content.preview')}
          </Button>
        ) : error && source ? (
          <Button onPress={() => void load(source)}>{t('settings.mcp.retry')}</Button>
        ) : null}
        {source && !busy ? (
          <Button
            variant="secondary"
            disabled={adding}
            onPress={() => {
              if (preview) setPreview(undefined);
              else if (entry) setEntry(undefined);
              else {
                setCatalog(undefined);
                setSource(undefined);
              }
              setError(false);
            }}
          >
            {t('mcp.content.back')}
          </Button>
        ) : null}
        <Button variant="ghost" disabled={adding} onPress={onClose}>
          {t('common.cancel')}
        </Button>
      </View>
    </Dialog>
  );
}
