import {
  CharacterPlayer,
  type CharacterSprite,
  type CharacterStatus,
  CharacterStill,
  useSpriteImages,
} from '@cherrystudio/character-avatar';
import { drawCharacterCover } from '@cherrystudio/character-avatar/cover';
import {
  Button,
  Chip,
  ContentState,
  ContextMenu,
  type MenuItem,
  useToast,
} from '@cherrystudio/ui/components';
import { Canvas } from '@shopify/react-native-skia';
import { useQueryClient } from '@tanstack/react-query';
import { fromByteArray } from 'base64-js';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { queryKeys, useBackendModule } from '@/frontend/data';
import type { AvatarCharacter } from '@/shared/contracts/avatars';
import { type AvatarRecipe, isAvatarSource } from '@/shared/data/types/avatar';

import { useAvatarCharacters } from '../hooks/useAvatarCharacters';
import { useAvatarResource } from '../hooks/useAvatarResource';
import { characterSprite } from '../utils/characterSprite';
import { AvatarCreation } from './AvatarCreation';

const PREVIEW_STATUSES: CharacterStatus[] = ['idle', 'running', 'waiting', 'completed', 'failed'];
const COVER_SIZE = 512;
const THUMBNAIL_SIZE = 64;

/** Circle colours that keep any artwork legible on light and dark surfaces. */
const AVATAR_BACKGROUNDS = [
  { id: 'blush', hex: '#ffe1de' },
  { id: 'peach', hex: '#ffe6cc' },
  { id: 'butter', hex: '#fff2bf' },
  { id: 'mint', hex: '#d6f2e2' },
  { id: 'sky', hex: '#d8eaff' },
  { id: 'lavender', hex: '#e6defc' },
  { id: 'mist', hex: '#ececf0' },
  { id: 'night', hex: '#2c2b38' },
] as const;

/** Public editor: callers supply and receive only an opaque avatar source reference. */
export function AvatarEditor({
  source,
  onClose,
  onSave,
}: {
  source?: string | null;
  onClose: () => void;
  onSave: (source: string) => void;
}) {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const resource = useAvatarResource(source);
  const characters = useAvatarCharacters();
  const needsResource = isAvatarSource(source);
  const pending = characters.isPending || (needsResource && resource.isPending);
  const failed = characters.error || (needsResource && (resource.error || !resource.data));
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View className="flex-1 bg-background" style={{ paddingTop: top }}>
        <View className="flex-row items-center gap-4 px-4 py-3">
          <Text className="min-w-0 flex-1 font-semibold text-lg text-foreground">
            {t('agent.avatarStudio.title')}
          </Text>
          <Button onPress={onClose} size="sm" variant="ghost">
            {t('common.close')}
          </Button>
        </View>
        {pending || failed ? (
          <View className="flex-1 items-center justify-center p-6">
            {pending ? (
              <ContentState.Loading title={t('agent.avatarStudio.loading')} />
            ) : (
              <ContentState.Error
                title={t('agent.avatarStudio.loadFailed')}
                primaryAction={{
                  children: t('common.retry'),
                  onPress: () => {
                    void characters.refetch();
                    void resource.refetch();
                  },
                }}
              />
            )}
          </View>
        ) : (
          <AvatarStudio
            characters={characters.data ?? []}
            initial={resource.data?.recipe ?? null}
            onSave={onSave}
          />
        )}
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="font-semibold text-base text-foreground">{title}</Text>
      {children}
    </View>
  );
}

function initialRecipe(characters: AvatarCharacter[], initial: AvatarRecipe | null) {
  if (initial && characters.some(({ id }) => id === initial.character)) return initial;
  const first = characters[0];
  return first ? { character: first.id, background: AVATAR_BACKGROUNDS[0].hex } : null;
}

