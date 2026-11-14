import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import {
  Breadcrumbs,
  Button,
  ContentState,
  Dialog,
  FileBrowserRow,
  FilePreview,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { Fragment, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openTemporaryFilePreview } from '@/frontend/appShell/filePreview';
import { RouteHeader } from '@/frontend/appShell/header';
import { resolveHeaderContentInset } from '@/frontend/appShell/navigation';
import { LoadedFileEntryPreview } from '@/frontend/components/FileEntryPreview';
import { useBackendModule } from '@/frontend/data';
import { useFileEntryPages } from '@/frontend/hooks/file';
import { sshErrorLabel, useSshAction, useSshProfiles } from '@/frontend/hooks/ssh';
import { filenameExtension, type FileEntry } from '@/shared/data/types/file';
import {
  SshError,
  type SshFileEntry,
  type SshFileResult,
  type SshProfile,
  type SshTransferProgress,
} from '@/shared/data/types/ssh';

import { PluginPage } from '../components/PluginPage';
import { SshDiagnosticsButton } from './SshDiagnosticsButton';

export function SshFilesScreen() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const profiles = useSshProfiles();
  const { t } = useTranslation();
  const profile = profiles.data?.find((item) => item.id === profileId);
  if (profile) return <RemoteFiles key={profile.revision} profile={profile} />;
  return (
    <>
      <RouteHeader title={t('ssh.files.title')} />
      <PluginPage>
        {profiles.isLoading ? (
          <ContentState.Loading title={t('ssh.loading')} />
        ) : (
          <ContentState.Error
            title={t('ssh.loadFailed')}
            primaryAction={{ children: t('common.retry'), onPress: () => void profiles.refetch() }}
          />
        )}
      </PluginPage>
    </>
  );
}

