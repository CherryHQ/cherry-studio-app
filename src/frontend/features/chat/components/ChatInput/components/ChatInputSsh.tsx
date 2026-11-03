import CheckIcon from '@cherrystudio/app-icons/icons/check';
import NetworkIcon from '@cherrystudio/app-icons/icons/network';
import { Button, Composer, Section, useAlert } from '@cherrystudio/ui/components';
import { useFocusEffect, useRouter } from 'expo-router';
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View, type ViewInstance } from 'react-native';

import {
  useComposerActions,
  useComposerMeta,
  useComposerState,
} from '@/frontend/components/Composer';
import { useBackendModule } from '@/frontend/data';
import { useSshAction, useSshProfiles, useSshTarget } from '@/frontend/hooks/ssh';
import type { SshProfile } from '@/shared/data/types/ssh';

import {
  createSshMention,
  createSshMentionUrl,
  readSshMentions,
  removeSshMentions,
} from '../utils/sshMentions';

/** A conversation binding stays visible after a sent draft clears its mention. */
export function ChatInputSshTarget({
  contextId,
  onPress,
}: {
  contextId?: string;
  onPress: () => void;
}) {
  const target = useSshTarget(contextId);
  const { draft } = useComposerState();
  if (
    !target ||
    readSshMentions(draft).references.some(
      (item) => item.id === target.profile.id && item.revision === target.profile.revision,
    )
  )
    return null;
  return (
    <View className="max-w-full self-start">
      <Button
        variant="secondary"
        size="sm"
        shape="pill"
        onPress={onPress}
        icon={<NetworkIcon className="size-4 text-foreground" />}
        testID="chat-ssh-target"
      >
        <Button.Label
          numberOfLines={1}
        >{`SSH · ${target.profile.username}@${target.profile.host}:${target.profile.port}`}</Button.Label>
      </Button>
    </View>
  );
}

