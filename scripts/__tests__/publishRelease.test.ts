import {
  buildPublishReleaseDispatchPayload,
  dispatchPublishRelease,
  MAX_DISPATCH_PAYLOAD_BYTES,
  validateReleaseNotesDocument,
  type ExecCommand,
} from '../publishRelease';

const VALID_EN = `# Cherry Studio 0.7.0

## Features

- [Chat] Added inline reply preview.

## Download and Installation

- Download \`cherry-studio-0.7.0-android.apk\`.
`;

const VALID_ZH = `# Cherry Studio 0.7.0

## 功能

- [对话] 新增内联回复预览。

## 下载安装

- 下载附件 \`cherry-studio-0.7.0-android.apk\`。
`;

describe('validateReleaseNotesDocument', () => {
  it('accepts valid English and Chinese release notes matching app update markers', () => {
    expect(validateReleaseNotesDocument(VALID_EN, 'en')).toEqual([]);
    expect(validateReleaseNotesDocument(VALID_ZH, 'zh-CN')).toEqual([]);
  });

  it('rejects empty notes, missing title heading, missing download heading, and empty update body', () => {
    expect(validateReleaseNotesDocument('   ', 'en')).toEqual(['en release notes are empty.']);
    expect(
      validateReleaseNotesDocument('No heading\n\n## Download and Installation\n- APK', 'en'),
    ).toContain(
      'en release notes must start with a top-level title heading (e.g. "# Cherry Studio 0.7.0").',
    );
    expect(
      validateReleaseNotesDocument('# Cherry Studio 0.7.0\n\n- Fixed bug.\n', 'zh-CN'),
    ).toContain('zh-CN release notes must include "## 下载安装".');
    expect(
      validateReleaseNotesDocument(
        '# Cherry Studio 0.7.0\n\n## Download and Installation\n\n- APK\n',
        'en',
      ),
    ).toContain(
      'en release notes have no user-facing body before the download section for the in-app update dialog.',
    );
  });
});

describe('buildPublishReleaseDispatchPayload', () => {
  it('builds payloads for both, github-only, and gitcode-only targets with CRLF normalization', () => {
    const both = buildPublishReleaseDispatchPayload({
      tag: 'v0.7.0',
      targets: 'both',
      notesEn: VALID_EN.replace(/\n/g, '\r\n'),
      notesZh: VALID_ZH,
    });
    expect(both).toEqual({
      tag: 'v0.7.0',
      targets: 'both',
      notes_en: VALID_EN,
      notes_zh: VALID_ZH,
    });

    expect(
      buildPublishReleaseDispatchPayload({
        tag: 'v0.7.0-rc.1',
        targets: 'github',
        notesEn: VALID_EN,
      }),
    ).toEqual({
      tag: 'v0.7.0-rc.1',
      targets: 'github',
      notes_en: VALID_EN,
      notes_zh: '',
    });

    expect(
      buildPublishReleaseDispatchPayload({
        tag: 'v0.7.0',
        targets: 'gitcode',
        notesZh: VALID_ZH,
      }),
    ).toEqual({
      tag: 'v0.7.0',
      targets: 'gitcode',
      notes_en: '',
      notes_zh: VALID_ZH,
    });
  });

  it('rejects invalid tags, missing required notes, nonstandard notes unless allowed, and oversized payloads', () => {
    expect(() =>
      buildPublishReleaseDispatchPayload({
        tag: '0.7.0',
        notesEn: VALID_EN,
        notesZh: VALID_ZH,
      }),
    ).toThrow('Invalid release tag');

    expect(() =>
      buildPublishReleaseDispatchPayload({
        tag: 'v0.7.0',
        targets: 'both',
        notesEn: VALID_EN,
      }),
    ).toThrow('--zh-notes');

    expect(() =>
      buildPublishReleaseDispatchPayload({
        tag: 'v0.7.0',
        targets: 'github',
        notesEn: 'Plain notes without required headings',
      }),
    ).toThrow('Download and Installation');

    expect(
      buildPublishReleaseDispatchPayload({
        tag: 'v0.7.0',
        targets: 'github',
        notesEn: 'Plain notes without required headings',
        allowNonstandardNotes: true,
      }).notes_en,
    ).toBe('Plain notes without required headings\n');

    const oversized = `# Cherry Studio 0.7.0\n\n${'a'.repeat(MAX_DISPATCH_PAYLOAD_BYTES)}\n\n## Download and Installation\n`;
    expect(() =>
      buildPublishReleaseDispatchPayload({
        tag: 'v0.7.0',
        targets: 'github',
        notesEn: oversized,
      }),
    ).toThrow(`${MAX_DISPATCH_PAYLOAD_BYTES}-byte limit`);
  });
});

