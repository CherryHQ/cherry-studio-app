/**
 * Provider avatar storage — the mobile equivalent of desktop's `ImageStorage`
 * (`src/renderer/services/ImageStorage.ts`) + `useProviderLogo`.
 *
 * Desktop keeps provider logos decoupled from the provider record, storing them
 * under `image://provider-<id>` in IndexedDB. Mobile has no such key-value blob
 * store, so we persist the uploaded image as a real file on disk under the app's
 * document directory. The provider record still carries no avatar field — the
 * avatar is keyed purely by `providerId`.
 *
 * Built-in ("内置头像") logos are intentionally not supported here; the desktop
 * `icon:<id>` convention is resolved separately via `resolveProviderIcon`.
 */
import { loggerService } from '@logger';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

const logger = loggerService.withContext('ProviderAvatarStorage');
const AVATAR_DIRECTORY_NAME = 'provider-avatars';
let cachedAvatarFiles: File[] | undefined;

function avatarDirectory(): Directory {
  return new Directory(Paths.document, AVATAR_DIRECTORY_NAME);
}

function ensureAvatarDirectory(): Directory {
  const directory = avatarDirectory();

  if (!directory.exists) {
    directory.create({ intermediates: true });
  }

  return directory;
}

function listAvatarFiles(): readonly File[] {
  if (cachedAvatarFiles) {
    return cachedAvatarFiles;
  }

  const directory = avatarDirectory();
  cachedAvatarFiles = directory.exists
    ? directory.list().filter((entry): entry is File => entry instanceof File)
    : [];
  return cachedAvatarFiles;
}

function invalidateAvatarFileIndex(): void {
  cachedAvatarFiles = undefined;
}

/**
 * Every file this provider owns, newest name last. There is normally exactly
 * one; a second only survives a crash between writing the new file and deleting
 * the old one. The bare `providerId` is the name this module used before avatars
 * were versioned, so those files still resolve.
 */
function findAvatarFiles(providerId: string): File[] {
  return listAvatarFiles()
    .filter((entry) => entry.name === providerId || entry.name.startsWith(`${providerId}.`))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function deleteAvatarFiles(files: readonly File[]): void {
  for (const file of files) {
    try {
      if (file.exists) {
        file.delete();
      }
    } catch (error) {
      logger.warn('Failed to delete stored provider avatar', error as Error, { uri: file.uri });
    }
  }
  invalidateAvatarFileIndex();
}

/**
 * Persist a picked image (a temporary picker `uri`) as this provider's avatar.
 * Returns the stable `file://` uri of the stored copy.
 *
 * The copy lands under a fresh name rather than overwriting the previous one:
 * the uri is the image cache key on both platforms, so reusing the path would
 * keep the old photo on screen until the app restarts.
 */
export async function saveProviderAvatar(providerId: string, sourceUri: string): Promise<string> {
  ensureAvatarDirectory();

  const previousFiles = findAvatarFiles(providerId);
  const destination = new File(avatarDirectory(), `${providerId}.${randomUUID()}`);

  await new File(sourceUri).copy(destination);
  deleteAvatarFiles(previousFiles);

  return destination.uri;
}

/** Drop this provider's custom avatar, falling back to its built-in logo. */
export function deleteProviderAvatar(providerId: string): void {
  deleteAvatarFiles(findAvatarFiles(providerId));
}

/** Stable `file://` uri of a provider's stored avatar, or `undefined` if none. */
export function getProviderAvatarUri(providerId: string): string | undefined {
  return findAvatarFiles(providerId).at(-1)?.uri;
}