export function ChatInputSshPopover({
  contextId,
  children,
  onClose,
  open,
  returnFocusRef,
}: {
  contextId?: string;
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  returnFocusRef?: RefObject<ViewInstance | null>;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const router = useRouter();
  const ssh = useBackendModule('ssh');
  const { inputRef } = useComposerMeta();
  const { setDraft } = useComposerActions();
  const profiles = useSshProfiles();
  const target = useSshTarget(contextId);
  const action = useSshAction();
  const initialFocusRef = useRef<ViewInstance>(null);
  const isOpen = useRef(open);
  const menuGeneration = useRef(0);
  const selectionAccepted = useRef(false);
  const [shouldRestoreFocus, setShouldRestoreFocus] = useState(true);
  const granted = Boolean(target?.grant);
  useEffect(() => {
    menuGeneration.current++;
    isOpen.current = open;
    if (open) selectionAccepted.current = false;
  }, [contextId, open]);
  useFocusEffect(
    useCallback(
      () => () => {
        isOpen.current = false;
        setShouldRestoreFocus(false);
        onClose();
      },
      [onClose],
    ),
  );

  function close(reason: 'outside' | 'anchor' | 'back') {
    isOpen.current = false;
    setShouldRestoreFocus(reason !== 'anchor');
    onClose();
  }
  async function select(profile: SshProfile | null) {
    if (!contextId || !isOpen.current || selectionAccepted.current || action.busy) return;
    selectionAccepted.current = true;
    const selectionGeneration = menuGeneration.current;
    const isCurrent = () => isOpen.current && menuGeneration.current === selectionGeneration;
    const selected = await action.run(async (signal) => {
      const editor = inputRef.current;
      const draft = await editor?.getMarkdown();
      if (draft === undefined || !editor || inputRef.current !== editor || !isCurrent())
        return false;
      signal.throwIfAborted();
      const current = ssh.getTarget(contextId);
      if (
        !profile ||
        current?.profile.id !== profile.id ||
        current.profile.revision !== profile.revision
      )
        await ssh.selectTarget(contextId, profile);
      signal.throwIfAborted();
      if (!isCurrent() || inputRef.current !== editor) return false;
      const selectedTarget = ssh.getTarget(contextId);
      if (
        profile &&
        (selectedTarget?.profile.id !== profile.id ||
          selectedTarget.profile.revision !== profile.revision)
      )
        return false;
      if (profile) {
        const label = `SSH · ${profile.name.replace(/\s+/g, ' ')}`;
        if (readSshMentions(draft).references.length) {
          // Replace the single selected connection without discarding ordinary draft text.
          setDraft((currentDraft) =>
            `${removeSshMentions(currentDraft).trimEnd()} ${createSshMention(label, profile)} `.trimStart(),
          );
        } else {
          editor.insertLink(label, createSshMentionUrl(profile));
          editor.insertText(' ');
        }
      } else setDraft(removeSshMentions);
      return true;
    });
    selectionAccepted.current = false;
    if (!selected || !isCurrent()) return;
    setShouldRestoreFocus(true);
    isOpen.current = false;
    onClose();
  }
  function changeGrant(allow: boolean) {
    if (!target || !contextId) return;
    const apply = () => {
      void action.run(() => ssh.setCommandGrant(contextId, target, allow));
    };
    if (allow)
      alert.confirm({
        title: t('ssh.grant.title'),
        description: t('ssh.grant.description', {
          target: `${target.profile.username}@${target.profile.host}:${target.profile.port}`,
        }),
        confirmLabel: t('ssh.grant.allow'),
        onConfirm: apply,
      });
    else apply();
  }
  const content = (
    <ScrollView
      className="grow-0 shrink"
      contentContainerClassName="gap-0.5 p-2"
      keyboardDismissMode="none"
      keyboardShouldPersistTaps="always"
    >
      {profiles.isLoading || profiles.error || profiles.data?.length === 0 ? (
        <View className="gap-2 px-3 py-2">
          <Text className="text-sm text-muted-foreground">
            {t(
              profiles.isLoading ? 'ssh.loading' : profiles.error ? 'ssh.loadFailed' : 'ssh.empty',
            )}
          </Text>
          {profiles.error ? (
            <Button size="sm" variant="ghost" onPress={() => void profiles.refetch()}>
              {t('common.retry')}
            </Button>
          ) : null}
        </View>
      ) : null}
      <Pressable
        ref={initialFocusRef}
        accessibilityRole="button"
        accessibilityState={{ selected: !target, disabled: action.busy }}
        className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-secondary-active disabled:opacity-50"
        disabled={action.busy}
        onPress={() => void select(null)}
      >
        <Text className="min-w-0 flex-1 text-base text-foreground">{t('ssh.noTarget')}</Text>
        {!target ? <CheckIcon className="size-5 text-primary" /> : null}
      </Pressable>
      {profiles.data?.map((profile) => {
        const selected = target?.profile.id === profile.id;
        const disabled = action.busy || !profile.isEnabled || !profile.fingerprint;
        return (
          <Pressable
            key={profile.id}
            accessibilityRole="button"
            accessibilityLabel={profile.name}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-secondary-active disabled:opacity-50"
            onPress={() => void select(profile)}
            testID={`chat-ssh-${profile.id}`}
          >
            <NetworkIcon className="size-5 text-foreground" />
            <View className="min-w-0 flex-1">
              <Text className="text-base text-foreground" numberOfLines={2}>
                {profile.name}
              </Text>
              <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                {!profile.isEnabled
                  ? t('ssh.disabled')
                  : !profile.fingerprint
                    ? t('ssh.untrusted')
                    : `${profile.username}@${profile.host}:${profile.port}`}
              </Text>
            </View>
            {selected ? <CheckIcon className="size-5 text-primary" /> : null}
          </Pressable>
        );
      })}
      {target ? (
        <Section footer={t(granted ? 'ssh.grant.active' : 'ssh.grant.ask')}>
          <Section.SwitchItem
            label={t('ssh.grant.title')}
            value={granted}
            onValueChange={changeGrant}
            disabled={action.busy}
          />
          <Section.Item
            label={t('ssh.files.title')}
            onPress={() => {
              isOpen.current = false;
              setShouldRestoreFocus(false);
              onClose();
              router.push({
                pathname: '/settings/ssh/files',
                params: { profileId: target.profile.id },
              });
            }}
          />
        </Section>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        onPress={() => {
          isOpen.current = false;
          setShouldRestoreFocus(false);
          onClose();
          router.push('/plugins');
        }}
      >
        {t('ssh.manage')}
      </Button>
    </ScrollView>
  );
  return (
    <Composer.Popover
      accessibilityLabel={t('ssh.selectTarget')}
      content={content}
      initialFocusRef={initialFocusRef}
      maxHeight={400}
      maxWidth={320}
      onClose={close}
      open={open}
      returnFocusRef={shouldRestoreFocus ? returnFocusRef : undefined}
      testID="chat-ssh-picker"
    >
      {children}
    </Composer.Popover>
  );
}
