import { loggerService } from '@/shared/core/logger/LoggerService';

export class FileHashError extends Error {
  constructor(
    readonly code: 'NATIVE_HASH_UNAVAILABLE' | 'VERIFICATION_FAILED' | 'RESOURCE_UNAVAILABLE',
  ) {
    super(code);
    this.name = 'FileHashError';
  }
}
const hashLogger = loggerService.withContext('FileHash');

/**
 * Lowercase hex SHA-256 of a local file URI, streamed in bounded chunks by native code off the
 * JavaScript thread. Cancellation rejects with the signal's reason; other failures become a
 * `FileHashError`, since native messages may contain private paths.
 */
export async function hashLocalFile(uri: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  let native: typeof import('@preeternal/react-native-file-hash');
  try {
    native =
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- old clients lack this native module
      require('@preeternal/react-native-file-hash') as typeof import('@preeternal/react-native-file-hash');
  } catch (error) {
    hashLogger.warn('Native file hashing is unavailable', { error });
    signal.throwIfAborted();
    throw new FileHashError('NATIVE_HASH_UNAVAILABLE');
  }
  try {
    const digest = await native.fileHash(uri, { algorithm: 'SHA-256', signal });
    signal.throwIfAborted();
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid native SHA-256 result');
    return digest;
  } catch (error) {
    signal.throwIfAborted();
    hashLogger.warn('Native file hashing failed', { error });
    throw new FileHashError('VERIFICATION_FAILED');
  }
}
