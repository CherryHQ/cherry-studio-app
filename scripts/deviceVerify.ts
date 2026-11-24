import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type MobilePlatform = 'ios' | 'android';
export type VerificationStatus = 'pass' | 'fail' | 'inconclusive';

export interface EvidenceReceipt {
  runId: string;
  scenario: string;
  status: VerificationStatus;
  baseline: 'first-run' | 'configured';
  platform: MobilePlatform | 'unknown';
  workspace: string;
  device: string | null;
  appId: string | null;
  artifactIdentity: string | null;
  metroPort: number | null;
  createdAt: string;
  expected: string[];
  observed: string[];
  blockers: string[];
  artifacts: string[];
  durationsMs: Record<string, number>;
}

export interface FeatureMapIssue {
  file: string;
  kind:
    | 'missing-section'
    | 'missing-testid'
    | 'missing-flow'
    | 'missing-maestro-testid'
    | 'unindexed-page';
  detail: string;
}

export interface FeatureMapCheckResult {
  checkedPages: number;
  checkedTestIds: number;
  checkedFlows: number;
  checkedMaestroIds: number;
  issues: FeatureMapIssue[];
}

export interface CleanupStep {
  label: string;
  command: string;
  args: string[];
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  nextStep?: string;
}

export const MIN_AGENT_DEVICE_VERSION = '0.21.27';
export const DEV_APP_IDS: Record<MobilePlatform, string> = {
  ios: 'com.cherryai.cherrystudio-app.dev',
  android: 'com.cherryai.cherrystudio_app.dev',
};

const RESIDENT_DEVICE_NAMES = new Set(['Cherry Test', 'Cherry_Test']);
const REQUIRED_FEATURE_SECTIONS = [
  '## User Entry',
  '## Verification Driver',
  '## Observable Acceptance',
  '## Known Pitfalls',
] as const;

const ROOT = path.resolve(__dirname, '..');

