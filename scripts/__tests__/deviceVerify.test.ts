import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  assertSafeDeviceTarget,
  buildCleanupPlan,
  buildMaestroCommand,
  checkFeatureMap,
  initEvidenceRun,
  isVersionAtLeast,
  redactSecrets,
  renderEvidenceMarkdown,
  runCli,
} from '../deviceVerify';

jest.mock('node:child_process', () => ({ spawnSync: jest.fn() }));

describe('deviceVerify CLI helpers', () => {
  const tempDirs: string[] = [];

  function makeTempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cherry-device-verify-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    jest.mocked(spawnSync).mockReset();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('compares semver strings accurately for agent-device minimum version checks', () => {
    expect(isVersionAtLeast('agent-device 0.21.27', '0.21.27')).toBe(true);
    expect(isVersionAtLeast('0.22.0', '0.21.27')).toBe(true);
    expect(isVersionAtLeast('1.0.0', '0.21.27')).toBe(true);
    expect(isVersionAtLeast('0.21.26', '0.21.27')).toBe(false);
    expect(isVersionAtLeast('unknown', '0.21.27')).toBe(false);
  });

  it('redacts API keys, bearer tokens, and secret assignments before recording evidence', () => {
    const raw =
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload key=sk-1234567890abcdef apiKey=supersecretvalue';
    const redacted = redactSecrets(raw);
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(redacted).not.toContain('sk-1234567890abcdef');
    expect(redacted).not.toContain('supersecretvalue');
    expect(redacted).toContain('[REDACTED_TOKEN]');
    expect(redacted).toContain('[REDACTED_API_KEY]');
    expect(redacted).toContain('[REDACTED]');
  });

  it('requires explicit device and Metro dev-client URL when building Maestro commands', () => {
    expect(() =>
      buildMaestroCommand({
        flowPath: '.maestro/flows/onboarding-skip.yaml',
        platform: 'ios',
        deviceId: '',
        devClientUrl: 'exp+cherry://...',
      }),
    ).toThrow(/--device/);

    expect(() =>
      buildMaestroCommand({
        flowPath: '.maestro/flows/onboarding-skip.yaml',
        platform: 'android',
        deviceId: 'emulator-5554',
        devClientUrl: '',
      }),
    ).toThrow(/--dev-client-url/);

    const built = buildMaestroCommand({
      flowPath: '.maestro/flows/onboarding-skip.yaml',
      platform: 'ios',
      deviceId: 'UDID-123',
      devClientUrl: 'cherrystudio-dev://expo-development-client/?url=http://127.0.0.1:41000',
    });
    expect(built.appId).toBe('com.cherryai.cherrystudio-app.dev');
    expect(built.command).toBe('maestro');
    expect(built.args).toContain('UDID-123');
    expect(built.args).toContain('APP_ID=com.cherryai.cherrystudio-app.dev');
  });

  it('refuses destructive cleanup targeting resident test devices', () => {
    expect(() => assertSafeDeviceTarget('Cherry Test')).toThrow(/resident test device/);
    expect(() => assertSafeDeviceTarget('Cherry_Test')).toThrow(/resident test device/);
    expect(() => assertSafeDeviceTarget('Cherry Temp (ws-1)')).not.toThrow();

    const steps = buildCleanupPlan({
      platform: 'ios',
      workspace: 'rapid-gliding-ember',
      stateDir: '/tmp/state',
      deleteTempDevice: true,
    });
    expect(steps).toHaveLength(2);
    expect(steps[0].args).toContain('--session');
    expect(steps[0].args).toContain('rapid-gliding-ember');
    expect(steps[1].command).toBe('xcrun');
    expect(steps[1].args).toEqual(['simctl', 'delete', 'Cherry Temp (rapid-gliding-ember)']);
  });

  it('creates an inconclusive receipt and renders redacted Markdown summary', () => {
    const root = makeTempDir();
    const run = initEvidenceRun({
      rootDir: root,
      scenario: 'Onboarding Skip',
      platform: 'ios',
      baseline: 'first-run',
      workspace: 'ws-alpha',
      device: 'UDID-1',
      metroPort: 42000,
      runId: 'test-run',
    });

    expect(fs.existsSync(run.receiptPath)).toBe(true);
    expect(fs.existsSync(run.markdownPath)).toBe(true);
    expect(run.receipt.status).toBe('inconclusive');

    const md = renderEvidenceMarkdown({
      ...run.receipt,
      status: 'pass',
      observed: ['Token Bearer secret-token-123456 never leaked'],
      durationsMs: { onboarding: 1240 },
    });
    expect(md).toContain('Status: **pass**');
    expect(md).toContain('[REDACTED_TOKEN]');
    expect(md).not.toContain('secret-token-123456');
    expect(md).toContain('onboarding=1240ms');
  });

  it('validates the receipt before launch and records the actual target on a pass', () => {
    const root = makeTempDir();
    const flow = path.join(root, 'onboarding.yaml');
    fs.writeFileSync(flow, '');
    const run = initEvidenceRun({
      rootDir: root,
      scenario: 'Onboarding',
      platform: 'unknown',
      baseline: 'first-run',
      workspace: 'ws-alpha',
      device: null,
      metroPort: null,
    });
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', CONDUCTOR_WORKSPACE_NAME: 'ws-alpha' };
    const args = [
      'run',
      '--flow',
      flow,
      '--platform',
      'android',
      '--device',
      'emulator-5554',
      '--dev-client-url',
      'cherrystudio-dev://expo-development-client/?url=http://127.0.0.1:42000',
      '--evidence-dir',
    ];
    expect(() => runCli([...args, root], env)).toThrow(/receipt.json/);
    expect(spawnSync).not.toHaveBeenCalled();

    jest.mocked(spawnSync).mockReturnValue({
      status: 0,
      signal: null,
      pid: 1,
      output: [],
      stdout: '',
      stderr: '',
    });
    expect(runCli([...args, run.dir], env)).toBe(0);
    expect(JSON.parse(fs.readFileSync(run.receiptPath, 'utf8'))).toMatchObject({
      status: 'pass',
      platform: 'android',
      device: 'emulator-5554',
      appId: 'com.cherryai.cherrystudio_app.dev',
      metroPort: 42000,
    });
    const otherDeviceArgs = args.map((arg) => (arg === 'emulator-5554' ? 'emulator-5556' : arg));
    expect(() => runCli([...otherDeviceArgs, run.dir], env)).toThrow(/identity/);
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('refuses other workspaces and stops before deleting when close fails', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', CONDUCTOR_WORKSPACE_NAME: 'ws-alpha' };
    const args = ['cleanup', '--platform', 'ios', '--delete-temp-device'];
    expect(() => runCli([...args, '--workspace', 'ws-beta'], env)).toThrow(/current workspace/);
    expect(spawnSync).not.toHaveBeenCalled();

    jest.mocked(spawnSync).mockReturnValue({
      status: 1,
      signal: null,
      pid: 1,
      output: [],
      stdout: '',
      stderr: 'Session close failed',
    });
    expect(runCli(args, env)).toBe(1);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).toHaveBeenCalledWith('agent-device', expect.any(Array), { encoding: 'utf8' });
  });

  it('validates feature map pages, testIDs, Maestro flow paths, and index links', () => {
    const root = makeTempDir();
    fs.mkdirSync(path.join(root, 'src', 'frontend', 'features', 'chat'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src', 'frontend', 'features', 'chat', 'ChatScreen.tsx'),
      "export const a = <View testID=\"chat-send-button\" />; export const b = <View testID={`row-${id}`} />; export const c = <View testID={ok ? 'chat-stop' : 'chat-send'} />;",
      'utf8',
    );
    fs.mkdirSync(path.join(root, '.maestro', 'flows'), { recursive: true });
    fs.writeFileSync(path.join(root, '.maestro', 'flows', 'chat.yaml'), 'appId: test\n', 'utf8');
    fs.mkdirSync(path.join(root, 'docs', 'features'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'docs', 'features', 'README.md'),
      '# Feature Map\n- [Chat](./chat.md)\n',
      'utf8',
    );
    fs.writeFileSync(
      path.join(root, 'docs', 'features', 'chat.md'),
      [
        '# Chat',
        '## User Entry',
        '- Tap `testID:chat-send-button`, `testID:row-42`, or `testID:chat-stop`',
        '## Verification Driver',
        '- `.maestro/flows/chat.yaml`',
        '## Observable Acceptance',
        '- Reply streams cleanly.',
        '## Known Pitfalls',
        '- Keyboard overlap.',
      ].join('\n'),
      'utf8',
    );

    const passing = checkFeatureMap(root);
    expect(passing.issues).toEqual([]);
    expect(passing.checkedPages).toBe(1);
    expect(passing.checkedTestIds).toBe(3);
    expect(passing.checkedFlows).toBe(1);

    // Introduce drift: stale testID, missing flow, missing section, unindexed file.
    fs.writeFileSync(
      path.join(root, 'docs', 'features', 'broken.md'),
      '# Broken\n## User Entry\n- `testID:does-not-exist`\n- `.maestro/flows/missing.yaml`\n',
      'utf8',
    );
    const failing = checkFeatureMap(root);
    expect(failing.issues.map((i) => i.kind)).toEqual(
      expect.arrayContaining([
        'unindexed-page',
        'missing-section',
        'missing-testid',
        'missing-flow',
      ]),
    );
  });
});
