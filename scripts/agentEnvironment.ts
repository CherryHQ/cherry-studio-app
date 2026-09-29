import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { context } from './agentEnvironment/host';
import { baseline, build, fingerprint } from './agentEnvironment/native';
import {
  adopt,
  inventory,
  prepare,
  provision,
  reconcile,
  registerWorkspace,
  release,
  start,
} from './agentEnvironment/pool';
import { PlatformSchema, readState, saveState } from './agentEnvironment/state';

const HELP = `Agent self-test environments (local macOS)

  status                              Read worktrees, devices and persistent resource records
  reconcile [--dry-run]               Reclaim only proven retired, registered resources
  adopt --platform ios|android --device <stable-id> --role primary|shared|native [--disposable]
  baseline --platform ios|android [--source <clean-origin/main-checkout>]
  fingerprint --platform ios|android  Compute native compatibility; never build
  build --platform ios|android [--source <checkout>]  Explicit local DEVELOPMENT build/cache
  provision --platform ios|android --template <stable-id>  Explicit device creation; no boot
  prepare --platform ios|android --session <task>   Reconcile, check compatibility, claim device
  start --platform ios|android --session <task> [--data-ready]  Prepare, Metro, boot/install/open
  release --session <task>            Close task session, stop its Metro and release device
  archive                             Mark current workspace retired and release its resources
  gc                                  Reconcile and remove unreferenced artifacts older than 7 days

All output is JSON. No command downloads SDK images. Only build compiles native code.
prepare/start never build. provision/start require task authorization for device actions.
--data-ready acknowledges that the shared-device data baseline is suitable for this workspace;
it does not import, clear, validate or claim success of the scenario. See the device testing guide.
Session defaults to CODEX_THREAD_ID or CLAUDE_CODE_SESSION_ID when available.
`;

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      platform: { type: 'string' },
      device: { type: 'string' },
      role: { type: 'string' },
      template: { type: 'string' },
      source: { type: 'string' },
      session: { type: 'string' },
      disposable: { type: 'boolean' },
      'data-ready': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help || !positionals.length) {
    console.log(HELP);
    return;
  }
  if (positionals.length !== 1) throw new Error('Expected one command.');
  const command = positionals[0];
  const commands = [
    'status',
    'reconcile',
    'adopt',
    'baseline',
    'fingerprint',
    'build',
    'provision',
    'prepare',
    'start',
    'release',
    'archive',
    'gc',
  ];
  if (!commands.includes(command)) throw new Error(`Unknown command: ${command}`);
  const ctx = context();
  const readOnly =
    command === 'status' ||
    command === 'fingerprint' ||
    (command === 'reconcile' && values['dry-run']);
  // Kernel-held advisory lock: concurrent startup/prepare/cleanup cannot race, and a
  // killed process releases it automatically. No age-based stale lock deletion.
  if (!readOnly && process.env.CHERRY_AGENT_ENVIRONMENT_LOCK !== ctx.directory) {
    mkdirSync(ctx.directory, { recursive: true, mode: 0o700 });
    const script = `import fcntl, os, sys
fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT, 0o600)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    print('{"ok":false,"error":"Another environment operation is running; retry when it finishes."}', file=sys.stderr)
    sys.exit(2)
os.set_inheritable(fd, True)
os.environ['CHERRY_AGENT_ENVIRONMENT_LOCK_FD'] = str(fd)
os.execv(sys.argv[2], sys.argv[2:])
`;
    const result = spawnSync(
      '/usr/bin/python3',
      [
        '-c',
        script,
        join(ctx.directory, 'operation.lock'),
        process.execPath,
        ...process.execArgv,
        process.argv[1],
        ...process.argv.slice(2),
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, CHERRY_AGENT_ENVIRONMENT_LOCK: ctx.directory },
      },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    return;
  }
  delete process.env.CHERRY_AGENT_ENVIRONMENT_LOCK;
  const state = readState(ctx.directory, ctx.common);
  if (!readOnly) registerWorkspace(ctx, state);
  const platform = () => PlatformSchema.parse(values.platform);
  const session = () => {
    const task =
      values.session || process.env.CODEX_THREAD_ID || process.env.CLAUDE_CODE_SESSION_ID;
    if (!task) throw new Error('Provide a stable --session identifier for this coding-agent task.');
    return `cherry-${createHash('sha256').update(`${ctx.workspace.id}:${task}`).digest('hex').slice(0, 20)}`;
  };
  let result: unknown;
  switch (command) {
    case 'status':
      result = inventory(ctx, state);
      break;
    case 'reconcile':
      result = await reconcile(ctx, state, values['dry-run']);
      break;
    case 'fingerprint':
      result = { platform: platform(), fingerprint: fingerprint(ctx.cwd, platform()) };
      break;
    case 'baseline':
      result = baseline(
        ctx,
        state,
        platform(),
        values.source ? realpathSync(values.source) : ctx.root,
      );
      break;
    case 'build': {
      const source = values.source ? realpathSync(values.source) : ctx.cwd;
      result = await build(ctx, state, platform(), source);
      break;
    }
    case 'adopt': {
      if (!values.device || !['primary', 'shared', 'native'].includes(values.role || ''))
        throw new Error('adopt requires --device and --role.');
      result = adopt(
        ctx,
        state,
        platform(),
        values.device,
        values.role as 'primary' | 'shared' | 'native',
        !!values.disposable,
      );
      break;
    }
    case 'provision': {
      if (!values.template) throw new Error('provision requires an explicit --template device id.');
      result = provision(ctx, state, platform(), values.template);
      break;
    }
    case 'prepare':
      result = await prepare(ctx, state, platform(), session());
      break;
    case 'start':
      result = await start(ctx, state, platform(), session(), !!values['data-ready']);
      break;
    case 'release':
      result = { warnings: await release(ctx, state, ctx.workspace.id, session()) };
      break;
    case 'archive': {
      state.workspaces.find((w) => w.id === ctx.workspace.id)!.archived = true;
      saveState(ctx.directory, state);
      result = await reconcile(ctx, state);
      break;
    }
    case 'gc':
      result = await reconcile(ctx, state);
      break;
  }
  const incomplete = !!(
    result &&
    typeof result === 'object' &&
    'warnings' in result &&
    Array.isArray(result.warnings) &&
    result.warnings.length
  );
  console.log(JSON.stringify({ ok: !incomplete, command, result }, null, 2));
  if (incomplete) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  process.exitCode = 1;
});
