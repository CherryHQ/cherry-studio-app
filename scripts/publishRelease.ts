import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { parseReleaseTag } from './releaseLocalBuild';

export type PublishReleaseTarget = 'both' | 'github' | 'gitcode';

export const MAX_DISPATCH_PAYLOAD_BYTES = 60_000;

export interface CommandResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

export type ExecCommand = (
  command: string,
  args: string[],
  options?: { input?: string; inheritStdio?: boolean },
) => CommandResult;

export interface BuildPublishReleaseDispatchPayloadOptions {
  tag: string;
  targets?: PublishReleaseTarget;
  notesEn?: string;
  notesZh?: string;
  allowNonstandardNotes?: boolean;
}

export interface PublishReleaseDispatchPayload {
  tag: string;
  targets: PublishReleaseTarget;
  notes_en: string;
  notes_zh: string;
}

export interface DispatchPublishReleaseOptions extends BuildPublishReleaseDispatchPayloadOptions {
  ref?: string;
  repo?: string;
  dryRun?: boolean;
  watch?: boolean;
  execCommand?: ExecCommand;
}

export interface DispatchPublishReleaseResult {
  dryRun: boolean;
  payload: PublishReleaseDispatchPayload;
  bytes: number;
  runId?: string;
  runUrl?: string;
  watched: boolean;
}

const VALID_TARGETS = new Set<PublishReleaseTarget>(['both', 'github', 'gitcode']);

