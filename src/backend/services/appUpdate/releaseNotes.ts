import { createHttpClient } from '@/backend/services/http';
import type { AppUpdateRelease } from '@/shared/contracts/appUpdate';
import { loggerService } from '@/shared/core/logger/LoggerService';

const logger = loggerService.withContext('AppUpdateReleaseNotes');
const github = createHttpClient({
  baseUrl: 'https://api.github.com',
  headers: { Accept: 'application/vnd.github+json' },
  timeoutMs: 10_000,
});
const gitcode = createHttpClient({
  baseUrl: 'https://api.gitcode.com/api/v5',
  headers: { Accept: 'application/json' },
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
 * GitCode publishes Chinese notes and GitHub publishes English notes. UI language selects the
 * notes independently of the IP-selected package source; lookup failures keep the published notes.
 */
export async function readReleaseNotes(
  release: AppUpdateRelease,
  language: string,
): Promise<string | null> {
  if (
    release.channel !== 'apk' &&
    !(release.channel === 'domestic-stores' && release.notesSource === 'gitcode')
  )
    return release.notes;
  const wantsChinese = /^zh\b/i.test(language);
  const hasChinese =
    release.channel === 'domestic-stores' ||
    new URL(release.downloadUrl).hostname === 'gitcode.com';
  if (wantsChinese === hasChinese) return release.notes;
  try {
    const { data } = await (wantsChinese ? gitcode : github).request<{ body?: string | null }>({
      method: 'GET',
      path: `/repos/CherryHQ/cherry-studio-app/releases/tags/v${release.latestVersion}`,
      maxResponseBytes: 512_000,
    });
    return normalizeReleaseNotes(data.body) ?? release.notes;
  } catch (error) {
    logger.warn('Localized release notes are unavailable', { error });
    return release.notes;
  }
}
