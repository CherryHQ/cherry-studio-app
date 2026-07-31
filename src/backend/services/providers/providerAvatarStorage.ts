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
import { Directory, File, Paths } from 'expo-file-system';

const AVATAR_DIRECTORY_NAME = 'provider-avatars';

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

function avatarFile(providerId: string): File {
  return new File(avatarDirectory(), providerId);
}

/**
 * Persist a picked image (a temporary picker `uri`) as this provider's avatar.
 * Returns the stable `file://` uri of the stored copy.
 */
export async function saveProviderAvatar(providerId: string, sourceUri: string): Promise<string> {
  ensureAvatarDirectory();

  const destination = avatarFile(providerId);

  if (destination.exists) {
    destination.delete();
  }

  await new File(sourceUri).copy(destination);

  return destination.uri;
}

/** Stable `file://` uri of a provider's stored avatar, or `undefined` if none. */
export function getProviderAvatarUri(providerId: string): string | undefined {
  const file = avatarFile(providerId);

  return file.exists ? file.uri : undefined;
}
