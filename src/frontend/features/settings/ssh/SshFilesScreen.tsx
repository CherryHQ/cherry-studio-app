import {
  Button,
  ContentState,
  Dialog,
  Section,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { splitTextBlocks } from '@cherrystudio/ui/utils';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { FileEntryPreview } from '@/frontend/components/FileEntryPreview';
import { useBackendModule } from '@/frontend/data';
import { SettingsScrollPage } from '@/frontend/features/settings/components/SettingsScrollPage';
import { useFileEntryPages } from '@/frontend/hooks/file';
import { sshErrorLabel, useSshAction, useSshProfiles } from '@/frontend/hooks/ssh';
import type { ResolvedFile } from '@/shared/contracts/file';
import type { FileEntry } from '@/shared/data/types/file';
import {
  SshError,
  type SshFileEntry,
  type SshFileResult,
  type SshProfile,
  type SshTransferProgress,
} from '@/shared/data/types/ssh';

import { SshDiagnosticsButton } from './SshDiagnosticsButton';

export function SshFilesScreen() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const profiles = useSshProfiles();
  const { t } = useTranslation();
  const profile = profiles.data?.find((item) => item.id === profileId);
  return profile ? (
    <RemoteFiles key={profile.revision} profile={profile} />
  ) : (
    <SettingsScrollPage headerProps={{ title: t('ssh.files.title') }}>
      {profiles.isLoading ? (
        <ContentState.Loading title={t('ssh.loading')} />
      ) : (
        <ContentState.Error
          title={t('ssh.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void profiles.refetch() }}
        />
      )}
    </SettingsScrollPage>
  );
}

function RemoteFiles({ profile }: { profile: SshProfile }) {
  const { t, i18n } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const ssh = useBackendModule('ssh');
  const action = useSshAction();
  const [location, setLocation] = useState({ path: '.' });
  const { path } = location;
  const [directory, setDirectory] = useState<SshFileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [preview, setPreview] = useState<{ path: string; result: SshFileResult } | null>(null);
  const [downloaded, setDownloaded] = useState<ResolvedFile | null>(null);
  const [progress, setProgress] = useState<SshTransferProgress | null>(null);
  const [pickUpload, setPickUpload] = useState(false);
  const number = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language);
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      setLoading(true);
      setError(undefined);
      setDirectory(null);
      void ssh
        .files(profile, { operation: 'list', path: location.path }, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setDirectory(result);
          if (result.error || result.state !== 'completed')
            setError(new SshError(result.error ?? 'sftp'));
        })
        .catch((failure: unknown) => {
          if (!controller.signal.aborted) setError(failure);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
    }, [ssh, profile, location]),
  );

  const busy = loading || action.busy;
  const childPath = (name: string) => (path === '.' ? name : `${path}/${name}`);
  async function read(entry: SshFileEntry) {
    const sourcePath = childPath(entry.name);
    if (entry.type === 'directory') {
      setLocation({ path: sourcePath });
      return;
    }
    const result = await action.run((signal) =>
      ssh.files(profile, { operation: 'read', path: sourcePath }, signal),
    );
    if (result) setPreview({ path: sourcePath, result });
  }
  async function download(sourcePath: string) {
    setProgress({ transferred: 0, total: null });
    const result = await action.run((signal) =>
      ssh.download(profile, sourcePath, signal, setProgress),
    );
    setProgress(null);
    if (result) {
      setDownloaded(result);
      setPreview(null);
      toast.show({ label: t('ssh.files.downloaded'), variant: 'success' });
    }
  }
  async function upload(entry: FileEntry, name: string, overwrite: boolean) {
    setProgress({ transferred: 0, total: entry.size });
    const result = await action.run((signal) =>
      ssh.upload(
        profile,
        {
          path: childPath(name),
          fileEntryId: entry.id,
          overwrite,
        },
        signal,
        setProgress,
      ),
    );
    setProgress(null);
    if (!result) return;
    if (result.error === 'file-exists' && !overwrite) {
      alert.confirm({
        title: t('ssh.files.overwrite'),
        description: t('ssh.files.overwriteDescription', { path: childPath(name) }),
        confirmLabel: t('ssh.files.overwrite'),
        role: 'destructive',
        onConfirm: () => {
          void upload(entry, name, true);
        },
      });
    } else if (result.state !== 'completed' || result.error) {
      toast.show({
        label:
          result.state === 'unknown'
            ? t('ssh.files.unknown')
            : sshErrorLabel(new SshError(result.error ?? 'sftp'), t),
        variant: 'danger',
      });
    } else {
      toast.show({ label: t('ssh.files.uploaded'), variant: 'success' });
      setLocation((current) => ({ ...current }));
    }
  }
  return (
    <SettingsScrollPage contentClassName="gap-5" headerProps={{ title: t('ssh.files.title') }}>
      <View className="gap-2">
        <Text className="text-base font-medium text-foreground">{profile.name}</Text>
        <Text selectable className="font-mono text-sm text-muted-foreground">
          {directory?.path || profile.remoteDirectory}
        </Text>
        <Text className="text-sm text-muted-foreground">{t('ssh.files.notice')}</Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy || path === '.'}
          onPress={() =>
            setLocation({ path: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.' })
          }
        >
          {t('ssh.files.parent')}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onPress={() => setLocation((current) => ({ ...current }))}
        >
          {t('ssh.files.refresh')}
        </Button>
        <Button variant="secondary" disabled={busy || !!error} onPress={() => setPickUpload(true)}>
          {t('ssh.files.upload')}
        </Button>
      </View>
      {action.busy ? (
        <View className="gap-2" accessibilityLiveRegion="polite">
          {progress ? (
            <Text className="text-sm text-foreground">
              {t('ssh.files.progress', {
                transferred: number.format(progress.transferred),
                total: progress.total === null ? '—' : number.format(progress.total),
              })}
            </Text>
          ) : (
            <ContentState.Loading title={t('ssh.loading')} />
          )}
          <Button variant="secondary" onPress={action.cancel}>
            {t('common.cancel')}
          </Button>
        </View>
      ) : null}
      {loading ? (
        <ContentState.Loading title={t('ssh.loading')} />
      ) : error ? (
        <ContentState.Error
          title={sshErrorLabel(error, t)}
          primaryAction={{
            children: t('common.retry'),
            onPress: () => setLocation((current) => ({ ...current })),
          }}
        />
      ) : directory?.entries.length ? (
        <Section>
          {directory.entries.map((entry) => (
            <Section.Item
              key={entry.name}
              label={entry.name}
              description={
                entry.type === 'directory'
                  ? t('ssh.files.directory')
                  : entry.size === null
                    ? undefined
                    : t('ssh.files.bytes', { size: number.format(entry.size) })
              }
              disabled={action.busy}
              onPress={() => void read(entry)}
            />
          ))}
        </Section>
      ) : (
        <ContentState.Empty title={t('ssh.files.empty')} />
      )}
      {directory?.truncated ? (
        <Text className="text-sm text-warning">{t('ssh.files.listTruncated')}</Text>
      ) : null}
      {directory?.diagnostics ? <SshDiagnosticsButton diagnostics={directory.diagnostics} /> : null}
      {downloaded ? (
        <View className="gap-2">
          <Text className="text-sm text-muted-foreground">{t('ssh.files.downloaded')}</Text>
          <FileEntryPreview entryId={downloaded.entry.id} />
        </View>
      ) : null}
      {preview ? (
        <Dialog
          open
          title={preview.path}
          onOpenChange={(open) => {
            if (!open && !action.busy) setPreview(null);
          }}
        >
          <ScrollView className="max-h-96" contentContainerClassName="gap-2">
            {preview.result.error ? (
              <Text className="text-sm text-destructive">
                {sshErrorLabel(new SshError(preview.result.error), t)}
              </Text>
            ) : null}
            {splitTextBlocks(preview.result.content.slice(0, 16000)).map((block, index) => (
              // Preview blocks are immutable and may contain identical text.
              <Text key={index} selectable className="font-mono text-sm text-foreground">
                {block}
              </Text>
            ))}
            {preview.result.content.length > 16000 ? (
              <Text className="text-sm text-muted-foreground">
                {t('ssh.files.previewTruncated')}
              </Text>
            ) : null}
            {preview.result.diagnostics ? (
              <SshDiagnosticsButton diagnostics={preview.result.diagnostics} />
            ) : null}
          </ScrollView>
          <View className="gap-2 pt-4">
            {progress ? (
              <Text className="text-sm text-foreground" accessibilityLiveRegion="polite">
                {t('ssh.files.progress', {
                  transferred: number.format(progress.transferred),
                  total: progress.total === null ? '—' : number.format(progress.total),
                })}
              </Text>
            ) : null}
            <Button disabled={action.busy} onPress={() => void download(preview.path)}>
              {t('ssh.files.download')}
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                if (action.busy) action.cancel();
                else setPreview(null);
              }}
            >
              {t(action.busy ? 'common.cancel' : 'common.close')}
            </Button>
          </View>
        </Dialog>
      ) : null}
      {pickUpload ? (
        <SshUploadPicker
          onClose={() => setPickUpload(false)}
          onSelect={(entry, name) => {
            setPickUpload(false);
            alert.confirm({
              title: t('ssh.files.upload'),
              description: t('ssh.files.uploadDescription', {
                name,
                target: `${profile.username}@${profile.host}:${profile.port}`,
                path: childPath(name),
              }),
              confirmLabel: t('ssh.files.upload'),
              onConfirm: () => {
                void upload(entry, name, false);
              },
            });
          }}
        />
      ) : null}
    </SettingsScrollPage>
  );
}

function SshUploadPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (entry: FileEntry, name: string) => void;
}) {
  const { t } = useTranslation();
  const files = useFileEntryPages({ enabled: true });
  return (
    <Dialog
      open
      title={t('ssh.files.chooseUpload')}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ScrollView className="max-h-96" contentContainerClassName="gap-3">
        {files.entries.map(({ entry, libraryFile, uri }) => (
          <Button
            key={entry.id}
            variant="secondary"
            disabled={!uri}
            onPress={() => onSelect(entry, libraryFile?.name ?? entry.filename)}
          >
            {libraryFile?.name ?? entry.filename}
          </Button>
        ))}
        {files.error ? (
          <ContentState.Error
            title={t('chat.filePicker.loadFailed')}
            primaryAction={{ children: t('common.retry'), onPress: () => void files.refresh() }}
          />
        ) : files.isLoading ? (
          <ContentState.Loading title={t('chat.filePicker.loading')} />
        ) : files.entries.length === 0 ? (
          <ContentState.Empty title={t('library.empty')} />
        ) : null}
        {files.hasNext ? (
          <Button
            loading={files.isLoadingMore}
            variant="ghost"
            onPress={() => void files.loadNext()}
          >
            {t('workspace.loadMore')}
          </Button>
        ) : null}
      </ScrollView>
      <View className="pt-4">
        <Button variant="secondary" onPress={onClose}>
          {t('common.cancel')}
        </Button>
      </View>
    </Dialog>
  );
}