describe('dispatchPublishRelease', () => {
  it('returns validated payload on dryRun without calling gh', () => {
    const execCommand = jest.fn();
    const result = dispatchPublishRelease({
      tag: 'v0.7.0',
      notesEn: VALID_EN,
      notesZh: VALID_ZH,
      dryRun: true,
      execCommand,
    });

    expect(result.dryRun).toBe(true);
    expect(result.watched).toBe(false);
    expect(result.bytes).toBeGreaterThan(0);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('pipes JSON via stdin to gh workflow run and watches the resulting run by default', () => {
    const calls: { command: string; args: string[]; input?: string }[] = [];
    const execCommand: ExecCommand = jest.fn((command, args, options) => {
      calls.push({ command, args, input: options?.input });
      if (args[0] === 'workflow') {
        return {
          stdout: 'https://github.com/CherryHQ/cherry-studio-app/actions/runs/987654321\n',
          stderr: '',
          status: 0,
        };
      }
      return { stdout: '', stderr: '', status: 0 };
    });

    const result = dispatchPublishRelease({
      tag: 'v0.7.0',
      notesEn: VALID_EN,
      notesZh: VALID_ZH,
      repo: 'CherryHQ/cherry-studio-app',
      execCommand,
    });

    expect(result.dryRun).toBe(false);
    expect(result.runId).toBe('987654321');
    expect(result.runUrl).toBe(
      'https://github.com/CherryHQ/cherry-studio-app/actions/runs/987654321',
    );
    expect(result.watched).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.args).toEqual([
      'workflow',
      'run',
      'publish-release.yml',
      '--ref',
      'main',
      '--repo',
      'CherryHQ/cherry-studio-app',
      '--json',
    ]);
    expect(JSON.parse(calls[0]!.input!)).toEqual({
      tag: 'v0.7.0',
      targets: 'both',
      notes_en: VALID_EN,
      notes_zh: VALID_ZH,
    });
    expect(calls[1]?.args).toEqual([
      'run',
      'watch',
      '987654321',
      '--repo',
      'CherryHQ/cherry-studio-app',
      '--exit-status',
    ]);
  });

  it('skips watching when watch is false or no run URL is returned, and throws on gh failure', () => {
    const noWatchExec: ExecCommand = jest.fn(() => ({
      stdout: 'https://github.com/CherryHQ/cherry-studio-app/actions/runs/111222\n',
      stderr: '',
      status: 0,
    }));
    const noWatch = dispatchPublishRelease({
      tag: 'v0.7.0',
      notesEn: VALID_EN,
      notesZh: VALID_ZH,
      watch: false,
      execCommand: noWatchExec,
    });
    expect(noWatch.watched).toBe(false);
    expect(noWatchExec).toHaveBeenCalledTimes(1);

    const failExec: ExecCommand = jest.fn(() => ({
      stdout: '',
      stderr: 'HTTP 422: tag missing',
      status: 1,
    }));
    expect(() =>
      dispatchPublishRelease({
        tag: 'v0.7.0',
        notesEn: VALID_EN,
        notesZh: VALID_ZH,
        execCommand: failExec,
      }),
    ).toThrow('HTTP 422: tag missing');
  });
});
