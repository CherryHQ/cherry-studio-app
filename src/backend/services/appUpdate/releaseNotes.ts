import { createHttpClient } from '@/backend/services/http';
import type { AppUpdateRelease } from '@/shared/contracts/appUpdate';
import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('AppUpdateReleaseNotes');
const github = createHttpClient({
  baseUrl: 'https://api.github.com',
  headers: { Accept: 'application/vnd.github+json' },
  timeoutMs: 10_000,
});
/** The release-page section about attachments and checksums; the app installs for the user. */
const DOWNLOAD_HEADING = /^##\s+(下载安装|Download and Installation)\s*$/m;

/**
 * Reduces a published Markdown release body to what the update sheet shows: the title repeats the
 * sheet's own heading, and the download section ends the body by the cloud-release convention.
 */
export function normalizeReleaseNotes(body: string | null | undefined): string | null {
  if (!body) return null;
  let notes = body.replace(/^\s*#\s[^\n]*\n/, '');
  const download = DOWNLOAD_HEADING.exec(notes);
  if (download) notes = notes.slice(0, download.index);
  return notes.trim() || null;
}

/**
 * GitCode publishes Simplified Chinese only. Other UI languages read the equivalent English notes
 * GitHub publishes for the same tag, keeping the Chinese notes when GitHub cannot be reached.
 */
export async function readReleaseNotes(
  release: AppUpdateRelease,
  language: string,
): Promise<string | null> {
  if (release.channel !== 'apk' || /^zh\b/i.test(language)) return release.notes;
  try {
    const { data } = await github.request<{ body?: string | null }>({
      method: 'GET',
      path: `/repos/CherryHQ/cherry-studio-app/releases/tags/v${release.latestVersion}`,
      maxResponseBytes: 512_000,
    });
    return normalizeReleaseNotes(data.body) ?? release.notes;
  } catch (error) {
    logger.warn('English release notes are unavailable', { error });
    return release.notes;
  }
}