function RemoteFiles({ profile }: { profile: SshProfile }) {
  const { t, i18n } = useTranslation();
  const contentTopInset = resolveHeaderContentInset(useHeaderHeight());
  const { bottom, left, right } = useSafeAreaInsets();
  const { alert } = useAlert();
  const { toast } = useToast();
  const ssh = useBackendModule('ssh');
  const action = useSshAction();
  const [location, setLocation] = useState({ path: '.' });
  const { path } = location;
  const [directory, setDirectory] = useState<SshFileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [progress, setProgress] = useState<SshTransferProgress | null>(null);
  const [pickUpload, setPickUpload] = useState(false);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const number = new Intl.NumberFormat(locale);
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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
  const segments = path === '.' ? [] : path.split('/');
  const entries = [...(directory?.entries ?? [])].sort(
    (a, b) =>
      Number(b.type === 'directory') - Number(a.type === 'directory') ||
      a.name.localeCompare(b.name, locale),
  );
  const childPath = (name: string) => (path === '.' ? name : `${path}/${name}`);
  async function read(entry: SshFileEntry) {
    const sourcePath = childPath(entry.name);
    if (entry.type === 'directory') {
      setLocation({ path: sourcePath });
      return;
    }
    setProgress({ transferred: 0, total: null });
    await action.run(async (signal) => {
      const file = await ssh.preview(profile, sourcePath, signal, setProgress);
      if (signal.aborted) {
        file.release();
        return;
      }
      openTemporaryFilePreview(file);
    });
    setProgress(null);
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
    <>
      <RouteHeader
        title={segments.at(-1) ?? t('ssh.files.title')}
        onBack={
          path === '.'
            ? undefined
            : () => {
                action.cancel();
                setLocation({ path: segments.slice(0, -1).join('/') || '.' });
              }
        }
        rightActions={[
          {
            key: 'ssh-file-actions',
            type: 'menu',
            icon: EllipsisIcon,
            nativeIcon: require('@/assets/header-toolbar/ellipsis.png'),
            accessibilityLabel: t('common.more'),
            items: [
              {
                id: 'refresh',
                label: t('ssh.files.refresh'),
                disabled: busy,
                onPress: () => setLocation((current) => ({ ...current })),
              },
              {
                id: 'upload',
                label: t('ssh.files.upload'),
                disabled: busy || !!error,
                onPress: () => setPickUpload(true),
              },
            ],
          },
        ]}
      />
      <View
        className="flex-1 bg-background"
        style={{ paddingLeft: left, paddingRight: right, paddingTop: contentTopInset }}
      >
        <View className="w-full max-w-[800px] self-center gap-1 px-4 pt-2 pb-4">
          <Breadcrumbs
            disabled={busy}
            items={[
              {
                key: '.',
                label: profile.name,
                onPress: path === '.' ? undefined : () => setLocation({ path: '.' }),
              },
              ...segments.map((name, index) => {
                const ancestor = segments.slice(0, index + 1).join('/');
                return {
                  key: ancestor,
                  label: name,
                  onPress: ancestor === path ? undefined : () => setLocation({ path: ancestor }),
                };
              }),
            ]}
            testID="ssh-file-breadcrumbs"
          />
          <Text selectable className="font-mono text-sm text-muted-foreground">
            {directory?.path || profile.remoteDirectory}
          </Text>
          <Text className="text-sm text-muted-foreground">{t('ssh.files.notice')}</Text>
        </View>
        {action.busy ? (
          <View
            className="w-full max-w-[800px] self-center gap-2 px-4 pb-4"
            accessibilityLiveRegion="polite"
          >
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
            <View className="items-start">
              <Button size="sm" variant="ghost" onPress={action.cancel}>
                {t('common.cancel')}
              </Button>
            </View>
          </View>
        ) : null}
        <ScrollView
          key={path}
          className="flex-1"
          contentContainerClassName="w-full max-w-[800px] grow self-center px-4"
          contentContainerStyle={{ paddingBottom: bottom + 16 }}
          showsVerticalScrollIndicator={false}
          testID="ssh-file-list"
        >
          {loading || error || entries.length === 0 ? (
            <View className="min-h-48 flex-1 justify-center pb-24">
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
              ) : (
                <ContentState.Empty title={t('ssh.files.empty')} />
              )}
            </View>
          ) : (
            entries.map((entry, index) => {
              const description = [
                entry.type !== 'directory' && entry.size !== null
                  ? t('ssh.files.bytes', { size: number.format(entry.size) })
                  : undefined,
                entry.modifiedAt === null
                  ? undefined
                  : t('library.modifiedAt', { date: dateFormatter.format(entry.modifiedAt) }),
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <Fragment key={entry.name}>
                  {index > 0 ? <View className="h-px bg-border" /> : null}
                  <FileBrowserRow
                    description={
                      description ||
                      (entry.type === 'directory' ? t('ssh.files.directory') : undefined)
                    }
                    disabled={action.busy}
                    name={entry.name}
                    onPress={() => void read(entry)}
                    preview={
                      entry.type === 'directory' ? (
                        <FolderIcon className="size-7 text-muted-foreground" />
                      ) : (
                        <FilePreview
                          labels={{
                            openWith: t('filePreview.openWith'),
                            unavailable: t('filePreview.unavailable'),
                          }}
                          metadata={{
                            displayName: entry.name,
                            extensionLabel:
                              filenameExtension(entry.name)?.slice(0, 5).toUpperCase() ?? '',
                            kind: 'document',
                          }}
                          onPress={() => void read(entry)}
                          size={40}
                          variant="icon"
                        />
                      )
                    }
                  />
                </Fragment>
              );
            })
          )}
          {directory?.truncated ? (
            <Text className="pt-4 text-sm text-muted-foreground">
              {t('ssh.files.listTruncated')}
            </Text>
          ) : null}
          {directory?.diagnostics ? (
            <View className="pt-4">
              <SshDiagnosticsButton diagnostics={directory.diagnostics} />
            </View>
          ) : null}
        </ScrollView>
      </View>
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
    </>
  );
}

function SshUploadPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (entry: FileEntry, name: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const files = useFileEntryPages({ enabled: true });
  const dateFormatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <Dialog
      open
      title={t('ssh.files.chooseUpload')}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ScrollView className="max-h-96">
        {files.entries.map(({ entry, libraryFile, uri, previewUri }, index) => (
          <Fragment key={entry.id}>
            {index > 0 ? <View className="h-px bg-border" /> : null}
            <FileBrowserRow
              description={t('library.modifiedAt', { date: dateFormatter.format(entry.updatedAt) })}
              disabled={!uri}
              name={libraryFile?.name ?? entry.filename}
              onPress={() => onSelect(entry, libraryFile?.name ?? entry.filename)}
              preview={
                <LoadedFileEntryPreview
                  entry={entry}
                  previewUri={previewUri}
                  size={40}
                  uri={uri}
                  variant="icon"
                />
              }
            />
          </Fragment>
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