const defaultExecCommand: ExecCommand = (command, args, options) => {
  const result = spawnSync(command, args, {
    input: options?.input,
    stdio: options?.inheritStdio ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
};

function normalizeNotesText(raw: string | undefined): string {
  if (!raw || !raw.trim()) return '';
  const normalized = raw.replace(/\r\n?/g, '\n');
  return `${normalized.replace(/\n*$/, '')}\n`;
}

/**
 * Checks that prepared public notes match the in-app update reader markers in
 * `src/backend/services/appUpdate/releaseNotes.ts` and still leave user-facing copy after stripping
 * the `#` title and trailing download section.
 */
export function validateReleaseNotesDocument(notes: string, locale: 'en' | 'zh-CN'): string[] {
  const normalized = notes.replace(/\r\n?/g, '\n');
  if (!normalized.trim()) {
    return [`${locale} release notes are empty.`];
  }

  const errors: string[] = [];
  if (!/^\s*#\s+\S/.test(normalized)) {
    errors.push(
      `${locale} release notes must start with a top-level title heading (e.g. "# Cherry Studio 0.7.0").`,
    );
  }

  const downloadHeadingRe =
    locale === 'en' ? /^##\s+Download and Installation\s*$/m : /^##\s+下载安装\s*$/m;
  if (!downloadHeadingRe.test(normalized)) {
    const expectedHeading = locale === 'en' ? '## Download and Installation' : '## 下载安装';
    errors.push(`${locale} release notes must include "${expectedHeading}".`);
  }

  let appVisibleBody = normalized.replace(/^\s*#\s[^\n]*(?:\n|$)/, '');
  const downloadMatch = downloadHeadingRe.exec(appVisibleBody);
  if (downloadMatch) {
    appVisibleBody = appVisibleBody.slice(0, downloadMatch.index);
  }
  if (!appVisibleBody.trim()) {
    errors.push(
      `${locale} release notes have no user-facing body before the download section for the in-app update dialog.`,
    );
  }

  return errors;
}

export function buildPublishReleaseDispatchPayload(
  options: BuildPublishReleaseDispatchPayloadOptions,
): PublishReleaseDispatchPayload {
  const parsedTag = parseReleaseTag(options.tag);
  const targets = options.targets ?? 'both';
  if (!VALID_TARGETS.has(targets)) {
    throw new Error(
      `Invalid publish target: ${String(targets)}. Expected one of both, github, gitcode.`,
    );
  }

  const needsEn = targets === 'both' || targets === 'github';
  const needsZh = targets === 'both' || targets === 'gitcode';

  const notesEn = needsEn ? normalizeNotesText(options.notesEn) : '';
  const notesZh = needsZh ? normalizeNotesText(options.notesZh) : '';

  const validationErrors: string[] = [];
  if (needsEn) {
    if (!notesEn) {
      validationErrors.push('English release notes (--en-notes) are required and cannot be empty.');
    } else if (!options.allowNonstandardNotes) {
      validationErrors.push(...validateReleaseNotesDocument(notesEn, 'en'));
    }
  }
  if (needsZh) {
    if (!notesZh) {
      validationErrors.push(
        'Simplified Chinese release notes (--zh-notes) are required and cannot be empty.',
      );
    } else if (!options.allowNonstandardNotes) {
      validationErrors.push(...validateReleaseNotesDocument(notesZh, 'zh-CN'));
    }
  }

  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(' '));
  }

  const payload: PublishReleaseDispatchPayload = {
    tag: parsedTag.tag,
    targets,
    notes_en: notesEn,
    notes_zh: notesZh,
  };

  const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (payloadBytes > MAX_DISPATCH_PAYLOAD_BYTES) {
    throw new Error(
      `Dispatch payload is ${payloadBytes} bytes, exceeding the ${MAX_DISPATCH_PAYLOAD_BYTES}-byte limit.`,
    );
  }

  return payload;
}

export function dispatchPublishRelease(
  options: DispatchPublishReleaseOptions,
): DispatchPublishReleaseResult {
  const payload = buildPublishReleaseDispatchPayload(options);
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');

  if (options.dryRun) {
    return {
      dryRun: true,
      payload,
      bytes,
      watched: false,
    };
  }

  const execCommand = options.execCommand ?? defaultExecCommand;
  const ref = options.ref?.trim() || 'main';
  const repoArgs = options.repo?.trim() ? ['--repo', options.repo.trim()] : [];

  const dispatchResult = execCommand(
    'gh',
    ['workflow', 'run', 'publish-release.yml', '--ref', ref, ...repoArgs, '--json'],
    { input: JSON.stringify(payload) },
  );
  if (dispatchResult.status !== 0) {
    const detail = [dispatchResult.stderr, dispatchResult.stdout].filter(Boolean).join('\n').trim();
    throw new Error(
      `Failed to dispatch publish-release.yml (exit ${dispatchResult.status ?? 'unknown'})${detail ? `: ${detail}` : ''}`,
    );
  }

  const combinedOutput = `${dispatchResult.stdout}\n${dispatchResult.stderr}`;
  const runUrlMatch = /https:\/\/\S+\/actions\/runs\/(\d+)/.exec(combinedOutput);
  const runUrl = runUrlMatch?.[0];
  const runId = runUrlMatch?.[1];
  const shouldWatch = options.watch !== false && Boolean(runId);

  if (shouldWatch && runId) {
    const watchResult = execCommand('gh', ['run', 'watch', runId, ...repoArgs, '--exit-status'], {
      inheritStdio: true,
    });
    if (watchResult.status !== 0) {
      throw new Error(
        `Publish Release workflow run ${runId} failed (exit ${watchResult.status ?? 'unknown'}).`,
      );
    }
  }

  return {
    dryRun: false,
    payload,
    bytes,
    runId,
    runUrl,
    watched: shouldWatch,
  };
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      tag: { type: 'string' },
      target: { type: 'string' },
      'en-notes': { type: 'string' },
      'zh-notes': { type: 'string' },
      ref: { type: 'string' },
      repo: { type: 'string' },
      'dry-run': { type: 'boolean' },
      'allow-nonstandard-notes': { type: 'boolean' },
      'no-watch': { type: 'boolean' },
    },
    strict: true,
  });

  if (!values.tag) {
    throw new Error(
      'Usage: publishRelease.ts --tag <vX.Y.Z> [--target both|github|gitcode] [--en-notes <file>] [--zh-notes <file>] [--ref main] [--repo owner/repo] [--dry-run] [--allow-nonstandard-notes] [--no-watch]',
    );
  }

  const targets = (values.target ?? 'both') as PublishReleaseTarget;
  const notesEn = values['en-notes']
    ? readFileSync(resolve(values['en-notes']), 'utf8')
    : undefined;
  const notesZh = values['zh-notes']
    ? readFileSync(resolve(values['zh-notes']), 'utf8')
    : undefined;

  const result = dispatchPublishRelease({
    tag: values.tag,
    targets,
    notesEn,
    notesZh,
    ref: values.ref,
    repo: values.repo,
    dryRun: values['dry-run'],
    allowNonstandardNotes: values['allow-nonstandard-notes'],
    watch: !values['no-watch'],
  });

  if (result.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          tag: result.payload.tag,
          targets: result.payload.targets,
          bytes: result.bytes,
          enBytes: Buffer.byteLength(result.payload.notes_en, 'utf8'),
          zhBytes: Buffer.byteLength(result.payload.notes_zh, 'utf8'),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (result.runUrl) {
    console.log(`Workflow run: ${result.runUrl}`);
  } else {
    console.log('Dispatched Publish Release workflow.');
    if (!values['no-watch']) {
      console.log('Run `gh run list --workflow publish-release.yml --limit 1` to inspect it.');
    }
  }
}

if ((process.argv[1] ?? '').endsWith('publishRelease.ts')) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