export function parseSemver(raw: string): [number, number, number] | null {
  const match = raw.match(/(\d+)\.(\d+)\.(\d+)/u);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isVersionAtLeast(actual: string, minimum: string): boolean {
  const a = parseSemver(actual);
  const b = parseSemver(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

/** Strips credential-like tokens before writing receipts or PR evidence snippets. */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/gu, '[REDACTED_API_KEY]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/giu, '$1[REDACTED_TOKEN]')
    .replace(
      /((?:api[_-]?key|token|secret|password)\s*[=:]\s*['"]?)([^'"\s&]{6,})/giu,
      '$1[REDACTED]',
    );
}

export function getWorkspaceSessionName(workspace: string, platform: MobilePlatform): string {
  return platform === 'android' ? `${workspace}-android` : workspace;
}

export function getTempDeviceName(workspace: string, platform: MobilePlatform): string {
  return platform === 'ios' ? `Cherry Temp (${workspace})` : `Cherry_Temp_${workspace}`;
}

export function assertSafeDeviceTarget(deviceName: string): void {
  const trimmed = deviceName.trim();
  if (!trimmed) {
    throw new Error('Device target must be non-empty.');
  }
  if (RESIDENT_DEVICE_NAMES.has(trimmed)) {
    throw new Error(
      `Refusing destructive action against resident test device "${trimmed}". Only workspace temporary devices may be deleted.`,
    );
  }
}

export function buildMaestroCommand(options: {
  flowPath: string;
  platform: MobilePlatform;
  deviceId: string;
  devClientUrl: string;
}): { command: string; args: string[]; appId: string } {
  const deviceId = options.deviceId.trim();
  const devClientUrl = options.devClientUrl.trim();
  if (!deviceId) {
    throw new Error('Explicit --device <UDID|serial> is required; never guess the first device.');
  }
  if (!devClientUrl) {
    throw new Error(
      'Explicit --dev-client-url <url> from this workspace Metro process is required.',
    );
  }
  const appId = DEV_APP_IDS[options.platform];
  return {
    command: 'maestro',
    args: [
      '--device',
      deviceId,
      'test',
      '-e',
      `APP_ID=${appId}`,
      '-e',
      `DEV_CLIENT_URL=${devClientUrl}`,
      options.flowPath,
    ],
    appId,
  };
}

export function buildCleanupPlan(options: {
  platform: MobilePlatform;
  workspace: string;
  stateDir: string;
  deleteTempDevice: boolean;
}): CleanupStep[] {
  const workspace = options.workspace.trim();
  if (!workspace) {
    throw new Error(
      'Workspace name is required for cleanup (--workspace or CONDUCTOR_WORKSPACE_NAME).',
    );
  }
  const session = getWorkspaceSessionName(workspace, options.platform);
  const steps: CleanupStep[] = [
    {
      label: `Close agent-device session "${session}"`,
      command: 'agent-device',
      args: [
        'close',
        '--state-dir',
        options.stateDir,
        '--session',
        session,
        '--platform',
        options.platform,
        '--shutdown',
      ],
    },
  ];

  if (options.deleteTempDevice) {
    const tempDevice = getTempDeviceName(workspace, options.platform);
    assertSafeDeviceTarget(tempDevice);
    if (options.platform === 'ios') {
      steps.push({
        label: `Delete temporary iOS simulator "${tempDevice}"`,
        command: 'xcrun',
        args: ['simctl', 'delete', tempDevice],
      });
    } else {
      steps.push({
        label: `Delete temporary Android AVD "${tempDevice}"`,
        command: 'avdmanager',
        args: ['delete', 'avd', '-n', tempDevice],
      });
    }
  }

  return steps;
}

export function initEvidenceRun(options: {
  rootDir: string;
  scenario: string;
  platform: MobilePlatform | 'unknown';
  baseline: 'first-run' | 'configured';
  workspace: string;
  device: string | null;
  metroPort: number | null;
  runId?: string;
}): { dir: string; receiptPath: string; markdownPath: string; receipt: EvidenceReceipt } {
  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const slug = options.scenario
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
  const runId = options.runId ?? `${timestamp}-${slug || 'scenario'}`;
  const dir = path.join(options.rootDir, '.context', 'agent-self-testing', runId);
  fs.mkdirSync(dir, { recursive: true });

  const receipt: EvidenceReceipt = {
    runId,
    scenario: options.scenario,
    status: 'inconclusive',
    baseline: options.baseline,
    platform: options.platform,
    workspace: options.workspace,
    device: options.device,
    appId: options.platform === 'unknown' ? null : DEV_APP_IDS[options.platform],
    artifactIdentity: null,
    metroPort: options.metroPort,
    createdAt: new Date().toISOString(),
    expected: [],
    observed: [],
    blockers: [],
    artifacts: [],
    durationsMs: {},
  };

  const receiptPath = path.join(dir, 'receipt.json');
  const markdownPath = path.join(dir, 'evidence.md');
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderEvidenceMarkdown(receipt), 'utf8');
  return { dir, receiptPath, markdownPath, receipt };
}

export function renderEvidenceMarkdown(receipt: EvidenceReceipt): string {
  const lines = [
    `### Verification Evidence: ${receipt.scenario}`,
    '',
    `- Status: **${receipt.status}**`,
    `- Baseline: \`${receipt.baseline}\` | Platform: \`${receipt.platform}\` | Workspace: \`${receipt.workspace}\``,
    `- Device: \`${receipt.device ?? 'unassigned'}\` | App: \`${receipt.appId ?? 'n/a'}\` | Metro port: \`${receipt.metroPort ?? 'n/a'}\``,
  ];

  if (receipt.expected.length > 0) {
    lines.push('- Expected:');
    for (const item of receipt.expected) lines.push(`  - ${redactSecrets(item)}`);
  }
  if (receipt.observed.length > 0) {
    lines.push('- Observed:');
    for (const item of receipt.observed) lines.push(`  - ${redactSecrets(item)}`);
  }
  if (receipt.blockers.length > 0) {
    lines.push('- Blockers / omissions:');
    for (const item of receipt.blockers) lines.push(`  - ${redactSecrets(item)}`);
  }
  if (receipt.artifacts.length > 0) {
    lines.push('- Artifacts:');
    for (const item of receipt.artifacts) lines.push(`  - \`${item}\``);
  }
  const durationEntries = Object.entries(receipt.durationsMs);
  if (durationEntries.length > 0) {
    lines.push(`- Durations: ${durationEntries.map(([key, ms]) => `${key}=${ms}ms`).join(', ')}`);
  }

  return `${lines.join('\n')}\n`;
}

function collectSourceTestIds(rootDir: string): Set<string> {
  const ids = new Set<string>();
  const roots = [
    path.join(rootDir, 'src', 'frontend'),
    path.join(rootDir, 'packages', 'ui', 'src'),
  ];

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(ts|tsx)$/u.test(entry.name) && !/\.test\.(ts|tsx)$/u.test(entry.name)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const addToken = (raw: string) => {
          const prefix = raw.includes('${') ? raw.slice(0, raw.indexOf('${')) : raw;
          if (prefix) ids.add(prefix);
        };
        for (const match of content.matchAll(
          /\btestID\s*(?:=|:)\s*(?:\{\s*)?['"`]([A-Za-z0-9_.:/${}-]+)['"`]/gu,
        )) {
          addToken(match[1]);
        }
        // Also extract string literals inside JSX expressions such as `testID={cond ? 'a' : 'b'}`.
        for (const exprMatch of content.matchAll(/\btestID\s*=\s*\{([^}\n]+)\}/gu)) {
          for (const literalMatch of exprMatch[1].matchAll(/['"`]([A-Za-z0-9_.:/${}-]+)['"`]/gu)) {
            addToken(literalMatch[1]);
          }
        }
      }
    }
  };

  for (const dir of roots) walk(dir);
  return ids;
}

export function checkFeatureMap(
  rootDir: string,
  featureDirRelative = path.join('docs', 'features'),
): FeatureMapCheckResult {
  const featureDir = path.join(rootDir, featureDirRelative);
  if (!fs.existsSync(featureDir)) {
    return {
      checkedPages: 0,
      checkedTestIds: 0,
      checkedFlows: 0,
      checkedMaestroIds: 0,
      issues: [
        {
          file: featureDirRelative,
          kind: 'missing-section',
          detail: `Feature map directory "${featureDirRelative}" does not exist.`,
        },
      ],
    };
  }

  const indexPath = path.join(featureDir, 'README.md');
  const indexContent = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
  const sourceTestIds = collectSourceTestIds(rootDir);
  const hasSourceTestId = (testId: string) =>
    sourceTestIds.has(testId) ||
    [...sourceTestIds].some((prefix) => prefix.endsWith('-') && testId.startsWith(prefix));
  const entries = fs
    .readdirSync(featureDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map((entry) => entry.name)
    .sort();

  const issues: FeatureMapIssue[] = [];
  let checkedTestIds = 0;
  let checkedFlows = 0;
  let checkedMaestroIds = 0;

  if (!fs.existsSync(indexPath)) {
    issues.push({
      file: path.join(featureDirRelative, 'README.md'),
      kind: 'missing-section',
      detail: 'Feature map index README.md is missing.',
    });
  }

  for (const name of entries) {
    const relFile = path.join(featureDirRelative, name);
    const content = fs.readFileSync(path.join(featureDir, name), 'utf8');

    if (
      indexContent &&
      !indexContent.includes(`./${name}`) &&
      !indexContent.includes(`(${name})`)
    ) {
      issues.push({
        file: relFile,
        kind: 'unindexed-page',
        detail: `Feature page "${name}" is not linked from ${path.join(featureDirRelative, 'README.md')}.`,
      });
    }

    for (const heading of REQUIRED_FEATURE_SECTIONS) {
      if (!content.includes(heading)) {
        issues.push({
          file: relFile,
          kind: 'missing-section',
          detail: `Missing required heading "${heading}".`,
        });
      }
    }

    for (const match of content.matchAll(/`testID:([A-Za-z0-9_.:-]+)`/gu)) {
      const testId = match[1];
      checkedTestIds += 1;
      if (!hasSourceTestId(testId)) {
        issues.push({
          file: relFile,
          kind: 'missing-testid',
          detail: `Referenced testID "${testId}" was not found in src/frontend/ or packages/ui/src/.`,
        });
      }
    }

    for (const match of content.matchAll(/`(\.maestro\/flows\/[A-Za-z0-9._-]+\.yaml)`/gu)) {
      const flowRel = match[1];
      checkedFlows += 1;
      if (!fs.existsSync(path.join(rootDir, flowRel))) {
        issues.push({
          file: relFile,
          kind: 'missing-flow',
          detail: `Referenced Maestro flow "${flowRel}" does not exist.`,
        });
      }
    }
  }

  // Also guard every selector id inside .maestro/flows/*.yaml against source testIDs so Maestro
  // regression scripts cannot silently drift from UI changes.
  const maestroFlowsDir = path.join(rootDir, '.maestro', 'flows');
  if (fs.existsSync(maestroFlowsDir)) {
    const flowFiles = fs
      .readdirSync(maestroFlowsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
      .map((entry) => entry.name)
      .sort();
    for (const flowFile of flowFiles) {
      const relFlow = path.join('.maestro', 'flows', flowFile);
      const flowContent = fs.readFileSync(path.join(maestroFlowsDir, flowFile), 'utf8');
      for (const match of flowContent.matchAll(
        /^\s*-?\s*id:\s*['"]?([A-Za-z0-9_.:-]+)['"]?\s*$/gmu,
      )) {
        const selectorId = match[1];
        checkedMaestroIds += 1;
        if (!hasSourceTestId(selectorId)) {
          issues.push({
            file: relFlow,
            kind: 'missing-maestro-testid',
            detail: `Maestro selector id "${selectorId}" was not found in src/frontend/ or packages/ui/src/.`,
          });
        }
      }
    }
  }

  return {
    checkedPages: entries.length,
    checkedTestIds,
    checkedFlows,
    checkedMaestroIds,
    issues,
  };
}

function probeCommand(command: string, args: string[], timeout = 5_000) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  return {
    ok: result.status === 0,
    output,
    errorCode: (result.error as NodeJS.ErrnoException | undefined)?.code,
  };
}

function runDoctor(platform: MobilePlatform | null, env: NodeJS.ProcessEnv): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  const agentDevice = probeCommand('agent-device', ['--version']);
  const agentDeviceOk =
    agentDevice.ok && isVersionAtLeast(agentDevice.output, MIN_AGENT_DEVICE_VERSION);
  checks.push({
    name: 'agent-device',
    ok: agentDeviceOk,
    detail: agentDevice.ok
      ? `installed (${agentDevice.output.split('\n')[0]})`
      : 'not found on PATH',
    ...(agentDeviceOk
      ? {}
      : { nextStep: `Install or upgrade agent-device >= ${MIN_AGENT_DEVICE_VERSION}.` }),
  });

  // Starting the JVM can take longer than probing the native host tools.
  const maestro = probeCommand('maestro', ['--version'], 15_000);
  const maestroMissing = maestro.errorCode === 'ENOENT';
  const maestroFailure = maestroMissing
    ? 'not found on PATH'
    : maestro.errorCode === 'ETIMEDOUT'
      ? 'version check timed out'
      : 'version check failed';
  checks.push({
    name: 'maestro',
    ok: maestro.ok,
    detail: maestro.ok ? `installed (${maestro.output.split('\n')[0]})` : maestroFailure,
    ...(maestro.ok
      ? {}
      : {
          nextStep: maestroMissing
            ? 'Install Maestro CLI to run .maestro/flows.'
            : 'Run maestro --version to diagnose the startup failure.',
        }),
  });

  if (!platform || platform === 'ios') {
    const simctl = probeCommand('xcrun', ['simctl', 'help']);
    checks.push({
      name: 'ios-simctl',
      ok: simctl.ok,
      detail: simctl.ok ? 'xcrun simctl available' : 'xcrun simctl unavailable',
      ...(simctl.ok ? {} : { nextStep: 'Install Xcode command line tools for iOS Simulator.' }),
    });
  }

  if (!platform || platform === 'android') {
    const adb = probeCommand('adb', ['version']);
    checks.push({
      name: 'android-adb',
      ok: adb.ok,
      detail: adb.ok ? adb.output.split('\n')[0] : 'adb not found on PATH',
      ...(adb.ok ? {} : { nextStep: 'Install Android platform-tools and add adb to PATH.' }),
    });
  }

  const stateDir = env.AGENT_DEVICE_STATE_DIR ?? path.join(ROOT, '.context', 'agent-device');
  checks.push({
    name: 'agent-device-state-dir',
    ok: stateDir.startsWith(ROOT),
    detail: stateDir,
    ...(stateDir.startsWith(ROOT)
      ? {}
      : {
          nextStep: `export AGENT_DEVICE_STATE_DIR="${path.join(ROOT, '.context', 'agent-device')}"`,
        }),
  });

  const conductorPort = env.CONDUCTOR_PORT ? Number(env.CONDUCTOR_PORT) : null;
  checks.push({
    name: 'conductor-port',
    ok: conductorPort !== null && Number.isInteger(conductorPort) && conductorPort > 0,
    detail: conductorPort ? `${conductorPort}..${conductorPort + 9}` : 'CONDUCTOR_PORT unset',
    ...(conductorPort
      ? {}
      : {
          nextStep:
            'In Conductor workspaces, use CONDUCTOR_PORT for Metro instead of fixed ports 8081/8084.',
        }),
  });

  const devClientsDir = env.CONDUCTOR_ROOT_PATH
    ? path.join(env.CONDUCTOR_ROOT_PATH, '.local', 'dev-clients')
    : null;
  const cachedClients =
    devClientsDir && fs.existsSync(devClientsDir)
      ? fs.readdirSync(devClientsDir).filter((file) => /\.(tar\.gz|apk)$/u.test(file))
      : [];
  checks.push({
    name: 'dev-client-cache',
    ok: cachedClients.length > 0,
    detail: devClientsDir
      ? `${devClientsDir} (${cachedClients.length} artifact(s))`
      : 'CONDUCTOR_ROOT_PATH unset',
    ...(cachedClients.length > 0
      ? {}
      : {
          nextStep:
            'Build or reuse a fingerprint-matched dev client per docs/guides/parallel-device-testing.md.',
        }),
  });

  return checks;
}

function parseFlags(argv: string[]): {
  positional: string[];
  flags: Record<string, string | boolean>;
} {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }

  return { positional, flags };
}

function printOutput(json: boolean, payload: unknown, lines: string[]): void {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    for (const line of lines) console.log(line);
  }
}

function printUsage(): void {
  console.log(
    [
      'Usage: pnpm verify:device <subcommand> [options]',
      '',
      'Subcommands:',
      '  doctor     [--platform ios|android] [--json]',
      '  evidence   init --scenario <name> [--platform ios|android] [--device <id>] [--baseline first-run|configured] [--json]',
      '  evidence   summary --dir <path> [--json]',
      '  run        --flow <path> --platform ios|android --device <id> --dev-client-url <url> [--evidence-dir <dir>] [--dry-run] [--json]',
      '  cleanup    --platform ios|android [--workspace <name>] [--delete-temp-device] [--dry-run] [--json]',
      '  check-map  [--dir docs/features] [--json]',
    ].join('\n'),
  );
}

function openRunEvidence(
  dir: string,
  target: Pick<EvidenceReceipt, 'workspace' | 'device' | 'platform' | 'appId' | 'metroPort'>,
) {
  const receiptPath = path.join(dir, 'receipt.json');
  if (!fs.existsSync(receiptPath)) {
    throw new Error('Expected --evidence-dir to contain a receipt.json created by evidence init.');
  }
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as EvidenceReceipt;
  if (
    receipt.workspace !== target.workspace ||
    (receipt.platform !== 'unknown' && receipt.platform !== target.platform) ||
    (receipt.device !== null && receipt.device !== target.device) ||
    (receipt.appId !== null && receipt.appId !== target.appId) ||
    (receipt.metroPort !== null && receipt.metroPort !== target.metroPort)
  ) {
    throw new Error(
      'Evidence receipt identity does not match the requested workspace and device run.',
    );
  }
  return { receiptPath, receipt: { ...receipt, ...target } };
}

export function runCli(argv: string[], env: NodeJS.ProcessEnv = process.env): number {
  const { positional, flags } = parseFlags(argv);
  const [subcommand, subAction] = positional;
  const json = flags.json === true;
  const currentWorkspace = env.CONDUCTOR_WORKSPACE_NAME?.trim() || path.basename(ROOT);

  if (!subcommand || flags.help === true) {
    printUsage();
    return 0;
  }

  if (subcommand === 'doctor') {
    const platform =
      flags.platform === 'ios' || flags.platform === 'android' ? flags.platform : null;
    const checks = runDoctor(platform, env);
    const allOk = checks.every((c) => c.ok);
    printOutput(
      json,
      { ok: allOk, checks },
      checks.map(
        (c) =>
          `${c.ok ? 'OK  ' : 'MISS'} ${c.name}: ${c.detail}${c.nextStep ? ` -> ${c.nextStep}` : ''}`,
      ),
    );
    return 0;
  }

  if (subcommand === 'check-map') {
    const dir = typeof flags.dir === 'string' ? flags.dir : path.join('docs', 'features');
    const result = checkFeatureMap(ROOT, dir);
    const ok = result.issues.length === 0;
    printOutput(
      json,
      { ok, ...result },
      ok
        ? [
            `Feature map check passed (${result.checkedPages} pages, ${result.checkedTestIds} testIDs, ${result.checkedFlows} Maestro flows, ${result.checkedMaestroIds} Maestro selectors).`,
          ]
        : [
            `Feature map check failed with ${result.issues.length} issue(s):`,
            ...result.issues.map((issue) => `  - [${issue.kind}] ${issue.file}: ${issue.detail}`),
          ],
    );
    return ok ? 0 : 1;
  }

  if (subcommand === 'evidence') {
    if (subAction === 'init') {
      const scenario = typeof flags.scenario === 'string' ? flags.scenario : '';
      if (!scenario) {
        console.error('Missing required --scenario <name>.');
        return 1;
      }
      const platform =
        flags.platform === 'ios' || flags.platform === 'android' ? flags.platform : 'unknown';
      const baseline = flags.baseline === 'configured' ? 'configured' : 'first-run';
      const workspace =
        typeof flags.workspace === 'string' ? flags.workspace.trim() : currentWorkspace;
      const device = typeof flags.device === 'string' ? flags.device : null;
      const metroPort = env.CONDUCTOR_PORT ? Number(env.CONDUCTOR_PORT) : null;
      const created = initEvidenceRun({
        rootDir: ROOT,
        scenario,
        platform,
        baseline,
        workspace,
        device,
        metroPort,
      });
      printOutput(json, created, [
        `Initialized evidence bundle: ${path.relative(ROOT, created.dir)}`,
        `  receipt:  ${path.relative(ROOT, created.receiptPath)}`,
        `  markdown: ${path.relative(ROOT, created.markdownPath)}`,
      ]);
      return 0;
    }

    if (subAction === 'summary') {
      const dir = typeof flags.dir === 'string' ? path.resolve(ROOT, flags.dir) : '';
      const receiptPath = path.join(dir, 'receipt.json');
      if (!dir || !fs.existsSync(receiptPath)) {
        console.error('Missing valid --dir <evidence-dir> containing receipt.json.');
        return 1;
      }
      const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as EvidenceReceipt;
      const markdown = renderEvidenceMarkdown(receipt);
      fs.writeFileSync(path.join(dir, 'evidence.md'), markdown, 'utf8');
      printOutput(json, { receipt, markdown }, [markdown.trimEnd()]);
      return 0;
    }

    console.error('Expected `evidence init` or `evidence summary`.');
    return 1;
  }

  if (subcommand === 'run') {
    const flowPath = typeof flags.flow === 'string' ? flags.flow : '';
    const platform =
      flags.platform === 'ios' || flags.platform === 'android' ? flags.platform : null;
    const deviceId = typeof flags.device === 'string' ? flags.device.trim() : '';
    const devClientUrl =
      typeof flags['dev-client-url'] === 'string' ? flags['dev-client-url'].trim() : '';
    const dryRun = flags['dry-run'] === true;

    if (!flowPath || !platform) {
      console.error(
        'Required: --flow <path> --platform ios|android --device <id> --dev-client-url <url>.',
      );
      return 1;
    }
    const resolvedFlow = path.resolve(ROOT, flowPath);
    if (!fs.existsSync(resolvedFlow)) {
      console.error(`Flow file not found: ${flowPath}`);
      return 1;
    }

    const built = buildMaestroCommand({
      flowPath: resolvedFlow,
      platform,
      deviceId,
      devClientUrl,
    });

    if (flags['evidence-dir'] === true) {
      throw new Error('Expected a directory after --evidence-dir.');
    }
    const evidenceDir =
      typeof flags['evidence-dir'] === 'string' ? path.resolve(ROOT, flags['evidence-dir']) : null;
    let evidence: ReturnType<typeof openRunEvidence> | undefined;
    if (evidenceDir) {
      const launchUrl = new URL(devClientUrl);
      const bundleUrl =
        launchUrl.searchParams.get('__expo_url') ?? launchUrl.searchParams.get('url');
      const { port } = bundleUrl ? new URL(bundleUrl) : launchUrl;
      evidence = openRunEvidence(evidenceDir, {
        workspace: currentWorkspace,
        device: deviceId,
        platform,
        appId: built.appId,
        metroPort: port ? Number(port) : null,
      });
    }

    if (dryRun) {
      printOutput(json, { dryRun: true, ...built }, [
        `[dry-run] ${built.command} ${built.args.join(' ')}`,
      ]);
      return 0;
    }

    const startedAt = Date.now();
    const execution = spawnSync(built.command, built.args, { encoding: 'utf8' });
    const durationMs = Date.now() - startedAt;
    const isMissingBinary =
      execution.error && (execution.error as NodeJS.ErrnoException).code === 'ENOENT';
    const status: VerificationStatus = isMissingBinary
      ? 'inconclusive'
      : execution.status === 0
        ? 'pass'
        : 'fail';

    const payload = {
      status,
      durationMs,
      exitCode: execution.status,
      blocker: isMissingBinary ? 'maestro CLI not found on PATH' : null,
      stdout: redactSecrets(execution.stdout ?? ''),
      stderr: redactSecrets(execution.stderr ?? ''),
    };

    if (evidence && evidenceDir) {
      const { receipt, receiptPath } = evidence;
      const logPath = path.join(evidenceDir, `${path.basename(flowPath, '.yaml')}.log`);
      fs.writeFileSync(
        logPath,
        `${payload.stdout}\n${payload.stderr ? `--- STDERR ---\n${payload.stderr}\n` : ''}`,
        'utf8',
      );
      receipt.status = status;
      receipt.durationsMs[path.basename(flowPath)] = durationMs;
      receipt.artifacts.push(path.relative(ROOT, logPath));
      if (payload.blocker) receipt.blockers.push(payload.blocker);
      fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
      fs.writeFileSync(
        path.join(evidenceDir, 'evidence.md'),
        renderEvidenceMarkdown(receipt),
        'utf8',
      );
    }

    printOutput(json, payload, [
      `Maestro ${path.basename(flowPath)}: ${status} (${durationMs}ms)`,
      ...(payload.blocker ? [`Blocker: ${payload.blocker}`] : []),
    ]);
    return status === 'pass' ? 0 : 1;
  }

  if (subcommand === 'cleanup') {
    const platform =
      flags.platform === 'ios' || flags.platform === 'android' ? flags.platform : null;
    if (!platform) {
      console.error('Required: --platform ios|android.');
      return 1;
    }
    if (flags.workspace !== undefined && flags.workspace !== currentWorkspace) {
      throw new Error(`Cleanup can only target the current workspace (${currentWorkspace}).`);
    }
    const stateDir = env.AGENT_DEVICE_STATE_DIR ?? path.join(ROOT, '.context', 'agent-device');
    const deleteTempDevice = flags['delete-temp-device'] === true;
    const dryRun = flags['dry-run'] === true;

    const steps = buildCleanupPlan({
      platform,
      workspace: currentWorkspace,
      stateDir,
      deleteTempDevice,
    });
    if (dryRun) {
      printOutput(json, { dryRun: true, steps }, [
        ...steps.map((step) => `[dry-run] ${step.label}: ${step.command} ${step.args.join(' ')}`),
      ]);
      return 0;
    }

    const results: { label: string; ok: boolean; output: string }[] = [];
    for (const step of steps) {
      const res = spawnSync(step.command, step.args, { encoding: 'utf8' });
      const ok = res.status === 0;
      results.push({
        label: step.label,
        ok,
        output: redactSecrets(`${res.stdout ?? ''}\n${res.stderr ?? ''}`.trim()),
      });
      if (!ok) break;
    }
    const allOk = results.every((r) => r.ok);
    printOutput(
      json,
      { ok: allOk, results },
      results.map((r) => `${r.ok ? 'OK  ' : 'FAIL'} ${r.label}${r.output ? `: ${r.output}` : ''}`),
    );
    return allOk ? 0 : 1;
  }

  console.error(`Unknown subcommand "${subcommand}".`);
  printUsage();
  return 1;
}

if (require.main === module) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
