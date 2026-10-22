import { CharacterPackError, validateCharacterLayers } from '@cherrystudio/character-avatar/layers';
import {
  AvatarCharacterIdSchema,
  CharacterManifestSchema,
  characterLayers,
} from '@cherrystudio/character-avatar/manifest';
import { randomUUID } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';
import * as z from 'zod';

import { storageDirectory } from '@/backend/data/storage/storagePaths';
import { extractZipEntries, readZipDirectory } from '@/backend/utils/zipReader';
import type { AvatarCharacter, AvatarsModule } from '@/shared/contracts/avatars';
import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('AvatarCharacters');
const CHARACTER_DIRECTORY = 'avatar-characters';
const MAX_PACK_BYTES = 24 * 1024 * 1024;
const MAX_PACK_FILES = 64;
const LAYER_EXTENSIONS = { png: 'png', webp: 'webp' } as const;
const PACK_MANIFEST = 'character.json';

/** Stored next to the layers: the portable manifest plus which file holds each layer. */
const StoredCharacterSchema = z.strictObject({
  manifest: CharacterManifestSchema,
  files: z.record(z.string(), z.string().regex(/^[0-9a-f-]{36}\.[a-z0-9-]+\.(?:png|webp)$/)),
});

export type AvatarCharacters = Pick<
  AvatarsModule,
  'listCharacters' | 'importCharacterPack' | 'removeCharacter'
> & {
  /** Validates layers against the manifest, derives missing anchors, and stores the character. */
  saveCharacter(input: {
    manifest: unknown;
    layers: Record<string, { bytes: Uint8Array; extension: keyof typeof LAYER_EXTENSIONS }>;
  }): Promise<string>;
};

async function readPackArchive(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const invalid = () => new CharacterPackError('pack-invalid', 'The character pack is invalid.');
  const source = {
    size: bytes.byteLength,
    read: (offset: number, length: number) => bytes.subarray(offset, offset + length),
  };
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const directory = readZipDirectory(source, {
    invalid,
    decodeName: (name) => {
      try {
        return decoder.decode(name);
      } catch {
        return null;
      }
    },
    tooLarge: () => new CharacterPackError('pack-invalid', 'The character pack is too large.'),
    maxRecords: MAX_PACK_FILES,
    maxExpandedBytes: MAX_PACK_BYTES,
    allowDirectories: true,
    checkRecord: ({ path }) => {
      if (path.split('/').some((part) => part === '..' || part === '')) throw invalid();
    },
  });
  const files = new Map<string, Uint8Array>();
  await extractZipEntries(source, directory, {
    invalid,
    decodeName: (name) => decoder.decode(name),
    verifyCrc: true,
    open: (entry) => {
      const output = new Uint8Array(entry.size);
      let written = 0;
      // Packs may be zipped with or without a single enclosing folder.
      files.set(entry.name.split('/').pop()!.toLowerCase(), output);
      return {
        write: (chunk) => {
          output.set(chunk, written);
          written += chunk.byteLength;
        },
      };
    },
  });
  return files;
}

/** Character packs live as flat files so backups capture the whole library directory. */
export function createAvatarCharacters(): AvatarCharacters {
  const directory = () => new Directory(storageDirectory(), CHARACTER_DIRECTORY);
  const recordFile = (id: string) => new File(directory(), `${id}.json`);

  const readStored = async (id: string) => {
    const record = recordFile(id);
    if (!record.exists) return null;
    return StoredCharacterSchema.parse(JSON.parse(await record.text()));
  };

  const removeCharacter: AvatarCharacters['removeCharacter'] = async (id) => {
    AvatarCharacterIdSchema.parse(id);
    const stored = await readStored(id).catch(() => null);
    for (const name of Object.values(stored?.files ?? {})) {
      const file = new File(directory(), name);
      if (file.exists) file.delete();
    }
    const record = recordFile(id);
    if (record.exists) record.delete();
  };

  const saveCharacter: AvatarCharacters['saveCharacter'] = async ({ manifest, layers }) => {
    const stored = validateCharacterLayers(
      manifest,
      Object.fromEntries(Object.entries(layers).map(([name, layer]) => [name, layer.bytes])),
    );
    const names = characterLayers(stored);
    const id = randomUUID();
    const files: Record<string, string> = {};
    try {
      directory().create({ intermediates: true, idempotent: true });
      for (const name of names) {
        const layer = layers[name]!;
        const filename = `${id}.${name}.${LAYER_EXTENSIONS[layer.extension]}`;
        const file = new File(directory(), filename);
        file.create();
        file.write(layer.bytes);
        files[name] = filename;
      }
      // The record is written last: a partial character is never listed.
      const record = recordFile(id);
      record.create();
      record.write(JSON.stringify({ manifest: stored, files }));
      return id;
    } catch (error) {
      for (const name of Object.values(files)) {
        const file = new File(directory(), name);
        if (file.exists) file.delete();
      }
      throw error;
    }
  };

  return {
    saveCharacter,
    removeCharacter,
    async listCharacters() {
      const root = directory();
      if (!root.exists) return [];
      const characters: AvatarCharacter[] = [];
      for (const entry of root.list()) {
        if (!(entry instanceof File) || !entry.name.endsWith('.json')) continue;
        const id = entry.name.slice(0, -'.json'.length);
        if (!AvatarCharacterIdSchema.safeParse(id).success) continue;
        try {
          const stored = (await readStored(id))!;
          const layers = Object.fromEntries(
            Object.entries(stored.files).map(([name, file]) => [name, new File(root, file).uri]),
          );
          characters.push({ id, manifest: stored.manifest, layers });
        } catch (error) {
          logger.warn('Skipping an unreadable character', error as Error);
        }
      }
      return characters.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
    },
    async importCharacterPack(uri) {
      const archive = new File(uri);
      if (archive.size > MAX_PACK_BYTES) {
        throw new CharacterPackError('pack-invalid', 'The character pack is too large.');
      }
      const files = await readPackArchive(await archive.bytes());
      const manifestBytes = files.get(PACK_MANIFEST);
      if (!manifestBytes)
        throw new CharacterPackError('pack-invalid', 'character.json is missing.');
      let manifest: unknown;
      try {
        manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
      } catch (error) {
        throw new CharacterPackError('pack-invalid', 'character.json is not JSON.', {
          cause: error,
        });
      }
      const layers: Parameters<AvatarCharacters['saveCharacter']>[0]['layers'] = {};
      // Collect every known layer; validation decides which ones the manifest requires.
      for (const name of characterLayers({ rig: { tuft: {} } })) {
        for (const extension of Object.keys(
          LAYER_EXTENSIONS,
        ) as (keyof typeof LAYER_EXTENSIONS)[]) {
          const bytes = files.get(`${name}.${extension}`);
          if (bytes) layers[name] = { bytes, extension };
        }
      }
      return saveCharacter({ manifest, layers });
    },
  };
}