function AvatarStudio({
  characters,
  initial,
  onSave,
}: {
  characters: AvatarCharacter[];
  initial: AvatarRecipe | null;
  onSave: (source: string) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { bottom } = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const avatars = useBackendModule('avatars');
  const reducedMotion = useReducedMotion();
  const [picked, setPicked] = useState<AvatarRecipe | null>(() =>
    initialRecipe(characters, initial),
  );
  const [status, setStatus] = useState<CharacterStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const closed = useRef(false);
  useEffect(
    () => () => {
      closed.current = true;
    },
    [],
  );
  // Keep the selection valid when the library changes underneath it.
  const recipe = useMemo(
    () =>
      picked && characters.some(({ id }) => id === picked.character)
        ? picked
        : initialRecipe(characters, null),
    [characters, picked],
  );
  const character = recipe && characters.find(({ id }) => id === recipe.character);
  const sprite = useMemo(() => (character ? characterSprite(character) : null), [character]);

  const refreshLibrary = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.avatars.characters() });
  const importPack = async () => {
    if (busy) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const { uri } = result.assets[0]!;
    setBusy(true);
    try {
      const id = await avatars.importCharacterPack(uri);
      await refreshLibrary();
      setPicked({ character: id, background: recipe?.background ?? AVATAR_BACKGROUNDS[0].hex });
    } catch {
      toast.show({ label: t('agent.avatarStudio.importFailed'), variant: 'danger' });
    } finally {
      setBusy(false);
      // DocumentPicker was asked for a cache copy; never unlink a user's source document.
      if (uri.startsWith(Paths.cache.uri)) {
        try {
          new File(uri).delete();
        } catch {
          /* Cache cleanup must not change the import outcome. */
        }
      }
    }
  };
  const removeCharacter = async (id: string) => {
    try {
      await avatars.removeCharacter(id);
      await refreshLibrary();
    } catch {
      toast.show({ label: t('agent.avatarStudio.loadFailed'), variant: 'danger' });
    }
  };
  if (creating)
    return (
      <AvatarCreation
        onBack={() => setCreating(false)}
        onReady={(id) => {
          void refreshLibrary().then(() => {
            setPicked({
              character: id,
              background: recipe?.background ?? AVATAR_BACKGROUNDS[0].hex,
            });
            setCreating(false);
          });
        }}
      />
    );
  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="gap-6 px-4 pb-6">
        <View className="items-center gap-4 pt-2">
          <Button onPress={() => setCreating(true)} variant="tonal">
            {t('agent.avatarStudio.create.title')}
          </Button>
          {sprite && recipe ? (
            <View accessible accessibilityLabel={t('agent.avatarStudio.preview')}>
              <CharacterPlayer
                key={recipe.character}
                sprite={sprite}
                background={recipe.background}
                size={220}
                status={status}
              />
            </View>
          ) : (
            <View className="h-56 items-center justify-center px-6">
              <Text className="text-center text-sm text-muted-foreground">
                {t('agent.avatarStudio.empty')}
              </Text>
            </View>
          )}
          {reducedMotion && sprite ? (
            <Text className="text-center text-sm text-muted-foreground">
              {t('agent.avatarStudio.reducedMotion')}
            </Text>
          ) : null}
          <Button
            loading={busy}
            onPress={() => {
              void importPack();
            }}
            size="sm"
            variant="tonal"
          >
            {t('agent.avatarStudio.importPack')}
          </Button>
        </View>
        {characters.length && recipe ? (
          <Section title={t('agent.avatarStudio.character')}>
            <View className="flex-row flex-wrap gap-3">
              {characters.map((item) => (
                <CharacterOption
                  key={item.id}
                  character={item}
                  label={item.manifest.name}
                  background={recipe.background}
                  selected={item.id === recipe.character}
                  onPress={() => setPicked({ ...recipe, character: item.id })}
                  menu={[
                    {
                      id: 'delete',
                      label: t('agent.avatarStudio.deleteCharacter'),
                      destructive: true,
                      onPress: () => void removeCharacter(item.id),
                    },
                  ]}
                />
              ))}
            </View>
          </Section>
        ) : null}
        {sprite && recipe ? (
          <>
            <Section title={t('agent.avatarStudio.previewStatus')}>
              <View className="flex-row flex-wrap gap-2">
                {PREVIEW_STATUSES.map((value) => (
                  <Chip.Selectable
                    key={value}
                    selected={status === value}
                    onSelectedChange={() => setStatus(value)}
                  >
                    {t(`agent.avatarStudio.status.${value}`)}
                  </Chip.Selectable>
                ))}
              </View>
            </Section>
            <Section title={t('agent.avatarStudio.background')}>
              <View className="flex-row flex-wrap gap-3">
                {AVATAR_BACKGROUNDS.map((background) => {
                  const selected = background.hex === recipe.background;
                  return (
                    <Pressable
                      key={background.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={t(`agent.avatarStudio.background.${background.id}`)}
                      onPress={() => setPicked({ ...recipe, background: background.hex })}
                      className={`size-11 items-center justify-center rounded-full border-2 ${selected ? 'border-foreground' : 'border-transparent'}`}
                    >
                      <View
                        className="size-9 rounded-full border border-border"
                        style={{ backgroundColor: background.hex }}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </Section>
          </>
        ) : null}
      </ScrollView>
      {sprite && recipe ? (
        <SaveBar
          sprite={sprite}
          recipe={recipe}
          bottom={bottom}
          onSaved={(reference) => {
            if (!closed.current) onSave(reference);
          }}
        />
      ) : null}
    </View>
  );
}

function SaveBar({
  sprite,
  recipe,
  bottom,
  onSaved,
}: {
  sprite: CharacterSprite;
  recipe: AvatarRecipe;
  bottom: number;
  onSaved: (reference: string) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const avatars = useBackendModule('avatars');
  const images = useSpriteImages(sprite.layers);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!images || saving) return;
    setSaving(true);
    try {
      const cover = drawCharacterCover({
        rig: sprite.rig,
        idle: images.expressions.idle,
        tuft: images.tuft,
        background: recipe.background,
        size: COVER_SIZE,
      });
      onSaved(
        await avatars.createDraft({
          recipe,
          png: `data:image/png;base64,${fromByteArray(cover)}`,
        }),
      );
    } catch {
      toast.show({ label: t('agent.avatarStudio.loadFailed'), variant: 'danger' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <View className="border-t border-border px-4 pt-3" style={{ paddingBottom: bottom + 12 }}>
      <Button
        disabled={!images}
        loading={saving}
        onPress={() => {
          void save();
        }}
      >
        {t('agent.avatarStudio.useAvatar')}
      </Button>
    </View>
  );
}

function CharacterOption({
  character,
  label,
  background,
  selected,
  onPress,
  menu,
}: {
  character: AvatarCharacter;
  label: string;
  background: string;
  selected: boolean;
  onPress: () => void;
  menu?: readonly MenuItem[];
}) {
  const sprite = useMemo(() => characterSprite(character), [character]);
  const images = useSpriteImages(sprite.layers);
  const option = (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className="items-center gap-1"
    >
      <View
        className={`rounded-full border-2 p-0.5 ${selected ? 'border-foreground' : 'border-transparent'}`}
      >
        <Canvas style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }}>
          {images ? (
            <CharacterStill
              rig={sprite.rig}
              images={images}
              background={background}
              size={THUMBNAIL_SIZE}
            />
          ) : null}
        </Canvas>
      </View>
      <Text numberOfLines={1} className="max-w-20 text-xs text-muted-foreground">
        {label}
      </Text>
    </Pressable>
  );
  return menu ? <ContextMenu items={menu}>{option}</ContextMenu> : option;
}
